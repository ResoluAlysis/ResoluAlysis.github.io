/* ============================================================
   点一下多媒体面板 → 换一张底图（P50）
   ------------------------------------------------------------
   P53 起改成"两半各自错开并行"：错开量写在 CSS 的 animation-delay 上。

     t = 0                 ① 网点 开始 → 全不透明（--panel-sweep）
     t = lag               ② 遮罩 开始展开（--panel-lag）
     t = lag + cover       ③ 遮罩盖满 → 换图 ＋ 遮罩开始收起
     t = lag + cover + lag ⑤ 网点开始收回
                           （④ = 遮罩收起，和第三步同一刻起跑）

   ★★ 为什么错开写在 CSS 而不是 JS 定时器：
      reduce-motion 那条全局规则会把所有 animation-duration 压到 .01ms。
      如果错开靠 JS 定时器，那个偏好下会变成"遮罩瞬间盖住、然后红着面板
      干等一秒多" —— 比不做动画还糟。写在 CSS 上，整套编排会一起塌缩；
      而且这次在降低动效下**连动画都不演**（见 REDUCE），连那一眨眼都不要。

   ★★ 为什么动画挂在 `.media-panel-bg`（真元素）而不是网点伪元素上：
      伪元素的 animationend 要带 pseudoElement 判断、各家还不完全一致；
      这条链一步错就卡住，不值当。用 @property 注册 + inherits: true，
      动画写在真元素上、值照样继承给伪元素用。

   ★★ 每一个"等"都配了兜底超时（SLACK）。事件万一没来（元素被隐藏、
      浏览器不派发、系统降级…），链子也必须能走完 ——
      最坏的结果是"动画没看见"，绝不能是"面板被一块红遮罩永久盖住"。

   ★ 时间只有一份：四个时间值都在 CSS 的 :root 里（--panel-sweep /
      --panel-cover / --panel-lag / --panel-ease），这里**读出来**用，
      不重写数字。

   ★ 想关掉：ENABLED 改 false。
   ============================================================ */
(function mediaSwap() {
    'use strict';

    const ENABLED = true;
    if (!ENABLED) return;

    const panels = Array.prototype.slice.call(document.querySelectorAll('.media-panel'));
    if (!panels.length) return;

    const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)');

    /* ---------- 读 CSS 里的时长（一处改、两处生效） ----------
       ★★ 这里**不写兜底数字**。第一版我写的是 `timeOf(..., '--panel-sweep', 420)`，
          看着稳妥，其实是把同一份时长抄了两遍 —— 两边迟早会不一致。
         读不到就返回 0，然后**整套动画不做**（直接换图），
         这才是老实降级：连时间都不知道，凭什么去编排五步。 */
    function timeOf(name) {
        const raw = getComputedStyle(document.documentElement)
            .getPropertyValue(name).trim();
        const n = parseFloat(raw);
        if (!isFinite(n)) return 0;
        return /ms$/.test(raw) ? n : n * 1000;      /* 没写单位按秒算 */
    }
    const SWEEP = timeOf('--panel-sweep');
    const COVER = timeOf('--panel-cover');
    /* 错开量：网点先动，遮罩延迟这么久才动；反过来，遮罩开始收之后，
       网点也要等这么久才开始收。两处用的都是它（CSS 里是 animation-delay）。
       ★ 读不到就是 0 —— 和 CSS 里 `var(--panel-lag, 0ms)` 的兜底一致，
         两边不会各说各话。 */
    const LAG = timeOf('--panel-lag');
    /* P54：红遮罩"盖满 → 变成容器底色"那次变色的时长。
       ★ 它同时是遮罩收起动画的延迟（等变色走完再收），所以下面等
         panelVeilOut / halftoneFromSolid 的兜底预算里都要把它算进去。 */
    const TINT = timeOf('--panel-tint');
    /* P55：新图"由大缩小"的时长。它和幕收起同一刻起跑；
       ★ 万一你把它调得比 --panel-cover 还长，收尾也要等它跑完 ——
         否则摘掉类的瞬间动画被掐，图会"啪"地跳到终态。 */
    const ZOOM = timeOf('--panel-zoom');
    const CAN_ANIMATE = SWEEP > 0 && COVER > 0;
    /* 兜底余量：正常情况永远用不到，用到了说明事件没来 */
    const SLACK = 400;

    /* ---------- 图片来源：data/works.js 是唯一数据源 ----------
       gallery → shots[].src（这才是"这个分类下的图"）；
       其它 kind → cover（unity / audio / list 没有 shots）。 */
    function imageList(id) {
        const list = window.WORKS || [];
        for (let i = 0; i < list.length; i++) {
            const w = list[i];
            if (!w || w.id !== id) continue;
            if (w.kind === 'gallery' && Array.isArray(w.shots) && w.shots.length) {
                return w.shots
                    .map(function (s) { return s && s.src; })
                    .filter(Boolean);
            }
            return w.cover ? [w.cover] : [];
        }
        return [];
    }

    /* ---------- 给每只面板注入红遮罩 + 建一份状态 ---------- */
    const states = panels.map(function (panel) {
        const veil = document.createElement('div');
        veil.className = 'media-panel-veil';
        veil.setAttribute('aria-hidden', 'true');
        panel.appendChild(veil);

        const img = panel.querySelector('.media-panel-bg img');
        const shots = imageList(panel.dataset.work);
        /* 从"当前这张"开始数，所以第一次点就是下一张。
           列表里找不到当前 src 时（比如手改了 HTML）从 -1 起步，
           第一次点回到第 0 张 —— 无论如何不会变成"点了没反应"。 */
        let idx = -1;
        if (img) {
            for (let i = 0; i < shots.length; i++) {
                if (img.getAttribute('src') === shots[i]) { idx = i; break; }
            }
            if (idx < 0 && !shots.length) idx = 0;      /* 没有列表时按单张处理 */
        }

        return { panel: panel, veil: veil, img: img, shots: shots, idx: idx };
    });

    /* ---------- 等一次 animationend ----------
       ★ name 也要对：同一个元素上先后跑着两条不同的动画
         （网点进 / 网点出），只听元素不听名字会走错步。 */
    function whenAnimated(el, name, limit) {
        return new Promise(function (resolve) {
            let done = false;
            /* ★★ `timer` 必须先声明成 null 再进闭包（下面 preload 那条踩的就是这个坑）：
               finish() 里引用一个还没初始化的 const 会抛 ReferenceError。 */
            let timer = null;
            const finish = function () {
                if (done) return;
                done = true;
                el.removeEventListener('animationend', on);
                if (timer !== null) clearTimeout(timer);
                resolve();
            };
            const on = function (e) {
                if (e.target !== el) return;
                if (name && e.animationName !== name) return;
                finish();
            };
            el.addEventListener('animationend', on);
            timer = setTimeout(finish, limit);        /* 兜底：事件不来也要往下走 */
        });
    }

    /* ---------- 预载一张图 ----------
       ★ 一定要有超时：图 404 或者服务器不响应时，onload/onerror 可能
         迟迟不来，而链子这时正停在"遮罩盖着"那一步 —— 那就是把面板
         永久盖住了。宁可放一张没下好的图过去，也不能卡死。

       ★★★ P50 修（真机上报的"红遮罩盖住后秒消失、没有下一步"）：
         原来这里写的是

             const timer = setTimeout(finish, limit);   // ← 声明在后面
             ...
             if (im.complete) finish();                 // ← 但这里会同步调它

         而 `finish()` 里要 `clearTimeout(timer)` —— 访问一个**还没初始化**的
         const 会抛 `ReferenceError: Cannot access 'timer' before initialization`。
         这个错抛在 Promise 的 executor 里 → **整个 Promise 变成 rejected** →
         `await loaded` 当场抛出 → 走到 finally → 六个类全被摘掉。
         表现就是：红遮罩刚盖满就**瞬间消失**，后面什么都不发生，
         控制台里一片安静（Promise 被吞了）。

         ★ 为什么必定触发：第一次换图时 `_test.jpg` 早就显示在面板上了，
           `new Image(); im.src = 同一个 URL` 之后 `im.complete` **立刻**是 true。
           也就是说这条同步路径是**默认路径**，不是边角情况。

         ★ 修法：`let timer = null` 提前声明（没有 TDZ），
           finish 里判空再清。顺带把"缓存命中"这条快路径写明。 */
    function preload(src, limit) {
        if (!src) return Promise.resolve();
        return new Promise(function (resolve) {
            let done = false;
            let timer = null;
            const finish = function () {
                if (done) return;
                done = true;
                if (timer !== null) clearTimeout(timer);
                resolve();
            };
            const im = new Image();
            im.onload = finish;
            im.onerror = finish;                 /* 失败也放行，不挡流程 */
            im.src = src;
            /* 缓存里就有 → 同步就绪，连定时器都不用起 */
            if (im.complete) { finish(); return; }
            timer = setTimeout(finish, limit);
        });
    }

    /* ---------- 直接换图（不动画） ---------- */
    function applyNext(st) {
        if (!st.img) return;
        if (!st.shots.length) return;            /* 没有列表 → 只当动画源，不换 src */
        st.idx = (st.idx + 1) % st.shots.length;
        st.img.setAttribute('src', st.shots[st.idx]);
    }

    /* ---------- 主流程：两半都是"错开着并行" ----------
       ★★ P53：以前是五步串行（每步等上一步的 animationend），
          现在改成你给的编排 —— 错开量写在 CSS 的 animation-delay 上，
          JS 只管"该换图的那一刻"和最后的收尾：

             t = 0                ① 网点 开始 → 全不透明（--panel-sweep）
             t = lag              ② 遮罩 开始展开（--panel-lag 延迟）
             t = lag + cover      ③ 遮罩盖满 → 换图 ＋ 遮罩开始收起
             t = lag + cover + lag ④⑤ 网点开始收回

          · ② 的"延迟"是 `animation-delay`，不是 JS 定时器 ——
            用定时器的话，降低动效那条全局规则把动画压成 .01ms 之后就全错位了。
          · ③④ 必须在同一帧：遮罩收起的第一帧和盖满的最后一帧是同一个位置。
          · ④⑤ 两段同时挂着跑（网点的 delay 让它在遮罩已经开始收之后才动），
            所以最后要一起等：Promise.all([遮罩收完, 网点收完])。
          · "换图"仍然夹在"盖满"和"开始收"中间，而且是同一帧完成的 ——
            浏览器不会在这两步之间画一帧，所以换图永远看不见。 */
    async function swap(st) {
        if (!st || !st.img) return;
        if (st.panel.classList.contains('is-swap')) return;   /* 正在换：忽略这一下 */

        const next = st.shots.length
            ? st.shots[(st.idx + 1) % st.shots.length]
            : null;

        /* 降低动效：不演这套扫除动画，直接换。
           （这里**不**留一个 0.01ms 的闪红：那一下在降低动效下更像故障。）
           ★ 时长读不到（CSS 令牌被删 / 起名改了）也走同一条路：
             连时间都不知道就不该去编排，直接换图是唯一不会出错的选择。 */
        if (REDUCE.matches || !CAN_ANIMATE) {
            applyNext(st);
            return;
        }

        const bg = st.panel.querySelector('.media-panel-bg') || st.panel;
        st.panel.classList.add('is-swap');
        try {
            /* 预载和动画并行：lag + cover 之后才用得上，来得及 */
            const loaded = next ? preload(next, LAG + COVER + SWEEP) : Promise.resolve();

            /* ① ② 同时起跑：遮罩靠 CSS 的 animation-delay 自己错开 lag。
                   ★★ 这里**不等网点跑完** —— 两个动画是并行的。
                      网点的 animationend 我们根本不需要（它不卡任何一步），
                      真正要等的只有"遮罩盖满"那一刻。 */
            st.panel.classList.add('is-sweep-in');
            st.panel.classList.add('is-covering');
            const covered = whenAnimated(st.veil, 'panelVeilIn', COVER + LAG + SLACK);

             /* ③ 遮罩盖满那一刻，同一帧做三件事：
                   a) 换图（马上要做的，图没下好就在幕后面等）；
                   b) 幕开始把红色变成容器底色（--panel-tint）；
                   c) **网点开始变回静止渐变** —— 它的 delay 是
                      `tint − sweep`，正好在幕开始收之前走完。
                   ★★ c 为什么必须挪到这一步（而不是等幕开始收之后）：
                      幕变成底色之后一往下收，露出来的是**幕后面的东西**；
                      网点要是还停在实心状态，那一下就是一大片实心红 ——
                      也就是你说的"变完底色突然闪回红色"。
                      把这段返回藏在幕后面走完，露出来的就是"新图 + 正常网点"。
                   ★ 挂在同一帧、而不是等 `await loaded` 之后：网点的时机必须
                     锚在"盖满"这一刻，不能跟着图片加载漂。 */
            await covered;
            st.panel.classList.add('is-veiled');
            st.panel.classList.remove('is-sweep-in');
            st.panel.classList.add('is-sweep-out');

            await loaded;
            applyNext(st);

            /* ④⑤ 幕收起；新图同时"由大缩小"（.is-uncovering 里那条 img 动画）。
                   ★ covering → uncovering 同帧换手：两边都是"盖满"那个位置。
                     （收起动画自己带 --panel-tint 的延迟，等变色走完才动。） */
            st.panel.classList.remove('is-covering');
            st.panel.classList.add('is-uncovering');

            /* ★ 兜底预算：
                 幕收起 = tint + cover；网点返回 = max(sweep, tint)（delay 可能是负的）；
                 图缩放 = tint + zoom。
               ★★ 缩放也要一起等：`--panel-zoom` 要是被调得比 --panel-cover 还长，
                 不等它就会在动画中途摘类 —— 图会"啪"地跳到终态。 */
            await Promise.all([
                whenAnimated(st.veil, 'panelVeilOut', TINT + COVER + SLACK),
                whenAnimated(bg, 'halftoneFromSolid', Math.max(SWEEP, TINT) + SLACK),
                st.img ? whenAnimated(st.img, 'panelImgZoom', TINT + ZOOM + SLACK) : Promise.resolve(),
            ]);
        } catch (err) {
            /* ★★ 这个 catch 是 P50 修 bug 时补上的，它本身就是一个教训。
               原来只有 try / finally：链子中途抛错时，finally 会把六个类全摘掉，
               页面上表现成"红遮罩刚盖满就瞬间消失、后面什么都不发生"，
               而**控制台里也什么都没有**（异常被 async 函数吞成了 rejected promise）。
               一行 warn 就能把"安静地坏掉"变成能查的东西。
               ★ 这里不 rethrow：一次换图失败不该往上报，
                 面板已经回到能用的状态了。 */
            if (window.console && console.warn) {
                console.warn('media-swap: 换图失败（面板已复位）', err);
            }
        } finally {
            /* 无论怎么出去的，都必须回到"活着的样子" ——
               否则留下一块红遮罩就是死画面。
               （sweep-out 的终态 = 静止态，所以摘掉它也不会闪。） */
            st.panel.classList.remove(
                'is-swap', 'is-sweep-in', 'is-sweep-out',
                'is-covering', 'is-uncovering', 'is-veiled');
        }
    }

    function stateOfPanel(panel) {
        for (let i = 0; i < states.length; i++) {
            if (states[i].panel === panel) return states[i];
        }
        return null;
    }

    /* ---------- 触发 ----------
       委托在 document 上（面板是静态的，不用逐个绑）。
       ★ 用**冒泡**阶段，不用捕获：js/crosshair.js 那两个捕获阶段的 click
         会 stopPropagation（框选确认 / 吞掉拖框松手那一下），
         于是"正在量取时点一下面板"不会顺手把底图也换掉 —— 正是我们要的。 */
    document.addEventListener('click', function (e) {
        if (!(e.target instanceof Element)) return;
        if (e.target.closest('#work-window')) return;        /* 浮窗里的不算 */
        const panel = e.target.closest('.media-panel');
        if (!panel) return;
        e.preventDefault();
        swap(stateOfPanel(panel));
    });

    /* 键盘：面板是 role=button + tabindex=0，回车 / 空格要和点一下等价。
       （浮窗那条回车路径已经不再接管 .media-panel，见 floating-window.js。）
       ★ 输入框里不抢键。 */
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const a = document.activeElement;
        if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
        if (!(e.target instanceof Element)) return;
        const panel = e.target.closest('.media-panel');
        if (!panel) return;
        e.preventDefault();                 /* 空格默认会滚页面 */
        swap(stateOfPanel(panel));
    });
})();
