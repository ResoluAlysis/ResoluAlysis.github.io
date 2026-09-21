/* ============================================================
   屏幕坐标刻度尺（HUD 边缘装饰，无数字）
   ============================================================ */

(function rulers() {
    const bottom = document.getElementById('ruler-bottom');
    const left   = document.getElementById('ruler-left');
    if (!bottom || !left || !window.World) return;

    /* ============================================================
       视觉规格 —— 它只是边缘装饰，所以对比度刻意压低。
       想更明显 / 更淡，只改这里的几个 alpha 就够了。
       刻度只有两级：主刻度（每 stepMajor）+ 次刻度（每 stepMinor）。
       ============================================================ */
    const STYLE = {
        accent:     '225, 25, 25',
        bg:         '0, 0, 0, 0.30',   // 底色带（原来是 0.55，偏重）
        edgeAlpha:  0.40,              // 贴内容那一侧的亮边
        majorAlpha: 0.50,              // 主刻度
        minorAlpha: 0.22,              // 次刻度
        stepMinor:  10,                // 次刻度间距（CSS px）
        stepMajor:  100,               // 主刻度间距（CSS px）
        lenMajor:   0.92,              // 主刻度长度 = 尺子厚度 × 该比例
        lenMinor:   0.32,              // 次刻度长度 = 尺子厚度 × 该比例
    };

    /* devicePixelRatio 会在换显示器 / 改系统缩放时变化，所以每次重画都重读 */
    let dpr = window.devicePixelRatio || 1;

    /* 只负责设定「后备缓冲区」像素尺寸，CSS 尺寸完全交给 style.css。
       ★ 这里故意不写 setTransform(dpr)：下面所有绘制都在「设备像素」坐标系
         里取整数。这样 1px 细线在 dpr = 1 / 1.25 / 1.5 / 2 下都是干净的；
         之前是 setTransform(dpr) 再把坐标写成 x + 0.5，在 125% / 150%
         系统缩放下会糊成 2px 灰边 —— 细线最忌这个。
       ★ 也千万不要在这里写 canvas.style.width/height：内联样式会盖掉 CSS
         的宽高，之后 resize 时 clientWidth 读到的永远是旧值。
       ============================================================ */
    function setup(canvas, wCss, hCss) {
        canvas.width  = Math.round(wCss * dpr);
        canvas.height = Math.round(hCss * dpr);
        return canvas.getContext('2d');
    }

    /* 一套刻度参数：把「步长 / 长度 / 线宽」都换算到设备像素。
       注意主刻度必须取成次刻度的整数倍 —— 否则在小数 dpr（1.25 / 1.5）下
       两次四舍五入会让主刻度错开次刻度网格，看起来像刻度歪了。 */
    function metrics(thickness) {
        const line  = Math.max(1, Math.round(dpr));                      // 1 CSS px 线宽
        const minor = Math.max(2, Math.round(STYLE.stepMinor * dpr));
        const ratio = Math.max(1, Math.round(STYLE.stepMajor / STYLE.stepMinor));
        const major = minor * ratio;
        return {
            line:  line,
            minor: minor,
            major: major,
            lenM:  Math.max(2, Math.round(thickness * STYLE.lenMajor)),
            lenm:  Math.max(1, Math.round(thickness * STYLE.lenMinor)),
        };
    }

    /* 底尺：亮边在「上」（贴内容），刻度贴「下」（外侧）生长 */
    function drawBottom() {
        const wCss = Math.round(bottom.clientWidth) || window.innerWidth;
        const hCss = Math.round(bottom.clientHeight) || 8;
        const ctx  = setup(bottom, wCss, hCss);
        const W = Math.round(wCss * dpr);
        const H = Math.round(hCss * dpr);
        const m = metrics(H);

        ctx.fillStyle = `rgba(${STYLE.bg})`;
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = `rgba(${STYLE.accent}, ${STYLE.edgeAlpha})`;
        ctx.fillRect(0, 0, W, m.line);

        // 分两趟画：次刻度先、主刻度后（主压次），全程只切两次 fillStyle
        ctx.fillStyle = `rgba(${STYLE.accent}, ${STYLE.minorAlpha})`;
        for (let x = m.minor; x < W; x += m.minor) {
            if (x % m.major === 0) continue;
            ctx.fillRect(x, H - m.lenm, m.line, m.lenm);
        }
        ctx.fillStyle = `rgba(${STYLE.accent}, ${STYLE.majorAlpha})`;
        for (let x = 0; x < W; x += m.major) {
            ctx.fillRect(x, H - m.lenM, m.line, m.lenM);
        }
    }

    /* 左尺：亮边在「右」（贴内容），刻度贴「左」（外侧）生长；
       原点在底边，所以 y 从 0 往上排，和视口纵坐标一致 */
    function drawLeft() {
        const wCss = Math.round(left.clientWidth) || 8;
        const hCss = Math.round(left.clientHeight) || window.innerHeight;
        const ctx  = setup(left, wCss, hCss);
        const W = Math.round(wCss * dpr);
        const H = Math.round(hCss * dpr);
        const m = metrics(W);

        ctx.fillStyle = `rgba(${STYLE.bg})`;
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = `rgba(${STYLE.accent}, ${STYLE.edgeAlpha})`;
        ctx.fillRect(W - m.line, 0, m.line, H);

        ctx.fillStyle = `rgba(${STYLE.accent}, ${STYLE.minorAlpha})`;
        for (let y = m.minor; y < H; y += m.minor) {
            if (y % m.major === 0) continue;
            ctx.fillRect(0, H - y - m.line, m.lenm, m.line);
        }
        ctx.fillStyle = `rgba(${STYLE.accent}, ${STYLE.majorAlpha})`;
        for (let y = 0; y < H; y += m.major) {
            ctx.fillRect(0, H - y - m.line, m.lenM, m.line);
        }
    }

    function render() {
        // 移动端 CSS 已经把刻度尺 display:none，不必再空画一遍
        if (getComputedStyle(bottom).display === 'none') return;
        dpr = window.devicePixelRatio || 1;   // 换显示器 / 改缩放会变
        drawBottom();
        drawLeft();
    }

    /* 尺寸变化 / 字体加载完成 → 重画（render() 内部已判断移动端隐藏） */
    World.onLayout(render);
})();

/* ============================================================
   刻度尺位置指示三角 + 读数（P31：每条准星线配一个三角）
   ------------------------------------------------------------
   底尺两个三角跟两条垂直线的 x（x1 左 / x2 右），左尺两个跟两条水平线
   的 y（y1 上 / y2 下）。四个都是**直角三角形**（见 style.css），
   朝"离开准星框"的方向伸出去：
     x1 向左上、x2 向右上、y1 向上右、y2 向下右。
   所以每个三角"那条腿"（代表线位置的那条边）在盒子上的位置不同：
     x1 的腿在盒子右边缘 → 元素要往负方向挪整个宽度（translateX(-100%)）
     x2 的腿在盒子左边缘 → 不偏移
     y1 的腿在盒子下边缘 → translateY(-100%)
     y2 的腿在盒子上边缘 → 不偏移
   这就是下面 chans 里 anchor 字段的意思。

   读数：**同一把尺子上的两个三角共用一个**，放在两者中点。
     · 准星展开（吸住元素）时 → 两个三角的间隔像素
     · 准星完全合并时        → 准星在该轴上的坐标
   读数不能再挂在三角身上（两者会张开到几百像素远），所以是独立元素。
   ============================================================ */
(function rulerMarkers() {
    /* ★ 按**出现顺序**取，第 1 个跟 1 号。拿不到整整两个就整套不启用。 */
    const xs = [...document.querySelectorAll('.ruler-marker-x')];
    const ys = [...document.querySelectorAll('.ruler-marker-y')];
    const rdX = document.querySelector('.ruler-read-x');
    const rdY = document.querySelector('.ruler-read-y');
    const bdX = document.querySelector('.ruler-band-x');
    const bdY = document.querySelector('.ruler-band-y');
    if (xs.length !== 2 || ys.length !== 2 ||
        !rdX || !rdY || !bdX || !bdY || !window.World) return;

    /* anchor: 'end' = 代表线位置的那条腿在盒子末端，要往负方向挪 100% */
    const chans = [
        { el: xs[0], axis: 'x', i: 0, anchor: 'end' },
        { el: xs[1], axis: 'x', i: 1, anchor: 'start' },
        { el: ys[0], axis: 'y', i: 0, anchor: 'end' },
        { el: ys[1], axis: 'y', i: 1, anchor: 'start' },
    ].map((c) => Object.assign(c, { last: null }));

    let lastMidX = null, lastMidY = null;
    let lastTxtX = null, lastTxtY = null;
    let lastBandX = null, lastBandY = null;

    function place(x1, x2, y1, y2) {
        /* ---------- 三角 ---------- */
        const vals = { x: [x1, x2], y: [y1, y2] };
        for (const c of chans) {
            const v = vals[c.axis][c.i];
            if (v === c.last) continue;          // 这个三角没动，别碰 DOM
            c.last = v;

            const A = c.axis.toUpperCase();
            c.el.style.transform = c.anchor === 'end'
                ? `translate${A}(${v}px) translate${A}(-100%)`
                : `translate${A}(${v}px)`;
        }

        /* ---------- 读数：中点 + 内容 ---------- */
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        if (midX !== lastMidX) {
            lastMidX = midX;
            rdX.style.transform = `translateX(${midX}px) translateX(-50%)`;
        }
        if (midY !== lastMidY) {
            lastMidY = midY;
            rdY.style.transform = `translateY(${midY}px) translateY(-50%)`;
        }

        /* ---------- 读数：中点 + 内容 ----------
           ★ P38/P40：读数显示什么，看的是**仪器有没有在读一个跨度**
             （body.crosshair-measuring —— 吸住元素和拖框量取都是它），
             不是"两条线合拢了没有"。所以**一松手就立刻变回中点坐标**，
             不用等它们动画收回原位 —— 那个等待期里显示一个正在缩小的
             间隔数字没有意义，而中点坐标是此刻读数所在的位置，一直是真的。
             测量中 → 两个三角的间隔像素（顺带就是框 / 元素的宽高）；
             其余   → 中点坐标（读数本来就摆在中点上，标签和位置自洽）。
           判据用 class 而不是让 crosshair.js 多传一个参数：
           这个类本来就是"在读跨度没有"的唯一出口，读它等于读同一个事实，
           也省得再改一次订阅签名。 */
        const measuring = document.body.classList.contains("crosshair-measuring");
        const gapX = Math.abs(x2 - x1);
        const gapY = Math.abs(y2 - y1);
        const txtX = measuring ? String(Math.round(gapX)) : String(Math.round(midX));
        const txtY = measuring ? String(Math.round(gapY)) : String(Math.round(midY));

        /* 只在文字真的变了时才写 —— 改 textContent 会让浏览器重排这一小块 */
        if (txtX !== lastTxtX) { lastTxtX = txtX; rdX.textContent = txtX; }
        if (txtY !== lastTxtY) { lastTxtY = txtY; rdY.textContent = txtY; }

        /* ---------- 条带：从 x1/y1 那头拉出来，正好盖住 [x1, x2] / [y1, y2] ----------
           CSS 里条带的宽度写的是 100vw、高度 100vh，所以 scale 的比率就是
           「间隔 ÷ 视口」。★★ transform-origin 在 CSS 里钉死了左边 / 上边，
           否则它会从中间往两头长，看起来不像"从三角那里拉出来"。
           用 transform 而不是 left/width：走合成器、不触发布局，
           而且和准星线用的是同一套做法。
           显隐不在这里管 —— 那是 body.crosshair-snap 的活（CSS 管淡入淡出）。 */
        const vw = window.innerWidth || 1;
        const vh = window.innerHeight || 1;
        const tx = `translateX(${x1.toFixed(2)}px) scaleX(${(Math.max(0, x2 - x1) / vw).toFixed(6)})`;
        const ty = `translateY(${y1.toFixed(2)}px) scaleY(${(Math.max(0, y2 - y1) / vh).toFixed(6)})`;
        if (tx !== lastBandX) { lastBandX = tx; bdX.style.transform = tx; }
        if (ty !== lastBandY) { lastBandY = ty; bdY.style.transform = ty; }
    }

    /* ★ 直接订阅准星位置（main.js 在 apply() 里同一帧推送），
       而不是在 World.onFrame 里轮询 —— 轮询会引入一帧错位，
       鼠标快速移动时三角形会明显拖在准星后面。
       ★ P31：签名从 (x, y) 变成 (x1, x2, y1, y2)。 */
    if (window.onCrosshair) {
        window.onCrosshair(place);
    } else {
        // 兜底：没有订阅接口（准星元素缺失等）时退回轮询
        World.onFrame(() => {
            const p = window.crosshairPos;
            if (!p) return;
            const p2x = (p.x2 === undefined) ? p.x : p.x2;
            const p2y = (p.y2 === undefined) ? p.y : p.y2;
            place(p.x, p2x, p.y, p2y);
        });
    }
})();