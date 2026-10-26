/* ============================================================
   P106：首页那两个角 —— 左下角「终端」、左上角「数据」
   ------------------------------------------------------------
   参考站（openilink.com）上有三样东西想搬过来，这是其中两样：
     · 首屏那种终端块：一行行打出来，末尾一个方块光标在闪；
     · 大号等宽数字 + 小号标签的「数据感」排版。

   位置由 style.css 里 `.hero-term` / `.hero-stats` 定死：
     · 终端 → 首页**左下角**（和右下角那行大字一左一右，压在同一条底线上）；
     · 数据 → 首页**左上角**（和右上角那行小字一上一下）。
   四个角和画框的四条刻线用的是同一套令牌，所以是严丝合缝的 ✓
   （见 style.css 的 P105 那段说明）。

   ★★ 要改终端里打出来的字：改下面 LINES 这一个数组，一行一条。
      只写 ASCII —— 这块用的是系统等宽字体（ui-monospace），
      中文会掉回另一个字体、观感突变；而且新中文字得重裁字体子集
      （node _dev/subset-font.js）。ASCII 则不需要额外处理 ✓。
   ★★ 光标不是这里画的：它是 `.hero-term-body::after`，
      跟在最后一个字的行内末尾，纯 CSS 闪（见 style.css）✓

   ★ 数字不写死：游戏数 = data/works.js 里 kind === 'unity' 的条数，
     方向数 = 页面上媒体面板的个数。加一套游戏、加一个方向，
     这两个数自己就变了 —— 不用回来改文案 ✓
   ★ prefers-reduced-motion：整段文字直接出现、光标不闪 ✓
   ============================================================ */
(function () {
    'use strict';

    /* ---------- 终端 ---------- */
    const LINES = [
        '$ whoami',
        'ResoluAlysis',
        '$ ls works/',
        'games  art  model  music',
        '$ '
    ];

    const TYPE_MS = 26;         // 每个字的间隔
    const LINE_PAUSE = 260;     // 打完一行停一下（换行读完才接下一行）
    const START_DELAY = 180;    // 开屏拉开后缓一下再开始敲
    /* ★★ P109：**渐隐撤掉了**（P108 加的那一套）。
       顺便说清它当时为什么"没效果"：`el` 拿到的是 `[data-hero="term-body"]`
       那个 `<pre>`，而 CSS 写的是 `.hero-term.is-done`（外层 div）——
       类挂在了 `<pre>` 上，没有任何规则命中它 ✗。
       （要接回来的话：挂类时用 `el.closest('.hero-term')`，两处都改 ✓） */

    /* ---------- 数据 ---------- */
    const pad2 = (n) => (n < 10 ? '0' + n : String(n));

    function setStat(name, n) {
        const el = document.querySelector('[data-stat="' + name + '"]');
        if (!el) return;
        /* ★ 取不到数就留 "--"：宁可空着，也别在首页上显示一个假的 00 ✓ */
        el.textContent = n > 0 ? pad2(n) : '--';
    }

    function fillStats() {
        const works = Array.isArray(window.WORKS) ? window.WORKS : [];
        const games = works.filter((w) => w && w.kind === 'unity').length;
        /* 媒体面板是手写在 index.html 里的（不来自 works.js），直接数 DOM ✓ */
        const fields = document.querySelectorAll('.media-panel').length;
        setStat('games', games);
        setStat('fields', fields);
    }

    function runTerminal() {
        const el = document.querySelector('[data-hero="term-body"]');
        if (!el) return;

        const full = LINES.join('\n');

        /* 降低动效：一次写完，不留打字计时器 ✓ */
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            el.textContent = full;
            return;
        }

        let i = 0;
        function tick() {
            if (i >= full.length) return;   /* ★ P109：打完就停在这儿（不渐隐）✓ */
            const ch = full[i];
            i += 1;
            el.textContent = full.slice(0, i);
            window.setTimeout(tick, ch === '\n' ? LINE_PAUSE : TYPE_MS);
        }
        window.setTimeout(tick, START_DELAY);
    }

    fillStats();

    /* 终端等开屏拉开再敲（否则那几秒全被遮罩盖着，等于白打）。
       没有 World（脚本没加载全）就直接开始，不阻塞 ✓ */
    if (window.World && typeof window.World.gate === 'function') {
        window.World.gate(runTerminal);
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runTerminal, { once: true });
    } else {
        runTerminal();
    }

    window.HeroConsole = { fillStats: fillStats, runTerminal: runTerminal, lines: LINES };
})();
