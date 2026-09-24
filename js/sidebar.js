/* ============================================================
   侧边栏：游乐区
   ------------------------------------------------------------
   点首页的「玩游戏」= 离开工作区：整站（导航栏 / 页脚 / main /
   标题下划线）向右让出 --sidebar-w，导航栏与页脚因此正好贴在屏幕
   右缘，main 整个被推出视野 —— 几何推导写在 style.css 第 9 节。

   这个文件只干五件事：
     1. 开 / 关：只给 <body> 挂一个 .sidebar-open，版式全部交给 CSS；
     2. 状态同步：aria-expanded / aria-hidden / 焦点进出；
     3. Esc 关闭；
     4. 打开期间停掉 World 主循环 —— 游乐区里要跑游戏，
        背景的粒子 / 时钟 / 网点不用陪着烧 CPU（浮窗也是这么干的）；
     5. 卡带栏：按 data/works.js 里 kind === 'unity' 的条目录生成卡带
        （唯一数据源），选中哪张就把它的规格写到舞台中央。

   ★ 时长和曲线一律不写在这里：CSS 的 --sidebar-dur / --panel-ease
     说了算，这里只负责"把类挂上 / 摘掉"。这样想调快慢只改 CSS 一处，
     也不会出现"JS 说 300ms、CSS 说 450ms"这种对不上的情况。
   ============================================================ */
window.PlaySidebar = (function () {
    'use strict';

    /* 总开关：false = 点「玩游戏」没有任何反应（脚本照旧加载，
       不注册任何监听）。和 draft-layer / home-underline / 浮窗一个套路。 */
    const ENABLED = true;

    /* 给外部一个同形状的空壳，免得谁调 PlaySidebar.close() 时报 undefined */
    const empty = {
        open() { }, close() { }, toggle() { },
        get isOpen() { return false; },
    };

    if (!ENABLED) return empty;

    const aside = document.getElementById('play-sidebar');
    const triggers = document.querySelectorAll('[data-play="open"]');
    if (!aside || !triggers.length) {
        /* ★ 这句是**字符串字面量**，会被 _dev/glyph-set.js 收进字体子集 ——
           所以这里刻意只用已有的字（写"侧边栏 / 或者"就得重跑
           node _dev/subset-font.js，为了句提示不划算）。 */
        console.warn('[PlaySidebar] #play-sidebar / [data-play="open"] 未找到，未启用');
        return empty;
    }

    const body = document.body;
    const closeBtn = aside.querySelector('[data-play="close"]');
    const cartsEl = aside.querySelector('[data-play="carts"]');
    /* ★★ P98：卡带登场前那张"标题卡"（「游戏卡带」，闪烁出现 → 渐隐） */
    const railTitle = aside.querySelector('[data-play="rail-title"]');
    /* ★★ P99：开场那块黑幕（.play-stage 的**兄弟**、占满游戏区 —— 不能住进 stage 里，
       stopGame() 的 replaceChildren() 会把它拔掉 ✗） */
    const curtainEl = aside.querySelector('[data-play="curtain"]');
    const stageEl = aside.querySelector('[data-play="body"]');
    const playStage = aside.querySelector('[data-play="stage"]');
    const startBtn = aside.querySelector('[data-play="start"]');
    const specNo = aside.querySelector('[data-play="spec-no"]');
    const specName = aside.querySelector('[data-play="spec-name"]');
    const specMeta = aside.querySelector('[data-play="spec-meta"]');
    const noticeEl = aside.querySelector('[data-play="notice"]');
    const noticeList = aside.querySelector('[data-play="notice-list"]');
    const msgEl = aside.querySelector('[data-play="msg"]');
    const readmeEl = aside.querySelector('[data-play="readme"]');

    let isOpen = false;
    let lastTrigger = null;      // 关的时候把焦点还给它
    let currentGame = null;      // 当前选中的卡带 id
    /* src 有非空白内容才允许开始游戏 */
    function hasPlayableSrc(w) {
        return !!(w && w.src && String(w.src).trim());
    }

    function refreshStartButton(w) {
        if (!startBtn) return;
        const show = hasPlayableSrc(w);
        startBtn.hidden = !show;
        startBtn.style.display = show ? '' : 'none';
    }

      /* ============================================================
       游戏文件检测：src 路径没对应文件 → 不显示「开始游戏」
       ------------------------------------------------------------
       · 空白 src：直接按不可用处理。
       · 同源路径：HEAD 一下；有些静态服务器不支持 HEAD，再退一步用 GET。
       · 跨源 / data: / blob: / about:：浏览器拿不到可靠状态，按可用处理，
         避免把本来能玩的远端构建误藏起来。
       ============================================================ */
    const startAvailability = new Map();   // id -> true / false
    const startChecks = new Map();         // id -> Promise<boolean>
    let startCheckToken = 0;

    function setStartVisible(visible) {
        if (!startBtn) return;
        startBtn.hidden = !visible;
        startBtn.style.display = visible ? "" : "none";
    }

    function isSpecialUrl(url) {
        return /^(data:|blob:|about:)/i.test(url);
    }

    function isCrossOrigin(url) {
        try {
            return new URL(url, location.href).origin !== location.origin;
        } catch (err) {
            return false;
        }
    }

    function checkStartAvailability(w) {
        const url = (w && w.src) || "";
        if (!url) return Promise.resolve(false);
        if (startAvailability.has(w.id)) return Promise.resolve(startAvailability.get(w.id));
        if (startChecks.has(w.id)) return startChecks.get(w.id);

        if (isSpecialUrl(url) || isCrossOrigin(url)) {
            startAvailability.set(w.id, true);
            return Promise.resolve(true);
        }

        const request = fetch(url, { method: "HEAD", cache: "no-store" })
            .then(function (res) {
                if (res.ok) return true;
                throw new Error("HTTP " + res.status);
            })
            .catch(function () {
                /* 不是所有静态服务器都支持 HEAD；用 Range 只取开头 1 字节。 */
                return fetch(url, {
                    cache: "no-store",
                    headers: { Range: "bytes=0-0" },
                })
                    .then(function (res) { return !!res.ok; })
                    .catch(function () { return false; });
            })
            .then(function (ok) {
                startAvailability.set(w.id, ok);
                startChecks.delete(w.id);
                return ok;
            });

        startChecks.set(w.id, request);
        return request;
    }

    function refreshStartButton(w) {
        const token = ++startCheckToken;
        if (!startBtn) return;
        if (!w || !w.src) { setStartVisible(false); return; }
        if (startAvailability.has(w.id)) { setStartVisible(startAvailability.get(w.id)); return; }

        /* 检查期间先藏起来：不能一边探文件一边让人点到「开始」。 */
        setStartVisible(false);
        checkStartAvailability(w).then(function (ok) {
            if (token !== startCheckToken) return;
            setStartVisible(ok);
        });
    }

    /* 开屏期间 body 上挂着 .locked（那时连指针事件都是关的）——
       这时候不该让游乐区开起来：它会落在开屏那几层的下面，
       用户只看到页面卡住。 */
    const isLocked = () => body.classList.contains('locked');

    /* ============================================================
       卡带栏：从 data/works.js 里挑出"能玩的"（kind === 'unity'）
       ------------------------------------------------------------
       ★ 唯一数据源：以后往 works.js 里加一套 Unity 构建，这里自动多一张
         卡带，不用碰 HTML。
       ★ 只认 kind === 'unity' —— 画 / 模型 / 曲子不是"能玩的东西"，
         它们走 #media 那四只面板。
       ★ 卡带不挂 .is-hot，走原生 :hover：整个游乐区是 fixed chrome，
         不随页面滚（和 .nav-links / .theme-toggle 同一类，
         check.js 的 :hover 白名单里有它）。
       ============================================================ */
    const games = (window.WORKS || []).filter(function (w) {
        return w && w.kind === 'unity';
    });

    /* 每张卡带注册一个"复位"回调（清 hovered / clicked）——
       开门时 resetStage() 会把它们都跑一遍，免得上一轮的状态留到下一轮。 */
    const cartResets = [];

    /* ============================================================
       ★★ P103：选中框 —— 跟着"当前选中的那张卡带"走的一个方框
       ------------------------------------------------------------
       · 没选中任何卡带（currentGame 空）→ 整块隐藏 ✓
       · 选中一张 → 在**那张卡带的位置**闪烁出现（CSS 的 cartFrameIn）✓
       · 已选中时又选别的（点别的卡带 / 拖别的进舞台）→ 框**平移**过去，
         `ease-in-out` = 你要的"先慢后快再慢" ✓
       ★ 位置靠卡带的 offsetLeft/offsetTop —— 它们是相对 `.play-rail`
         （它是 position: relative，也是这个方框的定位祖先）的 padding 边 ✓
         两边用的是同一个基准，所以不用自己减 padding ✓。
       ★ 比卡带外轮廓大 1px：宽高各 +2、位置各 -1 ✓。
       ★ 第一次出现时用 `is-placing` 把过渡关掉**直接摆到位** ——
         否则它会从轨道左上角滑过来，而不是"在那张卡带的位置闪烁出现" ✗。
       ============================================================ */
    const cartFrame = aside.querySelector('[data-play="cart-frame"]');
    let frameShown = false;

    function syncCartFrame() {
        if (!cartFrame || !cartsEl) return;
        const idx = games.map(function (g) { return g.id; }).indexOf(currentGame);
        if (idx < 0) {                            // 没选中 → 藏起来（下次再出现会重新闪 ✓）
            cartFrame.classList.remove('is-on');
            frameShown = false;
            return;
        }
        const btn = cartsEl.querySelectorAll('.play-cart')[idx];
        if (!btn) return;
        const w = (btn.offsetWidth || 0) + 2;     // ★ 比外轮廓大 1px（左右各 1）✓
        const h = (btn.offsetHeight || 0) + 2;
        const t = 'translate(' + ((btn.offsetLeft || 0) - 1) + 'px, ' +
            ((btn.offsetTop || 0) - 1) + 'px)';
        cartFrame.style.width = w + 'px';
        cartFrame.style.height = h + 'px';
        if (frameShown) {
            /* 已经在了 → 只改 transform，CSS 的过渡自己演那段平移 ✓ */
            cartFrame.style.transform = t;
            return;
        }
        cartFrame.classList.add('is-placing');    // 关掉过渡 → 直接摆到位 ✓
        cartFrame.style.transform = t;
        if (cartFrame.getBoundingClientRect) cartFrame.getBoundingClientRect();   // 强制提交这一帧 ✓
        cartFrame.classList.remove('is-placing');
        cartFrame.classList.add('is-on');         // ★ 在那张卡带的位置闪烁出现 ✓
        frameShown = true;
    }

    /* ============================================================
       ★★ P102：卡带表面的"正在运行… / 停止运行？"蒙版
       ------------------------------------------------------------
       两段式停止（都是点同一张卡带）：
         ① 这一局在跑 → 表面盖一层**半透明黑** + 「正在运行…」；
         ② 点它第一下 → 换成**完全不透明的主题红** + 「停止运行？」（**还没停** ✓）
                        —— 这时去点别的卡带 / 关面板，这一下就作废 ✓；
         ③ 再点一下 → 黑幕渐入 → 全黑之后才真的关掉游戏 → **直接**渐出黑幕，
                      露出这条游戏的内容（README / 规格，有就显示 ✓）；
                      同时表面那层蒙版**闪烁消失** ✓。
       ★ 每张卡带自己管自己的蒙版（paint / flick）；这里是"广播"：
         谁在跑（playingGame）、谁被点了第一下（armedCart）→ 重画一遍 ✓
       ============================================================ */
    const cartVeils = [];        // 每张卡带注册 { id, paint(mode), flick(), active() }
    let armedCart = null;        // 被点了第一下（"停止运行？"）的那张卡带 id

    function syncCartVeils() {
        cartVeils.forEach(function (v) {
            const want = (v.id === armedCart) ? 'armed'
                : (v.id === playingGame ? 'running' : '');
            /* 从"有蒙版"变成"没有"→ 演一遍闪烁消失（所有停止路径都走这里 ✓） */
            if (!want && v.active()) v.flick();
            else v.paint(want);
        });
    }

    /* 点一下切换"停止运行？"（同一条再点一下 = 取消这次确认 ✓） */
    function armStop(id) {
        armedCart = (armedCart === id) ? null : id;
        syncCartVeils();
    }

    /* ============================================================
       「游玩注意」：游戏区下方那块提示（P84）
       ------------------------------------------------------------
       数据在 data/works.js 里，两个字段：
         noticeOn: true / false          —— 开关（默认 false = 整块不出现）
         notice:   '一段话' / ['第一段', '第二段']
       什么时候显示：**选中卡带就显示**（不必等按「开始游戏」）——
       这行字就是给"还没进去之前"看的；真进了游戏满屏都是画面，
       谁还回头看这里。
       ★ 没开（noticeOn 假）/ 没写 / 只写了空白 → 摘掉 hidden 的反面：
         挂回 hidden，列表也清空（不留上一次那条的残影）。
       ★ 文案改了要跑 node _dev/subset-font.js —— 字体是子集化的，
         新字不在子集里会**静默**回退成系统字体；自检 [2b] 会喊。
       ============================================================ */
    function renderNotice(w) {
        if (!noticeEl || !noticeList) return;
        let lines = (w && w.noticeOn) ? w.notice : null;
        if (typeof lines === 'string') lines = lines.split('\n');
        lines = (lines || []).filter(function (s) { return String(s).trim(); });

        /* ★★ P101：只负责**把内容填好** —— 显示时机交给开场过场
           （黑幕全黑那一刻闪出来、停 3s、闪掉，见 startGame）✓
           所以这里不再碰 hidden / 可见性（那块提示已经不在游戏区下方了 ✓） */
        noticeList.replaceChildren();
        lines.forEach(function (s) {
            const li = document.createElement('li');
            li.className = 'play-notice-item';
            li.textContent = String(s);
            noticeList.appendChild(li);
        });
    }

    /* ============================================================
       「游戏发来的回执」（P86）
       ------------------------------------------------------------
       一行字，盖在游戏画面左下角（.play-msg）。文字、时长都来自游戏那边。
       按"不可信输入"对待：
         · 单行 —— 换行 / 制表符压成空格（回执是一行字，不是一段文章）；
         · 截断 —— 超过 120 字砍掉，游戏写错一个长字符串也不至于糊满屏幕；
         · 防刷 —— 同一段文字 400ms 内重复到达就丢掉（游戏每帧喊一句也毁不掉版面）；
         · 用 textContent 写入 —— **永不 innerHTML**（这是外部来的字符串）。
       ★ 不叠队列：新的一条**顶掉**旧的（回执是"现在发生了什么"，排队反而难看）。
       ★ ms = 0 表示一直挂着（游戏自己控制什么时候收）；不传就用默认 2600ms。
       ============================================================ */
    const MSG_MAX = 120;
    const MSG_MS = 2600;
    const MSG_DEDUPE = 400;
    const MSG_ERR_DEDUPE = 4000;    // 控制台来的那一类窗口更宽（报错常常每帧刷一遍）
    const MSG_ERR_MAX = 12;         // 一局里最多播这么多条控制台回执，防刷屏
    let msgTimer = 0;
    let msgLast = { text: '', at: 0 };
    let msgErrShown = 0;

    function showMessage(text, ms, dedupeMs) {
        if (!msgEl) return;
        const t = String(text == null ? '' : text)
            .replace(/[\r\n\t]+/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim()
            .slice(0, MSG_MAX);
        if (!t) { hideMessage(); return; }          // 空文字 = 游戏让站点收掉它

        const now = Date.now();
        const win = (typeof dedupeMs === 'number' && dedupeMs > 0) ? dedupeMs : MSG_DEDUPE;
        if (t === msgLast.text && now - msgLast.at < win) return;
        msgLast = { text: t, at: now };

        msgEl.textContent = t;                      // ★ 不是 innerHTML
        msgEl.classList.add('is-on');
        if (msgTimer) clearTimeout(msgTimer);
        const stay = (typeof ms === 'number' && ms >= 0) ? ms : MSG_MS;
        msgTimer = stay > 0 ? setTimeout(hideMessage, stay) : 0;
    }

    function hideMessage() {
        if (msgTimer) { clearTimeout(msgTimer); msgTimer = 0; }
        msgLast = { text: '', at: 0 };
        if (msgEl) {
            msgEl.classList.remove('is-on');
            msgEl.textContent = '';                 // 清空 = 读屏那边也不会留旧话
        }
    }

    /* ============================================================
       ★★ 不用 jslib 的那条路：把 iframe 里的控制台接到屏幕回执上（P87）
       ------------------------------------------------------------
       为什么要它：WebGL 构建出问题时，唯一有信息量的地方是浏览器控制台，
       而你在作品集里点开游戏时通常没开控制台。同源 → 父页面**能**给
       iframe 那份文档的 console 套一层。

       游戏里怎么用（**一行 C#，不用 jslib、不用动构建**）：
         Debug.Log("SITE:任务完成");     → 屏幕回执「任务完成」
       （前缀 SITE: 会被剥掉；没前缀的 log 一律不管 —— 不然 Unity 自己的
         日志会一行一闪。error / warn 则一律上屏，前面加 ERR / WARN 标签。）

       ⚠ 两个前提：① 构建必须勾 Development Build —— Release 构建会把
         Debug.Log 裁掉（站点这边接管不了不存在的东西）；② 这条通道是给
         **调试**用的，正式文案还是走 Site.Msg（postMessage）那条。
       ★ 回执本身是运行时文字，用系统字体（见 .play-msg）——所以这里
         用 ASCII 标签，不占字体子集。
       ============================================================ */
    const CONSOLE_TAG = 'SITE:';

    function hookConsole(win) {
        if (!win || win.__playConsoleHooked || !win.console) return;
        win.__playConsoleHooked = true;
        const wrap = function (name, tag, prefixed) {
            const orig = win.console[name];
            if (typeof orig !== 'function') return;
            win.console[name] = function () {
                try {
                    const parts = [];
                    for (let i = 0; i < arguments.length; i++) parts.push(String(arguments[i]));
                    const line = parts.join(' ').replace(/[\r\n\t]+/g, ' ').trim();
                    /* log 只认 SITE: 前缀；error / warn 一律上屏 */
                    if (prefixed) {
                        if (line.indexOf(CONSOLE_TAG) === 0) {
                            reportConsole(line.slice(CONSOLE_TAG.length).trim());
                        }
                    } else if (line) {
                        reportConsole((tag ? tag + ' ' : '') + line);
                    }
                } catch (err) { /* 回执这条路不许影响游戏本身 */ }
                return orig.apply(win.console, arguments);
            };
        };
        wrap('error', 'ERR', false);
        wrap('warn', 'WARN', false);
        wrap('log', '', true);
    }

    function reportConsole(line) {
        if (!line || msgErrShown >= MSG_ERR_MAX) return;
        msgErrShown++;
        showMessage(line, MSG_MS, MSG_ERR_DEDUPE);
    }

    /* 把选中那张卡带的规格写到舞台上。
       ★ 在游戏真正挂载之前，这一屏就是"卡带说明书"：
         名字 / 引擎与体积全部取自 works.js，一个字都不用另写。
       ★ P75：同时把舞台从 empty 切到 game —— 那句"从左侧卡带栏拖动游戏
         到此处启动游戏"是在 empty 状态显示的（见 style.css 的 .play-hint）。 */
    /* 把"选中的这一条"铺到台上：规格三行 + 游玩注意 + README（+ 开始键状态）。
       ★ P100b：拆出来是因为**拖到舞台上**那条路要"晚一点再铺" —— 见 select 的
         deferContent 与 startGame 里"全黑那一刻"那次调用 ✓ */
    function renderSelection(w) {
        if (!w) return;
        /* 正在跑的就是这一条 → 停在 play；否则退回 game（显示规格 + 「开始游戏」） */
        if (stageEl) stageEl.dataset.state = (playingGame === w.id) ? 'play' : 'game';
        if (specNo) specNo.textContent = w.no || '--';
        if (specName) specName.textContent = w.title || w.id;
        if (specMeta) {
            specMeta.textContent = (w.tags || []).join(' / ') +
                (w.weight ? ' / ' + w.weight : '');
        }
        renderNotice(w);                       // ★ P84：这条的「游玩注意」
        loadReadme(w);                         // ★ P91：这条的 README（详细页）
        refreshStartButton(w);                 // 检测 src 是否存在
    }

    /* 有一条"选了但故意还没铺"的卡带（拖到舞台上时）——
       等黑幕全黑、或者过场被打断时再补上 ✓ */
    let deferredCart = null;
    function applyDeferred() {
        if (!deferredCart) return;
        const id = deferredCart;
        deferredCart = null;
        renderSelection(games.filter(function (g) { return g.id === id; })[0]);
    }

    function select(id, keepRunning, deferContent) {
        const w = games.filter(function (g) { return g.id === id; })[0];
        if (!w) return;

        /* ★★ P81：换一条就先卸掉正在跑的那套（WebGL 上下文只能留一个 ——
           两套一起留着会吃显存、还会掉帧）。同一条则不打断它。
           ★★ P100：`keepRunning` 只有"拖到舞台上"那条路会传（拖入新卡带时**先不关**上一局）——
             让它在黑幕后面活到全黑那一刻，由 startGame 的过场收掉 → 看不出中途空场 ✓。
             别的路径（点卡带换一条）照旧**立刻**停 ✓ */
        if (!keepRunning && playingGame && playingGame !== id) stopGame();
        currentGame = id;
        if (armedCart && armedCart !== id) {
            armedCart = null;                                  // ★ P102：点了别的卡带 → 确认作废 ✓
            syncCartVeils();                                   //   顺便把那张的蒙版收掉（会闪一下 ✓）
        }

        if (cartsEl) {
            cartsEl.querySelectorAll('.play-cart').forEach(function (btn) {
                btn.setAttribute('aria-pressed',
                    btn.getAttribute('data-cart') === id ? 'true' : 'false');
            });
        }
        syncCartFrame();                       // ★ P103：选中框跟着走（新的闪烁出现 / 旧的平移过去 ✓）

        /* ★★ P100b：拖到舞台上时**先不铺内容** —— 屏幕上那份 md 保持上一个卡带的，
           等黑幕全黑（或过场被打断）再换 ✓（你报的："拖进去会先显示当前卡带的 md 页
           再过动画" ✗ —— 那份内容现在留在幕后换 ✓）
           ★ 选中态（aria-pressed）是"我选了哪一张"，和内容无关 → 照旧立刻更新 ✓ */
        if (deferContent) { deferredCart = id; return; }
        deferredCart = null;
        renderSelection(w);
    }

    /* ★ P91b：README 里的 `#锚点`（目录、标题跳转）—— 让**面板自己滚**。
       不拦的话浏览器会去动整页的 hash / 滚动位置 ✗ —— 面板只是固定宽的一栏，
       把整页滚走看起来就是"点了没反应，页面还乱跳"。
       ★ 用 id 逐个比对，**不拼 `'#' + id` 选择器** —— 锚点 id 可能以数字开头
         （`## 2024 回顾` → `2024-回顾`），那种选择器会直接抛 ✗。
       ★ 找不到目标就**不拦**（把点击交回浏览器，别把行为吞掉）。
       ★ 委托在容器上挂一次即可 —— README 内容每次都是整体重渲染的。 */
    if (readmeEl) {
        readmeEl.addEventListener('click', function (e) {
            const a = (e.target && e.target.closest) ? e.target.closest('a') : null;
            if (!a) return;
            const href = a.getAttribute('href') || '';
            if (href.charAt(0) !== '#') return;               // 站外/相对链接照旧

            let id = href.slice(1);
            try { id = decodeURIComponent(id); } catch (err) { /* 原样用 */ }
            if (!id) return;

            const all = readmeEl.querySelectorAll('[id]');
            let target = null;
            for (let i = 0; i < all.length; i++) {
                if (all[i].getAttribute('id') === id) { target = all[i]; break; }
            }
            if (!target) return;                              // 没这个标题 → 交给浏览器

            e.preventDefault();                               // 别动整页的 hash
            if (!target.getBoundingClientRect || !readmeEl.getBoundingClientRect) return;
            const r = target.getBoundingClientRect();
            const c = readmeEl.getBoundingClientRect();
            if (typeof readmeEl.scrollTop === 'number') {
                readmeEl.scrollTop += (r.top - c.top) - 10;   // 留一点上边距
            }
        });
    }

    /* ============================================================
       导航栏上的"游戏控件"：关闭 / 静音 / 全屏（P93）
       ------------------------------------------------------------
       这三个键住在**导航栏**里，不在游乐区里。为什么：
         · 游乐区展开后导航栏被推到屏幕最右边，那几个导航键**还点得动** ✗ ——
           玩着游戏手一滑就跳走了（历史遗留问题）；
         · 于是展开时只藏掉那 4 个导航链接，显示这一组 ✓；
         · ★ P93b（你的要求）：logo 与主题切换键**不藏** —— 它们不是"跳走"的入口
           （主题键在游戏里还用得上），而且 logo 是这条竖栏的题头；
         · `close()` 第一行就摘掉 body.sidebar-open → **收起的那一瞬间**
           导航按钮立刻回来（不用等 450ms 滑完）✓。CSS 那边是纯 class 驱动。
       ★ 「静音 / 全屏」是开关，用 aria-pressed 表达状态（和卡带选中态同一套语言）；
         没在玩游戏时它们 disabled（没有对象可操作）。
       ============================================================ */
    const ctlClose = document.querySelector('[data-play="ctl-close"]');
    const ctlMute = document.querySelector('[data-play="ctl-mute"]');
    const ctlFull = document.querySelector('[data-play="ctl-full"]');

    let gameMuted = false;
    const audioHandles = [];        // 一局一份；iframe 一换，旧的上下文就跟着没了

    function currentFrame() {
        return playStage ? playStage.querySelectorAll('.play-frame')[0] : null;
    }

    /* 给 iframe 的 AudioContext 套一层：之后**新建**的上下文都会经过一个 master gain
       —— 拧到 0 就是静音 ✓。比 suspend()/resume() 可靠，也不挑 Unity 版本
       （老版本 Unity 的 suspend/resume 有已知毛病）。
       必须在 Unity 建上下文**之前**套上，所以和 guardDoc / hookConsole 一起挂在 load ✓
       —— 那一刻 wasm 通常还没实例化完，赶得上 ✓；赶不上还有下面的兜底。 */
    function wrapAudioContext(ctx) {
        if (!ctx || ctx.__siteWrapped) return;
        const real = ctx.destination;                      // ★ 先抓住真出口
        const master = ctx.createGain();
        master.gain.value = gameMuted ? 0 : 1;
        master.connect(real);
        // 之后所有 node.connect(ctx.destination) 都接到 master（自有属性盖住原型上的访问器）
        Object.defineProperty(ctx, 'destination', {
            get: function () { return master; },
            configurable: true,
        });
        ctx.__siteWrapped = true;
        audioHandles.push({ ctx: ctx, master: master });
    }

    function registerAudio(win) {
        if (!win) return;
        try {
            const Orig = win.AudioContext || win.webkitAudioContext;
            if (!Orig || Orig.__siteWrapped) return;
            const Site = function () {
                const args = [null].concat([].slice.call(arguments));
                const ctx = new (Function.prototype.bind.apply(Orig, args))();
                try { wrapAudioContext(ctx); } catch (err) { /* 套壳失败也不许影响游戏 */ }
                return ctx;
            };
            Site.prototype = Orig.prototype;
            if (win.AudioContext) win.AudioContext = Site;
            if (win.webkitAudioContext) win.webkitAudioContext = Site;
            Orig.__siteWrapped = true;
        } catch (err) { /* 跨源 / 没这套 API：静音就只能靠下面的兜底 */ }
    }

    /* 兜底：Unity 早于我们套壳就把上下文建好了 → 去它自己的全局里找 ✓
       （不同 Unity 版本挂的位置不一样，逐个试；都没有就返回 null） */
    function findUnityAudioContext(win) {
        const mod = win.Module || (win.unityInstance && win.unityInstance.Module);
        const cands = [
            mod && mod.WEBAudio && mod.WEBAudio.audioContext,
            mod && mod.audioContext,
            win.SDL2 && win.SDL2.audioContext,
        ];
        for (let i = 0; i < cands.length; i++) {
            if (cands[i] && typeof cands[i].suspend === 'function') return cands[i];
        }
        return null;
    }

    /* 把"静音"这个状态真的落到游戏上。返回命中了几处（一处都没命中时上层会提示） */
    function applyMute() {
        const frame = currentFrame();
        if (!frame || !frame.contentWindow) return 0;
        const win = frame.contentWindow;
        let hits = 0;

        // ① 套过壳的上下文：拧 master gain
        for (let i = 0; i < audioHandles.length; i++) {
            try { audioHandles[i].master.gain.value = gameMuted ? 0 : 1; hits++; } catch (err) { }
        }

        // ② 兜底：suspend() / resume()（浏览器标准能力，Unity 自己也用它）
        try {
            const ctx = findUnityAudioContext(win);
            if (ctx) {
                hits++;
                const p = gameMuted ? ctx.suspend() : ctx.resume();
                if (p && p.catch) p.catch(function () { });
            }
        } catch (err) { }

        // ③ 顺手把 iframe 里的 <audio>/<video> 也静音（有些构建会用它放声音）
        try {
            const doc = frame.contentDocument;
            if (doc) {
                const media = doc.querySelectorAll('audio,video');
                for (let i = 0; i < media.length; i++) { media[i].muted = gameMuted; hits++; }
            }
        } catch (err) { }

        return hits;
    }

    function toggleMute() {
        if (!playingGame) return;
        gameMuted = !gameMuted;
        const hits = applyMute();
        syncControls();
        if (gameMuted && hits === 0) {
            // 找不到抓手就说实话，别让按钮假装静音了
            showMessage('没找到音频上下文，静音可能没生效');
        }
    }

    /* ============================================================
       全屏 + Keyboard Lock：把浏览器的**保留键**也从它嘴里要回来（P93c）
       ------------------------------------------------------------
       为什么需要：Ctrl+T / Ctrl+N / Ctrl+1…9 / Ctrl+Tab / Alt+←→ 这些是浏览器在
       **渲染进程之前**就吃掉的（P83 里写过：页面 preventDefault 对它们无效），
       所以只要还停在普通网页里，游戏就永远拿不到。
       Keyboard Lock 是唯一的路：锁住之后这些键**直接派发给全屏元素**（= 游戏那个
       iframe）✓，浏览器不再插手。
       ★ 生效条件（规范 + MDN）：只能在**顶层文档**调用（游戏 iframe 自己调会
         InvalidStateError，我们父页面调正好 ✓）、需要用户手势（就是我们这一下点击 ✓）、
         且只在 **JS 触发的全屏**里生效 —— 按 F11 的系统全屏不算（规范 4.2）。
         Chrome 68+ / Edge 79+ 有；Firefox / Safari 明确不支持 → 静默跳过 ✓。
       ★ 顺序按规范 4.1 的建议：**先 lock() 再 requestFullscreen()**；
         退出时**先 exitFullscreen() 再 unlock()** —— 反了会看到两次"按 Esc 退出"的提示。
       ★★ 故意**不锁**这四个（和你一路的决定保持一致）：
         · Escape —— 锁了它就得**长按 2 秒**才能退出全屏（规范强制的兜底），
           单击 Esc 退全屏是最好用的逃生口；
         · KeyW —— Ctrl+W"逃离这一页"，和 P84 的 ESCAPE_COMBO 是同一条决定；
         · F11 / F12 —— 系统全屏与开发者工具，P84 起就故意留着。
       想要"整块键盘全给游戏"：把下面那行换成 `kb.lock()`（不带参数 = 锁所有键），
       代价就是上面那四个逃生口一起没了。
       ============================================================ */
    const LOCK_CODES = [
        'Tab',                                       // Ctrl+Tab / Ctrl+Shift+Tab 切标签
        'ArrowLeft', 'ArrowRight',                   // Alt+← / Alt+→ 后退前进
        'KeyT', 'KeyN',                              // Ctrl+T 新标签 / Ctrl+N 新窗口
        'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5',
        'Digit6', 'Digit7', 'Digit8', 'Digit9',      // Ctrl+1…9 直接跳标签
    ];

    /* 返回"有没有真的去要"（Firefox / Safari 上没这 API → false，一切照旧 ✓） */
    function lockKeyboard() {
        const kb = window.navigator && window.navigator.keyboard;
        if (!kb || typeof kb.lock !== 'function') return false;
        try {
            const p = kb.lock(LOCK_CODES);
            if (p && p.catch) p.catch(function () { });   // 没手势 / 不在全屏：静默
            return true;
        } catch (err) { return false; }
    }

    function unlockKeyboard() {
        const kb = window.navigator && window.navigator.keyboard;
        if (!kb || typeof kb.unlock !== 'function') return;
        try { kb.unlock(); } catch (err) { }
    }

    /* ============================================================
       真全屏：让**游戏页里的那张 canvas** 也跟着铺满（P93d）
       ------------------------------------------------------------
       症状：进了全屏、快捷键都对，但游戏画面还是进来之前那么大，四周一圈黑 ✓
       （你报的）。**不是我们没全屏**，是 Unity 默认模板把 canvas 尺寸写死了：
         · index.html 桌面分支：`canvas.style.width = "960px"; height = "540px"`；
         · TemplateData/style.css：只有 `.unity-mobile` 那条是 100%，桌面没有；
         · `#unity-container.unity-desktop` 还是 `left/top:50% + translate(-50%,-50%)` 居中。
       我们全屏的是 **iframe**（UA 的 `:fullscreen` 规则强制它铺满 ✓），
       而游戏页里那张 canvas 仍是 960×540 居中 → 看起来就是"没放大" ✗。
       ★ 为什么不去调 Unity 自己的 `unityInstance.SetFullscreen(1)`：它全屏的是 **canvas**，
         那需要**游戏页自己**有用户手势 —— 我们父页面点一下，手势不一定传得进 iframe ✗。
         全屏 iframe 这条路是稳的（你已经在用了 ✓）。
       ★ 所以：往游戏页塞一条很小的 style，只在全屏那一刻生效（`html.site-fs` 这个类
         由 syncControls 开关 ✓）；不生效时不碰游戏页一个像素。
       ★★ 关键是 Unity 会跟着走：官方文档写明"网页用 JS 改了 canvas 的 CSS 尺寸，
          Unity 会自动把 WebGL 渲染目标尺寸也调成一致"（`matchWebGLToCanvasSize` 默认开 ✓）。
          —— 所以**不用改工程、不用重打包**，分辨率是跟着变大的（清晰），
          不是把 960×540 拉伸糊掉 ✓。下面再喊一声 resize，兜老版本 Unity。
       ============================================================ */
    const FILL_ID = 'site-fullscreen-fill';
    /* ★ `!important` 是必须的：canvas 的尺寸是模板用**内联样式**写上去的，
       普通作者样式压不过内联；带 html.site-fs 前缀则保证"不全屏就一条都不生效" ✓ */
    const FILL_CSS = [
        'html.site-fs, html.site-fs body { margin: 0 !important; height: 100% !important; overflow: hidden !important; }',
        'html.site-fs #unity-container { position: absolute !important; left: 0 !important; top: 0 !important;',
        '  width: 100% !important; height: 100% !important; transform: none !important; margin: 0 !important; }',
        'html.site-fs #unity-canvas, html.site-fs canvas:only-of-type {',
        '  width: 100% !important; height: 100% !important; display: block !important; }',
        /* Unity 模板自带的页脚（WebGL 标 / 它自己的全屏键 / 构建名）别占位置：
           游乐区自己有关闭 / 静音 / 全屏 ✓ */
        'html.site-fs #unity-footer { display: none !important; }',
    ].join('\n');

    function applyGameFill(on) {
        const frame = currentFrame();
        if (!frame) return;
        let doc = null;
        try { doc = frame.contentDocument || null; } catch (err) { return; }   // 跨源：够不着
        if (!doc || !doc.documentElement) return;

        if (!on) {
            /* 样式表留着（很小，没这个类就一条都不生效），下次进全屏不用再插 ✓ */
            doc.documentElement.classList.remove('site-fs');
            return;
        }
        if (!doc.getElementById(FILL_ID)) {
            const style = doc.createElement('style');
            style.setAttribute('id', FILL_ID);
            style.textContent = FILL_CSS;
            (doc.head || doc.documentElement).appendChild(style);
        }
        doc.documentElement.classList.add('site-fs');
        /* ★ 老版本 Unity 只监听 window 的 resize → 手动喊一声让它重算渲染分辨率 ✓ */
        try {
            const win = frame.contentWindow;
            win.dispatchEvent(new (win.Event || Event)('resize'));
        } catch (err) { /* 没有 Event / 跨源：上面那条"自动同步"已经够了 */ }
    }

    function toggleFullscreen() {
        const doc = document;
        const fsEl = doc.fullscreenElement || doc.webkitFullscreenElement;
        if (fsEl) {
            const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
            if (exit) { try { const p = exit.call(doc); if (p && p.catch) p.catch(function () { }); } catch (err) { } }
            unlockKeyboard();          // ★ P93c：先 exitFullscreen() 再 unlock()（规范建议的顺序）
            return;
        }
        const frame = currentFrame();
        if (!frame) return;
        const req = frame.requestFullscreen || frame.webkitRequestFullscreen;
        if (!req) return;
        lockKeyboard();                // ★ P93c：先 lock() 再 requestFullscreen()（规范建议的顺序）
        try {
            const p = req.call(frame);
            if (p && p.catch) p.catch(function () { });
        } catch (err) { /* 没手势 / 被拒：什么也不做 */ }
    }

    /* 两个开关按钮的状态始终反映**现实**（全屏可能是按 Esc 退的，我们得跟上） */
    function syncControls() {
        const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        /* ★ P93c：全屏没了（含按 Esc 自己退的）→ 顺手把 Keyboard Lock 解开。
           它本来也只在全屏里生效，但状态要干净：别让"锁"在后台挂着。 */
        if (!fsEl) unlockKeyboard();
        /* ★ P93d：全屏的那一刻把游戏页里的 canvas 也拉满；退出就还原（同源才做得到） */
        applyGameFill(!!fsEl);
        if (ctlMute) {
            ctlMute.disabled = !playingGame;
            ctlMute.setAttribute('aria-pressed', (playingGame && gameMuted) ? 'true' : 'false');
        }
        if (ctlFull) {
            ctlFull.disabled = !playingGame;
            ctlFull.setAttribute('aria-pressed', fsEl ? 'true' : 'false');
        }
    }

    if (ctlClose) ctlClose.addEventListener('click', function () { close(ctlClose); });
    if (ctlMute) ctlMute.addEventListener('click', function () { toggleMute(); });
    if (ctlFull) ctlFull.addEventListener('click', function () { toggleFullscreen(); });
    document.addEventListener('fullscreenchange', syncControls);
    document.addEventListener('webkitfullscreenchange', syncControls);

    /* ============================================================
       游戏详细页 = 一页 README（P91）
       ------------------------------------------------------------
       数据在 data/works.js 的 readme 字段（.md 的路径）✓。
       解析交给 js/markdown.js（纯函数、零依赖、**整段先转义**再用，见那边注释 ✓）。

       ★★ 这里是全站**唯一**一处 innerHTML。为什么可以：
          readmeEl 的内容全部来自 Markdown.toHtml() 的输出 —— 那个函数第一步就把
          整份源文本 HTML 转义了，标签也都是它自己白名单里的。**游戏发来的文字**
          （回执那条 .play-msg）依旧走 textContent，一个字节都不许走这里 ✓。
          （回退分支里用 detail 数组拼的那点 HTML，文字也走 escapeHtml ✓。）

       ★ fetch 取的是本站静态文件 → 需要 http(s)：
         file:// 直接双击打开会被 CORS 拦掉 → 那种情况下退回 detail 数组 ✓
         （页面永远不会空 ✓）。取不到也退回 detail ✓，并留一行 ASCII 说明 ✓。
       ★ 按路径缓存；切卡带时旧请求回来了会被 token 比对丢掉 ✓（不会串页）。
       ★ 正文用系统字体、标题用展示字体（见 style.css）→ 只有标题和表头的字需要
         进字体子集，_dev/glyph-set.js 会专门扫 .md 的那几行 ✓。
       ============================================================ */
    const readmeCache = Object.create(null);
    let readmeToken = 0;

    function renderReadme(html) {
        if (!readmeEl || !stageEl) return;
        readmeEl.innerHTML = html;                 // ← 见上面那段说明
        stageEl.classList.add('is-readme');
    }

    function hideReadme() {
        readmeToken++;                             // 让还在路上的请求作废
        if (stageEl) stageEl.classList.remove('is-readme');
        if (readmeEl && readmeEl.replaceChildren) readmeEl.replaceChildren();
    }

    /* 没有 readme 字段 / 取不到 → 用老的 detail 数组，保持原来的观感 ✓ */
    function readmeFallback(w, note) {
        const items = (w && w.detail) || [];
        const esc = (window.Markdown && Markdown.escapeHtml)
            ? Markdown.escapeHtml
            : function (s) { return String(s); };
        let html = '';
        if (note) html += '<p class="md-note">' + esc(note) + '</p>';
        if (items.length) {
            html += '<ul>' + items.map(function (t) {
                return '<li>' + esc(t) + '</li>';
            }).join('') + '</ul>';
        }
        renderReadme(html || '<p class="md-note">' + esc('(empty)') + '</p>');
    }

    function loadReadme(w) {
        const path = (w && w.readme) || '';
        if (!path) { hideReadme(); return; }                  // 没写 → 保持老样子
        if (typeof Markdown === 'undefined' || typeof fetch !== 'function') {
            hideReadme(); return;                             // 解析器/网络都没有 → 不冒险
        }

        if (readmeCache[path] != null) { renderReadme(readmeCache[path]); return; }

        const token = ++readmeToken;
        renderReadme('<p class="md-loading">LOADING…</p>');    // ASCII：不占字体子集
        fetch(path, { cache: 'no-cache' })
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.text();
            })
            .then(function (text) {
                const html = Markdown.toHtml(text);
                readmeCache[path] = html;                      // 只缓存成功的结果
                if (token !== readmeToken) return;             // 期间切过卡带 → 丢弃
                renderReadme(html);
            })
            .catch(function (err) {
                if (token !== readmeToken) return;
                readmeFallback(w, 'README not loaded: ' + path + ' (' + (err && err.message) + ')');
            });
    }

    /* ============================================================
       开始 / 停止游戏（P81）
       ------------------------------------------------------------
       "开始" = 往 .play-stage 里塞一个 iframe，指向 works.js 里那条 src。
       ★ 惰性：只有真的开始才设 src —— 14~23MB 是从那一刻才开始下的。
       ★ 换游戏 / 关游乐区都先把旧的清掉（replaceChildren）：
         WebGL 上下文很贵，浮窗当初就是因为这个才"打开才建、关闭就销毁"。
       ★ 关门时**只销毁、不改状态**：面板正在滑走，这时候把舞台换回规格
         会看得出来；留着一个空舞台反而看不出变化。回到 empty 交给
         resetStage()（下次开门那一刻做，那时面板还在屏幕外）。
       ============================================================ */
    let playingGame = null;

    function stopGame(keepIntro) {
        /* ★★ P99/P100：把没演完的开场过场一并收掉 —— 否则停在半路的幕布/隐藏的 md 内容
           会留到下一局（`stopGame` 是 resetStage / exitGame / 换卡带都会走的那条路）✓
           ★ keepIntro：**换卡带**那一拍要在幕布全黑时收掉上一局 —— 那时过场正在演，
             顺手 cancelIntro() 会把幕布和后面的定时器一起掐掉 ✗。所以只有这一处传 true ✓ */
        if (!keepIntro) cancelIntro();
        /* ★★ P93：退全屏要在**拔 iframe 之前**判 —— replaceChildren() 一跑，
           那个元素的 parentElement 就断了，contains() 再也认不出"正全屏的就是这一局" ✗
           （浏览器其实也会因为全屏元素被摘而自己退，但那一下不是我们能等的：
             状态得当场同步，不然按钮会挂着"全屏中"）。 */
        const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        if (fsEl && playStage && (fsEl === playStage || playStage.contains(fsEl))) {
            const exit = document.exitFullscreen || document.webkitExitFullscreen;
            if (exit) { try { const p = exit.call(document); if (p && p.catch) p.catch(function () { }); } catch (err) { } }
            /* ★ P93c：这一局没了 → Keyboard Lock 也解开（顺序照规范：先退全屏再解锁） */
            unlockKeyboard();
        }

        if (playStage) playStage.replaceChildren();   // 拔掉 iframe → 释放 WebGL 上下文
        playingGame = null;
        keyGuardOn = false;          // ★ P85：键还给浏览器（这条守卫跟着这一局走）
        hideMessage();               // ★ P86：游戏没了，它留下的回执也收掉
        msgErrShown = 0;             // ★ P87：控制台回执的额度按"一局"重新算
        if (stageEl) stageEl.classList.remove('is-loaded');

        /* ★ P93：这一局留下的音频抓手全作废（上下文跟着 iframe 一起没了），
           静音状态也复位 —— 静音不跨局，新一局默认有声 ✓ */
        gameMuted = false;
        audioHandles.length = 0;
        syncControls();
        /* ★★ P102：谁都不在跑了 → 那张卡带表面的蒙版**闪烁消失** ✓
           （`playingGame` 已经在上面清成 null 了） */
        syncCartVeils();
    }

    /* 退出游戏 = 卸掉它 + 退回这条游戏的详情页。
       （iframe 已经拔掉，留一个空舞台反而像坏了。）
       ★ P102：`keepIntro` 传给 stopGame —— "点卡带停止运行"那一拍要在黑幕全黑时收掉
         这一局，那时过场正演着，不能顺手把它掐掉 ✓（和 P100 换卡带同一套） */
    function exitGame(keepIntro) {
        stopGame(keepIntro);
        if (stageEl && stageEl.dataset.state === 'play') stageEl.dataset.state = 'game';
    }

    /* ============================================================
       把浏览器"抢"走的键还回游戏（P83 → P84）
       ------------------------------------------------------------
       症状：游戏里的 Ctrl+R（重开一局之类）被浏览器当成"刷新页面"执行了；
             右键长按还会被鼠标手势工具接手。

       真相分三层，能做的只有前两层：
         ① 浏览器自己的快捷键（刷新 / 打印 / 查找 / 缩放 …）—— 页面**可以**拦
            （keydown + preventDefault）。但**必须由按键所在的那份文档**拦：
            焦点在 iframe 里时，父页面的监听根本收不到。所以挂两份 ——
            父页面一份（焦点在站点自己的控件上时），iframe 内部一份
            （同源才能拿到 contentDocument，见 startGame 里的 load 回调）。
         ② 右键菜单 —— 同理，两份都要 preventDefault，游戏才吃得到右键，
            浏览器菜单才不会从游戏画面上弹出来。
         ③ 鼠标手势工具（浏览器扩展）—— **页面拦不住**，那是扩展在浏览器
            层面接管的；只能在那工具里给本站加白名单 / 暂停。

       ★★ P84：拦截图从"逐个列举"改成"带修饰键的一律拦"。
         你游戏里的绑定是一大堆（Ctrl+T/E/1/2/`/-/= …），白名单式列举
         永远漏一个，而且每加一个绑定都要回来改这个文件。现在：
           ① 带 Ctrl / Cmd / Alt 的组合 → 一律拦；
           ② F1-F10 功能键（抢焦点、弹帮助那一排）→ 一律拦。
         故意留着的三个逃生口（别小看它们，游戏卡住时全靠这几个）：
           · F11 全屏、F12 开发者工具 —— 你调游戏也要用；
           · Ctrl+W 关标签 —— 那是"逃离这一页"的动作，不该被游戏扣住。
         （想连 Ctrl+W 也交出去？把 ESCAPE_COMBO 清空就行，一行。）

       ★ 浏览器**保留键**（Ctrl+T / Ctrl+N / Ctrl+W / Ctrl+1…9 / Alt+←→）
         在 Chrome 里 preventDefault 是无效的：我们照发不误，但浏览器给
         不给面子不由页面决定。真要从它嘴里抢回来只有两条路 ——
         全屏（F11，Chrome 在全屏下会放开保留）或 Keyboard Lock API
         （要全屏 + 顶层文档 + 用户手势）。见 CHANGES P83 / P84。
       ★ 只在真的有游戏在跑、**而且这一条开了 keyGuardOn** 的时候生效：
         没玩的时候、没开开关的条目，浏览器一切照旧（Ctrl+R 照旧刷本站）。
         （P85：开关在 data/works.js 里，默认 false —— 见 isBrowserAction 上面）
       ============================================================ */
    const FUNCTION_KEYS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10'];
    const ESCAPE_COMBO = ['w'];            // Ctrl+W 关标签：留着

    /* ★★ P85：这条守卫是 **works.js 里一条开关**管的（keyGuardOn）。
       默认（没写 / false）= 什么都不拦，浏览器照旧；写了 true 才算"把键还给游戏"。
       ★ 开关在 startGame() 那一刻抄一份到这里：每按一个键都去 works.js 里
         filter 一遍没必要，而且"跑着的这一局"和"数据后来改了"本来就不该
         互相影响 —— 想生效就重开一局。 */
    let keyGuardOn = false;

    function isBrowserAction(e) {
        /* 没在玩游戏 / 这一条没开开关 → 一切照常（Ctrl+R 照旧刷本站） */
        if (!playingGame || !keyGuardOn) return false;
        /* 输入框里放行：Unity 的 WebGL 文本输入（含中文 IME）靠一个隐藏
           input 转手，真把 Ctrl+V / Ctrl+A / Ctrl+X 也吃了，游戏里打字就废了。 */
        const t = e.target;
        if (t && (t.isContentEditable ||
            (t.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return false;
        const k = String(e.key || '').toLowerCase();
        if (e.ctrlKey || e.metaKey) return ESCAPE_COMBO.indexOf(k) === -1;
        if (e.altKey) return true;
        return FUNCTION_KEYS.indexOf(String(e.key || '')) !== -1;
    }

    /* 给任意一份文档挂上这两条守卫（同样的逻辑要挂两份：父页面 + iframe 内）。
       ★ 用 capture 阶段：preventDefault 只取消"浏览器的默认动作"，
         不打断事件传播 —— 游戏自己的处理照旧收得到这个键。 */
    function guardDoc(doc) {
        if (!doc || doc.__playGuarded) return;
        doc.addEventListener('keydown', function (e) {
            if (isBrowserAction(e)) e.preventDefault();
        }, true);
        doc.addEventListener('contextmenu', function (e) {
            if (playingGame && keyGuardOn) e.preventDefault();
        }, true);
        doc.__playGuarded = true;      // iframe 可能反复 load，别重复挂
    }

    guardDoc(document);                // 父页面这一份

    /* 游戏画布上那一圈（iframe 之外的边距）也顺手拦一下右键 */
    if (playStage) {
        playStage.addEventListener('contextmenu', function (e) {
            if (playingGame && keyGuardOn) e.preventDefault();
        });
    }

    /* ============================================================
       游戏自己喊"我退出了"（P82）
       ------------------------------------------------------------
       桌面版游戏里的"退出游戏"调的是 Application.Quit() —— 网页里没有窗口
       可关，Unity 的 WebGL 后端会**停掉播放循环**：最后一帧留在画布上、
       输入不再响应，看起来就是"卡住"。那是游戏那边的代码，站点管不着；
       但站点可以**接住**它：只要构建往父页面 postMessage 一句，我们就
       把 iframe 拔掉、退回这条游戏的详情页。

       构建那边要加的（Unity 2020+ 的标准做法，一个 .jslib + 一句话）：
         Assets/Plugins/WebGL/QuitToSite.jslib:
           mergeInto(LibraryManager.library, {
             QuitToSite: function () { window.parent.postMessage('resolualysis:play-exit', '*'); }
           });
         C#（退出按钮里）：
           #if UNITY_WEBGL && !UNITY_EDITOR
               QuitToSite();
           #else
               Application.Quit();
           #endif
         （DllImport("__Internal") private static extern void QuitToSite();）

       ★ 只认当前那个 iframe 发来的消息（比对 e.source）——
         页面上可能同时有别的 iframe / 别的窗口在发消息。
       ============================================================ */
    const EXIT_MSG = 'resolualysis:play-exit';

    /* ★★ P86：第二种消息 —— 游戏要在屏幕上显示一条回执。
       构建那边（同一个 .jslib 里再加一个函数）：
         SiteMsg: function (ptr) {
           window.parent.postMessage('resolualysis:play-msg:' + UTF8ToString(ptr), '*');
         }
       C#：DllImport("__Internal") static extern void SiteMsg(string t);

       两种写法都认（jslib 里拼字符串最省事，所以字符串那种是主推）：
         · 字符串：'resolualysis:play-msg:任务完成'     ← 前缀 + 冒号 + 文字
         · 对象：  { type: 'resolualysis:play-msg', text: '任务完成', ms: 4000 }
       文字为空 = 让站点把这条收掉（游戏想自己控制消失时机时用）。

       ★ 回执里的字是**运行时**从游戏来的，站点无从预知 —— 字体、长度、
         换行都得按"不可信、可能很长"来对待（下面 showMessage 里都处理了）。 */
    const MSG_KIND = 'resolualysis:play-msg';

    /* 取消息的"种类"：字符串协议和对象协议都认。
       （字符串那种要小心：'resolualysis:play-exit' 本身带冒号，
         不能简单按冒号切 —— 所以这里逐个比前缀。） */
    function msgKind(data) {
        if (typeof data === 'string') {
            if (data === EXIT_MSG) return EXIT_MSG;
            if (data.indexOf(MSG_KIND) === 0) return MSG_KIND;
            return '';
        }
        return (data && typeof data.type === 'string') ? data.type : '';
    }

    window.addEventListener('message', function (e) {
        if (!playStage) return;
        const frame = playStage.querySelectorAll('.play-frame')[0];
        if (!frame || !frame.contentWindow || e.source !== frame.contentWindow) return;
        const data = e.data;
        const kind = msgKind(data);

        if (kind === EXIT_MSG) {           // ① P82：游戏退出 → 拔 iframe、退回详情页
            exitGame();
            return;
        }
        if (kind === MSG_KIND) {           // ② P86：屏幕上给一条回执
            if (typeof data === 'string') {
                showMessage(data.slice(MSG_KIND.length).replace(/^[:\s]+/, ''));
            } else {
                showMessage(data.text, data.ms);
            }
        }
    });

    /* ============================================================
       ★★ P99：开场三拍 —— md 闪没 → 黑幕渐入 → 载入 → 0.45s 后幕布渐出
       ------------------------------------------------------------
       时间点（你定的）：
         0ms     游戏区里那页 md 内容**闪烁消失**（CSS 的 playMdOut，MD_OUT_MS）
         250ms   黑幕**渐入**（CSS 的 playCurtainIn，CURTAIN_IN_MS）
         500ms   幕布**完全不透明** → **这一刻才开始载入游戏**（建 iframe）
         950ms   再等 0.45s（CURTAIN_HOLD_MS）→ 幕布**渐出**（CURTAIN_OUT_MS）
         1350ms  收尾：类摘掉、定时器清空（md 内容也回到可见）
       · 为什么非要"全黑了才载入"：Unity 一起来会先白闪一下、载入条也会跳出来 ——
         这些都发生在幕布后面，眼睛看不到 ✓（载入层本来就在 stage 里，
         幕布的 z-index 比它高）。
       · 降级：降低动效 / 没有舞台或幕布（测试桩那种）→ 不演，直接载入 ✓。
       · 每一拍都是**独立的定时器**（不是嵌套的"猜时长"），而且全部登记在
         introTimers 里 —— 停游戏 / 关面板时一次性清干净 ✓。
       ============================================================ */
    const MD_OUT_MS = 250;           // ① md 内容闪烁消失
    const MD_HOLD_MS = 400;          // ①' 闪完之后**停一下**（P100）再让黑幕渐入
    const CURTAIN_IN_MS = 250;       // ② 黑幕渐入
    const CURTAIN_HOLD_MS = 450;     // ③ 全黑之后等到渐出之间的停顿
    const CURTAIN_OUT_MS = 400;      // ④ 幕布渐出（收尾定时器用它）
    /* ★★ P101：「游玩注意」那行字 —— 黑幕全黑之后闪出来，停 3s，再闪掉 ✓ */
    const NOTICE_HOLD_MS = 3000;     // 停留 3s
    const NOTICE_OUT_MS = 400;       // ★ 和 CSS 的 noticeOut 动画时长一致（自检比着它对）
    const VEIL_OUT_MS = 400;         // ★ P102：卡带蒙版"闪烁消失"的时长（和 CSS 的 cartVeilOut 对齐）
    let introTimers = [];

    /* 只清"过场本身"（定时器 + 三个类）—— 不动那条"故意没铺"的内容。
       ★ startGame 开头要的是这个：它马上要开新过场，不能顺手把待铺内容先铺了 ✗ */
    function clearIntro() {
        introTimers.forEach(function (t) { clearTimeout(t); });
        introTimers = [];
        if (stageEl) stageEl.classList.remove('is-starting');
        if (curtainEl) curtainEl.classList.remove('is-in', 'is-out');
        /* ★ P101：黑幕上那行「游玩注意」也收掉 ✓ */
        if (noticeEl) noticeEl.classList.remove('is-on', 'is-out');
    }

    /* 过场**被放弃**（停游戏 / 关门 / 复位 / 换点别的卡带）→ 定时器与类清掉，
       并且把那条"故意没铺"的内容补上（否则面板里留着上一个卡带的 md、选中的是新的 ✗）✓ */
    function cancelIntro() {
        clearIntro();
        applyDeferred();
    }

    /* 真的把游戏挂上去：建 iframe + 载入层，设 src（= 这一刻才开始下载）✓ */
    function mountGame(w) {
        const frame = document.createElement("iframe");
        frame.className = "play-frame";
        frame.setAttribute("title", w.title || w.id);
        /* Unity 构建要用到的几项权限 */
        frame.setAttribute("allow", "fullscreen; autoplay; gamepad");
        frame.setAttribute("allowfullscreen", "");
        frame.addEventListener("load", function () {
            if (stageEl) stageEl.classList.add("is-loaded");   // 载入层淡掉
            try { guardDoc(frame.contentDocument); } catch (err) { /* 跨源：够不着 */ }
            try { hookConsole(frame.contentWindow); } catch (err) { /* 跨源：够不着 */ }
            /* ★ P93：趁 Unity 还没建 AudioContext，先给它套一层 master gain（静音用） */
            try { registerAudio(frame.contentWindow); } catch (err) { /* 跨源：够不着 */ }
        });
        playStage.appendChild(frame);

        const loading = document.createElement("div");
        loading.className = "play-loading";
        loading.setAttribute("aria-hidden", "true");
        loading.textContent = "LOADING…";             // ASCII：不占字体子集
        playStage.appendChild(loading);

        frame.src = w.src;                            // ★ 设 src = 开始下载
        playingGame = w.id;
        keyGuardOn = !!w.keyGuardOn;
        if (stageEl) stageEl.dataset.state = 'play';
        syncControls();                               // ★ P93：静音/全屏两个键这时才可用
        syncCartVeils();                              // ★ P102：这张卡带盖上「正在运行…」✓
    }

    /* ============================================================
       ★★ P102：确认停止 —— 黑幕渐入 → 全黑之后才真的关掉这一局 →
       **直接**渐出黑幕（不像开场那样还有 0.45s 停顿）→ 露出这条游戏的内容 ✓
       ============================================================ */
    function stopRunningGame() {
        const id = playingGame;
        if (!id) return;
        armedCart = null;                       // 这一下"确认"用掉了 ✓
        const reduce = !!(window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        if (reduce || !curtainEl || !stageEl) { exitGame(); return; }
        clearIntro();                           // 上一轮没演完的过场先清掉
        curtainEl.classList.add('is-in');
        introTimers.push(setTimeout(function () {
            /* ★ 全黑之后：关掉这一局 + 退回详情页（`true` = 过场正演着，别掐自己 ✓）
               —— stopGame 里会 syncCartVeils()，那张卡带的蒙版就在这一刻开始闪烁消失 ✓ */
            exitGame(true);
            /* ★ **直接**渐出（你说的"直接渐出黑幕"）—— 没有 0.45s 停顿 ✓ */
            curtainEl.classList.add('is-out');
            introTimers.push(setTimeout(function () {
                cancelIntro();                  // 收尾：类摘掉、定时器清空 ✓
            }, CURTAIN_OUT_MS));
        }, CURTAIN_IN_MS));
    }

    function startGame() {
        if (!playStage || !currentGame) return;

        const w = games.filter(function (g) { return g.id === currentGame; })[0];
        /* ★★ P104：这条有没有能玩的构建 —— **空卡带**（没写 src 的那种，比如 md样式）
           不是"能玩的东西"，但它照样能"被拖进来换掉正在跑的那一局" ✓ */
        const playable = hasPlayableSrc(w);
        if (!playable) refreshStartButton(w);
        if (playable && playingGame === w.id) return;  // 已经在跑这一套了

        /* ★★ P100：**已经跑着游戏**时拖入新卡带 → 走"直接渐入黑幕"那条路：
           屏幕上现在是游戏、没有 md 可闪，所以跳过前两拍；
           而且**先不关上一局** —— 让它在幕布后面活到全黑那一刻再换 ✓
           （`select(w.id, true, true)` 那边也不会提前 stopGame，两处是一套的）。
           换卡带 / 开门复位那些路径走的是 select() 的普通分支，照旧立刻停 ✓ */
        const swapping = !!playingGame;
        clearIntro();                                 // 上一轮没演完的过场先清掉
                                                      // （★ 用 clearIntro 而不是 cancelIntro：
                                                      //   后者会把"待铺的内容"提前铺出来 ✗）
        if (!swapping && playable) stopGame(true);     // 没在跑：照旧先清干净
                                                      // ★ 传 true：那条"待铺的内容"要留到
                                                      //   黑幕全黑才铺（P100b，见 select）✓

        /* ★★ P99：降低动效 / 缺舞台或幕布（测试桩那种）→ 不演过场，直接载入 ✓ */
        const reduce = !!(window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        if (reduce || !stageEl || !curtainEl) {
            if (swapping) stopGame();
            applyDeferred();                          // 待铺的内容也在这时补上 ✓
            if (playable) mountGame(w);
            return;
        }

        /* ④ 黑幕**剩下的**动画：停 0.45s → 渐出 → 收尾 ✓
           ★★ P101：有「游玩注意」时这一段的**起点**往后挪到那行字闪掉之后
             （"消失后相当于黑幕渐入完全不透明的时间点接上黑幕剩余的动画"）✓ */
        const curtainRest = function () {
            introTimers.push(setTimeout(function () {
                if (curtainEl) curtainEl.classList.add('is-out');
                introTimers.push(setTimeout(function () {
                    cancelIntro();                // 收尾：类摘掉、定时器清空 ✓
                }, CURTAIN_OUT_MS));
            }, CURTAIN_HOLD_MS));
        };

        /* ② 黑幕渐入 → ③ 全黑之后（换的话先关上一局）才载入 → ④ 剩下的动画 */
        const curtainIn = function () {
            curtainEl.classList.add('is-in');
            introTimers.push(setTimeout(function () {
                /* ③ 幕布**完全不透明**了 —— 这一刻才动游戏：
                   换的时候先收掉上一局（keepIntro：过场正在演，别把自己掐掉 ✓），
                   然后挂上新的一局 ✓
                   ★ P100b：那条"故意没铺"的详细内容也在这时候才换（幕后换，看不见 ✓）
                   ★ P104：**空卡带**就只做这两步（关旧局 + 铺它的详情页 / md）——
                     不挂游戏 ✓ —— 于是"换成空卡带"和"换成游戏"走的是同一条路 ✓ */
                if (swapping) exitGame(true);         // ★ 关旧局 + 状态退回详情页（exitGame 带状态 ✓）
                applyDeferred();
                if (playable) mountGame(w);           // 游戏在黑幕后面开始载入 ✓
                /* ★★ P101：这条有「游玩注意」→ 就地在黑幕上闪出来（内容已经在
                   renderNotice 里填好了）→ 停 3s → 闪掉 → 再走"剩下的动画" ✓ */
                if (noticeEl && noticeList && noticeList.childNodes.length) {
                    noticeEl.classList.add('is-on');
                    introTimers.push(setTimeout(function () {
                        noticeEl.classList.add('is-out');
                        introTimers.push(setTimeout(curtainRest, NOTICE_OUT_MS));
                    }, NOTICE_HOLD_MS));
                    return;
                }
                curtainRest();
            }, CURTAIN_IN_MS));
        };

        /* ★ 换（不管换成游戏还是空卡带）：直接渐入黑幕（不闪 md、不停顿）✓ */
        if (swapping) { curtainIn(); return; }

        /* ★★ P104：**没在跑游戏** + 空卡带 → 不演黑幕，直接把它的详情页 / md 铺出来 ✓
           （这条路上没有任何"要关的东西"，再演一遍幕布只是白等 1s+ ✗） */
        if (!playable) { applyDeferred(); return; }

        /* ① md 内容闪烁消失（CSS 的 playMdOut 挂在 .play-body.is-starting 上）
           → ①' 再**停 0.4s** 才让黑幕渐入（你 P100 加的停顿） */
        stageEl.classList.add('is-starting');
        introTimers.push(setTimeout(function () {
            introTimers.push(setTimeout(curtainIn, MD_HOLD_MS));
        }, MD_OUT_MS));
    }

    /* ============================================================
       关掉再打开 → 舞台回到干净状态（P81）
       ------------------------------------------------------------
       现象：关掉游乐区再打开，还留着刚才那一条的规格 / 正在跑的游戏。
       复位放在**开门时**而不是关门时：
         · 关门那 450ms 里面板正在滑走，这时换内容看得见；
         · 开门那一刻面板还在屏幕外，复位谁也看不见 —— 滑进来的就是干净的它。
       ============================================================ */
    function resetStage() {
        armedCart = null;                      // ★ P102：那一下"停止运行？"确认也作废 ✓
        stopGame();                            //    （放在前面：stopGame 里会重画一遍蒙版 ✓）
        currentGame = null;
        syncCartFrame();                       // ★ P103：没选中 → 选中框藏起来 ✓
        hideGameToast();
        if (stageEl) stageEl.dataset.state = 'empty';
        setStartVisible(false);
        renderNotice(null);                    // ★ P84：注意那块也跟着收掉
        hideReadme();                          // ★ P91：README 也收掉（下次开门是干净的）
        if (cartsEl) {
            cartsEl.querySelectorAll('.play-cart').forEach(function (b) {
                b.setAttribute('aria-pressed', 'false');
            });
            /* ★★ P97/P98：卡带回到"藏着"的状态、标题卡也收掉 ——
               开门那一刻面板还在屏幕外，所以下一轮滑进来时又是空栏 →
               标题闪一下 → 再逐个冒出来 ✓
               （关门时**不**藏卡带：让它们跟着面板一起滑走，别半路消失 ✗） */
            cartsEl.classList.remove('is-in');
        }
        resetRailTitle();
        cartResets.forEach(function (fn) { fn(); });
    }

    /* ============================================================
       悬停卡带 → 一条**跟着鼠标走**的回执（P75）
       ------------------------------------------------------------
       · 复用 .cursor-toast 的观感 + .is-follow（不淡出、不自己消失）；
       · 位置写 transform（跟随只动合成器属性），并夹回视口内 ——
         尺寸量一次就够（悬停期间文字不变）；
       · 鼠标离开 / 关闭游乐区 / 摘掉元素 —— 不留常驻节点。
       · 键盘聚焦时也显示（摆在卡带右侧，不跟随）—— 这条简述不该只有鼠标能用。
       ============================================================ */
    let toastEl = null;
    let toastSize = { w: 0, h: 0 };
    /* ★ P77b：关门之后、下次开门之前，不再冒回执 ——
       关门那 450ms 里鼠标可能还停在（正在滑走的）卡带上，
       不给这个闸门的话会"补"出一条多余的回执。 */
    let closing = false;

    function placeToast(x, y) {
        if (!toastEl) return;
        const maxX = (window.innerWidth || 0) - toastSize.w - 8;
        const maxY = (window.innerHeight || 0) - toastSize.h - 8;
        const tx = Math.max(8, Math.min(x + 14, maxX));
        const ty = Math.max(8, Math.min(y + 14, maxY));
        toastEl.style.transform = 'translate(' + tx + 'px, ' + ty + 'px)';
    }

    function showGameToast(w, x, y) {
        hideGameToast();
        toastEl = document.createElement('div');
        toastEl.className = 'cursor-toast is-follow';
        toastEl.textContent = w.desc || w.title || w.id;
        document.body.appendChild(toastEl);
        /* 量一次就好（stub 里没有 offsetWidth，兜成 0） */
        toastSize = { w: toastEl.offsetWidth || 0, h: toastEl.offsetHeight || 0 };
        placeToast(x, y);
    }

    function hideGameToast() {
        if (!toastEl) return;
        toastEl.remove();
        toastEl = null;
    }

    function makeCart(w, i) {
        const li = document.createElement('li');
        const btn = document.createElement('button');

        btn.type = 'button';
        btn.className = 'play-cart';
        btn.setAttribute('data-cart', w.id);
        btn.setAttribute('aria-pressed', 'false');
        /* ★★ P97：这张卡带是第几张 —— 用它错开"冒出来"的先后
           （CSS 里 `animation-delay: calc(var(--cart-i) * 90ms)`）✓ */
        if (btn.style && btn.style.setProperty) btn.style.setProperty('--cart-i', String(i || 0));

        const no = document.createElement('span');
        no.className = 'play-cart-no';
        no.textContent = w.no || '--';

        const name = document.createElement('span');
        name.className = 'play-cart-name';
        name.textContent = w.title || w.id;

        /* ★★ P94：卡带图标（路径预留在 works.js 的 icon 字段里）。
           规则（用户定的）：
             · 没写 / 空字符串 → **什么都不加**，这张卡带就是一块纯色（--bg-alt 不透明）✓；
             · 写了 → 以 80% 透明度铺满上下边界（铺法定在 CSS 的 .play-cart-icon）✓；
             · **文件不存在** → 加载失败时把整个 <img> 摘掉 → 又退回纯色 ✓
               （浏览器判"文件在不在"只有这一条路：先设 src，错了才知道 ✗）。
           ★ 顺序：图标先 append，DOM 里排在编号/名字**之前**；CSS 里 z-index: 0、
             文字 z-index: 1 —— 两层保险，别让图标盖住字 ✓。
           ★ 它是装饰：空 alt（读屏器跳过）、draggable=false、
             pointer-events: none（拖拽是卡带自己实现的，见 P80，不能被它截胡）✓ */
        const iconPath = (typeof w.icon === 'string') ? w.icon : '';
        if (iconPath) {
            const icon = document.createElement('img');
            icon.className = 'play-cart-icon';
            icon.setAttribute('alt', '');
            icon.setAttribute('draggable', 'false');
            icon.addEventListener('error', function () {
                icon.remove();                       // 找不到文件 → 退回纯色卡带 ✓
            });
            icon.src = iconPath;
            btn.appendChild(icon);
        }

        btn.appendChild(no);
        btn.appendChild(name);

        /* ============================================================
           ★★ P102：表面那层蒙版（「正在运行…」/「停止运行？」）
           ------------------------------------------------------------
           它是卡带的**最后一个孩子** + CSS 里 z-index: 3 —— 盖住图标 / 编号名字 /
           那层红遮罩 ✓；`pointer-events: none`，所以点击的还是卡带自己 ✓。
           · paint(mode)：'' / 'running' / 'armed' —— 换颜色与文案 ✓
           · flick()：**闪烁消失**（点了"停止运行？"之后，以及别的停止路径）✓
             演完（VEIL_OUT_MS）再把三个类一起收掉 —— 收早了动画会被打断 ✗
           · active()：现在表面有没有蒙版（要不要演"闪掉"用它判断 ✓）
           ============================================================ */
        const veil = document.createElement('span');
        veil.className = 'play-cart-veil';
        veil.setAttribute('aria-hidden', 'true');     // 装饰层（状态另有 aria-pressed ✓）
        const veilText = document.createElement('span');
        veilText.className = 'play-cart-veil-text';
        veil.appendChild(veilText);
        btn.appendChild(veil);

        let veilTimer = 0;
        let veilFlicking = false;

        function paintVeil(mode) {
            /* ★ 正在演"闪掉"的这 400ms 里别去动它 —— 那时状态已经不算数了 ✓ */
            if (veilFlicking) return;
            if (veilTimer) { clearTimeout(veilTimer); veilTimer = 0; }
            btn.classList.remove('is-running', 'is-armed', 'is-veil-out');
            if (!mode) return;
            btn.classList.add(mode === 'armed' ? 'is-armed' : 'is-running');
            veilText.textContent = (mode === 'armed') ? '停止运行？' : '正在运行…';
        }

        function flickVeil() {
            if (!btn.classList.contains('is-running') && !btn.classList.contains('is-armed')) return;
            if (veilTimer) { clearTimeout(veilTimer); veilTimer = 0; }
            veilFlicking = true;
            btn.classList.add('is-veil-out');
            veilTimer = setTimeout(function () {
                veilTimer = 0;
                veilFlicking = false;
                btn.classList.remove('is-running', 'is-armed', 'is-veil-out');
            }, VEIL_OUT_MS);
        }

        cartVeils.push({
            id: w.id,
            paint: paintVeil,
            flick: flickVeil,
            active: function () {
                return veilFlicking || btn.classList.contains('is-running') ||
                    btn.classList.contains('is-armed');
            },
        });

        /* 悬停 / 聚焦 → 回执显示这条游戏的简述（P75） */
        let hovered = false;                 // 鼠标是不是正停在这张卡带上
        let clicked = false;                 // ★ P78：这张卡带刚被点过 —— 回执先收起来
        btn.addEventListener('click', function (e) {
            /* ★★ P80：刚刚拖动过的那一下不算"点选"（浏览器在 pointerup 之后
               还会照常派发一次 click）—— 吃掉它，否则"拖到舞台"会顺带再
               select 一次（虽然结果一样，但状态会跳）。 */
            if (swallowClick) {
                /* ★ P100b：只吞"拖完紧接着"那一下 —— 过时的标志位不算（见 pointerup 的说明）✓ */
                const fresh = Date.now() - swallowAt < 500;
                swallowClick = false;
                if (fresh) { e.preventDefault(); return; }
            }
            /* ★★ P78：**点过之后就把回执收掉，直到鼠标移出这张卡带**。
               理由（你给的）：点一下已经选中了，游戏区里马上就是它的详细内容
               （规格 / 截图 / 玩法 / 碎碎念），鼠标旁边再挂一条简述是多余的。
               移出之后 clicked 归零，再悬停照旧显示。 */
            clicked = true;
            hideGameToast();
            /* ★★ P102：这一局正在跑的那张卡带 → 走"两段式停止"：
               第一下 = 「停止运行？」（只是确认，**还没停** ✓），
               再点一下才真的停（黑幕 → 关游戏 → 渐出 → 露出这条的内容 ✓） */
            if (playingGame === w.id) {
                if (btn.classList.contains('is-armed')) stopRunningGame();
                else armStop(w.id);
                return;
            }
            select(w.id);
        });

        btn.addEventListener('mouseenter', function (e) {
            hovered = true;
            if (closing) return;
            showGameToast(w, e.clientX, e.clientY);
        });
        /* ★★ P77b：鼠标一动 / 一按，都走这个**幂等**入口：
             · 回执还在 → 只挪位置（不重建，所以不会闪）；
             · 回执没了、而鼠标确实还停在这张卡带上 → 就地补回来。
           为什么需要补：点击会给按钮焦点，实测有一条事件链会把跟随回执摘掉
           （P77 之前表现为"向上跳一下"，加了 hovered 判断之后变成"直接没了"）。
           我抓不稳是哪一个事件（stub 里复现不出来），所以把这一步做成自愈 ——
           只要鼠标还在卡带上，下一次移动或按下就一定有回执。
           ★ P78：点击过的那张（clicked）例外 —— 它就是要保持安静。 */
        function ensureToast(x, y, hard) {
            if (closing || !hovered || clicked) return;
            /* 元素被别处删掉时 toastEl 还指着它 —— 靠 isConnected 认出来 */
            if (toastEl && !toastEl.isConnected) toastEl = null;
            /* hard = 鼠标按下：干脆整条重建（连带把任何样式上的怪状态洗掉）。
               同一帧里 remove + append 不会闪 —— 浏览器一帧只画一次。 */
            if (hard || !toastEl) showGameToast(w, x, y);
            else placeToast(x, y);
        }
        btn.addEventListener('mousemove', function (e) { ensureToast(e.clientX, e.clientY, false); });
        /* ★ 按下算一次"我还在"，而且是**硬刷新**：click 之前一定会先 mousedown，
           所以点完之后回执一定在鼠标旁边（不会等下一次移动才回来）。 */
        btn.addEventListener('mousedown', function (e) { ensureToast(e.clientX, e.clientY, true); });
        btn.addEventListener('mouseleave', function () {
            hovered = false;
            clicked = false;                 // ★ P78：移出就复位 —— 再悬停照旧显示
            hideGameToast();
        });
        /* ★★ P77：**鼠标点出来的焦点不许动那条跟随回执** ——
           点击按钮浏览器会给它焦点，而下面 focus 那套是"摆在卡带右上角、不跟随"
           （给键盘用的）。以前两条路都跑，于是鼠标点一下：
           跟随回执被重建成键盘那份（跳到卡带**顶端** = 你看到的"向上闪一下"），
           下一次 mousemove 又把它拉回鼠标旁边。
           用 hovered 区分：鼠标还停在这张卡带上就什么都不做。 */
        btn.addEventListener('focus', function () {
            if (hovered) return;
            const r = btn.getBoundingClientRect ? btn.getBoundingClientRect() : null;
            if (r) showGameToast(w, r.right + 6, r.top);
        });
        btn.addEventListener('blur', function () {
            /* 对称地：鼠标还停着就别摘（比如点了舞台，卡带跟着失焦） */
            if (!hovered) hideGameToast();
        });

        /* 开门时的复位：把这张卡带的悬停 / 点过状态清掉（P102：蒙版也一起清 ✓） */
        cartResets.push(function () {
            hovered = false;
            clicked = false;
            if (veilTimer) { clearTimeout(veilTimer); veilTimer = 0; }
            veilFlicking = false;
            btn.classList.remove('is-running', 'is-armed', 'is-veil-out');
        });

        /* ============================================================
           拖到舞台上启动（P80：自己实现指针拖拽，不再用原生 HTML5 拖放）
           ------------------------------------------------------------
           为什么换掉原生拖放：这个站全局禁着拖拽（`-webkit-user-drag: none`
           会继承 + document 级 dragstart 的 preventDefault），P79 把两处后门
           都开了，鼠标**仍然**拖不动 —— 与其继续猜 UA 的拖拽门槛，不如自己来：
             · 完全不依赖 `draggable` / `-webkit-user-drag` / 原生拖放事件；
             · 鼠标、触屏、触控笔走同一条路（全是 pointer 事件）；
             · 和站里既有手势同一个套路：**用位移阈值区分"点击"和"拖动"**
               （crosshair.js 的 DRAG_MIN 就是这个思路，不用长按）。
           ============================================================ */
        const DRAG_MIN = 6;          // 位移阈值（曼哈顿距离，像素）
        let downAt = null;           // 按下位置（null = 没按着）
        let dragging = false;        // 已越过阈值 = 真的在拖
        let ghost = null;            // 跟着指针的那张"浮起卡带"
        let swallowClick = false;    // 拖完那一下不算"点选"
        let swallowAt = 0;           // ★ P100b：那一下的**时间戳**（只吞紧跟着的，过时不吞）

        /* ============================================================
           ★★ P96：拿起来的手感 —— 延迟跟手 + 轻微上移放大
           ------------------------------------------------------------
           · **延迟跟手**：指针走，卡带在后面追（拖尾），停手就贴上来 ✓。
             公式和 crosshair.js 那四条线**同一套**：
                 k = 1 - Math.pow(1 - EASE, dt)     ← dt 已归一化到 60fps（dt = 1 = 一帧）
             那里 0.10 是刻意的顺滑拖尾（四条线很细，甩得远也好看），圆点 0.8 是"几乎实时"；
             卡带是块 57px 宽的实体，取 **0.24**：明显有拖尾、但不会甩开一个身位 ✓
             （想更黏就调大、想更飘就调小，就这一个数）。
           · **拿起那一下**：轻微上移 + 稍微放大（LIFT_Y / LIFT_SCALE），
             同样走缓动（EASE_LIFT 比跟手快一点 —— 不然像"飘起来"而不是"被拿起"）✓。
           ★ 为什么不用 `World.onFrame`：游乐区一开就 `World.pause()`（P85）——
             而拖动**只发生在游乐区开着的时候**，那个主循环这时候是停的 ✗。
             所以这里自己开一条 rAF，只在拖动期间跑，松手立刻 cancel ✓（不常驻）。
           ============================================================ */
        const EASE_GHOST = 0.24;     // 每帧追上目标的 24%（60fps 基准）
        const EASE_LIFT = 0.32;      // 抬起/放大的推进速度
        const LIFT_Y = -8;           // 拿起来往上抬 8px
        const LIFT_SCALE = 1.06;     // 并放大到 1.06 倍

        let gx = 0, gy = 0;          // 手上那张的**当前**位置（缓动值）
        let tx = 0, ty = 0;          // 目标位置（= 指针）
        let holdX = 20, holdY = 20;  // 指针"抓"在卡带的哪个点上（保持不跳）
        let lift = 0;                // 0 → 1：抬起 / 放大的进度
        let rafId = null, lastFrame = 0;
        let easing = false;          // 这次拖动是"缓动跟手"还是"直贴手"

        function overEl(el, x, y) {
            if (!el || !el.getBoundingClientRect) return false;
            const r = el.getBoundingClientRect();
            return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
        }
        const overStage = (x, y) => overEl(stageEl, x, y);

        /* 唯一一处写 ghost 的 transform —— 位置 + 抬起 + 放大合成一次写完 ✓ */
        function paintGhost() {
            if (!ghost) return;
            const scale = 1 + (LIFT_SCALE - 1) * lift;
            ghost.style.transform = 'translate(' + (gx - holdX).toFixed(1) + 'px, ' +
                (gy - holdY + LIFT_Y * lift).toFixed(1) + 'px) scale(' + scale.toFixed(3) + ')';
        }

        /* 只**记目标** —— 真正动起来交给每帧的缓动（ghostFrame）✓ */
        function moveGhost(x, y) {
            tx = x;
            ty = y;
            /* 没有缓动（降低动效 / 没有 rAF）：直接贴身，抬起也直接到位 ✓ */
            if (!easing) { gx = x; gy = y; lift = 1; paintGhost(); }
        }

        function ghostFrame(now) {
            rafId = null;
            if (!dragging || !ghost) { easing = false; return; }   // 松过手了 → 自己收工 ✓
            const dt = lastFrame ? Math.min((now - lastFrame) / (1000 / 60), 4) : 1;
            lastFrame = now;
            const k = 1 - Math.pow(1 - EASE_GHOST, dt);
            gx += (tx - gx) * k;
            gy += (ty - gy) * k;
            /* 贴得够近就直接吸上去：省掉无限逼近的小数尾巴 ✓ */
            if (Math.abs(tx - gx) < 0.05 && Math.abs(ty - gy) < 0.05) { gx = tx; gy = ty; }
            lift += (1 - lift) * (1 - Math.pow(1 - EASE_LIFT, dt));
            if (lift > 0.995) lift = 1;
            paintGhost();
            rafId = window.requestAnimationFrame(ghostFrame);
        }

        function startGhostLoop() {
            if (rafId || !window.requestAnimationFrame) return;
            easing = true;
            lastFrame = 0;                 // 第一帧 dt = 1（和 World 一样）
            rafId = window.requestAnimationFrame(ghostFrame);
        }

        function stopGhostLoop() {
            easing = false;
            lastFrame = 0;
            if (rafId && window.cancelAnimationFrame) window.cancelAnimationFrame(rafId);
            rafId = null;
        }

        /* 收尾：清影子、清两个提示类。返回"这一下到底拖没拖" */
        function endDrag() {
            stopGhostLoop();                         // ★ P96：缓动循环立刻停（它是按需开的）
            if (ghost && ghost.remove) ghost.remove();
            ghost = null;
            gx = gy = tx = ty = 0;
            lift = 0;
            /* ★ P95：内容回到槽位里（拖动时它是空的） */
            btn.classList.remove('is-taken');
            if (stageEl) stageEl.classList.remove('is-dragging', 'is-drop');
            /* ★ P85：光标回到"抓"（body 上那个类同时管着"游戏层不吃指针"） */
            body.classList.remove('is-cart-dragging');
            const was = dragging;
            dragging = false;
            downAt = null;
            return was;
        }

        function startDrag(e) {
            dragging = true;
            clicked = true;                     // 拖动期间别再贴着鼠标显示简述
            hideGameToast();
            if (stageEl) stageEl.classList.add('is-dragging');
            /* ★ P85：整个面板换"握住"光标。挂在 body 上而不是卡带上 ——
               因为抓住指针之后指针可能已经滑到卡带外面（甚至滑到游戏上），
               那一刻"指针下最深元素"早就不是这张卡带了。 */
            body.classList.add('is-cart-dragging');
            /* 浮起的那张：克隆卡带自己，固定在指针附近。
               ★ 跟随只写 transform（合成器属性）—— 拖动过程中不读布局、不重排。
               ★ 判一下 cloneNode：正常浏览器都有；万一没有（很老的实现 / 复用的桩），
                 就只靠舞台虚线提示 + 空槽位，别让它抛错 ✗。 */
            if (btn.cloneNode) {
                /* ★★ P96：缓动的起点**钉在指针上**（不然它会从上一张卡带的位置飞过来 ✗），
                   并且记住"指针抓在卡带的哪个点"—— 拿起来时卡带不该在手底下跳一下 ✓
                   （原来的写法是硬编码 -20/-20，那是按桩里的假矩形凑的）。 */
                const r = btn.getBoundingClientRect ? btn.getBoundingClientRect() : null;
                holdX = r ? (e.clientX - r.left) : 20;
                holdY = r ? (e.clientY - r.top) : 20;
                gx = tx = e.clientX;
                gy = ty = e.clientY;
                lift = 0;

                ghost = btn.cloneNode(true);
                ghost.classList.add('is-ghost');
                if (r) {
                    ghost.style.width = r.width + 'px';
                    ghost.style.height = r.height + 'px';
                }
                paintGhost();                       // ★ 先摆好"还没抬起"的样子
                document.body.appendChild(ghost);

                /* ★ P96：能动就交给每帧的缓动（延迟跟手 + 拿起那一下都演出来）；
                   降低动效 / 没有 rAF 时 `easing` 保持 false → moveGhost 直接到位 ✓ */
                const reduce = !!(window.matchMedia &&
                    window.matchMedia('(prefers-reduced-motion: reduce)').matches);
                if (reduce) moveGhost(e.clientX, e.clientY);
                else startGhostLoop();
            }
            /* ★★ P95：源卡带变成"空槽位"（内容跟着手上那一张走了）——
               卡带栏里原位只剩一个深色凹槽，看起来就像**被拿下来**了 ✓
               （样子定义在 CSS 的 .play-cart.is-taken）。
               ★★ 顺序要紧：这句必须在**克隆之后** —— 反了的话手上那张也是空的 ✗。
               ★ 用 class 而不是把子元素删掉：内容还在 DOM 里（visibility: hidden），
                 卡带的尺寸一个像素都不变，卡带栏不会跳 ✓。 */
            btn.classList.add('is-taken');
        }

        btn.addEventListener('pointerdown', function (e) {
            if (closing || e.button !== 0) return;
            /* 新手势开始 → 上一份"待吞"作废。
               拖到别处松手时浏览器根本不会派发 click，标志位挂在那儿就会
               把**下一次**点击吞掉（crosshair.js 里那条注释警告的同一个坑）。 */
            swallowClick = false;
            downAt = { x: e.clientX, y: e.clientY };
            /* 抓住指针：拖出卡带之后事件仍然回到这里（松手才收尾） */
            if (btn.setPointerCapture) {
                try { btn.setPointerCapture(e.pointerId); } catch (err) { }
            }
        });

        btn.addEventListener('pointermove', function (e) {
            if (!downAt) return;
            if (!dragging &&
                Math.abs(e.clientX - downAt.x) + Math.abs(e.clientY - downAt.y) >= DRAG_MIN) {
                startDrag(e);
            }
            if (!dragging) return;
            moveGhost(e.clientX, e.clientY);
            if (stageEl) stageEl.classList.toggle('is-drop', overStage(e.clientX, e.clientY));
        });

        btn.addEventListener('pointerup', function (e) {
            if (!downAt) return;
            const wasDrag = endDrag();
            if (btn.releasePointerCapture) {
                try { btn.releasePointerCapture(e.pointerId); } catch (err) { }
            }
            if (!wasDrag) return;               // 没越过阈值 = 交给 click 去选中
            /* ★★ P100b：拖完那一下浏览器**一定会**再派发一次 click ——
               指针被 `setPointerCapture` 抓在这张卡带上，所以**哪怕松手在舞台上**，
               click 的目标仍然是这张卡带 ✓（原来那句"拖到别处不会派发 click"是错的 ✗）。
               不吞掉它，click 会再走一遍 select()：把刚开始的过场按掉
               （`stopGame` + `cancelIntro`）→ 结果就是"只打开了新卡带的 md 页、
               游戏没启动" ✗✗（你报的第二件事就是它）。
               ★ 挂标志位不会误吞正常点击：每次 pointerdown 都会把它清掉 ✓ */
            swallowClick = true;
            swallowAt = Date.now();
            if (overStage(e.clientX, e.clientY)) {
                /* ★ P100：拖到舞台上换卡带时**先别关**上一局（true）——
                   startGame 会在黑幕全黑那一刻收掉它 ✓
                   ★ P100b：内容也先别铺（第三个 true）—— 屏幕上保持上一个卡带的 md，
                   等全黑那一刻再换 ✓ */
                select(w.id, true, true);
                startGame();               // ★ P81：拖到舞台上 = 真的开始（挂 iframe）
            }
        });

        btn.addEventListener('pointercancel', function () { endDrag(); });

        /* 拖到一半按 Esc：整件事作废（和原生拖放的手感对齐） */
        document.addEventListener('keydown', function (e) {
            if (!dragging) return;
            if (e.key === 'Escape' || e.key === 'Esc') endDrag();
        });

        li.appendChild(btn);
        return li;
    }

    if (cartsEl && games.length) {
        games.forEach(function (w, i) { cartsEl.appendChild(makeCart(w, i)); });
        /* ★ P75：**默认不选任何一张** —— 舞台停在 empty 状态，
           显示那句"从左侧卡带栏拖动游戏到此处启动游戏"。
           （原来这里会 select(games[0].id)，一打开就是第一张的规格。） */
    } else if (cartsEl) {
        /* 这句是字符串字面量、会被收进字体子集，所以写成 ASCII */
        console.warn('[PlaySidebar] WORKS has no kind === "unity" entry -- rail stays empty');
    }

    /* ★ P80：舞台这一侧**不再需要任何监听** —— 指针拖拽是自己算坐标的
       （overStage() 直接读 stageEl 的 rect），不像原生拖放那样要 dragover /
       dragleave / drop 三个回调配合。
       原来那三个（P78 加的）已经删掉：它们只服务于原生拖放，留着反而会
       让"从浏览器外面拖文件进来"落在舞台上（现在那件事回到浏览器默认行为）。 */

    function setExpanded(on) {
        triggers.forEach(function (t) {
            t.setAttribute('aria-expanded', on ? 'true' : 'false');
        });
    }

    /* ============================================================
       ★★ P97/P98：卡带的登场（滑到位 → 标题卡闪一下 → 卡带逐个冒出来）
       ------------------------------------------------------------
       完整时序（你说的时间点）：
         1. 面板**滑到位**（那条 `left` 过渡跑完，或 SLIDE_MS 兜底到点）；
         2. 「游戏卡带」四个字**闪烁出现**（CSS 的 railTitleFlicker，520ms）；
         3. 亮着不动 **1s**（TITLE_HOLD_MS）；
         4. **开始渐隐**（CSS 的 railTitleOut，400ms）；
         5. 渐隐开始 **0.25s** 之后（CART_AFTER_FADE_MS）→ 卡带逐个冒出来
            （CSS 的 cartPop，逐张再错开 90ms）✓。
       · 藏：`.play-carts .play-cart { opacity: 0 }`（CSS）——
         复位放在**开门时**（resetStage 里），关门时不藏，让面板带着卡带一起滑走 ✓。
       · ★ 兜底：过渡**可能不发生**（降低动效时 `transition: none`、面板本来就在
         位置上、浏览器没派发事件……）—— 那样第 1 步永远到不了，卡带就永远藏着 ✗。
         所以有一条 `SLIDE_MS + 80ms` 的定时器兜着，谁先到算谁 ✓。
       · ★ 降低动效：整套过场都不演（标题卡不出现、卡带立刻可见）✓。
       ============================================================ */
    const SLIDE_MS = 450;            // ★ 必须和 CSS 的 --sidebar-dur 一致（自检比着它对）
    const TITLE_HOLD_MS = 1000;      // 「游戏卡带」亮着的时间
    const CART_AFTER_FADE_MS = 250;  // 开始渐隐之后多久才让卡带冒
    let revealTimer = 0;             // 兜底：等面板滑完
    let titleTimer = 0;              // 标题亮着 1s
    let cartTimer = 0;               // 渐隐开始后 0.25s
    let revealEnd = null;

    function cancelReveal() {
        if (revealTimer) { clearTimeout(revealTimer); revealTimer = 0; }
        if (titleTimer) { clearTimeout(titleTimer); titleTimer = 0; }
        if (cartTimer) { clearTimeout(cartTimer); cartTimer = 0; }
        if (revealEnd && aside.removeEventListener) aside.removeEventListener('transitionend', revealEnd);
        revealEnd = null;
    }

    /* 标题卡回到"藏着"（只摘类：动画一撤，它自己就回到 opacity: 0 / visibility: hidden） */
    function resetRailTitle() {
        if (railTitle) railTitle.classList.remove('is-in', 'is-out');
    }

    function revealCarts() {
        cancelReveal();
        if (!cartsEl) return;
        const reduce = !!(window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        /* 过场：标题卡闪出来 → 停 1s → 开始渐隐 → 渐隐 0.25s 后卡带才冒 ✓ */
        const intro = function () {
            cancelReveal();
            if (railTitle) railTitle.classList.add('is-in');          // 2) 闪烁出现
            titleTimer = setTimeout(function () {
                titleTimer = 0;
                if (railTitle) railTitle.classList.add('is-out');     // 4) 开始渐隐
                cartTimer = setTimeout(function () {                  // 5) 卡带登场
                    cartTimer = 0;
                    cartsEl.classList.add('is-in');
                }, CART_AFTER_FADE_MS);
            }, TITLE_HOLD_MS);
        };
        /* 降低动效 / 没有标题卡：过场不演，卡带直接可见 ✓（CSS 那边标题也不出现） */
        if (reduce || !aside.addEventListener || !railTitle) { cartsEl.classList.add('is-in'); return; }

        revealEnd = function (e) {
            /* 只认那条 `left` 的过渡 —— 面板上还挂着 visibility 那一条 ✓ */
            if (e && e.propertyName && e.propertyName !== 'left') return;
            intro();
        };
        aside.addEventListener('transitionend', revealEnd);
        revealTimer = setTimeout(function () { revealEnd = null; intro(); }, SLIDE_MS + 80);
    }

    function open(from) {
        if (isOpen || isLocked()) return;
        isOpen = true;
        closing = false;              // ★ P77b：开门了，回执重新允许出现
        lastTrigger = from || null;

        /* ★★ P81：先把舞台复位再滑进来 —— 面板这会儿还在屏幕外，
           复位谁也看不见；不然关掉再打开还留着上一轮的内容。 */
        resetStage();

        body.classList.add('sidebar-open');
        aside.setAttribute('aria-hidden', 'false');
        setExpanded(true);

        /* ★★ P97：卡带**等面板滑到位**才逐个冒出来（滑的过程中那栏是空的）✓ */
        revealCarts();

        /* 焦点进游乐区 —— 否则键盘用户还停在那个已经飞出屏幕的按钮上 */
        if (closeBtn) closeBtn.focus();

        if (window.World && World.pause) World.pause();

        /* 刻度时钟按登场动画的**反向**闪烁消失（P65）——
           反向那一份在 js/circle-parallax.js 里（WAAPI 的 direction: 'reverse'），
           这里只负责喊一声。 */
        if (window.CircleReveal && CircleReveal.hide) CircleReveal.hide();

        /* ★ 四角刻线往外飞走（P67）这里一行都不用写：它现在是**纯 CSS** 的 ——
           body.sidebar-open 一挂上，四块刻线各自朝屏幕的四角飞出去
           （见 style.css 里 .df-corner 那一段，位移直接用刻线框自己的四个内缩量算）。 */
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;

        body.classList.remove('sidebar-open');
        aside.setAttribute('aria-hidden', 'true');
        setExpanded(false);

        /* ★ preventScroll：这一刻 main 正往外飞（margin-left 还在过渡），
           不带这个参数的话浏览器会为了"让焦点可见"去动 main 的横向滚动 ——
           关掉再打开时那条滚动位置就悄悄变了。 */
        if (lastTrigger && lastTrigger.focus) {
            try { lastTrigger.focus({ preventScroll: true }); }
            catch (e) { lastTrigger.focus(); }
        }
        lastTrigger = null;

        if (window.World && World.resume) World.resume();

        /* 按它消失的方式返回：同一条登场动画正向再放一遍
           （新 Animation 排在旧动画之后，一定真的演；见 circle-parallax.js） */
        if (window.CircleReveal && CircleReveal.show) CircleReveal.show();

        /* ★ P75：鼠标可能还停在卡带上（比如用 Esc 关的）——
           那条跟随回执要跟着游乐区一起收掉，不留常驻节点。
           ★ P77b：同时把 closing 立起来 —— 关门这段路上别再补回执。
           ★ P81：顺手把跑着的游戏卸掉（拔 iframe → 释放 WebGL 上下文）。
             状态**先不改**：面板正在滑走，把舞台换回规格会看得出来；
             回到 empty 交给 resetStage()，下次开门那一刻做。 */
        hideGameToast();
        closing = true;
        /* ★ P97/P98：关门时取消"待演"的登场（面板上那条 left 过渡反向也会派发
           transitionend —— 不取消的话卡带会在滑走途中冒出来 ✗），
           标题卡也一起收掉（它是过场，不该跟着面板滑出去时还亮着 ✓）。
           注意卡带的 is-in **不**摘：它们要跟着面板一起滑走 ✓ */
        cancelReveal();
        resetRailTitle();
        /* iframe 已经拔掉了，留一个空舞台反而像坏了 —— 退回 game 态
           （面板滑走时显示这条游戏的详情，等于说"你离开了游戏"）。 */
        exitGame();
    }

    function toggle(from) {
        if (isOpen) close();
        else open(from);
    }

    triggers.forEach(function (t) {
        t.addEventListener('click', function (e) {
            e.preventDefault();
            toggle(t);
        });
    });

    if (closeBtn) closeBtn.addEventListener('click', function () { close(); });

    /* 「开始游戏」：点击选中的那条路也要能开（和"拖到舞台上"同一件事） */
    if (startBtn) startBtn.addEventListener('click', function () { startGame(); });

    document.addEventListener('keydown', function (e) {
        if (!isOpen) return;
        if (e.key === 'Escape' || e.key === 'Esc') {
            e.preventDefault();
            close();
        }
    });

    return {
        open: open,
        close: close,
        toggle: toggle,
        select: select,                       // 下一轮挂游戏时用得上
        get games() { return games.map(function (w) { return w.id; }); },
        get current() { return currentGame; },
        get isOpen() { return isOpen; },
    };
})();
