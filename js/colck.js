/* ============================================================
   圆形刻度（每个 SVG 独立配置）
   ============================================================ */
(function circleTicks() {
    const svgs = document.querySelectorAll('.circle-ticks');
    if (!svgs.length) return;

    /* ============ 默认参数（data-* 没写就用这些） ============ */
    const DEFAULTS = {
        count:      60,
        major:      5,
        lenMajor:   6,
        lenMinor:   2,
        widthMajor: 0.6,
        widthMinor: 0.2,
        opacityMajor: 0.9,
        opacityMinor: 0.5,
        startAngle: -90,   // 度，-90 = 正上方
    };

    const CX = 100;
    const CY = 100;
    const R_OUTER = 100;

    /* ============ 读取 data-* 参数 ============ */
    function readConfig(svg) {
        const d = svg.dataset;
        const num = (v, fallback) => {
            const n = parseFloat(v);
            return Number.isFinite(n) ? n : fallback;
        };
        return {
            count:        num(d.count,       DEFAULTS.count),
            major:        num(d.major,       DEFAULTS.major),
            lenMajor:     num(d.lenMajor,    DEFAULTS.lenMajor),
            lenMinor:     num(d.lenMinor,    DEFAULTS.lenMinor),
            widthMajor:   num(d.widthMajor,  DEFAULTS.widthMajor),
            widthMinor:   num(d.widthMinor,  DEFAULTS.widthMinor),
            opacityMajor: num(d.opacityMajor, DEFAULTS.opacityMajor),
            opacityMinor: num(d.opacityMinor, DEFAULTS.opacityMinor),
            startAngle:   num(d.startAngle,  DEFAULTS.startAngle),
        };
    }

    /* ============ 为单个 SVG 生成刻度 ============ */
    function buildTicks(svg, cfg) {
        svg.replaceChildren();   // 清空旧刻度

        const frag = document.createDocumentFragment();
        const startRad = (cfg.startAngle * Math.PI) / 180;

        for (let i = 0; i < cfg.count; i++) {
            const angle = (i / cfg.count) * Math.PI * 2 + startRad;
            const isMajor = i % cfg.major === 0;

            const len = isMajor ? cfg.lenMajor : cfg.lenMinor;
            if (len <= 0) continue;   // 长度为 0 的不画

            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            const x1 = CX + cos * R_OUTER;
            const y1 = CY + sin * R_OUTER;
            const x2 = CX + cos * (R_OUTER - len);
            const y2 = CY + sin * (R_OUTER - len);

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x1.toFixed(2));
            line.setAttribute('y1', y1.toFixed(2));
            line.setAttribute('x2', x2.toFixed(2));
            line.setAttribute('y2', y2.toFixed(2));
            line.setAttribute('stroke-width', isMajor ? cfg.widthMajor : cfg.widthMinor);
            line.setAttribute('opacity',     isMajor ? cfg.opacityMajor : cfg.opacityMinor);

            frag.appendChild(line);
        }

        svg.appendChild(frag);
    }

    /* ============ 应用 ============ */
    svgs.forEach((svg) => buildTicks(svg, readConfig(svg)));

    /* ============================================================
        时钟：让“现在”位于底部（正下方）
        ============================================================ */
    const elS = document.querySelector('.circle-ticks-1');   // 秒
    const elM = document.querySelector('.circle-ticks-2');   // 分
    const elH = document.querySelector('.circle-ticks-3');   // 时

    /* 旋转公式推导：
        刻度 0 绘制在 -90°（正上方），刻度 i 在 -90 + i*step。
        要让值 v 落在 90°（正下方）：-90 + v*step + R = 90
        → R = 180 - v*step
    */
    /* ★ 这里原来每 30 分钟 fetch 一次 worldtimeapi.org 做网络对时：
       · 那个免费接口经常挂，还会把访客 IP 交给第三方，隐私和可靠性都不划算；
       · syncInterval 上的指数退避算了半天，setInterval 里却写死 30 分钟，
         那段退避逻辑一次都没生效过。
       已改为直接使用本机时间。 */
    function now() {
        return new Date();
    }

    const elText = document.querySelector('.digital-clock');
    let lastClockText = '';     // ★ 数字时钟只在秒数变化时才写 DOM

    function updateClock() {
        const t = now();
        const ms = t.getMilliseconds();
        const s  = t.getSeconds() + ms / 1000;
        const m  = t.getMinutes() + s / 60;
        const h  = (t.getHours() % 12) + m / 60;

        // 旋转环
        if (elS) elS.style.transform = `rotate(${(180 - s * 6).toFixed(2)}deg)`;
        if (elM) elM.style.transform = `rotate(${(180 - m * 6).toFixed(2)}deg)`;
        if (elH) elH.style.transform = `rotate(${(180 - h * 30).toFixed(2)}deg)`;

        // ★ 数字时钟（24 小时制）
        if (elText) {
            const HH = String(t.getHours()).padStart(2, '0');
            const MM = String(t.getMinutes()).padStart(2, '0');
            const SS = String(t.getSeconds()).padStart(2, '0');
            const txt = `${HH}:${MM}:${SS}`;
            if (txt !== lastClockText) {
                lastClockText = txt;
                elText.textContent = txt;
            }
        }
    }
    /* ★ 交给 World 的公共 rAF，不再自己开一个循环 */
    if (window.World) World.onFrame(updateClock);


})();