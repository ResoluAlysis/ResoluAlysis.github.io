// ============================================================================
//  SiteTransport —— WebGL 里把 KCP 换成"同进程假网络"，桌面 / 编辑器照旧走 KCP
// ============================================================================
//  放哪儿：Assets/ 下任意位置都行。**别放进 Assets/Mirror/**，否则 Mirror 升级时
//          会被覆盖掉（建议 Assets/Scripts/WebGL/SiteTransport.cs）。
//
//  怎么用（两步）：
//    1) 把 NetworkManager 身上的 KcpTransport 组件换成这个 SiteTransport。
//       ★ 字段是从 KcpTransport 继承来的，但**换组件会丢原来的值** ——
//         Port / Interval / 那堆参数照着原来填一遍（多数是默认值，只有 Port 要确认）。
//       ★ 同一时刻 NetworkManager 身上只能有一个 Transport 组件。
//    2) 在你"开始游戏 / 本地加入房间"的地方，把网络发现包起来：
//
//         // 浏览器里没有 socket，Mirror 的 StartDiscovery() 会抛
//         // PlatformNotSupportedException: Network discovery not supported in this platform
//         #if !UNITY_WEBGL || UNITY_EDITOR
//             discovery.StartDiscovery();
//         #endif
//
//       （`StartHost()` / `StartClient("localhost")` 本身**不用**包 —— 它们在这个
//         传输下能成功。）
//
//  它到底做了什么：
//    · 浏览器（WebGL）里不走 KCP、不开 socket、不开线程、不用 Task ——
//      client 和 server 变成同一进程里的两条队列：
//          ClientSend(seg) → 复制一份塞进 toServer → ServerEarlyUpdate 里派发
//          ServerSend(seg) → 复制一份塞进 toClient → ClientEarlyUpdate 里派发
//    · 桌面 / 编辑器里**完全不插手**，原样调用 base（= KCP，真联机照旧）。
//
//  为什么这样就够了（很重要）：
//    Mirror 的 **host 模式**里，本地 client 走的是内部的 LocalConnection，
//    **本来就不经过 transport**。所以"点开始游戏就成为主机"这类游戏在浏览器里
//    需要的其实只有一件事：**ServerStart() 不失败**。KCP 失败是因为它要开 UDP
//    socket（浏览器没有），而这个传输只是把标志位置起来 —— 于是
//    StartHost() 成功 → OnServerAddPlayer 照常生成玩家 → 你的联机逻辑一行不用改。
//
//  已知取舍（说清楚，不装作没有）：
//    · 浏览器里**没有真联机**：连"别人"会退化成"自己开一局"（见 autoHostOnClientConnect）。
//    · 连接事件默认延后到下一次 EarlyUpdate 再抛（更像真实传输的时序）。
//      万一你的 Mirror 版本在 host 模式下非要"Start 的那一刻就收到连接事件"，
//      把 Inspector 里的 Defer Connect Events 取消勾选即可（不用改代码）。
//    · 断线/超时/丢包这类真实网络行为**没有**（同进程不会丢）。
// ============================================================================

using System;
using System.Collections.Generic;
using kcp2k;                 // ★ 继承 KcpTransport：桌面/编辑器照旧走 KCP
using Mirror;
using UnityEngine;

[DisallowMultipleComponent]
public class SiteTransport : KcpTransport
{
    [Header("Site Offline (WebGL only)")]
    [Tooltip("一帧最多派发多少条消息（防止一次性灌爆一帧）。同进程，1000 足够。")]
    public int maxMessagesPerTick = 1000;

    [Tooltip("连接/断开事件延后到下一次 EarlyUpdate 再抛（更接近真实传输的时序）。\n" +
             "如果主机模式下玩家没生成，试着取消勾选。")]
    public bool deferConnectEvents = true;

    [Tooltip("浏览器里 ClientConnect 连不到任何人时，自动把本地主机起起来 ——\n" +
             "于是\"加入房间\"退化成\"自己开一局\"，而不是卡在\"连接中\"。")]
    public bool autoHostOnClientConnect = true;

    [Header("Site Offline / Debug")]
    [Tooltip("只读：没连上时被丢掉的消息条数（正常情况下应该是 0）。")]
    public long droppedCount = 0;

    // 一帧的派发预算
    const int MaxPacketSize = 64 * 1024;   // 同进程没有 MTU 限制，给大一点就行

    // 是不是浏览器
    static bool IsWebGL => Application.platform == RuntimePlatform.WebGLPlayer;

    // 只有浏览器走离线通道；桌面/编辑器一律交给 base（KCP）
    bool UseOffline => IsWebGL;

    // ---- 离线通道的状态 ----
    struct Msg
    {
        public int connId;
        public int channelId;
        public byte[] data;
    }

    readonly Queue<Msg> toServer = new Queue<Msg>();
    readonly Queue<Msg> toClient = new Queue<Msg>();

    bool offServerActive;
    bool offClientConnected;
    bool pendingServerConnect;
    bool pendingClientConnect;
    bool pendingServerDisconnect;
    bool pendingClientDisconnect;

    // ========================================================================
    //  初始化
    // ========================================================================
    protected override void Awake()
    {
        if (!UseOffline)
        {
            base.Awake();          // 非浏览器：KCP 那一套照旧
            return;
        }

        // 浏览器里**不建** KcpClient / KcpServer —— 它们迟早会去 new Socket()，
        // 而那正是你日志里那个 `SocketException: Success` 的来源。
        Log.Info = _ => { };
        Log.Warning = Debug.LogWarning;
        Log.Error = Debug.LogError;
        Log.Info("SiteTransport: WebGL offline channel active (no sockets).");
    }

    // ★★ KCP 自己声明 WebGL 不可用（`#if UNITY_WEBGL → false`）。
    //    Mirror 会看这个返回值，不看就会像你的 Refactor 那样硬去开 socket。
    public override bool Available() => UseOffline || base.Available();

    // ========================================================================
    //  Client
    // ========================================================================
    public override bool ClientConnected() => UseOffline ? offClientConnected : base.ClientConnected();

    public override void ClientConnect(string address)
    {
        if (!UseOffline) { base.ClientConnect(address); return; }

        // 浏览器里没有"别人"可连：没有本地主机就自己起一个。
        // → "加入房间"变成"自己开一局"，总比卡在"连接中"好。
        if (autoHostOnClientConnect && !offServerActive) ServerStart();

        if (offClientConnected) return;
        offClientConnected = true;
        pendingClientDisconnect = false;

        if (deferConnectEvents) pendingClientConnect = true;
        else OnClientConnected?.Invoke();
    }

    // WebGL 里没有 Dns / 地址概念，一律当成"本机"
    public override void ClientConnect(Uri uri) => ClientConnect(uri != null ? uri.Host : "localhost");

    public override void ClientSend(ArraySegment<byte> segment, int channelId)
    {
        if (!UseOffline) { base.ClientSend(segment, channelId); return; }

        if (!offServerActive) { droppedCount++; return; }   // 没主机 → 丢（正常不该发生）
        Enqueue(toServer, 0, segment, channelId);
        OnClientDataSent?.Invoke(segment, channelId);
    }

    public override void ClientDisconnect()
    {
        if (!UseOffline) { base.ClientDisconnect(); return; }
        if (!offClientConnected) return;

        offClientConnected = false;
        if (deferConnectEvents) pendingClientDisconnect = true;
        else OnClientDisconnected?.Invoke();
    }

    public override void ClientEarlyUpdate()
    {
        if (!UseOffline) { base.ClientEarlyUpdate(); return; }
        if (!enabled) return;                       // 和 KcpTransport 一样：翻场景时会临时关掉

        if (pendingClientConnect) { pendingClientConnect = false; OnClientConnected?.Invoke(); }
        if (pendingClientDisconnect) { pendingClientDisconnect = false; OnClientDisconnected?.Invoke(); }
        Dispatch(toClient, false);
    }

    // 离线通道在 ClientSend 那一刻就已经"送到"了，LateUpdate 没事可做
    public override void ClientLateUpdate()
    {
        if (!UseOffline) base.ClientLateUpdate();
    }

    // ========================================================================
    //  Server
    // ========================================================================
    public override bool ServerActive() => UseOffline ? offServerActive : base.ServerActive();

    public override void ServerStart()
    {
        if (!UseOffline) { base.ServerStart(); return; }
        if (offServerActive) return;

        offServerActive = true;
        if (deferConnectEvents) pendingServerConnect = true;
        else OnServerConnectedWithAddress?.Invoke(0, "local");
    }

    public override void ServerSend(int connectionId, ArraySegment<byte> segment, int channelId)
    {
        if (!UseOffline) { base.ServerSend(connectionId, segment, channelId); return; }

        if (!offClientConnected) { droppedCount++; return; }
        Enqueue(toClient, connectionId, segment, channelId);
        OnServerDataSent?.Invoke(connectionId, segment, channelId);
    }

    public override void ServerDisconnect(int connectionId)
    {
        if (!UseOffline) { base.ServerDisconnect(connectionId); return; }
        if (!offServerActive) return;

        offServerActive = false;
        if (deferConnectEvents) pendingServerDisconnect = true;
        else OnServerDisconnected?.Invoke(connectionId);
    }

    public override string ServerGetClientAddress(int connectionId) =>
        UseOffline ? "local" : base.ServerGetClientAddress(connectionId);

    public override void ServerStop()
    {
        if (!UseOffline) { base.ServerStop(); return; }

        offServerActive = false;
        toServer.Clear();
        toClient.Clear();
    }

    public override void ServerEarlyUpdate()
    {
        if (!UseOffline) { base.ServerEarlyUpdate(); return; }
        if (!enabled) return;

        if (pendingServerConnect)
        {
            pendingServerConnect = false;
            OnServerConnectedWithAddress?.Invoke(0, "local");   // connectionId 0 = 本机
        }
        if (pendingServerDisconnect) { pendingServerDisconnect = false; OnServerDisconnected?.Invoke(0); }
        Dispatch(toServer, true);
    }

    public override void ServerLateUpdate()
    {
        if (!UseOffline) base.ServerLateUpdate();
    }

    // ★ base 用的是 Dns.GetHostName() —— WebGL 里 Dns 不可用，必须换掉
    public override Uri ServerUri() =>
        UseOffline ? new Uri("offline://localhost") : base.ServerUri();

    // ========================================================================
    //  公共
    // ========================================================================
    public override void Shutdown()
    {
        if (!UseOffline) { base.Shutdown(); return; }

        offServerActive = false;
        offClientConnected = false;
        pendingServerConnect = false;
        pendingClientConnect = false;
        pendingServerDisconnect = false;
        pendingClientDisconnect = false;
        toServer.Clear();
        toClient.Clear();
    }

    // 同进程没有 MTU 限制：给大一点，少切几刀
    public override int GetMaxPacketSize(int channelId = Channels.Reliable) =>
        UseOffline ? MaxPacketSize : base.GetMaxPacketSize(channelId);

    public override int GetBatchThreshold(int channelId) =>
        UseOffline ? MaxPacketSize : base.GetBatchThreshold(channelId);

    public override string ToString() => UseOffline ? "SiteOffline [local]" : base.ToString();

    // ========================================================================
    //  内部：入队 / 派发
    // ========================================================================
    static void Enqueue(Queue<Msg> queue, int connId, ArraySegment<byte> segment, int channelId)
    {
        // ★★ 必须复制：Mirror 会复用发送缓冲（NetworkWriter 池），
        //    只存引用的话，派发时读到的已经是下一条消息的内容了。
        if (segment.Array == null || segment.Count <= 0) return;

        byte[] copy = new byte[segment.Count];
        Buffer.BlockCopy(segment.Array, segment.Offset, copy, 0, segment.Count);

        queue.Enqueue(new Msg { connId = connId, channelId = channelId, data = copy });
    }

    void Dispatch(Queue<Msg> queue, bool toServerSide)
    {
        int budget = maxMessagesPerTick > 0 ? maxMessagesPerTick : 1000;
        while (budget-- > 0 && queue.Count > 0)
        {
            Msg m = queue.Dequeue();
            var seg = new ArraySegment<byte>(m.data);
            if (toServerSide) OnServerDataReceived?.Invoke(m.connId, seg, m.channelId);
            else OnClientDataReceived?.Invoke(seg, m.channelId);
        }
    }

    // ========================================================================
    //  统计面板：父类那份会去摸 KcpServer/KcpClient（浏览器里是 null），换掉
    // ========================================================================
    protected override void OnGUIStatistics()
    {
        if (!UseOffline) { base.OnGUIStatistics(); return; }

        GUILayout.BeginArea(new Rect(5, 110, 300, 300));
        GUILayout.BeginVertical("Box");
        GUILayout.Label("SITE OFFLINE (WebGL)");
        GUILayout.Label($"  server active: {offServerActive}");
        GUILayout.Label($"  client connected: {offClientConnected}");
        GUILayout.Label($"  toServer: {toServer.Count}   toClient: {toClient.Count}");
        GUILayout.Label($"  dropped: {droppedCount}");
        GUILayout.EndVertical();
        GUILayout.EndArea();
    }

    protected override void OnLogStatistics()
    {
        if (!UseOffline) { base.OnLogStatistics(); return; }

        Log.Info($"SITE OFFLINE @ time: {NetworkTime.localTime}\n" +
                 $"  server active: {offServerActive}\n" +
                 $"  client connected: {offClientConnected}\n" +
                 $"  toServer: {toServer.Count}\n" +
                 $"  toClient: {toClient.Count}\n" +
                 $"  dropped: {droppedCount}\n");
    }
}
