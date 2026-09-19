window.SPLASH_TIMELINE = {
  // 每个元素 = { delay: 等几秒开始, duration: 播放几秒 }
  // delay 从页面加载那一刻算起，是绝对时间

  fade:       { delay: 0.2, duration: 0.8 },   // 渐显遮罩淡出
  maskShrink: { delay: 2.0, duration: 1.5 },   // 红遮罩缩到左侧
  maskFade:   { delay: 3.8, duration: 0.5 },   // 红遮罩淡出
  cross:      { delay: 3.0, duration: 1.2 },   // 准星收缩
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
  root.style.setProperty("--t-total", total + "s");
  window.SPLASH_TOTAL = total;
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