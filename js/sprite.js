/* ============================================================
   发光粒子 sprite
   ------------------------------------------------------------
   原来每颗粒子都要设一次 ctx.shadowBlur / ctx.shadowColor 再 fill()，
   400 颗就是 400 次 canvas 阴影（内部各是一次模糊），是整页最贵的
   一处。现在把「形状 + 光晕」预渲染到一张离屏 canvas 上，帧内只剩
   drawImage + globalAlpha。

   注意：光晕现在是跟着 sprite 一起缩放的（原来是固定 3px）。
   粒子只有 1~8px，观感差别很小；如果想让小粒子更亮，
   把下面 CONFIG.glow 调大，或给不同 LAYERS 各建一张 sprite。
   ============================================================ */
window.makeGlowSprite = function makeGlowSprite(options) {
    const opt = options || {};
    const color = opt.color || '255, 255, 255';
    const shape = opt.shape || 'diamond';   // 'diamond' | 'circle'
    const blur  = opt.blur === undefined ? 3 : opt.blur;
    const size  = opt.size || 64;

    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const c = cv.getContext('2d');
    const cx = size / 2;
    const cy = size / 2;
    /* 四周留出光晕的位置，剩下的才是实心形状的半径 */
    const r = Math.max(0.5, size / 2 - blur * 2);

    function path() {
        c.beginPath();
        if (shape === 'circle') {
            c.arc(cx, cy, r, 0, Math.PI * 2);
        } else {
            c.moveTo(cx, cy - r);
            c.lineTo(cx + r, cy);
            c.lineTo(cx, cy + r);
            c.lineTo(cx - r, cy);
            c.closePath();
        }
    }

    c.shadowBlur  = blur;
    c.shadowColor = 'rgba(' + color + ', 1)';
    c.fillStyle   = 'rgba(' + color + ', 1)';
    path();
    c.fill();

    /* 形状实际只占 sprite 的 r/(size/2)，绘制时要按这个比例放大，
       保证实心部分的视觉大小和原来一致 */
    cv.shapeRatio = r / (size / 2);
    return cv;
};