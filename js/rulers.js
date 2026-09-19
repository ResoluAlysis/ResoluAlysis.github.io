/* ============================================================
   屏幕坐标刻度尺（无数字）
   ============================================================ */

(function rulers() {
    const bottom = document.getElementById('ruler-bottom');
    const left   = document.getElementById('ruler-left');
    if (!bottom || !left) return;

    const dpr = window.devicePixelRatio || 1;
    const ACCENT = '225, 25, 25';
    const BG = '0, 0, 0, 0.55';

    function setup(canvas, w, h) {
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width  = w + 'px';
        canvas.style.height = h + 'px';
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return ctx;
    }

    function drawBottom() {
        const w = window.innerWidth;
        const h = 4;
        const ctx = setup(bottom, w, h);
        ctx.clearRect(0, 0, w, h);

        ctx.fillStyle = `rgba(${BG})`;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = `rgba(${ACCENT}, 0.7)`;
        ctx.fillRect(0, 0, w, 1);

        ctx.fillStyle = `rgba(${ACCENT}, 0.9)`;
        for (let x = 0; x <= w; x += 10) {
            const isMajor = x % 100 === 0;
            const isMid   = x % 50 === 0;
            const len = isMajor ? 14 : isMid ? 9 : 4;
            ctx.fillRect(x + 0.5, h - len, 1, len);
        }
    }

    function drawLeft() {
        const w = 4;
        const h = window.innerHeight;
        const ctx = setup(left, w, h);
        ctx.clearRect(0, 0, w, h);

        ctx.fillStyle = `rgba(${BG})`;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = `rgba(${ACCENT}, 0.7)`;
        ctx.fillRect(w - 1, 0, 1, h);

        ctx.fillStyle = `rgba(${ACCENT}, 0.9)`;
        for (let y = 0; y <= h; y += 10) {
            const isMajor = y % 100 === 0;
            const isMid   = y % 50 === 0;
            const len = isMajor ? 14 : isMid ? 9 : 4;
            const drawY = h - y;
            ctx.fillRect(w - len, drawY + 0.5, len, 1);
        }
    }

    function render() {
        drawBottom();
        drawLeft();
    }

    render();
    window.addEventListener('resize', render);
})();

/* ============================================================
   刻度尺位置指示三角
   ============================================================ */
(function rulerMarkers() {
    const mkX = document.querySelector('.ruler-marker-x');
    const mkY = document.querySelector('.ruler-marker-y');
    if (!mkX || !mkY) return;

    function tick() {
        const p = window.crosshairPos;
        if (p) {
            // translate(-50%) 保持三角形自身居中
            mkX.style.transform = `translateX(${p.x}px) translateX(-50%)`;
            mkY.style.transform = `translateY(${p.y}px) translateY(-50%)`;
            mkX.dataset.x = Math.round(p.x);
            mkY.dataset.y = Math.round(p.y);
        }
        requestAnimationFrame(tick);
    }
    tick();
})();