/* ============================================================
   拼接方块背景（可复用工厂）
   ============================================================ */
(function mosaicBackground() {
    if (!window.World) return;

    const DESKTOP = '(min-width: 769px)';
    /* 初始值直接问一次，这样后面 onLayout 第一次调 render() 时状态就是对的 */
    let active = window.matchMedia(DESKTOP).matches;

    /* ============================================================
       默认参数（每个实例可以覆盖）
       ============================================================ */
    const DEFAULTS = {
        gap:        160,     // 网格间距
        sizeMin:    100,     // 最小方块
        sizeMax:    500,     // 最大方块
        jitter:     16,      // 偏离网格的距离
        floatZone:  0.75,    // 靠外多少比例以内才漂浮（0~1）
        floatMax:   100,     // 最大漂浮位移
        parallax:   true,    // 是否启用视差
        opacityMin: 0.5,     // 最外侧的最小透明度
        opacityMax: 1.3,     // 最内侧的最大透明度（超过1会被 clamp）
    };

    /* ★ 视差不再需要 JS 循环：每个方块只写一次 --parallax 系数，
       位移由 css/style.css 里的 --scroll-x 统一算（见 js/world.js）。 */

    /* ============================================================
       单个实例
       ============================================================ */
    function createMosaic(section, opts) {
        const cfg = { ...DEFAULTS, ...opts };

        function build() {
            section.querySelector('.mosaic-layer')?.remove();

            const W = section.clientWidth;
            const H = section.clientHeight;
            if (!W || !H) return;

            const layer = document.createElement('div');
            layer.className = 'mosaic-layer';
            /* color      = 色带的颜色（也就是这块 section 的"底色"）
               tileColor  = 方块的颜色（不写就跟 color 同色，等于看不见方块） */
            if (cfg.color) {
                    layer.style.setProperty('--mosaic-color', cfg.color);
            }
            if (cfg.tileColor) {
                    layer.style.setProperty('--mosaic-tile-color', cfg.tileColor);
            }

            // 只读左边界
            const cs = getComputedStyle(section);
            const bandLeftPct = parseFloat(cs.getPropertyValue('--band-left')) || 40;
            const leftBound = W * bandLeftPct / 100;

            const cols = Math.ceil(W / cfg.gap) + 1;
            const rows = Math.ceil(H / cfg.gap) + 1;

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const gx = c * cfg.gap - cfg.gap / 2 + (Math.random() - 0.5) * cfg.jitter * 2;
                    const gy = r * cfg.gap - cfg.gap / 2 + (Math.random() - 0.5) * cfg.jitter * 2;

                    if (gx >= leftBound) continue;

                    const distFromBand = leftBound - gx;
                    const proximity = 1 - Math.min(distFromBand / leftBound, 1);

                    const keepChance = 0.35 + proximity * 0.65;
                    if (Math.random() > keepChance) continue;

                    const sizeFactor = 0.30 + proximity * 0.70;
                    const size = (cfg.sizeMin + Math.random() * (cfg.sizeMax - cfg.sizeMin)) * sizeFactor;

                    const tile = document.createElement('div');
                    tile.className = 'mosaic-tile';
                    tile.style.left   = gx.toFixed(1) + 'px';
                    tile.style.top    = gy.toFixed(1) + 'px';
                    tile.style.width  = size.toFixed(1) + 'px';
                    tile.style.height = size.toFixed(1) + 'px';

                    // 透明度：靠内更实
                    const op = cfg.opacityMin + proximity * (cfg.opacityMax - cfg.opacityMin);
                    tile.style.opacity = Math.min(1, op).toFixed(2);

                    // ★ 视差：只在这里写一次系数（位移交给 CSS）
                    if (cfg.parallax && proximity < 0.7) {
                        const base = 0.05 + (1 - proximity) * 0.01;
                        const jitter = (Math.random() - 0.5) * 0.2;
                        tile.style.setProperty('--parallax', Math.max(0, base + jitter).toFixed(4));
                    }

                    // 漂浮
                    if (proximity < 0.4) {
                        const dist = (0.4 - proximity) / 0.4 * cfg.floatMax;
                        const angle = Math.random() * Math.PI * 2;
                        tile.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(1) + 'px');
                        tile.style.setProperty('--dy', (Math.sin(angle) * dist).toFixed(1) + 'px');
                        tile.style.setProperty('--rot', ((Math.random() - 0.5) * 14).toFixed(1) + 'deg');
                        tile.style.setProperty('--float-dur', (4 + Math.random() * 4).toFixed(2) + 's');
                        tile.style.setProperty('--float-delay', (Math.random() * 3).toFixed(2) + 's');
                        tile.classList.add('float');
                    }

                    layer.appendChild(tile);
                }
            }

            section.insertBefore(layer, section.firstChild);
        }

        return { build, section };
    }

    /* ============================================================
       ★ 配置：每个容器一条
       selector 可以是任意 CSS 选择器
       opts 覆盖 DEFAULTS 里的字段
       ============================================================ */
    const CONFIG = [
        {
            selector: '#skills',
            opts: {
                gap: 160, sizeMin: 100, sizeMax: 500, jitter: 16,
                floatMax: 100,
            },
        },
        {
            selector: '#projects',
            opts: {
                gap: 100, sizeMin: 80, sizeMax: 600, jitter: 0,
                floatMax: 100,
                color: 'var(--bg-alt)',
            },
        },
        {
            selector: '#contact',
            opts: {
                gap: 200, sizeMin: 150, sizeMax: 600, jitter: 12,
                floatMax: 140,
                parallax: false,   // 这一块不做视差
                /* ── 配色分工 ──
                   color     = 实色带（.mosaic-layer::before，从 --band-left 铺到右边）
                   tileColor = 方块
                   这里两者同色（黑），所以色带与方块是连续的一整块，
                   方块靠近分界线时会自然融进色带里。

                   底色（方块之间露出来的部分）来自 #contact 的 CSS background
                   = var(--bg-alt)，也就是 --bg-alt 那一档；
                   色带是压在这层底色之上的不透明覆盖物。
                   想改成「整块都是 --bg-alt、只有方块是黑的」，
                   把下面的 color 换成 'var(--bg-alt)' 即可。

                   ── 关于方块可见度（这条注释改过一次，记下正确结论）──
                   ✓ 感知亮度差 ΔL*：黑方块在 #191919 上 = 8.76，
                     远高于大面积色块「刚可分辨」的阈值（≈1），属「清楚」。
                   ✗ 不要用 WCAG 对比度(1.19) 判断：那个公式带 +0.05 的
                     环境光抬升项，是为「亮房间里读小字」设计的，
                     量大面积深色肌理会严重低估。
                   要留意的场景：黑位被抬高的屏幕（漏光 LCD）或强环境光下。 */
                color: 'var(--black)',        // 实色带 = 黑，与方块同色
                tileColor: 'var(--black)',    // 方块 = 黑
            },
        },
        // 想给更多容器加效果，就再加一条
        // { selector: '.some-class', opts: { ... } },
    ];

    /* ============================================================
       实例化
       ============================================================ */
    const instances = [];
    CONFIG.forEach(({ selector, opts }) => {
        document.querySelectorAll(selector).forEach((section) => {
            instances.push(createMosaic(section, opts));
        });
    });

    /* 去重的键必须是「真正被测量的尺寸」，不能用 window.innerWidth ——
       字体加载完成后节内容可能超过一屏、出现内部滚动条，clientWidth 会变
       而 innerWidth 不变（这恰恰是 onLayout 要处理的场景）。
       同时它也让「onLayout 注册时的立刻调用」和「断点 effect 的调用」
       不会重复重建。 */
    let lastSig = null;

    function signature() {
        return instances
            .map((inst) => inst.section.clientWidth + 'x' + inst.section.clientHeight)
            .join('|');
    }

    function render() {
        if (!active) return;
        const sig = signature();
        if (sig === lastSig) return;
        lastSig = sig;
        instances.forEach((inst) => inst.build());
    }

    /* ★ 断点切换：进桌面就建、离开桌面真正拆掉。
       CSS 里虽然把 .mosaic-layer display:none 了，但那些绝对定位的方块
       还留在 DOM 里；窗口来回跨断点几次就会不断堆积。 */
    World.effect(DESKTOP, function (isDesktop) {
        active = isDesktop;
        if (isDesktop) {
            render();
        } else {
            document.querySelectorAll('.mosaic-layer').forEach(function (el) { el.remove(); });
            /* ★ 必须清掉签名：否则「桌面 → 移动端 → 回到同样宽度的桌面」时，
               签名看起来没变，render() 会跳过重建，而方块其实已经被拆掉了。 */
            lastSig = null;
        }
    });

    /* 尺寸变化 / 字体加载完成 → 重算位置 */
    World.onLayout(render);
})();