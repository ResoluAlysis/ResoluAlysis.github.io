/* ============================================================
   前景粒子层（模糊 + 视差）
   ============================================================ */
(function foregroundParticles() {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) return;

    const canvas = document.getElementById('foreground-particles');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const mainEl = document.querySelector('main');

    /* ============ 可调参数 ============ */
    const CONFIG = {
        density:     0.00001,      // 粒子密度（比背景层稀）
        speedMin:    0.001,
        speedMax:    0.005,
        fadeMin:     0.002,
        fadeMax:     0.006,
        color:       '0,0,0,0.1',   // 白色前景粒子
        glow:        4,                  // 发光半径
        blur:        '1px',            // 每个粒子的额外模糊（在 ctx 上做）
    };

    /* 分三层视差：越"近"的越大、越亮、跑得越快 */
    const LAYERS = [
        { weight: 0.15, size: [10.0, 5.0],  alpha: 0.60, parallax: [2, 1.5] },
    ];

    let dpr = 1, W = 0, H = 0;
    let particles = [];

    const rand = (a, b) => a + Math.random() * (b - a);

    function pickLayer() {
        const r = Math.random();
        let acc = 0;
        for (const l of LAYERS) {
            acc += l.weight;
            if (r <= acc) return l;
        }
        return LAYERS[LAYERS.length - 1];
    }

    /* ============ 尺寸 ============ */
    function resize() {
        dpr = window.devicePixelRatio || 1;
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width  = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width  = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const target = Math.floor(W * H * CONFIG.density);
        const diff = target - particles.length;
        if (diff > 0) {
            for (let i = 0; i < diff; i++) particles.push(createParticle());
        } else if (diff < 0) {
            particles.length = target;
        }
    }

    /* ★ 粒子只在上下两条带内生成 */
    const EDGE_RATIO = 0.10;   // 上下各占屏幕高度的 25%

    function randomEdgeY() {
        // 50% 概率在上带，50% 在下带
        return Math.random() < 0.5
            ? Math.random() * H * EDGE_RATIO                      // 顶部带
            : H - Math.random() * H * EDGE_RATIO;                 // 底部带
    }
    /* ============ 单个粒子 ============ */
    function createParticle() {
        const layer = pickLayer();
        return {
            x: Math.random() * W,
            y: randomEdgeY(),
            r: rand(layer.size[0], layer.size[1]),
            vx: rand(-CONFIG.speedMax, CONFIG.speedMax),
            vy: rand(-CONFIG.speedMax, CONFIG.speedMax),
            opacity: Math.random(),
            fadeSpeed: rand(CONFIG.fadeMin, CONFIG.fadeMax),
            fadeDir: Math.random() < 0.5 ? 1 : -1,
            parallax: rand(layer.parallax[0], layer.parallax[1]),   // ★ 视差系数
            alphaMul: layer.alpha,
        };
    }

    /* ============ 更新 ============ */
    function update(p) {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10;
        if (p.y > H + 10) p.y = -10;

        p.opacity += p.fadeSpeed * p.fadeDir;
        if (p.opacity >= 1) { p.opacity = 1; p.fadeDir = -1; }
        if (p.opacity <= 0) { p.opacity = 0; p.fadeDir = 1; }

        p.vx += (Math.random() - 0.5) * 0.01;
        p.vy += (Math.random() - 0.5) * 0.01;
        p.vx = Math.max(-CONFIG.speedMax, Math.min(CONFIG.speedMax, p.vx));
        p.vy = Math.max(-CONFIG.speedMax, Math.min(CONFIG.speedMax, p.vy));
    }

    /* ============ 绘制 ============ */
    /* 边缘淡出的宽度（占屏幕宽度的比例） */
    const EDGE_FADE = 0.15;

    function draw(p, scrollX) {
        let px = p.x - scrollX * p.parallax;
        px = ((px % W) + W) % W;

        /* ★ 边缘淡出：靠近左右边界 alpha 降到 0 */
        const fadeW = W * EDGE_FADE;
        let edgeAlpha = 1;
        if (px < fadeW) {
            edgeAlpha = px / fadeW;
        } else if (px > W - fadeW) {
            edgeAlpha = (W - px) / fadeW;
        }

        const alpha = p.opacity * p.alphaMul * edgeAlpha;

        /* alpha 接近 0 直接跳过绘制，省一点性能 */
        if (alpha < 0.01) return;

        const fill = `rgba(${CONFIG.color})`;

        ctx.beginPath();
        ctx.arc(px, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = fill;

        if (CONFIG.glow > 0) {
            ctx.shadowBlur = CONFIG.glow;
            ctx.shadowColor = `rgba(${CONFIG.color}, ${alpha * 0.7})`;
        } else {
            ctx.shadowBlur = 0;
        }
        ctx.fillStyle = fill;
        ctx.fillRect(px - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }

    /* ============ 主循环 ============ */
    let rafId = null;
    function loop() {
        const scrollX = mainEl ? mainEl.scrollLeft : 0;

        ctx.clearRect(0, 0, W, H);
        for (const p of particles) {
            update(p);
            draw(p, scrollX);
        }
        rafId = requestAnimationFrame(loop);
    }

    /* ============ 启动 ============ */
    resize();
    window.addEventListener('resize', resize);
    loop();

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            cancelAnimationFrame(rafId);
            rafId = null;
        } else if (!rafId) {
            loop();
        }
    });
})();