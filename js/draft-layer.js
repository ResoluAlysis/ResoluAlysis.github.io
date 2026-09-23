/* ============================================================
   制图框装饰（设计图 / 极简 / 点线面 + 数字）
   ------------------------------------------------------------
   全部贴在布局规格上（--v-inset / --gutter / --safe-b / --content-x），
   所以版面一变它自己跟着走。四块内容正好凑齐四种元素：

     点  · 四角刻线（crop mark）+ 进度条上的推进点 + 一颗闪的点
     线  · 刻线的两条边、竖排进度条的轨道与推进线
     面  · 导航栏里那条竖直的进度带（占满 nav 与页脚之间）
     数字 · X 读数（当前横向滚动位置）、百分比、SCALE / SHEET 编号

   静态 = 刻线 + 标题栏骨架；动态 = 读数 + 推进线 + 推进点 + 闪点。
   动态只订阅 World.onScroll（滚动位置不变时一个 DOM 都不碰），
   不额外开 rAF；只有那颗闪点是纯 CSS 动画。

   位置：
     · 四角刻线 → .draft-frame（仍然贴在内容安全区四角）
     · 标题栏   → 改成**竖排进度条**，插进左侧导航栏的 .nav-container 里，
                  用 flex: 1 自动填满「nav 链接下方 → 页脚上方」这段空间，
                  所以它天生就是"导航栏与页脚之间" ✔
     内容按 -90° 摆：布局上是行列互换，文字各自竖排（从下往上读）。

   ★ 想关掉：把下面 ENABLED 改成 false（和浮窗一个套路）。 */
(function draftLayer() {
    'use strict';

    const ENABLED = true;
    if (!ENABLED || !window.World) return;

    const frame = document.createElement('div');
    frame.className = 'draft-frame';
    frame.setAttribute('aria-hidden', 'true');
    frame.innerHTML =
        '<i class="df-corner df-tl"></i>' +
        '<i class="df-corner df-tr"></i>' +
        '<i class="df-corner df-bl"></i>' +
        '<i class="df-corner df-br"></i>';
    document.body.appendChild(frame);

    /* 竖排进度条：三列 —— 站名 / 轨道 / 读数 */
    const strip = document.createElement('div');
    strip.className = 'df-strip';
    strip.setAttribute('aria-hidden', 'true');
    strip.innerHTML =
        '<span class="df-v df-name">RESOLUALYSIS SHEET 01</span>' +
        '<div class="df-bar"><i data-fill></i><b data-dot></b></div>' +
        '<span class="df-v df-read"><span data-x>0.00</span><span data-pct>0%</span></span>';

    /* 塞进导航栏（在 nav 链接之后），flex:1 自己撑满到页脚上方 */
    const navBox = document.querySelector('.nav-container');

    /* ★ P68：|GAME TIME| —— 游乐区展开时，上面那三件（站名 / 推进线 / 读数）
       淡出、这行字逐个闪出。
       · 拆成一个字一个 span 就是为了"逐个"：CSS 那边用
         `animation-delay: calc(var(--i) * 80ms)` 错开（见 .df-gametime）。
       · 高度不在这里算：CSS 用 `inset: 2px 0` 贴合 .df-strip 的内容框，
         正好等于 .df-bar 那条推进线的高度。
       · 整行是 ASCII，不占字体子集的新字形。 */
    const gametime = document.createElement('div');
    gametime.className = 'df-gametime';
    '|GAME TIME|'.split('').forEach(function (ch, i) {
        const span = document.createElement('span');
        span.textContent = ch;
        span.style.setProperty('--i', String(i));
        gametime.appendChild(span);
    });
    strip.appendChild(gametime);

    (navBox || document.body).appendChild(strip);

    const xEl = strip.querySelector('[data-x]');
    const pctEl = strip.querySelector('[data-pct]');
    const fillEl = strip.querySelector('[data-fill]');
    const dotEl = strip.querySelector('[data-dot]');

    let maxScroll = 1;

    function draw(scrollX) {
        const p = Math.max(0, Math.min(1, scrollX / maxScroll));
        xEl.textContent = scrollX.toFixed(2);
        pctEl.textContent = Math.round(p * 100) + '%';
        fillEl.style.transform = 'scaleY(' + p.toFixed(4) + ')';   // 自下而上
        /* ★ 推进点也走 transform（不写 style.bottom）。
           原因见 style.css 的 .df-bar b：bottom 是布局属性，transform 是合成器属性，
           两个混用的话，主线程一忙它们就会错开，表现成"进度条在走、点不跟"。
           这里只是把进度写进一个 CSS 变量，剩下的交给 CSS 的 translateY。 */
        dotEl.style.setProperty('--df-p', (p * 100).toFixed(3) + '%');
    }

    function measure() {
        const m = World.main;
        maxScroll = m ? Math.max(1, m.scrollWidth - m.clientWidth) : 1;
        draw(World.scrollX);
    }

    World.onLayout(measure);   // resize 后重算总长（注册时立刻跑一次）
    World.onScroll(draw);      // 只在滚动位置变化时触发
})();
