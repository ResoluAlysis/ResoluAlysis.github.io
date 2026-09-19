/* ============================================================
   拼接方块背景（可复用工厂）
   ============================================================ */
(function mosaicBackground() {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) return;

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

    /* ============================================================
       视差管理器（全局只有一个 rAF 循环）
       ============================================================ */
    const parallaxTiles = [];
    let parallaxRunning = false;

    function ensureParallaxLoop() {
        if (parallaxRunning) return;
        parallaxRunning = true;

        const main = document.querySelector('main');
        if (!main) { parallaxRunning = false; return; }

        function loop() {
            const sx = main.scrollLeft;
            for (const { tile, factor } of parallaxTiles) {
                tile.style.setProperty('--px', (-sx * factor).toFixed(1) + 'px');
            }
            requestAnimationFrame(loop);
        }
        loop();
    }

    function cleanDeadTiles() {
        for (let i = parallaxTiles.length - 1; i >= 0; i--) {
            if (!parallaxTiles[i].tile.isConnected) parallaxTiles.splice(i, 1);
        }
    }

    /* ============================================================
       单个实例
       ============================================================ */
    function createMosaic(section, opts) {
        const cfg = { ...DEFAULTS, ...opts };

        function build() {
            section.querySelector('.mosaic-layer')?.remove();
            cleanDeadTiles();

            const W = section.clientWidth;
            const H = section.clientHeight;
            if (!W || !H) return;

            const layer = document.createElement('div');
            layer.className = 'mosaic-layer';
            if (cfg.color) {
                    layer.style.setProperty('--mosaic-color', cfg.color);
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

                    // 视差
                    if (cfg.parallax && proximity < 0.7) {
                        const base = 0.05 + (1 - proximity) * 0.01;
                        const jitter = (Math.random() - 0.5) * 0.2;
                        const factor = Math.max(0, base + jitter);
                        parallaxTiles.push({ tile, factor });
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

        return { build };
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

    function render() {
        instances.forEach((inst) => inst.build());
    }

    render();
    ensureParallaxLoop();

    let t = null;
    window.addEventListener('resize', () => {
        clearTimeout(t);
        t = setTimeout(render, 150);
    });
})();