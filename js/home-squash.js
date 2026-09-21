/* ============================================================
   #home 的 h1：靠近导航栏时上下压成一条线
   ------------------------------------------------------------
   页面横向滚动时，home 这一节往左走，h1 会越来越靠近左侧导航栏。
   把「h1 左边缘离导航栏右边缘还有多远」映射成纵向缩放：
       远（>= RANGE）  → scaleY = 1
       贴到导航栏      → scaleY = 0，同时 h1::after 那条 1px 线全亮
   只压纵向（scale 的第一个值是 1），宽度不变 —— 所以是"上下收缩"。
   压到 0 的那一刻，原地是一条真正的 1px 线（h1::after，不在缩放里）。

   为什么这样做：
     · 只读一次几何（在 onLayout / 开屏结束后各量一次），
       滚动时只用 World 缓存的 scrollX 做算术 —— 每帧零布局读取；
     · 每帧只写一个 CSS 变量，浏览器改的是 scale 属性（合成器那档）；
     · 中心收缩：用独立的 scale 属性，不动 transform（hero 那边有
       translateX 补偿，写进同一条 transform 会打架）。
   ============================================================ */
(function homeSquash() {
    const h1 = document.querySelector('#home h1');
    const nav = document.querySelector('.navbar');
    if (!h1 || !window.World) return;

    const RANGE = 100;     // 在离导航栏多少 px 内开始压（越大越早开始）
    const LINE_FROM = 0.35; // 缩放小于这个值时，那条 1px 线开始浮现（到 0 时全亮）

    let baseX = 0;         // 没滚动时，h1 左边缘在视口里的 x
    let barRight = 0;      // 导航栏右边缘的 x

    function draw(scrollX) {
        /* 离导航栏还有多远（px）。baseX 是"未滚动"时的位置，
           所以直接减 scrollX 就能还原出当前视口位置。 */
        const d = (baseX - scrollX) - barRight;
        const t = Math.max(0, Math.min(1, d / RANGE));

        /* 曲线：先慢后快（t³）。想缓一点写 t*t，想更"突然"写 t^4 */
        const s = t * t;                              // 1 → 0

        h1.style.setProperty('--hero-squash', s.toFixed(4));

        /* 压到 LINE_FROM 以下时那条真正的线开始浮现，s = 0 时全亮 ——
           视觉上就是"文字收成了一条线"。 */
        const line = Math.max(0, Math.min(1, (LINE_FROM - s) / LINE_FROM));
        h1.style.setProperty('--hero-line', line.toFixed(3));
    }

    function measure() {
        const r = h1.getBoundingClientRect();
        baseX = r.left + World.scrollX;                    // 换算回未滚动的位置
        barRight = nav ? nav.getBoundingClientRect().right : 0;
        draw(World.scrollX);
    }

    World.onLayout(measure);      // resize / 字号变化（注册时立刻跑一次）
    World.gate(measure);          // 开屏结束后再量一次：开屏期间 .page-zoom 是缩放态
    World.onScroll(draw);         // 只在滚动位置变化时触发
})();
