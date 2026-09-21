window.SPLASH_TIMELINE = {
  // 每个元素 = { delay: 等几秒开始, duration: 播放几秒 }
  // ★ delay 从「开屏起点」算起，而不是从页面加载那一刻。
  //   开屏起点 = 字体就绪（或超时），由文件末尾的 window.Intro 决定。

  fade:       { delay: 0.2, duration: 1.2 },   // 渐显遮罩淡出
  welcomeIn:  { delay: 0.8, duration: 1.6 },   // 开屏字符逐字出现 + 停留
  welcomeOut: { delay: 2.2, duration: 1.0 },   // 开屏字符向左滑出（= welcomeIn.delay + welcomeIn.duration）
  maskShrink: { delay: 2.8, duration: 1.5 },   // 红遮罩缩到左侧
  // 纯色层：在红幕开始移动 0.2s 后，从中线向上下化开（图层见 style.css 的 .splash-化开）
  iris:       { delay: 3.0, duration: 0.8 },   // = maskShrink.delay + 0.2
  // 网点层：在上一层之后 0.2s，同样向上下化开（duration 取 1.3，总和仍是 4.5s）
  dots:       { delay: 3.2, duration: 1.2 },   // = iris.delay + 0.2
  maskFade:   { delay: 3.8, duration: 0.5 },   // 红遮罩淡出
  cross:      { delay: 3.0, duration: 1.2 },   // 准星收缩
  circlesIn: { delay: 4.0, duration: 0.1, stagger: 0.2, grow: 0.05 },   // 时间圆环闪烁登场
  //         ↑ 起始延迟  ↑ 最外圈时长  ↑ 每个之间的延迟步长  ↑ 每层时长递增
  body:       { delay: 0.0, duration: 4.5 },   // body 缩放
};


/* ===== 把每条时间表写成 CSS 变量 ===== */
(function () {
  const t = window.SPLASH_TIMELINE;
  const root = document.documentElement;

  for (const [key, cfg] of Object.entries(t)) {
    root.style.setProperty(`--t-${key}-delay`, cfg.delay + "s");
    root.style.setProperty(`--t-${key}-dur`,   cfg.duration + "s");
  }

  // 总时长 = 所有轨道里 delay + duration 最大的那个
  const total = Math.max(...Object.values(t).map(v => v.delay + v.duration));
  /* ★ 纯色层的起点 = 红幕开始移动 + 0.2s。
       这里现算一遍覆盖上面那个手写的 delay —— 以后改 maskShrink.delay，它会跟着走。 */
  const sec = (n) => Math.round(n * 1000) / 1000 + "s";   // 抹掉浮点尾巴（2.8+0.4 会变成 3.1999999999999997）
  root.style.setProperty("--t-iris-delay", sec(t.maskShrink.delay + 0.2));
  root.style.setProperty("--t-dots-delay", sec(t.maskShrink.delay + 0.4));

  root.style.setProperty("--t-total", total + "s");
  window.SPLASH_TOTAL = total;
})();

/* ============================================================
   开屏起点：等字体就绪
   ------------------------------------------------------------
   要解决的问题：WELCOME 和正文都用 HuXiaoBo（3.2MB）。原来所有开屏
   计时都从「页面加载」开始算，而字体往往要晚一两秒才到 —— 结果那行
   巨大的 WELCOME 先用替代字体渲染，等字体到了再当着用户的面重排一次。

   做法：把「开屏起点」推迟到字体就绪（或超时）。
     · CSS 侧：开屏相关动画默认 animation-play-state: paused。
       动画已经应用、画面停在 0% 状态（遮罩是满的、页面是放大 1.5 的），
       但时钟不走。加上 html.intro-armed 后才开始计时 ——
       于是 CSS 里那些 delay 天然就是「相对起点」的。
     · JS 侧：各模块 await window.Intro.armed 之后再 setTimeout，
       而不是从页面加载就开始计时。
     · 用户跳过 / 降低动效 → Intro.cancel()，立即放行，
       避免还在 await 的模块被卡住不执行。

   注意：等待期间用户看到的是纯色开屏遮罩，所以 maxWait 不能太大。
   真正治本的办法是把 3.2MB 的字体做子集化（只留实际用到的字形）。
   ============================================================ */
window.Intro = (function introGate() {
    const MAX_WAIT = 2000;      // 最多等字体多少毫秒（调大 = 重排风险小但黑屏久）

    let armed = false;
    let cancelled = false;
    let resolveArmed;
    const armedPromise = new Promise(function (r) { resolveArmed = r; });

    function arm() {
        if (armed) return;
        armed = true;
        document.documentElement.classList.add('intro-armed');
        resolveArmed(performance.now());
    }

    function cancel() {
        cancelled = true;
        arm();      // 必须强制放行，否则 await Intro.armed 的模块会永远不执行
    }

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canWait = !reduce
        && document.fonts
        && typeof document.fonts.load === 'function';

    if (!canWait) {
        arm();                                  // 等不了（或用户要求减少动效）就直接开始
    } else {
        let settled = false;
        function start() {
            if (settled) return;
            settled = true;
            arm();
        }
        /* 只等开屏真正用到的两个字体（正文 HuXiaoBo + 时钟 Crunch-Light），并且和超时赛跑 */
        Promise.all([
            document.fonts.load('1em "HuXiaoBo"'),
            document.fonts.load('1em "Crunch-Light"'),
        ]).then(start, start);
        setTimeout(start, MAX_WAIT);
    }

    return {
        armed: armedPromise,                    // Promise<number>：放行时刻
        maxWait: MAX_WAIT,
        get armedNow() { return armed; },
        get cancelled() { return cancelled; },
        cancel: cancel,
    };
})();

/* ===== 小工具：sleep、等到元素动画结束 ===== */
window.splashUtils = {
    sleep(sec) {
        return new Promise((r) => setTimeout(r, sec * 1000));
    },
    waitAnimationEnd(el) {
        return new Promise((resolve) => {
            if (!el) return resolve();
            el.addEventListener('animationend', resolve, { once: true });
        });
    },
    waitTransitionEnd(el, prop) {
        return new Promise((resolve) => {
            if (!el) return resolve();
            el.addEventListener('transitionend', (e) => {
                if (!prop || e.propertyName === prop) resolve();
            }, { once: true });
        });
    },
};