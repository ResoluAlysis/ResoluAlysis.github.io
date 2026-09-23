// ============================================================================
//  CustomPostProcessShaderGuard —— 让"ShaderGraph 没进构建"这件事别再静默发生
// ============================================================================
//  为什么需要它：
//    你的后处理效果是这样拿 shader 的（见 CustomEffect/Glitch.cs 等）：
//        const string ShaderName = "Shader Graphs/Glitch";
//        material = CoreUtils.CreateEngineMaterial(ShaderName);   // = Shader.Find
//    Shader.Find 的规矩是：
//      · 编辑器里 —— 只要工程里有这个 shader，就找得到 ✓（所以你怎么试都正常）
//      · 构建里 —— **只找"已经进了构建的" shader** ✗
//    而"只被 Shader.Find（字符串）引用的 shader" **不会被自动打进构建** ✗
//    → 构建里要么找不到（效果静默消失），要么拿到坏材质（整屏/整块发灰）。
//
//  怎么用（两步，不用改你那几个 effect 脚本）：
//    1) 在场景里任意一个常驻物体上挂这个组件（比如 NetworkManager 那个物体）。
//    2) 把所有自定义 ShaderGraph 资产（.shadergraph）拖进 Graph Shaders 数组。
//       ★ 拖进来这一步本身就是修复：**序列化引用 = 一定会被打进构建** ✓。
//
//  它还会做一次体检：对下面四个名字调 Shader.Find，找不到就 Debug.LogError ——
//  这行红字会走到站点的控制台通道上，**在游戏画面左下角以 ERR 显示** ✓，
//  于是"哪个 shader 没进构建"一眼就能看见（不用开控制台）。
//
//  编码：UTF-8 with BOM（Unity / Visual Studio 都吃；你工程里别的 .cs 是 GBK，
//        混着没问题 —— 但别用命令行工具整体重写它们，容易写坏中文注释）。
// ============================================================================

using UnityEngine;

[AddComponentMenu("Site/Custom PostProcess Shader Guard")]
public class CustomPostProcessShaderGuard : MonoBehaviour
{
    [Tooltip("把 Assets 里所有自定义 ShaderGraph（.shadergraph）拖到这里。\n" +
             "拖进来 = 保证它们进构建（这就是修复）。")]
    public Shader[] graphShaders = new Shader[0];

    [Tooltip("勾上：启动时对下面这些名字做一次 Shader.Find 体检，找不到就报错（推荐）。")]
    public bool checkRuntimeNames = true;

    // 你那份 CustomEffect/*.cs 里用到的四个名字（改了那儿的话这里也要跟着改）
    static readonly string[] RuntimeNames =
    {
        "Shader Graphs/Glitch",
        "Shader Graphs/Glitch_Refine",
        "Shader Graphs/IncertColor",
        "Shader Graphs/Pixelate",
    };

    void Awake()
    {
        // 体检 1：数组里有没有空位（拖漏了）
        for (int i = 0; i < graphShaders.Length; i++)
        {
            if (graphShaders[i] == null)
                Debug.LogError($"[ShaderGuard] Graph Shaders 第 {i} 个是空的 —— 有个 ShaderGraph 没拖进来");
        }

        // 体检 2：运行时 Shader.Find 找不找得到（构建里找不到 = 没打进去 → 就是会发灰/失效的那个）
        if (!checkRuntimeNames) return;

        foreach (string name in RuntimeNames)
        {
            if (Shader.Find(name) == null)
            {
                Debug.LogError($"[ShaderGuard] 构建里找不到 shader：'{name}'。\n" +
                               "修法二选一：① 把它拖进本组件的 Graph Shaders；" +
                               "② Project Settings → Graphics → Always Included Shaders 里加上它。");
            }
        }
    }
}
