/* ============================================================
   P110：标题小字「向左滚到画框左边线就停住」
   ------------------------------------------------------------
   你要的：页面往左滚（内容往左走）时，小字跟着走，但它**左缘**碰到画框
   左边那条竖线（`.df-tl` / `.df-bl` 所在的 `--content-x`）就停在那儿；
   页面往回滚（向右）时松手，小字回到原位。

   ★ 这个效果**不需要每帧写 DOM**，因为位移是纯算术：
        tx = max(0, 滚动距离 - T)
     T = "静止状态下，小字左缘离画框左边线多远"（一次布局量一个数）
   而滚动距离全站只有一个来源：`js/world.js` 每帧写一次的 `--scroll-x`。
   所以真正的表达式写在 css/style.css 的 `.hero-content .subtitle` 里：

        translate: max(0px, calc(var(--scroll-x, 0) * 1px - var(--sub-t, …))) 0;

   本文件只干一件事：**量出 T，写进 `--sub-t`**。
   这正是 style.css「视差：单一变量驱动」那一节的思路（一帧一次写入，
   其余交给 CSS 自己算）✓

   ★ 三个坑，都在这儿处理了：
   1. 量的时候必须先把 `translate` 摘掉 —— 不然量到的是"已经挪过"的位置；
   2. 侧边栏开合那 450ms 里 `main` 的 left 在动（整站被推开），
      小字和画框的坐标系不同步 → 那段时间**不量**，等它关完再补量一次；
   3. 手机上 `main` 不横向滚（是纵向长滚）→ 这个效果没意义，
      直接把 `--sub-t` 写成一个大数，让表达式恒等于 0（小字就待在原位）✓

   ★★★ P110b（你报的"首次进来不固定、开一次游戏就好了"）：
   4. **开屏期间根本不能量。** `.page-zoom` 身上挂着 `animation: body缩放`
      （scale 2 → 1.1 → 1），而 `getBoundingClientRect()` 返回的是**缩放后**的
      盒子 —— 那时量出来的 T 会被放大到两倍左右，于是"永远撞不到线"（不固定）✗。
      开一次游乐区之所以就好了：那条 `transitionend` 补量发生在开屏**之后**，
      那时 transform 已经清掉，量的是真值 ✓。
      所以现在 `measure()` 只在 `body.intro-done` 之后干活，并挂到 `World.gate`
      （开屏结束那一刻）补一次量。
   ============================================================ */
(function () {
    'use strict';

    const sub = document.querySelector('.hero-content .subtitle');
    const hero = document.querySelector('.hero-content');
    const main = document.querySelector('main');

    /* 三个有一个拿不到就整套不启用（页面照旧，小字只是不会停） */
    if (!sub || !hero || !main) return;

    /* "永远不触发"的 T：表达式 max(0, scrollX - T) 恒为 0 = 小字一直在原位。
       ★ 和 css 里那条 `var(--sub-t, 999999px)` 的兜底值保持一致，别两处各说各话 */
    const NEVER = 999999;

    /* ★★★ 坑 4（P110b）：开屏没结束时，`.page-zoom` 上还挂着 scale 2 → 1 的动画，
       这段期间的 getBoundingClientRect() 是**缩放后**的尺寸 —— 量了也白量。
       所以唯一的入场券是这个类 ✓ */
    function stable() {
        return document.body.classList.contains('intro-done');
    }

    function measure() {
        /* ★ 坑 4：开屏期间不量（见文件头）。也别写任何值 ——
           让 CSS 的兜底大数继续生效，小字老老实实待在原位 ✓ */
        if (!stable()) return;

        /* ★ 坑 2：侧边栏开合中，main 的 left 正在 75px → 0 地变，
           这段时间两块的坐标不同步，量出来的 T 是错的 → 跳过 */
        if (document.body.classList.contains('sidebar-open')) return;

        /* ★ 坑 3：手机（main 不横向滚）→ 关掉这个效果 */
        let overflowX = 'auto';
        try {
            overflowX = window.getComputedStyle(main).overflowX;
        } catch (e) {
            /* 拿不到计算样式就当成能滚，后面那条算式自然是 0 ✓ */
        }
        if (overflowX !== 'auto') {
            sub.style.setProperty('--sub-t', NEVER + 'px');
            return;
        }

        /* ★ 坑 1：先摘掉 translate 再量 —— 否则量到的是已挪过的位置 */
        const had = sub.style.getPropertyValue('translate');
        sub.style.setProperty('translate', 'none');
        const r = sub.getBoundingClientRect();
        const h = hero.getBoundingClientRect();
        if (had) sub.style.setProperty('translate', had);
        else sub.style.removeProperty('translate');

        /* 小字和 `.hero-content` 在同一个坐标系里、一起随页面走，
           所以**差值**与滚动位置无关 —— 在任何 scrollLeft 下量都一样 ✓ */
        const t = r.left - h.left;
        sub.style.setProperty('--sub-t', (t > 0 ? t : NEVER) + 'px');
    }

    /* ----- 什么时候量 -----
       ★★ P110b：**开屏结束那一刻必须量一次**（`World.gate`）。原来只挂了
          `World.onLayout`，而它在脚本加载时就立刻跑了一次 —— 那时还在开屏里，
          量到的是缩放后的坐标（T 差不多翻倍），于是"永远撞不到线"✗。
          `onLayout` 保留：resize / 横竖屏 / 字体就绪后的防抖里都要重量 ✓ */
    if (window.World && typeof window.World.gate === 'function') {
        window.World.gate(measure);
    }
    if (window.World && typeof window.World.onLayout === 'function') {
        window.World.onLayout(measure);
    }
    if (!window.World) {
        /* 没有 World（脚本没加载全）：开屏那套也不会走，退回到最朴素的时机 ✓ */
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', measure, { once: true });
        } else {
            measure();
        }
    }

    /* ★ 坑 2 的收尾：游乐区关完之后补量一次（那时坐标系才回到正常）。
       监听在 document 上做委托 —— 侧边栏元素是页面里的静态节点，一定有 ✓ */
    document.addEventListener('transitionend', function (e) {
        const t = e.target;
        if (t && t.classList && t.classList.contains('play-sidebar')) measure();
    });

    window.SubtitleDock = { measure: measure, stable: stable };
})();
