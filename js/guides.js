/* ============================================================
   参考线 / 参考坐标系
   ============================================================ */
(function guideLayer() {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) return;

    const canvas = document.getElementById('guide-layer');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const main = document.querySelector('main');

    /* ============ 可调参数 ============ */
    const STEP_MINOR = 250;      // 小格 50px
    const STEP_MAJOR = 500;     // 大格 200px
    const COLOR_MINOR = 'rgba(25, 25, 25, 0.10)';
    const COLOR_MAJOR = 'rgba(225, 25, 25, 0.25)';
    const COLOR_LABEL = 'rgba(225, 25, 25, 0.4)';
    const FONT = '10px ui-monospace, Consolas, monospace';

    let dpr = 1, W = 0, H = 0;

    /* ============ 尺寸 ============ */
    function resize() {
        dpr = window.devicePixelRatio || 1;
        W = canvas.clientWidth;
        H = canvas.clientHeight;
        canvas.width  = W * dpr;
        canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* ============ 画一条竖线 + 标签 ============ */
    function vline(screenX, wx, isMajor) {
        ctx.beginPath();
        ctx.strokeStyle = isMajor ? COLOR_MAJOR : COLOR_MINOR;
        ctx.lineWidth = 1;
        ctx.moveTo(screenX + 0.5, 0);
        ctx.lineTo(screenX + 0.5, H);
        ctx.stroke();

        if (isMajor) {
            ctx.fillStyle = COLOR_LABEL;
            ctx.font = FONT;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(`${wx}`, screenX + 4, 6);
        }
    }

    /* ============ 画一条横线 + 标签 ============ */
    function hline(screenY, wy, isMajor) {
        ctx.beginPath();
        ctx.strokeStyle = isMajor ? COLOR_MAJOR : COLOR_MINOR;
        ctx.lineWidth = 1;
        ctx.moveTo(0, screenY + 0.5);
        ctx.lineTo(W, screenY + 0.5);
        ctx.stroke();

        if (isMajor) {
            ctx.fillStyle = COLOR_LABEL;
            ctx.font = FONT;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${wy}`, 6, screenY);
        }
    }

    /* ============ 主循环 ============ */
    let rafId = null;
    function loop() {
        const scrollX = main ? main.scrollLeft : 0;

        ctx.clearRect(0, 0, W, H);

        /* ----- 垂直参考线（世界坐标） ----- */
        // 只画视口内的范围
        const worldStart = Math.floor(scrollX / STEP_MINOR) * STEP_MINOR;
        const worldEnd   = scrollX + W;

        for (let wx = worldStart; wx <= worldEnd; wx += STEP_MINOR) {
            const screenX = wx - scrollX;
            const isMajor = wx % STEP_MAJOR === 0;
            vline(screenX, wx, isMajor);
        }

        /* ----- 水平参考线（视口坐标） ----- */
        for (let wy = 0; wy <= H; wy += STEP_MINOR) {
            const isMajor = wy % STEP_MAJOR === 0;
            hline(wy, wy, isMajor);
        }

        /* ----- 世界原点标记 ----- */
        const originX = 0 - scrollX;
        if (originX >= 0 && originX <= W) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(225, 25, 25, 0.9)';
            ctx.lineWidth = 2;
            ctx.moveTo(originX + 0.5, 0);
            ctx.lineTo(originX + 0.5, H);
            ctx.stroke();
        }

        rafId = requestAnimationFrame(loop);
    }

    /* ============ 启动 ============ */
    resize();
    window.addEventListener('resize', resize);
    loop();

    /* ============ 切后台暂停 ============ */
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            cancelAnimationFrame(rafId);
            rafId = null;
        } else if (!rafId) {
            loop();
        }
    });
})();