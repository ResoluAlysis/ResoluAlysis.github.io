/* ============================================================
   主题切换
   ------------------------------------------------------------
   两条路：

     A. View Transitions（Chrome 111+ / Safari 18+）
        浏览器把「切换前 / 切换后」各拍一张快照，在**合成器**上交叉淡入 ——
        一帧 DOM 都不用重绘。
        为什么值得：过渡名单里有一堆「数量多 × 面积大」的目标，最大的一坨是
        马赛克方块（#skills / #projects / #contact 三节加起来最多 ~70 块，
        单块最大 500×500px）。background-color 不是合成器属性，换色期间
        每一帧都要把这些大块子重绘一遍 —— 那就是掉帧的主因。

     B. 回落（老浏览器 / 用户要求减少动效）
        还是逐元素过渡，额外把 backdrop-filter 全关掉。
   ============================================================ */
(function themeToggle() {
    const btn = document.querySelector('.theme-toggle');
    if (!btn) return;

    const KEY    = 'site-theme';
    const iconEl = btn.querySelector('.theme-toggle-icon');
    const rootEl = document.documentElement;
    const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)');

    /* ★ 亮/暗类挂在 <html> 上（对应 CSS :root.light）。
        <head> 里的引导脚本可以在首次绘制前就设好，避免刷新时先渲染深色再跳亮色。 */
    function applyTheme(isLight) {
        rootEl.classList.toggle('light', isLight);
        if (iconEl) iconEl.textContent = isLight ? '暗' : '亮';
        btn.setAttribute('aria-pressed', String(isLight));
        btn.setAttribute('aria-label', isLight ? '切换到暗色主题' : '切换到亮色主题');
    }

    function save(isLight) {
        /* 隐私模式下 localStorage 可能直接抛错 */
        try { localStorage.setItem(KEY, isLight ? 'light' : 'dark'); } catch (e) { /* ignore */ }
    }

    /* ----- 读取上次选择 ----- */
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) { /* ignore */ }
    applyTheme(saved ? saved === 'light' : window.matchMedia('(prefers-color-scheme: light)').matches);

    /* ----- 路径 A ----- */
    function swapWithVT(isLight) {
        /* ★ 必须临时关掉逐元素过渡（CSS 里 html.theme-vt *）：
           新快照是改动之后立刻拍的，那时 CSS 过渡还停在第 0 帧 ——
           不关的话交叉淡入拍到的还是旧颜色，会变成「先不动、最后突然变色」。 */
        rootEl.classList.add('theme-vt');
        const done = () => rootEl.classList.remove('theme-vt');

        let vt = null;
        try {
            vt = document.startViewTransition(() => { applyTheme(isLight); save(isLight); });
        } catch (e) {
            done();
            applyTheme(isLight);
            save(isLight);
            return;
        }
        if (vt && vt.finished) vt.finished.then(done, done);
        setTimeout(done, 1500);        // 保险：finished 万一不落地，别把过渡一直关着
    }

    btn.addEventListener('click', () => {
        const isLight = !rootEl.classList.contains('light');

        if (typeof document.startViewTransition === 'function' && !REDUCE.matches) {
            swapWithVT(isLight);
            return;
        }

        /* ----- 路径 B ----- */
        // ★ 切换期间禁用 backdrop-filter（模糊层每帧都要重采样它背后的内容）
        document.body.classList.add('theme-switching');

        applyTheme(isLight);
        save(isLight);

        /* 恢复时机必须跟 --theme-dur 对齐（现在是 0.55s）。
           以前写 320ms 比过渡还短 —— 模糊层在变色还没结束时就提前回来了，
           剩下那 230ms 等于白付逐帧重采样 backdrop 的代价。 */
        clearTimeout(window.__themeTimer);
        window.__themeTimer = setTimeout(() => {
            document.body.classList.remove('theme-switching');
        }, 600);
    });
})();