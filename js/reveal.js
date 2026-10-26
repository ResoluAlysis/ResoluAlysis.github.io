/* ============================================================
   P106 / P111：滚动进场（reveal）
   ------------------------------------------------------------
   要的效果（参考站 openilink.com 上那种 `FadeIn`）：元素进入视口时淡入 +
   从下往上抬 24px，同一组的几个元素依次错开 100ms。
   参数全在 style.css 的 `html.reveal-on [data-reveal]` 那条里
   （--reveal-y / --reveal-dur / --reveal-ease，错开是 STAGGER_MS）。

   怎么标：给想演的元素写一个空的 `data-reveal` 属性就行，JS 自己扫。

   ★★ 三条设计上的硬要求（都是踩坑换来的，别改）：
   1. **隐藏态挂在 `html.reveal-on` 之下**，这个类由本文件在真正开始观察时
      才加。脚本没跑起来 / 报错 / 被拦掉时，页面是正常可见的 —— 不会白屏 ✓。
   2. **位移用 `translate`，不是 `transform`**。面板身上已经有 transform 的
      悬停与换图动画，写 transform 会把它们顶掉；`translate` 是独立的属性 ✓。
   3. **开屏结束后才开始观察**。开屏那几秒 main 是被锁住的（body.locked），
      提前观察会让"本来就在视口里"的元素在遮罩底下悄悄演完 ——
      开屏一拉开就已经是终态，等于白做 ✓。所以走 World.gate()。

   ★★ P111（你报的"1920×937 下第 4 块 03 编曲不进场"）：
   除 IntersectionObserver 之外再加一层**兜底判定**。原因不是参数：
   观察器只在"阈值跨越"时回调，这类边界情况（元素的盒子贴着视口边、
   比根还大、被 -50px 裁掉一截）它可能一声不响；而**没有被放行 = 永远
   opacity: 0 + 低 24px**，看起来就像"少了半块" ✗。
   兜底不依赖任何事件：滚动时用**缓存好的内容坐标**做纯算术判定
   （每帧只读一次 main.scrollLeft，一个 rect 都不读），判定条件和观察器
   完全一致（四边各内缩 50px），命中就放行。全部放行之后自动解绑 ✓。
   ============================================================ */
(function () {
    'use strict';

    const SEL = '[data-reveal]';
    /* ★ P107：错开步长 100ms —— 参考站的 `FadeIn` 调用里是手写的 `delay: .1`
       （`.08 / .1 / .15 / .2 / .3 / .7` 那几档），所以取最常见的那一档 ✓ */
    const STAGGER_MS = 100;
    /* ★ P111：和 rootMargin 的 -50px 必须是同一个数（两条路的判定要一致）*/
    const MARGIN = 50;

    const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let io = null;
    let started = false;

    /* 还没放行的元素（P111：兜底判定只扫这一批，全部放行后自动解绑）*/
    const pending = new Set();
    /* 每个待放行元素的"内容坐标"缓存：{ cx, cw, top, h }
       cx 是它相对**滚动内容**左缘的距离 —— 与当前滚到哪儿无关 ✓ */
    const boxes = new Map();
    let mainEl = null;
    let mainLeft = 0;
    let stopScroll = null;
    let stopLayout = null;
    let sweeping = false;

    /* 给同组元素编号（0、1、2…），CSS 用 --reveal-i 乘出错开延迟。
       ★ "同组"按**父元素**算：`.contact-list li` 的序号不会被页面上
         别的 [data-reveal] 带跑 ✓ */
    function indexGroup() {
        document.querySelectorAll(SEL).forEach((el) => {
            const parent = el.parentElement;
            const sibs = parent
                ? Array.prototype.filter.call(parent.children, (s) => s.hasAttribute && s.hasAttribute('data-reveal'))
                : [el];
            const i = sibs.indexOf(el);
            el.style.setProperty('--reveal-i', String(i < 0 ? 0 : i));
        });
    }

    function show(el) {
        el.classList.add('is-in');
        pending.delete(el);
        boxes.delete(el);
        if (io) io.unobserve(el);
    }

    function showAll() {
        document.querySelectorAll(SEL).forEach(show);
    }

    /* ============================================================
       兜底判定（P111）
       ------------------------------------------------------------
       缓存元素在"内容坐标系"里的位置；滚动时只做算术：
           视口左缘 = mainLeft + (cx - scrollLeft)
       命中条件和 IntersectionObserver 那条完全一致（四边各内缩 50px），
       所以两条路放行的时机是一样的，不会一个早一个晚 ✓
       ============================================================ */
    function cacheBoxes() {
        if (!mainEl) return;
        mainLeft = mainEl.getBoundingClientRect().left;
        boxes.clear();
        pending.forEach((el) => boxes.set(el, boxOf(el, mainEl.scrollLeft)));
    }

    /* ★ 唯一读 rect 的地方。缓存命中时**一帧一个 rect 都不读** ——
       站里的规矩是"滚动只读一次 scrollLeft"（见 world.js 的 --scroll-x）✓ */
    function boxOf(el, s) {
        const r = el.getBoundingClientRect();
        return {
            cx: r.left - mainLeft + s,
            cw: r.width,
            top: r.top,
            h: r.height,
        };
    }

    function sweep() {
        sweeping = false;
        if (!pending.size || !mainEl) return;

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const s = mainEl.scrollLeft;
        const rescued = [];

        pending.forEach((el) => {
            let b = boxes.get(el);
            if (!b) {                 /* 后插进来的元素：只给它补量一次 ✓ */
                b = boxOf(el, s);
                boxes.set(el, b);
            }
            const left = mainLeft + b.cx - s;
            /* ★ 只要"有交集"就算（不要求整块都在里面）—— 元素比视口还高、
               或者底边压出视口下沿，都是正常情况，绝不能因此不放行 ✗ */
            const hit = b.cw > 0 && b.h > 0 &&
                left + b.cw > MARGIN && left < vw - MARGIN &&
                b.top + b.h > MARGIN && b.top < vh - MARGIN;
            if (hit) { rescued.push(el); show(el); }
        });

        if (rescued.length) {
            /* 只在"观察器没放行、兜底救了它"时打一行 —— 以后同类问题一眼能看出来 */
            console.info('[reveal] 兜底放行 ' + rescued.length + ' 个（观察器没报）：'
                + rescued.map((el) => el.className || el.tagName).join(' / '));
        }
        if (!pending.size) unbind();
    }

    function queueSweep() {
        if (sweeping || !pending.size) return;
        /* 游乐区开着时整站被推开，这时候的坐标没意义 —— 不判 ✓ */
        if (document.body.classList.contains('sidebar-open')) return;
        sweeping = true;
        window.requestAnimationFrame(sweep);
    }

    function bind() {
        if (!window.World) return;
        mainEl = document.querySelector('main');
        if (!mainEl) return;
        cacheBoxes();
        if (typeof window.World.onScroll === 'function') stopScroll = window.World.onScroll(queueSweep);
        if (typeof window.World.onLayout === 'function') {
            stopLayout = window.World.onLayout(() => {
                if (!pending.size) return;
                cacheBoxes();
                queueSweep();
            });
        }
        /* 游乐区开合会改 main 的 left（整站被推开 100vw），坐标缓存要跟着重算 ✓ */
        document.addEventListener('transitionend', (e) => {
            const t = e.target;
            if (!t || !t.classList || !t.classList.contains('play-sidebar')) return;
            if (!pending.size) return;
            cacheBoxes();
            queueSweep();
        });
    }

    function unbind() {
        if (stopScroll) { stopScroll(); stopScroll = null; }
        if (stopLayout) { stopLayout(); stopLayout = null; }
        boxes.clear();
    }

    /* 观察当前页面上所有还没演的元素。
       ★ 动态插进来的内容（以后可能有的列表）只要 [data-reveal] 标好了，
         调一次 Reveal.scan() 就能接上 ✓ */
    function scan() {
        indexGroup();
        const all = document.querySelectorAll(SEL);
        if (!all.length) return;
        if (!io) { showAll(); return; }
        all.forEach((el) => {
            if (el.classList.contains('is-in')) return;
            pending.add(el);
            io.observe(el);
        });
    }

    function start() {
        if (started) return;
        started = true;

        /* ★ 顺序有意义：先亮出"可以藏"的类，再判断要不要观察。
           降低动效 / 没有 IntersectionObserver 时立刻全部显示 ——
           绝不能留下"藏起来又没人放行"的状态 ✓ */
        document.documentElement.classList.add('reveal-on');

        if (REDUCE || typeof window.IntersectionObserver !== 'function') {
            showAll();
            return;
        }

        /* ★ P107：观察参数照参考站的 `viewport` 抄 ——
           `{ once: true, margin: '-50px' }`：四条边各内缩 50px，
           也就是"元素真的进来 50px 才算数"。
           threshold 用 0（帧默认的 amount: "some"），配合那 50px 正好 ✓ */
        io = new window.IntersectionObserver((entries) => {
            entries.forEach((e) => { if (e.isIntersecting) show(e.target); });
        }, { root: null, rootMargin: '-50px', threshold: 0 });

        scan();
        bind();     /* ★ P111：兜底判定（见文件头）*/
    }

    if (window.World && typeof window.World.gate === 'function') {
        window.World.gate(start);
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }

    window.Reveal = {
        start: start,
        scan: scan,
        showAll: showAll,
        stagger: STAGGER_MS,
        /* 诊断用：还有几个没放行的（正常滚完一整趟之后应该是空的）*/
        pending: () => Array.from(pending),
    };
})();
