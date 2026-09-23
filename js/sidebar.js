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

        noticeList.replaceChildren();
        if (!lines.length) {                    // 没开 / 没写 → 整块不出现
            noticeEl.hidden = true;
            return;
        }
        lines.forEach(function (s) {
            const li = document.createElement('li');
            li.className = 'play-notice-item';
            li.textContent = String(s);
            noticeList.appendChild(li);
        });
        noticeEl.hidden = false;
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
    function select(id) {
        const w = games.filter(function (g) { return g.id === id; })[0];
        if (!w) return;

        /* ★★ P81：换一条就先卸掉正在跑的那套（WebGL 上下文只能留一个 ——
           两套一起留着会吃显存、还会掉帧）。同一条则不打断它。 */
        if (playingGame && playingGame !== id) stopGame();
        currentGame = id;

        if (cartsEl) {
            cartsEl.querySelectorAll('.play-cart').forEach(function (btn) {
                btn.setAttribute('aria-pressed',
                    btn.getAttribute('data-cart') === id ? 'true' : 'false');
            });
        }

        /* 正在跑的就是这一条 → 停在 play；否则退回 game（显示规格 + 「开始游戏」） */
        if (stageEl) stageEl.dataset.state = (playingGame === id) ? 'play' : 'game';
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
         · 于是展开时藏掉 logo / 导航链接 / 主题键，显示这一组 ✓；
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

    function toggleFullscreen() {
        const doc = document;
        const fsEl = doc.fullscreenElement || doc.webkitFullscreenElement;
        if (fsEl) {
            const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
            if (exit) { try { const p = exit.call(doc); if (p && p.catch) p.catch(function () { }); } catch (err) { } }
            return;
        }
        const frame = currentFrame();
        if (!frame) return;
        const req = frame.requestFullscreen || frame.webkitRequestFullscreen;
        if (!req) return;
        try {
            const p = req.call(frame);
            if (p && p.catch) p.catch(function () { });
        } catch (err) { /* 没手势 / 被拒：什么也不做 */ }
    }

    /* 两个开关按钮的状态始终反映**现实**（全屏可能是按 Esc 退的，我们得跟上） */
    function syncControls() {
        if (ctlMute) {
            ctlMute.disabled = !playingGame;
            ctlMute.setAttribute('aria-pressed', (playingGame && gameMuted) ? 'true' : 'false');
        }
        if (ctlFull) {
            ctlFull.disabled = !playingGame;
            ctlFull.setAttribute('aria-pressed',
                (document.fullscreenElement || document.webkitFullscreenElement) ? 'true' : 'false');
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

    function stopGame() {
        /* ★★ P93：退全屏要在**拔 iframe 之前**判 —— replaceChildren() 一跑，
           那个元素的 parentElement 就断了，contains() 再也认不出"正全屏的就是这一局" ✗
           （浏览器其实也会因为全屏元素被摘而自己退，但那一下不是我们能等的：
             状态得当场同步，不然按钮会挂着"全屏中"）。 */
        const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        if (fsEl && playStage && (fsEl === playStage || playStage.contains(fsEl))) {
            const exit = document.exitFullscreen || document.webkitExitFullscreen;
            if (exit) { try { const p = exit.call(document); if (p && p.catch) p.catch(function () { }); } catch (err) { } }
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
    }

    /* 退出游戏 = 卸掉它 + 退回这条游戏的详情页。
       （iframe 已经拔掉，留一个空舞台反而像坏了。） */
    function exitGame() {
        stopGame();
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

    function startGame() {
        if (!playStage || !currentGame) return;

        const w = games.filter(function (g) { return g.id === currentGame; })[0];
        if (!hasPlayableSrc(w)) {
            refreshStartButton(w);
            return;
        }

        if (playingGame === w.id) return;             // 已经在跑这一套了
        stopGame();

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
        stopGame();
        currentGame = null;
        hideGameToast();
        if (stageEl) stageEl.dataset.state = 'empty';
        setStartVisible(false);
        renderNotice(null);                    // ★ P84：注意那块也跟着收掉
        hideReadme();                          // ★ P91：README 也收掉（下次开门是干净的）
        if (cartsEl) {
            cartsEl.querySelectorAll('.play-cart').forEach(function (b) {
                b.setAttribute('aria-pressed', 'false');
            });
        }
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

    function makeCart(w) {
        const li = document.createElement('li');
        const btn = document.createElement('button');

        btn.type = 'button';
        btn.className = 'play-cart';
        btn.setAttribute('data-cart', w.id);
        btn.setAttribute('aria-pressed', 'false');

        const no = document.createElement('span');
        no.className = 'play-cart-no';
        no.textContent = w.no || '--';

        const name = document.createElement('span');
        name.className = 'play-cart-name';
        name.textContent = w.title || w.id;

        btn.appendChild(no);
        btn.appendChild(name);

        /* 悬停 / 聚焦 → 回执显示这条游戏的简述（P75） */
        let hovered = false;                 // 鼠标是不是正停在这张卡带上
        let clicked = false;                 // ★ P78：这张卡带刚被点过 —— 回执先收起来
        btn.addEventListener('click', function (e) {
            /* ★★ P80：刚刚拖动过的那一下不算"点选"（浏览器在 pointerup 之后
               还会照常派发一次 click）—— 吃掉它，否则"拖到舞台"会顺带再
               select 一次（虽然结果一样，但状态会跳）。 */
            if (swallowClick) { swallowClick = false; e.preventDefault(); return; }
            /* ★★ P78：**点过之后就把回执收掉，直到鼠标移出这张卡带**。
               理由（你给的）：点一下已经选中了，游戏区里马上就是它的详细内容
               （规格 / 截图 / 玩法 / 碎碎念），鼠标旁边再挂一条简述是多余的。
               移出之后 clicked 归零，再悬停照旧显示。 */
            clicked = true;
            hideGameToast();
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

        /* 开门时的复位：把这张卡带的悬停 / 点过状态清掉 */
        cartResets.push(function () {
            hovered = false;
            clicked = false;
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

        function overEl(el, x, y) {
            if (!el || !el.getBoundingClientRect) return false;
            const r = el.getBoundingClientRect();
            return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
        }
        const overStage = (x, y) => overEl(stageEl, x, y);

        function moveGhost(x, y) {
            if (ghost) ghost.style.transform = 'translate(' + (x - 20) + 'px, ' + (y - 20) + 'px)';
        }

        /* 收尾：清影子、清两个提示类。返回"这一下到底拖没拖" */
        function endDrag() {
            if (ghost && ghost.remove) ghost.remove();
            ghost = null;
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
               ★ 桩里没有 cloneNode，所以这里要判一下（有就建，没有就只靠舞台高亮）。 */
            if (btn.cloneNode) {
                ghost = btn.cloneNode(true);
                ghost.classList.add('is-ghost');
                const r = btn.getBoundingClientRect ? btn.getBoundingClientRect() : null;
                if (r) {
                    ghost.style.width = r.width + 'px';
                    ghost.style.height = r.height + 'px';
                }
                document.body.appendChild(ghost);
                moveGhost(e.clientX, e.clientY);
            }
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
            /* ★★ 只有"松手还在卡带上"才会有紧随其后的一次 click 要吞；
               拖到别处（例如舞台上）松手，浏览器不会派发 click ——
               那时把标志位挂住就会吞掉**下一次**点击。 */
            /* ★★ 只有"松手还在卡带上"才会有紧随其后的一次 click 要吞；
               拖到别处（例如舞台上）松手，浏览器不会派发 click ——
               那时把标志位挂住就会吞掉**下一次**点击。 */
            swallowClick = overEl(btn, e.clientX, e.clientY);
            if (overStage(e.clientX, e.clientY)) {
                select(w.id);
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
        games.forEach(function (w) { cartsEl.appendChild(makeCart(w)); });
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
