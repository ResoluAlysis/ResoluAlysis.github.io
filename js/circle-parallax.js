/* ============================================================
   圆环 / 刻度 / 数字时钟 视差
   ============================================================ */
(function circleParallax() {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) return;

    const main = document.querySelector('main');
    if (!main) return;

    /* ★ 每个元素独立的视差系数
       最外圈跑得慢 → 感觉最远
       内圈和数字跑得快 → 感觉最近
    */
    const LAYERS = [
        { selector: '.circle-1',         factor: 0.08 },
        { selector: '.circle-ticks-1',   factor: 0.08 },
        { selector: '.circle-2',         factor: 0.16 },
        { selector: '.circle-ticks-2',   factor: 0.16 },
        { selector: '.circle-3',         factor: 0.35 },
        { selector: '.circle-ticks-3',   factor: 0.35 },
        { selector: '.digital-clock',    factor: 0.4 },
    ];

    // 收集元素
    const items = [];
    for (const { selector, factor } of LAYERS) {
        document.querySelectorAll(selector).forEach((el) => {
            items.push({ el, factor });
        });
    }
    if (!items.length) return;

    /* ----- 每帧更新 ----- */
    let rafId = null;
    function loop() {
        const sx = main.scrollLeft;
        for (const { el, factor } of items) {
            el.style.setProperty('--px', (-sx * factor).toFixed(1) + 'px');
        }
        rafId = requestAnimationFrame(loop);
    }
    loop();

    /* ----- 切后台暂停 ----- */
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            cancelAnimationFrame(rafId);
            rafId = null;
        } else if (!rafId) {
            loop();
        }
    });
})();

/* ============================================================
   圆环登场：每个独立闪烁次数
   ============================================================ */
(function circlesReveal() {
    const T = window.SPLASH_TIMELINE?.circlesIn;
    if (!T) return;

    /* 每个圆环的配置：n = 索引，blinks = 闪烁次数 */
    const CONFIG = [
        { n: 1, blinks: 2 },
        { n: 2, blinks: 2 },
        { n: 3, blinks: 1 },
    ];

    CONFIG.forEach(({ n, blinks }) => {
        const delay = T.delay + (n - 1) * (T.stagger || 0.25);
        const dur   = (T.duration + (n - 1) * (T.grow || 0.2)) * 1000;   // 转毫秒

        document.querySelectorAll(`.circle-${n}, .circle-ticks-${n}`)
            .forEach((el) => {
                /* 用 blinks 生成关键帧 */
                const kf = [{ opacity: 0, offset: 0 }];
                for (let i = 0; i < blinks; i++) {
                    const t1 = (i * 2 + 1) / (blinks * 2 + 1);
                    const t2 = (i * 2 + 2) / (blinks * 2 + 1);
                    kf.push({ opacity: 1, offset: t1 });
                    kf.push({ opacity: 0, offset: t2 });
                }
                kf.push({ opacity: 1, offset: 1 });

                el.animate(kf, {
                    duration: dur,
                    delay: delay * 1000,
                    easing: 'ease-out',
                    fill: 'forwards',
                });
            });
    });
})();