/* ============================================================
   P113：竖屏遮罩（"请横屏浏览"）的输入拦截
   ------------------------------------------------------------
   显示 / 隐藏**完全由 CSS 决定**（`@media (orientation: portrait)` + index.html
   里那个 .rotate-guard），这里一行都不碰显示 —— 所以脚本没跑起来、或者被拦掉，
   遮罩照样会出现 ✓（这一点很重要：它是"别用竖屏看这个站"的提示，
   宁可提示在、拦截没生效，也不能反过来）

   这里只做 CSS 干不了的那件事：**竖屏时不让底下的页面继续响应输入**。
     · 滚轮：js/main.js 的惯性滚动是在 `document` 的冒泡阶段监听的，
             用 **capture + stopPropagation** 拦在这里，它就收不到 ——
             一行都不用改 main.js ✓
     · 触摸拖动 / 方向键 / 空格：同理。修饰键组合（Ctrl+R、F5 之类）不拦，
       不然用户连刷新都按不动 ✓
   ============================================================ */
(function () {
    'use strict';

    const guard = document.querySelector('[data-guard="rotate"]');
    if (!guard) return;                     /* 没有那个元素就整套不启用 */

    const mq = window.matchMedia('(orientation: portrait)');
    let active = mq.matches;

    /* 遮罩出现时给 <html> 挂个类：给以后想"竖屏时暂停点东西"的地方留钩子，
       也给自检一个能断言的开关（CSS 那边已经用同一条媒体查询兜住了）✓ */
    function paint() {
        document.documentElement.classList.toggle('is-portrait', active);
    }

    function block(e) {
        if (!active) return;
        /* ★ 不拦浏览器快捷键：Ctrl/Cmd/Alt 组合、F 键一律放行 */
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        e.stopPropagation();
    }

    /* capture: true + passive: false —— 必须能 preventDefault，且要抢在
       main.js 那个冒泡阶段的 wheel 监听之前 ✓ */
    const opts = { capture: true, passive: false };
    document.addEventListener('wheel', block, opts);
    document.addEventListener('touchmove', block, opts);
    document.addEventListener('keydown', block, { capture: true });

    mq.addEventListener('change', function (e) {
        active = e.matches;
        paint();
    });
    /* 老浏览器没有 MediaQueryList.addEventListener（Safari < 14）*/
    if (typeof mq.addEventListener !== 'function' && mq.addListener) {
        mq.addListener(function (e) { active = e.matches; paint(); });
    }

    paint();

    /* ============================================================
       图标位：可以换成你自己的 PNG / GIF（P113b）
       ------------------------------------------------------------
       约定（见 index.html 那个 <img> 上方的注释）：
         · 没写 src → 什么都不做，继续用自绘 SVG；那张 img 也不会发请求 ✓
         · 写了 src → **等它真的 load 成功**才换手（`.is-art`）；
           中途挂了（路径写错 / 文件不存在）→ 退回自绘 SVG，不留破图 ✓
       ★ 和显示/隐藏一样，这一小段失败也**不影响遮罩本身**（默认就是 SVG）✓
       ============================================================ */
    (function swapArt() {
        const art = guard.querySelector('[data-guard="art"]');
        const img = guard.querySelector('[data-guard="art-img"]');
        if (!art || !img) return;

        const src = img.getAttribute('src');
        if (!src || src.trim() === '') return;      /* 没填就继续用 SVG */

        function use() { art.classList.add('is-art'); }

        function fallback() {
            art.classList.remove('is-art');
            /* ★ 如果自绘 SVG 也被注掉了（现在是这种情况），换个图标失败就真的是"没有图标"了 ——
               别静默失败：留一条 warn，路径写错时一眼能看出来 ✓ */
            if (!art.querySelector('.rotate-guard-icon')) {
                /* ★ 刻意用 ASCII：这句只进 console，不值得为它往展示字体的子集里加字 ✓ */
                console.warn('[rotate-guard] art failed to load: ' + src);
            }
        }

        /* 已经加载完（缓存命中）就直接换；否则等 load 事件 */
        if (img.complete && img.naturalWidth > 0) use();
        else {
            img.addEventListener('load', use);
            img.addEventListener('error', fallback);
        }
    })();

    window.OrientationGuard = {
        isActive: function () { return active; },
        element: guard,
    };
})();
