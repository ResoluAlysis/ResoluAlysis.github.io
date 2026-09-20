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
   刻度尺位置指示三角
   ============================================================ */
(function rulerMarkers() {
    const mkX = document.querySelector('.ruler-marker-x');
    const mkY = document.querySelector('.ruler-marker-y');
    if (!mkX || !mkY || !window.World) return;

    let lastX = null, lastY = null;
    let lastRx = null, lastRy = null;

    function place(x, y) {
        if (x === lastX && y === lastY) return;   // 位置没变就一个 DOM 都不碰

        lastX = x;
        lastY = y;

        // translate(-50%) 保持三角形自身居中
        mkX.style.transform = `translateX(${x}px) translateX(-50%)`;
        mkY.style.transform = `translateY(${y}px) translateY(-50%)`;

        /* 数字标签走的是 content: attr(data-x)，改 dataset 会让伪元素重算样式；
           所以只在整数位真的变了时才写（原来是每帧无条件写）。 */
        const rx = Math.round(x), ry = Math.round(y);
        if (rx !== lastRx) { mkX.dataset.x = rx; lastRx = rx; }
        if (ry !== lastRy) { mkY.dataset.y = ry; lastRy = ry; }
    }

    /* ★ 直接订阅准星位置（main.js 在 applyOrigin() 里同一帧推送），
       而不是在 World.onFrame 里轮询 —— 轮询会引入一帧错位，
       鼠标快速移动时三角形会明显拖在准星后面。 */
    if (window.onCrosshair) {
        window.onCrosshair(place);
    } else {
        // 兜底：没有订阅接口（准星元素缺失等）时退回轮询
        World.onFrame(() => {
            const p = window.crosshairPos;
            if (p) place(p.x, p.y);
        });
    }
})();