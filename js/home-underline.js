/* ============================================================
   #home 的标题下划线 + media-panel 红框
   ------------------------------------------------------------
   ★ P30：这两件装饰目前**整体关掉了**（见下面的 ENABLED 开关）。
     下面的说明保留着，想恢复的时候照它调就行。
   ------------------------------------------------------------
   一条**独立**的固定线（.hero-underline，见 style.css）：
     · 左端永远钉在导航栏右边缘 —— 不跟着文字滑走；
     · 长度 = scaleX(0 → 1)，1 对应「铺到页面右侧」。
   延长分两段，这样每个节点都落在你要求的位置上：
     ① 文字还在滑出的那段滚动    → 线长 0 → h1 的宽度
        （正好一直盖在可见的那段文字下面，看着像"跟着画"）
     ② 长到屏幕右缘那一刻，正好是 media 容器刚进入视口 —— 此后线不再延长，
        右端钉在 media 容器左边缘，被它一路"吃"短，直到它贴住导航栏时归零
   几何只在 World.onLayout / 开屏结束后各量一次，滚动时只用缓存的
   scrollX 做算术 —— 每帧零布局读取，只写一个 CSS 变量。
   ============================================================ */
(function homeUnderline() {
    'use strict';

    /* ============================================================
       ★ 总开关（P30）：这个模块只做两件装饰，现在**两件都按要求关掉了**。
         · false → 标题下划线 + media-panel 红框 都不注册（整段直接 return）
         · true  → 两件一起回来
       ★ 关掉是安全的，不会留下"残影"：
         · `.hero-underline` 是 index.html 里的静态元素，靠 `--hero-line`
           驱动；没人写这个变量时，CSS 里那条
           `transform: scaleX(var(--hero-line, 0))` 的**兜底 0** 会让它
           scaleX(0) —— 也就是不可见。**这个兜底不能删**：删了的话变量一缺失，
           整条声明在计算时就非法，transform 回落到初始值 none，
           那条线会以满宽露出来（这正是 P26 踩过的 var() 陷阱）。
         · `.panel-frame` 是这里注入的，不注册就根本没有元素。
       ★ 顺便：这个模块原来还负责"每帧零布局读取"的几何计算，
         关掉之后它连 World 都不订阅了，滚动时一点开销都没有。 */
    const ENABLED = false;
    if (!ENABLED) return;

    const h1 = document.querySelector('#home h1');
    const nav = document.querySelector('.navbar');
    const line = document.querySelector('.hero-underline');
    const panelBox = document.querySelector('#media .media-panels') || document.querySelector('#media');
    if (!h1 || !nav || !line || !panelBox || !window.World) return;

    const GAP_EM = 0.45;      // 与 CSS 注释同源：行盒底再往上收一点，贴住字底
    const SLOW = 1.6;         // 红框整体放慢的倍数：1 = 正好在 media 容器贴住导航栏时画完，
                              // 1.6 = 多花 60% 的滚动距离，每条边都更从容

    let barRight = 0;         // 导航栏右边缘的 x
    let baseX = 0;            // 未滚动时 h1 左边缘的 x
    let width = 0;            // h1 的宽度
    let contact = 0;          // h1 左边缘贴上导航栏时的 scrollX
    let fullLen = 1;          // 线的最大长度（= 视口宽 - 导航栏宽）
    let mediaLeft0 = 0;       // 未滚动时 media 面板容器左边缘的 x
    let mediaEnter = 0;       // 它刚进入视口右侧时的 scrollX（线在这一刻长满）
    let mediaArrive = 0;      // 它的左边缘贴到导航栏时的 scrollX（线被吃光、四个框也画完）

    /* 给每个 media-panel 注入一个"红框"（四条边，见 CSS 的 .panel-frame） */
    const frames = Array.from(document.querySelectorAll('.media-panel')).map((panel) => {
        const f = document.createElement('span');
        f.className = 'panel-frame';
        f.setAttribute('aria-hidden', 'true');
        ['t', 'r', 'b', 'l'].forEach((k) => {
            const e = document.createElement('i');
            e.className = 'pf-' + k;
            f.appendChild(e);
        });
        panel.appendChild(f);
        return f;
    });

    function draw(scrollX) {
        /* ---------- 线：右端 = min(长满, media 容器左边缘) ----------
           ① 长满：从文字碰到导航栏开始，到 media 容器刚进入视口右侧为止，
              线从 0 长到 rightLen（= 视口宽 - 导航栏宽，也就是长到屏幕右缘）；
           ② 钳住：media 容器一进画面，它的左边缘就比"长满的位置"更靠左，
              于是 min() 取它 —— 线右端从此钉在 media 容器左边缘上，
              跟着它一起向左，线就越来越短，直到 media 容器贴到导航栏时归零。 */
        const growT = mediaEnter > contact ? (scrollX - contact) / (mediaEnter - contact) : 1;
        const growLen = fullLen * Math.max(0, Math.min(1, growT));
        const mediaEdge = mediaLeft0 - scrollX;
        const len = Math.max(0, Math.min(growLen, mediaEdge - barRight));
        line.style.setProperty('--hero-line', (len / fullLen).toFixed(4));

        /* ---------- 红框：接着"线的进度"往下走 ----------
           四个面板按顺序各画完一个框（每个占 1/4 时间段）。
           边框本身按 左 → 上+下 → 右 依次出现（见 style.css 的 .panel-frame）；
           SLOW 把整段拉长，所以每条边都比"刚好画完"更慢。 */
        const span = Math.max(1, (mediaArrive - mediaEnter) * SLOW);
        const P = Math.max(0, Math.min(1, (scrollX - mediaEnter) / span));
        frames.forEach((f, i) => {
            const p = Math.max(0, Math.min(1, (P - i / frames.length) * frames.length));
            f.style.setProperty('--pf', p.toFixed(4));
        });
    }

    function measure() {
        const r = h1.getBoundingClientRect();
        const fs = parseFloat(getComputedStyle(h1).fontSize) || 0;

        barRight = nav.getBoundingClientRect().right;
        baseX = r.left + World.scrollX;                   // 换算回未滚动的位置
        width = r.width;
        fullLen = Math.max(1, window.innerWidth - barRight);
        const pr = panelBox.getBoundingClientRect();
        mediaLeft0 = pr.left + World.scrollX;         // 换算回未滚动的位置
        mediaEnter = mediaLeft0 - window.innerWidth;  // 它刚进入视口右侧
        mediaArrive = mediaLeft0 - barRight;          // 它贴到导航栏
        contact = baseX - barRight;

        /* 纵向：h1 盒底往上 0.45em —— 线是固定元素，所以量完写进变量 */
        line.style.setProperty('--hero-line-y', (r.bottom - GAP_EM * fs).toFixed(1) + 'px');
        draw(World.scrollX);
    }

    World.onLayout(measure);      // resize / 字号变化（注册时立刻跑一次）
    World.gate(measure);          // 开屏结束后再量一次：开屏期间 .page-zoom 是缩放态
    World.onScroll(draw);         // 只在滚动位置变化时触发
})();
