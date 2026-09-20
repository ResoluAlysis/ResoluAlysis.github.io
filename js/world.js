/* ============================================================
   全局调度器 World
   ------------------------------------------------------------
   重构前：全站有 9 个各自独立的 requestAnimationFrame 循环
   （背景粒子 / 前景粒子 / 参考线 / 刻度尺三角 / 马赛克视差 /
     圆环视差 / 液滴跟随 / 鼠标点 / 时钟）。每一个循环都在每帧
     去读 main.scrollLeft，然后各写各的 DOM —— 光视差层一帧就要
     写几百次样式（mosaic 最多 400 个方块）。

   重构后：
     · 全站只有 1 个 rAF 循环，且只在真的有订阅者时才运行；
     · scrollLeft 没变化时，一个 DOM 都不碰；
     · 所有视差统一由 .page-zoom 上的 --scroll-x 驱动，各层在 CSS
       里用 calc() 自己算位移（见 style.css 的「视差」一节）。
   ============================================================ */
window.World = (function world() {
    const mainEl = document.querySelector('main');
    /* 特效层都在 .page-zoom 里，写到它身上能让样式重算的范围小一点 */
    const rootEl = document.querySelector('.page-zoom') || document.documentElement;

    const scrollSubs = new Set();   // fn(scrollX)  只在滚动位置变化时调用
    const frameSubs  = new Set();   // fn(dt, now)  每帧调用

    let rafId   = null;
    let paused  = false;   // ★ 浮窗打开时整体暂停（见文件末尾的 pause / resume）
    let lastNow = 0;
    let prevX   = mainEl ? mainEl.scrollLeft : 0;
    let cachedX = prevX;            // 缓存一份，供各特效层读取，免去重复读 scrollLeft

    /* ---------- 滚动位置 ---------- */
    function syncScroll() {
        if (!mainEl) return;
        const x = mainEl.scrollLeft;
        if (x === prevX) return;        // ★ 没变就什么都不做
        prevX = x;
        cachedX = x;
        /* ★ 每帧只写这一次：所有视差层的位移交给 CSS 自己算 */
        rootEl.style.setProperty('--scroll-x', (Math.round(x * 100) / 100).toString());
        for (const fn of scrollSubs) fn(x);
    }

    /* scroll 事件不保证和 rAF 对齐，用一次 rAF 合并掉重复触发 */
    let scrollQueued = false;
    function queueScroll() {
        if (scrollQueued) return;
        scrollQueued = true;
        requestAnimationFrame(() => { scrollQueued = false; syncScroll(); });
    }
    if (mainEl) mainEl.addEventListener('scroll', queueScroll, { passive: true });
    window.addEventListener('resize', queueScroll);

    /* ---------- 主循环 ---------- */
    function frame(now) {
        /* dt 以 60fps 为基准：dt = 1 表示这一帧耗时 16.67ms。
           上限 4，避免从后台切回来时一帧跳太远。 */
        const dt = lastNow ? Math.min((now - lastNow) / (1000 / 60), 4) : 1;
        lastNow = now;

        syncScroll();                   // 没变化时只是一次属性比较，可忽略
        for (const fn of frameSubs) fn(dt, now);

        rafId = (frameSubs.size && !document.hidden) ? requestAnimationFrame(frame) : null;
    }

    function start() {
        if (paused) return;                 // ★ 暂停期间谁也别想偷偷重启
        if (rafId !== null || !frameSubs.size) return;
        lastNow = 0;                    // 重新计时，避免暂停期间累积出巨大的 dt
        rafId = requestAnimationFrame(frame);
    }
    function stop() {
        if (rafId === null) return;
        cancelAnimationFrame(rafId);
        rafId = null;
    }

    /* 暂停 / 恢复：浮窗（尤其是 Unity 里的）打开时，面板背后那些
       粒子 / 时钟 / 视差完全看不见，却还在每帧跑。暂停它们能给
       游戏腾出 CPU，也免得两个 rAF 抢时间片。
       注意：resume 之后 dt 会从 0 重新计时（frame() 里有 lastNow = 0），
       不会因为暂停了很久而跳一大步。 */
    function pause()  { paused = true;  stop(); }
    function resume() { paused = false; start(); }

    /* 切到后台就整体停掉（原来每个模块各写了一份 visibilitychange） */
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop(); else start();
    });

    /* ============================================================
       1) 布局变化：统一入口
       ------------------------------------------------------------
       触发时机：注册时立刻一次、resize 防抖后、横竖屏切换，以及
                 document.fonts.ready。
       为什么必须等字体：文字尺寸一变，节内容就可能超过一屏而出现
       内部滚动条，clientWidth 跟着少十几 px —— 于是所有「按宽度算
       位置」的东西（马赛克方块、参考线画布）都会偏。
       原来有 7 个模块各自 addEventListener('resize')，节奏还不一致
       （只有 mosaic 自己做了防抖，其余每帧都跑），现在统一走这里。
       ============================================================ */
    const layoutSubs = new Set();
    let layoutTimer = null;

    function fireLayout() {
        layoutTimer = null;
        for (const fn of layoutSubs) fn();
    }
    function queueLayout() {
        if (layoutTimer !== null) clearTimeout(layoutTimer);
        layoutTimer = setTimeout(fireLayout, 120);   // 防抖：拖动窗口时别每帧重排
    }

    window.addEventListener('resize', queueLayout, { passive: true });
    window.addEventListener('orientationchange', queueLayout, { passive: true });
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(queueLayout).catch(function () {});
    }

    /* ============================================================
       2) 断点感知的效果生命周期
       ------------------------------------------------------------
       原来各模块都是「加载时 matchMedia(...).matches 判断一次」，
       跨断点后不再重新评估：
         · 桌面缩到移动端 → 参考线 / 马赛克还留着；
         · 移动端放大到桌面 → 前景粒子层永远不会启动。
       用法：
           World.effect('(max-width: 768px)', function (isMobile) {
               ...在这里启动...
               return function () { ...可选：清理... };
           });
       匹配状态每次变化时：先调用上一次返回的清理函数，再用新的
       布尔值调用一次。返回的 stop() 可以手动注销。
       ============================================================ */
    const effectStops = new Set();

    function effect(query, handler) {
        const mql = window.matchMedia(query);
        let cleanup = null;
        let started = false;

        function apply() {
            if (started && cleanup) cleanup();
            cleanup = null;
            started = true;
            const ret = handler(mql.matches);
            cleanup = typeof ret === 'function' ? ret : null;
        }

        mql.addEventListener('change', apply);
        apply();                       // 立刻用当前状态跑一次

        const stop = function () {
            mql.removeEventListener('change', apply);
            if (cleanup) cleanup();
            cleanup = null;
            effectStops.delete(stop);
        };
        effectStops.add(stop);
        return stop;
    }

    /* ============================================================
       3) 开屏闸门
       ------------------------------------------------------------
       开屏没结束前，任何「入场动画 / 需要页面稳定的初始化」都应该
       排队等，而不是散落一堆 setTimeout 各自猜时间。
           World.gate(fn)    开屏结束后执行（已放行则微任务里立即执行）
           World.openGate()  由 main.js 在开屏结束 / 跳过 / 降级时调用
       ============================================================ */
    let gateOpen = false;
    let gateQueue = [];

    function gate(fn) {
        if (gateOpen) { queueMicrotask(fn); return; }
        gateQueue.push(fn);
    }
    function openGate() {
        if (gateOpen) return;
        gateOpen = true;
        const pending = gateQueue;
        gateQueue = [];
        for (const fn of pending) fn();
    }

    return {
        /* 当前横向滚动位置（只读） */
        get scrollX() { return cachedX; },
        get main()    { return mainEl; },

        /* 滚动位置变化时回调；注册时会立刻用当前值调用一次 */
        onScroll(fn) {
            scrollSubs.add(fn);
            fn(this.scrollX);
            return () => scrollSubs.delete(fn);
        },

        /* 每帧回调，参数是归一化后的 dt（60fps 时 dt = 1）与时间戳 */
        onFrame(fn) {
            frameSubs.add(fn);
            start();
            return () => this.offFrame(fn);
        },
        offFrame(fn) {
            frameSubs.delete(fn);
            if (!frameSubs.size) stop();
        },
        /* 布局变化（含字体加载完成）时回调；注册时立刻调用一次 */
        onLayout(fn) {
            layoutSubs.add(fn);
            fn();
            return () => layoutSubs.delete(fn);
        },

        /* 断点感知的效果生命周期，见上文说明 */
        effect,

        /* 暂停 / 恢复主循环（浮窗打开时用） */
        pause,
        resume,

        /* 开屏闸门 */
        gate,
        openGate,
        get introDone() { return gateOpen; },    };
})();