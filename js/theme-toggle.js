/* ============================================================
   主题切换
   ============================================================ */
(function themeToggle() {
    const btn = document.querySelector('.theme-toggle');
    if (!btn) return;

    const KEY = 'site-theme';
    const iconEl = btn.querySelector('.theme-toggle-icon');

    /* ----- 读取上次选择 ----- */
    function applyTheme(isLight) {
        document.body.classList.toggle('light', isLight);
        iconEl.textContent = isLight ? '暗' : '亮';
    }

    const saved = localStorage.getItem(KEY);
    applyTheme(saved === 'light');

    btn.addEventListener('click', () => {
        const isLight = !document.body.classList.contains('light');

        // ★ 切换期间禁用 backdrop-filter（关键）
        document.body.classList.add('theme-switching');

        applyTheme(isLight);
        localStorage.setItem(KEY, isLight ? 'light' : 'dark');

        // 300ms 后恢复（比 transition 时长多一点）
        clearTimeout(window.__themeTimer);
        window.__themeTimer = setTimeout(() => {
            document.body.classList.remove('theme-switching');
        }, 320);
    });
})();