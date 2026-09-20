/* ============================================================
   主题切换
   ============================================================ */
(function themeToggle() {
    const btn = document.querySelector('.theme-toggle');
    if (!btn) return;

    const KEY    = 'site-theme';
    const iconEl = btn.querySelector('.theme-toggle-icon');
    const rootEl = document.documentElement;

    /* ★ 亮/暗类挂在 <html> 上（对应 CSS :root.light）。
       <head> 里的引导脚本可以在首次绘制前就设好，避免刷新时先渲染深色再跳亮色。 */
    function applyTheme(isLight) {
        rootEl.classList.toggle('light', isLight);
        if (iconEl) iconEl.textContent = isLight ? '暗' : '亮';
        btn.setAttribute('aria-pressed', String(isLight));
        btn.setAttribute('aria-label', isLight ? '切换到暗色主题' : '切换到亮色主题');
    }

    /* ----- 读取上次选择（隐私模式下 localStorage 可能直接抛错） ----- */
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) { /* ignore */ }

    if (saved) {
        applyTheme(saved === 'light');
    } else {
        /* 没有记录时跟随系统偏好，和 <head> 里引导脚本的判断保持一致 */
        applyTheme(window.matchMedia('(prefers-color-scheme: light)').matches);
    }

    btn.addEventListener('click', () => {
        const isLight = !rootEl.classList.contains('light');

        // ★ 切换期间禁用 backdrop-filter（关键）
        document.body.classList.add('theme-switching');

        applyTheme(isLight);
        try { localStorage.setItem(KEY, isLight ? 'light' : 'dark'); } catch (e) { /* ignore */ }

        /* 恢复时机必须跟 --theme-dur 对齐（现在是 0.55s）。
           以前写 320ms 比过渡还短 —— 模糊层在变色还没结束时就提前回来了，
           剩下那 230ms 等于白付逐帧重采样 backdrop 的代价。 */
        clearTimeout(window.__themeTimer);
        window.__themeTimer = setTimeout(() => {
            document.body.classList.remove('theme-switching');
        }, 600);
    });
})();