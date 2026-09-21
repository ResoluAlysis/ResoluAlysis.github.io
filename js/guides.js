/* ============================================================
   参考线 / 参考坐标系
   ============================================================ */
(function guideLayer() {
    const canvas = document.getElementById('guide-layer');
    if (!canvas || !window.World) return;
    /* ★ visible 的初值是 false，这里必须同步成透明，
       否则参考线一进页面就是显示的，G 键的状态和视觉对不上 */
    canvas.style.opacity = '0';
    const ctx = canvas.getContext('2d');

    /* ============ 可调参数 ============ */
    const STEP_MINOR = 250;      // 小格 50px
    const STEP_MAJOR = 500;     // 大格 200px
    const COLOR_MINOR = 'rgba(25, 25, 25, 0.10)';
    const COLOR_MAJOR = 'rgba(225, 25, 25, 0.25)';
    const COLOR_LABEL = 'rgba(225, 25, 25, 0.4)';
    const FONT = '10px ui-monospace, Consolas, monospace';

    let dpr = 1, W = 0, H = 0;

    /* ============ 尺寸 ============ */
    function resize() {
        dpr = window.devicePixelRatio || 1;
        W = canvas.clientWidth;
        H = canvas.clientHeight;
        canvas.width  = W * dpr;
        canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* ============ 画一条竖线 + 标签 ============ */
    function vline(screenX, wx, isMajor) {
        ctx.beginPath();
        ctx.strokeStyle = isMajor ? COLOR_MAJOR : COLOR_MINOR;
        ctx.lineWidth = 1;
        ctx.moveTo(screenX + 0.5, 0);
        ctx.lineTo(screenX + 0.5, H);
        ctx.stroke();

        if (isMajor) {
            ctx.fillStyle = COLOR_LABEL;
            ctx.font = FONT;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(`${wx}`, screenX + 4, 6);
        }
    }

    /* ============ 画一条横线 + 标签 ============ */
    function hline(screenY, wy, isMajor) {
        ctx.beginPath();
        ctx.strokeStyle = isMajor ? COLOR_MAJOR : COLOR_MINOR;
        ctx.lineWidth = 1;
        ctx.moveTo(0, screenY + 0.5);
        ctx.lineTo(W, screenY + 0.5);
        ctx.stroke();

        if (isMajor) {
            ctx.fillStyle = COLOR_LABEL;
            ctx.font = FONT;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${wy}`, 6, screenY);
        }
    }

    /* ============ 绘制 ============
       ★ 参考线只依赖 scrollX，本来不需要每帧重画（原来一帧一次，
         静止时也在白算）。现在挂到 World.onScroll，只有滚动才重绘。 */
    function draw() {
        /* 移动端 CSS 把画布 display:none 了，此时 W/H 为 0，直接跳过。
           原来这里靠「加载时判断一次 isMobile 就 return」，
           窗口从移动端放大回桌面后就再也不会画了。 */
        if (!W || !H) return;

        const scrollX = World.scrollX;

        ctx.clearRect(0, 0, W, H);

        /* ----- 垂直参考线（世界坐标） ----- */
        // 只画视口内的范围
        const worldStart = Math.floor(scrollX / STEP_MINOR) * STEP_MINOR;
        const worldEnd   = scrollX + W;

        for (let wx = worldStart; wx <= worldEnd; wx += STEP_MINOR) {
            const screenX = wx - scrollX;
            const isMajor = wx % STEP_MAJOR === 0;
            vline(screenX, wx, isMajor);
        }

        /* ----- 水平参考线（视口坐标） ----- */
        for (let wy = 0; wy <= H; wy += STEP_MINOR) {
            const isMajor = wy % STEP_MAJOR === 0;
            hline(wy, wy, isMajor);
        }

        /* ----- 世界原点标记 ----- */
        const originX = 0 - scrollX;
        if (originX >= 0 && originX <= W) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(225, 25, 25, 0.9)';
            ctx.lineWidth = 2;
            ctx.moveTo(originX + 0.5, 0);
            ctx.lineTo(originX + 0.5, H);
            ctx.stroke();
        }

    }

    /* ============ 启动 ============ */
    World.onLayout(function () { resize(); draw(); });   // 注册时立刻跑一次；含字体加载完成
    World.onScroll(draw);                                // 注册时会立刻用当前 scrollX 画一次

    /* ============ G 键开关（P48：这里同时是框选的闸门） ============
       ★ 状态挂在 body 的类上，不让 crosshair.js 跨文件读这里的变量 ——
         两边各存一份状态迟早会对不上。
       ★★ `guides-ready` 这个标记是**给 crosshair.js 兜底用的**：
         上面那个守卫（!canvas || !World）一旦成立，本文件后面全都不会执行，
         G 键处理器根本不存在，`guides-on` 永远是 false。
         crosshair.js 会把"框选"绑在参考网格上 —— 没有这个标记，
         它会认为"网格功能不可用"，于是**放开闸门**（fail-open）。
         不打这个标记的话，参考线挂掉会顺手把框选也永久禁掉，且不报错。 */
    document.body.classList.add('guides-ready');

    let visible = false;
    document.body.classList.toggle('guides-on', visible);

    document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) {
        return;
    }
        if (e.key.toLowerCase() === 'g') {
            visible = !visible;
            canvas.style.opacity = visible ? '1' : '0';
            document.body.classList.toggle('guides-on', visible);
        }
    });
})();

