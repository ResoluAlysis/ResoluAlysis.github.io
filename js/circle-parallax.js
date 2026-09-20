/* ============================================================
   圆环 / 刻度 / 数字时钟 视差
   ------------------------------------------------------------
   视差已经改成 CSS 驱动：系数写在 style.css 的
   .circle-N / .circle-ticks-N / .digital-clock 上，
   位移由 js/world.js 写入的 --scroll-x 统一计算。
   这里只负责「登场闪烁」。
   ============================================================ */

/* ============================================================
   圆环登场：每个独立闪烁次数
   ============================================================ */
(function circlesReveal() {
    /* 每个圆环的配置：n = 索引，blinks = 闪烁次数 */
    const CONFIG = [
        { n: 1, blinks: 2 },
        { n: 2, blinks: 2 },
        { n: 3, blinks: 1 },
    ];

    /* 直接显示：没有时间线 / 降低动效 / 开屏被跳过时用 */
    function showAll() {
        document.querySelectorAll('.circle, .circle-ticks')
            .forEach((el) => { el.style.opacity = '1'; });
    }

    function reveal(T) {
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
    }

    const T = window.SPLASH_TIMELINE && window.SPLASH_TIMELINE.circlesIn;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ★ 兜底：没有时间线 / 用户要求减少动效时直接显示。
       CSS 里 .circle / .circle-ticks 初始 opacity:0，而且原本还引用了一个
       并不存在的 @keyframes circleReveal —— 一旦这里 return，圆环将永远不可见。 */
    if (!T || reduce) {
        showAll();
        return;
    }

    /* ★ 登场计时从「开屏起点」算起（timeline.js 会先等字体就绪）。
       这里是 WAAPI 动画，不吃 CSS 的 animation-play-state，
       所以必须自己等 —— 否则圆环会在遮罩后面偷偷闪完。 */
    const start = window.Intro ? window.Intro.armed : Promise.resolve(0);
    start.then(() => {
        /* 开屏被跳过：直接显示，不要再补播登场闪烁 */
        if (window.Intro && window.Intro.cancelled) {
            showAll();
            return;
        }
        reveal(T);
    });
})();