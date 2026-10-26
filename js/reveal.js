/* ============================================================
   P106：滚动进场（reveal）
   ------------------------------------------------------------
   要的效果（参考站上那种）：元素进入视口时淡入 + 从下往上抬一点，
   同一组的几个元素依次错开，像"一条条落位"。

   怎么标：给想演的元素写一个空的 `data-reveal` 属性就行，JS 自己扫。
   要调参数：全在 style.css 的 `html.reveal-on [data-reveal]` 那条里
   （--reveal-y / --reveal-dur / --reveal-ease，错开是 STAGGER_MS）。

   ★★ 三条设计上的硬要求（都是踩坑换来的，别改）：
   1. **隐藏态挂在 `html.reveal-on` 之下**，这个类由本文件在真正开始观察时
      才加。脚本没跑起来 / 报错 / 被拦掉时，页面是正常可见的 —— 不会白屏 ✓。
   2. **位移用 `translate`，不是 `transform`**。面板身上已经有 transform 的
      悬停与换图动画，写 transform 会把它们顶掉；`translate` 是独立的属性，
      两者互不干扰 ✓。
   3. **开屏结束后才开始观察**。开屏那几秒 main 是被锁住的（body.locked），
      提前观察会让"本来就在视口里"的元素在遮罩底下悄悄演完 ——
      开屏一拉开就已经是终态，等于白做 ✓。所以走 World.gate()。

   ★ 只演一次：进过视口的元素立刻 unobserve，滚回去不会重播
     （重播那种"来回闪"在作品集里只会显得廉价）✓。
   ★ prefers-reduced-motion：直接全部可见，连错开延迟都不要 ✓。
   ============================================================ */
(function () {
    'use strict';

    const SEL = '[data-reveal]';
    /* ★ P107：错开步长改成 100ms —— 参考站的 `FadeIn` 调用里是手写的 `delay: .1`
       （`.08 / .1 / .15 / .2 / .3 / .7` 那几档），所以取最常见的那一档 ✓ */
    const STAGGER_MS = 100;     // 同组相邻两个的间隔（CSS 里乘 --reveal-i）
    const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let io = null;
    let started = false;

    /* 给同组元素编号（0、1、2…），CSS 用 --reveal-i 乘出错开延迟。
       ★ "同组"按**父元素**算：`.contact-list li` 的序号不会被页面上
         别的 [data-reveal] 带跑 ✓ */
    function indexGroup() {
        document.querySelectorAll(SEL).forEach((el) => {
            const parent = el.parentElement;
            const sibs = parent
                ? Array.prototype.filter.call(parent.children, (s) => s.hasAttribute && s.hasAttribute('data-reveal'))
                : [el];
            const i = sibs.indexOf(el);
            el.style.setProperty('--reveal-i', String(i < 0 ? 0 : i));
        });
    }

    function show(el) {
        el.classList.add('is-in');
        if (io) io.unobserve(el);
    }

    function showAll() {
        document.querySelectorAll(SEL).forEach(show);
    }

    /* 观察当前页面上所有还没演的元素。
       ★ 动态插进来的内容（以后可能有的列表）只要 [data-reveal] 标好了，
         调一次 Reveal.scan() 就能接上 ✓ */
    function scan() {
        indexGroup();
        const all = document.querySelectorAll(SEL);
        if (!all.length) return;
        if (!io) { showAll(); return; }
        all.forEach((el) => {
            if (el.classList.contains('is-in')) return;
            io.observe(el);
        });
    }

    function start() {
        if (started) return;
        started = true;

        /* ★ 顺序有意义：先亮出"可以藏"的类，再判断要不要观察。
           降低动效 / 没有 IntersectionObserver 时立刻全部显示 ——
           绝不能留下"藏起来又没人放行"的状态 ✓ */
        document.documentElement.classList.add('reveal-on');

        if (REDUCE || typeof window.IntersectionObserver !== 'function') {
            showAll();
            return;
        }

        /* ★ P107：观察参数也照参考站的 `viewport` 抄 ——
           `{ once: true, margin: '-50px' }`：四条边各内缩 50px，
           也就是"元素真的进来 50px 才算数"（原来是底部 -8% + 12% 面积）。
           threshold 用 0（帧默认的 amount: "some"），配合那 50px 正好 ✓ */
        io = new window.IntersectionObserver((entries) => {
            entries.forEach((e) => { if (e.isIntersecting) show(e.target); });
        }, { root: null, rootMargin: '-50px', threshold: 0 });

        scan();
    }

    if (window.World && typeof window.World.gate === 'function') {
        window.World.gate(start);
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }

    window.Reveal = { start: start, scan: scan, showAll: showAll, stagger: STAGGER_MS };
})();
