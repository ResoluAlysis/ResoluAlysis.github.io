(function welcomeSplash() {
    const el = document.querySelector('.welcome-splash');
    if (!el) return;

    /* 降低动效偏好：直接清掉开屏（main.js 会同步解锁页面） */
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.remove();
        document.querySelectorAll('.welcome-tagline').forEach((t) => t.remove());
        return;
    }

    const T = window.SPLASH_TIMELINE || {};
    const IN  = T.welcomeIn  || { delay: 0.3, duration: 2.0 };
    const OUT = T.welcomeOut || { delay: 2.3, duration: 1.0 };

    const text = el.textContent.trim();
    el.textContent = '';
    [...text].forEach((ch, i) => {
        const span = document.createElement('span');
        span.className = 'char';
        span.textContent = ch === ' ' ? '\u00A0' : ch;
        span.style.setProperty('--i', i);
        el.appendChild(span);
    });

    const CHAR_APPEAR = 0.7;
    const HOLD        = 0.5;
    const riseTotal   = Math.max(0, IN.duration - HOLD);
    const n           = text.length;
    const stagger     = n > 1 ? Math.max(0, (riseTotal - CHAR_APPEAR) / (n - 1)) : 0;

    el.style.setProperty('--char-appear', CHAR_APPEAR + 's');
    el.style.setProperty('--char-stagger', stagger.toFixed(3) + 's');
    /* ★ 之前漏了这句：timeline 里配的 welcomeIn.delay 从来没生效过，
         字符动画实际从 0s 就开始，藏在渐显遮罩后面 */
    el.style.setProperty('--welcome-in-delay', IN.delay + 's');
    el.style.setProperty('--welcome-out-dur', OUT.duration + 's');

    /* ---------- 上下两行副标题的时序 ----------
       要求是「WELCOME 完全出现之后」才闪，所以起点取最后一个字符落位那一刻：
           welcomeIn.delay + (n - 1) × stagger + CHAR_APPEAR
       可用窗口 = 那一刻到整组开始左移（OUT.delay）之间，留 50ms 余量，
       让闪完还能停一下再走 —— 默认数值下是 0.45s。 */
    const taglines = Array.from(document.querySelectorAll('.welcome-tagline'));
    const lastCharLands = IN.delay + (n - 1) * stagger + CHAR_APPEAR;
    const blinkWindow = Math.max(0.2, OUT.delay - lastCharLands - 0.05);

    /* 副标题是 .welcome-splash 的兄弟节点，变量写在 el 上它们收不到，
       所以挂到根元素。 */
    const rootEl = document.documentElement;
    rootEl.style.setProperty('--tagline-delay', lastCharLands.toFixed(3) + 's');
    rootEl.style.setProperty('--tagline-blink-dur', blinkWindow.toFixed(3) + 's');

    /* ============================================================
       把三行的宽度锁到 --splash-w（量出来的，不是拍脑袋）
       ------------------------------------------------------------
       为什么必须量：不同字体、不同字串的「渲染宽度 / 字号」比例完全不同，
       靠 clamp() 写死不可能正好落在你要的 80~90vw 上。

       用 canvas 量比插隐藏 DOM 干净：measureText 顺手给出字符的墨迹上下界，
       所以「宽度」和「墨迹高度」一次就能拿到。
       ★ canvas 不认 CSS 的 letter-spacing，要按字符数补回来。

       ★ 高度只能「问」出来：字号一旦被宽度锁死，墨迹高度就由字体的天然
         宽高比决定了。想命中 --welcome-h / --tagline-h，就得纵向拉伸 ——
         这里把需要的倍数算出来写进 --welcome-stretch / --tagline-stretch。
         设成 1 就是保真不拉伸。
       ============================================================ */
    const measureCtx = document.createElement('canvas').getContext('2d');
    const cssVar = (name, fallback) =>
        (getComputedStyle(rootEl).getPropertyValue(name).trim() || fallback);

    /* '86vw' / '55vh' / '12px' → px（视口一变就得重算，所以不缓存） */
    function toPx(token) {
        const m = /^(-?[\d.]+)(vw|vh|px)$/.exec(String(token).trim());
        if (!m) return 0;
        const v = parseFloat(m[1]);
        if (m[2] === 'px') return v;
        return (v / 100) * (m[2] === 'vw' ? window.innerWidth : window.innerHeight);
    }

    /* 量出「每 1px 字号对应多少渲染宽度 / 墨迹高度」 */
    function measure(str, letterSpacingEm) {
        measureCtx.font = '400 100px "HuXiaoBo", system-ui, sans-serif';
        const m = measureCtx.measureText(str);
        const ink = (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0);
        const ls = letterSpacingEm * 100 * str.length;
        return {
            w: (m.width + ls) / 100,
            h: (ink || 72) / 100,   // 浏览器太老没有 actualBoundingBox 时退回 0.72em
        };
    }

    function reflowSplash() {
        const targetW = cssVar('--splash-w', '86vw');

        /* ① 宽度：字号 = 目标宽度 ÷ 实测比例。
              写成 calc 之后，窗口再变也不用重跑 JS。 */
        const welcomeRatio = measure(text, 0);
        if (!welcomeRatio.w) return;
        rootEl.style.setProperty('--welcome-fs', `calc(${targetW} / ${welcomeRatio.w.toFixed(4)})`);

        const taglineText = taglines.length ? taglines[0].textContent.trim() : '';
        const taglineRatio = taglineText ? measure(taglineText, 0.05) : null;
        if (taglineRatio && taglineRatio.w) {
            rootEl.style.setProperty('--tagline-fs', `calc(${targetW} / ${taglineRatio.w.toFixed(4)})`);
        }

        /* ② 高度：把「自然墨迹高度」换算成 px，和目标高度一比就是拉伸倍数 */
        function stretchFor(ratio, heightVar, stretchVar) {
            const fsPx = toPx(targetW) / ratio.w;         // 目标字号（px）
            const natural = fsPx * ratio.h;               // 它带来的自然墨迹高度（px）
            const want = toPx(cssVar(heightVar, '0'));
            const s = (natural > 0 && want > 0) ? want / natural : 1;
            rootEl.style.setProperty(stretchVar, Math.max(0.1, s).toFixed(4));
        }
        stretchFor(welcomeRatio, '--welcome-h', '--welcome-stretch');
        if (taglineRatio && taglineRatio.w) {
            stretchFor(taglineRatio, '--tagline-h', '--tagline-stretch');
        }
    }

    /* 视口一变，vw→px 的换算就变（拉伸倍数 = 目标高 ÷ 自然高，对它尤其敏感），
       所以要重算。挂到 World 的统一布局信号上 —— 它同时覆盖 resize、横竖屏、
       以及**字体加载完成**那一刻（字体没到就量，量到的是替代字体的比例）。 */
    if (window.World) World.onLayout(reflowSplash);
    else reflowSplash();

    /* ★ 滑出计时从「开屏起点」算起（timeline.js 会先等字体就绪），
       而不是从页面加载算起。入场那部分由 --welcome-in-delay 控制，
       而此刻字符动画是 animation-play-state: paused 的 —— 所以 CSS 里的
       延迟天然也是相对起点的。
       开屏被跳过时（Intro.cancelled）不要再补播一次滑出。 */
    const start = window.Intro ? window.Intro.armed : Promise.resolve(0);
    start.then(() => {
        if (window.Intro && window.Intro.cancelled) return;
        setTimeout(() => {
            if (!el.isConnected) return;
            el.classList.add('leave');
            // 副标题同一拍出发、方向相反（CSS 里 taglineLeave 往右）
            taglines.forEach((t) => t.classList.add('leave'));
        }, OUT.delay * 1000);
    });

    /* ★ 不能写成 { once: true }：.char 上的 charRise 结束时 animationend
       会冒泡到 el，第一个冒上来的事件就会把监听器消耗掉，于是
       welcomeLeave 永远不会被处理，整块 WELCOME 会一直留在 DOM 里。 */
    const onAnimationEnd = (e) => {
        if (e.target !== el || e.animationName !== 'welcomeLeave') return;
        el.removeEventListener('animationend', onAnimationEnd);
        el.remove();
        taglines.forEach((t) => t.remove());
    };
    el.addEventListener('animationend', onAnimationEnd);
})();