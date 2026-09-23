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

    /* 时间线缺失时的兜底（正常路径用 SPLASH_TIMELINE.circlesIn） */
    const FALLBACK = { delay: 0, duration: 0.9, stagger: 0.25, grow: 0.2 };

    const ringsOf = (n) => document.querySelectorAll(`.circle-${n}, .circle-ticks-${n}`);
    const allRings = () => document.querySelectorAll('.circle, .circle-ticks');

    /* 直接显示 / 直接隐藏：没有时间线、降低动效时走这条（不演动画） */
    function showAll() { allRings().forEach((el) => { el.style.opacity = '1'; }); }
    function hideAll() { allRings().forEach((el) => { el.style.opacity = '0'; }); }

    /* 按 blinks 生成关键帧：0 → 亮一下 → 暗 → … → 1 */
    function frames(blinks) {
        const kf = [{ opacity: 0, offset: 0 }];
        for (let i = 0; i < blinks; i++) {
            kf.push({ opacity: 1, offset: (i * 2 + 1) / (blinks * 2 + 1) });
            kf.push({ opacity: 0, offset: (i * 2 + 2) / (blinks * 2 + 1) });
        }
        kf.push({ opacity: 1, offset: 1 });
        return kf;
    }

    const T = window.SPLASH_TIMELINE && window.SPLASH_TIMELINE.circlesIn;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let running = [];      // 这一轮挂上去的动画；换方向前先全部 cancel

    /* direction: 'normal' = 登场闪烁；'reverse' = 按同一条路闪回去。
       ★ introDelay：只有**开屏登场**才吃 circlesIn.delay。
         timeline.js 里 circlesIn.delay = 4.0，那是"从开屏起点算起的第 4 秒"，
         属于开屏的编排；侧边栏的过场要是也吃它，就会点了按钮先干等 4 秒
         （P66 就是这个 bug —— 你看到的"等几秒才消失"）。
         侧边栏两趟只保留 stagger：那是这三圈自己的节奏，
         0 / 0.2 / 0.4s 起闪、各闪 0.1~0.2s，半秒多就闪完。 */
    function play(direction, introDelay) {
        running.forEach((a) => a.cancel());
        running = [];

        const t = T || FALLBACK;
        CONFIG.forEach(({ n, blinks }) => {
            /* 两个都先换算成毫秒（timeline 里是秒）——下面直接用，
               不要再乘一次 1000（第一版就是这么写成 1000 倍延迟的） */
            const delay = ((introDelay ? (t.delay || 0) : 0) + (n - 1) * (t.stagger || 0)) * 1000;
            const dur = (t.duration + (n - 1) * (t.grow || 0.2)) * 1000;

            ringsOf(n).forEach((el) => {
                /* ★ fill 必须是 both，不能只写 forwards：
                   reverse 那一趟有 delay（stagger 决定），而 forwards 在
                   延迟期间**不填充**——那几百毫秒里会把 opacity 掉回 CSS 的
                   基态 0，也就是"后两圈啪一下先没了"，完全不是闪回去。
                   both 的 backwards 填充用的是首帧：normal 是 0（本来就看不见），
                   reverse 是 1（保持亮着等自己的那一拍）。 */
                running.push(el.animate(frames(blinks), {
                    duration: dur,
                    delay,
                    easing: 'ease-out',
                    fill: 'both',
                    direction,
                }));
            });
        });
    }

    /* ============================================================
       对外：让刻度时钟"按消失的方式返回"（P65，侧边栏展开/缩回用它）
       ------------------------------------------------------------
       ★ 为什么反向播放写在这里，而不是在 style.css 里再写一条反向 keyframes：
         这三圈根本不吃 CSS 动画 —— 登场是 WAAPI（el.animate(kf)，
         关键帧还是按 blinks 现场生成的）。CSS 那边改 animation-direction
         只会让它**跳**到终态（同名动画不会重启）；这里 new 一份
         direction: 'reverse' 是全新的 Animation，一定会真演一遍，
         而且天然排在旧动画之后、稳压旧值。
         —— 于是"反向播放登场动画"就是多加一个 direction 参数。
       ★ 降低动效下不演：直接改内联 opacity。 */
    window.CircleReveal = {
        hide() { if (reduce) { hideAll(); return; } play('reverse', false); },
        show() { if (reduce) { showAll(); return; } play('normal', false); },
    };

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
        play('normal', true);      // ★ 只有这里吃 circlesIn.delay（开屏编排）
    });
})();