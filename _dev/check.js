/* ============================================================
   开发自检（只给开发用，不进站点）
   ------------------------------------------------------------
   跑法：node _dev/check.js
     1. index.html  标签平衡 / data-work 与 works.js 对得上 / 浮窗骨架没改名
     2. style.css   括号平衡 / var() 有定义或兜底 / @keyframes 引用存在
     3. 浮窗状态机  用极简 DOM 桩把 js/floating-window.js 真跑一遍
   为什么手写 DOM 桩：这台机器装不了 jsdom/puppeteer（无外网），
   headless Edge 也起不来（mojo 通道被拒），只能自己搭。
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
    if (cond) { pass++; console.log('  \u2714 ' + name); }
    else { fail++; console.log('  \u2718 ' + name + (extra ? '   \u2192 ' + extra : '')); }
};
const section = t => console.log('\n' + t);

const html = read('index.html');
const css = read('css/style.css');
const worksSrc = read('data/works.js');
const winSrc = read('js/floating-window.js');
/* 状态机测试要跑真代码：把总开关临时顶成 true（发布时它可能是 false） */
const winSrcForTest = winSrc.replace(/const ENABLED = (true|false);/, 'const ENABLED = true;');

/* ============================================================
   ★★ 判断"源码里有没有 / 没有 X"之前，先剥掉注释。
   ------------------------------------------------------------
   这个坑到 P33 为止已经踩了 **5 次**，每次都是同一件事：
   我自己写的注释里出现了被断言的那个词，于是一条"不该包含 X"的断言
   被注释骗成失败，或者一条"应该包含 X"的断言被注释骗成通过。
     · P27  `Crunch-Light`  —— 注释在解释"这里原来等的是它"
     · P29  `getBoundingClientRect`
     · P31  `getBoundingClientRect`（同一个词，又来一次）
     · P32  `js/rulers.js`  —— 注释里写着"宽度/位置由 js/rulers.js 写"
     · P33  `.cursor-dot`   —— 注释里写着"圆形指针（.cursor-dot）搬走了"
   ★ 所以别再靠"记住"了：**凡是对源码做"有没有某个词"的判断，一律走
     codeOnly()**。只有极少数断言是**故意**要查注释的（比如"注释里有没有
     写清坑在哪"），那些直接对原文做，并在名字里注明。
   ============================================================ */
const codeOnly = (src) => String(src)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')      // 块注释
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');  // 行注释（避开 https:// ）

/* ============================================================
   0. 源文件编码
   ------------------------------------------------------------
   ★ 这条是被一次真实的翻车逼出来的：用 PowerShell 的 `Get-Content -Raw`
     读 UTF-8 文件、再 `Set-Content -Encoding utf8` 写回去，会**同时**
     干两件坏事 —— 读的时候按 ANSI/GBK 解（整篇乱码）、写的时候加 BOM。
     偏偏中文文件不会因此报错，只会变成一屏看不懂的字，
     而且 Git 上显示成"整个文件都被改了"。
   所以：必须是**合法 UTF-8**、**不带 BOM**，行尾也不能混。
   （读写这些文件请用编辑工具或 Node，不要用 PowerShell 的文本 cmdlet。）
   ============================================================ */
section('[0] 源文件编码');
(function encoding() {
    const files = [
        'index.html', 'css/style.css', 'data/works.js', 'CHANGES.md',
        ...fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f),
        ...fs.readdirSync(path.join(ROOT, '_dev')).filter(f => f.endsWith('.js')).map(f => '_dev/' + f),
    ].filter(f => fs.existsSync(path.join(ROOT, f)));

    const badEnc = [], badEol = [];
    for (const f of files) {
        const buf = fs.readFileSync(path.join(ROOT, f));
        const bom = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
        const legal = Buffer.from(buf.toString('utf8'), 'utf8').equals(buf);
        if (bom || !legal) badEnc.push(f + (bom ? '(有 BOM)' : '(不是合法 UTF-8)'));

        const txt = buf.toString('utf8');
        const crlf = (txt.match(/\r\n/g) || []).length;
        const lf = (txt.match(/\n/g) || []).length;
        if (crlf && crlf !== lf) badEol.push(f + '(混用 LF/CRLF)');   // 全 LF 或全 CRLF 都行，混着不行
    }
    ok('所有源文件都是无 BOM 的合法 UTF-8（' + files.length + ' 个）', !badEnc.length, badEnc.join(', '));
    ok('行尾没有混用（LF / CRLF 各自统一）', !badEol.length, badEol.join(', '));
})();

/* ============================================================
   1. index.html
   ============================================================ */
section('[1] index.html');

(function tags() {
    const src = html.replace(/<!--[\s\S]*?-->/g, m => ' '.repeat(m.length));
    const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
    const stack = [], errors = [];
    const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
    let m;
    while ((m = re.exec(src))) {
        const t = m[2].toLowerCase();
        const line = src.slice(0, m.index).split('\n').length;
        if (m[1]) {
            if (!stack.length) { errors.push('第 ' + line + ' 行多余的 </' + t + '>'); continue; }
            const top = stack.pop();
            if (top.tag !== t) errors.push('第 ' + line + ' 行 </' + t + '> 与第 ' + top.line + ' 行 <' + top.tag + '> 不匹配');
        } else if (!VOID.has(t) && !m[4]) stack.push({ tag: t, line });
    }
    stack.forEach(s => errors.push('第 ' + s.line + ' 行 <' + s.tag + '> 没闭合'));
    ok('标签平衡', !errors.length, errors.join(' / '));
})();

(function ids() {
    const ids = new Set([...worksSrc.matchAll(/^\s*id:\s*'([^']+)'/gm)].map(x => x[1]));
    const used = [...html.matchAll(/data-work="([^"]+)"/g)].map(x => x[1]);
    const missing = [...new Set(used)].filter(u => !ids.has(u));
    ok('data-work 都能在 works.js 里找到（' + used.length + ' 处）', !missing.length, missing.join(', '));

    const items = [...worksSrc.matchAll(/items:\s*\[([^\]]*)\]/g)].flatMap(x => [...x[1].matchAll(/'([^']+)'/g)].map(y => y[1]));
    const bad = items.filter(i => !ids.has(i));
    ok('list.items 引用都有效', !bad.length, bad.join(', '));

    const files = [...new Set([
        ...[...worksSrc.matchAll(/^\s*(?:src|cover):\s*'([^']+)'/gm)].map(x => x[1]),
        ...[...worksSrc.matchAll(/\{\s*src:\s*'([^']+)'/g)].map(x => x[1]),
    ])].filter(f => !/xxx/.test(f));
    const nofile = files.filter(f => !fs.existsSync(path.join(ROOT, f)));
    ok('works.js 引用的素材都存在（' + files.length + ' 个）', !nofile.length, nofile.join(', '));
})();

(function skeleton() {
    const need = ['id="work-window"', 'win-scrim', 'data-win="close"', 'data-win="body"',
        'win-title', 'win-no', 'win-ext', 'win-badge', 'win-panel', 'win-bar'];
    const miss = need.filter(s => !html.includes(s));
    ok('浮窗骨架的关键 id/class 还在（手写的测试桩没漂移）', !miss.length, miss.join(', '));
    ok('works.js / floating-window.js 都在页面里',
        html.includes('data/works.js') && html.includes('js/floating-window.js'));
})();

/* ============================================================
   2. style.css
   ============================================================ */
section('[2] style.css');
const cssNC = css.replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length));

(function braces() {
    let depth = 0, line = 1; const bad = [];
    for (const ch of cssNC) {
        if (ch === '\n') line++;
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth < 0) { bad.push('第 ' + line + ' 行多了 }'); depth = 0; } }
    }
    if (depth) bad.push('结尾有 ' + depth + ' 个 { 没闭合');
    ok('括号平衡', !bad.length, bad.join(' / '));
})();
(function comments() {
    /* ★ 少写一个「星号 + 斜杠」的收尾，会把后面整段 CSS 吞进注释里 ——
       括号检查也会跟着失真。这轮就真的写丢过一次，所以单独立一条。 */
    const a = (css.match(/\/\*/g) || []).length, b = (css.match(/\*\//g) || []).length;
    ok('注释符成对（/* ' + a + ' 个 vs */ ' + b + ' 个）', a === b);
})();


(function vars() {
    const defined = new Set([...cssNC.matchAll(/(^|[;{\s])(--[\w-]+)\s*:/g)].map(m => m[2]));
    const jsAll = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'))
        .map(f => read('js/' + f)).join('\n');
    const injected = new Set([...(html + jsAll).matchAll(/--[\w-]+/g)].map(m => m[0]));
    const orphan = [];
    for (const m of cssNC.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) {
        if (defined.has(m[1]) || m[2] || injected.has(m[1])) continue;
        orphan.push(m[1]);
    }
    ok('var() 都有定义 / 兜底 / 由 JS 注入', !orphan.length, [...new Set(orphan)].join(', '));
})();

(function keyframes() {
    const defined = new Set([...cssNC.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]));
    const SKIP = new Set(['none', 'infinite', 'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'both',
        'forwards', 'backwards', 'paused', 'running', 'normal', 'reverse', 'alternate', 'initial', 'inherit',
        'step-end', 'step-start']);
    const used = new Set();
    for (const m of cssNC.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)[;}]/g)) {
        m[1].split(',').forEach(p => p.trim().split(/\s+/).forEach(tok => {
            if (/^[a-zA-Z_][\w-]*$/.test(tok) && !SKIP.has(tok)) used.add(tok);
        }));
    }
    const missing = [...used].filter(u => !defined.has(u));
    ok('animation 引用的 @keyframes 都存在（定义 ' + defined.size + ' 个）', !missing.length, '缺: ' + missing.join(', '));
})();

/* --- 垂直留白链：正文离视口顶 / 底各 10~15vh 这条规格是靠 4 个变量串起来的，
       以后谁改断了这里会立刻报出来 --- */
(function verticalChain() {
    const g = re => (cssNC.match(re) || [])[0];
    ok('--v-inset 有定义', !!g(/--v-inset:\s*clamp\(/));
    ok('.section/.hero 的纵向留白用 --v-inset', !!g(/\.section,\s*\.hero\s*\{[^}]*padding:\s*var\(--v-inset\)\s/));
    ok('--safe-b = 刻度尺 + --v-inset', !!g(/--safe-b:\s*calc\(var\(--ruler-h\)\s*\+\s*var\(--v-inset\)\)/));
    ok('navbar 顶线用 --v-inset（logo 与正文首行同线）', !!g(/padding:\s*calc\(var\(--v-inset\)\s*\+\s*var\(--nudge-logo\)\)/));
    ok('.section 顶对齐（flex-start，不是 center）', !!g(/\.section\s*\{[^}]*justify-content:\s*flex-start/));
    ok('.section .container 不再上下 auto 居中', !!g(/\.section\s*\.container\s*\{[^}]*margin:\s*0;/));
    /* .media-head 那两条是已知的死 CSS（HTML 里根本没有 .media-head），先排除掉 */
    ok('--gutter 不再参与纵向留白', !/padding:\s*var\(--gutter\)\s+var\(--gutter\)/.test(cssNC.replace(/\.media-head\s*\{[^}]*\}/g, '')));
    ok('技能页是纯散文（页面上没有 skill-list）', !html.includes('skill-list'));

    /* --- #skills 的滚动必须落在正文列上，不能落在 section 上（P25）--- */
    ok('#skills 自己没有 overflow（mosaic 的方块会污染滚动区）', !/#skills\s*\{[^}]*overflow/.test(cssNC));
    ok('#skills 的滚动交给正文列', /#skills\s+\.container\s*\{[^}]*overflow-y:\s*auto/.test(cssNC) && /#skills\s+\.container\s*\{[^}]*max-height:\s*100%/.test(cssNC));

    ok('主题切换有 VT 快路径 + 临时关过渡的保险',
        /startViewTransition/.test(read('js/theme-toggle.js')) && /html\.theme-vt \*/.test(cssNC));

    ok('开屏红幕只有 .splash-遮罩 一面（左收缩原样）',
        /\.splash-遮罩\s*\{[^}]*maskShrink/.test(cssNC) &&
        !/\.splash-遮罩\s*\{[^}]*display:\s*none/.test(cssNC));
    ok('开屏纯色层：z 在红幕与准星之间 + 进了停表名单 + 靠 mask-size 化开',
        /\.splash-化开\s*\{[^}]*z-index:\s*9997/.test(cssNC) &&
        /linear-gradient\(to bottom, #000 0%, #000 60%, transparent 100%\)/.test(cssNC) &&
        /html:not\(\.intro-armed\) \.splash-化开/.test(cssNC) &&
        /@keyframes splashIris\s*\{[\s\S]*?mask-size:\s*100% 0%, 100% 0%/.test(cssNC) &&
        /--t-iris-delay/.test(read('js/timeline.js')) &&
        /splash-化开[^"]*\.welcome-splash/.test(read('js/main.js')) &&
        /splash-化开[^"]*"\)\.forEach/.test(read('js/main.js')));
    ok('body 网点：点阵在背景 + 上下两条带（0~20 / 80~100）+ 无 composite',
        /background-image:\s*radial-gradient\([^;]*var\(--halftone-color\)/.test(cssNC) &&
        /#000 0%,\s*transparent 20%,\s*transparent 80%,\s*#000 100%/.test(cssNC) &&
        !/mask-composite/.test((cssNC.match(/body::after\s*\{[\s\S]*?\n\}/) || [''])[0]));
    ok('下划线元素必须排在脚本之前解析（否则 JS 静默 return）',
        html.indexOf('class="hero-underline"') < html.indexOf('js/home-underline.js') &&
        html.indexOf('class="hero-underline"') > 0);
    ok('制图框：四角刻线 + 标题栏（点线面 + 数字），位置全取布局令牌',
        /\.draft-frame\s*\{[^}]*top:\s*var\(--v-inset\)/.test(cssNC) &&
        /\.draft-frame\s*\{[^}]*left:\s*var\(--content-x\)/.test(cssNC) &&
        /writing-mode:\s*vertical-rl/.test(cssNC) &&
        /\.nav-container/.test(read('js/draft-layer.js')) &&
        /\.df-corner\s*\{/.test(cssNC) &&
        /\.df-bar\s*\{[^}]*align-self:\s*stretch/.test(cssNC) &&
        /\.nav-container\s*\{[^}]*height:\s*100%/.test(cssNC) &&   // 没有它 flex:1 撑不满
        /tabular-nums/.test(cssNC) &&
        /const ENABLED = true/.test(read('js/draft-layer.js')) &&
        /* ★ 这条原来写的是 /\.df-name::before\s*\{…/，被 `.draft-frame .df-name::before`
           骗过了（子串匹配）。行首锚定才认得出「选择器到底是不是 .df-name::before」。 */
        /(^|\n)\s*\.df-name::before\s*\{\s*animation:\s*none/.test(cssNC));
    /* ★ 制图框的两个"选择器写歪了"陷阱，单独立断言。
       .draft-frame 里只有四角刻线；.df-name / .df-bar 都在 .df-strip 里，
       而 .df-strip 是插进 .nav-container 的 —— 所以任何 `.draft-frame .df-…`
       都是**永不匹配的死选择器**。（P29 那颗闪点就是这么漏网的。） */
    ok('没有 `.draft-frame .df-…` 这种死选择器（那两个元素不在 .draft-frame 里）',
        !/\.draft-frame\s+\.df-[\w-]/.test(cssNC));
    ok('.df-strip 确实插在 .nav-container 里（上面那条断言的前提）',
        /querySelector\(['"]\.nav-container['"]\)/.test(read('js/draft-layer.js')) &&
        /navBox\s*\|\|\s*document\.body/.test(read('js/draft-layer.js')));
    /* ★ 推进点必须走 transform，不许写 style.bottom（布局属性）——
       否则它会比进度条的 scaleY 慢半拍，表现成"条在走、点不跟"。 */
    ok('推进点由 transform 驱动（不写 style.bottom）',
        /--df-p/.test(cssNC) &&
        /translateY\(calc\(-1 \* var\(--df-p/.test(cssNC) &&
        /dotEl\.style\.setProperty\(['"]--df-p['"]/.test(read('js/draft-layer.js')) &&
        !/dotEl\.style\.bottom/.test(read('js/draft-layer.js')));
    ok('推进点的盒子高度 = 整条轨道（top/bottom 都 0），可见方块画在 ::after',
        /\.df-bar\s+b\s*\{[^}]*top:\s*0[^}]*bottom:\s*0/.test(cssNC) &&
        /\.df-bar\s+b::after\s*\{/.test(cssNC));
    ok('media 面板红框：注入 + 左→上下一同→右（clamp 分段）+ 放慢 + 降动效隐藏',
        /\.panel-frame\s*\{/.test(cssNC) &&
        /scaleY\(clamp\(0, var\(--pf, 0\) \* 3, 1\)\)/.test(cssNC) &&
        /scaleX\(clamp\(0, \(var\(--pf, 0\) - 0\.3333\) \* 3, 1\)\)/.test(cssNC) &&
        /scaleY\(clamp\(0, \(var\(--pf, 0\) - 0\.6667\) \* 3, 1\)\)/.test(cssNC) &&
        /const SLOW = 1\.6/.test(read('js/home-underline.js')) &&
        /panel-frame/.test(read('js/home-underline.js')) &&
        /prefers-reduced-motion[\s\S]*?\.panel-frame\s*\{\s*display:\s*none/.test(cssNC));
    ok('#home 下划线：钉在导航栏边、右端被 media 容器钳住',
        /\.hero-underline\s*\{[^}]*left:\s*var\(--nav-width\)/.test(cssNC) &&
        /\.hero-underline\s*\{[^}]*width:\s*calc\(100vw - var\(--nav-width\)\)/.test(cssNC) &&
        /\.hero-underline\s*\{[^}]*transform:\s*scaleX\(var\(--hero-line/.test(cssNC) &&
        /mediaEdge/.test(read('js/home-underline.js')) &&
        /mediaArrive/.test(read('js/home-underline.js')) &&
        /prefers-reduced-motion[\s\S]*?\.hero-underline\s*\{\s*display:\s*none/.test(cssNC));
    ok('扫描带：外层套 profile、::before 两条带单向扫（mask-position）+ 降动效关掉',
        /\.halftone-scan\s*\{[^}]*mask-image/.test(cssNC) &&
        /\.halftone-scan::before\s*\{[\s\S]*?mask-position:\s*0 50%, 0 50%/.test(cssNC) &&
        /@keyframes halftoneScan\s*\{[\s\S]*?0 -50%, 0 150%/.test(cssNC) &&
        /--scan-h:\s*\S+/.test(cssNC) &&   // 值你手调过（20vh），只断言存在
        /prefers-reduced-motion[\s\S]*?\.halftone-scan::before\s*\{\s*animation:\s*none/.test(cssNC));
    ok('开屏网点层：在化开层之下 + 复用 splashIris + 颜色取 --text',
        /\.splash-网点\s*\{[^}]*z-index:\s*9996/.test(cssNC) &&
        /html:not\(\.intro-armed\) \.splash-网点/.test(cssNC) &&
        /radial-gradient\(\s*circle,\s*var\(--text\)/.test(cssNC) &&
        /animation:\s*splashIris var\(--t-dots-dur/.test(cssNC) &&
        /--t-dots-delay/.test(read('js/timeline.js')));
    /* P33：圆点搬去 js/crosshair.js 了 —— 断言跟着换文件。
       用 codeOnly() 比较：main.js 里那句"（.cursor-dot）也搬去 …"的**注释**
       本身就含这个词，不剥掉就会把这条断言骗成失败（第 5 次了）。
       所以这里比的是**代码形式**：querySelector('.cursor-dot')。 */
    ok('圆形指针只做位置跟随（没有缩放 / 动画机制抢 transform）',
        /translate\(\$\{cx\}px, \$\{cy\}px\)/.test(codeOnly(read('js/crosshair.js'))) &&
        !/CURTAIN|coverScale|scaleTo|dot\.animate/.test(codeOnly(read('js/crosshair.js'))) &&
        !/querySelector\(['"]\.cursor-dot['"]\)/.test(codeOnly(read('js/main.js'))));

    /* 这条只看结构 —— 具体倍率是你手调的，别拿断言绑死 */
    const zoomKf = (cssNC.match(/@keyframes body缩放\s*\{[\s\S]*?\n\}/) || [''])[0];
    ok('开屏缩放是多段关键帧 + 每段自带曲线 + 收在 scale(1)',
        (zoomKf.match(/%\s*\{/g) || []).length >= 3 &&
        (zoomKf.match(/animation-timing-function/g) || []).length >= 2 &&
        /100%\s*\{\s*transform:\s*scale\(1\)/.test(zoomKf));
    ok('圆形指针默认透明，解锁（intro-done）后 0.5s 显出来',
        /\.cursor-dot\s*\{[^}]*opacity:\s*0/.test(cssNC) &&
        /body\.intro-done\s+\.cursor-dot\s*\{\s*opacity:\s*1/.test(cssNC) &&
        /\.cursor-dot\s*\{[^}]*transition:\s*opacity\s+0\.5s/.test(cssNC));

    /* --- 每一节：高度锁死、宽度放开（P24）--- */
    const secBlock = (cssNC.match(/\.section,\s*\.hero\s*\{[^}]*\}/) || [''])[0];
    ok('高度三件套都写死 100dvh（谁也别想把它顶高）',
        /height:\s*100dvh/.test(secBlock) && /min-height:\s*100dvh/.test(secBlock) && /max-height:\s*100dvh/.test(secBlock));
    ok('宽度随内容长（max-content + 一屏的 min-width）',
        /width:\s*max-content/.test(secBlock) && /min-width:\s*calc\(100vw\s*-\s*var\(--nav-width\)\)/.test(secBlock));
    ok('不收缩也不放大（flex: 0 0 auto；写了 shrink 就会把节压窄）',
        /flex:\s*0\s+0\s+auto/.test(secBlock));
    /* ★ 文件里有 8 个 (max-width:768px) 查询（浮窗、前景粒子各有自己的），
       要挑出「那一条」——按里面有没有 .section, 来认 */
    const _mob = [...cssNC.matchAll(/@media\s*\(max-width:\s*768px\)/g)];
    const mobBlock = _mob.map(m => cssNC.slice(m.index, m.index + 2000)).find(s => /\.section,/.test(s)) || '';
    ok('移动端把「一屏一格」复位（否则内容被裁且滚不到）',
        /min-width:\s*0;/.test(mobBlock) && /max-height:\s*none;/.test(mobBlock) && /height:\s*auto;/.test(mobBlock));
})();

/* ============================================================
   2b. 字体子集化（P27）
   ------------------------------------------------------------
   这一组里最值钱的是「文案的字全在子集里」：子集的失效方式是**静默**的
   （字体缺字形 → 回退到系统字体，页面上不报错），所以必须由自检来喊。
   ============================================================ */
section('[2b] 字体子集化（P27）');
(function fontSubset() {
    const kb = n => (n / 1024).toFixed(1) + ' KB';
    const gs = require('./glyph-set.js');
    const woff2 = path.join(ROOT, 'assets/fonts/HuXiaoBo-subset.woff2');
    const manPath = path.join(ROOT, '_dev/glyph-manifest.json');

    const hasSub = fs.existsSync(woff2), hasMan = fs.existsSync(manPath);
    ok('子集字体在（' + 'assets/fonts/HuXiaoBo-subset.woff2' + '）', hasSub);
    ok('子集清单在（_dev/glyph-manifest.json）', hasMan);

    if (hasSub && hasMan) {
        const m = JSON.parse(fs.readFileSync(manPath, 'utf8'));
        const small = fs.statSync(woff2).size;
        const big = fs.statSync(path.join(ROOT, m.source)).size;
        ok('子集比原字体小两个数量级（' + kb(small) + ' vs ' + kb(big) + '）', small < big * 0.05);

        /* ★ 核心断言：源码里能渲染到的每个字，子集里都得有 */
        const { text } = gs.collect();
        const cps = [...new Set([...text].map(c => c.codePointAt(0)))];
        const absent = new Set(m.absent || []);
        const miss = cps.filter(cp => !absent.has(cp) && !gs.inRanges(cp, m.ranges));
        ok('页面文案的字全在子集里（' + cps.length + ' 个码位）', !miss.length,
            miss.length ? miss.map(c => String.fromCodePoint(c) + '(U+' + c.toString(16) + ')').join(' ') +
                '  → 跑 node _dev/subset-font.js' : '');

        /* 反向：别把注释里的字也塞进来（那会让子集白胖一圈） */
        ok('子集没把注释里的字也塞进来（' + m.glyphs + ' 个码位）', m.glyphs < 1200, '>' + m.glyphs);
        ok('清单里有"原字体本来就没有"的码位名单（不算漏裁）', Array.isArray(m.absent));

        /* ★ HuXiaoBo-Full 的 unicode-range 不能覆盖"原字体根本没有"的码位。
           页面上真有两个：↗(U+2197) 和 ✕(U+2715)（浮窗里的）。要是覆盖了，
           浏览器会为了这两个字把 3.2MB 下下来、发现还是没有、再回退系统字体 ——
           白下 3.2MB。所以兜底的范围必须避开它们。 */
        const fullFace = (cssNC.match(/@font-face\s*\{[^}]*font-family:\s*'HuXiaoBo-Full'[^}]*\}/) || [''])[0];
        const urText = (fullFace.match(/unicode-range\s*:\s*([^;]+);/) || [])[1] || '';
        const urRanges = [...urText.matchAll(/U\+([0-9a-fA-F]+)(?:-([0-9a-fA-F]+))?/g)]
            .map(x => [parseInt(x[1], 16), parseInt(x[2] || x[1], 16)]);
        ok('兜底字体写了 unicode-range（否则会为 3.2MB 拉下来一个没有的字形）', urRanges.length > 0);
        const leaked = (m.absent || []).filter(cp => urRanges.some(([a, b]) => cp >= a && cp <= b));
        ok('兜底的 unicode-range 没罩住"原字体根本没有"的字（' + (m.absent || []).length + ' 个要避开）',
            !leaked.length,
            leaked.map(c => String.fromCodePoint(c) + '(U+' + c.toString(16) + ')').join(' ') + ' 会白白拉 3.2MB');
        /* 也别矫枉过正：中文必须还在兜底范围内，否则"忘了重裁"就真缺字了 */
        const cjk = [0x4e00, 0x9fff, 0x3002, 0xff0c].filter(cp => !urRanges.some(([a, b]) => cp >= a && cp <= b));
        ok('兜底范围仍然罩得住中文（忘了重裁时不会真缺字）', !cjk.length);
    }

    /* 扫描器本身的回归测试：注释必须被剥掉，字符串/正则/模板串必须留下 */
    const sc1 = gs.jsStrings("/* 中文注释★ */ const a='正文甲'; // 尾注释乙\n");
    ok('js 扫描器：剥掉注释、留下字符串',
        sc1.includes('正文甲') && !sc1.includes('注释') && !sc1.includes('★') && !sc1.includes('乙'));
    const sc2 = gs.jsStrings('const re = /[\\u4e00-\\u9fa5]+/g; const b = "正文丙";');
    ok('js 扫描器：正则字面量不吞掉它后面的字符串', sc2.includes('正文丙'));
    const sc3 = gs.jsStrings("const u = 'https://例子.com/路径';");
    ok('js 扫描器：字符串里的 // 不会被当成注释', sc3.includes('例子.com/路径'));

    /* --- 接线：CSS / HTML 真的用上了子集 --- */
    ok('@font-face 的 HuXiaoBo 指向子集 woff2',
        /@font-face\s*\{[^}]*font-family:\s*'HuXiaoBo'[^}]*HuXiaoBo-subset\.woff2/.test(cssNC));
    ok('原字体留作 HuXiaoBo-Full 兜底（另起 family 名，否则子集永远轮不上）',
        /@font-face\s*\{[^}]*font-family:\s*'HuXiaoBo-Full'[^}]*HuXiaoBo\.otf/.test(cssNC) &&
        !/@font-face\s*\{[^}]*font-family:\s*'HuXiaoBo'[^}]*src:[^;]*HuXiaoBo\.otf/.test(cssNC));

    const stacks = [...cssNC.matchAll(/font-family:\s*"HuXiaoBo"[^;]*/g)].map(x => x[0]);
    ok('所有字体栈都在 HuXiaoBo 后面接了 HuXiaoBo-Full（' + stacks.length + ' 处）',
        stacks.length >= 3 && stacks.every(s => /"HuXiaoBo-Full"/.test(s)));

    /* ★ canvas 量字用的字体栈必须和渲染用的那条一致 —— 否则算出来的
       --welcome-fs / --tagline-fs / 拉伸倍数全是错的（而且看不出来）。 */
    ok('canvas 量字的字体栈和 CSS 那条一致（也带 HuXiaoBo-Full）',
        /measureCtx\.font\s*=\s*'400 100px "HuXiaoBo", "HuXiaoBo-Full", system-ui, sans-serif'/.test(read('js/welcome.js')));

    ok('preload 换成子集（否则又会把 3.2MB 拉下来，等于白裁）',
        /rel="preload"[^>]*HuXiaoBo-subset\.woff2/.test(html) &&
        !/rel="preload"[^>]*HuXiaoBo\.otf/.test(html));
    ok('不再 preload 已经没人用的 Crunch-Light（数字时钟 P26 已移除）',
        !/<link[^>]*preload[^>]*Crunch-Light/.test(html));
    /* ★ 这两条要看"代码"，不能看注释 —— 注释里正好就写着 Crunch-Light 这个名字，
       直接对源码 grep 会被自己的注释绊倒（我第一版就是这么挂的）。
       gs.jsStrings 只吐字符串字面量，天然把注释滤掉了。 */
    const tlStrings = gs.jsStrings(read('js/timeline.js'));
    ok('开屏闸门不再等一个全站没人用的字体', !/Crunch-Light/.test(tlStrings));

    const loaded = [...tlStrings.matchAll(/"([^"]+)"/g)].map(x => x[1]);
    const cssFamilies = new Set([...cssNC.matchAll(/font-family:\s*([^;]+);/g)]
        .flatMap(x => [...x[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map(y => y[1] || y[2])));
    const stray = loaded.filter(f => !cssFamilies.has(f));
    ok('闸门等的字体（' + loaded.join(', ') + '）都真的被 CSS 声明过', loaded.length > 0 && !stray.length, stray.join(', '));
})();

/* ============================================================
   2c. 降低动效：所有 infinite 动效都必须被真的关掉（P27）
   ------------------------------------------------------------
   P20 那条 `* { animation-duration: .01ms !important }` 对**有限次**动画是
   对的，但对 infinite 是反效果：0.01ms 的周期 + 无限循环 = 每一帧都落在
   周期里的随机位置 = 元素乱跳。所以这类必须单独 `animation: none`。
   人眼盯不出漏了哪条，所以这里交给自检全量扫一遍。
   ============================================================ */
section('[2c] 降低动效：infinite 动画全量核对（P27）');
(function reduceMotion() {
    /* 1. 先把所有 @media (prefers-reduced-motion: reduce) 块的花括号配对找出来 */
    const spans = [];
    const reMq = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/g;
    let mq;
    while ((mq = reMq.exec(cssNC))) {
        let depth = 0, j = mq.index + mq[0].length - 1;
        for (; j < cssNC.length; j++) {
            if (cssNC[j] === '{') depth++;
            else if (cssNC[j] === '}') { depth--; if (!depth) break; }
        }
        spans.push([mq.index, j]);
    }
    ok('找得到降低动效块（' + spans.length + ' 个）', spans.length >= 2);
    const insideReduce = i => spans.some(([a, b]) => i > a && i < b);

    /* 2. 块外所有带 infinite 的规则 → 收集选择器 */
    const RULE = /([^{}]+)\{([^{}]*)\}/g;
    const infinite = [];
    let r;
    while ((r = RULE.exec(cssNC))) {
        if (insideReduce(r.index)) continue;
        if (/\banimation\s*:[^;}]*\binfinite\b/.test(r[2])) {
            r[1].split(',').map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean).forEach(s => infinite.push(s));
        }
    }
    ok('扫到 infinite 动效使用点（' + infinite.length + ' 处）', infinite.length >= 5, infinite.join(' | '));

    /* 3. 块内写了 animation: none 的选择器 */
    const off = new Set();
    for (const [a, b] of spans) {
        const body = cssNC.slice(a, b);
        const R2 = /([^{}]+)\{([^{}]*)\}/g;
        let x;
        while ((x = R2.exec(body))) {
            if (!/animation\s*:\s*none/.test(x[2])) continue;
            x[1].split(',').map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean).forEach(s => off.add(s));
        }
    }

    /* ★ 覆盖判据必须是**同名**。
       我第一版写的是宽松版：`o === s || o.endsWith(s)`，想把
       「降低动效那条选择器是它的更具体版（多一层祖先选择器）」也算覆盖。
       结果 `\.draft-frame .df-name::before` 被当成了 `.df-name::before` 的覆盖 ——
       可那个元素根本不在 `.draft-frame` 里（.df-name 在 .df-strip 里，
       而 .df-strip 插在 .nav-container 下），那条规则**从来没有匹配过任何东西**，
       于是 dfBlink 在减少动效下一直以 0.01ms 周期频闪。
       宽松匹配默认了「祖先选择器一定命中」，而这件事**没法静态证明**。
       要求同名还顺带保证了两条规则同特异性（不会出现"降动效那条被基础规则压住"）。 */
    const covered = s => off.has(s);
    const uncovered = infinite.filter(s => !covered(s));
    ok('每一条 infinite 动效在降低动效下都被关掉（不会 0.01ms 乱跳）', !uncovered.length,
        uncovered.length ? '漏: ' + uncovered.join(' | ') : '');

    /* 4. P26 待办点名的四条，逐条点名（防止以后有人"顺手重构"掉） */
    const named = {
        navGlow: '.navbar::after',
        tileFloat: '.mosaic-tile.float',
        blobPulse_Wobble: '.blob',
        winLoading: '.win-loading-bar::after',
    };
    const stillOn = Object.entries(named).filter(([, sel]) => !covered(sel));
    ok('P26 待办点名的四条（navGlow / tileFloat / blobPulse / winLoading）都在名单里',
        !stillOn.length, stillOn.map(([k]) => k).join(', '));
})();

/* ============================================================
   2d. 准星收缩：任何"跳到终态"的路径都必须真的把它收细（P28）
   ------------------------------------------------------------
   症状：系统开「减小动效」时，准星不缩小 —— 它是一块盖住整页的实心色块。
   根因：准星**出生时是铺满视口的矩形**（100vw×100vh），"变细成十字"完全靠
        body.crosshair-active 那条 transform。而降低动效直接调 finishIntro()，
        那条路径只加了 crosshair-active-done（它只管把过渡时长设成 0s），
        从来没加过 crosshair-active → transform 一直是基础规则的 scaleY(1)。
   这一组断言钉住两件事：①机制别被改坏 ②两条路径都加了 -active。
   ============================================================ */
section('[2d] 准星收缩：跳到终态也必须收细（P28）');
(function crosshairShrink() {
    /* ★ P32：准星本体已经拆到 js/crosshair.js；
       "加 class 的那三条路径"仍然在 main.js 里（那是开屏状态机的事）。 */
    const jsMain = read('js/main.js');
    const jsCross = read('js/crosshair.js');

    /* ① 机制：出生是满屏 + 收缩由 crosshair-active 驱动 + -done 只管时长 */
    ok('准星出生时是铺满视口的一块（100vw×100vh）',
        /\.crosshair-h,\s*\.crosshair-v\s*\{[^}]*width:\s*100vw[^}]*height:\s*100vh/.test(cssNC));
    ok('收缩靠 body.crosshair-active 的 scaleY/scaleX（不是靠动画）',
        /body\.crosshair-active\s+\.crosshair-h\s*\{\s*transform:\s*scaleY\(var\(--crosshair-h-scale\)\)/.test(cssNC) &&
        /body\.crosshair-active\s+\.crosshair-v\s*\{\s*transform:\s*scaleX\(var\(--crosshair-v-scale\)\)/.test(cssNC));
    ok('crosshair-active-done 只负责把过渡时长归零（即"直接跳终态"）',
        /body\.crosshair-active-done\s+\.crosshair-h[\s\S]{0,120}--t-cross-dur:\s*0s/.test(cssNC));
    ok('那两个 scale 变量由 JS 注入（1/视口，保证物理 1px）',
        /--crosshair-h-scale[^;]*1\s*\/\s*vh/.test(jsCross) && /--crosshair-v-scale[^;]*1\s*\/\s*vw/.test(jsCross));

    /* ② 所有"跳到终态"的路径都得加 -active。
       最直接的三条：降低动效、跳过开屏、正常收尾。
       注意 "crosshair-active" 是 "crosshair-active-done" 的前缀，
       所以必须连引号一起比。 */
    const fi = (jsMain.match(/function finishIntro\([\s\S]*?\n\}/) || [''])[0];
    ok('找得到 finishIntro()（降低动效 / 等字体兜底 / 正常收尾都走它）', fi.length > 0);
    ok('finishIntro() 同时加 crosshair-active（★ 漏了它就是"准星不缩小"）',
        fi.includes('"crosshair-active"'), '只加了 -done');
    ok('finishIntro() 也加 crosshair-active-done（否则要等 1.2s 过渡）',
        fi.includes('"crosshair-active-done"'));

    /* ③ 更一般的不变式：加 -done 的次数不能多于加 -active 的次数 ——
          每一次"收尾"都必须有一次"收细"跟它配对。 */
    const nActive = (jsMain.match(/"crosshair-active"/g) || []).length;
    const nDone = (jsMain.match(/"crosshair-active-done"/g) || []).length;
    ok('加 -active 的次数 ≥ 加 -done 的次数（' + nActive + ' vs ' + nDone + '）',
        nActive >= nDone, '有 ' + (nDone - nActive) + ' 条收尾路径没先把准星收细');

    /* ④ 降低动效那条路径确实走的是 finishIntro()，不是自己另写一套 */
    ok('降低动效分支走 finishIntro()（不是自己拼 class 列表）',
        /if\s*\(\s*REDUCE_MOTION\s*\)\s*\{[\s\S]{0,200}?finishIntro\(/.test(jsMain));
})();

/* ============================================================
   2e. P30 关掉的三件装饰：关掉可以，但**不许留残影**
   ------------------------------------------------------------
   关掉一个装饰的难点从来不是"少画一样东西"，而是"别留下半截"。
   这一组盯的就是那半截 —— 尤其是 `.hero-underline`：
   它是 HTML 里的静态元素，JS 一停就没人写 `--hero-line`，
   如果 CSS 那条 `scaleX(var(--hero-line))` 没写兜底，
   整条声明会在计算时非法、transform 回落到初始值 `none`，
   那条线就会**以满宽露出来** —— 比不关还显眼。
   ============================================================ */
section('[2e] P30 关掉的三件装饰：不许留残影');
(function disabledDecorations() {
    /* ① body 的噪点层（feTurbulence 颗粒）。
       ★ 注意术语：这个项目里 "噪点" = body::before，"网点" = body::after，
         是两个不同的层（见 style.css:473 的注释）。别关错。 */
    const before = (cssNC.match(/body::before\s*\{[^}]*\}/) || [''])[0];
    ok('body::before（噪点层）已关掉（display: none）', /display:\s*none/.test(before));
    ok('网点层 body::after 仍然保留（噪点 ≠ 网点，别连带关掉）',
        /body::after\s*\{[^}]*radial-gradient/.test(cssNC) &&
        /\.halftone-scan\s*\{/.test(cssNC));
    ok('噪点层只是关了、没有删（几何 / data URI 的转义都是踩坑换来的）',
        /body::before\s*\{[^}]*feTurbulence/.test(cssNC) && /body::before\s*\{[^}]*position:\s*fixed/.test(cssNC));

    /* ② 标题下划线 + ③ media 红框：都在 home-underline.js，共用一个开关 */
    const hu = read('js/home-underline.js');
    const m = /const ENABLED = (true|false);/.exec(hu);
    ok('home-underline.js 有 ENABLED 开关（当前 ' + (m ? m[1] : '缺失') + '，和 draft-layer / 浮窗一个套路）',
        !!m);

    /* ★★ 这条是这一组里最要紧的：兜底 0 不能丢 */
    ok('★ .hero-underline 的 transform 有 0 兜底（否则开关一关，线会以满宽露出来）',
        /\.hero-underline\s*\{[^}]*transform:\s*scaleX\(var\(--hero-line,\s*0\)\)/.test(cssNC));

    ok('.panel-frame 由 JS 注入（不注册就没有元素，天然不留残影）',
        /createElement\(['"]span['"]\)/.test(hu) && /className = ['"]panel-frame['"]/.test(hu));
})();

/* ============================================================
   2f. 准星四条线 + 一三角配一线（P31）
   ============================================================ */
section('[2f] 准星四条线 + 一三角配一线（P31）');
(function fourLineCrosshair() {
    const jsCross = read('js/crosshair.js');
    /* ★ 过 codeOnly()：这一组里有几条是"**不该**包含某个词"的断言，
       而我在 rulers.js 的注释里正好写了 crosshair-snap / MERGED 这些词 ——
       不剥注释就会把断言骗反（这个坑的第 6 次，见文件开头的说明）。 */
    const jsRulers = codeOnly(read('js/rulers.js'));

    /* 数 class 出现次数。crosshair-h 是 crosshair-hover 的前缀，
       所以必须带 \b，否则会把 crosshair-hover 也算进去。 */
    const count = (src, cls) =>
        (src.match(new RegExp('class="[^"]*\\b' + cls + '\\b[^"]*"', 'g')) || []).length;
    const nH = count(html, 'crosshair-h'), nV = count(html, 'crosshair-v');
    const nMX = count(html, 'ruler-marker-x'), nMY = count(html, 'ruler-marker-y');

    ok('index.html 里是 2 条水平 + 2 条垂直（' + nH + ' + ' + nV + '）', nH === 2 && nV === 2);
    ok('index.html 里是 2 个底尺三角 + 2 个左尺三角（' + nMX + ' + ' + nMY + '）',
        nMX === 2 && nMY === 2);

    /* ★ 和 P26 那条同源的坑：这些元素都是脚本里 querySelector 直接拿的，
       放到脚本之后就会拿到 null → 模块静默 return → 什么都不发生。
       ★ 锚 src="…" 而不是文件名 —— 注释里也会出现文件名（见 [2g] 的说明）。 */
    ok('四个准星元素都排在脚本之前解析',
        html.indexOf('class="crosshair-h"') > 0 &&
        html.lastIndexOf('class="crosshair-v"') < html.indexOf('src="js/crosshair.js"'));
    ok('四个三角也都排在脚本之前解析',
        html.lastIndexOf('class="ruler-marker-y"') < html.indexOf('src="js/rulers.js"'));

    /* 数量守卫：少一条就整套不启用，免得只剩一半的线在跑 */
    ok('main.js 有"不是整整两条就不启用"的守卫',
        /hs\.length\s*!==\s*2\s*\|\|\s*vs\.length\s*!==\s*2/.test(jsCross));
    ok('rulers.js 有"不是整整两个就不启用"的守卫',
        /xs\.length\s*!==\s*2\s*\|\|\s*ys\.length\s*!==\s*2/.test(jsRulers));

    /* 吸边目标：只认大块；变色保持原来的宽选择器（行为不变） */
    ok('吸边只认大块（.card / .media-panel / .btn）',
        /const SNAP_SEL\s*=\s*"\.card, \.media-panel, \.btn"/.test(jsCross) &&
        /closest\(SNAP_SEL\)/.test(jsCross));
    ok('变色仍用原来那套宽选择器（导航链接也变色），且提成了常量',
        /const HOVER_SEL = "a, button, \.btn, \.card, \[role='button'\]";/.test(jsCross) &&
        /closest\(HOVER_SEL\)/.test(jsCross));

    /* 开屏两角：一对左上、一对右下（P34 把第二对从左下改成了右下） */
    ok('开屏收缩：一对落左上角、一对落右下角（每条线收到自己那一侧的边）',
        /x1 = tx1 = 0;/.test(jsCross) && /y1 = ty1 = 0;/.test(jsCross) &&
        /x2 = tx2 = window\.innerWidth;/.test(jsCross) &&
        /y2 = ty2 = window\.innerHeight;/.test(jsCross));
    ok('降低动效那条路径被排除在"两角收缩"之外（active && !done）',
        /if \(!active \|\| done\) return;/.test(jsCross));

    /* 四个位置一起缓动；少一条没到位就不收工 */
    ok('四个位置共用同一个 EASE 缓动',
        /const EASE = 0\.10/.test(jsCross) &&
        /x1 \+= \(tx1 - x1\) \* k/.test(jsCross) && /y2 \+= \(ty2 - y2\) \* k/.test(jsCross));
    ok('四条都到位才停 rAF（取四条里最远的那条判断）',
        /const far = Math\.max\([\s\S]{0,140}?Math\.abs\(ty2 - y2\)\);/.test(jsCross) &&
        /if \(far < 0\.1\)/.test(jsCross));

    /* 订阅接口：四个位置；旧接口向后兼容 */
    ok('onCrosshair 推送四个位置（x1, x2, y1, y2）',
        /fn\(x1, x2, y1, y2\)/.test(jsCross) && /window\.onCrosshair\(place\)/.test(jsRulers));
    ok('window.crosshairPos 仍有 x / y（外面只读引用不会断）',
        /window\.crosshairPos\.x = x1/.test(jsCross) && /window\.crosshairPos\.y = y1/.test(jsCross));

    /* ★ 零布局读取：吸边目标靠 scrollX 差值算，不在每帧路径里重读布局。
       ★ 比对前必须**先剥注释** —— 我第一版就是被自己那句
         "不每帧重读 getBoundingClientRect" 的注释绊倒的（P27 同款坑）。
       ★ P35：targetFromSnap 现在带一个 dx 参数，正则跟着放宽。 */
    const tfsRaw = (jsCross.match(/function targetFromSnap\([^)]*\)\s*\{[\s\S]*?\n    \}/) || [''])[0];
    const tfs = tfsRaw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    ok('找得到 targetFromSnap()', tfsRaw.length > 0);
    ok('吸边目标不每帧重读布局（targetFromSnap 的**代码**里没有 getBoundingClientRect）',
        tfsRaw.length > 0 && !/getBoundingClientRect/.test(tfs) && /snapRect\.left - dx/.test(tfs));

    /* 三角模块：四条通道各自记上次值，不动就不碰 DOM */
    ok('三角按出现顺序取（第 1 个跟 1 号）',
        /querySelectorAll\('\.ruler-marker-x'\)/.test(jsRulers) &&
        /querySelectorAll\('\.ruler-marker-y'\)/.test(jsRulers));
    ok('三角位置没变时不碰 DOM（每条通道各自记 last）',
        /if \(v === c\.last\) continue;/.test(jsRulers));

    /* ---- 四个直角三角形：形状由"哪条有色边 + 哪条相邻透明边"唯一决定 ----
       左线向左上、右线向右上、上线向上右、下线向下右。
       外接框尺寸保持改之前的值（底尺 4×8，左尺 8×4）。 */
    const shape = (sel) => (cssNC.match(
        new RegExp('\\.ruler-marker-[xy]\\[data-cross="' + sel + '"\\]\\s*\\{[^}]*\\}')) || [''])[0];
    const hasBorder = (sel, decl) => new RegExp(decl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(shape(sel));

    ok('.ruler-marker-x[data-cross="x1"] = 向左上（透明左边 4 + 有色底边 8）',
        hasBorder('x1', 'border-left: 4px solid transparent') &&
        hasBorder('x1', 'border-bottom: 8px solid var(--accent)'));
    ok('.ruler-marker-x[data-cross="x2"] = 向右上（透明右边 4 + 有色底边 8）',
        hasBorder('x2', 'border-right: 4px solid transparent') &&
        hasBorder('x2', 'border-bottom: 8px solid var(--accent)'));
    ok('.ruler-marker-y[data-cross="y1"] = 向上右（透明上边 4 + 有色左边 8）',
        hasBorder('y1', 'border-top: 4px solid transparent') &&
        hasBorder('y1', 'border-left: 8px solid var(--accent)'));
    ok('.ruler-marker-y[data-cross="y2"] = 向下右（透明下边 4 + 有色左边 8）',
        hasBorder('y2', 'border-bottom: 4px solid transparent') &&
        hasBorder('y2', 'border-left: 8px solid var(--accent)'));
    ok('四个形状规则都先 border: 0 清干净（三角形最容易被残留 border 搞坏）',
        ['x1', 'x2', 'y1', 'y2'].every((s) => /border:\s*0;/.test(shape(s))));
    ok('等腰三角那套（两条 2px 透明边）已经全部去掉',
        !/border-(left|right|top|bottom):\s*2px solid transparent/.test(cssNC));
    /* ★ P49：三角的 z-index 只声明一次（改回 9998 时留下的守卫，
       防"又在别处加一条覆盖回去"）。 */
    ok('三角的 z-index 只声明一次（避免两处打架、后一处悄悄覆盖）',
        (cssNC.match(/\.ruler-marker-[xy][^{]*\{[^}]*z-index:/g) || []).length === 1);

    /* ---- 读数：同轴两个三角共用一个，不再挂在三角身上 ---- */
    const nRead = count(html, 'ruler-read-x') + count(html, 'ruler-read-y');
    ok('只有两个读数元素（一把尺子一个，不是每个三角一个）（' + nRead + '）', nRead === 2);
    ok('三角身上的 ::after 读数已经去掉（改由独立元素承担）',
        !/\.ruler-marker-[xy]::after/.test(cssNC));
    ok('读数元素有共用样式（等宽 9px + accent + 不吃鼠标）',
        /\.ruler-read\s*\{[^}]*font:\s*9px ui-monospace/.test(cssNC) &&
        /\.ruler-read\s*\{[^}]*color:\s*var\(--accent\)/.test(cssNC) &&
        /\.ruler-read\s*\{[^}]*pointer-events:\s*none/.test(cssNC));
    ok('读数让开尺子厚度（用 --ruler-h / --ruler-w，不是硬编码）',
        /\.ruler-read-x\s*\{[^}]*bottom:\s*calc\(var\(--ruler-h\)/.test(cssNC) &&
        /\.ruler-read-y\s*\{[^}]*left:\s*calc\(var\(--ruler-w\)/.test(cssNC));
    ok('移动端把读数和条带一起隐藏',
        (function () {
            /* ★ 这条选择器列表会随功能增删（P32 就新并进了 .ruler-band）。
               所以按"块内容"判断，别写死成 `.ruler-read {` —— 上一次就是
               它被并进列表之后挂掉的。 */
            const blk = (cssNC.match(/@media \(max-width: 768px\)\s*\{[\s\S]*?\n\}/g) || [])
                .find((b) => /\.ruler-read/.test(b)) || '';
            return /\.ruler-read/.test(blk) && /\.ruler-band/.test(blk) && /display:\s*none/.test(blk);
        })());

    /* ---- 对齐：三角形那条"腿"必须正好落在线的坐标上 ---- */
    ok('x1 / y1 用 -100% 对齐（腿在盒子末端），x2 / y2 不偏移',
        /anchor:\s*'end'/.test(jsRulers) && /anchor:\s*'start'/.test(jsRulers) &&
        /translate\$\{A\}\(-100%\)/.test(jsRulers));
    ok('读数位置取两个三角的中点',
        /const midX = \(x1 \+ x2\) \/ 2;/.test(jsRulers) &&
        /const midY = \(y1 \+ y2\) \/ 2;/.test(jsRulers));
    ok('★ 读数内容由**测量状态**决定：在读跨度时取间隔、其余立刻取中点坐标',
        /const measuring = document\.body\.classList\.contains\("crosshair-measuring"\)/.test(jsRulers) &&
        /measuring \? String\(Math\.round\(gapX\)\) : String\(Math\.round\(midX\)\)/.test(jsRulers) &&
        /measuring \? String\(Math\.round\(gapY\)\) : String\(Math\.round\(midY\)\)/.test(jsRulers));
    /* ★ P38：原来靠"两条线有没有合拢"来判断该显示什么，于是脱开吸附后
       那段动画里还在显示一个正在缩小的间隔。现在判据换成吸附状态，
       一松手就是坐标。所以那个 MERGED 阈值不该再留着（留着说明没改干净）。 */
    ok('不再用"等合拢"那套判据（MERGED 阈值已删）', !/MERGED/.test(jsRulers));
    ok('读数只看"在读跨度没有"这一个事实（js 里读这个类的地方只有那一处）',
        (jsRulers.match(/crosshair-measuring/g) || []).length === 1);
    ok('读数只在文字真的变了时才写（textContent 会触发重排）',
        /if \(txtX !== lastTxtX\)/.test(jsRulers) && /if \(txtY !== lastTxtY\)/.test(jsRulers));
    ok('不再往 dataset 写读数（伪元素那套已经拆了）',
        !/dataset\.(x|y)\s*=/.test(jsRulers));
})();

/* ============================================================
   2g. 准星拆成独立文件 + 展开时的红带（P32）
   ============================================================ */
section('[2g] 准星拆成 js/crosshair.js + 展开条带（P32）');
(function crosshairFileAndBand() {
    const jsCross = read('js/crosshair.js');
    const jsMain = read('js/main.js');
    const jsRulers = read('js/rulers.js');

    /* ★★ 找脚本位置必须锚 `src="…"`，不能只搜文件名。
       这一轮又栽在同一个坑上：我新加的注释里写着"宽度/位置由 js/rulers.js 写
       transform"，于是 indexOf('js/rulers.js') 命中的是**注释**而不是 <script>，
       排在真正的 script 标签前面 —— 断言直接判反。
       （同类问题第 4 次了：注释里出现被断言的那个词。） */
    const scriptAt = (f) => html.indexOf('src="' + f + '"');
    const count = (src, cls) =>
        (src.match(new RegExp('class="[^"]*\\b' + cls + '\\b[^"]*"', 'g')) || []).length;

    /* ---------- 拆文件 ---------- */
    ok('js/crosshair.js 存在且不为空', jsCross.length > 2000);
    ok('main.js 里已经不含准星本体（onCrosshair / SNAP_SEL / targetFromSnap 都搬走了）',
        !/window\.onCrosshair\s*=/.test(jsMain) && !/SNAP_SEL/.test(jsMain) &&
        !/function targetFromSnap/.test(jsMain));
    ok('但 main.js 仍然负责开屏那三个 class（拆文件不能把状态机也搬走）',
        /"crosshair-active"/.test(jsMain) && /"crosshair-active-done"/.test(jsMain) &&
        /"crosshair-fast"/.test(jsMain));
    ok('crosshairPos 的初始化也跟着搬到了 crosshair.js',
        /window\.crosshairPos\s*=/.test(jsCross) && !/window\.crosshairPos\s*=/.test(jsMain));
    /* ★ 脚本顺序：rulers.js 在加载时就会调 window.onCrosshair(...)，
       crosshair.js 必须排在它前面，否则订阅拿到 undefined → 静默退回轮询。 */
    const iCross = scriptAt('js/crosshair.js');
    const iRulers = scriptAt('js/rulers.js');
    ok('crosshair.js 排在 rulers.js 之前（否则订阅会落空）',
        iCross > 0 && iRulers > 0 && iCross < iRulers);
    ok('crosshair.js 排在 main.js 之后',
        scriptAt('js/main.js') > 0 && scriptAt('js/main.js') < iCross);

    /* ---------- 红带 ---------- */
    const nBand = count(html, 'ruler-band-x') + count(html, 'ruler-band-y');
    ok('两个条带元素（一条尺子一个）（' + nBand + '）', nBand === 2);
    ok('条带默认不可见（合并时一个像素都不占）',
        /\.ruler-band\s*\{[^}]*opacity:\s*0/.test(cssNC));
    ok('条带是半透明红，浓度走 --band-alpha 这个 token',
        /\.ruler-band\s*\{[^}]*rgba\(225,\s*25,\s*25,\s*var\(--band-alpha/.test(cssNC));
    ok('★ transform-origin 钉在左 / 上（否则会从中间两头长，不像"拉出来"）',
        /\.ruler-band-x\s*\{[^}]*transform-origin:\s*left/.test(cssNC) &&
        /\.ruler-band-y\s*\{[^}]*transform-origin:\s*center top/.test(cssNC));
    ok('条带比尺子厚（--band-h 16 > --ruler-h 8，"让开"才看得出来）',
        /--band-h:\s*16px/.test(cssNC) && /--ruler-h:\s*8px/.test(cssNC));
    ok('body.crosshair-measuring 才把条带显出来',
        /body\.crosshair-measuring \.ruler-band\s*\{\s*opacity:\s*1/.test(cssNC));
    ok('rulers.js 用 translate + scale 写条带（不是 left/width，不触发布局）',
        /scaleX\(\$\{\(Math\.max\(0, x2 - x1\) \/ vw\)/.test(jsRulers) &&
        /scaleY\(\$\{\(Math\.max\(0, y2 - y1\) \/ vh\)/.test(jsRulers));
    ok('条带 transform 没变时不重写',
        /if \(tx !== lastBandX\)/.test(jsRulers) && /if \(ty !== lastBandY\)/.test(jsRulers));

    /* ---------- 读数：让开 + 变色 ---------- */
    ok('在读跨度时读数让开条带（底尺往上升、左尺往右让，位移走 --read-lift）',
        /body\.crosshair-measuring \.ruler-read-x\s*\{[^}]*bottom:\s*calc\([\s\S]{0,60}?--read-lift/.test(cssNC) &&
        /body\.crosshair-measuring \.ruler-read-y\s*\{[^}]*left:\s*calc\([\s\S]{0,60}?--read-lift/.test(cssNC));
    ok('在读跨度时读数逐渐变色（过渡 color，到 --text 高对比）',
        /body\.crosshair-measuring \.ruler-read\s*\{\s*color:\s*var\(--text\)/.test(cssNC) &&
        /\.ruler-read\s*\{[^}]*transition:[\s\S]{0,140}?color 0\.35s/.test(cssNC));

    /* ---------- 挂 class 的地方只能有一处 ---------- */
    /* ★ 比"带引号"的形式：注释里也写着这个类名，
       直接数裸词会被自己的注释骗到（这个坑出现过好几次）。
       ★ P40：挂/摘收敛到 syncMeasuring() —— 它同时服务"吸住元素"和"拖框"
         两个状态，两边共用一套表现，所以只能有一个开关。 */
    ok('★ crosshair-measuring 只在 syncMeasuring() 里挂/摘（唯一有出口）',
        (jsCross.match(/"crosshair-measuring"/g) || []).length === 1 &&
        /function syncMeasuring\(\)\s*\{[\s\S]{0,160}?classList\.toggle\("crosshair-measuring"/.test(jsCross));
    ok('setSnap 和拖框都通过 syncMeasuring 同步那些类（不各写一半）',
        /snapEl = el;\s*\n\s*syncMeasuring\(\);/.test(jsCross) &&
        /function beginDrag\(\)[\s\S]{0,400}?syncMeasuring\(\);/.test(jsCross));
    ok('开屏收缩时也走 setSnap(null)，把条带一起收掉',
        /setSnap\(null\);/.test(jsCross));
})();

/* ============================================================
   2h. 圆形指针并入 crosshair.js + 吸附期快系数（P33 / P34）
   ============================================================ */
section('[2h] 圆点并入 crosshair.js + 吸附期快系数（P33/P34）');
(function dotAndSnapEase() {
    /* ★ 全部走 codeOnly()：main.js 里那句"（.cursor-dot）也搬去…"的注释
       本身就含这个词（第 5 次踩这个坑，见文件开头的说明）。 */
    const jsCross = codeOnly(read('js/crosshair.js'));
    const jsMain = codeOnly(read('js/main.js'));

    /* ---------- 圆点搬过来了，而且只搬了一份 ---------- */
    ok('圆形指针的模块现在在 crosshair.js 里',
        /querySelector\(['"]\.cursor-dot['"]\)/.test(jsCross) &&
        /translate\(\$\{cx\}px, \$\{cy\}px\)/.test(jsCross));
    ok('main.js 里已经没有了（防止两边各留一份）',
        !/querySelector\(['"]\.cursor-dot['"]\)/.test(jsMain));
    ok('圆点仍然只写 transform（不抢 opacity / scale）',
        /dot\.style\.transform = `translate\(/.test(jsCross));
    ok('圆点仍然挂在 World.onFrame 上、没自己开 rAF',
        (function () {
            const i = jsCross.indexOf('function cursorDot()');
            if (i < 0) return false;
            const body = jsCross.slice(i, i + 2000);
            return /World\.onFrame\(/.test(body) && !/requestAnimationFrame/.test(body);
        })());
    ok('圆点自己的跟随系数（0.8，几乎实时）跟准星那套是分开的',
        /Math\.pow\(1 - 0\.8, dt\)/.test(jsCross));

    /* ---------- 吸附期间：换成写死的快系数 ---------- */
    /* ★ P34 起 EASE_SNAP 是一个**直接写死的字面量**（不再是 EASE×2）。
       所以这里解析两个独立的数字，而不是解析倍率。 */
    const mEase = /const EASE = ([\d.]+);/.exec(jsCross);
    const mSnap = /const EASE_SNAP = ([\d.]+);/.exec(jsCross);
    const easeV = mEase ? parseFloat(mEase[1]) : NaN;
    const snapV = mSnap ? parseFloat(mSnap[1]) : NaN;

    ok('EASE_SNAP 是直接写死的数（' + snapV + '），不再是 EASE×N',
        !!mSnap && !/EASE_SNAP = EASE/.test(jsCross));
    ok('吸附期的系数明确比平时快（' + easeV + ' → ' + snapV + '）',
        Number.isFinite(easeV) && Number.isFinite(snapV) && snapV > easeV);
    /* ★★ P41：拖框保留**一点点**缓动（EASE_DRAG）。
       为什么不能"零缓动"：平时跟鼠标是 EASE = 0.10，四条线一直拖着光标一截；
       拖框一开始如果直接精确落位，那一下就是把拖尾一次性补上 —— 看起来是"跳"。
       真正需要零延迟的是**锁死之后**（元素自己会动），拖框是手在动。
       ★ 这里只断言**不变式**（比平时跟手、但不是零缓动），不钉具体数值 ——
         P34 的教训：断言只能编码"会坏掉"的边界，不能编码"我觉得好看"的数。 */
    ok('step() 里三档系数：拖框 / 吸附 / 平时',
        /const ease = dragging \? EASE_DRAG : \(snapEl \? EASE_SNAP : EASE\);/.test(jsCross) &&
        !/locked \? 1/.test(jsCross));
    const dragV = parseFloat((/const EASE_DRAG = ([\d.]+);/.exec(jsCross) || [])[1]);
    ok('★ EASE_DRAG = ' + dragV + '：比平时跟手，但**不是**零缓动（0.10 < v < 1）',
        Number.isFinite(dragV) && dragV > 0.10 && dragV < 1);
    const lockV = parseFloat((/const LOCK_EPS = ([\d.]+);/.exec(jsCross) || [])[1]);
    ok('★ LOCK_EPS = ' + lockV + 'px：要是合理的小距离（0 < v <= 50，' +
        '太大会看出"落位"、0 则永远锁不上）',
        Number.isFinite(lockV) && lockV > 0 && lockV <= 50);
    ok('★ 距离 < LOCK_EPS 就认作"完全吸住"并锁死',
        /if \(snapEl && far < LOCK_EPS\) \{\s*\n\s*locked = true;/.test(jsCross));
    ok('★ 锁死那一刻走 snapToTargets()（精确落位，没有插值）',
        /locked = true;\s*\n\s*snapToTargets\(\);\s*\n\s*rafId = null;/.test(jsCross));
    ok('★ snapToTargets 就是直接赋值 + apply（没有任何系数 / 数学）',
        /function snapToTargets\(\)\s*\{[\s\S]{0,300}?x1 = tx1; x2 = tx2; y1 = ty1; y2 = ty2;\s*\n\s*apply\(\);/.test(jsCross) &&
        /function snapToTargets\(\)[\s\S]{0,200}?if \(x1 === tx1 && x2 === tx2 && y1 === ty1 && y2 === ty2\) return;/.test(jsCross));
    ok('★ 目标变化的唯一出口是 settle()（只有完全吸住才落位，其余走缓动）',
        /function settle\(\)\s*\{\s*\n\s*if \(locked\) \{ snapToTargets\(\); return; \}\s*\n\s*wake\(\);/.test(jsCross));
    ok('★ 换元素 / 松手时在 setSnap() 里解锁（对应"直到离开该元素"）',
        /function setSnap\(el\)[\s\S]{0,600}?locked = false;/.test(jsCross));
    ok('locked 初始为 false', /let locked = false;/.test(jsCross));
    ok('k 用的是选出来的那个 ease（不是写死 EASE）',
        /const k = 1 - Math\.pow\(1 - ease, dt\);/.test(jsCross) &&
        !/Math\.pow\(1 - EASE, dt\)/.test(jsCross));

    /* ★ 这是这一组最要紧的一条：缓动系数 >= 1 每帧都会过冲，会震荡。
       这是**数学事实**，不是偏好，所以要挡。
       ★★ 但**不要**在这里限制具体取值（上一版我加过"必须落在 0.6~0.9"，
       结果它挡住了你自己调参 —— 断言只能编码"会坏掉"的边界，
       不能编码"我觉得好看"的区间）。 */
    ok('★ 两个系数都必须 < 1（≥1 每帧过冲 → 震荡）：平时 ' + easeV + ' / 吸附期 ' + snapV,
        Number.isFinite(easeV) && Number.isFinite(snapV) && easeV > 0 && snapV > 0 &&
        easeV < 1 && snapV < 1);
})();

/* ============================================================
   2i. 悬停 / 吸边状态不能变陈（P35）
   ------------------------------------------------------------
   症状：鼠标移到可交互对象上 → 触发吸边；然后**不动鼠标、只滚滚轮**，
        对象已经滚走了，四条线还吸在它身上跟着滑出去，
        `crosshair-hover` 也还挂着。
   根因：`mouseover` **只在鼠标移动到新元素上时触发**。页面在光标底下
        滚过去时浏览器不会补发 —— 所以"底下换人了"这件事没人知道。
   修法：除了 mouseover，在"鼠标没动但底下可能换了"的时机
        （滚动 / 布局变化）主动补一次 `document.elementFromPoint(mx,my)`。
   ============================================================ */
section('[2i] 悬停状态不能变陈：滚动时补命中测试（P35）');
(function hoverStaleness() {
    const jsCross = codeOnly(read('js/crosshair.js'));

    ok('悬停判定收敛成一个 applyHover()（变色 + 吸边一起改）',
        /function applyHover\(t\)\s*\{[\s\S]{0,220}?classList\.toggle\("crosshair-hover"[\s\S]{0,120}?setSnap\(/.test(jsCross));
    /* ★ 它必须被**两条**路都调用：鼠标动了 + 鼠标没动但底下变了 */
    ok('★ applyHover() 被 mouseover 和"滚动重判"两处都调用',
        (jsCross.match(/applyHover\(/g) || []).length >= 3);   // 1 定义 + 2 调用

    ok('★ 滚动时重新做命中测试（这是"变陈"的根治）',
        /document\.addEventListener\("scroll",[\s\S]{0,900}?recheckUnderCursor\(\)/.test(jsCross) &&
        /document\.elementFromPoint\(mx, my\)/.test(jsCross));
    /* ★★ P39 零延迟的关键：锁死时在 scroll 事件里**同步**更新，
       不能等 rAF —— scroll 在同一帧里排在 rAF 之前，当场写 transform-origin
       才能和内容同帧提交。等 rAF 就是"内容先滚走、准星下一帧才追上"。 */
    ok('★★ 锁死时在 scroll 事件里同步落位（零延迟的根，别改成 rAF）',
        /document\.addEventListener\("scroll", \(\) => \{[\s\S]{0,600}?if \(locked && snapEl\) \{\s*\n\s*targetFromSnap\(liveScrollX\(\) - snapScrollX\);\s*\n\s*snapToTargets\(\);/.test(jsCross));
    ok('滚动监听用 capture 阶段（这样 #skills 那种嵌套滚动容器也收得到）',
        /\{ passive: true, capture: true \}/.test(jsCross));
    ok('滚动重判每帧最多一次（滚动事件比帧密）',
        /if \(!pointerSeen \|\| recheckRaf !== null\) return;/.test(jsCross) &&
        /recheckRaf = requestAnimationFrame\(/.test(jsCross));
    /* ★ P38：布局变化要**重新量 rect**（resize 会改变元素的位置/尺寸，
       光靠滚动差值救不了），顺便再判一次命中。滚动则不需要重量，
       横向滚动只是平移、差值就够了（省一次布局读取）。 */
    ok('布局变化走 relayout（重新量 rect + 重判命中）',
        /function relayout\(\)\s*\{[\s\S]{0,200}?if \(snapEl\) \{ anchor\(snapEl\); settle\(\); \}[\s\S]{0,80}?recheckUnderCursor\(\);/.test(jsCross) &&
        /World\.onLayout\(relayout\)/.test(jsCross) &&
        /window\.addEventListener\("resize", relayout\)/.test(jsCross));
    ok('rect 的测量收敛成一个 anchor()（setSnap 和 relayout 共用）',
        /function anchor\(el\)\s*\{[\s\S]{0,200}?snapRect = el\.getBoundingClientRect\(\);[\s\S]{0,120}?snapScrollX = liveScrollX\(\);[\s\S]{0,80}?targetFromSnap\(0\);/.test(jsCross));

    /* ★ 这个守卫很重要：鼠标从没进过窗口时 mx/my 还是屏幕中心，
       这时候命中测试会凭空吸住屏幕中心那个东西。 */
    ok('★ 鼠标没进过窗口就不做命中测试（否则会凭空吸住屏幕中心）',
        /let pointerSeen = false;/.test(jsCross) &&
        /if \(!pointerSeen \|\| recheckRaf !== null\) return;/.test(jsCross) &&
        /pointerSeen = true;/.test(jsCross));

    /* 命中测试会跳过准星自己那一堆（它们都是 pointer-events: none）——
       这条是前提，改坏了 elementFromPoint 就会返回准星自己。 */
    ok('准星自己的元素都是 pointer-events: none（命中测试会跳过）',
        /\.crosshair-h,\s*\.crosshair-v\s*\{[^}]*pointer-events:\s*none/.test(cssNC) &&
        /\.ruler-band\s*\{[^}]*pointer-events:\s*none/.test(cssNC) &&
        /\.ruler-read\s*\{[^}]*pointer-events:\s*none/.test(cssNC) &&
        /\.ruler-marker-x,\s*\.ruler-marker-y\s*\{[^}]*pointer-events:\s*none/.test(cssNC) &&
        /\.cursor-dot\s*\{[^}]*pointer-events:\s*none/.test(cssNC));
    /* 两条互补的滚动处理都要留：一条管"元素还在光标下、只是挪了"，
       一条管"元素已经不在光标下了"。 */
    ok('两条滚动处理都在（动画中的位置跟随 + 锁死后的同步对齐）',
        /World\.onScroll\(\(\) => \{\s*if \(snapEl\) \{ targetFromSnap\(World\.scrollX - snapScrollX\); settle\(\); \}\s*\}\)/.test(jsCross) &&
        /snapToTargets\(\);/.test(jsCross));

    /* ---- P35 追加：滚动带来的"吸附偏移" ---- */
    /* ★ 根因：snapRect（实时）和 snapScrollX（缓存）不同源，差一帧的滚动量，
       差值就从第一帧起偏 δ，而 δ 正比于滚动速度 → "滚得越快越偏"。
       两条修法缺一不可。 */
    ok('★ 基准 scrollX 读的是**实时** mainEl.scrollLeft（不是 World 的缓存值）',
        /function liveScrollX\(\)\s*\{[\s\S]{0,140}?World\.main\.scrollLeft/.test(jsCross) &&
        /snapScrollX = liveScrollX\(\);/.test(jsCross) &&
        !/snapScrollX = window\.World \? World\.scrollX/.test(jsCross));
    ok('★ 刚量完 rect 那一拍 dx 必须是 0（否则同一段滚动被算两遍）',
        /snapRect = el\.getBoundingClientRect\(\);\s*\n\s*snapScrollX = liveScrollX\(\);[\s\S]{0,260}?targetFromSnap\(0\);/.test(jsCross));
    ok('targetFromSnap 的 dx 由调用方给（不再自己读全局缓存）',
        /function targetFromSnap\(dx\)/.test(jsCross) &&
        /snapRect\.left - dx/.test(jsCross));

    /* ---- P36/P37：悬停态改由 .is-hot 驱动 ---- */
    const liveSel = /const LIVE_HOVER_SEL = "([^"]+)";/.exec(jsCross);
    ok('★ .is-hot 名单覆盖了所有"在 main 里、会随页面滚走"的悬停元素（' +
        (liveSel ? liveSel[1].split(',').length : 0) + ' 个）',
        !!liveSel && /\.media-panel/.test(liveSel[1]) && /\.btn/.test(liveSel[1]) &&
        /\.hero h1/.test(liveSel[1]) && /\.card/.test(liveSel[1]) &&
        /\.ak-card/.test(liveSel[1]) && /#about \.container/.test(liveSel[1]) &&
        /function setLiveHot\(el\)/.test(jsCross) &&
        /setLiveHot\(t \? t\.closest\(LIVE_HOVER_SEL\) : null\)/.test(jsCross));
    ok('setLiveHot 会把上一个元素的 is-hot 摘掉（只留一个）',
        /if \(hotEl\) hotEl\.classList\.remove\("is-hot"\);/.test(jsCross));

    /* ★★ P37 的教训：会随页面滚走的悬停规则里**不许再留 `:hover`**。
       P36 我写的是「`:hover` 和 `.is-hot` 各一份」，那是错的 ——
       `.is-hot` 会被命中测试可靠摘掉，但**卡住的那条 `:hover` 还在**，
       于是"先移鼠标进去、再滚轮滚走"时元素一直亮着。
       两个选择器指向同一套样式时，只要有一个会卡，整体就是卡的。
       判据只能留一个，而且是**我们能清除**的那个。 */
    ok('★ 会随页面滚走的悬停规则里已经没有 :hover（只留 .is-hot）',
        !/\.media-panel:hover/.test(cssNC) &&
        !/\.btn\.primary:hover/.test(cssNC) &&
        !/\.btn\.ghost:hover/.test(cssNC) &&
        !/\.hero h1:hover/.test(cssNC) &&
        !/\.card:hover/.test(cssNC) && !/\.card\[data-work\]:hover/.test(cssNC) &&
        !/\.ak-card:hover/.test(cssNC) && !/#about \.container:hover/.test(cssNC));
    ok('那些规则确实改成了 .is-hot',
        /\.media-panel\.is-hot \.media-panel-bg/.test(cssNC) &&
        /\.media-panel\.is-hot \.media-panel-title/.test(cssNC) &&
        /\.btn\.primary\.is-hot/.test(cssNC) && /\.btn\.ghost\.is-hot/.test(cssNC) &&
        /\.hero h1\.is-hot/.test(cssNC) && /\.card\.is-hot/.test(cssNC) &&
        /\.ak-card\.is-hot/.test(cssNC) && /#about \.container\.is-hot/.test(cssNC));
    ok('media-panel 的悬停样式仍然只在支持 hover 的设备上生效',
        /@media \(hover: hover\) and \(pointer: fine\)[\s\S]{0,700}?\.media-panel\.is-hot/.test(cssNC));

    /* ★★ 全量守卫：CSS 里**所有** `:hover` 都必须在白名单里。
       白名单外一旦出现 `:hover` 就会失败 —— 因为 `main` 里的东西会随页面
       滚走、`:hover` 会卡住（P36/P37 就是这个坑）。要加新的 `:hover` 时，
       先确认它是不是固定 chrome / 弹窗内（不随页面滚），再补进这个名单。 */
    (function hoverAllowList() {
        /* 固定 chrome（不随页面滚）+ 弹窗内（顶层 dialog）+ 滚动条本身 */
        const OK = [
            '.nav-links a:hover',            // 导航栏是 fixed
            '.theme-toggle:hover',           // 同上
            'main::-webkit-scrollbar-thumb:hover',   // 滚动条
            '.win-btn:hover',                // 下面几个都在顶层 <dialog> 里
            '.win-shot:hover img',
            '.win-track:hover',
            '.win-list-item:hover',
        ];
        const seen = [];
        const ruleRe = /([^{}]+)\{/g;
        let m;
        while ((m = ruleRe.exec(cssNC))) {
            const sel = m[1].trim().replace(/\s+/g, ' ');
            if (!sel || sel.startsWith('@')) continue;
            sel.split(',').map((s) => s.trim()).filter(Boolean).forEach((one) => {
                if (one.includes(':hover')) seen.push(one);
            });
        }
        const stray = [...new Set(seen)].filter((s) => !OK.includes(s));
        ok(':hover 只出现在白名单里（固定 chrome / 弹窗 / 滚动条），共 ' +
            new Set(seen).size + ' 处', !stray.length,
            stray.length ? '白名单外: ' + stray.join(' | ') + '  → main 里的东西会随页面滚走，:hover 会卡住' : '');
    })();

    /* ★ 去掉 :hover 之后，浏览器不会再替我们清悬停态 —— 移出窗口必须自己摘 */
    ok('★ 鼠标移出窗口时清掉悬停态（:hover 去掉后必须自己摘类）',
        /addEventListener\("mouseleave",[\s\S]{0,400}?applyHover\(null\);/.test(jsCross));
})();

/* ============================================================
   2j. 框选量取：拖框 → 规格进剪贴板（P40）
   ------------------------------------------------------------
   设计上最关键的一条：**用位移阈值区分单击和拖框，不用长按。**
   长按在给出反馈前分不出"点一下"和"按住了"，必然引入等待窗口；
   而这站的大块单击是打开作品的 —— 加长按判定就是给"打开"加延迟。
   ============================================================ */
section('[2j] 框选量取：拖框 → 规格进剪贴板（P40）');
(function dragMeasure() {
    /* 这一组大多是"有没有某个词"的判断，一律走 codeOnly ——
       crosshair.js 的注释里写着 DRAG_MIN / preventDefault / 委托 这些词。 */
    const jsCross = codeOnly(read('js/crosshair.js'));
    /* ★ P48：框选的闸门在 guides.js 那边（G 键），所以要把它也读进来。
       同样走 codeOnly。 */
    const jsGuides = codeOnly(read('js/guides.js'));

    /* ---------- 触发方式 ---------- */
    ok('★ 用位移阈值（DRAG_MIN），不是长按 / 计时器',
        /const DRAG_MIN = 4;/.test(jsCross) &&
        /Math\.abs\(e\.clientX - pressX\) \+ Math\.abs\(e\.clientY - pressY\) >= DRAG_MIN/.test(jsCross));
    ok('★ mousedown 里不 preventDefault（单击还要能打开作品）',
        /addEventListener\("mousedown", \(e\) => \{[\s\S]{0,400}?pressX = e\.clientX; pressY = e\.clientY;/.test(jsCross) &&
        !/mousedown[\s\S]{0,400}?e\.preventDefault\(\)/.test(jsCross));
    ok('只认左键', /addEventListener\("mousedown", \(e\) => \{\s*\n\s*if \(e\.button !== 0\) return;/.test(jsCross));
    ok('浮窗开着时不抢（弹窗里拖拽不该被吃掉）',
        /classList\.contains\("window-open"\)\) return;/.test(jsCross));

    /* ---------- 拖过就不算点击 ---------- */
    /* ★★ 这条的写法比 P40 强一档。
       P40 我断言的是"suppressNextClick() 这个函数存在、里面用了捕获+stopPropagation"
       —— 结果它**从来没被调用过**，洞一直没被发现（浮窗是关的，肉眼看不出）。
       现在断言的是**链路**：标志位在哪里置、在哪里被消费、在哪里清。 */
    ok('★ 松手那一下的 click 被吞掉（不吞就"松手即确认"）',
        /let swallowClick = false;/.test(jsCross) &&
        /function enterPending\(\)[\s\S]{0,320}?swallowClick = true;/.test(jsCross) &&
        /if \(swallowClick\) \{\s*\n\s*swallowClick = false;/.test(jsCross));
    ok('★ 吞和确认写在**同一个处理器**里（两次 capture 监听会按注册顺序，后注册的永远慢一步）',
        /if \(swallowClick\)[\s\S]{0,600}?confirmBox\(\);/.test(jsCross));
    ok('★ 标志位在 mousedown 里清（下一次 click 没来也不会误吞后一下）',
        /addEventListener\("mousedown",[\s\S]{0,500}?swallowClick = false;/.test(jsCross));
    ok('吞掉时仍然 preventDefault + stopPropagation（别让浮窗的委托收到）',
        /if \(swallowClick\) \{[\s\S]{0,200}?e\.preventDefault\(\);[\s\S]{0,80}?e\.stopPropagation\(\);/.test(jsCross));
    ok('那个"定义了却没被调用"的 suppressNextClick 已经删掉',
        !/suppressNextClick/.test(jsCross));

    /* ★★ 通用 lint：**定义了却从没被调用**的函数。
       P40 的 suppressNextClick 就是这么活下来的 —— 它躺在那里、有注释、
       还有一条断言"证明"它存在，但一次都没执行过。
       这类"看着接上了、其实没接"的东西只能靠机器找。
       （jsCross 已经过 codeOnly，注释不会算进引用次数。）
       ★ 具名 IIFE —— `(function cursorDot(){})()` —— 要排除：
         它天生自己调用自己，名字只出现一次。判据是"定义前面那个字符是不是 `(`"。
         （第一版没排除，立刻把 cursorDot 报成"没人调"，算是这条 lint 自己
           先教了我一课。） */
    (function deadFunctions() {
        const names = [...jsCross.matchAll(/(^|[^\w$])function\s+([A-Za-z_$][\w$]*)\s*\(/g)]
            .filter((m) => m[1] !== "(")
            .map((m) => m[2]);
        const dead = names.filter((name) => {
            const hits = (jsCross.match(new RegExp('\\b' + name + '\\b', 'g')) || []).length;
            return hits <= 1;                 // 只有定义那一处 = 没人调
        });
        ok('★ 没有"定义了却从没调用"的函数（扫了 ' + names.length + ' 个，已排除具名 IIFE）',
            !dead.length, dead.length ? '没人调: ' + dead.join(', ') : '');
    })();

    /* ---------- 四条线就是框 ---------- */
    ok('★ 不新增元素：把"框的两个角"归一化成四个位置（min/max，任意方向都对）',
        /tx1 = Math\.min\(dragX0, x\); tx2 = Math\.max\(dragX0, x\);/.test(jsCross) &&
        /ty1 = Math\.min\(dragY0, y\); ty2 = Math\.max\(dragY0, y\);/.test(jsCross));
    ok('★ 拖框走缓动（不是精确落位）—— 起步才不跳',
        /const ease = dragging \? EASE_DRAG :/.test(jsCross) &&
        !/if \(locked \|\| dragging\)/.test(jsCross));
    ok('拖框/等确认期间冻结悬停 / 吸边判定（和框互斥）',
        /function applyHover\(t\)\s*\{[\s\S]{0,220}?if \(dragging \|\| pending\) return;/.test(jsCross) &&
        /function beginDrag\(\)[\s\S]{0,300}?setSnap\(null\);/.test(jsCross));
    ok('拖框时 mousemove 直接 return，不走"跟鼠标"那条（否则目标被抢）',
        /if \(dragging\) \{\s*\n\s*dragTo\(e\.clientX, e\.clientY\);\s*\n\s*return;/.test(jsCross));

    /* ---------- 一个类覆盖所有"在读跨度"的状态 ---------- */
    ok('★ 吸住 + 有框（拖框 / 等确认）共用 crosshair-measuring',
        /classList\.toggle\("crosshair-measuring", !!\(snapEl \|\| dragging \|\| pending\)\)/.test(jsCross));
    ok('★ "屏幕上有框"单独一个类 crosshair-box（拖框和等确认都算）',
        /classList\.toggle\("crosshair-box", !!\(dragging \|\| pending\)\)/.test(jsCross));

    /* ---------- 规格与剪贴板 ---------- */
    ok('规格格式：W × H @ (x, y) · #section 标题',
        /w \+ " × " \+ h \+ " @ \(" \+ left \+ ", " \+ top \+ "\)"/.test(jsCross) &&
        /sec\.id \? "#" \+ sec\.id : ""/.test(jsCross));
    ok('出处用 elementFromPoint 找（准星元素是 pointer-events:none，不会被命中）',
        /document\.elementFromPoint\(left \+ w \/ 2, top \+ h \/ 2\)/.test(jsCross) &&
        /closest\("\[data-work\]"\)/.test(jsCross));
    ok('剪贴板：优先异步 API，退回临时 textarea + execCommand',
        /navigator\.clipboard\.writeText\(text\)/.test(jsCross) &&
        /document\.execCommand\("copy"\)/.test(jsCross));

    /* ---------- 回执：松手那一刻在光标旁边生一句会淡出的字（P41） ---------- */
    ok('★ 回执出现在**圆形光标附近**（用松手那一刻的 clientX/Y）',
        /function showToast\(text, x, y\)/.test(jsCross) &&
        /el\.style\.left = \(x \+ 12\) \+ "px";/.test(jsCross) &&
        /el\.style\.top = \(y \+ 10\) \+ "px";/.test(jsCross));
    ok('★ 回执是**临时元素**（生成 + animationend 自己 remove，不留定时器）',
        /document\.body\.appendChild\(el\)/.test(jsCross) &&
        /addEventListener\("animationend", \(\) => el\.remove\(\), \{ once: true \}\)/.test(jsCross));
    ok('★ 回执位置固定（CSS 动画只动 opacity，不位移）',
        /\.cursor-toast\s*\{[\s\S]{0,400}?animation: cursorToast 1s ease forwards/.test(cssNC) &&
        /@keyframes cursorToast\s*\{\s*\n\s*0%\s*\{\s*opacity:\s*0/.test(cssNC) &&
        !/@keyframes cursorToast[\s\S]{0,300}?translate/.test(cssNC));
    ok('回执按结果给词（有图 / 只有文字 / 写失败 —— 三种都说实话）',
        /!ok \? "复制失败" : \(blob \? "已复制规格和截图" : "已复制规格（未能截图）"\)/.test(jsCross) &&
        /return navigator\.clipboard\.writeText\(text\)\.then\(\(\) => true, \(\) => fallback\(\)\)/.test(jsCross));
    ok('旧的"读数 ::after 回执"已经撤掉（只留光标旁这一处）',
        !/crosshair-copied/.test(cssNC) && !/crosshair-copied/.test(jsCross));

    /* ---------- 框内那层极淡的主题红（P41） ---------- */
    ok('★ 有框时框内有层极淡主题红，浓度走 --fill-alpha',
        /\.crosshair-fill\s*\{[\s\S]{0,400}?background:\s*var\(--accent\)/.test(cssNC) &&
        /body\.crosshair-box \.crosshair-fill\s*\{\s*opacity:\s*var\(--fill-alpha/.test(cssNC));
    /* ★ 只断言"极低"这个不变式，不钉 0.07 —— 它显然是个会手调的数 */
    const fillA = parseFloat((/--fill-alpha:\s*([\d.]+)/.exec(cssNC) || [])[1]);
    ok('★ --fill-alpha = ' + fillA + '：确实是"极低"（0 < v <= 0.15）',
        Number.isFinite(fillA) && fillA > 0 && fillA <= 0.15);
    ok('★ 它和红带同一种做法（100vw×100vh + transform-origin: 0 0，JS 只写 translate+scale）',
        /\.crosshair-fill\s*\{[\s\S]{0,400}?width:\s*100vw/.test(cssNC) &&
        /\.crosshair-fill\s*\{[\s\S]{0,400}?transform-origin:\s*0 0/.test(cssNC) &&
        /translate\(\$\{x1\.toFixed\(2\)\}px, \$\{y1\.toFixed\(2\)\}px\)/.test(jsCross));
    ok('填色层在准星线**之下**（它是底色，不该盖住四条线）',
        /\.crosshair-fill\s*\{[^}]*z-index:\s*9994/.test(cssNC) &&
        /\.crosshair-h,\s*\.crosshair-v\s*\{[^}]*z-index:\s*9995/.test(cssNC));
    ok('只在有框时更新它（拖框**和**等确认都算，平时透明）',
        /if \(\(dragging \|\| pending\) && fillEl\)/.test(jsCross));
    /* ★★ P46：松手那一刻要**立刻钉死**四条线。
       不钉死的话：dragging 一变 false，缓动系数掉回 EASE(0.10)、
       而红框的更新以 dragging 为条件当场定形 —— 两边一叠加就是你看到的
       "红框已经定了、准星还在跟鼠标"。 */
    ok('★ 松手立刻钉死（snapToTargets），不留缓动尾巴',
        /function enterPending\(\)\s*\{[\s\S]{0,400}?snapToTargets\(\);/.test(jsCross));
    ok('★ 钉死要在 dragging 置 false 之后（那时才按最终目标落位）',
        /dragging = false;\s*\n\s*pending = true;[\s\S]{0,300}?snapToTargets\(\);/.test(jsCross));
    /* ★ 上面那条只证明"CSS 写对了 + JS 会写 transform"。
       要是没人挂 crosshair-box 这个类，CSS 再对也是一片透明 —— 静默失效。
       所以必须单独断言"挂类"这一步真的在。
       （这条是我做完负向测试才补上的：把 toggle 改成 false，断言居然全绿。） */
    ok('★ crosshair-box 由 syncMeasuring() 按"有没有框"挂/摘（挂了才看得见）',
        /classList\.toggle\("crosshair-box", !!\(dragging \|\| pending\)\)/.test(jsCross));
    ok('★ 它是装饰，不参与"结构不对就整套不启用"的守卫（fill 和 hint 都是）',
        /const fillEl = document\.querySelector\("\.crosshair-fill"\);/.test(jsCross) &&
        /const hintEl = document\.querySelector\("\.crosshair-hint"\);/.test(jsCross) &&
        !/!fillEl \|\|/.test(jsCross) && !/!hintEl \|\|/.test(jsCross));

    /* ---------- 等确认：不直接复制（P42） ---------- */
    ok('★ 松手只进"等确认"，不写剪贴板',
        /addEventListener\("mouseup",[\s\S]{0,200}?if \(!dragging\) return;[\s\S]{0,80}?enterPending\(\);/.test(jsCross) &&
        !/endDrag/.test(jsCross));
    ok('★ 框中央那行提示由 HINT_TEXT 写（payload 变了要跟着变）',
        /const HINT_TEXT = CAN_SCREENSHOT \? "[^"]+" : "[^"]+";/.test(jsCross) &&
        /hintEl\.textContent = HINT_TEXT/.test(jsCross) &&
        /* 分隔符不许用全角空格 U+3000：原字体没这个字形，
           会落进兜底字体的 unicode-range、白拉 3.2MB。
           （P42 我真写了，被 unicode-range 那条断言当场抓住。） */
        !/\u3000/.test(jsCross));
    /* ★ 一句话要跟着**能力**走：能截图时写"截取"、不能时写"复制"。
       写死"截取"而浏览器没有 getDisplayMedia，就是骗人。 */
    ok('★ 提示词和真实能力一致（不能截图时说"复制"，不说"截取"）',
        /CAN_SCREENSHOT \? "点击框内截取/.test(jsCross) &&
        /: "点击框内复制 · 框外取消";/.test(jsCross));

    /* ---------- 时限 + 回到原来的悬停状态（P44） ---------- */
    /* ★ P48：不再钉 3000 这个数。它是个**手调的数**（你在文件里把它改成了
       1500），钉死值只会让"调一下手感的代价"变成"改两处 + 自检报红"。
       这里只断言不变式：是个正数、且短到一个框不会无限期挂着。 */
    const boxTtl = parseInt((/const BOX_TTL = (\d+);/.exec(jsCross) || [])[1], 10);
    ok('★ 框有确认时限（BOX_TTL = ' + boxTtl + 'ms），到点自动取消',
        Number.isFinite(boxTtl) && boxTtl > 0 && boxTtl <= 10000 &&
        /function enterPending\(\)[\s\S]{0,400}?armBoxTimer\(\);/.test(jsCross) &&
        /boxTimer = setTimeout\(dropBox, BOX_TTL\);/.test(jsCross));
    /* ★★ P48 反转了这一条：降低动效下**也**计时（你确认要保留这个框）。
       原来断言的是"只在非降低动效下生效"，现在断言它**没有**任何
       "降低动效就跳过"的分支 —— 否则一旦有人把那句加回来，
       降低动效下框就永远不消失了，而这是**反的**。 */
    ok('★ 时限在降低动效下也生效（不再有"REDUCE_MOTION 就跳过"的分支）',
        /function armBoxTimer\(\)\s*\{\s*\n\s*endBoxTimer\(\);\s*\n\s*boxTimer = setTimeout\(dropBox, BOX_TTL\);/.test(jsCross) &&
        !/REDUCE_MOTION/.test(jsCross));
    ok('★ 时限的文字指示走 --box-ttl，由 BOX_TTL 写进来（一处改两处生效）',
        /document\.documentElement\.style\.setProperty\("--box-ttl", \(BOX_TTL \/ 1000\) \+ "s"\)/.test(jsCross) &&
        /animation: hintCountdown var\(--box-ttl, 3s\) linear forwards/.test(cssNC));
    /* ★★ P48：时限在降低动效下也是真的，那条线就**不能藏**了 ——
       否则"3 秒后框会消失"完全没有视觉提示。
       但也不能照常动：那条全局规则会把 animation-duration 压到 .01ms，
       它会瞬间跑完，变成一条空线（比不动还糟）。
       所以降低动效下是一条**静止的满格线**（animation: none + scaleX(1)）。 */
    ok('★ 降低动效下倒计时线是"静止的满格"（不藏、也不瞬间跑空）',
        /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\n\s*\.crosshair-hint\.is-on::after\s*\{\s*\n\s*animation: none;\s*\n\s*transform: scaleX\(1\);/.test(cssNC));
    /* ★★ 倒计时线**不能**驱动取消：降低动效那条 animation-duration .01ms
       会让它瞬间跑完 → 框瞬间消失。所以取消必须走 JS 的 setTimeout。 */
    ok('★ 倒计时线只做指示，取消走 JS 定时器（不靠 animationend）',
        /boxTimer = setTimeout\(dropBox, BOX_TTL\)/.test(jsCross) &&
        !/hintCountdown[\s\S]{0,200}?dropBox/.test(jsCross));
    ok('时限在取消/确认时都要清掉（否则它会在后面某一刻突然把框收掉）',
        /function endBoxTimer\(\)[\s\S]{0,120}?clearTimeout\(boxTimer\)/.test(jsCross) &&
        /function dropBox\(\)\s*\{\s*\n\s*endBoxTimer\(\);/.test(jsCross) &&
        /function confirmBox\(\)\s*\{\s*\n\s*endBoxTimer\(\);/.test(jsCross));
    ok('拖框开始时也要清掉上一个框的时限（否则它会打断这次拖框）',
        /function beginDrag\(\)[\s\S]{0,400}?endBoxTimer\(\);/.test(jsCross));

    /* ★★ P45：取消的收尾不是"回到上一个元素"，而是**重新判一次
       "光标底下现在是谁"**。你点框外来取消，鼠标已经在新位置了 ——
       可能还在同一个元素上、可能移到别的可交互元素上、也可能在空地上。
       用"回到上一个"会显得呆板（准星和悬停态一起卡在旧元素上）。
       ★ 必须同步做，不能等 recheckUnderCursor 那个 rAF。 */
    ok('★ 取消后重新做一次命中测试（准星 + 悬停变色一起跟着鼠标走）',
        /function refreezeHover\(\)\s*\{[\s\S]{0,320}?document\.elementFromPoint\(mx, my\)[\s\S]{0,120}?applyHover\(/.test(jsCross) &&
        /function dropBox\(\)[\s\S]{0,600}?refreezeHover\(\);/.test(jsCross));
    /* ★★ P46：`applyHover(null)` 走的是 setSnap(null)，而 setSnap 在
       "本来就没吸着"时会提前 return —— targetFromMouse() 永远不会被调用，
       四条线就留在**框的位置**上（"没动过鼠标时准星停在框选处"就是这个）。 */
    ok('★★ 重判之后没吸着就必须回到鼠标（setSnap(null) 会提前 return）',
        /function refreezeHover\(\)\s*\{[\s\S]{0,500}?if \(!snapEl\) targetFromMouse\(\);/.test(jsCross));
    ok('★ 那一步是同步的（等 rAF 的话这一帧四条线还挂在旧位置上）',
        !/requestAnimationFrame[\s\S]{0,200}?refreezeHover/.test(jsCross));
    ok('取消时先 syncMeasuring 再重判（否则 crosshair-box 摘不掉）',
        /function dropBox\(\)\s*\{[\s\S]{0,400}?syncMeasuring\(\);\s*\n\s*refreezeHover\(\);/.test(jsCross));
    ok('旧的"记住上一个吸附元素"那套已经撤掉（命中测试严格更好）',
        !/prevSnapEl/.test(jsCross));

    /* ---------- 滚动中不许画框 + 回执（P45/P46） ---------- */
    ok('★ 用 SCROLL_SETTLE 这一小段静默来判断"页面静止了"',
        /const SCROLL_SETTLE = \d+;/.test(jsCross) &&
        /scrolling = true;\s*\n\s*clearTimeout\(scrollSettleTimer\);/.test(jsCross) &&
        /scrollSettleTimer = setTimeout\(\(\) => \{[\s\S]{0,120}?scrolling = false;/.test(jsCross));
    ok('★ 还在滚时拒绝画框，并回执"请等待页面静止…"',
        /if \(scrolling\) \{[\s\S]{0,300}?refusedDrag = true;[\s\S]{0,200}?showToast\("请等待页面静止…", e\.clientX, e\.clientY\);/.test(jsCross) &&
        /\} else \{\s*\n\s*beginDrag\(\);/.test(jsCross));
    /* ★★ P46：拒绝时**绝对不能 return** —— 那会跳过下面的 targetFromMouse()，
       准星"卡在原地"、直到页面静止才突然开始画框。
       现在的做法是标记 refusedDrag（本次按下就此作废）+ 照常往下走。 */
    ok('★★ 拒绝时不许 return（return 会跳过跟随更新 → 准星卡在原地）',
        /if \(scrolling\) \{\s*\n\s*refusedDrag = true;\s*\n\s*showToast\([\s\S]{0,120}?\} else if \(!guidesOn\(\)\) \{/.test(jsCross) &&
        /* ★ 只看 scrolling 那个分支的**里面**（[^}]* 到右花括号为止）——
           不能用带尾巴的正则往后再扫，那样会撞上后面
           `if (dragging) { … return; }` 那个合法的 return。 */
        !/if \(scrolling\) \{[^}]*return;/.test(jsCross) &&
        /* ★ P48：新加的 guides 分支同样不许 return（同一个坑）。 */
        !/if \(!guidesOn\(\)\) \{[^}]*return;/.test(jsCross));
    ok('★ 本次按下作废 = refusedDrag 参与开始拖框的条件（后面再移动也不会画框）',
        /if \(!dragging && !refusedDrag &&\s*\n\s*Math\.abs\(e\.clientX - pressX\)/.test(jsCross));
    ok('★ 一次按住只提示一次（refusedDrag 在 mousedown 里复位）',
        /let refusedDrag = false;/.test(jsCross) &&
        /refusedDrag = true;/.test(jsCross) &&
        /addEventListener\("mousedown",[\s\S]{0,700}?refusedDrag = false;/.test(jsCross));
    ok('★ 提示摆在框中心，并夹回视口内（框贴边时不然看不见）',
        /const cx = \(x1 \+ x2\) \/ 2;/.test(jsCross) &&
        /const r = hintEl\.getBoundingClientRect\(\);/.test(jsCross) &&
        /if \(r\.left < M\) dx = M - r\.left;/.test(jsCross));
    ok('★ 点框内 = 复制、点框外 = 取消（捕获阶段，别顺手把作品浮窗点开）',
        /addEventListener\("click", \(e\) => \{[\s\S]{0,700}?if \(!pending \|\| dragging\) return;[\s\S]{0,300}?const inside = e\.clientX >= tx1 && e\.clientX <= tx2 &&[\s\S]{0,120}?if \(inside\) confirmBox\(\);[\s\S]{0,60}?else dropBox\(\);/.test(jsCross) &&
        /e\.stopPropagation\(\);[\s\S]{0,400}?confirmBox\(\);/.test(jsCross) &&
        /\}, true\);/.test(jsCross));
    /* ★ 判"框内"用目标位置（tx*）而不是当前值：框刚画完可能还在收敛的最后
       几像素上，用目标位置更稳、也更符合"你看到的那四条线"。 */
    ok('★ 框内判据用目标位置 tx1..ty2（不是收敛中的当前值）',
        /const inside = e\.clientX >= tx1 && e\.clientX <= tx2 &&\s*\n\s*e\.clientY >= ty1 && e\.clientY <= ty2;/.test(jsCross));
    ok('★ 右键 = 取消（只在有框时压掉右键菜单，平时照旧）',
        /addEventListener\("contextmenu", \(e\) => \{\s*\n\s*if \(!pending && !dragging\) return;[\s\S]{0,120}?dropBox\(\);/.test(jsCross));
    ok('Esc = 取消（没有它键盘用户会被卡在这个状态里）',
        /if \(e\.key !== "Escape" \|\| \(!pending && !dragging\)\) return;\s*\n\s*dropBox\(\);/.test(jsCross));
    ok('待确认期间再拖一次 = 换一个框（不用先取消）',
        /function beginDrag\(\)\s*\{[\s\S]{0,200}?pending = false;/.test(jsCross));
    ok('★ 等确认时 mousemove 不许把线拉回鼠标（否则框上四条线会跑掉）',
        /if \(!snapEl && !dragging && !pending\) targetFromMouse\(\);/.test(jsCross));
    ok('★ 等确认期间滚动 = 取消（框是视口坐标，一滚就对不上内容了）',
        /document\.addEventListener\("scroll", \(\) => \{[\s\S]{0,400}?if \(pending\) dropBox\(\);/.test(jsCross));

    /* ============================================================
       P48：框选与键盘
       ============================================================ */

    /* ★★ 规则：没开参考网格（G）就不能框选。
       状态走 body 上的类（`guides-on`），不跨文件传变量。 */
    ok('★ 框选绑在参考网格上（guides-on），状态走 body 类而不是跨文件变量',
        /function guidesOn\(\)\s*\{\s*\n\s*const cls = document\.body\.classList;\s*\n\s*return !cls\.contains\("guides-ready"\) \|\| cls\.contains\("guides-on"\);/.test(jsCross) &&
        /document\.body\.classList\.toggle\('guides-on', visible\);/.test(jsGuides));
    /* ★★ 出发点是 guides.js 里那个 `!canvas || !World` 守卫：
       它一旦成立，G 键处理器**根本不存在**，`guides-on` 永远是 false。
       要是这里直接 `return false`，框选就被**永久禁用**且不报错 ——
       "守卫把整套功能静默关掉"在这个项目里已经出现过两次。
       所以没有 `guides-ready` 标记时必须 **fail-open**（放开闸门）。 */
    ok('★★ 参考线模块挂了不能连框选一起弄死（没有 guides-ready 标记就 fail-open）',
        /!cls\.contains\("guides-ready"\) \|\|/.test(jsCross) &&
        /document\.body\.classList\.add\('guides-ready'\);/.test(jsGuides));
    /* ★ 被闸门挡住时同样要"作废这一次按下"而不是 return ——
       return 会跳过 targetFromMouse()，准星就卡在原地不动（P46 的老 bug）。
       ★ 回执文案**不钉死**：只要求它点名 G（"按 G…"）。
         你把文案改成"按 G 开启参考系…"了，钉死句子的代价就是每次改词
         都要回来改自检（P34 的教训）。 */
    ok('★ 没有网格时"作废这次按下 + 给回执"，而不是 return（return 会让准星卡住）',
        /else if \(!guidesOn\(\)\) \{\s*\n\s*refusedDrag = true;\s*\n\s*showToast\("按 G[^"]*"/.test(jsCross));
    /* ★ G 键关掉网格时，**已经画出来的框也要收掉** ——
       否则"没有网格就没有框选"会留下一个例外。
       用 rAF 而不是同步读：crosshair.js 和 guides.js 各注册一个 keydown，
       谁先跑取决于 script 顺序，同步读会读到旧状态（"按一下没反应"）。 */
    ok('★ 关掉网格时连待确认的框一起收掉（rAF 里再读，避免注册顺序的坑）',
        /if \(e\.key\.toLowerCase\(\) !== "g" \|\| !pending\) return;\s*\n\s*requestAnimationFrame\(\(\) => \{ if \(pending && !guidesOn\(\)\) dropBox\(\); \}\)/.test(jsCross));

    /* ★★ Enter = 确认。既然框选和键盘绑上了，就该能用键盘走完全程：
       拖出框 → Enter 截取。没有它，键盘用户画完框还得去够鼠标。 */
    ok('★ Enter 确认待确认的框（键盘能走完全程）',
        /if \(e\.key === "Enter"\) \{\s*\n\s*if \(!pending \|\| dragging\) return;\s*\n\s*e\.preventDefault\(\);\s*\n\s*confirmBox\(\);/.test(jsCross));
    /* ★ 输入框里不抢键：这站有输入元素，打字时按 Enter 不该截屏、
       按 G 不该切网格（guides.js 本来就有这道守卫，两处一致）。 */
    ok('★ 输入框里不抢 Enter / G（打字时不该截屏、不该切网格）',
        /const tag = document\.activeElement && document\.activeElement\.tagName;\s*\n\s*if \(tag === "INPUT" \|\| tag === "TEXTAREA"/.test(jsCross) &&
        /tag === 'INPUT' \|\| tag === 'TEXTAREA'/.test(jsGuides));

    /* ---------- 闪白 ---------- */
    ok('★ 抓取那一刻框自己闪白（不是在框里套一层 —— 父 opacity 会乘上去）',
        /body\.crosshair-box \.crosshair-fill\.is-flashing\s*\{\s*\n\s*background:\s*#fff;/.test(cssNC) &&
        /@keyframes crosshairFlash\s*\{[\s\S]{0,200}?opacity:\s*0\.92/.test(cssNC));
    ok('闪完自己把类摘掉（否则第二次闪不出来）',
        /addEventListener\("animationend", \(\) => fillEl\.classList\.remove\("is-flashing"\)\)/.test(jsCross));
    /* ★★ P46：提示和倒计时线要在**闪白之前**收掉 ——
       不然闪的那一下中间还压着一行字和一条进度线，不像"闪了一下框"。 */
    ok('★ 闪白之前先收掉提示与进度条',
        /function confirmBox\(\)\s*\{\s*\n\s*endBoxTimer\(\);[\s\S]{0,200}?hideHint\(\);[\s\S]{0,200}?flashBox\(\);/.test(jsCross));
    ok('回执文案里"复制失败"还在（写不进剪贴板时得有话说）', /"复制失败"/.test(jsCross));

    /* ============================================================
       截图（P47）
       ------------------------------------------------------------
       ★ 这一组的断言方式要说清：**这里没有浏览器**，getDisplayMedia、
         videoWidth、ClipboardItem 一个都跑不了。所以下面断的不是
         "截出来的图对不对"，而是"这段代码有没有把**已知会错的地方**
         主动挡掉" —— 挡它的那几行是可验证的，像素不是。
       ============================================================ */

    /* ★★ 序列顺序是这个功能唯一的硬约束：
       getDisplayMedia 要 transient activation（来自"确认"那一下点击），
       所以它必须是 captureImage 里**第一个 await**，
       而"藏起仪器 → 采帧"必须在拿到 stream 之后。
       三者顺序一反，功能就是坏的，但代码看着仍然"很合理"。 */
    ok('★ 取流是 captureImage 里第一个 await（要 transient activation）',
        /async function captureImage\(box\)\s*\{\s*\n\s*if \(!CAN_SCREENSHOT\) return null;\s*\n\s*let stream = null;\s*\n\s*try \{\s*\n\s*stream = await requestCaptureStream\(\);/.test(jsCross) &&
        /async function requestCaptureStream\(\)\s*\{\s*\n\s*try \{\s*\n\s*return await navigator\.mediaDevices\.getDisplayMedia\(CAPTURE_CONSTRAINTS\)/.test(jsCross));
    /* ★★ 这一条是 P47 里最值钱的一条，也是最容易漏的：
       Chrome 108 起 `selfBrowserSurface` 默认 "exclude" ——
       **"当前标签页"根本不在选择列表里**。
       只写 preferCurrentTab: true 的话，功能在默认配置下就是不可用的，
       而且用户看不出是哪里坏了（他只会发现没有"当前标签页"这个选项）。 */
    ok('★ selfBrowserSurface: "include" 必须显式写（Chrome 108 起默认 exclude，当前标签页不在列表里）',
        /selfBrowserSurface: "include"/.test(jsCross));
    ok('★ monitorTypeSurfaces: "exclude"（把"整个屏幕"从列表里去掉 —— 那个选项注定会失败）',
        /monitorTypeSurfaces: "exclude"/.test(jsCross));
    ok('★ displaySurface 只要 browser（不要求 monitor —— 那也是 TypeError 的那条互斥线）',
        /video: \{ displaySurface: "browser" \}/.test(jsCross) &&
        !/displaySurface: "monitor"/.test(jsCross));
    /* ★ 约束集被拒（TypeError）才重试；用户拒绝（NotAllowedError）绝不能重试 ——
       那等于再弹一次权限框。 */
    ok('★ 只对 TypeError 重试一次保守约束集（NotAllowedError = 用户拒绝，重试等于再弹一次框）',
        /err\.name !== "TypeError"/.test(jsCross) &&
        /if \(!err \|\| err\.name !== "TypeError"\) throw err;/.test(jsCross));
    ok('★ 采帧前先挂 .capture-hide、采完就摘（finally 里再摘一次兜底）',
        /classList\.add\("capture-hide"\)[\s\S]{0,200}?await waitVideoFrames\(video, 2\)[\s\S]{0,200}?classList\.remove\("capture-hide"\)/.test(jsCross) &&
        /catch \(err\) \{\s*\n\s*return null;\s*\n\s*\} finally \{\s*\n\s*document\.body\.classList\.remove\("capture-hide"\);/.test(jsCross));
    /* ★★ 采帧必须等**新到的**帧，不能拍脑袋 sleep：
       藏准星和"这一帧画没画出来"之间没有同步点，用 requestVideoFrameCallback
       才是"藏完之后采到的"。没有这个 API 时退回定时器（这是降级，不是等价）。 */
    ok('★ 等的是新到的视频帧（requestVideoFrameCallback），不是猜延迟',
        /typeof video\.requestVideoFrameCallback !== "function"/.test(jsCross) &&
        /video\.requestVideoFrameCallback\(step\)/.test(jsCross) &&
        /await waitVideoFrames\(video, 2\);/.test(jsCross));
    /* ★★ 但 rVFC **不能单独用**：视频元素是游离在 DOM 外的，
       万一某个浏览器不派发 rVFC，那个 Promise 就**永远不 resolve** ——
       表现是"点了确认毫无反应"，且没有任何报错。
       所以必须 race 一个兜底定时器（精确优先，有界保底）。 */
    ok('★ rVFC 有兜底定时器（不派发时不能变成一个永远挂住的 Promise）',
        /const byTimer = new Promise\(\(r\) => setTimeout\(r, FRAME_WAIT_MS\)\);/.test(jsCross) &&
        /return Promise\.race\(\[byFrames, byTimer\]\);/.test(jsCross));
    /* ★★ 这一条挡的是"第一次截取永远失败、第二次才成功"那类最难查的 bug：
       MediaStream 挂上 <video> 之后首帧不是立刻到的，这中间 videoWidth = 0。
       不等它 → scaleX = 0 → 被比例自检判成"选错了共享对象" → return null。
       ★ 而且必须**在藏仪器之前**等：反了就是在一个 0×0 的视频上等 2 帧，白等。 */
    ok('★ 采帧前先等视频真的有画面（videoWidth > 0），否则第一次截取必然失败',
        /function waitVideoReady\(video\)\s*\{\s*\n\s*if \(video\.videoWidth > 0\) return Promise\.resolve\(\);/.test(jsCross) &&
        /addEventListener\("loadedmetadata", done\)/.test(jsCross) &&
        /await waitVideoReady\(video\);[\s\S]{0,300}?classList\.add\("capture-hide"\)/.test(jsCross));

    /* ★★ 宽高比自检：这一条挡的是"用户选成了窗口/整个屏幕"。
       标签页捕获 = 视口，videoWidth/innerWidth 与 videoHeight/innerHeight
       应当相等；共享窗口带着浏览器边框，两个比值就对不上。
       没有这道闸，用户选错共享对象时**不会报错**，只会得到一张
       坐标系整体偏移的错图 —— 那比失败更坏。 */
    ok('★ 缩放比按视口算，且两个比值不一致就放弃（挡掉"共享了窗口/屏幕"）',
        /const scaleX = video\.videoWidth \/ window\.innerWidth;/.test(jsCross) &&
        /const scaleY = video\.videoHeight \/ window\.innerHeight;/.test(jsCross) &&
        /Math\.abs\(scaleX - scaleY\) \/ Math\.max\(scaleX, scaleY\) > 0\.02/.test(jsCross));
    ok('★ 裁切的坐标：源 = 框 × scaleX/scaleY，目标 = 整块画布（不是从视口原点切）',
        /canvas\.width = Math\.max\(1, Math\.round\(box\.w \* scaleX\)\)/.test(jsCross) &&
        /canvas\.height = Math\.max\(1, Math\.round\(box\.h \* scaleY\)\)/.test(jsCross) &&
        /Math\.round\(box\.left \* scaleX\), Math\.round\(box\.top \* scaleY\)/.test(jsCross));
    /* ★ 流一定要停：不停掉，"正在共享"那条提示会一直挂在页面上，
       用户以为还在共享 —— 一个截图功能不该留下一个持续的采集会话。 */
    ok('★ 抓完立刻停掉轨道（不留一个还在共享的会话）',
        /stream\.getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\);/.test(jsCross));
    /* ★★ 任何一步失败都要 resolve(null) 而不是抛出去：
       调用方靠它退回纯文本规格（"保留当前功能"）。 */
    ok('★ 失败一律退回 null（不支持 / 拒绝 / 比例不对 / 转换出错）',
        /if \(!CAN_SCREENSHOT\) return null;/.test(jsCross) &&
        /\} catch \(err\) \{\s*\n\s*return null;\s*\n\s*\}/.test(jsCross));
    ok('★ 能力检测要求 getDisplayMedia **和** ClipboardItem 同时在（缺一不可）',
        /navigator\.mediaDevices\.getDisplayMedia/.test(jsCross) &&
        /window\.ClipboardItem/.test(jsCross) &&
        /const CAN_SCREENSHOT = !!\(/.test(jsCross));

    /* ★★ "保留当前功能"= 两个类型一起写，不是二选一：
       粘进编辑器得到规格，粘进 Figma 得到图片。
       ★ 顺序也重要：图写失败要**退回**纯文字（递归那一句），
         否则一个不让写 image/png 的浏览器会把文字也一起丢掉。 */
    ok('★ 有图时写 text/plain + image/png **两个类型**（不是二选一）',
        /new ClipboardItem\(\{ "text\/plain": asText\(\), "image\/png": imageBlob \}\)/.test(jsCross));
    ok('★ 图写失败退回只写文字（否则连文字都丢了）',
        /\.then\(\(\) => true, \(\) => writeClipboard\(text, null\)\)/.test(jsCross));

    /* ★★ 矩形必须在弹权限框**之前**就算好。
       点下去之后马上弹"选择要共享的内容"，那期间框会收、鼠标会跑；
       等截图回来再读 x1/x2 拿到的已经不是这个框了。 */
    ok('★ 裁切矩形在弹共享框之前定死（不能等截图回来再读 x1/x2）',
        /function confirmBox\(\)[\s\S]{0,500}?const box = \{\s*\n\s*left: Math\.round\(Math\.min\(x1, x2\)\)[\s\S]{0,300}?captureImage\(box\)/.test(jsCross));
    ok('★ 确认时**同一次**取规格和矩形（写进规格的数字和裁出来的像素是同一个框）',
        /const spec = buildSpec\(\);[\s\S]{0,500}?const box = \{\s*\n\s*left: Math\.round\(Math\.min\(x1, x2\)\)/.test(jsCross));

    /* ★ CSS 那边得真的把仪器藏起来：JS 挂了类没人认，就是白挂。 */
    ok('★ .capture-hide 把仪器全藏了（准星/指针/红框/提示/三角/红带/读数/尺子/参考线）',
        /body\.capture-hide \.crosshair-h,/.test(cssNC) &&
        /body\.capture-hide \.crosshair-v,/.test(cssNC) &&
        /body\.capture-hide \.crosshair-fill,/.test(cssNC) &&
        /body\.capture-hide \.crosshair-hint,/.test(cssNC) &&
        /body\.capture-hide \.cursor-dot,/.test(cssNC) &&
        /body\.capture-hide \.ruler-marker-x,/.test(cssNC) &&
        /body\.capture-hide \.ruler-marker-y,/.test(cssNC) &&
        /body\.capture-hide \.ruler-band,/.test(cssNC) &&
        /body\.capture-hide \.ruler-read,/.test(cssNC) &&
        /body\.capture-hide #ruler-bottom,/.test(cssNC) &&
        /body\.capture-hide #ruler-left,/.test(cssNC) &&
        /body\.capture-hide #guide-layer \{/.test(cssNC));
    /* ★★ 用 visibility，不用 opacity、不用 display：
       opacity 有过渡 → 采样可能拍到半透明的中间态（截出来带着鬼影）；
       display: none 会触发重排 → 采样那一帧可能正好在重排。 */
    ok('★ 藏法用 visibility（不动布局、无过渡），不用 display:none / opacity',
        /body\.capture-hide[\s\S]{0,900}?visibility: hidden;/.test(cssNC) &&
        !/body\.capture-hide[^}]*display: none/.test(cssNC) &&
        !/body\.capture-hide[^}]*opacity: 0/.test(cssNC));

    /* ---------- 别留下卡住的框 ---------- */
    ok('★ 拖到窗口外要取消（拿不到 mouseup，不然框会卡住；等确认时保留）',
        /addEventListener\("mouseleave",[\s\S]{0,400}?if \(dragging\) dropBox\(\);/.test(jsCross) &&
        /addEventListener\("mouseleave"[\s\S]{0,200}?pressing = false;/.test(jsCross));
})();

/* ============================================================
   [2k] 开屏期间四角刻线必须在整页之下（P49）
   ------------------------------------------------------------
   现象：开屏那几秒，`.draft-frame` 的四角刻线浮在红幕 / WELCOME / 化开层上。

   ★★★ 机制（这轮唯一值得记住的一条）：跨层叠上下文时，**比数字是没有用的**。
     · `.page-zoom` 挂着开屏那份 transform → 它是个层叠上下文，
       而且是非定位元素形成的，在 body 里按**层号 0** 参与排序；
     · 开屏那几层的 z-index（9996/9997/9998/10000）**全关在这个上下文里面**；
     · `.draft-frame` 是 body 的直接子元素 + 正层号 → 永远排在层号 0 之后。
     所以 4 和 999 一样（都是正数、都压在整页上）；要落到它下面，层号只能是**负数**。

   ★ 所以这一组**不**去断言"刻线的 z 小于红幕"那种看着合理、实际不成立的关系，
     而是断言那条**真的起作用**的规则（负层号 + 同一个 intro-done 门）。
   ============================================================ */
section('[2k] 开屏期间四角刻线必须在整页之下（P49）');
(function draftFrameLayering() {
    /* ★ 真的起作用的那条：开屏期间把刻线压到整页之下。 */
    ok('★★ 开屏期间 .draft-frame 的层号是**负数**（正数再怎么改都压在整页之上）',
        /body:not\(\.intro-done\) \.draft-frame\s*\{\s*\n\s*z-index:\s*-\d+;/.test(cssNC));
    /* ★★ 两个门必须是同一个 —— 这条规则成立的唯一理由就是
       ".page-zoom 上还挂着开屏那份 transform"。门一旦分叉，
       就会出现"transform 已经清掉、刻线还躲在后面"（或反过来）的窗口期。 */
    ok('★★ 负层号的门 = 清 transform 的门（都是 body.intro-done / :not(.intro-done)）',
        /body:not\(\.intro-done\) \.draft-frame/.test(cssNC) &&
        /body\.intro-done \.page-zoom\s*\{[^}]*transform:\s*none/.test(cssNC));
    /* ★ 前提本身也钉住：开屏期间 `.page-zoom` 确实有 transform。
       哪天那份 transform 被挪走，这条负层号就该一起删 ——
       所以这里连"动画 + fill-mode both"一起断言。 */
    ok('★ 前提：开屏期间 .page-zoom 带着 transform（动画 both 填充 + 未武装时暂停）',
        /\.page-zoom\s*\{[^}]*animation:\s*body缩放[^}]*\bboth\b/.test(cssNC) &&
        /* ★ 这条选择器是**逗号列表**里的一项（`… .splash-网点,\n … .page-zoom,\n … { }`），
           所以不能要求它后面直接跟 `{` —— 第一版就是这么写错的。 */
        /html:not\(\.intro-armed\) \.page-zoom,[\s\S]{0,400}?animation-play-state:\s*paused/.test(cssNC));
    /* ★★ 刻线必须是 **body 的直接子元素**（在 .page-zoom 之外）。
       这不是随手写的：放进 .page-zoom 会被开屏那份 transform 当成 fixed 的包含块，
       刻线会跟着缩放/错位（浮窗那条注释里写过同一个坑）。
       所以"修层级"不能靠搬家，只能靠负层号。 */
    ok('★★ 四角刻线挂在 body 上（不进 .page-zoom —— 进去会被开屏的 transform 缩放）',
        /document\.body\.appendChild\(frame\)/.test(codeOnly(read('js/draft-layer.js'))) &&
        !/page-zoom/.test(codeOnly(read('js/draft-layer.js'))));
    /* ★ 活着的时候的层号不变：正文之上、导航栏/页脚之下（4）。 */
    ok('★ 开屏结束后回到原层号（.draft-frame 的 z-index 声明只有一条基础值 + 一条开屏值）',
        (cssNC.match(/\.draft-frame\s*\{[^}]*z-index:\s*\d+/g) || []).length === 1 &&
        /body:not\(\.intro-done\) \.draft-frame/.test(cssNC));
})();

/* ============================================================
   3. 浮窗状态机（极简 DOM 桩）
   ============================================================ */
section('[3] 浮窗状态机');

class ClassList {
    constructor(el) { this.el = el; }
    _s() { return (this.el.className || '').split(/\s+/).filter(Boolean); }
    add(...c) { const s = this._s(); c.forEach(x => { if (!s.includes(x)) s.push(x); }); this.el.className = s.join(' '); }
    remove(...c) { this.el.className = this._s().filter(x => !c.includes(x)).join(' '); }
    contains(c) { return this._s().includes(c); }
    toggle(c, f) { if (f === undefined) f = !this.contains(c); f ? this.add(c) : this.remove(c); return f; }
}

function matchSel(el, sel) {
    sel = sel.trim();
    if (sel.startsWith('#')) return el.attrs.id === sel.slice(1);
    if (sel.startsWith('.')) return (el.className || '').split(/\s+/).includes(sel.slice(1));
    if (sel.startsWith('[')) {
        const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(sel);
        if (!m) return false;
        let v = el.attrs[m[1]];
        if (v === undefined && m[1].startsWith('data-')) v = el.dataset[m[1].slice(5)];
        return m[2] === undefined ? (v !== undefined) : v === m[2];
    }
    return el.tagName === sel.toUpperCase();
}

class El {
    constructor(tag) {
        this.tagName = tag.toUpperCase();
        this.nodeType = 1;
        this.childNodes = [];
        this.attrs = Object.create(null);
        this.dataset = {};
        this.className = '';
        this.textContent = '';
        this.parentElement = null;
        this._ev = Object.create(null);
        this.classList = new ClassList(this);
        this.hidden = false;
        this.open = false;
        this.isConnected = false;
        this.style = { setProperty() {}, removeProperty() {} };
    }
    setAttribute(k, v) {
        this.attrs[k] = String(v);
        if (k === 'hidden') this.hidden = true;
        /* 真 DOM 里 data-* 会反射到 dataset，桩里得手动补 ——
           否则「用 setAttribute 写、用 dataset 读」的路径会假失败 */
        if (k.startsWith('data-')) this.dataset[k.slice(5)] = String(v);
    }
    getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; }
    removeAttribute(k) { delete this.attrs[k]; }
    append(...nodes) { nodes.forEach(n => { if (!n) return; n.parentElement = this; n.isConnected = true; this.childNodes.push(n); }); }
    replaceChildren(...nodes) { this.childNodes.forEach(n => { n.parentElement = null; n.isConnected = false; }); this.childNodes = []; this.append(...nodes); }
    addEventListener(t, f) { (this._ev[t] || (this._ev[t] = [])).push(f); }
    removeEventListener(t, f) { if (this._ev[t]) this._ev[t] = this._ev[t].filter(x => x !== f); }
    fire(t, e) {
        e = Object.assign({ type: t, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} }, e || {});
        let n = this;
        while (n) { (n._ev[t] || []).forEach(f => f(e)); n = n.parentElement; }
        (doc._ev[t] || []).forEach(f => f(e));
        return e;
    }
    closest(sel) { let n = this; while (n && n.nodeType === 1) { if (matchSel(n, sel)) return n; n = n.parentElement; } return null; }
    querySelectorAll(sel) { const out = []; const walk = n => n.childNodes.forEach(c => { if (c.nodeType === 1) { if (matchSel(c, sel)) out.push(c); walk(c); } }); walk(this); return out; }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    showModal() { if (this.open) throw new Error('dialog already open'); this.open = true; }
    close() { if (!this.open) return; this.open = false; this.fire('close'); }
}

const doc = {
    nodeType: 9, _ev: Object.create(null), _els: [],
    createElement(t) { const e = new El(t); doc._els.push(e); return e; },
    createTextNode(t) { return { nodeType: 3, textContent: String(t), parentElement: null, isConnected: false }; },
    getElementById(id) { return doc._els.find(e => e.attrs.id === id) || null; },
    querySelector(s) { return doc._els.find(e => matchSel(e, s)) || null; },
    querySelectorAll(s) { return doc._els.filter(e => matchSel(e, s)); },
    addEventListener(t, f) { (doc._ev[t] || (doc._ev[t] = [])).push(f); },
    dispatchEvent(e) { (doc._ev[e.type] || []).forEach(f => f(e)); return true; },
};
doc.body = new El('body');
doc.documentElement = new El('html');
doc._els.push(doc.body, doc.documentElement);

global.Element = El;
global.CustomEvent = class { constructor(t) { this.type = t; } };
global.document = doc;
global.window = global;
global.requestAnimationFrame = fn => setTimeout(fn, 0);
global.cancelAnimationFrame = id => clearTimeout(id);
global.matchMedia = q => ({ media: q, matches: false, addEventListener() {}, removeEventListener() {} });

/* 按 index.html 里那段 dialog 骨架搭一份桩 */
const dialog = doc.createElement('dialog'); dialog.setAttribute('id', 'work-window'); dialog.className = 'win';
const scrim = doc.createElement('div'); scrim.className = 'win-scrim'; scrim.setAttribute('data-win', 'close');
const panel = doc.createElement('div'); panel.className = 'win-panel';
const bar = doc.createElement('header'); bar.className = 'win-bar';
const noEl = doc.createElement('span'); noEl.className = 'win-no';
const titleEl = doc.createElement('h2'); titleEl.className = 'win-title'; titleEl.setAttribute('id', 'win-title');
const tools = doc.createElement('div'); tools.className = 'win-tools';
const badge = doc.createElement('span'); badge.className = 'win-badge'; badge.hidden = true;
const ext = doc.createElement('a'); ext.className = 'win-btn win-ext'; ext.hidden = true;
const closeBtn = doc.createElement('button'); closeBtn.className = 'win-btn win-close'; closeBtn.setAttribute('data-win', 'close');
tools.append(badge, ext, closeBtn); bar.append(noEl, titleEl, tools);
const bodyEl = doc.createElement('div'); bodyEl.className = 'win-body'; bodyEl.setAttribute('data-win', 'body');
panel.append(bar, bodyEl); dialog.append(scrim, panel);
doc.body.append(dialog);

let paused = 0, resumed = 0;
global.World = { pause() { paused++; }, resume() { resumed++; } };

eval(worksSrc);
eval(winSrcForTest);
const W = window.WorkWindow;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async function run() {
    ok('浮窗总开关存在（当前 ' + (/const ENABLED = (\w+)/.exec(winSrc)[1]) + '）', /const ENABLED = (true|false);/.test(winSrc));
    ok('WorkWindow 导出 open/close', typeof W.open === 'function' && typeof W.close === 'function');

    section('  · 打开 gallery');
    W.open('art-draw');
    ok('showModal 已调用', dialog.open === true);
    ok('body.window-open（接管滚轮与光标）', doc.body.classList.contains('window-open'));
    await sleep(50);
    ok('is-in 已加（兜底路径走 raf2）', dialog.classList.contains('is-in'));
    ok('标题 / 编号正确', titleEl.textContent === '绘画' && noEl.textContent === '03', titleEl.textContent + '/' + noEl.textContent);
    ok('body[data-kind=gallery]', bodyEl.dataset.kind === 'gallery');
    ok('渲染出图片', bodyEl.querySelectorAll('.win-shot').length === 1);
    ok('占位角标可见', badge.hidden === false);
    ok('非 unity 时外链按钮隐藏', ext.hidden === true);
    ok('World.pause 被调用', paused === 1, 'paused=' + paused);

    section('  · 就地切到 unity（不重播开关动画）');
    W.open('boom-shooting');
    ok('浮窗仍开着', dialog.open === true);
    ok('kind = unity', bodyEl.dataset.kind === 'unity');
    const frames = bodyEl.querySelectorAll('.win-frame');
    ok('iframe 是惰性建出来的', frames.length === 1);
    ok('iframe.src 指向构建', frames[0] && frames[0].src === 'assets/unityGame/BoomShooting/index.html', frames[0] && frames[0].src);
    ok('有载入遮罩', bodyEl.querySelectorAll('.win-loading').length === 1);
    ok('外链按钮出现且同源', ext.hidden === false && ext.href === frames[0].src);
    ok('World.pause 没被重复调用', paused === 1);

    section('  · audio / list');
    W.open('music');
    ok('kind = audio', bodyEl.dataset.kind === 'audio');
    ok('有 <audio> 与曲目', bodyEl.querySelectorAll('audio').length === 1 && bodyEl.querySelectorAll('.win-track').length === 1);
    W.open('games');
    ok('kind = list', bodyEl.dataset.kind === 'list');
    ok('列出 2 件作品', bodyEl.querySelectorAll('.win-list-item').length === 2);

    section('  · 关闭：清理 + 释放 WebGL');
    W.close();
    ok('关闭是异步的（先播退场）', dialog.open === true);
    await sleep(320);
    ok('dialog.open = false', dialog.open === false);
    ok('body 类被摘掉', !doc.body.classList.contains('window-open'));
    ok('内容被清空（iframe 拔掉 → 释放 WebGL）', bodyEl.childNodes.length === 0, '还剩 ' + bodyEl.childNodes.length);
    ok('World.resume 被调用', resumed === 1);

    section('  · 事件委托 / 放大 / 遮罩 / ESC');
    const card = doc.createElement('div'); card.className = 'card'; card.setAttribute('data-work', 'fission');
    doc.body.append(card);
    card.fire('click', { target: card });
    await sleep(50);
    ok('点卡片能开浮窗（document 委托）', dialog.open === true && titleEl.textContent === 'Fission');

    W.open('art-draw'); await sleep(20);
    const fig = bodyEl.querySelectorAll('.win-shot')[0];
    fig.fire('click', { target: fig });
    const zoom = panel.querySelectorAll('.win-zoom')[0];
    ok('点图建出放大层并显示', !!zoom && zoom.hidden === false);
    zoom.fire('click', { target: zoom });
    ok('点放大层收回', zoom.hidden === true);

    scrim.fire('click', { target: scrim });
    await sleep(320);
    ok('点遮罩关闭', dialog.open === false);

    W.open('art-draw'); await sleep(20);
    dialog.fire('cancel');
    await sleep(320);
    ok('ESC 走自己的退场（不是瞬间消失）', dialog.open === false);

    section('  · View Transitions 分支');
    let vtCalls = 0;
    doc.startViewTransition = cb => { vtCalls++; cb(); return { finished: Promise.resolve() }; };
    W.open('art-draw');
    ok('打开走 startViewTransition', vtCalls === 1);
    ok('同步加 is-in（快照拿到终态）', dialog.classList.contains('is-in'));
    W.close();
    ok('关闭也走 startViewTransition', vtCalls === 2);
    ok('VT 路径下也真的关了且清理过', dialog.open === false && bodyEl.childNodes.length === 0);
    doc.startViewTransition = undefined;

    section('  · 降低动效分支（重新加载模块）');
    global.matchMedia = q => ({ media: q, matches: /reduced-motion/.test(q), addEventListener() {}, removeEventListener() {} });
    delete window.WorkWindow;
    eval(winSrcForTest);
    const WR = window.WorkWindow;
    WR.open('music');
    ok('reduced 下能打开', dialog.open === true && dialog.classList.contains('is-in'));
    WR.close();
    ok('reduced 下关闭是即时的（不等 240ms）', dialog.open === false && bodyEl.childNodes.length === 0);

    console.log('\n' + '='.repeat(52));
    console.log(fail ? '\u2718 ' + pass + ' passed, ' + fail + ' failed' : '\u2714 全部通过：' + pass + ' 项');
    process.exit(fail ? 1 : 0);
})();