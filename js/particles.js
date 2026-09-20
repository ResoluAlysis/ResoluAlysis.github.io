/* ============================================================
   全屏粒子层（带横向视差）
   ------------------------------------------------------------
   依赖：js/world.js（统一调度 + scrollX）、js/sprite.js（发光 sprite）
   ============================================================ */
(function particleLayer() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = document.getElementById('particle-layer');
    if (!canvas || !window.World) return;
    const ctx = canvas.getContext('2d');

    /* ============ 可调参数 ============ */
    const CONFIG = {
        density:  0.0002,       // 粒子密度
        speedMax: 0.05,         // 每帧最大位移（px，60fps 基准；dt 已归一化）
        fadeMin:  0.001,        // 淡入淡出最小速度（每帧）
        fadeMax:  0.01,         // 淡入淡出最大速度
        color:    '0, 0, 0',    // 粒子 RGB，想红就 '225, 25, 25'
        /* 光晕：sprite 内部的模糊半径（sprite 像素）。
           ★ 换了 sprite 之后光晕是跟着粒子一起缩放的，不再是固定的 3px。
             粒子看起来太硬/太小 → 调大这个值；太糊 → 调小。
             想让不同层有不同柔度，就给每层各建一张 sprite。 */
        glow:     10,
    };

    /* ============ 视差分层 ============
       parallax 越大 → 看起来越近（跟滚动跑得越快）
       parallax 越小 → 看起来越远（几乎不动）
    */
    const LAYERS = [
        { weight: 0.5, parallax: [-0.10, 0.25], size: [0.4, 0.9], alpha: 0.35 }, // 远景
        { weight: 0.3, parallax: [0.35, 0.60], size: [0.7, 1.3], alpha: 0.55 }, // 中景
        { weight: 0.2, parallax: [0.70, 1.50], size: [1.5, 3.0], alpha: 0.85 }, // 近景
    ];

    let dpr = 1, W = 0, H = 0;
    let particles = [];

    /* ★ 原来每颗粒子都要设一次 shadowBlur + shadowColor 再 fill()，
       400 颗就是 400 次 canvas 阴影。现在预渲染成一张 sprite，
       帧内只剩 drawImage + globalAlpha。 */
    const sprite = window.makeGlowSprite({
        color: CONFIG.color,
        shape: 'diamond',       // 保持原来的菱形
        blur:  CONFIG.glow,
        size:  64,
    });
    /* sprite 的实心形状只占 r/(size/2)，绘制时要按比例放大回原来的视觉大小 */
    const SPRITE_K = 1 / sprite.shapeRatio;

    /* ============ 工具 ============ */
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

        const target = Math.floor(W * H * CONFIG.density);
        const diff = target - particles.length;
        if (diff > 0) {
            for (let i = 0; i < diff; i++) particles.push(createParticle());
        } else if (diff < 0) {
            particles.length = target;
        }
    }

    /* ============ 创建粒子 ============ */
    function createParticle() {
        const layer = pickLayer();
        return {
            x: Math.random() * W,
            y: Math.random() * H,
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

    /* ============ 更新（dt 以 60fps 为 1，保证高刷屏速度一致） ============ */
    function update(p, dt) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10;
        if (p.y > H + 10) p.y = -10;

        p.opacity += p.fadeSpeed * p.fadeDir * dt;
        if (p.opacity >= 1) { p.opacity = 1; p.fadeDir = -1; }
        if (p.opacity <= 0) { p.opacity = 0; p.fadeDir = 1; }

        p.vx += (Math.random() - 0.5) * 0.01 * dt;
        p.vy += (Math.random() - 0.5) * 0.01 * dt;
        p.vx = Math.max(-CONFIG.speedMax, Math.min(CONFIG.speedMax, p.vx));
        p.vy = Math.max(-CONFIG.speedMax, Math.min(CONFIG.speedMax, p.vy));
    }

    /* ============ 绘制（视差在这里） ============ */
    function draw(p, scrollX) {
        // 实际绘制位置 = 视口坐标 + scrollLeft × 视差系数
        let px = p.x - scrollX * p.parallax;
        // 环绕到视口内：处理负数也要正确
        px = ((px % W) + W) % W;

        const alpha = p.opacity * p.alphaMul;
        if (alpha < 0.01) return;

        const half = p.r * 1.4 * SPRITE_K;
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprite, px - half, p.y - half, half * 2, half * 2);
    }

    /* ============ 主循环：交给 World，全站共用同一个 rAF ============ */
    function frame(dt) {
        // ★ 用缓存值，不再每帧重复读 main.scrollLeft（少一次强制布局）
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