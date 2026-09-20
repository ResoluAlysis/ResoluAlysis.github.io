/* ============================================================
   前景粒子层（虚焦 + 视差）
   ------------------------------------------------------------
   依赖：js/world.js（统一调度 + scrollX）、js/sprite.js（发光 sprite）
   ============================================================ */
(function foregroundParticles() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = document.getElementById('foreground-particles');
    if (!canvas || !window.World) return;
    const ctx = canvas.getContext('2d');

    /* ★ 移动端 CSS 把这一层 display:none 了。原来是在加载时判断一次
       isMobile 就 return，窗口放大回桌面后这一层永远不会启动。
       现在每次 onLayout 重新读一次 display。 */
    let enabled = true;

    /* ============ 可调参数 ============ */
    const CONFIG = {
        density:   0.00001,     // 粒子密度（比背景层稀）
        speedMax:  0.005,
        fadeMin:   0.002,
        fadeMax:   0.006,
        color:     '0,0,0',     // 只写 R,G,B；alpha 由 alphaBase 与粒子状态算
        alphaBase: 0.1,         // 单颗最大不透明度 —— 想让前景更明显就调大这里
        glow:      6,           // 光晕：sprite 内部的模糊半径（会随粒子缩放）
    };

    /* 视差层：越近的越大、越亮、跑得越快。
       ★ weight 必须累加到 1，否则 pickLayer() 抽到的随机数会有一批落空。 */
    const LAYERS = [
        { weight: 1.0, size: [5.0, 10.0], alpha: 1.0, parallax: [1.5, 2.0] },
    ];

    let dpr = 1, W = 0, H = 0;
    let particles = [];

    const sprite = window.makeGlowSprite({
        color: CONFIG.color,
        shape: 'circle',
        blur:  CONFIG.glow,
        size:  64,
    });
    const SPRITE_K = 1 / sprite.shapeRatio;

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
        canvas.width  = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.width  = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        enabled = getComputedStyle(canvas).display !== 'none';

        const target = Math.floor(W * H * CONFIG.density);
        const diff = target - particles.length;
        if (diff > 0) {
            for (let i = 0; i < diff; i++) particles.push(createParticle());
        } else if (diff < 0) {
            particles.length = target;
        }
    }

    /* ★ 粒子只在上下两条带内生成，每条带占屏高的 EDGE_RATIO */
    const EDGE_RATIO = 0.10;

    /* ============ 单个粒子 ============ */
    function createParticle() {
        const layer = pickLayer();
        const band = H * EDGE_RATIO;
        const bandTop = Math.random() < 0.5;
        return {
            x: Math.random() * W,
            // 固定分配到上带或下带，并在带内往返（见 update）
            y: bandTop ? Math.random() * band : H - Math.random() * band,
            bandTop: bandTop,
            r: rand(layer.size[0], layer.size[1]),
            vx: rand(-CONFIG.speedMax, CONFIG.speedMax),
            vy: rand(-CONFIG.speedMax, CONFIG.speedMax),
            opacity: Math.random(),
            fadeSpeed: rand(CONFIG.fadeMin, CONFIG.fadeMax),
            fadeDir: Math.random() < 0.5 ? 1 : -1,
            parallax: rand(layer.parallax[0], layer.parallax[1]),
            alphaMul: layer.alpha,
        };
    }

    /* ============ 更新 ============ */
    function update(p, dt) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // 横向：整屏环绕
        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;

        // 纵向：只在上下两条带内往返。
        // 原来的整屏环绕会让粒子慢慢漂到屏幕中间并留在那，把边缘带的意图破坏掉。
        const band = H * EDGE_RATIO;
        if (p.bandTop) {
            if (p.y < 0)    { p.y = 0;    p.vy =  Math.abs(p.vy); }
            if (p.y > band) { p.y = band; p.vy = -Math.abs(p.vy); }
        } else {
            const yMin = H - band;
            if (p.y < yMin) { p.y = yMin; p.vy =  Math.abs(p.vy); }
            if (p.y > H)    { p.y = H;    p.vy = -Math.abs(p.vy); }
        }

        p.opacity += p.fadeSpeed * p.fadeDir * dt;
        if (p.opacity >= 1) { p.opacity = 1; p.fadeDir = -1; }
        if (p.opacity <= 0) { p.opacity = 0; p.fadeDir = 1; }

        p.vx += (Math.random() - 0.5) * 0.01 * dt;
        p.vy += (Math.random() - 0.5) * 0.01 * dt;
        p.vx = Math.max(-CONFIG.speedMax, Math.min(CONFIG.speedMax, p.vx));
        p.vy = Math.max(-CONFIG.speedMax, Math.min(CONFIG.speedMax, p.vy));
    }

    /* ============ 绘制 ============ */
    /* 边缘淡出的宽度（占屏幕宽度的比例） */
    const EDGE_FADE = 0.15;

    function draw(p, scrollX) {
        let px = p.x - scrollX * p.parallax;
        px = ((px % W) + W) % W;

        /* 边缘淡出：靠近左右边界时 alpha 降到 0 */
        const fadeW = W * EDGE_FADE;
        let edgeAlpha = 1;
        if (px < fadeW) {
            edgeAlpha = px / fadeW;
        } else if (px > W - fadeW) {
            edgeAlpha = (W - px) / fadeW;
        }

        const alpha = p.opacity * p.alphaMul * edgeAlpha * CONFIG.alphaBase;
        if (alpha < 0.002) return;

        const half = p.r * SPRITE_K;
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprite, px - half, p.y - half, half * 2, half * 2);
    }

    /* ============ 主循环：交给 World ============ */
    function frame(dt) {
        if (!enabled || !W || !H) return;   // 被 CSS 隐藏（移动端）就别白算
        const scrollX = World.scrollX;

        ctx.clearRect(0, 0, W, H);
        for (const p of particles) {
            update(p, dt);
            draw(p, scrollX);
        }
        ctx.globalAlpha = 1;
    }

    /* ============ 启动 ============ */
    World.onLayout(resize);   // 注册时立刻跑一次；含字体加载完成
    World.onFrame(frame);
})();