/* ============================================================
   P107 / P108：大字的「解码」入场（HyperText）
   ------------------------------------------------------------
   这是参考站 openilink.com 首页那个大标题的真身（`HyperText`，源码从存档的
   `0gs6v0~voz1o1.js` 里挖出来的）：进度 × 总字数 = 揭示到第几位，
   还没轮到的位**每一帧换成随机的 A~Z**，走完就停在真字上。

   ★★ P108（你的要求）改了**三拍**，并且修了一个真 bug：

     0        开屏拉开 + 220ms    ← 一片空白（整块不可见）
     blankMs  180ms 之后          ← 随机字：整行抖动，一个字都还没揭示
     randomMs 300ms 之后          ← 从左到右逐一解码，duration 走完落定

   **bug**：P107 的 `auto()` 只把要跑的任务 `bind()` 了一遍，从来没调
   `run()` —— 于是 `[data-hyper]`（首页大字）永远不自己跑，只有鼠标移上去
   （hover 那条路会真的调）才闪一下。你说的"当前是鼠标放上去开始闪"就是这个。

   ★ "空白"那一拍用 `opacity: 0` 实现，**不是**把文字清空：
     清空会让标题框宽度瞬间塌掉，而首页那条下划线是
     js/home-underline.js 按标题的 `getBoundingClientRect()` 算的 ——
     它平时只在下划线相关时机量，但 resize 正好撞上就量到 0 宽。
     用 opacity 藏，布局一个像素都不动 ✓

   属性驱动：
       <h1 data-hyper="1200">        开屏拉开后自己跑（本文件负责）
       <h2 data-hyper-view="1000">   进入视口才跑

   ★★ 三条硬规矩：
   1. **只改文本节点的值，不重建 DOM** —— 首页大字里有 `.highlight` 那个
      变色 span，重建就会把它冲掉。
   2. **跑完必须还原原文**（下划线是量标题算的，停在随机字上就永远歪）。
   3. `prefers-reduced-motion` 下**一次都不跑**（连 hover 重播都不挂）。
   4. **不用 innerHTML** —— 站里只允许 js/sidebar.js 那一处。
   ============================================================ */
(function () {
    'use strict';

    /* 随机字符集：参考站就是 A~Z（`"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")`）*/
    const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    const DEFAULT_MS = 1000;    // 解码时长
    const BLANK_MS = 180;       // 第一拍：一片空白
    const RANDOM_MS = 300;      // 第二拍：整行随机字
    const START_DELAY = 220;    // 开屏拉开后缓一下再开始（参考站是 delay: 300）
    const HOVER_REPLAY = true;  // ★ 想关掉"鼠标移上去重播"，把这里改成 false ✓

    const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* el → { cancel }：hover 重播时要判"现在忙不忙" */
    const running = new WeakMap();

    /* 收集元素里所有「有内容的」文本节点（不重建结构，见文件头第 1 条） */
    function textNodes(root) {
        const out = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        let n = walker.nextNode();
        while (n) {
            if (n.nodeValue && n.nodeValue.trim()) out.push(n);
            n = walker.nextNode();
        }
        return out;
    }

    function readDuration(el, attr, fallback) {
        const v = parseInt(el.getAttribute(attr), 10);
        return v > 0 ? v : fallback;
    }

    /* 跑一遍三拍。opts: { duration, delay, blankMs, randomMs }
       返回一个 cancel 函数（导出着，方便以后要打断的时候用） */
    function decode(el, opts) {
        const o = opts || {};
        if (!el || REDUCE) return function () { };

        const nodes = textNodes(el);
        if (!nodes.length) return function () { };

        const originals = nodes.map(function (n) { return n.nodeValue; });
        let total = 0;
        for (let i = 0; i < originals.length; i++) total += originals[i].length;
        if (!total) return function () { };

        const duration = o.duration > 0 ? o.duration : DEFAULT_MS;
        const delay = o.delay > 0 ? o.delay : 0;
        const blankMs = o.blankMs != null ? o.blankMs : BLANK_MS;
        const randomMs = o.randomMs != null ? o.randomMs : RANDOM_MS;
        /* 解码从这一拍开始算（前两拍都是"假字"）*/
        const decodeAt = blankMs + randomMs;

        let raf = 0;
        let timer = 0;
        let cancelled = false;

        function restore() {
            for (let i = 0; i < nodes.length; i++) nodes[i].nodeValue = originals[i];
            el.style.opacity = '';
        }

        /* 把"已揭示到第 limit 位"画上去（limit = 0 时整行都是随机字） */
        function paint(limit) {
            let gi = 0;
            for (let i = 0; i < nodes.length; i++) {
                const src = originals[i];
                let out = '';
                for (let k = 0; k < src.length; k++, gi++) {
                    const ch = src.charAt(k);
                    /* 空白不参与抖（换成随机字会改变换行位置）*/
                    if (ch === ' ' || ch === '\n' || ch === '\t' || gi <= limit) out += ch;
                    else out += CHARSET.charAt(Math.floor(Math.random() * CHARSET.length));
                }
                nodes[i].nodeValue = out;
            }
        }

        function frame(now) {
            if (cancelled) return;
            const t = now - t0;

            /* ---- 第一拍：一片空白（藏起来，布局不动）---- */
            if (t < blankMs) {
                el.style.opacity = '0';
                raf = window.requestAnimationFrame(frame);
                return;
            }

            /* ---- 第二/三拍：亮出来 + 逐位解码 ---- */
            el.style.opacity = '';
            const p = Math.min(Math.max((t - decodeAt) / duration, 0), 1);
            paint(p * total);
            if (p < 1) {
                raf = window.requestAnimationFrame(frame);
            } else {
                restore();
                running.delete(el);
            }
        }

        const t0 = window.performance.now() + delay;

        function cancel() {
            cancelled = true;
            if (raf) window.cancelAnimationFrame(raf);
            if (timer) window.clearTimeout(timer);
            raf = 0;
            timer = 0;
            restore();
            running.delete(el);
        }

        /* 先藏起来再等 delay —— 否则那 220ms 会先把真字亮一下再消失 ✓ */
        el.style.opacity = '0';
        running.set(el, { cancel: cancel });

        if (delay) timer = window.setTimeout(function () { raf = window.requestAnimationFrame(frame); }, delay);
        else raf = window.requestAnimationFrame(frame);

        return cancel;
    }

    /* 绑定一个元素：跑一次 + （可选）hover 重播 */
    function bind(el, ms) {
        if (HOVER_REPLAY && !REDUCE) {
            el.addEventListener('mouseenter', function () {
                /* 正在解码的时候不打断自己（参考站那句 `!f` 就是这个意思）*/
                if (running.has(el)) return;
                decode(el, { duration: ms });
            });
        }
        return function (extra) {
            return decode(el, Object.assign({ duration: ms }, extra || {}));
        };
    }

    /* 扫描页面：数据属性说了算，这里不认任何类名 */
    function auto() {
        /* ① 开屏拉开后自己跑的那批（首页大字）—— ★ P108：这里以前忘了 run() */
        document.querySelectorAll('[data-hyper]').forEach(function (el) {
            const ms = readDuration(el, 'data-hyper', DEFAULT_MS);
            const run = bind(el, ms);
            run({ delay: START_DELAY });
        });

        /* ② 进视口才跑的那批（小节标题）*/
        document.querySelectorAll('[data-hyper-view]').forEach(function (el) {
            const ms = readDuration(el, 'data-hyper-view', DEFAULT_MS);
            const run = bind(el, ms);
            if (REDUCE || typeof window.IntersectionObserver !== 'function') { run(); return; }
            /* 和参考站一模一样的观察参数：进来 30% 才演，只演一次 */
            const io = new window.IntersectionObserver(function (entries) {
                entries.forEach(function (e) {
                    if (!e.isIntersecting) return;
                    io.disconnect();
                    run();
                });
            }, { threshold: 0.1, rootMargin: '-30% 0px -30% 0px' });
            io.observe(el);
        });
    }

    /* ★ 首页那个大字要等开屏拉开再解码 —— 否则三拍全在遮罩底下演完，
       拉开时已经是终态（和 js/reveal.js 是同一个理由）*/
    if (window.World && typeof window.World.gate === 'function') {
        window.World.gate(auto);
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', auto, { once: true });
    } else {
        auto();
    }

    window.HyperText = {
        auto: auto,
        decode: decode,
        charset: CHARSET,
        timings: { blank: BLANK_MS, random: RANDOM_MS, delay: START_DELAY },
    };
})();
