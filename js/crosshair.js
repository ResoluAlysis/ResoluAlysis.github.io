/* ============================================================
   十字准星光标：**四条线**（P31）+ 展开时的吸边（P32 从 main.js 拆出来）
   ------------------------------------------------------------
   两条垂直（v1 左 / v2 右）+ 两条水平（h1 上 / h2 下）。
   四条共用同一份跟随缓动（EASE）和同一批动画参数
   （--t-cross-dur / --crosshair-h-scale / --crosshair-v-scale）。

     · 平时：四条都收在鼠标处（x1 = x2 = mx，y1 = y2 = my）。
       线是 100vw/100vh 的元素被 scale 收成 1px 的，四条叠在一起
       看起来和原来那个单十字**完全一样** —— 这一步没有视觉回归。
     · 悬停大块：两条垂直吸到它的左右边缘、两条水平吸到它的上下边缘，
       四条围成一个框（见下面的 SNAP_SEL），同时给 <body> 挂上
       `crosshair-snap` —— 尺子上的半透明红带和读数变色都靠这个类
       （见 style.css 的 .ruler-band / body.crosshair-snap .ruler-read）。
     · 开屏收缩：一对（h1 + v1）落到屏幕**左上角**，另一对（h2 + v2）
       落到**右下角** —— 也就是每条线收到自己那一侧的屏幕边，
       见下面的 MutationObserver（P34 把第二对从左下角改成了右下角）。

   位置一律写 transform-origin：线是满屏元素，改 origin 只影响这条线
   自己的收起方向，不触发布局；而 transform 那条（scaleY/scaleX）
   是共用的、由 CSS 的 .crosshair-active 驱动。

   为什么单独一个文件：它跟开屏状态机（main.js）没有任何耦合，
   只是一套"跟随 + 吸边"的指针逻辑，订阅方向也是它单方面往外推
   （window.onCrosshair，rulers.js 消费）。拆出来后 main.js 从
   678 行降到 ~450 行。
   ============================================================ */
'use strict';

/* 旧接口：外面可能只读引用（rulers.js 的兜底轮询就读它） */
window.crosshairPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

(function () {
    /* ★ 顺序有意义：[0] 是 x1 / y1（左 / 上），[1] 是 x2 / y2（右 / 下）。
       拿不到整整两条就整套不启用 —— 免得 index.html 没同步改时
       只剩一半的线在跑。 */
    const hs = document.querySelectorAll(".crosshair-h");
    const vs = document.querySelectorAll(".crosshair-v");
    if (hs.length !== 2 || vs.length !== 2) return;
    const [h1, h2] = hs;
    const [v1, v2] = vs;

    /* 拖框时框内那层极淡的主题红（P41），和"等确认"时框中央那行提示（P42）。
       ★ 它们是**装饰**，所以故意不参与上面那个"结构不对就整套不启用"的守卫 ——
         少一个 div 不该让准星整个消失。代码里到处 `if (fillEl)` / `if (hintEl)`。 */
    const fillEl = document.querySelector(".crosshair-fill");
    const hintEl = document.querySelector(".crosshair-hint");

    /* 吸边只认这些"大块"。导航链接那种小目标不吸 ——
       鼠标划过导航栏时四条线会不停抽动，很吵。 */
    const SNAP_SEL = ".card, .media-panel, .btn";
    /* 变色的那套比吸边宽：导航链接也会变色（这是原来就有的行为，别收窄） */
    const HOVER_SEL = "a, button, .btn, .card, [role='button']";
    /* ★ 悬停态改由 **`.is-hot` 类**驱动的那些元素（见下面 setLiveHot）。
       为什么不是 `:hover`：页面从光标底下横向滚过去时，浏览器不保证更新
       `:hover` —— 先移鼠标进去、再滚轮把它滚走，`:hover` 会**卡住**，
       元素一直亮着。而这个类由我们自己的命中测试挂/摘，能可靠清掉。
       ★ 只列 `main` 里、会随页面滚走的那些；固定的导航栏不在此列
         （那边 `:hover` 是准的，没必要多绕一层 JS）。 */
    const LIVE_HOVER_SEL = ".media-panel, .btn, .hero h1, .card, .ak-card, #about .container";

    /* ----- 动态线宽：保证物理 1px ----- */
    function updateScale() {
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        const root = document.documentElement;
        root.style.setProperty("--crosshair-h-scale", 1 / vh);
        root.style.setProperty("--crosshair-v-scale", 1 / vw);
    }
    if (window.World) {
        World.onLayout(updateScale);            // 注册时立刻跑一次
    } else {
        updateScale();
        window.addEventListener("resize", updateScale);
    }

    /* ----- 缓动跟随参数 -----
       EASE = 60fps 基准下每帧的追赶比例。
         0.10 = 平时的手感（约 0.17s 才追到 63%，是刻意的顺滑拖尾）
         1    = 完全实时，准星直接钉在鼠标上、不再缓动
       ★ 四条线、"吸"到元素边缘的过程、以及订阅出去的尺子三角和红带，
         全部共用这一个值 —— 所以它们永远同步，不会互相拖尾。
         想让整套都实时，把 0.10 改成 1 就行。

       ★ P33/P34：**吸附期间换成一个直接写死的数**（就在下面那行）。
         吸住元素时目标不再是鼠标、而是元素的四条边，"飞过去"这一段
         用快系数更干脆。
         ★ 这是**手调量，随便改** —— 唯一的下限是"比 EASE 快"、
           上限是 1（见下）。参考量级：0.4 约 7 帧、0.6 约 5 帧、
           0.75 约 4 帧、0.9 约 3 帧（60fps 下）。
         ★★ 上限是 1：系数 ≥ 1 时 k = 1-(1-ease)^dt 会 ≥ 1，
           每帧过冲、来回震荡。要再快只能往 1 靠，不能超。
           （check.js 有一条断言专门挡这个；它**不**限制具体取值，
             只挡住"≥1 会震荡"这条数学事实 —— 调参不该被断言拦住。）
         离开元素时 snapEl 已经清空，所以"收回来"那一段仍是 EASE ——
         这是"吸附期间"的字面意思；想让来回对称，把 step() 里那个
         三元判断去掉、只用 EASE_SNAP 就行。 */
    const EASE = 0.10;
    const EASE_SNAP = 0.4;
    /* ★ P41：拖框的系数。
       ★ 为什么不干脆"零缓动"：平时跟鼠标用的是 EASE = 0.10，
         也就是四条线**一直在光标后面拖一截**。拖框一开始如果直接
         精确落位，那一下就是把这段拖尾一次性补上 —— 看起来就是"跳"。
         0.8 几乎实时（约 2 帧到位）但会把那一跳抹平。
       ★ 这也让"仪器不能有延迟"和"手感不能抖"两件事各让一步：
         真正需要零延迟的是**锁死之后**（元素自己会动），
         拖框是手在动，留一点点缓动反而更顺。 */
    const EASE_DRAG = 0.5;

    /* ★★ P39：判定"已经完全吸住"的距离阈值（px）。
       到了这个距离就**彻底关掉缓动**（走 snapToTargets，同步精确落位），
       而不是把系数调成 1 —— 因为系数 1 只是让插值一步到位，
       真正的延迟来自"要等一个 rAF 才 apply"，那一帧躲不掉。
       10px 是你要的量级；想在"更快锁上"和"落位那一下更不跳"之间挪，
       改这一个数就行（越小越晚锁、落位越平滑；越大越早锁、延迟越小）。 */
    const LOCK_EPS = 10;

    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    /* 四个位置。带 t 前缀的是"目标"，不带的是当前值（每帧朝目标缓动）。
       x1/x2 给两条垂直线，y1/y2 给两条水平线。 */
    let x1 = mx, x2 = mx, y1 = my, y2 = my;
    let tx1 = x1, tx2 = x2, ty1 = y1, ty2 = y2;
    let rafId = null;
    let lastCrossTime = 0;

    /* ----- 准星位置订阅（供尺子三角 / 红带 / 读数零延迟跟随）-----
       ★ 为什么不能让跟随者去 World.onFrame 里轮询 window.crosshairPos：
         准星跑在自己的 rAF 回调里，World 是另一个 rAF 回调；
         同一帧里谁先执行由注册顺序决定。如果 World 先跑，跟随者读到的
         就是上一帧的位置 —— 静止时看不出来，但鼠标快速移动时这个
         「一帧错位」会按速度放大成肉眼可见的拖尾。
         改成由准星更新后直接推送，顺序问题就不存在了。
       ★ P31：签名从 (x, y) 变成 (x1, x2, y1, y2)，因为现在有四条线。 */
    const posSubs = new Set();

    window.onCrosshair = function (fn) {
        posSubs.add(fn);
        fn(x1, x2, y1, y2);                          // 注册时先同步一次
        return function () { posSubs.delete(fn); };
    };

    function apply() {
        v1.style.transformOrigin = `${x1}px 0`;
        v2.style.transformOrigin = `${x2}px 0`;
        h1.style.transformOrigin = `0 ${y1}px`;
        h2.style.transformOrigin = `0 ${y2}px`;

        /* 框内那层淡红：和红带同一种做法 —— CSS 里写死 100vw×100vh，
           这里只写"挪到左上角 + 缩到框那么大"（transform-origin: 0 0）。
           ★ 条件里必须带上 pending：松手之后框还在，红框也得跟着
             （而且 enterPending 里钉死位置那一下正是靠这次 apply 落地的）。
           ★ 只在有框时更新：平时它是透明的，写了也是白写。 */
        if ((dragging || pending) && fillEl) {
            const vw = window.innerWidth || 1;
            const vh = window.innerHeight || 1;
            fillEl.style.transform =
                `translate(${x1.toFixed(2)}px, ${y1.toFixed(2)}px) ` +
                `scale(${((x2 - x1) / vw).toFixed(6)}, ${((y2 - y1) / vh).toFixed(6)})`;
        }

        /* 保留旧接口（外面可能只是只读引用）。
           x/y 取"左上那一对"；四条都想要的话用 x2 / y2。 */
        if (window.crosshairPos) {
            window.crosshairPos.x = x1;
            window.crosshairPos.y = y1;
            window.crosshairPos.x2 = x2;
            window.crosshairPos.y2 = y2;
        }
        // ★ 同一帧内推送给订阅者，零延迟
        for (const fn of posSubs) fn(x1, x2, y1, y2);
    }

    function step(now) {
        /* ★ 按 dt 归一化，否则高刷屏上准星会比 60Hz 跟得更紧 */
        const dt = lastCrossTime ? Math.min((now - lastCrossTime) / (1000 / 60), 4) : 1;
        lastCrossTime = now;
        /* ★ 这个函数只在**还在动画里**的时候跑（locked 之后不再进这里，
           见 settle()）。系数按状态分三档：拖框最跟手、吸附次之、平时最松。 */
        const ease = dragging ? EASE_DRAG : (snapEl ? EASE_SNAP : EASE);
        const k = 1 - Math.pow(1 - ease, dt);

        x1 += (tx1 - x1) * k;
        x2 += (tx2 - x2) * k;
        y1 += (ty1 - y1) * k;
        y2 += (ty2 - y2) * k;

        const far = Math.max(
            Math.abs(tx1 - x1), Math.abs(tx2 - x2),
            Math.abs(ty1 - y1), Math.abs(ty2 - y2));

        /* ★★ P39：够近就算"已经完全吸住" —— 然后**整个缓动机制退役**。
           为什么阈值不是 0.1px：那要等缓动尾巴几乎走完才锁上，
           而那段尾巴正是肉眼能看到的那点延迟。
           LOCK_EPS（10px）以内直接认作到位，精确落位、之后不再有任何插值。
           代价是最多 10px 的一下"落位"，相对于它换来的零延迟可以忽略。 */
        if (snapEl && far < LOCK_EPS) {
            locked = true;
            snapToTargets();            // 精确落位（里面会 apply）
            rafId = null;
            return;
        }

        /* 没吸着时的正常收敛 */
        if (far < 0.1) {
            x1 = tx1; x2 = tx2; y1 = ty1; y2 = ty2;
            apply();
            rafId = null;
            return;
        }

        apply();
        rafId = requestAnimationFrame(step);
    }

    /* 叫醒缓动循环。已经在跑就什么都不做（不重开 rAF） */
    function wake() {
        if (rafId === null) { lastCrossTime = 0; rafId = requestAnimationFrame(step); }
    }

    /* ★★ 锁死状态的落位：**没有缓动、没有 rAF、没有插值**，
       直接把四条线放到目标上。
       相同就不写 DOM —— 锁死期间鼠标每动一下都会走到这里，
       位置没变时不该白写四个 transform-origin。 */
    function snapToTargets() {
        if (x1 === tx1 && x2 === tx2 && y1 === ty1 && y2 === ty2) return;
        x1 = tx1; x2 = tx2; y1 = ty1; y2 = ty2;
        apply();
    }

    /* 目标变了之后的**唯一出口**：
       完全吸住（locked）→ 同步精确落位，不给缓动留任何机会
       其余（含拖框）→ 走缓动循环；拖框时系数是 EASE_DRAG（见那里的说明）
       所有改目标的地方都调这个，别直接调 wake()。 */
    function settle() {
        if (locked) { snapToTargets(); return; }
        wake();
    }

    /* ----- 目标从哪来：鼠标，或者吸住的那个大块 ----- */
    let snapEl = null;
    let snapRect = null;      // 吸住那一刻量的四边
    let snapScrollX = 0;      // 量上面那个 rect 时的 scrollX（**实时**读的，见 liveScrollX）
    let locked = false;       // 是否已经"完全吸住"（见 step 里的 LOCK_EPS）

    /* ----- 框选量取的状态（P40）----- */
    /* ★ 位移阈值，不是时间阈值。用长按判定会给"单击打开作品"加延迟和误触；
       判"松开时移动了多少"则零延迟 —— 这也是所有画图工具的分法。 */
    const DRAG_MIN = 4;             // px（曼哈顿距离）
    let pressing = false;           // 左键按下中（还没决定是单击还是拖框）
    let dragging = false;           // 正在拖
    let pending = false;            // 框画好了、等确认（左键=确认 / 右键=取消）
    let pressX = 0, pressY = 0;     // 按下点（viewport 坐标）
    let dragX0 = 0, dragY0 = 0;     // 框的起点（viewport 坐标）

    /* ★★ "仪器正在读一个跨度"这件事只有一个出口：吸住某个元素，或者屏幕上有个框。
       CSS 那边（红带 / 读数让开变色）只认 crosshair-measuring 这一个类 ——
       免得以后两边各写一半。
       ★ crosshair-box 是**只在有框时**才要的（框内那层极淡的主题红）。
       ★ 框有两种状态：正在拖（dragging）、拖完等确认（pending）。
         两者都算"有框"，但只有前者是"手在动"—— 所以是两个类。 */
    function syncMeasuring() {
        document.body.classList.toggle("crosshair-measuring", !!(snapEl || dragging || pending));
        document.body.classList.toggle("crosshair-box", !!(dragging || pending));
    }

    function targetFromMouse() {
        tx1 = mx; tx2 = mx; ty1 = my; ty2 = my;
    }

    /* ★★ 要读**实时**的 scrollLeft，不能用 `World.scrollX`。
       `World.scrollX` 是 world.js 在**它自己的 rAF 里**刷新的缓存值
       （见 world.js 的 syncScroll），而 `getBoundingClientRect()` 反映的是
       浏览器**当下**的滚动位置。这两个可能差一帧的滚动量。

       为什么这会造成偏移：`snapRect` 是在某个滚动位置量下来的，之后每次
       只剩「滚了多少」这个差值。如果记下的基准 scrollX 是旧的（差了 δ），
       那之后算出来的 dx 就整体偏 δ —— **δ 正比于滚动速度**。
       于是表现就是"滚轮把元素送进光标下时，吸附向着滚动方向偏一点点，
       滚得越快偏得越多"。修法就是让基准和 rect 在同一时刻、从同一个源头读。 */
    function liveScrollX() {
        return (window.World && World.main) ? World.main.scrollLeft : 0;
    }

    /* dx 由调用方给，见 setSnap / World.onScroll 两处的说明。 */
    function targetFromSnap(dx) {
        /* ★ 不每帧重读 getBoundingClientRect —— 那是一次强制布局，
           而这个项目到处都在避免它。页面只有**横向**滚动，元素跟着
           scrollX 整体平移，所以用差值算就够了。 */
        tx1 = snapRect.left - dx;
        tx2 = snapRect.right - dx;
        ty1 = snapRect.top;
        ty2 = snapRect.bottom;
    }

    /* 把"某个元素的四边"记成基准。
       ★★ rect 和"量 rect 时的滚动位置"必须**同一时刻**取，
       否则之后每帧的差值都偏一个 δ（δ 正比于滚动速度）—— 见 liveScrollX。
       ★ 这里**不碰** locked：锁死状态由调用方决定（换元素要解锁，
       单纯重新量尺寸不用）。 */
    function anchor(el) {
        snapRect = el.getBoundingClientRect();
        snapScrollX = liveScrollX();
        targetFromSnap(0);
    }

    /* ★ 吸边的**唯一**入口：目标 + class 一起在这一处改。
       `.crosshair-snap` 是给尺子那边用的（红带淡入、读数让开并变色）——
       所有"我到底有没有吸着"的判断都收敛到这个函数，
       免得以后有人只改了 snapEl 却忘了摘 class。 */
    function setSnap(el) {
        if (el === snapEl) return;
        snapEl = el;
        syncMeasuring();
        /* ★ 换元素 / 松手 → 解除锁死，先按 EASE_SNAP 动画飞过去，
           到位之后 step() 会再把它锁上。 */
        locked = false;

        if (el) {
            anchor(el);
        } else {
            snapRect = null;
            targetFromMouse();
        }
        settle();
    }

    /* ----- 悬停 / 吸边的状态判定 -----
       ★★ 这是"状态为什么会变陈"的根源，改动前想清楚：

       `mouseover` **只在鼠标移动到新元素上时触发**。页面在光标底下滚过去
       （鼠标不动、只滚滚轮）时，浏览器**不会**补发 mouseover ——
       于是"可交互对象已经滚走了，鼠标下面换成了别的东西"这件事没人知道，
       `crosshair-hover` / `crosshair-snap` 就一直挂着：四条线还吸在
       那个已经跑掉的元素上，跟着它一起滑出屏幕。

       所以除了 mouseover，还要在两个"鼠标没动但底下的东西换了"的时机
       主动补一次命中测试：
         · 滚动（capture 阶段监听 document，连嵌套滚动容器一起覆盖）
         · 布局变化（resize / 横竖屏 / 字体加载完成 → World.onLayout）
       用 document.elementFromPoint(mx, my) 问"光标底下现在是谁"。
       ★ 准星自己那一堆元素（四条线 / 三角 / 读数 / 红带 / 圆点）
         全都是 pointer-events: none，命中测试天然会跳过它们。 */
    /* ★ media-panel 那类"纯 CSS :hover"的悬停态也得救一手。
       浏览器在"页面从光标底下滚过去"时**不保证**更新 :hover
       （和 mouseover 是同一个毛病，只是换成 CSS 那侧）——
       表现就是面板已经滚走了、底图还亮着、标题还红着。
       所以命中哪个面板就给它标一个 `is-hot`，
       style.css 那边 `:hover` 和 `.is-hot` 各写一份、指向同一套样式。 */
    let hotEl = null;
    function setLiveHot(el) {
        if (el === hotEl) return;
        if (hotEl) hotEl.classList.remove("is-hot");
        hotEl = el;
        if (hotEl) hotEl.classList.add("is-hot");
    }

    function applyHover(t) {
        /* ★ 有框的时候冻结悬停 / 吸边判定（正在拖 or 等确认）：
           这时候"鼠标底下是谁"不该再改四条线的位置 —— 那是框的活。
           等确认时更要冻结，否则鼠标一动，四条线就从框上跑掉了。 */
        if (dragging || pending) return;
        document.body.classList.toggle("crosshair-hover", !!(t && t.closest(HOVER_SEL)));
        setSnap(t ? t.closest(SNAP_SEL) : null);
        setLiveHot(t ? t.closest(LIVE_HOVER_SEL) : null);
    }

    /* 鼠标到底有没有进过窗口。没有的话 mx/my 还是初始的屏幕中心，
       这时候做命中测试会凭空吸住屏幕中心那个东西 —— 所以先不做。 */
    let pointerSeen = false;

    /* 滚动重判：每帧最多一次（滚动事件本身比帧密得多） */
    let recheckRaf = null;
    function recheckUnderCursor() {
        if (!pointerSeen || recheckRaf !== null) return;
        recheckRaf = requestAnimationFrame(() => {
            recheckRaf = null;
            const el = document.elementFromPoint(mx, my);
            applyHover(el instanceof Element ? el : null);
        });
    }

    /* ============================================================
       框选量取（P40）：按住左键拖出一个框，松手把规格写进剪贴板
       ------------------------------------------------------------
       ★★ 为什么**不**用"长按"触发：
         长按在给出反馈之前无法区分"点一下"和"按住了"，必然引入一个
         等待窗口。而这站的大块（.media-panel / .card）**单击是打开作品**的，
         加个 200~400ms 判定就等于给"打开"加延迟、加误触。
         改成**位移阈值**：松开时移动不到 DRAG_MIN 像素算单击（放行）、
         超过就算拖框（把随后的 click 拦掉）。时间阈值制造延迟，
         位移阈值不制造 —— 所有画图工具都是这么分的。
       ★ 四条线本来就是"两条垂直 + 两条水平"，框选是同一个形状，
         所以这里一个新元素都不用加：只是把四个位置从"元素四边"
         换成"框的两个角"。红带、三角、读数全是现成的。
       ============================================================ */

    /* 框的两个角 → 四个位置。顺序无所谓，用 min/max 归一化，
       所以往任意方向拖都对。 */
    function dragTo(x, y) {
        tx1 = Math.min(dragX0, x); tx2 = Math.max(dragX0, x);
        ty1 = Math.min(dragY0, y); ty2 = Math.max(dragY0, y);
        settle();
    }

    function beginDrag() {
        /* 重新拖 = 换一个框 */
        pending = false;
        endBoxTimer();
        hideHint();
        dragging = true;
        dragX0 = pressX; dragY0 = pressY;
        setSnap(null);                  // 有框的时候不做吸边（它俩互斥）
        syncMeasuring();                // 挂上"仪器正在读数" + "屏幕上有框"
        dragTo(pressX, pressY);
    }

    /* ★★ 拖框结束那一下 click 要吞掉。
       为什么需要它：mouseup 之后浏览器**还会派发一个 click**，
       它属于"结束拖框"这个手势本身，不是"我要确认"。
       不吞的话，松手 → 进 pending → 同一个手势的 click 立刻把框确认掉
       —— 表现就是"松手就闪白、根本没等你点"。
       （P40 我写过一个 suppressNextClick() 放在旁边，但**从来没调用**，
         而 check.js 只断言了"函数存在"，没断言"被调用" —— 于是这个洞
         一直没被发现。这次改成**在确认用的同一个处理器里**判一个标志位，
         顺序上不可能再错：谁吞、谁确认，是同一段代码。）
       ★ 用标志位而不是另挂一个监听：两个都是 document 的捕获监听，
         执行顺序按注册先后 —— 后来注册的那个永远慢一步。 */
    let swallowClick = false;
    let boxTimer = null;        // 框的确认时限
    /* ★ P45：页面还在不在动。
       惯性滚动会连续发 scroll 事件，最后一次之后 SCROLL_SETTLE 毫秒
       没有新事件才算"静止"。拖框要靠它判断"现在能不能画框"——
       不然画出来的框会在下一个 scroll 事件里被"滚动=取消"当场收掉，
       表现就是"滚动结束前根本框不出来"。 */
    const SCROLL_SETTLE = 150;
    let scrolling = false;
    let scrollSettleTimer = null;
    let refusedDrag = false;    // 这一次按住已经提示过"请等页面静止"了

    /* 拖出来的那块是什么 —— 用来给规格加一行"出处" */
    function buildSpec() {
        const w = Math.round(Math.abs(x2 - x1));
        const h = Math.round(Math.abs(y2 - y1));
        const left = Math.round(Math.min(x1, x2));
        const top = Math.round(Math.min(y1, y2));

        /* 框中心底下是谁。准星自己那一堆都是 pointer-events: none，
           所以命中测试不会返回它们。 */
        const under = document.elementFromPoint(left + w / 2, top + h / 2);
        const sec = under && under.closest ? under.closest("section, .navbar, .footer") : null;
        const work = under && under.closest ? under.closest("[data-work]") : null;
        const heading = work ? work.querySelector("h2, h3") : null;
        const label = [
            sec && sec.id ? "#" + sec.id : "",
            heading ? heading.textContent.trim() : "",
        ].filter(Boolean).join(" ");

        return w + " × " + h + " @ (" + left + ", " + top + ")" +
            (label ? "  ·  " + label : "");
    }

    /* ============================================================
       截图（P47）：唯一可行的路是"共享当前标签页 + 自己裁"
       ------------------------------------------------------------
       ★★ 为什么不用 DOM→canvas（html2canvas 那类）：
         这站的视觉是 mask-composite、mix-blend-mode、多层渐变 mask、
         canvas 刻度尺、合成器层 transform 拼出来的 —— DOM 重放里这些
         全部丢失或失真，截出来根本不是这个页面。SVG foreignObject 更糟。
         要真的那一块像素，只有"抓屏幕"一条路。
       ★ 代价要说清：**每次截取都会弹一次"选择要共享的内容"权限框**，
         而且必须共享**当前标签页** —— 标签页捕获的画面就是页面视口，
         `videoWidth / innerWidth` 正好是缩放比；屏幕/窗口共享带着浏览器
         边框，坐标系对不上，所以下面有一道宽高比自检，不像就放弃。
       ★ 任何一步失败（不支持 / 用户拒绝 / 宽高比不对 / 转换出错）
         一律 resolve(null)，调用方退回文本规格 —— "保留当前功能"就是这个意思。
       ★★ 为什么这套玩法绕不过权限框：我翻了 Permissions API 和 Chrome 的
         屏幕共享文档，**没有**找到任何"页面可以跳过选择框"的机制
         （`navigator.permissions` 里没有一项能查询/预授权 display-capture）。
         ★ 这条**没实机验证** —— 要是你哪天发现有，告诉我，这里可以省掉一次点击。
       ============================================================ */

    const CAN_SCREENSHOT = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia &&
        window.ClipboardItem && navigator.clipboard && navigator.clipboard.write);

    /* 等 n 个**新到的**视频帧。有 requestVideoFrameCallback 就用它 ——
       它保证"这一帧是藏起准星之后才采到的"，比拿定时器猜延迟可靠。
       ★★ 但它**不能单独用**：rVFC 只在"新帧被提交"时才回调，而我们的
          <video> 是**游离在文档外**的（不塞进 DOM 是为了零副作用）。
          万一某个浏览器对这种视频不派发 rVFC，单独等它就是一个
          **永远不 resolve 的 Promise** —— 表现是"点了确认之后毫无反应"，
          而且没有任何报错。所以这里 race 一个兜底定时器：
          rVFC 正常时是它赢（精确），不正常时定时器赢（有界，不挂死）。
       ★ 兜底值取 400ms：比 2 帧间隔（约 33ms）宽得多，足够让正常路径先赢；
          又短到用户感觉不出来。 */
    const FRAME_WAIT_MS = 400;
    function waitVideoFrames(video, n) {
        const byTimer = new Promise((r) => setTimeout(r, FRAME_WAIT_MS));
        if (typeof video.requestVideoFrameCallback !== "function") return byTimer;
        const byFrames = new Promise((resolve) => {
            let left = n;
            const step = () => { if (--left <= 0) resolve(); else video.requestVideoFrameCallback(step); };
            video.requestVideoFrameCallback(step);
        });
        return Promise.race([byFrames, byTimer]);
    }

    /* ★ 采帧之前还要确认"视频真的有画面了"：
       MediaStream 挂上 <video> 之后，第一帧不是立刻到的，
       这中间 `videoWidth` 是 0。**不等它就有两个后果**：
         · `scaleX = 0` → 被下面的比例自检判为"选错了共享对象"，
           于是**第一次截取永远是"未能截图"**，第二次才成功 ——
           这种"重来一次就好"的 bug 最难查；
         · 就算侥幸过了，`drawImage` 从 0 尺寸的源上什么也画不出来。
       ★ 用 loadedmetadata（MediaStream 上"首帧尺寸已知"就是它）而不是轮询。
       ★ 也带兜底：事件没来也不会挂住，最多浪费 1.5s 然后走同一条失败路径。 */
    const READY_WAIT_MS = 1500;
    function waitVideoReady(video) {
        if (video.videoWidth > 0) return Promise.resolve();
        return new Promise((resolve) => {
            const done = () => { video.removeEventListener("loadedmetadata", done); resolve(); };
            video.addEventListener("loadedmetadata", done);
            setTimeout(done, READY_WAIT_MS);
        });
    }

    /* ★★ Chrome 108 起 `selfBrowserSurface` 的默认值是 "exclude" ——
       也就是说**"当前标签页"根本不在选择列表里**。
       光写 `preferCurrentTab: true` 不够，必须显式 `selfBrowserSurface: "include"`，
       否则这个功能在默认配置下就是不可用的（用户想选当前标签页也选不到）。
       ★ `monitorTypeSurfaces: "exclude"` 把"整个屏幕"从列表里**去掉**：
         这是"消灭最大的一类误选"，而不是等用户选完了再靠比例自检去拒。
         我们这个功能本来也只处理得了标签页，给一个注定失败的选项是坏交互。
       ★ `surfaceSwitching: "exclude"`：一次性抓取，不需要
         "共享期间切换到别的标签页"那个控件。 */
    const CAPTURE_CONSTRAINTS = {
        video: { displaySurface: "browser" },
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: "include",
        monitorTypeSurfaces: "exclude",
        surfaceSwitching: "exclude",
    };

    /* ★ 为什么要包一层、而不是直接把上面那套传进去：
       约束集**不被支持**时的失败方式是**静默的** —— catch 到就 return null，
       功能悄悄退成"纯文字规格"，用户永远不会知道为什么没有图。
       （已知的一条互斥规则：`monitorTypeSurfaces: "exclude"` 不能和
        `displaySurface: "monitor"` 同时出现，会抛 TypeError。我们没踩这条线，
        但各浏览器对这套新约束的接受程度不一致，我不想赌。）
       ★★ 只对 **TypeError** 重试一次：TypeError = "你给的约束我不认"。
         而 NotAllowedError = "用户拒绝了" —— 那时重试等于**再弹一次权限框**，
         绝对不能再试。 */
    async function requestCaptureStream() {
        try {
            return await navigator.mediaDevices.getDisplayMedia(CAPTURE_CONSTRAINTS);
        } catch (err) {
            if (!err || err.name !== "TypeError") throw err;
            return await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false,
                preferCurrentTab: true,
                selfBrowserSurface: "include",
            });
        }
    }

    async function captureImage(box) {
        if (!CAN_SCREENSHOT) return null;
        let stream = null;
        try {
            /* ★★ 这一段必须是这个函数里**第一个** await，前面不能有别的东西 ——
               getDisplayMedia 要 transient activation，而它来自"确认"那一下点击。
               （requestCaptureStream 是 async 函数，它的函数体会**同步**执行到
                 内部第一个 await，所以激活状态在这里不会丢。） */
            stream = await requestCaptureStream();
        } catch (err) {
            return null;                          // 用户点了取消 / 不支持
        }

        try {
            const video = document.createElement("video");
            video.muted = true;
            video.playsInline = true;
            video.srcObject = stream;
            await video.play();
            /* ★ 先等"有画面"，再藏仪器 —— 顺序反了的话，藏起来的那 2 帧
               可能是在一个还是 0×0 的视频上等的，等于白等。 */
            await waitVideoReady(video);

            /* ★ 把"仪器"藏起来再采帧 —— 截的是页面，不该带着四条线、红框和提示。
               用 visibility（瞬时、不动布局），不是 opacity
               （那个有过渡，会拍到半透明的中间态）。 */
            document.body.classList.add("capture-hide");
            await waitVideoFrames(video, 2);
            document.body.classList.remove("capture-hide");

            const scaleX = video.videoWidth / window.innerWidth;
            const scaleY = video.videoHeight / window.innerHeight;
            /* 宽高比不对 → 多半选成了窗口/整个屏幕（带着浏览器边框），
               按视口比例裁出来的一定是错的，宁可不要。 */
            if (!(scaleX > 0) || !(scaleY > 0) ||
                Math.abs(scaleX - scaleY) / Math.max(scaleX, scaleY) > 0.02) {
                return null;
            }

            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(box.w * scaleX));
            canvas.height = Math.max(1, Math.round(box.h * scaleY));
            canvas.getContext("2d").drawImage(
                video,
                Math.round(box.left * scaleX), Math.round(box.top * scaleY),
                canvas.width, canvas.height,
                0, 0, canvas.width, canvas.height);

            return await new Promise((res) => canvas.toBlob(res, "image/png"));
        } catch (err) {
            return null;
        } finally {
            document.body.classList.remove("capture-hide");
            /* 抓完立刻停掉，别让"正在共享"那个提示一直挂着 */
            stream.getTracks().forEach((t) => t.stop());
        }
    }

    /* 返回 Promise<boolean>：回执要知道到底成没成。
       ★ imageBlob 有值时写"图片 + 文字"**两个类型**：
         粘进文本编辑器得到规格，粘进 Figma / 图片工具得到图片 ——
         "保留当前功能"不是二选一，是**两个都给**。
       ★ 异步 API 被拒时退回旧办法（临时 textarea + execCommand）。 */
    function writeClipboard(text, imageBlob) {
        const asText = () => new Blob([text], { type: "text/plain" });

        const fallback = () => {
            try {
                const ta = document.createElement("textarea");
                ta.value = text;
                ta.setAttribute("readonly", "");
                ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
                document.body.appendChild(ta);
                ta.select();
                const ok = document.execCommand("copy");
                ta.remove();
                return ok;
            } catch (err) { return false; }
        };

        if (!navigator.clipboard) return Promise.resolve(fallback());

        if (imageBlob && window.ClipboardItem) {
            const item = new ClipboardItem({ "text/plain": asText(), "image/png": imageBlob });
            return navigator.clipboard.write([item])
                .then(() => true, () => writeClipboard(text, null));   // 图写不进去就只写文字
        }
        if (navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).then(() => true, () => fallback());
        }
        return Promise.resolve(fallback());
    }

    /* ★ P41：回执改成在**松手的位置**生一句会淡出的字。
       · 位置用松手那一刻的 clientX/Y —— 生成之后就**固定在那儿**
         （不跟着鼠标走），符合"固定在原位"。
       · 淡出交给 CSS 动画（1s），animationend 时自己 remove ——
         和 .click-ripple 是同一套做法，不留定时器、不留常驻元素。
       · z-index 和圆形指针同级：它是给眼睛看的回执，不该被准星压住。 */
    function showToast(text, x, y) {
        const el = document.createElement("div");
        el.className = "cursor-toast";
        el.textContent = text;
        el.style.left = (x + 12) + "px";     /* 让开圆形指针那 10px */
        el.style.top = (y + 10) + "px";
        document.body.appendChild(el);
        el.addEventListener("animationend", () => el.remove(), { once: true });
    }

    /* ============================================================
       框画好之后：**不直接复制**，先停在"等确认"
       ------------------------------------------------------------
       框留在原地、红色区域里出一行提示，四条线钉在框的四边不动：
         · 左键单击 → 抓取 → 闪白一下 → 回执
         · 右键 / Esc → 取消
         · 直接再拖一次 → 换一个框（走同一套位移阈值，不用先取消）
       ★ 为什么要把"确认"这一步加进来：框选本身是个**有歧义**的手势
         （你到底想量什么 / 框到什么程度算够），给一次反悔的机会比
         松手就写剪贴板稳妥得多 —— 而且剪贴板是有副作用的。
       ============================================================ */

    /* ★ payload 变了这行字就要跟着变。现在确认之后是**截图 + 规格**，
       所以写"截取"；浏览器连 getDisplayMedia / ClipboardItem 都没有时
       退回纯文本规格，那时写"复制"才不骗人 —— 一个词说实话就够，
       不必在这里解释"为什么没有图"。
       ★ 分隔符别用全角空格 U+3000：HuXiaoBo 原字体里**没有**这个字形，
         它会落进兜底字体 HuXiaoBo-Full 的 unicode-range，
         于是为了一个空格把 3.2MB 整个拉下来（自检当场报了这条）。
         普通空格在子集里，够用。 */
    const HINT_TEXT = CAN_SCREENSHOT ? "点击框内截取 · 框外取消" : "点击框内复制 · 框外取消";

    /* ★ P44：框画好之后最多等这么久，到点自动取消。
       ★★ P48：**降低动效下同样计时**（你确认要保留这个框）。
         原来这里写的是"降低动效下不加这个时限"，理由是那个偏好里有
         "别催我"；现在两边统一。手动取消（框外点击 / 右键 / Esc）照旧，
         键盘的 Enter 也可以提前确认。
       ★ 这个数字同时决定框里那条倒计时线的长度（下面写进 --box-ttl），
         一处改、两处生效 —— 降低动效下那条静止线用的也是它。
       ★ 它是个**手调的数**：自检只断言"正数、且短到不会无限期挂着"，
         不钉死这个值（钉死只会让调手感的代价变成"改两处 + 自检报红"）。 */
    const BOX_TTL = 1500;

    if (hintEl) hintEl.textContent = HINT_TEXT;
    document.documentElement.style.setProperty("--box-ttl", (BOX_TTL / 1000) + "s");

    function showHint() {
        if (!hintEl) return;
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        hintEl.classList.add("is-on");
        hintEl.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
        /* 先摆在框中心，再量一下它多大、夹回视口内 ——
           一次布局读取，只在松手那一刻发生，不在每帧路径里。
           （框贴着屏幕边时，提示会溢出到看不见的地方，所以必须夹。） */
        const r = hintEl.getBoundingClientRect();
        const M = 8;
        let dx = 0, dy = 0;
        if (r.left < M) dx = M - r.left;
        else if (r.right > window.innerWidth - M) dx = (window.innerWidth - M) - r.right;
        if (r.top < M) dy = M - r.top;
        else if (r.bottom > window.innerHeight - M) dy = (window.innerHeight - M) - r.bottom;
        if (dx || dy) {
            hintEl.style.transform = `translate(${cx + dx}px, ${cy + dy}px) translate(-50%, -50%)`;
        }
    }

    function hideHint() {
        if (hintEl) hintEl.classList.remove("is-on");
    }

    /* 拖框松手 → 进"等确认"：框留着、提示出来、四条线钉住不动 */
    function enterPending() {
        dragging = false;
        pending = true;
        /* ★ 紧接着派发的那个 click 是"结束拖框"的，不是"确认"——
           标记一下，让确认处理器把它吞掉。 */
        swallowClick = true;
        /* ★★ 松手**立刻钉死**，不走缓动。
           为什么必须：拖得快的时候，四条线是靠 EASE_DRAG(0.8) 追目标的，
           松手那一刻它们可能还差几像素。而 dragging 一变 false：
             · 缓动系数掉回 EASE(0.10) → 这几像素要走半秒，看起来"还在跟鼠标"；
             · 红框的更新以 dragging 为条件 → 它当场定形不动了。
           两者一叠加，就是你看到的"红框已经定了、准星还在动"。
           钉死之后两边都用最终目标，一次对齐。 */
        snapToTargets();
        syncMeasuring();
        showHint();
        armBoxTimer();
    }

    /* ============================================================
       P48 一、框选与键盘：没开参考网格（G）就不能框选
       ------------------------------------------------------------
       ★ 状态从 **body 上的类**读，不跨文件传变量 ——
         两边各存一份状态迟早会对不上（这个项目里已经栽过好几次）。
         guides.js 负责挂/摘 `guides-on`。
       ★★★ 但有个致命细节：guides.js 开头是
         `if (!canvas || !window.World) return;`。那个守卫一旦成立，
         **G 键处理器根本不存在**，`guides-on` 永远是 false ——
         框选就被**永久禁用**了，而且没有任何报错。
         （"守卫把整套功能静默关掉"在这个项目里已经出现过两次：
          `crosshair-active` 漏挂、`--hero-line` 缺变量。）
         所以 guides.js 会在守卫之后打一个 `guides-ready` 标记；
         没有这个标记就**放开闸门**（fail-open）：
         参考线不可用是它自己的问题，不该顺手把框选也一起弄死。
       ============================================================ */
    function guidesOn() {
        const cls = document.body.classList;
        return !cls.contains("guides-ready") || cls.contains("guides-on");
    }

    /* 时限一到就自动取消。
       ★★ P48 改：降低动效下**也**计时了。
         原来这里有一句 `if (REDUCE_MOTION) return;`，理由是
         "拿倒计时催一个要求减少动效的人，正好是反的"。
         你确认要保留这个 3 秒，所以那句删掉了 ——
         `REDUCE_MOTION` 这个常量因此也没有其它用处，一并删掉，
         不留一个"看起来还在用"的死变量。
         ★ 连带的一致性问题：CSS 里降低动效下把倒计时线设成
           `animation: none`（否则 .01ms 的全局动画时长会让它瞬间跑完）。
           时限现在是真的了，那条线就不能再藏着 —— 否则"框会在 3 秒后消失"
           这件事**完全没有视觉提示**，用户会以为是 bug。
           现在改成一条**静止的满格线**：不含任何动效，但确实在说
           "这里有时限"。见 style.css 里那段注释。 */
    function armBoxTimer() {
        endBoxTimer();
        boxTimer = setTimeout(dropBox, BOX_TTL);
    }

    function endBoxTimer() {
        if (boxTimer !== null) { clearTimeout(boxTimer); boxTimer = null; }
    }

    /* 把框收掉。
       ★★ 收尾不是"回到拖框之前吸着的那个元素"，而是**重新判一次
         "光标底下现在是谁"** —— 你点框外来取消，鼠标已经在新位置了：
         可能还在同一个元素上、可能移到别的可交互元素上、也可能在空地上。
         用"回到上一个"会显得呆板：准星和悬停态会一起卡在旧元素上。
       ★ 这一步必须**同步**做，不能等 recheckUnderCursor 那个 rAF ——
         否则这一帧里四条线还挂在旧的吸附位置上。 */
    function refreezeHover() {
        const el = pointerSeen ? document.elementFromPoint(mx, my) : null;
        applyHover(el instanceof Element ? el : null);
        /* ★★ 这一行不能省。
           `applyHover(null)` 走的是 `setSnap(null)`，而 setSnap 在
           "本来就没吸着"时会**提前 return** —— 于是 targetFromMouse()
           永远不会被调用，四条线就留在**框的位置**上了。
           表现出来正是："取消/复制之后，如果期间没动过鼠标，
           准星就一直停在框选的那个位置。"
           所以这里补一句：没吸着任何东西，就必须回到鼠标。 */
        if (!snapEl) targetFromMouse();
    }

    function dropBox() {
        endBoxTimer();
        pending = false;
        dragging = false;
        hideHint();
        /* ★ 必须先 syncMeasuring 再 refreezeHover：
           如果此刻本来就没吸着元素，applyHover 里那条 setSnap(null)
           会提前 return，`crosshair-box` 就摘不掉了。 */
        syncMeasuring();
        refreezeHover();
        settle();
    }

    /* 闪光灯：让框自己由红变白再消失。
       ★ 闪的是 `.crosshair-fill` **自己的 opacity + background**，
         不是在它里面套一层 —— 父元素的 opacity 会乘到子元素上，
         套一层的话 0.07 × 0.9 ≈ 0.06，等于没闪。 */
    function flashBox() {
        if (!fillEl) return;
        fillEl.classList.add("is-flashing");
    }
    if (fillEl) {
        fillEl.addEventListener("animationend", () => fillEl.classList.remove("is-flashing"));
    }

    function confirmBox() {
        endBoxTimer();
        /* ★ 先把提示（和它下面那条倒计时线）收掉，**再**闪白 ——
           不然闪的那一下中间还压着一行字和一条进度线，不像"闪了一下框"。 */
        hideHint();
        const spot = { x: mx, y: my };
        flashBox();
        const spec = buildSpec();

        /* ★★ 矩形要**在这一刻**定死。
           点下去之后马上会弹"选择要共享的内容"，那期间框会收掉、
           鼠标也会跑 —— 裁切只能用在"确认那一刻"就算出来的坐标，
           不能等截图回来再读 x1/x2（那时候早不是这个框了）。
           ★ 和 buildSpec() 用同一组 x1/x2/y1/y2：规格上写的数字
             和裁出来的像素必须是同一个矩形，不然对不上账。 */
        const box = {
            left: Math.round(Math.min(x1, x2)),
            top: Math.round(Math.min(y1, y2)),
            w: Math.round(Math.abs(x2 - x1)),
            h: Math.round(Math.abs(y2 - y1)),
        };

        /* 截图是异步的（中间要等用户选共享对象），回执按结果分三种：
           有图 → 进剪贴板；只有文字 → 说明图没截到；写失败 → 失败。 */
        captureImage(box).then(
            (blob) => writeClipboard(spec, blob).then(
                (ok) => showToast(
                    !ok ? "复制失败" : (blob ? "已复制规格和截图" : "已复制规格（未能截图）"),
                    spot.x, spot.y),
                () => showToast("复制失败", spot.x, spot.y)),
            () => showToast("复制失败", spot.x, spot.y));
        /* 框先留着让闪白演完再收；fillEl 不在时就直接收，不赌动画。 */
        if (fillEl) setTimeout(dropBox, 420);
        else dropBox();
    }

    /* 待确认时：**点框内 = 截取（截图 + 规格），点框外 = 取消**。
       ★ 捕获阶段 + stopPropagation —— 这一下不该顺便把作品浮窗点开。
       ★★ 开头的 swallowClick 是这段逻辑的关键：松手之后浏览器还会补一个
         click，那一下属于"结束拖框"，必须吞掉，否则它会立刻确认掉刚画好的框。
         吞和确认写在**同一个处理器**里，所以不存在"谁先跑"的问题。
       ★ 判"框内"用**目标位置**（tx1..ty2）而不是当前值：框刚画完可能还在
         收敛的最后几像素上，用目标位置更稳、也更符合"你看到的那四条线"。 */
    document.addEventListener("click", (e) => {
        if (swallowClick) {
            swallowClick = false;
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if (!pending || dragging) return;
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        const inside = e.clientX >= tx1 && e.clientX <= tx2 &&
            e.clientY >= ty1 && e.clientY <= ty2;
        if (inside) confirmBox();
        else dropBox();
    }, true);

    /* 右键 = 取消。★ 只在有待确认的框时压掉右键菜单 ——
       平时右键菜单照旧（原来那个 contextmenu 监听是空的，没拦）。 */
    document.addEventListener("contextmenu", (e) => {
        if (!pending && !dragging) return;
        e.preventDefault();
        dropBox();
    });

    /* Esc = 取消 / Enter = 确认。
       ★ Enter 是 P48 加的"键盘那一半"：既然框选已经和 G 键绑定，
         那就该能用键盘走完全程 —— 拖出框、看一眼、Enter 截取。
         （Esc 从一开始就有；没有 Enter 的话键盘用户画完框还是得去够鼠标。）
       ★ 输入框里不抢键：这站有搜索/表单元素，打字时按 Enter 不该截屏。
       ★ 只认"待确认"状态：正在拖框时按 Enter 没有意义（框还没定）。 */
    document.addEventListener("keydown", (e) => {
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" ||
            (document.activeElement && document.activeElement.isContentEditable)) {
            return;
        }
        if (e.key === "Enter") {
            if (!pending || dragging) return;
            e.preventDefault();
            confirmBox();
            return;
        }
        if (e.key !== "Escape" || (!pending && !dragging)) return;
        dropBox();
    });

    /* ★★ G 键把参考网格关掉时，**待确认的框也要收掉** ——
       不然"没有网格就没有框选"这条规则会留下一个例外：
       框已经画出来了，网格关掉它还在，还能确认。
       ★★ 为什么用 rAF 而不是直接读：这个 G 键处理器和 guides.js 里那个
          **各注册一次**，谁先跑取决于两个 <script> 的先后。
         直接读的话，注册早的那个会读到**旧**状态，表现是"按一下 G 没反应、
          再按一下才把框收掉"。放到下一帧再读，所有同事件的处理器都已经跑完，
         状态一定是最终的 —— 不依赖加载顺序。 */
    document.addEventListener("keydown", (e) => {
        if (e.key.toLowerCase() !== "g" || !pending) return;
        requestAnimationFrame(() => { if (pending && !guidesOn()) dropBox(); });
    });

    document.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;                              // 只认左键
        if (document.body.classList.contains("window-open")) return;   // 浮窗里不抢
        /* ★★ P79：按在**游戏卡带**上 = "把卡带拖到舞台上"那个手势，
           不是框选量取。不在这里让开的话（尤其参考线开着时），
           拖卡带会同时画出一个量取框 —— 两个拖拽手势打架。 */
        if (e.target && e.target.closest && e.target.closest('.play-cart')) {
            pressing = false;
            return;
        }
        /* ★ 新手势开始 → 上一个"待吞"作废。
           万一下一次 click 根本没来（松手在元素外），标志位就会挂在那儿、
           把**下一次**点击吞掉。在这里清掉，它就只活一个手势的寿命。 */
        swallowClick = false;
        refusedDrag = false;        // 新手势 → 允许再提示一次"请等待页面静止"
        pressing = true;
        pressX = e.clientX; pressY = e.clientY;
        /* ★ 这里**不** preventDefault：单击还要正常打开作品 */
    });

    document.addEventListener("mouseup", (e) => {
        if (e.button !== 0) return;
        pressing = false;
        if (!dragging) return;               // 单击 → 什么都不做，放行
        enterPending();                      // ★ 不直接复制，先停下来等确认
    });

    /* 布局变化（resize / 横竖屏 / 字体到位后重排）：
       元素的位置和尺寸都可能变了，之前量下的 rect 就作废了 ——
       如果此刻还吸着同一个元素，必须**重新量一次**。
       ★ 滚动不用这样：横向滚动只是平移，用差值算就够、还省一次布局读取；
         但 resize 会改变 rect 本身，差值救不了。
       ★ 顺便再做一次命中测试（底下换人了没有）。 */
    function relayout() {
        if (snapEl) { anchor(snapEl); settle(); }
        recheckUnderCursor();
    }

    document.addEventListener("mouseover", (e) => {
        const t = e.target instanceof Element ? e.target : null;
        if (!t) return;
        pointerSeen = true;

        /* "吸边"只认大块。★ 光靠 mouseover 判断进出是可以的：
           从块里走到块外的任何元素都会再触发一次 mouseover，
           那时 closest 就是 null → 收回鼠标处。
           （不能只用 mouseout —— 离开块时 target 还在块里，
             closest 仍然是那个块，会误判成"还在吸着"。）
           ★ 但**滚动**那条路 mouseover 不会触发，见上面的补充重判。 */
        applyHover(t);
    }, { passive: true });

    /* ★ capture 阶段 → 连 #skills 那种嵌套滚动容器里的滚动也能收到。
       ★★ 而且这里是**锁死状态下零延迟的关键**：
         · scroll 事件在同一帧里排在 rAF **之前**；
         · 内容是在合成器上滚的，如果我们等 rAF 再写 transform-origin，
           那就是"内容先滚走、准星下一帧才追上" —— 这一帧就是你肉眼
           看到的那点延迟，缓动系数调到 1 也救不了（问题不在插值，在时机）。
         · 所以锁死时**当场**更新位置：写进去的这一帧会和内容一起提交，
           两者同帧移动，看不出延迟。
       非锁死状态仍然交给 rAF（那本来就是一段动画，不需要也不该抢帧）。 */
    document.addEventListener("scroll", () => {
        /* ★ 记下"页面还在动" —— 惯性滚动会连续发很多 scroll 事件，
           最后一次之后 SCROLL_SETTLE 毫秒没事才算静止。
           拖框要靠它来判断"现在能不能画框"（见 mousemove）。 */
        scrolling = true;
        clearTimeout(scrollSettleTimer);
        scrollSettleTimer = setTimeout(() => {
            scrollSettleTimer = null;
            scrolling = false;
        }, SCROLL_SETTLE);

        /* ★ 等确认期间页面滚了 → 取消这个框。
           框的坐标是**视口坐标**，一滚它就对不上底下的内容了；
           这时候让你确认"截取的就是框住的那块"是错的。 */
        if (pending) dropBox();
        if (locked && snapEl) {
            targetFromSnap(liveScrollX() - snapScrollX);
            snapToTargets();
        }
        recheckUnderCursor();
    }, { passive: true, capture: true });

    /* 吸着的时候页面滚了 → 目标要跟着挪（用差值，仍然零布局读取）。
       ★ 这一条和上面的"capture 那个"是两件事，都要留：
         · 这里管滑入/滑出过程（动画中，走 rAF）；
         · 上面那个管锁死后的逐帧对齐（同步）。
       两者用同一个 targetFromSnap，先跑的先算、后跑的算出来一样，重复无害。 */
    if (window.World) {
        /* ★ 这里可以用 World.scrollX：World.onScroll 就是 syncScroll() 在
           读完 mainEl.scrollLeft 之后同步调过来的，所以那一刻它是**新的**。
           而 snapScrollX 是 setSnap 用实时值记下的，两边口径一致。 */
        World.onScroll(() => {
            if (snapEl) { targetFromSnap(World.scrollX - snapScrollX); settle(); }
        });
        /* 布局一变，命中结果和 rect 都可能变 —— 走 relayout（重新量 + 重判） */
        World.onLayout(relayout);
    } else {
        window.addEventListener("resize", relayout);
    }

    window.addEventListener("mousemove", (e) => {
        mx = e.clientX;
        my = e.clientY;

        /* ----- 左键按下中：先按位移阈值决定这是"单击"还是"拖框" -----
           ★ 阈值用曼哈顿距离（不开根号），对角方向同样好过。 */
        if (pressing) {
            if (!dragging && !refusedDrag &&
                Math.abs(e.clientX - pressX) + Math.abs(e.clientY - pressY) >= DRAG_MIN) {
                /* ★★ 页面还在滚（含惯性）→ 回执一次，并且**这一次按下就此作废**。
                   ★★ 千万别在这里 return！那会跳过下面的 targetFromMouse()，
                      准星就"卡在原地"不动、直到页面停下来才突然开始画框
                      —— 那正是它原来的毛病。
                   ★ 用 refusedDrag 记住"这次按下不算"，所以后面再怎么移动也不会
                     突然开始画框；想画框就松手、等页面静止、重新按。 */
                /* ★★ P75：游乐区开着的时候，量取的**回执一律不弹** ——
                   那条"按 G 开启参考系…"在这里没意义（参考网格是给站点版面用的），
                   而且它会盖在舞台上。但**能力保留**：真按了 G（回头量游乐区
                   自己的卡带 / 舞台）照样能拖框，只是不再弹这两条字。
                   仍然走"作废这一次按下"而不是 return —— return 会跳过下面的
                   targetFromMouse()，准星会卡在原地不动（理由同下）。 */
                const inPlay = document.body.classList.contains("sidebar-open");
                if (scrolling) {
                    refusedDrag = true;
                    if (!inPlay) showToast("请等待页面静止…", e.clientX, e.clientY);
                } else if (!guidesOn()) {
                    /* ★★ P48：没有参考网格就没有框选。
                       ★ 同样"作废这一次按下"而不是 return —— 理由和上面完全一样：
                         return 会跳过 targetFromMouse()，准星就卡在原地不动了。
                       ★ 必须给回执：不然用户只会觉得"拖框坏了"，
                         而不会想到要去按 G。（这是这条规则唯一的代价，
                         所以要把它说出口。） */
                    refusedDrag = true;
                    /* ★ P75：游乐区开着时不弹这条（它只会盖在舞台上）——
                       能力保留：真按了 G 照样能拖框量游乐区自己的版面。 */
                    if (!inPlay) showToast("按 G 开启参考系…", e.clientX, e.clientY);
                } else {
                    beginDrag();
                }
            }
            if (dragging) {
                dragTo(e.clientX, e.clientY);
                return;              // 拖框时目标由框接管，不走下面的跟随
            }
        }

        if (!snapEl && !dragging && !pending) targetFromMouse();
        settle();
    }, { passive: true });

    /* ----- 开屏收缩：两对分别落到**左上角**和**右下角** -----
       ★ P34 改：第二对原来落在左下角，现在改成右下角。这样更自洽 ——
         **每条线收到自己那一侧的屏幕边**：
           左边那条 v1 → x=0        上边那条 h1 → y=0        （= 左上角）
           右边那条 v2 → x=innerWidth  下边那条 h2 → y=innerHeight（= 右下角）
         红幕本来就是"缩到左侧"的，收完之后四条线沿着视口四边摆成一个框，
         正好接上"展开成框"的正式用法。
       ★ 这一段**不能缓动**：收缩是 CSS 的 transform 在演（--t-cross-dur），
         origin 必须当场就位，否则会看到线从鼠标位置缩过去。
       ★ 降低动效那条路径加的是 crosshair-active + crosshair-active-done
         （同一个 classList.add，只触发一次 mutation），这里刻意用
         `active && !done` 把它排除掉 —— 那条路径本来就要的是
         "直接停在屏幕中心的正常十字"，不该先摆成四个边。 */
    const observer = new MutationObserver(() => {
        const active = document.body.classList.contains("crosshair-active");
        const done = document.body.classList.contains("crosshair-active-done");
        if (!active || done) return;

        setSnap(null);                     // 顺便把 crosshair-snap 一起摘掉
        /* 第一对 → 左上角 */
        x1 = tx1 = 0;                      // 左线收到屏幕左边
        y1 = ty1 = 0;                      // 上线收到屏幕上边
        /* 第二对 → 右下角（P34 从"左下角"改过来） */
        x2 = tx2 = window.innerWidth;      // 右线收到屏幕右边
        y2 = ty2 = window.innerHeight;     // 下线收到屏幕下边
        apply();
    });
    observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
    });

    /* ----- 鼠标离开 / 进入窗口 ----- */
    /* ★ 鼠标移出窗口 → 全部悬停态清掉。
       这一条是**必须**的：`.is-hot` 现在接管了原来 `:hover` 的活
       （`:hover` 已经从那些规则里去掉，因为它会卡住），
       而浏览器不会替我们摘掉一个类 —— 不清的话，鼠标移出窗口后面板还亮着。 */
    /* ★ 鼠标移出窗口 → 全部悬停态清掉。
       这一条是**必须**的：`.is-hot` 现在接管了原来 `:hover` 的活
       （`:hover` 已经从那些规则里去掉，因为它会卡住），
       而浏览器不会替我们摘掉一个类 —— 不清的话，鼠标移出窗口后面板还亮着。
       ★ 顺带：拖框途中移出窗口就**取消**（不复制）——
         否则拿不到 mouseup，会留下一个卡住的框。 */
    document.addEventListener("mouseleave", () => {
        document.body.classList.add("crosshair-hidden");
        pressing = false;
        /* 拖到窗口外：拿不到 mouseup，必须在这里收掉。
           ★ 等确认（pending）时**不收** —— 你只是把鼠标移出去一下，
             回来还能接着点。 */
        if (dragging) dropBox();
        applyHover(null);
    });
    document.addEventListener("mouseenter", () => {
        document.body.classList.remove("crosshair-hidden");
    });

    apply();   // 先把四个 origin 写一遍（此刻四条都叠在屏幕正中）
})();

/* ============================================================
   圆形指针（.cursor-dot）—— P33 从 main.js 搬来
   ------------------------------------------------------------
   和上面四条线的关系：
     · 四条线**会被吸走**（吸到元素边缘），圆形指针**永远跟着鼠标**；
     · 所以"当前鼠标在哪"这件事有两个消费者，但语义不同 ——
       四条线那边的四个位置可能是元素边缘，而圆点这边就是鼠标本身。
       两者刻意不共享一份位置状态。
     · 跟随速度也不同：准星 EASE = 0.10（刻意的顺滑拖尾），
       圆点 = 0.8（几乎实时）。圆点是指针本体，拖尾会让人觉得"点不准"。

   ★ 它挂在 World.onFrame 上（不是自己开 rAF），而且位置稳定后
     就不再写 DOM —— 鼠标不动时一帧都不碰。
   （曾经在这里做过「点击阶段式收缩」和「开屏时当整屏红幕」，
     两套都要抢 transform，已按需求撤掉 —— 这个模块只负责位置。）
   ============================================================ */
(function cursorDot() {
    const dot = document.querySelector('.cursor-dot');
    if (!dot || !window.World) return;

    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let cx = tx, cy = ty;
    let lastDrawX = NaN, lastDrawY = NaN;

    window.addEventListener('mousemove', (e) => {
        tx = e.clientX;
        ty = e.clientY;
    }, { passive: true });

    World.onFrame((dt) => {
        const k = 1 - Math.pow(1 - 0.8, dt);
        cx += (tx - cx) * k;
        cy += (ty - cy) * k;
        if (Math.abs(tx - cx) < 0.05 && Math.abs(ty - cy) < 0.05) { cx = tx; cy = ty; }

        if (cx === lastDrawX && cy === lastDrawY) return;   // 没动就不写 DOM
        lastDrawX = cx;
        lastDrawY = cy;
        dot.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
    });
})();
