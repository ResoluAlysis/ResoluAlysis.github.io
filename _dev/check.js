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
   ★ P93：抠出某个 function 的函数体（大括号配对）
   ------------------------------------------------------------
   原来这类断言写成 `/function stopGame\(\)[\s\S]{0,220}?xxx/` ——
   "从函数头往后数 220 个字里有没有这句"。P93 在 stopGame 开头插了
   "退全屏"那一段之后，四条老断言一起变假红 ✗（代码没坏，是断言太脆）。
   数距离本来就是在猜：这里改成**先抠出函数体、再在里面找** ——
   函数里以后插什么都不会误报，而"跑到隔壁函数里去找"这种事也不会再发生 ✓
   （输入必须已经过 codeOnly()：注释剥掉后大括号才配得准）。
   ============================================================ */
const fnBody = (src, name) => {
    const s = String(src);
    const at = s.indexOf('function ' + name + '(');
    if (at < 0) return '';
    const open = s.indexOf('{', at);
    if (open < 0) return '';
    let depth = 0;
    for (let i = open; i < s.length; i++) {
        if (s[i] === '{') depth++;
        else if (s[i] === '}') { depth--; if (depth === 0) return s.slice(open + 1, i); }
    }
    return '';
};

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

/* ============================================================
   [2a] style.css 的结构自洽（P59）
   ------------------------------------------------------------
   缘起：P59 排查"标题字号改了没反应"时，第一件要做的事就是
   **确认那条规则真的被浏览器读到了**。CSS 的失效方式是**静默**的：
     · 注释没闭合 → 后面整段被吞掉（规则消失得无声无息）
     · 花括号不配平 → 后面的规则被并进上一条，整块作废
     · 文件开头多个 BOM → 第一条规则失效
   这三件事都不会报错，只会"看起来没生效"。所以每个都钉一条。
   ============================================================ */
section('[2a] style.css 的结构自洽（P59）');
(function cssStructure() {
    const raw = css;
    /* ★ 注释配平 */
    const opens = (raw.match(/\/\*/g) || []).length;
    const closes = (raw.match(/\*\//g) || []).length;
    ok('★ 注释标记配平（/* = ' + opens + '，*/ = ' + closes + '）', opens === closes);

    /* ★★ 逐字符扫一遍（认字符串、认注释）：块必须正好配平，
       而且不能有"深度掉到负数"的多余右花括号。 */
    let i = 0, depth = 0, minDepth = 0, inComment = false, quote = null;
    while (i < raw.length) {
        const c = raw[i], n = raw[i + 1];
        if (inComment) { if (c === '*' && n === '/') { inComment = false; i += 2; continue; } i++; continue; }
        if (quote) { if (c === '\\') { i += 2; continue; } if (c === quote) quote = null; i++; continue; }
        if (c === '/' && n === '*') { inComment = true; i += 2; continue; }
        if (c === '"' || c === "'") { quote = c; i++; continue; }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth < minDepth) minDepth = depth; }
        i++;
    }
    ok('★★ 花括号配平且没有多余的 }（收尾深度 ' + depth + '，最低 ' + minDepth + '）',
        depth === 0 && minDepth === 0);

    /* ★★ 关键规则必须**没被注释吞掉**：拿几条"一定存在"的规则出来，
       数一下它们在 cssNC（已剥注释）里还在不在。 */
    const spot = ['.media-panel-title', '.media-panel-veil', '.media-panel-bg',
        '.crosshair-h', '.draft-frame', '#guide-layer'];
    const lost = spot.filter((s) => !cssNC.includes(s + ' {') && !cssNC.includes(s + ','));
    ok('★★ 关键规则都没被注释/坏括号吞掉（抽查 ' + spot.length + ' 条）',
        !lost.length, lost.join(', '));

    /* ★★★ 注释标记丢了也看不出来：配平检查只数数量，两端一起丢就照样"配平"。
       所以再加一条不变量：剥掉注释之后，**不该还留着一堆 ★** ——
       这个文件里 ★ 只出现在注释里，它要是活在 cssNC 里，
       就说明某段注释的两端标记丢了、正文变成了野声明。
       （P60 就撞上过一次：`.media-panel-title` 那条规则的注释标记不见了。） */
    ok('★★★ 注释标记没丢（剥掉注释后 cssNC 里不该还有 ★）',
        !/★/.test(cssNC), '★ 出现 ' + (cssNC.match(/★/g) || []).length + ' 次');

    /* ============================================================
       ★★★ 特异度陷阱：`.section h3`(0,1,1) 会压死 `.media-panel-title`(0,1,0)
       ------------------------------------------------------------
       P60 的真实 bug：面板标题的字号怎么改都没反应，
       因为 `.section h3` 比它**更特异** —— 特异度高的赢，跟文件顺序无关。
       把容器从 `h3` 换成 `div` 就好了，正是这个原因。
       下面这条守卫扫出**所有**"容器 + 裸元素"形式的选择器
       （例如 `.section h3`、`#media p`）：它们的特异度都 ≥ (0,1,1)，
       足以压过面板自己的单类规则，所以必须显式排除面板的类。
       ★ 只盯**面板里真的用到的标签**（从 index.html 现读，改标签时会自动跟上），
         不然 `.section h2` 这种八竿子打不着的也会被算进来。
       ============================================================ */
    const panelTags = [...new Set(
        [...html.matchAll(/<([a-z0-9]+)[^>]*class="media-panel[^"]*"/g)].map((m) => m[1].toLowerCase())
    )];
    const risky = [];
    (cssNC.match(/(^|\n)([^{}]+)\{/g) || []).forEach((r) => {
        const sel = r.replace(/[{\n]/g, ' ').trim();
        sel.split(',').forEach((one) => {
            const s = one.trim();
            /* 只看"提到 .section 或 #media，且最后一段是面板用到的裸元素"的选择器 */
            if (!/(\.section|#media)/.test(s)) return;
            if (!new RegExp('\\s(' + panelTags.join('|') + ')$').test(s)) return;
            if (/:not\(/.test(s)) return;                  /* 已经显式排除 */
            risky.push(s);
        });
    });
    ok('★★★ 没有"容器+裸元素"的规则会压面板文字（面板里用到 ' + panelTags.join('/') +
        '；这类选择器必须 :not(…) 排除过）', !risky.length, risky.join(' | '));
})();

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
    /* ★ P61：宽度仍然"随内容长"，但**一屏宽的最低线只留给 #home**。
       原来 `.section, .hero` 共用一条 `min-width: calc(100vw - nav)` ——
       等于每节至少占满一屏；现在分区改成最小 1000px（往上随内容），
       `#home` 照旧一屏宽。 */
    ok('宽度随内容长（max-content + 一屏的 min-width）',
        /width:\s*max-content/.test(secBlock) && /min-width:\s*calc\(100vw\s*-\s*var\(--nav-width\)\)/.test(secBlock));
    ok('★★ 分区的最小宽度改成固定 1000px（`#home` 排除在外）',
        /\.section:not\(#home\)\s*\{[^}]*min-width:\s*1000px/.test(cssNC));
    /* ★★ 首页必须**不受影响**：它是 `<section id="home" class="hero">` ——
       没有 `.section` 这个类，所以那条 `:not(#home)` 本来就够不着它；
       这里连"它到底带不带 .section"一起钉住，免得以后有人加类时把它算进去。 */
    ok('★★ 首页是 #home.hero（不带 .section），那条最小宽度够不着它',
        /id="home"[^>]*class="[^"]*hero/.test(html) &&
        !/id="home"[^>]*class="[^"]*\bsection\b/.test(html));
    /* ★★ 手机端必须把这条 1000px 复位 —— 而且**要带上同一个选择器**：
       `.section:not(#home)` (0,2,0) 比 `.section` (0,1,0) 更特异，
       只写 `.section { min-width: 0 }` 是压不过它的（P60 刚学的教训）。 */
    ok('★★ 手机端用同特异度的选择器把 1000px 复位掉（否则 390px 屏里出现 1000px 宽的分区）',
        /* ★ 跨注释的窗口要给足：cssNC 把注释换成**等长空格串**（P52 的教训），
           这里中间压着一段 P61 说明，200 个字符根本不够。 */
        /\.section,\s*\n\s*\.section:not\(#home\),\s*\n\s*\.hero\s*\{[\s\S]{0,1500}?min-width:\s*0/.test(cssNC));
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
   [2m] 面板文字挂在布局规格上（P56）
   ------------------------------------------------------------
   原来的毛病：`.media-panel-main` 靠 `justify-content: space-between`
   被钉在**面板底部**，而面板高度随视口/分区走 —— 一缩放窗口文字就上下跑。
   现在它绝对定位、上边贴 `--v-inset` 的下端，左右各 5vw，和面板自己的
   padding 同一个值（所以和编号左对齐）。
   ============================================================ */
section('[2m] 面板文字挂在布局规格上（P56）');
(function panelTextSpec() {
    const mainBlk = (cssNC.match(/\.media-panel-main\s*\{[\s\S]*?\n\}/) || [''])[0];

    /* ★★ 位置必须来自布局令牌 + 绝对定位，不能来自"流式排列贴面板底部"。
       ★★ 但**别去规定那个值长什么样**：P56 我写过 `top: var(--v-inset)`、
       P57 你改成 `bottom: var(--v-inset)`、P58 又变成
       `bottom: calc(var(--v-inset) - 10px)` —— 每次都把那两条断言顶红。
       所以现在只断言："用了令牌（或 0）"，算式随便写。 */
    ok('★★ 文字块绝对定位，位置由布局令牌给出（不再是流式贴底）',
        /position:\s*absolute/.test(mainBlk) &&
        /(top|bottom):[^;]*(var\(--(v-inset|panel-pad)|^\s*0)/.test(mainBlk));
    /* ★★ 左右都要有内缩，而且**两边表达式一致**（对称）。
       同样不规定单位/算式：`2vw`、`5vw`、`min(10vh, 25px)` 都行 ——
       只要求左右是同一个东西，不然文字块就偏了。 */
    ok('★★ 文字块左右内缩对称（两边表达式必须一模一样）',
        (function () {
            const l = /left:\s*([^;]+);/.exec(mainBlk);
            const r = /right:\s*([^;]+);/.exec(mainBlk);
            return !!l && !!r && l[1].trim() === r[1].trim() && l[1].trim() !== 'auto';
        })());
    /* ★★ 面板的左右 padding 也必须是 5vw：编号在流里、吃的是这个 padding，
       两边不一致的话"01"和标题的左边缘会明显错开。 */
    ok('★★ 面板左右内边距同为 5vw（编号与标题左对齐靠这一条）',
        /\.media-panel\s*\{[^}]*padding:\s*var\(--panel-pad\) 5vw/.test(cssNC));
    /* ★★★ 回归守卫：不许再用 space-between 把正文钉到底部 —— 那正是"文字会跑"。 */
    ok('★★★ 面板不再用 space-between（正文钉底部 = 缩放窗口时文字会跑）',
        !/\.media-panel\s*\{[^}]*justify-content:\s*space-between/.test(cssNC));
    /* ★ 两个**不同字号**的文字要有共同基线，才算"一同对齐"。 */
    ok('★ 标题与说明基线对齐（两个字号不同，用 baseline 才对得齐）',
        /align-items:\s*baseline/.test(mainBlk));
    /* ★ 说明顶到右侧：单行时它的右边缘正好落在 5vw 那条线上。 */
    ok('★ 说明靠 margin-left: auto 顶到右侧',
        /\.media-panel-desc\s*\{[^}]*margin-left:\s*auto/.test(cssNC));
    /* ★ 窄窗口时先让说明换行，别把标题挤变形 */
    ok('★ 窄窗口先让说明换行（标题 flex: 0 0 auto + 说明 min-width: 0）',
        /\.media-panel-title\s*\{[^}]*flex:\s*0 0 auto/.test(cssNC) &&
        /\.media-panel-desc\s*\{[^}]*min-width:\s*0/.test(cssNC));
    /* ★ 标题原来有 `margin: 0 0 0.55em`（给下面那行留白），同一行里不需要了 */
    ok('★ 标题不再留下方留白（同一行了）',
        /\.media-panel-title\s*\{\s*\n\s*flex:\s*0\s0\sauto;\s*\n\s*margin:\s*0;/.test(cssNC));

    /* ============================================================
       P58：面板宽度写死 + 标题字号跟宽度走
       ============================================================ */
    /* ★★ 面板宽度的**不变式**只有两条：
         ① 宽度走 `--panel-w` 这个令牌；
         ② 面板 `flex: 0 0 var(--panel-w)` —— 不收缩也不放大。
       ★ 令牌的**值**是会手调的：P58 我钉过"必须是 px"（当时是 700px），
         P59 你换成了 `clamp(240px, 20vw, 400px)` → 断言假红。
         同一个毛病这个文件里已经犯过好几次了，这次只钉上面两条。 */
    ok('★★ 面板宽度走 --panel-w 令牌，且面板不参与伸缩（flex: 0 0）',
        /--panel-w:\s*[^;]+;/.test(cssNC) &&
        /\.media-panel\s*\{[^}]*flex:\s*0 0 var\(--panel-w\)/.test(cssNC));
    /* ★★ 区间 + 首选值都要在，而且下限/上限是 px、首选是 vw（"跟宽度走"）。
       断言的是**结构**（谁跟谁走），具体数字只打印出来 —— P34 的教训：
       钉死可调的数，代价是每次调参都要回来改自检。 */
    const fsTitle = /\.media-panel-title\s*\{[^}]*font-size:\s*clamp\(([\d.]+)px,\s*([\d.]+)vw,\s*([\d.]+)px\)/.exec(cssNC);
    ok('★★ 标题字号 = clamp(px 下限, vw 首选, px 上限)（跟视口**宽度**走）', !!fsTitle);
    if (fsTitle) {
        const lo = +fsTitle[1], mid = +fsTitle[2], hi = +fsTitle[3];
        ok('★ 字号区间自洽：下限 ' + lo + 'px < 上限 ' + hi + 'px，首选 ' + mid +
            'vw（' + (lo / (mid / 100)).toFixed(0) + 'px 宽时到下限、' +
            (hi / (mid / 100)).toFixed(0) + 'px 宽时到上限）',
            lo > 0 && hi > lo && mid > 0);
    }

    /* ============================================================
       P57："文字在安全区范围内" —— 靠的是**别重复扣 insets**
       ------------------------------------------------------------
       分区 padding = `--v-inset … --safe-b`，面板正好铺在这个内容盒里，
       所以**面板自己的上下边就是安全区那两条线**：
         面板顶边 = 视口顶往下 --v-inset；面板底边 = 视口底往上 --safe-b。
       在面板**里面**再写一次这些页面级令牌，就是把同一条线量两遍。
       ============================================================ */
    ok('★★ 面板内不再重复使用页面级安全区令牌（--safe-b / --content-x）',
        !/--safe-b/.test(mainBlk) && !/--content-x/.test(mainBlk));
    /* ★★ 必须有一个"兜住"的上界：块往上长，最多长到面板顶边（= 安全区上沿），
       再长就被面板的 overflow: hidden 切掉了。 */
    ok('★★ 文字块有上界（max-height 或 top），长不到面板顶边以外',
        /max-height:\s*calc\(100% - /.test(mainBlk) || /top:\s*(0|var\(--panel-pad)/.test(mainBlk));
    /* ★ 块必须锚在面板内：要么 top 要么 bottom 有一个（两个都写就等于定了高度，
       文字只剩"块内对齐"这一条路）。 */
    ok('★ 文字块锚在面板内（top 或 bottom 有一个）',
        /\btop:/.test(mainBlk) || /\bbottom:/.test(mainBlk));
})();

/* ============================================================
   [2n] 拼接方块拆成独立的"装饰"容器（P62）
   ------------------------------------------------------------
   原来方块是注入到 #skills / #projects / #contact 里的 ——
   装饰和内容焊在一起，想挪装饰就得动内容。
   现在拆成三个 `.deco[data-deco=…]`，方块注入到它们身上。
   ★ 这一节钉的是"拆干净了"：内容分区不再被注入、颜色不再由 JS 写 inline。
   ============================================================ */
section('[2n] 拼接方块拆成独立装饰容器（P62）');
(function decoMosaic() {
    const jsMosaic = codeOnly(read('js/mosaic.js'));

    /* ★★ 装饰不再挂在内容分区上（这条是本次重构的核心不变式） */
    ok('★★ 方块不再注入内容分区（CONFIG 里不许再出现 #skills / #projects / #contact）',
        !/selector:\s*'#(skills|projects|contact)'/.test(jsMosaic) &&
        /selector:\s*'\.deco\[data-deco="skills"\]'/.test(jsMosaic) &&
        /selector:\s*'\.deco\[data-deco="projects"\]'/.test(jsMosaic) &&
        /selector:\s*'\.deco\[data-deco="contact"\]'/.test(jsMosaic));

    /* ★★ 颜色必须由 CSS 决定 —— JS 一旦传 color / tileColor，就会写成
       inline style 挂在 layer 上，把容器的 CSS 变量盖掉，颜色就只能在 JS 里改。 */
    ok('★★ 颜色不由 JS 传（opts 里没有 color / tileColor，CSS 才管得住）',
        !/color:\s*'/.test(jsMosaic) && !/tileColor:/.test(jsMosaic) &&
        /* 工厂本身仍然支持这两个选项（以后想按实例覆盖还能用） */
        /cfg\.color/.test(jsMosaic) && /cfg\.tileColor/.test(jsMosaic));

    /* ★ 三个容器真的在 index.html 里，而且在 main 里面 */
    const nDeco = (html.match(/<section class="deco" data-deco="/g) || []).length;
    ok('★ 三个装饰容器都在 index.html（' + nDeco + ' 个）', nDeco === 3);
    /* ★ P63：这条原来钉的是"排在 main 末尾"（P62 的临时位置）。
       你已经把它们挪到各自那一节旁边了 —— 位置本来就是你要自己排的，
       自检不该钉住它。现在只钉"三个都在 main 里面"这条结构不变式。 */
    const iDeco = html.indexOf('data-deco="skills"');
    ok('★ 三个装饰容器都在 <main> 里面（位置随你排，自检不钉顺序）',
        iDeco > html.indexOf('<main>') && iDeco < html.lastIndexOf('</main>') &&
        html.indexOf('data-deco="projects"') < html.lastIndexOf('</main>') &&
        html.indexOf('data-deco="contact"') < html.lastIndexOf('</main>'));

    /* ★★ 四样可调的东西都在 .deco 那条规则里：
       宽度（默认 1000px）、底色、实色带色、方块色。 */
    const decoBlk = (cssNC.match(/\.deco\s*\{[\s\S]*?\n\}/) || [''])[0];
    ok('★★ .deco 四样可调：宽度（默认 1000px）/ 底色 / --mosaic-color / --mosaic-tile-color',
        /--deco-w:\s*1000px/.test(decoBlk) &&
        /width:\s*var\(--deco-w\)/.test(decoBlk) &&
        /--mosaic-color:/ .test(decoBlk) &&
        /--mosaic-tile-color:/.test(decoBlk));
    /* ★ P63：底色从 .deco 基类挪到了**实例规则**里（skills 故意不写 —— 它要露
       body 色；projects / contact 各自写 background: var(--bg-alt)）。
       所以这里改成钉"想显底色的那两实例确实声明了"，基类不再要求。 */
    const decoInst = (dataDeco) =>
        (new RegExp('\\.deco\\[data-deco="' + dataDeco + '"\\]\\s*\\{[^}]*\\}').exec(cssNC) || [''])[0];
    ok('★ 实例各自声明底色（projects / contact 有 background: var(…)，skills 故意没有 → 露 body 色）',
        /background:\s*var\(/.test(decoInst('projects')) &&
        /background:\s*var\(/.test(decoInst('contact')) &&
        !/background:/.test(decoInst('skills')));
    /* ★ 必须是定位祖先（.mosaic-layer 是 absolute + inset:0），而且不吃鼠标 */
    ok('★ .deco 是定位祖先 + 不吃鼠标（装饰层不该拦住准星的命中测试）',
        /position:\s*relative/.test(decoBlk) && /pointer-events:\s*none/.test(decoBlk));
    /* ★★ 手机端宽度要跟着屏幕走：1000px 的装饰块在 390px 的屏里必然横向溢出 */
    ok('★★ 手机端 --deco-w 改成 100%（1000px 装饰块在手机上是横向溢出）',
        /@media \(max-width: 768px\)[\s\S]{0,400}?\.deco\s*\{[^}]*--deco-w:\s*100%/.test(cssNC));
})();

/* ============================================================
   2o. 侧边栏：推开式游乐区（P63）
   ------------------------------------------------------------
   这一节钉的是一条**等式**和一条**禁令**：
     · `--sidebar-w = 100vw - --nav-width` —— "展开后屏幕上只剩导航栏
       与页脚贴在右侧边缘"就是这一条算出来的，改了它就改了全部几何；
     · 推开必须用 left / margin-left，**不许**出现 transform ——
       .page-zoom 上那份开屏 transform 会因此变成所有 position: fixed
       子元素的包含块，整套 HUD（尺子 / 参考线 / 准星）静默错位。
   其余（时长、层级、舞台长什么样）都只钉不变式，不钉具体数值。
   ============================================================ */
section('[2o] 侧边栏：推开式游乐区（P63）');
(function playSidebar() {
    const jsSide = codeOnly(read('js/sidebar.js'));

    /* --- 结构：和浮窗同一层（body 直接子元素） --- */
    ok('★ <aside id="play-sidebar"> 在，且是 body 直接子元素那一层（避开 .page-zoom 的 transform）',
        /<aside[^>]*id="play-sidebar"/.test(html) &&
        html.indexOf('id="play-sidebar"') > html.indexOf('</dialog>') &&
        html.indexOf('id="play-sidebar"') > html.lastIndexOf('</main>') &&
        html.indexOf('id="play-sidebar"') < html.indexOf('</body>'));
    ok('★ 开关在首页 hero 里（data-play="open" + aria-controls 指向侧边栏）',
        /<button[^>]*data-play="open"[^>]*aria-controls="play-sidebar"/.test(html));
    ok('★ 脚本排在 <aside> 之后（就地查元素，排前面会静静地不启用）',
        html.indexOf('src="js/sidebar.js"') > html.indexOf('id="play-sidebar"'));

    /* --- 几何：一条等式决定"导航栏与页脚贴右缘" --- */
    ok('★★ --sidebar-w = calc(100vw - var(--nav-width))（右侧那一条的宽度就来自这条）',
        /--sidebar-w:\s*calc\(100vw - var\(--nav-width\)\)/.test(cssNC));
    ok('★★ 导航栏与页脚用**同一个 left** 左移（所以页脚永远在导航栏正下方）',
        /body\.sidebar-open \.navbar,\s*body\.sidebar-open \.footer\s*\{[^}]*left:\s*var\(--sidebar-w\)/.test(cssNC));
    ok('★★ main 的 margin-left 推到 100vw（是整个推出视野，不是变窄）',
        /body\.sidebar-open main\s*\{[^}]*margin-left:\s*100vw/.test(cssNC));
    ok('★★ 推开只关在桌面（手机上导航栏是顶部 sticky 横条，推出去就回不来了）',
        /@media \(min-width: 769px\)\s*\{[\s\S]{0,1500}?body\.sidebar-open main\s*\{[\s\S]{0,200}?margin-left:\s*100vw/.test(cssNC));

    /* --- ★★ 禁令只针对"推开整站"那几条：它们必须走布局属性 ---
       （侧边栏**自己**那一条用 transform 平移，是另一回事：
        它身上没有 position: fixed 的后代，也不承担 HUD 的定位锚点 ——
        理由与配套写在 [2q]） */
    const pushRules = [...cssNC.matchAll(/body\.sidebar-open (?:\.navbar|\.footer|main|\.hero-underline)[^{}]*\{[^}]*\}/g)].map((m) => m[0]);
    const pushTf = pushRules.filter((r) => /transform|translate/.test(r));
    ok('★★ 推开整站走的是 left / margin-left，一条 transform 都没有（' + pushRules.length + ' 条）',
        pushRules.length >= 3 && !pushTf.length,
        pushTf.length ? '这几条里有 transform：' + pushTf.join(' | ') : '');

    /* --- 层级：P65 起它铺在 0 层（你指定的）---
       配套是"刻度尺必须离屏"，那条因果钉在 [2q]；这一节只管"它确实是 0"。 */
    const sideBlk = (cssNC.match(/\.play-sidebar\s*\{[\s\S]*?\n\}/) || [''])[0];
    const myZ = +((/(?:^|\s)z-index:\s*(\d+)/.exec(sideBlk) || [])[1] || 0);
    ok('★★ 侧边栏在 0 层（不再压过全站：它是一块铺在最底下的场地）', myZ === 0);

    /* --- 打开期间：光标交还系统 + 藏准星（和 body.window-open 同一套做法） --- */
    ok('★ 打开期间把系统光标还回来（全站 cursor: none，游乐区里得能指东西）',
        /body\.sidebar-open,\s*body\.sidebar-open \*\s*\{[^}]*cursor:\s*auto\s*!important/.test(cssNC));
    ok('★ 打开期间藏掉自定义准星与圆点',
        /body\.sidebar-open \.crosshair-h[\s\S]{0,240}?\.cursor-dot\s*\{[^}]*opacity:\s*0\s*!important/.test(cssNC));

    /* --- JS：只挂类、时长归 CSS --- */
    ok('★ 有 ENABLED 总开关（和 draft-layer / home-underline / 浮窗一个套路）',
        /const ENABLED = true;/.test(jsSide));
    ok('★ 开关只干一件事：给 body 挂 / 摘 .sidebar-open',
        /classList\.add\('sidebar-open'\)/.test(jsSide) && /classList\.remove\('sidebar-open'\)/.test(jsSide));
    ok('★ 打开期间暂停 World、关闭时恢复（里面要跑游戏，背景不用白烧 rAF）',
        /World\.pause\(\)/.test(jsSide) && /World\.resume\(\)/.test(jsSide));
    ok('★ Esc 能关', /'Escape'/.test(jsSide));
    ok('★ 焦点归还带 preventScroll（否则会顺手挪掉 main 的横向滚动位置）',
        /focus\(\{\s*preventScroll:\s*true\s*\}\)/.test(jsSide));
    ok('★ 侧边栏自己的动效时长 / 曲线全在 CSS（JS 里不为面板和悬停回执掐表）',
        !/\d+\s*ms/.test(jsSide) &&
        /* ★ P86：JS 里现在**有**一个表 —— 那是"游戏发来的回执"的计时器，
           时长是游戏运行时给的，写不进 CSS。这条管的是面板与悬停回执那一套。 */
        !/setTimeout\((hideGameToast|showGameToast|placeToast)/.test(jsSide));
})();

/* ============================================================
   2p. 游乐区：卡带栏 + 导航栏同款玻璃（P64）
   ------------------------------------------------------------
   这一节钉的是两件"必须一模一样"的事 —— 它们靠肉眼比对最容易漏：
     · 侧边栏的**玻璃**（底色 + 两层 backdrop-filter）和 .navbar 逐条相同；
     · **卡带栏与导航栏同宽、同内边距** —— 宽度决定"镜像"，
       内边距决定第一张卡带的顶端和 logo 落在同一条水平线上。
   所以这里不钉具体数值，而是把两条规则一起抽出来**逐条对比**：
   以后调导航栏的玻璃或内边距，只改一边就会红。
   ============================================================ */
section('[2p] 游乐区：卡带栏 + 同款玻璃（P64）');
(function playRail() {
    const jsSide = codeOnly(read('js/sidebar.js'));

    /* 抽一条规则的声明块（取文件里**第一处**匹配，正好是基类那条） */
    const firstRule = (sel) => (new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}')
        .exec(cssNC) || [])[1] || '';
    const decl = (blk, prop) =>
        ((new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)').exec(blk) || [])[1] || '').trim();

    const navBlk = firstRule('.navbar');
    const sideBlk = firstRule('.play-sidebar');
    const railBlk = firstRule('.play-rail');
    const mainBlk = firstRule('.play-main');
    const nameBlk = firstRule('.play-cart-name');

    /* --- ★★ 底色 / 透明度逐字一致 —— P72 起**下放到两列** ---
       P64 时这条比的是 .play-sidebar。P72 查出一件事：box-shadow 画在元素
       **自己的背景后面** —— 卡带栏没有背景，它内侧那半圈光晕就不会被压暗，
       于是和导航栏差一档（≈#E13232 vs ≈#681919）。所以底色挪到
       .play-rail / .play-main 各铺一次，侧边栏自己不再画
       （半透明叠两层会 ≈0.80 黑，比导航栏明显更暗）。 */
    const bgNorm = (s) => String(s).replace(/\s+/g, ' ').trim();
    const GLASS = ['background', 'backdrop-filter', '-webkit-backdrop-filter'];
    const navGlass = GLASS.map((p) => decl(navBlk, p));
    const navBg = navGlass[0];
    ok('★★ 卡带栏 / 舞台的底色与导航栏逐字相同（' + bgNorm(navBg) + '）',
        !!navBg && bgNorm(decl(railBlk, 'background')) === bgNorm(navBg) &&
        bgNorm(decl(mainBlk, 'background')) === bgNorm(navBg),
        '卡带栏：' + decl(railBlk, 'background') + ' | 舞台：' + decl(mainBlk, 'background'));
    ok('★★ 侧边栏自己**不画**底色（画了就叠成两层、比导航栏暗一档）',
        !/background\s*:/.test(sideBlk));

    /* --- 模糊：两边都写就必须一样 ---
       ★ P66 起侧边栏**故意不写**这一层：它是全屏的、而且靠 left 滑进来，
         每帧重采一次 100vw 的 backdrop 太贵（导航栏只有 75px，那层留着）。
         这不是漂移，是取舍 —— 但一旦它写了，就必须和导航栏对得上。 */
    const blurPairs = [1, 2].map((i) => [navGlass[i], decl(sideBlk, GLASS[i])]);
    ok('★ 模糊两边都写时必须一致（侧边栏允许省掉这层：全屏 backdrop-filter 太贵）',
        blurPairs.every((pair) => !pair[1] || pair[0] === pair[1]),
        blurPairs.map((pair) => pair[0] + '  vs  ' + pair[1]).join(' | '));

    /* --- ★★ P70：卡带栏的边框 / 光晕是导航栏的镜像 ---
       0 0 的两层外阴影往两侧都散：导航栏在屏幕最右（往左落在游乐区右缘），
       卡带栏在游乐区最左（往右落在舞台上）。数值必须逐字一致，
       所以这里归一化空白后整串比对（改一边没改另一边会红）。 */
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    ok('★★ 卡带栏挂着和导航栏**逐字相同**的两层外阴影（' + norm(decl(navBlk, 'box-shadow')) + '）',
        !!decl(navBlk, 'box-shadow') &&
        norm(decl(navBlk, 'box-shadow')) === norm(decl(railBlk, 'box-shadow')),
        '卡带栏：' + norm(decl(railBlk, 'box-shadow')));
    ok('★★ 呼吸光带也是镜像的：导航栏在右缘（::after right: 0）、卡带栏在左缘（::after left: 0）',
        /\.navbar::after\s*\{[^}]*right:\s*0/.test(cssNC) &&
        /\.play-rail::after\s*\{[^}]*left:\s*0/.test(cssNC) &&
        /@keyframes play-railGlow/.test(cssNC));
    ok('★ 卡带栏是定位元素（那条 ::after 才不会跑到 .play-sidebar 上去定位）',
        /position:\s*relative/.test(railBlk));

    /* --- ★★ P72：两条接缝的三种配料必须逐字相同 ---
       接缝 = 底色 + 1px 边框 + 两层阴影。底色和阴影上面已经逐字比过了，
       这里把边框补齐：导航栏右缘那条 = 卡带栏左右两条 = `1px solid var(--border)`。
       三种配料相同 → 两侧的像素只可能同一个算法算出来
       （框外亮 = 光晕落在邻居背景之上；框内暗 = 被自己那层 0.55 压暗）。 */
    ok('★★ 接缝的边框也一致（导航栏右缘那条 = 卡带栏两条 = 1px solid var(--border)）',
        !!decl(navBlk, 'border-right') &&
        decl(railBlk, 'border-right') === decl(navBlk, 'border-right') &&
        decl(railBlk, 'border-left') === decl(navBlk, 'border-right'));

    /* --- ★★ P71：两条接缝都要有"硬 1px 亮线 + 光晕" ---
       box-shadow 画在元素边框后面，所以：
         · 卡带栏右侧靠它自己的 border-right 得到那条硬线；
         · 导航栏左缘本来没有边框，而游乐区那条 border-right 会被光晕盖掉 ——
           于是展开时要给导航栏补一条 border-left，两侧才对称。 */
    ok('★★ 展开时导航栏左缘补了 1px 亮线（接缝才和卡带栏右侧一样有硬边）',
        /body\.sidebar-open \.navbar\s*\{[^}]*border-left:\s*1px solid var\(--border\)/.test(cssNC));
    ok('★ 这条只加在展开态、不进基类（关着的时候它左缘就是屏幕左缘，不需要）',
        !/^\.navbar\s*\{[\s\S]{0,400}?border-left:/m.test(cssNC));

    /* --- ★★ 同宽 + 同内边距（镜像 + 同一条顶部对齐线） --- */
    ok('★★ 卡带栏与导航栏同宽（width 引的是同一个变量：' + decl(navBlk, 'width') + '）',
        !!decl(navBlk, 'width') && decl(railBlk, 'width') === decl(navBlk, 'width') &&
        /flex:\s*0 0 var\(--nav-width\)/.test(railBlk));
    ok('★★ 卡带栏的内边距和导航栏一模一样（第一张卡带的顶端因此和 logo 同一条线）',
        !!decl(navBlk, 'padding') && decl(railBlk, 'padding') === decl(navBlk, 'padding'));
    ok('★ 舞台那一列也用同一条顶部对齐线（--v-inset + --nudge-logo）',
        /padding:\s*calc\(var\(--v-inset\) \+ var\(--nudge-logo\)\)/.test(mainBlk));

    /* --- 两列结构 --- */
    ok('★ 侧边栏是横向两列（左卡带栏 / 右舞台），HTML 里也是这个顺序',
        /flex-direction:\s*row/.test(sideBlk) &&
        html.indexOf('class="play-rail"') > html.indexOf('id="play-sidebar"') &&
        html.indexOf('class="play-rail"') < html.indexOf('class="play-main"'));

    /* --- ★★ 卡带是数据生成的，不写死在 HTML 里 --- */
    ok('★★ 卡带不写死在 HTML（.play-carts 是空 ul，由 JS 按 works.js 生成）',
        /<ul class="play-carts" data-play="carts"><\/ul>/.test(html));
    ok('★★ 只认 data/works.js 里 kind === "unity" 的条目（唯一数据源）',
        /window\.WORKS \|\| \[\]/.test(jsSide) && /kind === 'unity'/.test(jsSide) &&
        /* ★ P97：生成时把序号也传进去（第几张 → 错开"冒出来"的先后） */
        /cartsEl\.appendChild\(makeCart\(w, i\)\)/.test(jsSide));

    /* --- 竖排的名字 --- */
    ok('★ 卡带名字竖排（75px 里横排 "Boom Shooting" 必溢出；站里 .df-v 已有先例）',
        /writing-mode:\s*vertical-rl/.test(nameBlk) && /white-space:\s*nowrap/.test(nameBlk));

    /* --- 选中态走 aria，不另起类 --- */
    ok('★ 选中态用 [aria-pressed="true"]（JS 写 aria、CSS 认 aria，不另起"选中"类名）',
        /\.play-cart\[aria-pressed="true"\]/.test(cssNC) &&
        /setAttribute\('aria-pressed'/.test(jsSide) &&
        /* ★ P86：原来这条把整个文件里的 `is-on` 也一并禁了；现在 `.play-msg.is-on`
           是**可见性**状态（回执淡入），不是选中态 —— 规则收回到它本来管的"选中态"。 */
        !/is-active|is-selected/.test(codeOnly(read('js/sidebar.js'))));

    /* --- ★★ P94：卡带底色不透明 + 图标层 ---
       背景：原来 `background: transparent` —— 面板那条模糊底会透过来，而且浅色主题下
       --text 是近黑、`--navbar-bg` 还是暗的，透过去那片字根本读不清 ✗。
       现在底色是**不透明**的 `--bg-alt`（跟着主题走：暗 #191919 / 浅 #e5e5e5），
       正好和卡带里的字（--text / --text-muted）配成"深底浅字 / 浅底深字"✓。 */
    const cartBlk = firstRule('.play-cart');
    ok('★★ P94：卡带底色是不透明的 --bg-alt（不再是 transparent）',
        /background-color:\s*var\(--bg-alt\)/.test(cartBlk) &&
        !/background(-color)?:\s*transparent/.test(cartBlk),
        decl(cartBlk, 'background-color'));
    ok('★★ P94/P103：红只**叠一层** ::after（换背景就又变半透明了 ✗），而且现在**只有悬停**有它——'
        + '选中态那层淡红已经撤掉（改由 .play-cart-frame 那个方框表达 ✓）',
        /\.play-cart::after\s*\{[^}]*z-index:\s*2/.test(cssNC) &&
        /\.play-cart::after\s*\{[^}]*pointer-events:\s*none/.test(cssNC) &&
        /\.play-cart:hover::after\s*\{\s*opacity:\s*0?\.65/.test(cssNC) &&
        !/\[aria-pressed="true"\]::after/.test(cssNC) &&
        /* 老的半透明底不许回潮（那两个状态里只能有 color / border-color） */
        !/\.play-cart:hover\s*\{[^}]*background/.test(cssNC) &&
        !/\.play-cart\[aria-pressed="true"\]\s*\{[^}]*background/.test(cssNC));
    const iconBlk = firstRule('.play-cart-icon');
    ok('★★ P94：图标层铺满上下边界（inset + 100%/100% + object-fit: cover）、80% 透明度、不吃指针事件',
        /inset:\s*0/.test(iconBlk) && /width:\s*100%/.test(iconBlk) && /height:\s*100%/.test(iconBlk) &&
        /object-fit:\s*cover/.test(iconBlk) && /opacity:\s*0?\.8/.test(iconBlk) &&
        /z-index:\s*0/.test(iconBlk) && /pointer-events:\s*none/.test(iconBlk),
        iconBlk.replace(/\s+/g, ' ').trim());
    ok('★ P94：图标会被卡带的圆角裁掉（overflow: hidden），编号/名字抬到 z-index 1 压在它上面',
        /overflow:\s*hidden/.test(cartBlk) &&
        /\.play-cart-no,\s*\n\.play-cart-name\s*\{[^}]*z-index:\s*1/.test(cssNC));

    /* --- ★★ P94：图标这条路在 JS 里怎么走（works.js 的 icon 字段） --- */
    const cartBody = fnBody(jsSide, 'makeCart');
    ok('★★ P94：只有 icon 是非空字符串才建 <img>（没写 / 空串 → 纯色卡带）',
        /const iconPath = \(typeof w\.icon === ['"]string['"]\) \? w\.icon : ['"]['"];/.test(cartBody) &&
        /if \(iconPath\) \{/.test(cartBody));
    ok('★★ P94：加载失败（文件不存在）就把 <img> 摘掉 → 退回纯色（浏览器只有这条路判存在性）',
        /icon\.addEventListener\(['"]error['"], function \(\) \{[\s\S]{0,90}?icon\.remove\(\);/.test(cartBody));
    ok('★ P94：图标是装饰：空 alt + draggable=false + class="play-cart-icon"',
        /icon\.setAttribute\(['"]alt['"], ['"]['"]\)/.test(cartBody) &&
        /icon\.setAttribute\(['"]draggable['"], ['"]false['"]\)/.test(cartBody) &&
        /icon\.className = ['"]play-cart-icon['"];/.test(cartBody));
    ok('★ P94：图标在 DOM 里排在编号 / 名字**之前**（外加 CSS 的 z-index，两层保险）',
        cartBody.indexOf('btn.appendChild(icon)') !== -1 &&
        cartBody.indexOf('btn.appendChild(icon)') < cartBody.indexOf('btn.appendChild(no)'));
    ok('★ P94：works.js 每条 unity 都预留了 icon 字段（字符串），文件头也写了规矩',
        /* ★ 数条目要走 codeOnly —— 文件头那段说明里"kind: 'unity'"出现了 4 次，
           直接对原文数会数出 9 条 unity（5 条真条目 + 4 处注释）✗；
           而"文件头有没有写规矩"这条**故意**查原文（那是注释里的字）✓ */
        /卡带图标（icon）/.test(worksSrc) &&
        (codeOnly(worksSrc).match(/^\s*icon:\s*(['"])[^'"]*\1,/gm) || []).length ===
        (codeOnly(worksSrc).match(/kind:\s*(['"])unity\1/g) || []).length,
        (codeOnly(worksSrc).match(/^\s*icon:/gm) || []).length + ' 处 icon / ' +
        (codeOnly(worksSrc).match(/kind:\s*(['"])unity\1/g) || []).length + ' 条 unity');

    /* --- ★★ P97：卡带的登场（面板滑到位 → 逐个冒出来）--- */
    ok('★★ P97：藏起来的选择器**限定在卡带栏内部**（.play-carts .play-cart）—— '
        + '写成全体 .play-cart 会把"浮起那张影子"（body 上的克隆）也藏掉，等于拖空气 ✗',
        /\.play-carts \.play-cart\s*\{[^}]*opacity:\s*0/.test(cssNC) &&
        !/(^|\})\s*\.play-cart\s*\{[^}]*opacity:\s*0/m.test(cssNC));
    ok('★ P97：藏着的时候不只是透明（visibility: hidden）—— 那 450ms 里点不到、也 Tab 不到',
        /\.play-carts \.play-cart\s*\{[^}]*visibility:\s*hidden/.test(cssNC) &&
        /\.play-carts\.is-in \.play-cart\s*\{[^}]*visibility:\s*visible/.test(cssNC));
    const popBlk = (cssNC.match(/\.play-carts\.is-in \.play-cart\s*\{[^}]*\}/) || [''])[0];
    ok('★★ P97：is-in 一到就演 cartPop，逐张错开（--cart-i × 90ms），而且 fill-mode: both'
        + '（没轮到自己时保持藏着 → 才是"一个接一个冒"）',
        /animation:\s*cartPop\s+\d+ms/.test(popBlk) &&
        /animation-delay:\s*calc\(var\(--cart-i/.test(popBlk) &&
        /both/.test(popBlk), popBlk.replace(/\s+/g, ' ').trim());
    const popKf = (cssNC.match(/@keyframes cartPop\s*\{[\s\S]*?\n\}/) || [''])[0];
    ok('★★ P97：三拍就是你描述的那套 —— 0% 透明且更小 → 55% 放大超过原样 → 100% 落回原样',
        /0%[^}]*opacity:\s*0/.test(popKf) && /0%[^}]*scale\(0?\.\d+\)/.test(popKf) &&
        /55%[^}]*scale\(1\.\d+\)/.test(popKf) && /100%[^}]*scale\(1\)/.test(popKf),
        popKf.replace(/\s+/g, ' ').trim().slice(0, 120));
    ok('★ P97：降低动效时不演 —— 但**也要看得见**（只写 animation: none 会永远 opacity: 0 ✗）',
        /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,400}?\.play-carts \.play-cart\s*\{[^}]*opacity:\s*1[^}]*visibility:\s*visible/.test(cssNC) &&
        /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,400}?\.play-carts\.is-in \.play-cart\s*\{\s*animation:\s*none/.test(cssNC));

    /* JS 那一半 */
    const cssDur = (cssNC.match(/--sidebar-dur:\s*(\d+)ms/) || [])[1];
    ok('★★ P97：JS 的 SLIDE_MS 与 CSS 的 --sidebar-dur 一致（' + cssDur + 'ms）—— 改一边忘另一边就会顿一下 ✗',
        !!cssDur && new RegExp('const SLIDE_MS = ' + cssDur + ';').test(jsSide),
        'CSS=' + cssDur + 'ms / JS=' + (/const SLIDE_MS = (\d+);/.exec(jsSide) || [])[1]);
    ok('★★ P97/P98：等面板的 left 过渡跑完才启动过场（**只认 left** —— 面板上还挂着 visibility 那条），'
        + '有定时器兜底；降低动效则整套过场不演、卡带直接可见',
        /aside\.addEventListener\('transitionend', revealEnd\)/.test(jsSide) &&
        /e\.propertyName !== 'left'/.test(jsSide) &&
        /setTimeout\(function \(\) \{ revealEnd = null; intro\(\); \}, SLIDE_MS \+ 80\)/.test(jsSide) &&
        /if \(reduce \|\| !aside\.addEventListener \|\| !railTitle\) \{ cartsEl\.classList\.add\('is-in'\); return; \}/.test(jsSide));
    ok('★★ P97：开门复位时摘掉 is-in（下一轮又是空栏 → 再冒一次）；关门只取消"待演"、**不**摘 is-in'
        + '（卡带要跟着面板一起滑走，不能在滑走途中冒出来 ✗）',
        fnBody(jsSide, 'resetStage').indexOf("cartsEl.classList.remove('is-in');") !== -1 &&
        fnBody(jsSide, 'close').indexOf('cancelReveal();') !== -1 &&
        !/function close\(\)[\s\S]*?remove\('is-in'\)[\s\S]*?exitGame/.test(jsSide));
    ok('★ P97：每张卡带把自己的序号写进 --cart-i（逐张错开靠它）',
        /setProperty\('--cart-i', String\(i \|\| 0\)\)/.test(jsSide) &&
        /cartsEl\.appendChild\(makeCart\(w, i\)\)/.test(jsSide));

    /* --- ★★ P103：选中框（跟着当前选中的卡带走的一个方框）--- */
    const frameCss = (cssNC.match(/\.play-cart-frame\s*\{[^}]*\}/) || [''])[0];
    ok('★★ P103：选中框是 `.play-carts` 的**兄弟**（塞进 ul 里既不合 HTML、又会变成 flex 项'
        + '把卡带挤开 ✗），而且是 aria-hidden 的装饰',
        /<span class="play-cart-frame" data-play="cart-frame" aria-hidden="true"><\/span>/.test(html) &&
        html.indexOf('class="play-cart-frame"') > html.indexOf('class="play-carts"') &&
        html.indexOf('data-play="carts"></ul>') < html.indexOf('class="play-cart-frame"'),
        'frame 在 ' + html.indexOf('class="play-cart-frame"') + ' / ul 在 ' +
        html.indexOf('class="play-carts"'));
    ok('★★ P103：颜色单开了一个变量 `--cart-frame`（你改这一处就行 —— 值是什么由你定 ✓）',
        /--cart-frame:\s*\S/.test(cssNC) &&
        /border:\s*1px solid var\(--cart-frame/.test(frameCss),
        (cssNC.match(/--cart-frame:[^;]*/) || [''])[0]);
    ok('★★ P103：框架行为 —— 绝对定位铺在卡带上方（z-index 4）、默认隐藏、不吃鼠标、'
        + '圆角比卡带多 1px（同心）',
        /position:\s*absolute/.test(frameCss) && /z-index:\s*4/.test(frameCss) &&
        /opacity:\s*0/.test(frameCss) && /visibility:\s*hidden/.test(frameCss) &&
        /pointer-events:\s*none/.test(frameCss) &&
        /border-radius:\s*7px/.test(frameCss) && /border-radius:\s*6px/.test(cssNC));
    ok('★★ P103：平移的缓动是 **ease-in-out**（先慢后快再慢 ✓），只动 transform；'
        + '第一次出现用 is-placing 关掉过渡（直接摆到位，不然会从轨道左上角滑过来 ✗）',
        /transition:\s*transform\s+\d+ms\s+ease-in-out/.test(frameCss) &&
        /\.play-cart-frame\.is-placing\s*\{\s*transition:\s*none/.test(cssNC) &&
        /\.play-cart-frame\.is-on\s*\{[^}]*animation:\s*cartFrameIn/.test(cssNC) &&
        /@keyframes cartFrameIn\s*\{[\s\S]{0,400}?100%\s*\{\s*\n\s*opacity:\s*1/.test(cssNC));
    ok('★★ P103：JS 那边 —— 位置按卡带的 offset 算（比外轮廓大 1px：位置 -1、宽高 +2）；'
        + '已经在了就只改 transform（让 CSS 演平移 ✓）',
        (function () {
            const b = fnBody(jsSide, 'syncCartFrame');
            return /const w = \(btn\.offsetWidth \|\| 0\) \+ 2;/.test(b) &&
                /\(btn\.offsetLeft \|\| 0\) - 1\) \+ 'px, '/.test(b) &&
                /if \(frameShown\) \{/.test(b) &&
                /cartFrame\.classList\.add\('is-placing'\)/.test(b) &&
                /cartFrame\.getBoundingClientRect\(\)/.test(b) &&
                /cartFrame\.classList\.add\('is-on'\)/.test(b) &&
                /* 没选中 → 藏起来 + 复位 frameShown（下次重新闪 ✓） */
                /classList\.remove\('is-on'\)/.test(b) && /frameShown = false;/.test(b);
        })(), fnBody(jsSide, 'syncCartFrame').replace(/\s+/g, ' ').slice(0, 100));
    ok('★ P103：选中框跟着**选中**走 —— select() 里同步（点卡带 / 拖进舞台都会走它 ✓），'
        + '开门复位（选中置空）时也同步（于是藏起来 ✓）',
        /* ★ 断言只认代码：jsSide 是 codeOnly() 过的，注释早被剥掉了
           （拿注释当锚点 = 假红，这个坑踩过好几次 ✓） */
        fnBody(jsSide, 'select').indexOf('syncCartFrame();') !== -1 &&
        fnBody(jsSide, 'resetStage').indexOf('syncCartFrame();') !== -1);

    /* --- ★★ P102：卡带表面的「正在运行…／停止运行？」蒙版 --- */
    const veilCss = (cssNC.match(/\.play-cart-veil\s*\{[^}]*\}/) || [''])[0];
    const veilTextCss = (cssNC.match(/\.play-cart-veil-text\s*\{[^}]*\}/) || [''])[0];
    const armCss = (cssNC.match(/\.play-cart\.is-armed \.play-cart-veil\s*\{[^}]*\}/) || [''])[0];
    ok('★★ P102：蒙版盖在表面（绝对定位铺满 + z-index 3 —— 盖住图标 0 / 文字 1 / 红遮罩 2），'
        + '而且不吃鼠标（点的是卡带自己）',
        /position:\s*absolute/.test(veilCss) && /inset:\s*0/.test(veilCss) &&
        /z-index:\s*3/.test(veilCss) && /pointer-events:\s*none/.test(veilCss) &&
        /border-radius:\s*inherit/.test(veilCss) &&
        /z-index:\s*2/.test(cssNC) && /z-index:\s*1/.test(cssNC));
    ok('★★ P102：「正在运行」= **半透明黑**（rgba 带 alpha）；「停止运行？」= **完全不透明的主题红**'
        + '（var(--accent)，不许写成 rgba ✓）',
        /background:\s*rgba\(0,\s*0,\s*0,\s*0?\.\d+\)/.test(veilCss) &&
        /\.play-cart\.is-running \.play-cart-veil\s*\{[^}]*visibility:\s*visible/.test(cssNC) &&
        /background:\s*var\(--accent\)/.test(armCss) && !/rgba/.test(armCss),
        armCss.replace(/\s+/g, ' ').trim().slice(0, 70));
    ok('★ P102：那行字竖排（75px 轨道里横排五个字塞不下）+ 默认藏着、闪烁消失是一条 keyframes',
        /writing-mode:\s*vertical-rl/.test(veilTextCss) && /white-space:\s*nowrap/.test(veilTextCss) &&
        /opacity:\s*0/.test(veilCss) && /visibility:\s*hidden/.test(veilCss) &&
        /\.play-cart\.is-veil-out \.play-cart-veil\s*\{[^}]*animation:\s*cartVeilOut/.test(cssNC) &&
        /@keyframes cartVeilOut\s*\{[\s\S]{0,400}?100%\s*\{\s*\n\s*opacity:\s*0/.test(cssNC));
    ok('★★ P102：闪掉那条规则必须排在 is-running / is-armed **之后**（同特异度靠源序压住 ✓）',
        cssNC.indexOf('.play-cart.is-veil-out .play-cart-veil') >
        cssNC.indexOf('.play-cart.is-armed .play-cart-veil'));
    /* JS 那一半 */
    const veilMs = parseFloat((/cartVeilOut\s+(\d+)ms/.exec(cssNC) || [])[1] || '0');
    ok('★★ P102：JS 的 VEIL_OUT_MS 与 CSS 的 cartVeilOut 时长一致（' + veilMs + 'ms）——'
        + '收早了会把动画打断 ✗',
        veilMs > 0 && new RegExp('const VEIL_OUT_MS = ' + veilMs + ';').test(jsSide));
    ok('★★ P102：每张卡带自己管自己的蒙版（paint / flick / active），模块那边只做"广播"',
        /const veil = document\.createElement\('span'\);/.test(jsSide) &&
        /veil\.className = 'play-cart-veil';/.test(jsSide) &&
        /veilText\.className = 'play-cart-veil-text';/.test(jsSide) &&
        /veil\.setAttribute\('aria-hidden', 'true'\)/.test(jsSide) &&
        /cartVeils\.push\(\{/.test(jsSide) &&
        /function syncCartVeils\(\)/.test(jsSide) &&
        /function armStop\(id\)/.test(jsSide) &&
        /* ★ 蒙版挂在名字**之后**（DOM 最后 → 压在最上面）✓ */
        jsSide.indexOf('btn.appendChild(veil)') > jsSide.indexOf('btn.appendChild(name)'));
    ok('★★ P102：点"正在运行"的那张 = 两段式 —— 第一下只 armStop（红+「停止运行？」），'
        + '第二下才 stopRunningGame ✓；点别的卡带会把确认作废 ✓',
        /if \(playingGame === w\.id\) \{[\s\S]{0,220}?stopRunningGame\(\);[\s\S]{0,120}?armStop\(w\.id\);/.test(jsSide) &&
        /if \(armedCart && armedCart !== id\) \{[\s\S]{0,200}?syncCartVeils\(\);/.test(jsSide));
    ok('★★ P102：停止那一拍 —— 黑幕渐入 → 全黑后 `exitGame(true)`（过场正演着，别掐自己）→'
        + ' **直接**渐出（没有 CURTAIN_HOLD_MS 那一停）→ 收尾 ✓',
        (function () {
            const b = fnBody(jsSide, 'stopRunningGame');
            const iIn = b.indexOf("classList.add('is-in')");
            const iExit = b.indexOf('exitGame(true)');
            const iOut = b.indexOf("classList.add('is-out')");
            return iIn !== -1 && iExit !== -1 && iOut !== -1 && iIn < iExit && iExit < iOut &&
                b.indexOf('CURTAIN_HOLD_MS') === -1;
        })() &&
        fnBody(jsSide, 'mountGame').indexOf('syncCartVeils();') !== -1 &&
        fnBody(jsSide, 'stopGame').indexOf('syncCartVeils();') !== -1);

    /* --- ★★ P98：卡带登场前那张"标题卡"（「游戏卡带」闪烁 → 渐隐 → 才轮到卡带）--- */
    ok('★★ P98：HTML 里多了一张标题卡，排在卡带列表**之前**、且是 aria-hidden 的过场',
        /<p class="play-rail-title" data-play="rail-title" aria-hidden="true">游戏卡带<\/p>/.test(html) &&
        html.indexOf('class="play-rail-title"') < html.indexOf('class="play-carts"'),
        '位置：' + html.indexOf('play-rail-title') + ' < ' + html.indexOf('play-carts'));
    const titleBlk = (cssNC.match(/\.play-rail-title\s*\{[^}]*\}/) || [''])[0];
    ok('★★ P98：标题卡**不占布局**（绝对定位 + inset: 0 + flex 居中）—— 否则它淡到 0 之后'
        + '还会把卡带往下顶一截 ✗；竖排是因为这条轨道只有 75px 宽',
        /position:\s*absolute/.test(titleBlk) && /inset:\s*0/.test(titleBlk) &&
        /display:\s*flex/.test(titleBlk) && /writing-mode:\s*vertical-rl/.test(titleBlk) &&
        /opacity:\s*0/.test(titleBlk) && /visibility:\s*hidden/.test(titleBlk));
    ok('★★ P98：闪烁出现 = 一串 opacity 台阶（steps 硬切，才叫"闪"）；is-in 才亮、is-out 才渐隐',
        /\.play-rail-title\.is-in\s*\{[^}]*animation:\s*railTitleFlicker/.test(cssNC) &&
        /animation:\s*railTitleFlicker[\d\s\w]*steps\(1,\s*end\)/.test(cssNC) &&
        /\.play-rail-title\.is-in\.is-out\s*\{[^}]*animation:\s*railTitleOut/.test(cssNC) &&
        /animation:\s*railTitleOut[^;]*forwards/.test(cssNC));
    const flickerKf = (cssNC.match(/@keyframes railTitleFlicker\s*\{[\s\S]*?\n\}/) || [''])[0];
    const outKf = (cssNC.match(/@keyframes railTitleOut\s*\{[\s\S]*?\n\}/) || [''])[0];
    ok('★★ P98：闪烁真的在"闪"（多个 0/1 交替的台阶），渐隐是 1 → 0',
        (flickerKf.match(/opacity:\s*[01](\.[\d]+)?;/g) || []).length >= 5 &&
        /0%[^}]*opacity:\s*0/.test(flickerKf) && /100%[^}]*opacity:\s*1/.test(flickerKf) &&
        /0%[^}]*opacity:\s*1/.test(outKf) && /100%[^}]*opacity:\s*0/.test(outKf),
        (flickerKf.match(/opacity:\s*[\d.]+/g) || []).join(' '));
    ok('★ P98：降低动效时这张标题卡**不出现**（整套过场都不演，卡带直接可见 ✓）',
        /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,500}?\.play-rail-title[\s\S]{0,200}?visibility:\s*hidden/.test(cssNC));

    /* 时序三个数 + 一个跨文件一致性检查 */
    ok('★★ P98：三个时间点就是你定的 —— 滑完开始、亮 1s、开始渐隐后 0.25s 才让卡带冒',
        /const TITLE_HOLD_MS = 1000;/.test(jsSide) &&
        /const CART_AFTER_FADE_MS = 250;/.test(jsSide) &&
        /railTitle\.classList\.add\('is-in'\)/.test(jsSide) &&
        /railTitle\.classList\.add\('is-out'\)/.test(jsSide) &&
        /titleTimer = setTimeout\(function \(\) \{[\s\S]{0,400}?\}, TITLE_HOLD_MS\);/.test(jsSide) &&
        /cartTimer = setTimeout\(function \(\) \{[\s\S]{0,200}?\}, CART_AFTER_FADE_MS\);/.test(jsSide));
    const flickerMs = parseFloat((/railTitleFlicker (\d+)ms/.exec(cssNC) || [])[1] || '0');
    ok('★ P98：闪烁动画（' + flickerMs + 'ms）必须**短于**亮着的那 1s —— '
        + '不然闪到一半就开始渐隐了 ✗（自检比着这两个数）',
        flickerMs > 0 && flickerMs < 1000);
    ok('★ P98：复位（开门）与关门都把标题卡收干净，且三个定时器一起清',
        fnBody(jsSide, 'resetRailTitle').indexOf("classList.remove('is-in', 'is-out')") !== -1 &&
        fnBody(jsSide, 'resetStage').indexOf('resetRailTitle();') !== -1 &&
        fnBody(jsSide, 'close').indexOf('resetRailTitle();') !== -1 &&
        ['revealTimer', 'titleTimer', 'cartTimer'].every(function (t) {
            return fnBody(jsSide, 'cancelReveal').indexOf('clearTimeout(' + t + ')') !== -1;
        }));

    /* --- 舞台的规格来自 works.js，一个字都不用另写 --- */
    ok('★ 舞台三行规格（编号 / 名字 / 引擎与体积）都在 HTML 里，由 JS 从 works.js 填',
        /data-play="spec-no"/.test(html) && /data-play="spec-name"/.test(html) &&
        /data-play="spec-meta"/.test(html) &&
        /w\.title/.test(jsSide) && /w\.tags/.test(jsSide) && /w\.weight/.test(jsSide));

    /* --- 旧的占位类不该再留着 --- */
    ok('★ 旧的 .play-empty 已经不存在（换成了 .play-spec）',
        !/\.play-empty/.test(cssNC) && !/play-empty/.test(html));
})();

/* ============================================================
   2q. 拉出来 / 仪器退场 / 刻度时钟反向（P65）
   ------------------------------------------------------------
   这一节钉三件"必须成对"的事：
     · 侧边栏从屏幕左外滑进来，且和"整站右移"共用同一个时长+曲线 ——
       那一整块才是刚性的（看起来就是导航栏把它拖出来）；
     · 游乐区铺在 0 层 ⇒ 两块刻度尺**必须**离屏；而准星挂件
       （三角 / 条带 / 读数）**只能动 opacity**，写 transform 会被
       js/rulers.js 每帧写的 transform 盖掉；
     · 刻度时钟是 WAAPI 动画 ⇒ "反向播放"必须在 circle-parallax.js 里
       加一份 direction: 'reverse'，而且 fill 必须是 both。
   ============================================================ */
section('[2q] 拉出来 / 仪器退场 / 刻度时钟反向（P65）');
(function sidebarMotion() {
    const jsSide = codeOnly(read('js/sidebar.js'));
    const jsCircle = codeOnly(read('js/circle-parallax.js'));
    const sideBlk = (cssNC.match(/\.play-sidebar\s*\{[\s\S]*?\n\}/) || [''])[0];
    const openBlk = (cssNC.match(/body\.sidebar-open \.play-sidebar\s*\{[^}]*\}/) || [''])[0];

    /* --- 1. 从屏幕左外滑进来（不是淡入） --- */
    ok('★★ 关着时整条躲在屏幕左外：left = -1 × --sidebar-w',
        /left:\s*calc\(-1 \* var\(--sidebar-w\)\)/.test(sideBlk));
    ok('★★ 展开时滑到 left: 0，而且不再靠 opacity 淡入',
        /left:\s*0/.test(openBlk) && !/opacity/.test(openBlk));
    ok('★★ 用的是 left 而不是 transform —— 这样才和导航栏的 left 同一帧（transform 可能被合成器提前跑）',
        /transition:[\s\S]{0,120}?left var\(--sidebar-dur\)/.test(sideBlk) &&
        !/transform/.test(sideBlk) && !/transform/.test(openBlk));

    /* --- 2. 与"整站右移"同一套时长 / 曲线 + 同一个属性 --- */
    ok('★★ 侧边栏滑入与整站右移共用 --sidebar-dur + --panel-ease（逐帧同进度 = 像被导航栏拉出来）',
        /left var\(--sidebar-dur\) var\(--panel-ease\)/.test(sideBlk) &&
        /left var\(--sidebar-dur\) var\(--panel-ease\)/.test(cssNC) &&
        /margin-left var\(--sidebar-dur\) var\(--panel-ease\)/.test(cssNC));

    /* --- 3. 0 层 ⇒ 刻度尺必须离屏 --- */
    ok('★★ 左尺向左、底尺向下离屏（否则它们会横在 0 层的游乐区上）',
        /body\.sidebar-open #ruler-left\s*\{[^}]*translateX\(-(?:100%|100vw)\)/.test(cssNC) &&
        /body\.sidebar-open #ruler-bottom\s*\{[^}]*translateY\((?:100%|100vh)\)/.test(cssNC));
    ok('★ 两块 canvas 有 transform 过渡：缩回时按原路滑回来（transition 天然反向）',
        /#ruler-left,\s*#ruler-bottom\s*\{[^}]*transition:\s*transform var\(--sidebar-dur\)/.test(cssNC));

    /* --- 4. ★★ 准星挂件只能动 opacity --- */
    const gadgets = [...cssNC.matchAll(/body\.sidebar-open \.(?:ruler-marker-[xy]|ruler-band|ruler-read)[^{}]*\{[^}]*\}/g)].map((m) => m[0]);
    ok('★★ 三角 / 条带 / 读数只动 opacity，绝不写 transform（写了会被 js/rulers.js 每帧盖掉）',
        gadgets.length >= 1 && gadgets.every((r) => /opacity:\s*0/.test(r) && !/transform|translate/.test(r)),
        gadgets.join(' | '));

    /* --- 5. 刻度时钟：反向播放真的落在 WAAPI 那一侧 --- */
    ok('★★ 导出 CircleReveal.hide / show（侧边栏开关时喊它）',
        /window\.CircleReveal\s*=/.test(jsCircle) && /hide\(\)/.test(jsCircle) && /show\(\)/.test(jsCircle));
    ok('★★ hide 走 play(\'reverse\', false)：把 direction 交给 WAAPI（CSS 改 animation-direction 只会跳，不会演）',
        /play\('reverse'/.test(jsCircle) && /direction,/.test(jsCircle) && /el\.animate\(frames\(blinks\)/.test(jsCircle));
    ok('★★ fill 是 both 而不是 forwards（否则 stagger 的延迟期间会掉回 opacity 0 = 后两圈先没了）',
        /fill:\s*'both'/.test(jsCircle) && !/fill:\s*'forwards'/.test(jsCircle));
    /* ★★ P67：circlesIn.delay = 4.0 是"从开屏起点算起的第 4 秒"，属于开屏编排。
       侧边栏那两趟要是也吃它，就会"点了按钮先干等 4 秒才闪"—— 就是这个 bug。 */
    ok('★★ 侧边栏那两趟不吃 circlesIn.delay（只有开屏登场才吃）',
        /play\('reverse', false\)/.test(jsCircle) && /play\('normal', false\)/.test(jsCircle) &&
        /play\('normal', true\)/.test(jsCircle) &&
        /introDelay \? \(t\.delay \|\| 0\) : 0/.test(jsCircle));
    ok('★ 降低动效下不演：直接改内联 opacity',
        /if \(reduce\) \{ hideAll\(\); return; \}/.test(jsCircle) &&
        /if \(reduce\) \{ showAll\(\); return; \}/.test(jsCircle));

    /* --- 6. 侧边栏两侧都喊了 --- */
    ok('★★ 开关两侧都喊了刻度时钟（展开闪没、缩回按同一条路闪回来）',
        /CircleReveal\.hide\(\)/.test(jsSide) && /CircleReveal\.show\(\)/.test(jsSide) &&
        jsSide.indexOf('CircleReveal.hide()') < jsSide.indexOf('CircleReveal.show()'));
})();

/* ============================================================
   2r. 四角刻线朝屏幕的四角飞出（P67）
   ------------------------------------------------------------
   点「玩游戏」：四块刻线各自朝自己那一侧的屏幕角飞出去，边飞边变粗，
   最后一拍化掉；缩回时原路飞回来。
   ★ 这一版是**纯 CSS** 的：位移直接用刻线框自己的四个内缩量算出来
     （--content-x / --v-inset / --gutter / --safe-b），一行 JS 都不用。
     P66 那版要 JS 算每块刻线的位移、跟鼠标、还负责交系统光标 —— 整块删掉了。
   这一节钉的就是"退回纯 CSS"，外加两条仍在的不变式：
     · 飞走 / 飞回是**两套时序**（CSS 过渡取"变化之后"那条规则）：
       飞走最后 150ms 才化掉，飞回立刻显形；
     · 刻线的层号必须高于 0 层的游乐区，否则整个过场藏在它后面。
   ============================================================ */
section('[2r] 四角刻线朝屏幕四角飞出（P67）');
(function cornerFlyOut() {
    const jsDraft = codeOnly(read('js/draft-layer.js'));
    const jsSide = codeOnly(read('js/sidebar.js'));
    const cornerBlk = (cssNC.match(/\.df-corner\s*\{[\s\S]*?\n\}/) || [''])[0];
    const outBlk = (cssNC.match(/body\.sidebar-open \.df-corner\s*\{[^}]*\}/) || [''])[0];
    const dirBlk = (k) => ((cssNC.match(new RegExp('body\\.sidebar-open \\.df-' + k + '\\s*\\{([^}]*)\\}')) || ['', ''])[1] || '');

    /* --- 1. 纯 CSS：自绘指针那一套整块不在了 --- */
    ok('★★ 过场不再由 JS 驱动（DraftMarks / pointerAt / getBoundingClientRect 全都不在 js 里）',
        !/DraftMarks|pointerAt/.test(jsDraft + jsSide) && !/getBoundingClientRect/.test(jsDraft));
    ok('★★ 自绘箭头已删（.df-pointer / play-cursor / df-collapsed 都不该再出现）',
        !/\.df-pointer/.test(cssNC) && !/play-cursor/.test(cssNC) && !/df-collapsed/.test(cssNC));

    /* --- 2. 四块各自朝自己那一侧的屏幕角飞（位移 = 该侧的内缩量 + 24px 余量）--- */
    ok('★★ 左上：向左上飞（--content-x / --v-inset）',
        /translate\(calc\(-1 \* var\(--content-x\) - 24px\), calc\(-1 \* var\(--v-inset\) - 24px\)\)/.test(dirBlk('tl')));
    ok('★★ 右上：向右上飞（--gutter / --v-inset）',
        /translate\(calc\(var\(--gutter\) \+ 24px\), calc\(-1 \* var\(--v-inset\) - 24px\)\)/.test(dirBlk('tr')));
    ok('★★ 左下：向左下飞（--content-x / --safe-b）',
        /translate\(calc\(-1 \* var\(--content-x\) - 24px\), calc\(var\(--safe-b\) \+ 24px\)\)/.test(dirBlk('bl')));
    ok('★★ 右下：向右下飞（--gutter / --safe-b）',
        /translate\(calc\(var\(--gutter\) \+ 24px\), calc\(var\(--safe-b\) \+ 24px\)\)/.test(dirBlk('br')));
    ok('★ 位移量全部来自布局规格（改 --v-inset / --gutter 它自己跟着走，不写死像素）',
        ['tl', 'tr', 'bl', 'br'].every((k) => /var\(--(content-x|gutter|v-inset|safe-b)\)/.test(dirBlk(k))));

    /* --- 3. 飞走：变粗 + 最后一拍化掉；飞回：立刻显形 --- */
    ok('★★ 飞走时四块变粗（1px → 3px）', /border-width:\s*3px/.test(outBlk));
    ok('★★ 飞走最后一拍才化掉、飞回立刻显形（两套时序）',
        /opacity:\s*0/.test(outBlk) &&
        /opacity 150ms linear calc\(var\(--sidebar-dur\) - 150ms\)/.test(outBlk) &&
        /opacity 150ms linear;/.test(cornerBlk) && !/opacity[^;]*calc\(/.test(cornerBlk));

    /* --- 4. 时长仍只有一个来源 --- */
    ok('★★ 飞走 / 飞回用的是 --sidebar-dur + --panel-ease（和侧边栏滑入、整站右移同一套）',
        /transform var\(--sidebar-dur\) var\(--panel-ease\)/.test(outBlk));

    /* --- 5. 缩回 = 摘掉 sidebar-open，过渡自己反向跑（没有任何额外状态）--- */
    ok('★ 缩回不需要额外状态（没有 df-collapsed / df-flown 之类的类）',
        !/df-(collapsed|flown|flying)/.test(cssNC) && !/df-(collapsed|flown|flying)/.test(jsSide));

    /* --- 6. 光标：立刻交还（不再等箭头落位）--- */
    ok('★★ 系统光标仍由 body.sidebar-open 立刻交还（过场那 450ms 里也不缺指针）',
        /body\.sidebar-open,\s*body\.sidebar-open \*\s*\{[^}]*cursor:\s*auto\s*!important/.test(cssNC));

    /* --- 7. 层号：刻线必须画在 0 层的游乐区上面，这个过场才看得见 --- */
    const zOf = (sel) => +((((cssNC.match(new RegExp(sel + '\\s*\\{[\\s\\S]*?\\n\\}')) || [''])[0]
        .match(/(?:^|\s)z-index:\s*(\d+)/)) || [])[1] || 0);
    const sideZ = zOf('\\.play-sidebar');
    const frameZ = zOf('\\.draft-frame');
    ok('★★ 刻线层号高于游乐区（' + frameZ + ' > ' + sideZ + '）—— 否则整个过场藏在游乐区后面，白做',
        frameZ > sideZ);
})();

/* ============================================================
   2s. 调整窗口大小不拖影 + |GAME TIME|（P68）
   ------------------------------------------------------------
   两件事：
     · bug —— 侧边栏展开后拖窗口，导航栏的定位会"延迟"：
       它的 left 是 calc(100vw - …)，窗口一变值就变，而它挂着 450ms 的过渡，
       于是"跟随窗口"被演成了一段动画。修法：resize 期间挂 body.is-resizing，
       CSS 把过渡压掉，等 layout 防抖跑完再摘。
     · 功能 —— 游乐区展开时，导航栏下面那三件装饰淡出、|GAME TIME| 逐个闪出。
   ============================================================ */
section('[2s] resize 不拖影 + |GAME TIME|（P68）');
(function resizeAndGametime() {
    const jsWorld = codeOnly(read('js/world.js'));
    const jsDraft = codeOnly(read('js/draft-layer.js'));
    const stripBlk = (cssNC.match(/\.df-strip\s*\{[\s\S]*?\n\}/) || [''])[0];
    const gtBlk = (cssNC.match(/\.df-gametime\s*\{[\s\S]*?\n\}/) || [''])[0];

    /* --- 1. resize 期间压掉过渡 --- */
    ok('★★ resize 一开始就挂 body.is-resizing（world.js）',
        /addEventListener\('resize', function \(\)\s*\{[\s\S]{0,140}?classList\.add\('is-resizing'\)/.test(jsWorld));
    ok('★★ 等 layout 防抖跑完、订阅者都跑过之后才摘掉（先摘会把这一趟位移又演成动画）',
        /for \(const fn of layoutSubs\) fn\(\);[\s\S]{0,320}?classList\.remove\('is-resizing'\)/.test(jsWorld));
    ok('★★ CSS 有对应的抑制规则，覆盖了会跟着窗口变的那几样（navbar / main / play-sidebar）',
        /body\.is-resizing \.navbar[\s\S]{0,420}?transition:\s*none\s*!important/.test(cssNC) &&
        /body\.is-resizing[^{}]*\bmain\b/.test(cssNC) &&
        /body\.is-resizing \.play-sidebar/.test(cssNC));

    /* --- 2. |GAME TIME| 本体 --- */
    ok('★ 这行字由 JS 生成（HTML 里没有；它属于 .df-strip 那族装饰）',
        /'\|GAME TIME\|'\.split\(''\)/.test(jsDraft) && !/df-gametime/.test(html) &&
        /strip\.appendChild\(gametime\)/.test(jsDraft));
    ok('★ 一个字符一个 span + --i（"逐个"就靠它）',
        /createElement\('span'\)/.test(jsDraft) && /setProperty\('--i', String\(i\)\)/.test(jsDraft));
    ok('★★ 竖向排版：writing-mode: vertical-rl，而且**不翻**（.df-v 那族是从下往上读的）',
        /writing-mode:\s*vertical-rl/.test(gtBlk) && !/rotate\(180deg\)/.test(gtBlk));
    ok('★★ 高度 = 推进线那一段（inset: 2px 0，那个 2px 正好是 .df-strip 的上下 padding）',
        /inset:\s*2px 0/.test(gtBlk) && /padding:\s*2px 0/.test(stripBlk));
    ok('★★ 绝对定位：三件老装饰淡出时它不参与排版（否则会被挤到轨道旁边去）',
        /position:\s*absolute/.test(gtBlk) && /position:\s*relative/.test(stripBlk));
    ok('★ 颜色取 --text-muted、等宽字体（和站名 / 读数同一族）',
        /color:\s*var\(--text-muted\)/.test(gtBlk) && /ui-monospace/.test(gtBlk));
    ok('★ 纯装饰不吃鼠标（它是 aria-hidden 那族的一部分）',
        /pointer-events:\s*none/.test(gtBlk));

    /* --- 3. 淡出 / 闪出 --- */
    ok('★★ 展开时那三件（站名 / 推进线 / 读数）淡出',
        /body\.sidebar-open \.df-name,\s*\nbody\.sidebar-open \.df-bar,\s*\nbody\.sidebar-open \.df-read\s*\{[^}]*opacity:\s*0/.test(cssNC));
    ok('★★ 逐个闪出：每字错开 80ms，用 steps 硬闪（要的是"闪"，不是渐变）',
        /animation-delay:\s*calc\(var\(--i, 0\) \* 80ms\)/.test(cssNC) &&
        /steps\(1, end\)/.test(cssNC) && /@keyframes gameTimeBlink/.test(cssNC) &&
        !/@keyframes gameTimeBlink\s*\{[\s\S]{0,400}?infinite/.test(cssNC));
    /* --- 4. 收回的时序：先关完游乐区 → |GAME TIME| 淡出 → 三件装饰淡回来 --- */
    ok('★★ 收回①：|GAME TIME| 等游乐区**完全关掉**（--sidebar-dur）才开始淡出',
        /\.df-gametime\s*\{[\s\S]*?transition:\s*opacity 200ms linear var\(--sidebar-dur\)/.test(cssNC));
    const fadeBack = (cssNC.match(/\.df-name,\s*\n\.df-bar,\s*\n\.df-read\s*\{[^}]*\}/) || [''])[0];
    ok('★★ 收回②：三件装饰（站名 / 推进线 / 读数）接在它后面才淡回来（--sidebar-dur + 200ms）',
        /transition:\s*opacity 200ms linear calc\(var\(--sidebar-dur\) \+ 200ms\)/.test(fadeBack));
    ok('★★ 展开时反过来是立刻的：变化之后那条规则（sidebar-open）不带延迟 —— 两套时序',
        /body\.sidebar-open \.df-name,[\s\S]{0,140}?\{[^}]*transition:\s*opacity 200ms linear;\s*\n\}/.test(cssNC));
    ok('★ 降低动效：连这些"等关完"的延迟也按掉（transition: none + animation-delay: 0s）',
        /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]{0,700}?animation-delay:\s*0s/.test(cssNC));
    ok('★ 降低动效：不闪、直接亮（否则那 0.8s 的错开延迟会让字一个个跳出来）',
        /@media \(prefers-reduced-motion: reduce\)\s*\{\s*body\.sidebar-open \.df-gametime span\s*\{[^}]*animation:\s*none/.test(cssNC));
})();

/* ============================================================
   2t. 开屏补间必须 cancel：否则 .page-zoom 永远是层叠上下文（P74）
   ------------------------------------------------------------
   症状（用户量像素量出来的）：游乐区展开后，导航栏的外阴影明显比卡带栏的暗，
   而同一声明在卡带栏上却正常；把游戏区的背景去掉，两侧立刻一致
   —— 说明游戏区**盖在**导航栏的阴影上。
   原因**不是** z-index 被改：`.play-sidebar` 还是 0、`.navbar` 还是 100。
   而是 `.page-zoom` 一直是**层叠上下文**：main.js 的开屏补间用
   `fill: 'forwards'` 把 transform 顶成 scale(1)，跑完只清了内联 transform、
   **没有取消动画** —— 那个"非 none 的 transform"一直留着，于是里面所有
   z-index（导航栏 100、刻度尺 9996、准星 9997…）都只在它**内部**有效，
   对外它只是"层号 0 的非定位元素"；而游戏区是 body 的直接子元素、
   `position: fixed`、DOM 又更靠后 → 整体压在整站之上。
   （同样的坑 style.css 720 行那段 .draft-frame 的注释里已经写过一次，
     只是没人想到"动画跑完了它还在"。）
   ============================================================ */
section('[2t] 开屏补间必须 cancel（P74）');
(function introZoomCleanup() {
    const jsMain = codeOnly(read('js/main.js'));
    const rawMain = read('js/main.js');

    ok('★★ 开屏补间留了引用（不留引用就没法取消）',
        /let zoomSettle = null;/.test(jsMain) && /zoomSettle = zoomEl\.animate\(/.test(jsMain));
    ok('★★ 跑完要 cancel，不能只清内联 transform（只清内联 = transform 仍被动画顶着 scale(1)）',
        /zoomSettle\.finished\.then\([\s\S]{0,700}?zoomSettle\.cancel\(\)/.test(jsMain));
    ok('★★ 330ms 那条兜底路径也要 cancel',
        /if \(zoomSettle\) zoomSettle\.cancel\(\)/.test(jsMain));
    /* ★ 这条**故意查注释**：坑要写在代码里，下次才不会再"只清内联"。 */
    ok('★ 注释里写清了为什么必须 cancel（故意查注释：层叠上下文 / fill: forwards）',
        /层叠上下文/.test(rawMain) && /fill: forwards/.test(rawMain));

    /* 两个 z-index 的大小关系 —— 前提是它们真的在同一个层叠上下文里
       （= .page-zoom 不能带着 transform / animation）。 */
    const zOf = (sel) => +((((cssNC.match(new RegExp(sel + '\\s*\\{[\\s\\S]*?\\n\\}')) || [''])[0]
        .match(/(?:^|\s)z-index:\s*(-?\d+)/)) || [])[1] || 0);
    ok('★★ 游戏区（' + zOf('\\.play-sidebar') + '）低于导航栏（' + zOf('\\.navbar') +
        '）—— 只有 .page-zoom 不自建上下文时这条才作数',
        zOf('\\.play-sidebar') < zOf('\\.navbar'));

    /* 卡带栏不许再有 z-index：它要靠"不动 z-index"压在舞台背景之上，
       和导航栏同一种构造（里面被自己的背景压暗、外面亮）。 */
    const railBlk = (cssNC.match(/\.play-rail\s*\{[\s\S]*?\n\}/) || [''])[0];
    ok('★★ 卡带栏里不再有 z-index（那行 -10 是当时的临时手段，只会压暗卡带栏一侧）',
        !/(?:^|\s)z-index\s*:/.test(railBlk));
})();

/* ============================================================
   2u. 游乐区：默认提示 + 卡带悬停回执 + 屏蔽量取回执（P75）
   ------------------------------------------------------------
   三件事：
     · 默认**不选**任何卡带，舞台显示「从左侧卡带栏拖动游戏到此处启动游戏」；
     · 鼠标悬停卡带时用回执（.cursor-toast）显示这条游戏的简述，
       实时跟随鼠标、离开就摘掉；键盘聚焦也显示（这条不该只有鼠标能用）；
     · 游乐区里不做框选量取 —— 尤其不许弹那条"按 G 开启参考系…"的回执
       （它在这里既没意义、又会盖在舞台上）。
   ============================================================ */
section('[2u] 游乐区：默认提示 + 卡带悬停回执（P75）');
(function playHints() {
    const jsSide = codeOnly(read('js/sidebar.js'));
    const jsCross = codeOnly(read('js/crosshair.js'));
    const hintCss = (cssNC.match(/\.play-hint\s*\{[^}]*\}/) || [''])[0];
    const followCss = (cssNC.match(/\.cursor-toast\.is-follow\s*\{[^}]*\}/) || [''])[0];

    /* --- 1. 默认提示 --- */
    ok('★★ 那句提示写在 HTML 里，舞台默认 data-state="empty"',
        /data-state="empty"/.test(html) &&
        /class="play-hint"[^>]*>从左侧卡带栏拖动游戏到此处启动游戏</.test(html));
    ok('★★ empty 藏起规格、非 empty 藏起提示（两句不同时出现）',
        /\.play-body\[data-state="empty"\] \.play-spec[\s\S]{0,90}?display:\s*none/.test(cssNC) &&
        /\.play-body:not\(\[data-state="empty"\]\) \.play-hint[\s\S]{0,90}?display:\s*none/.test(cssNC));
    ok('★ 提示取 --text-muted 并居中', /color:\s*var\(--text-muted\)/.test(hintCss) && /text-align:\s*center/.test(hintCss));
    ok('★★ 不再有"默认选中第一张"（那行 select(games[0].id) 必须删掉）',
        !/select\(games\[0\]/.test(jsSide) &&
        /* P81：状态由"是不是正在跑这一条"决定 —— play / game 两种
           （★ P100b：这一段搬进了 renderSelection(w)，条件里的 id 也跟着变成 w.id ✓） */
        /dataset\.state = \(playingGame === w\.id\) \? 'play' : 'game'/.test(jsSide));

    /* --- 2. 悬停回执 --- */
    ok('★★ 悬停 / 聚焦卡带会生成回执，内容取自 works.js 的 desc（唯一数据源）',
        /btn\.addEventListener\('mouseenter'/.test(jsSide) &&
        /showGameToast\(w, /.test(jsSide) && /w\.desc \|\| w\.title/.test(jsSide));
    ok('★★ 跟随鼠标：位置写在 transform 上，并且夹回视口内',
        /toastEl\.style\.transform = 'translate\('/.test(jsSide) &&
        /Math\.max\(8, Math\.min\(x \+ 14/.test(jsSide));
    ok('★★ 鼠标离开 / 关闭游乐区都摘掉（不留常驻节点）',
        /* ★ P77：mouseleave 那行外面套了一层（先清 hovered 再摘回执），
           所以这里只要求"离开时确实调了 hideGameToast"。 */
        /addEventListener\('mouseleave'[\s\S]{0,120}?hideGameToast\(\)/.test(jsSide) &&
        /function hideGameToast\(\)[\s\S]{0,140}?toastEl\.remove\(\)/.test(jsSide) &&
        /hideGameToast\(\);\s*\n\s*\}/.test(jsSide));
    ok('★ 键盘聚焦也能看到这条简述（摆在卡带右侧，不跟随）',
        /addEventListener\('focus'/.test(jsSide) && /getBoundingClientRect\(\)/.test(jsSide));
    ok('★★ 回执外观复用 .cursor-toast + .is-follow（不淡出、不自己消失、能换行）',
        /animation:\s*none/.test(followCss) && /white-space:\s*normal/.test(followCss) &&
        /max-width:\s*260px/.test(followCss));

    /* --- 3. 游乐区里屏蔽量取回执（能力保留） --- */
    ok('★★ 游乐区开着时量取的两条回执都不弹（inPlay 短路）',
        /const inPlay = document\.body\.classList\.contains\("sidebar-open"\);/.test(jsCross) &&
        /if \(!inPlay\) showToast\("请等待页面静止…"/.test(jsCross) &&
        /if \(!inPlay\) showToast\("按 G 开启参考系…"/.test(jsCross));
    ok('★★ 但能力保留：按了 G 照样 beginDrag（不是把量取整块禁掉）',
        /\} else \{\s*\n\s*beginDrag\(\);\s*\n\s*\}/.test(jsCross));
    ok('★ 仍然是"作废这一次按下"而不是 return（return 会让准星卡在原地）',
        /refusedDrag = true;[\s\S]{0,200}?refusedDrag = true;[\s\S]{0,260}?beginDrag\(\);/.test(jsCross));
})();

/* ============================================================
   2v. 游乐区里的回执：去投影 + 纯白（两个主题各一个钩子）（P76）
   ------------------------------------------------------------
   基类那两层 text-shadow 是为了"压在任意内容上都要读得清"；
   但游乐区的舞台是一整块暗面板（--navbar-bg，深浅两套主题都是暗的），
   不需要它，而且在舞台中央那圈投影显脏。字色改成主题钩子。
   ============================================================ */
section('[2v] 游乐区回执：去投影 + 纯白（P76）');
(function playToastInk() {
    const dark = (cssNC.match(/:root\s*\{[\s\S]*?\n\}/) || [''])[0];
    const light = (cssNC.match(/:root\.light\s*\{[\s\S]*?\n\}/) || [''])[0];
    const baseToast = (cssNC.match(/\.cursor-toast\s*\{[^}]*\}/) || [''])[0];
    const playToast = (cssNC.match(/body\.sidebar-open \.cursor-toast\s*\{[^}]*\}/) || [''])[0];

    ok('★★ 暗色主题的钩子：--play-toast-ink: #fff',
        /--play-toast-ink:\s*#fff/i.test(dark));
    ok('★★ 亮色主题的钩子也在（面板仍是暗的，所以默认也留纯白）',
        /--play-toast-ink:\s*#fff/i.test(light));
    ok('★★ 游乐区里那条回执：字色走钩子、投影去掉',
        /color:\s*var\(--play-toast-ink,\s*#fff\)/.test(playToast) &&
        /text-shadow:\s*none/.test(playToast));
    ok('★ 基类那两层投影还在（游乐区**外面**的回执仍要压在任意内容上读得清）',
        /text-shadow:\s*0 0 6px/.test(baseToast));
})();

/* ============================================================
   2w. 鼠标点一下不许把跟随回执顶走（P77）
   ------------------------------------------------------------
   症状：悬停卡带（回执在鼠标旁边）时点一下，回执先跳到卡带**顶端**闪一下，
   再被下一次 mousemove 拉回鼠标旁。
   原因：点击会给按钮焦点，而 focus 分支是"键盘那套"（摆在卡带右上角、
   不跟随）—— 鼠标的跟随回执被它重建了一遍。
   做法：每张卡带自己记一个 `hovered`，鼠标还停着时 focus / blur 都不动作。
   ============================================================ */
section('[2w] 鼠标点一下不许顶走跟随回执（P77）');
(function hoverVsFocus() {
    const jsSide = codeOnly(read('js/sidebar.js'));

    ok('★★ focus 分支先看 hovered：鼠标点出来的焦点不重建回执',
        /let hovered = false;/.test(jsSide) &&
        /addEventListener\('focus', function \(\) \{\s*\n\s*if \(hovered\) return;/.test(jsSide));
    ok('★★ 对称地：鼠标还停着时 blur 也不摘（点了舞台、卡带跟着失焦）',
        /addEventListener\('blur', function \(\) \{\s*\n\s*if \(!hovered\) hideGameToast\(\);/.test(jsSide));
    ok('★ mouseenter / mouseleave 成对维护 hovered',
        /addEventListener\('mouseenter'[\s\S]{0,90}?hovered = true;/.test(jsSide) &&
        /addEventListener\('mouseleave'[\s\S]{0,90}?hovered = false;/.test(jsSide));
    /* ★★ P77b：mousemove / mousedown 都走**幂等入口** ——
       不在就补回来、在就只挪位置；"关门那 450ms 里冒多余回执"这个顾虑改由
       `closing` 闸门挡住（比 P77 那版"干脆不重生"更稳：真机上确实有一条
       我们没抓稳的事件链会把回执摘掉）。 */
    ok('★★ 鼠标一动 / 一按都走幂等入口（不在就补回、在就只挪位置；点过的除外）',
        /function ensureToast\(x, y, hard\)/.test(jsSide) &&
        /if \(closing \|\| !hovered(?: \|\| clicked)?\) return;/.test(jsSide) &&
        /if \(toastEl && !toastEl\.isConnected\) toastEl = null;/.test(jsSide) &&
        /if \(hard \|\| !toastEl\) showGameToast\(w, x, y\);/.test(jsSide));
    ok('★ mousedown 走硬刷新（同一帧 remove + append 不会闪），mousemove 走轻路径',
        /addEventListener\('mousedown', function \(e\) \{ ensureToast\(e\.clientX, e\.clientY, true\); \}\)/.test(jsSide) &&
        /addEventListener\('mousemove', function \(e\) \{ ensureToast\(e\.clientX, e\.clientY, false\); \}\)/.test(jsSide));
    ok('★★ 关门时立 closing、开门时清掉（回执不许在关门路上冒出来）',
        /isOpen = true;\s*\n\s*closing = false;/.test(jsSide) &&
        /closing = true;/.test(jsSide));
    ok('★ 键盘那份仍然摆到卡带右侧（getBoundingClientRect 还在 focus 分支里）',
        /if \(hovered\) return;[\s\S]{0,200}?getBoundingClientRect\(\)/.test(jsSide));
})();

/* ============================================================
   2x. 拖卡带到舞台启动（P78 起，P80 换成指针拖拽）+ 点过之后回执收起来
   ------------------------------------------------------------
   P78 用的是原生 HTML5 拖放：接线全对，但这个站全局禁着拖拽
   （`-webkit-user-drag: none` 会继承 + document 级 dragstart 的 preventDefault），
   P79 把两处后门都开了，鼠标**仍然**拖不动 —— 于是 P80 换成自己实现的指针拖拽：
     · 只依赖 pointerdown / pointermove / pointerup（鼠标、触屏同一条路）；
     · **位移阈值**区分"点击"和"拖动"（DRAG_MIN，和 crosshair.js 一个套路，不用长按）；
     · 抓住指针（setPointerCapture），拖出卡带之后事件仍然回来；
     · 松手时自己算坐标判断落点在不在舞台上（overStage 读舞台 rect）。
   ============================================================ */
section('[2x] 拖卡带到舞台启动（P78/P80）');
(function dragToLaunch() {
    const jsSide = codeOnly(read('js/sidebar.js'));
    const dropCss = (cssNC.match(/\.play-body\.is-drop\s*\{[^}]*\}/) || [''])[0];
    const dragCss = (cssNC.match(/\.play-body\.is-dragging\s*\{[^}]*\}/) || [''])[0];
    const ghostCss = (cssNC.match(/\.play-cart\.is-ghost\s*\{[^}]*\}/) || [''])[0];

    ok('★★ 拖拽是自己实现的（pointerdown/move/up），原生拖放那套已经删干净',
        /addEventListener\('pointerdown'/.test(jsSide) &&
        /addEventListener\('pointermove'/.test(jsSide) &&
        /addEventListener\('pointerup'/.test(jsSide) &&
        !/dataTransfer/.test(jsSide) && !/btn\.draggable/.test(jsSide));
    ok('★★ 位移阈值区分点击与拖动（DRAG_MIN；曼哈顿距离，和 crosshair.js 同一套写法）',
        /const DRAG_MIN = \d+;/.test(jsSide) &&
        /Math\.abs\(e\.clientX - downAt\.x\) \+ Math\.abs\(e\.clientY - downAt\.y\) >= DRAG_MIN/.test(jsSide));
    ok('★★ 抓住指针 + pointercancel 收尾（拖出去、触屏被打断都能收干净）',
        /setPointerCapture\(e\.pointerId\)/.test(jsSide) && /addEventListener\('pointercancel'/.test(jsSide));
    ok('★★ 落点在舞台上才算启动（先 select 再 startGame）；落外面作废',
        /function overEl\(el, x, y\)/.test(jsSide) &&
        /const overStage = \(x, y\) => overEl\(stageEl, x, y\);/.test(jsSide) &&
        /* ★ P100b：换卡带那条路要多传两个 true（先别关上一局、先别铺新内容）✓ */
        /if \(overStage\(e\.clientX, e\.clientY\)\) \{[\s\S]{0,700}?select\(w\.id, true, true\);[\s\S]{0,120}?startGame\(\);/.test(jsSide) &&
        /if \(!wasDrag\) return;/.test(jsSide) &&
        /* ★ P100b：拖完一律吞掉紧跟着的那次 click —— 指针被 capture 在卡带上，
           松手在哪都会派到这张卡带（原来"只在卡带上松手才吞"是错的 ✗） */
        /swallowClick = true;\s*\n\s*swallowAt = Date\.now\(\);/.test(jsSide) &&
        /addEventListener\('pointerdown'[\s\S]{0,200}?swallowClick = false;/.test(jsSide));
    ok('★★ 拖动期间先把跟随回执收掉（否则它会一路贴着鼠标飞）',
        /addEventListener\('pointermove'[\s\S]{0,300}?startDrag\(e\)/.test(jsSide) &&
        /function startDrag\(e\)[\s\S]{0,200}?hideGameToast\(\);/.test(jsSide));
    ok('★★ 跟着指针的那张"浮起卡带"：只写 transform（唯一一处）、不吃事件、固定定位',
        /function paintGhost\(\)/.test(jsSide) &&
        /* ★ P96：写 transform 的地方**只有** paintGhost 一处 —— 位置/抬起/放大合成一次写完，
           别处再写一句就会互相覆盖（这条比原来比对字面串结实）*/
        (jsSide.match(/ghost\.style\.transform/g) || []).length === 1 &&
        /position:\s*fixed/.test(ghostCss) && /pointer-events:\s*none/.test(ghostCss));
    ok('★★ 拖完那一下的 click 被吃掉（否则状态会再跳一次）',
        /* ★ P100b：标志位现在只吞"紧接着"那一下（带时间戳，过时的不吞）✓ */
        /if \(swallowClick\) \{[\s\S]{0,200}?swallowClick = false;[\s\S]{0,80}?e\.preventDefault\(\); return; \}/.test(jsSide) &&
        /swallowAt = Date\.now\(\);/.test(jsSide));
    ok('★ 拖动中按 Esc 作废', /addEventListener\('keydown'[\s\S]{0,240}?endDrag\(\);/.test(jsSide));
    ok('★ 两个状态的样式：虚线 = 可以放，实线 + 主题红 = 正压在上面',
        /border-style:\s*dashed/.test(dragCss) && /border-style:\s*solid/.test(dropCss) &&
        /border-color:\s*var\(--accent\)/.test(dropCss));
    ok('★ 卡带光标改成 grab（P85 起还带上了卡带里的文字 —— 详见 [2ac]）',
        /body\.sidebar-open \.play-cart,\s*\n?body\.sidebar-open \.play-cart \*\s*\{\s*\n?\s*cursor:\s*grab/.test(cssNC));
    ok('★★ 卡带上拦掉浏览器的手势接管（touch-action: none）—— 否则触屏拖动会被当成滚动取消',
        /\.play-cart\s*\{[\s\S]*?touch-action:\s*none/.test(cssNC));

    /* --- ★★ P95：拖起来的那张，原位变成"空槽位"（看起来像被拿下来了）--- */
    const takenCss = (cssNC.match(/\.play-cart\.is-taken\s*\{[^}]*\}/) || [''])[0];
    const startBody = fnBody(jsSide, 'startDrag'), endBody = fnBody(jsSide, 'endDrag');
    ok('★★ P95：拖动时源卡带挂 is-taken（startDrag 加、endDrag 摘 —— 三个收尾路径都走 endDrag）',
        /btn\.classList\.add\('is-taken'\);/.test(startBody) &&
        /btn\.classList\.remove\('is-taken'\);/.test(endBody) &&
        /addEventListener\('pointercancel', function \(\) \{ endDrag\(\); \}\)/.test(jsSide));
    ok('★★ P95：★ 顺序 —— 先克隆出手上那张，**再**让槽位变空（反了手上那张也是空的 ✗）',
        startBody.indexOf('cloneNode(true)') !== -1 &&
        startBody.indexOf('cloneNode(true)') < startBody.indexOf("btn.classList.add('is-taken')"));
    ok('★★ P95：槽位的样子：更深的底 + 虚线的边 + 内阴影（凹进去的那点光）',
        /background-color:\s*rgba\(0,\s*0,\s*0,\s*0?\.\d+\)/.test(takenCss) &&
        /border-style:\s*dashed/.test(takenCss) &&
        /border-color:\s*var\(--panel-line\)/.test(takenCss) &&
        /box-shadow:\s*inset/.test(takenCss),
        takenCss.replace(/\s+/g, ' ').trim().slice(0, 90));
    ok('★★ P95：内容用 visibility 隐藏（**不是** display / 删元素）—— 尺寸不变，卡带栏不会跳',
        /\.play-cart\.is-taken\s*>\s*\*\s*\{\s*visibility:\s*hidden/.test(cssNC) &&
        !/\.play-cart\.is-taken[^{}]*\{[^}]*display:\s*none/.test(cssNC));
    ok('★★ P95：空槽上不许留红遮罩（指针捕获期间残留的 :hover 会把它点亮）——靠源序压住，'
        + '所以这条规则必须排在 :hover::after **之后**',
        /\.play-cart\.is-taken::after\s*\{\s*opacity:\s*0/.test(cssNC) &&
        cssNC.indexOf('.play-cart.is-taken::after') > cssNC.indexOf('.play-cart:hover::after'));

    /* --- ★★ P96：拿起来的手感（延迟跟手 + 轻微上移放大）--- */
    ok('★★ P96：延迟跟手用**和 crosshair.js 同一套公式**（k = 1 - Math.pow(1 - EASE, dt)，'
        + 'dt 按 60fps 归一化）',
        /const EASE_GHOST = 0\.\d+;/.test(jsSide) &&
        /1 - Math\.pow\(1 - EASE_GHOST, dt\)/.test(jsSide) &&
        /\(now - lastFrame\) \/ \(1000 \/ 60\)/.test(jsSide));
    ok('★★ P96：自己开一条 rAF（**不用** World.onFrame —— 游乐区开着时 World 是 paused 的 ✗），'
        + '而且只在拖动期间跑、松手立刻 cancel',
        /window\.requestAnimationFrame\(ghostFrame\)/.test(jsSide) &&
        !/World\.onFrame/.test(jsSide) &&
        /if \(!dragging \|\| !ghost\) \{ easing = false; return; \}/.test(jsSide) &&
        fnBody(jsSide, 'stopGhostLoop').indexOf('cancelAnimationFrame') !== -1 &&
        fnBody(jsSide, 'endDrag').indexOf('stopGhostLoop();') !== -1);
    ok('★★ P96：拿起来那一下 = 轻微上移 + 稍微放大（LIFT_Y / LIFT_SCALE 都进同一个 transform，'
        + '而且走缓动推进）',
        /const LIFT_Y = -\d+;/.test(jsSide) && /const LIFT_SCALE = 1\.\d+;/.test(jsSide) &&
        /\(gy - holdY \+ LIFT_Y \* lift\)/.test(jsSide) &&
        /1 \+ \(LIFT_SCALE - 1\) \* lift/.test(jsSide) &&
        /1 - Math\.pow\(1 - EASE_LIFT, dt\)/.test(jsSide));
    ok('★ P96：缓动起点钉在指针上（否则从上一张卡带的位置飞过来 ✗）+ 记住"抓在卡带哪个点"'
        + '（拿起来时卡带不该在手底下跳一下）',
        /gx = tx = e\.clientX;/.test(jsSide) && /gy = ty = e\.clientY;/.test(jsSide) &&
        /holdX = r \? \(e\.clientX - r\.left\) : 20;/.test(jsSide) &&
        /holdY = r \? \(e\.clientY - r\.top\) : 20;/.test(jsSide));
    ok('★ P96：降低动效时**不演这套**（direct：moveGhost 里 easing=false 就直接到位）',
        /prefers-reduced-motion: reduce/.test(jsSide) &&
        /if \(!easing\) \{ gx = x; gy = y; lift = 1; paintGhost\(\); \}/.test(jsSide) &&
        /if \(reduce\) moveGhost\(e\.clientX, e\.clientY\);/.test(jsSide));
    ok('★ P96：浮起卡带只走合成器（will-change: transform），拖动期间不读布局',
        /will-change:\s*transform/.test(ghostCss));

    ok('★★ 点过的那张：回执收起来，直到鼠标移出（clicked 闸门）',
        /let clicked = false;/.test(jsSide) &&
        /clicked = true;/.test(jsSide) &&
        /if \(closing \|\| !hovered \|\| clicked\) return;/.test(jsSide) &&
        /* ★ 注意：jsSide 是 codeOnly() 过的 —— 注释被换成空格了，
           所以这里绝不能拿注释里的字当锚点（第一版就是这么假红的）。 */
        /addEventListener\('mouseleave'[\s\S]{0,140}?clicked = false;/.test(jsSide));
})();

/* ============================================================
   2y. 拖动的实现路线：从"给全局封锁开后门"改成"自己实现指针拖拽"（P79 → P80）
   ------------------------------------------------------------
   P79 的发现没错：这个站有两道全局封锁挡着**原生**拖放 ——
     ① `body { -webkit-user-drag: none }`（会继承）；
     ② document 级 `dragstart` 无条件 preventDefault()。
   两处都开了后门之后，用户的鼠标**仍然**拖不动 → 于是 P80 不再跟 UA 的门槛
   猜：拖动改成自己实现的指针拖拽（pointerdown/move/up + 位移阈值），
   跟这两个属性、跟原生拖放事件完全无关。所以：
     · 两条全局封锁**恢复原状**（后门撤掉）；
     · 卡带也不再声明 draggable / 不再恢复 -webkit-user-drag；
     · 但 crosshair.js 那个手势冲突（mousedown 起步的框选量取）仍然要挡 ——
       它和用什么方式实现拖动无关。
   ============================================================ */
section('[2y] 拖动路线：指针拖拽，不依赖原生拖放（P79 → P80）');
(function allowCartDrag() {
    const jsMain = codeOnly(read('js/main.js'));
    const jsSide = codeOnly(read('js/sidebar.js'));

    ok('★ 全局那条 reset 仍在（body 上 user-drag / touch-callout 都是 none）',
        /-webkit-user-drag:\s*none/.test(cssNC) && /-webkit-touch-callout:\s*none/.test(cssNC));
    ok('★★ 全局 dragstart 恢复成一律 preventDefault —— P79 那个"卡带例外"已撤',
        /addEventListener\('dragstart'[\s\S]{0,320}?e\.preventDefault\(\);/.test(jsMain) &&
        !/closest\('\.play-cart'\)/.test(jsMain));
    ok('★★ 卡带也不再要 draggable / 不再恢复 -webkit-user-drag（指针拖拽用不上）',
        !/btn\.draggable/.test(jsSide) &&
        !/\.play-cart \*\s*\{[^}]*-webkit-user-drag/.test(cssNC));

    /* ★★ 顺带排掉一个冲突：crosshair.js 的框选量取也是从 mousedown 起步的。
       在卡带上按下时它必须让开 —— 否则（尤其参考线开着时）拖卡带会同时
       画出一个量取框，两个拖拽手势打架。 */
    ok('★★ 按在卡带上时，框选量取让开（不开始 pressing）',
        /addEventListener\("mousedown"[\s\S]{0,400}?closest\('\.play-cart'\)[\s\S]{0,80}?pressing = false;[\s\S]{0,40}?return;/
            .test(codeOnly(read('js/crosshair.js'))));
})();

/* ============================================================
   2z. 开始游戏：iframe 惰性挂载 + 开门复位（P81）
   ------------------------------------------------------------
   两件事：
     · 真装"开始游戏"：拖到舞台上 / 点「开始游戏」→ 往 .play-stage 里挂一个
       iframe（src 取自 works.js）。惰性 = 设 src 那一刻才开始下那 14~23MB；
       换游戏 / 关门都 replaceChildren 清掉（释放 WebGL 上下文）。
     · 关掉再打开要回到干净状态：复位放在**开门时**（那会儿面板还在屏幕外，
       复位谁也看不见），而不是关门时（面板正在滑走，换内容看得出来）。
   ============================================================ */
section('[2z] 开始游戏：iframe 惰性挂载 + 开门复位（P81）');
(function mountGame() {
    const jsSide = codeOnly(read('js/sidebar.js'));
    const loadingCss = (cssNC.match(/\.play-loading\s*\{[^}]*\}/) || [''])[0];
    const frameCss = (cssNC.match(/\.play-frame\s*\{[^}]*\}/) || [''])[0];
    const stageCss = (cssNC.match(/\.play-stage\s*\{[^}]*\}/) || [''])[0];

    ok('★★ 舞台里多了"游戏层"（.play-stage），iframe 挂它里面',
        /* ★ P99：stage 里现在还住着那块开场黑幕，所以不再要求"空标签" ✓ */
        /<div class="play-stage" data-play="stage">[\s\S]{0,600}?<\/div>/.test(html) &&
        /<div class="play-curtain" data-play="curtain"/.test(html) &&
        /const playStage = aside\.querySelector\('\[data-play="stage"\]'\)/.test(jsSide));
    /* ★ 原来这里用一个 1200 字的窗口去"框住" frame.src 那行 —— 后来 startGame 里
       多挂了几件事（guardDoc / hookConsole / registerAudio）就框不住了 ✗。
       改成断言**不变量**：全文件只有一处给 frame 设 src、而且取自 w.src ✓
       （引号也不挑：格式化器会把 ' 换成 " ✓）。★ P99：那段搬进了 mountGame() ——
       载入游戏这件事现在只在"幕布全黑"那一刻发生 ✓ */
    ok('★★ 惰性：只有真的挂载（mountGame）才设 src，而且 src 取自 works.js（没有写死的路径）',
        (jsSide.match(/frame\.src = w\.src;/g) || []).length === 1 &&
        fnBody(jsSide, 'mountGame').indexOf('frame.src = w.src;') !== -1 &&
        fnBody(jsSide, 'startGame').indexOf('frame.src') === -1 &&
        !/\.src = ['"]assets\//.test(jsSide));
    ok('★★ 卸载时机：换游戏 / 关门都 replaceChildren（WebGL 上下文很贵）',
        fnBody(jsSide, 'stopGame').indexOf('replaceChildren()') !== -1 &&
        /* ★ P100：换卡带那条路（拖到舞台上）要多传 keepRunning=true，先别关上一局 ✓ */
        /if \(!keepRunning && playingGame && playingGame !== id\) stopGame\(\);/.test(jsSide) &&
        /* ★ P82：关门那条改走 exitGame()（= stopGame + 退回详情页）
           ★ P102：exitGame 现在带 keepIntro 参数（"点卡带停止运行"那一拍要在黑幕
             全黑时收掉本局，不能把过场掐掉 ✓） */
        /closing = true;[\s\S]{0,120}?exitGame\(\);/.test(jsSide) &&
        /function exitGame\(keepIntro\)[\s\S]{0,160}?stopGame\(keepIntro\);/.test(jsSide));
    /* ★ 引号不挑：格式化器会把 ' 换成 "，断言只该管行为 ✓（下面几处同理） */
    ok('★★ 载入层：iframe 的 load 一到就加 is-loaded，CSS 里淡掉',
        /addEventListener\(['"]load['"], function \(\)[\s\S]{0,200}?classList\.add\(['"]is-loaded['"]\)/.test(jsSide) &&
        /\.play-body\.is-loaded \.play-loading\s*\{[^}]*opacity:\s*0/.test(cssNC));
    ok('★ 载入层底色用面板色（顺手挡住 Unity 首帧白闪）；iframe 自己垫黑',
        /background:\s*var\(--navbar-bg/.test(loadingCss) && /background:\s*#000/.test(frameCss));
    ok('★★ 游戏层平时不吃事件（否则盖住「开始游戏」按钮），进 play 才放开',
        /pointer-events:\s*none/.test(stageCss) &&
        /\[data-state="play"\] \.play-stage\s*\{[^}]*pointer-events:\s*auto/.test(cssNC));

    /* --- ★★ P99：开场三拍（md 闪没 → 黑幕 → 载入 → 渐出）--- */
    const curtainCss = (cssNC.match(/\.play-curtain\s*\{[^}]*\}/) || [''])[0];
    ok('★★ P99：黑幕是 .play-stage 的**兄弟**（不是子元素）—— 住在里面会被 stopGame 的'
        + ' replaceChildren() 连根拔掉 ✗',
        html.indexOf('class="play-curtain"') > html.indexOf('class="play-stage"') &&
        html.indexOf('class="play-curtain"') < html.indexOf('class="play-msg"'));
    ok('★★ P99：黑幕占满游戏区、纯黑、不吃鼠标，而且只盖住游戏层（z-index 2 < 回执的 3）',
        /position:\s*absolute/.test(curtainCss) && /inset:\s*0/.test(curtainCss) &&
        /background:\s*#000/.test(curtainCss) &&
        /pointer-events:\s*none/.test(curtainCss) &&
        /z-index:\s*2/.test(curtainCss) &&
        /\.play-msg\s*\{[^}]*z-index:\s*3/.test(cssNC) &&
        /opacity:\s*0/.test(curtainCss) && /visibility:\s*hidden/.test(curtainCss));
    ok('★★ P99：渐入 / 渐出是两条 keyframes（is-in → is-out），时长和 JS 的常数对得上',
        /\.play-curtain\.is-in\s*\{[^}]*animation:\s*playCurtainIn\s+(\d+)ms[^;]*forwards/.test(cssNC) &&
        /\.play-curtain\.is-in\.is-out\s*\{[^}]*animation:\s*playCurtainOut\s+(\d+)ms[^;]*forwards/.test(cssNC) &&
        /@keyframes playCurtainIn\s*\{[\s\S]{0,200}?opacity:\s*1/.test(cssNC) &&
        /@keyframes playCurtainOut\s*\{[\s\S]{0,200}?opacity:\s*0/.test(cssNC));
    ok('★★ P99：第一拍"md 内容闪烁消失"= .play-body.is-starting 下的台阶动画（250ms 硬切 + forwards）',
        /\.play-body\.is-starting \.play-readme,\s*\n\.play-body\.is-starting \.play-spec\s*\{\s*\n\s*animation:\s*playMdOut\s+250ms\s+steps\(1,\s*end\)\s+forwards/.test(cssNC) &&
        /@keyframes playMdOut\s*\{[\s\S]{0,400}?100%\s*\{\s*\n\s*opacity:\s*0/.test(cssNC));
    /* 三处跨文件时长 —— 改 CSS 忘了改 JS（或反过来）就会"某一拍对不上" ✗ */
    const durOf = function (re) { return parseFloat((re.exec(cssNC) || [])[1] || '0'); };
    const inMs = durOf(/playCurtainIn\s+(\d+)ms/), outMs = durOf(/playCurtainOut\s+(\d+)ms/);
    const mdMs = durOf(/playMdOut\s+(\d+)ms/);
    ok('★★ P99：CSS 的三个时长与 JS 的常数逐个相等（幕布渐入 ' + inMs + ' / 渐出 ' + outMs +
        ' / md 闪没 ' + mdMs + '）',
        inMs > 0 && outMs > 0 && mdMs > 0 &&
        new RegExp('const CURTAIN_IN_MS = ' + inMs + ';').test(jsSide) &&
        new RegExp('const CURTAIN_OUT_MS = ' + outMs + ';').test(jsSide) &&
        new RegExp('const MD_OUT_MS = ' + mdMs + ';').test(jsSide) &&
        /const CURTAIN_HOLD_MS = 450;/.test(jsSide));
    ok('★★ P99/P100/P101：时序串在 startGame 里 —— md 闪没 →（停 0.4s）幕布渐入 →（250ms）'
        + '**这时才 mountGame** →（有注意就先闪 3s）→ 再走"剩下的动画"（450ms 停 → 渐出 → 收尾）；'
        + '而且 startGame 自己**不建 iframe**',
        (function () {
            const b = fnBody(jsSide, 'startGame');
            const iSwap = b.indexOf('if (swapping) { curtainIn(); return; }');
            const iStart = b.indexOf("classList.add('is-starting')");
            const iHold = b.indexOf('setTimeout(curtainIn, MD_HOLD_MS)');
            const iFn = b.indexOf('curtainIn = function');
            const iAddIn = b.indexOf("classList.add('is-in')");
            const iMount = b.lastIndexOf('mountGame(w)');   // ★ 最后那一处 —— 前面那个是降级分支 ✓
            const iNotice = b.indexOf("noticeEl.classList.add('is-on')");
            const iAfterNotice = b.indexOf('setTimeout(curtainRest, NOTICE_OUT_MS)');
            const iRestCall = b.indexOf('curtainRest();', iMount);
            /* 「剩下的动画」那一段（curtainRest）自己的顺序：先渐出 → 再收尾 ✓ */
            const restBody = b.slice(b.indexOf('curtainRest = function'),
                b.indexOf('curtainIn = function'));
            return iFn !== -1 && iSwap !== -1 && iSwap < iStart && iStart < iHold &&
                iAddIn > iFn && iAddIn < iMount && iMount < iMount + 1 &&
                iNotice > iMount && iNotice < iAfterNotice && iRestCall > iAfterNotice &&
                restBody.indexOf("classList.add('is-out')") !== -1 &&
                restBody.indexOf("classList.add('is-out')") < restBody.indexOf('cancelIntro();') &&
                b.indexOf('createElement') === -1;
        })(), fnBody(jsSide, 'startGame').replace(/\s+/g, ' ').slice(0, 120));
    ok('★★ P100/P104：正在跑游戏时拖入新卡带（或空卡带）→ **直接**渐入黑幕（不闪 md、不停 0.4s），'
        + '全黑那一刻才关上一局（exitGame(true) = 关掉 + 退回详情页，keepIntro 保住正在演的过场）',
        /const swapping = !!playingGame;/.test(jsSide) &&
        /const playable = hasPlayableSrc\(w\);/.test(jsSide) &&
        /if \(playable && playingGame === w\.id\) return;/.test(jsSide) &&
        /if \(swapping\) \{ curtainIn\(\); return; \}/.test(jsSide) &&
        /if \(swapping\) exitGame\(true\);/.test(jsSide) &&
        /if \(playable\) mountGame\(w\);/.test(jsSide) &&
        /function stopGame\(keepIntro\)/.test(jsSide) &&
        /if \(!keepIntro\) cancelIntro\(\);/.test(jsSide) &&
        /const MD_HOLD_MS = 400;/.test(jsSide));
    /* ★★ P100b：拖到舞台上时"内容先别换"—— 屏幕上那份 md 保持上一个卡带的 ✓ */
    ok('★★ P100b：拖到舞台上时内容**先不铺**（deferContent）—— 选中态立刻更新，'
        + '但 md/规格/注意留到全黑那一刻才换（你要的"保持上一个内容"✓）',
        /function select\(id, keepRunning, deferContent\)/.test(jsSide) &&
        /if \(deferContent\) \{ deferredCart = id; return; \}/.test(jsSide) &&
        /function renderSelection\(w\)/.test(jsSide) &&
        /function applyDeferred\(\)/.test(jsSide) &&
        /deferredCart = null;\s*\n\s*renderSelection\(w\);/.test(jsSide) &&
        /* 全黑那一刻补上，且顺序是"补内容 → 挂游戏" ✓ */
        (function () {
            const b = fnBody(jsSide, 'startGame');
            return b.indexOf('applyDeferred();') !== -1 &&
                b.indexOf('applyDeferred();') < b.lastIndexOf('mountGame(w)');
        })() &&
        /* ★★ 没在跑时那句 stopGame 也必须传 true —— 否则它的 cancelIntro→applyDeferred
           会把"待铺的内容"提前铺出来（你报的第一件事就回来了 ✗）
           ★ P104：空卡带那条路上，stopGame 只在"能玩"时才喊（没准要演的）✓ */
        /if \(!swapping && playable\) stopGame\(true\);/.test(jsSide) &&
        /* ★ P104：空卡带 + 没在跑游戏 → 不演黑幕，直接铺详情页 ✓ */
        /if \(!playable\) \{ applyDeferred\(\); return; \}/.test(jsSide) &&
        /function clearIntro\(\)/.test(jsSide) &&
        fnBody(jsSide, 'cancelIntro').indexOf('applyDeferred();') !== -1);
    ok('★★ P100b：拖完那一下的 click 一律吞掉，但只吞"紧跟着"的（带时间戳）——'
        + '拖到卡带外面松手也一样会派发 click（指针被 capture 在卡带上）',
        /let swallowAt = 0;/.test(jsSide) &&
        /swallowClick = true;\s*\n\s*swallowAt = Date\.now\(\);/.test(jsSide) &&
        /const fresh = Date\.now\(\) - swallowAt < 500;/.test(jsSide) &&
        /if \(fresh\) \{ e\.preventDefault\(\); return; \}/.test(jsSide));
    ok('★ P99/P100：降级（降低动效 / 没有舞台或幕布）→ 不演，直接载入（待铺内容同时补上）；'
        + '停游戏 / 复位时过场收干净',
        /if \(reduce \|\| !stageEl \|\| !curtainEl\) \{[\s\S]{0,160}?mountGame\(w\);/.test(jsSide) &&
        /if \(reduce \|\| !stageEl \|\| !curtainEl\) \{[\s\S]{0,160}?applyDeferred\(\);/.test(jsSide) &&
        fnBody(jsSide, 'stopGame').indexOf('cancelIntro();') !== -1 &&
        /* ★ P100b：清类那几行搬进了 clearIntro（cancelIntro = clearIntro + 补上待铺内容）✓ */
        fnBody(jsSide, 'clearIntro').indexOf("classList.remove('is-starting')") !== -1 &&
        fnBody(jsSide, 'clearIntro').indexOf("classList.remove('is-in', 'is-out')") !== -1 &&
        fnBody(jsSide, 'cancelIntro').indexOf('clearIntro();') !== -1 &&
        fnBody(jsSide, 'cancelIntro').indexOf('applyDeferred();') !== -1);
    ok('★★ 开门时复位：选中置空 + 状态回 empty + 卡带按下态清掉 + 回执收掉',
        /function resetStage\(\)[\s\S]{0,520}?dataset\.state = 'empty'/.test(jsSide) &&
        /function open\(from\)[\s\S]{0,420}?resetStage\(\);/.test(jsSide) &&
        /aria-pressed', 'false'/.test(jsSide) && /cartResets\.forEach/.test(jsSide));
    ok('★ 「开始游戏」按钮接上了（点击选中那条路也能开）',
        /data-play="start"/.test(html) &&
        /startBtn\.addEventListener\('click', function \(\) \{ startGame\(\); \}\)/.test(jsSide));
    ok('★ iframe 的权限写全（全屏 / 自动播放 / 手柄）',
        /setAttribute\(['"]allow['"], ['"]fullscreen; autoplay; gamepad['"]\)/.test(jsSide) &&
        /setAttribute\(['"]allowfullscreen['"], ['"]['"]\)/.test(jsSide));

    /* ★★ P82：游戏自己喊"我退出了" —— 桌面版的 Application.Quit() 在网页里
       会把 WebGL 播放循环停掉（最后一帧留在画布上 = "卡住"），站点接不住它，
       但可以约定一句 postMessage：收到就拔 iframe、退回这条游戏的详情页。 */
    ok('★★ 接住游戏发来的"我退出了"（postMessage），收到就 exitGame()',
        /window\.addEventListener\('message'/.test(jsSide) &&
        /function msgKind\(data\)/.test(jsSide) &&          // P86 起两种协议都从这里判
        /if \(kind === EXIT_MSG\) \{[\s\S]{0,120}?exitGame\(\);/.test(jsSide));
    ok('★★ 只认当前那个 iframe 发来的消息（比对 e.source，别被别的窗口骗了）',
        /e\.source !== frame\.contentWindow\) return;/.test(jsSide));
    ok('★ 退出 = 卸 iframe + 退回详情页（不是留一个空舞台）',
        /function exitGame\(keepIntro\)[\s\S]{0,160}?stopGame\(keepIntro\);[\s\S]{0,160}?dataset\.state = 'game'/.test(jsSide));
})();

section('[2aa] 把浏览器抢走的键盘 / 右键还给游戏（P83）');
(function handBackKeys() {
    const jsSide = codeOnly(read('js/sidebar.js'));

    /* 现象：游戏里的 Ctrl+R 被浏览器当成"刷新页面"执行了；右键长按被手势工具接手。
       关键真相：**必须由按键所在的那份文档来拦** —— 焦点进了 iframe，
       父页面的监听什么都收不到。所以守卫要挂两份。 */
    ok('★★ 守卫挂两份：父页面一份，iframe 那份文档一份（焦点在游戏里时父页面收不到键）',
        /guardDoc\(document\)/.test(jsSide) &&
        /guardDoc\(frame\.contentDocument\)/.test(jsSide));
    ok('★ 伸手进 iframe 之前要能失败：跨源时 contentDocument 会抛，包在 try 里',
        /try \{ guardDoc\(frame\.contentDocument\); \} catch/.test(jsSide));
    ok('★ 挂在 load 回调里挂（那一刻文档才在，且 iframe 每次 load 都要重挂）',
        /addEventListener\(['"]load['"], function \(\)[\s\S]{0,400}?guardDoc\(frame\.contentDocument\)/.test(jsSide) &&
        /doc\.__playGuarded/.test(jsSide));            // 自己给自己做去重标记

    /* ★★ 只拦"会毁掉游戏进程"的那几个：不做全键盘吞掉 */
    ok('★★ 拦的是 keydown + preventDefault（拦的是浏览器默认动作，不是事件传播 → 游戏照样收得到）',
        /addEventListener\('keydown', function \(e\) \{\s*if \(isBrowserAction\(e\)\) e\.preventDefault\(\)/.test(jsSide));
    ok('★ 右键菜单同理：两份文档都 preventDefault，浏览器的菜单才不会从游戏画面上弹出来',
        /addEventListener\('contextmenu', function \(e\) \{\s*if \(playingGame && keyGuardOn\) e\.preventDefault\(\)/.test(jsSide) &&
        /playStage\.addEventListener\('contextmenu'/.test(jsSide));
    ok('★★ 整条守卫由 works.js 的 keyGuardOn 管 —— 默认 false（不写就是"什么都不拦"）',
        /function isBrowserAction\(e\) \{\s*if \(!playingGame \|\| !keyGuardOn\) return false;/.test(jsSide) &&
        /keyGuardOn = !!w\.keyGuardOn;/.test(jsSide) &&
        fnBody(jsSide, 'stopGame').indexOf('keyGuardOn = false;') !== -1);
    ok('★ 右键菜单归同一个开关管（不能"键拦了、菜单还照样弹"）',
        /addEventListener\('contextmenu', function \(e\) \{\s*if \(playingGame && keyGuardOn\) e\.preventDefault\(\);/.test(jsSide) &&
        (jsSide.match(/playingGame && keyGuardOn/g) || []).length === 2);
    ok('★ 数据里那两项是布尔（true / false 都合法 —— 别把断言钉在某一侧）',
        /keyGuardOn: (true|false),/.test(read('data/works.js')) &&
        /noticeOn: (true|false),/.test(read('data/works.js')));
    /* ★★ P84：你的游戏绑定是一大堆（Ctrl+T/E/1/2/`/-/= …）。
       逐个列举永远漏，所以改成"带修饰键的一律拦" —— 以后加绑定不用改代码。 */
    ok('★★ 改成"带 Ctrl / Cmd / Alt 的一律拦"，不再逐个列举（旧的白名单必须删掉）',
        /if \(e\.ctrlKey \|\| e\.metaKey\) return ESCAPE_COMBO\.indexOf\(k\) === -1;/.test(jsSide) &&
        /if \(e\.altKey\) return true;/.test(jsSide) &&
        !/BLOCKED_COMBO/.test(jsSide));
    ok('★ F1-F10 一起拦（抢焦点、弹帮助那一排），但 F11 全屏 / F12 控制台必须留着',
        /FUNCTION_KEYS = \['F1', 'F2'[\s\S]{0,60}?'F10'\]/.test(jsSide) &&
        !/FUNCTION_KEYS = \[[^\]]*F1[12]/.test(jsSide));
    ok('★★ Ctrl+W（关标签）是逃生口：游戏卡住时你得能跑掉',
        /ESCAPE_COMBO = \['w'\]/.test(jsSide));
    ok('★★ 输入框里放行 —— Unity 的 WebGL 文本输入靠一个隐藏 input 转手，吃了 Ctrl+V/A/X 游戏里就打不了字',
        /t\.isContentEditable/.test(jsSide) && /INPUT\|TEXTAREA\|SELECT/.test(jsSide));
})();

/* ============================================================
   2ab. 「游玩注意」：黑幕上那行字（P84 → P101 搬家）
   ------------------------------------------------------------
   P84 时它是**游戏区下方**的一块提示；P101 起搬进了开场黑幕：
   黑幕完全不透明之后闪出来、停 3s、闪掉，然后才接黑幕剩下的动画 ✓。
   数据字段没动（works.js 的 noticeOn / notice）✓。
   ============================================================ */
section('[2ab] 游玩注意：黑幕上的那行字（P84 → P101）');
(function noticeBlock() {
    const jsSide = codeOnly(read('js/sidebar.js'));
    const curtainCss = (cssNC.match(/\.play-curtain\s*\{[^}]*\}/) || [''])[0];
    const noticeCss = (cssNC.match(/\.play-curtain-notice\s*\{[^}]*\}/) || [''])[0];

    ok('★★ P101：提示搬进了开场黑幕（.play-curtain 里），游戏区下方那块已经没了',
        html.indexOf('class="play-curtain"') < html.indexOf('data-play="notice"') &&
        !/class="play-notice"/.test(html) &&
        !/play-notice-title/.test(html) &&
        /data-play="notice-list"/.test(html));
    ok('★ P101：幕布上那行字居中显示（幕布本身 flex 居中）+ 内容仍由 JS 按 works.js 渲染',
        /display:\s*flex/.test(curtainCss) && /justify-content:\s*center/.test(curtainCss) &&
        /align-items:\s*center/.test(curtainCss) &&
        /\.play-notice-list/.test(cssNC) && /\.play-notice-item/.test(cssNC),
        '（列表/条目样式还在，只是从"游戏区下方一块"变成"幕布上的一行"）');
    ok('★★ P101：默认不可见（opacity 0 + visibility: hidden），is-on 才闪出来、is-out 才闪掉',
        /opacity:\s*0/.test(noticeCss) && /visibility:\s*hidden/.test(noticeCss) &&
        /\.play-curtain-notice\.is-on\s*\{[^}]*animation:\s*noticeFlicker/.test(cssNC) &&
        /animation:\s*noticeFlicker[\d\s\w]*steps\(1,\s*end\)/.test(cssNC) &&
        /\.play-curtain-notice\.is-on\.is-out\s*\{[^}]*animation:\s*noticeOut/.test(cssNC));
    const flickKf = (cssNC.match(/@keyframes noticeFlicker\s*\{[\s\S]*?\n\}/) || [''])[0];
    const outKf = (cssNC.match(/@keyframes noticeOut\s*\{[\s\S]*?\n\}/) || [''])[0];
    ok('★★ P101：闪烁真的在闪（一串 opacity 台阶）、闪掉是 1 → 0',
        (flickKf.match(/opacity:\s*[01](\.[\d]+)?;/g) || []).length >= 5 &&
        /0%[^}]*opacity:\s*0/.test(flickKf) && /100%[^}]*opacity:\s*1/.test(flickKf) &&
        /0%[^}]*opacity:\s*1/.test(outKf) && /100%[^}]*opacity:\s*0/.test(outKf));
    ok('★ P101：这行字不许吃鼠标（幕布 pointer-events: none + 自己也不吃）',
        /pointer-events:\s*none/.test(curtainCss) && /pointer-events:\s*none/.test(noticeCss));

    /* ★★ P101b：你说的三点 —— 去掉边框 / 容器撑满游戏区 / 字号≈README 二级标题 ✓ */
    const listCss = (cssNC.match(/\.play-notice-list\s*\{[^}]*\}/) || [''])[0];
    const itemCss = (cssNC.match(/\.play-notice-item\s*\{[^}]*\}/) || [''])[0];
    ok('★★ P101b：那行字**没有边框**（列表上下两条线去掉了，整块只靠字站在黑幕上）',
        listCss.length > 0 && !/border/.test(listCss) &&
        /width:\s*fit-content/.test(listCss),
        listCss.replace(/\s+/g, ' ').trim().slice(0, 80));
    ok('★★ P101b：那层容器**撑满整个游戏区**（绝对定位 + inset: 0，字在正中）——'
        + '幕布铺多大它就多大 ✓',
        /position:\s*absolute/.test(noticeCss) && /inset:\s*0/.test(noticeCss) &&
        /display:\s*flex/.test(noticeCss) &&
        /justify-content:\s*center/.test(noticeCss) && /align-items:\s*center/.test(noticeCss));
    const h2Size = parseFloat((/\.play-readme h2\s*\{[^}]*font-size:\s*([\d.]+)rem/.exec(cssNC) || [])[1] || '0');
    const itemSize = parseFloat((/font-size:\s*([\d.]+)rem/.exec(itemCss) || [])[1] || '0');
    ok('★★ P101b：字号 = README 二级标题的字号（' + itemSize + 'rem vs h2 的 ' + h2Size + 'rem）——'
        + '自检比着这两个数，改一边忘另一边会红 ✓',
        h2Size > 0 && itemSize === h2Size, itemSize + ' / ' + h2Size);
    ok('★ P101b：圆点那条内缩还在（::before 绝对定位在 left: 2px，省了会压在字上）',
        /padding-left:\s*1em/.test(itemCss) && /\.play-notice-item::before/.test(cssNC));
    /* 时序：黑幕全黑 → 闪出来 → 停 3s → 闪掉（400ms）→ 才接"剩下的动画" ✓ */
    const noticeOutMs = parseFloat((/noticeOut\s+(\d+)ms/.exec(cssNC) || [])[1] || '0');
    ok('★★ P101：JS 的时间点 —— 停 3s（NOTICE_HOLD_MS），且 NOTICE_OUT_MS 与 CSS 的 noticeOut 时长一致（'
        + noticeOutMs + 'ms）',
        /const NOTICE_HOLD_MS = 3000;/.test(jsSide) &&
        noticeOutMs > 0 && new RegExp('const NOTICE_OUT_MS = ' + noticeOutMs + ';').test(jsSide));
    ok('★★ P101：只有"这条有内容"才闪 —— 没开 / 没写就照常走黑幕剩下的动画 ✓',
        /if \(noticeEl && noticeList && noticeList\.childNodes\.length\) \{/.test(jsSide) &&
        /noticeEl\.classList\.add\('is-on'\)/.test(jsSide) &&
        /noticeEl\.classList\.add\('is-out'\)/.test(jsSide) &&
        /setTimeout\(curtainRest, NOTICE_OUT_MS\)/.test(jsSide) &&
        /const curtainRest = function \(\)/.test(jsSide));
    ok('★★ P101：内容**选中就备好**（renderNotice 只填内容，不碰可见性）——'
        + '可见性完全交给过场那三个类 ✓',
        /function renderNotice\(w\)/.test(jsSide) &&
        fnBody(jsSide, 'renderNotice').indexOf('hidden') === -1 &&
        /renderNotice\(w\);/.test(jsSide) &&
        /function resetStage\(\)[\s\S]{0,400}?renderNotice\(null\);/.test(jsSide) &&
        /function clearIntro\(\)[\s\S]{0,300}?noticeEl\.classList\.remove\('is-on', 'is-out'\)/.test(jsSide));
    /* ★ 这条原来写的是"两条都是 false、不许出现 true" —— 后来**你自己**把
       boom-shooting / fission 的 noticeOn 打开了，于是它开始误报 ✗。
       语义上没有"必须关着"这回事（代码里不写就是关 ✓），所以改成"每条 unity
       都要写这个字段，值是布尔"，不再管你到底开没开 ✓。 */
    const wSrc = read('data/works.js');
    /* ★ 只数**数据行**：注释里也会出现 `kind: 'unity'`（文件头那段说明），
       所以带尾部逗号才算一条真数据 ✓（教训：别拿注释里的字当锚点）。 */
    const unityCount = (wSrc.match(/kind: 'unity',/g) || []).length;
    const noticeCount = (wSrc.match(/noticeOn: (true|false),/g) || []).length;
    ok('★ 每条 unity 都写了 noticeOn（' + noticeCount + '/' + unityCount + '；布尔值，不写 = 默认关）',
        unityCount > 0 && noticeCount >= unityCount);
})();

/* ============================================================
   2ac. 卡带的光标：抓着 / 握住（P85）
   ============================================================ */
section('[2ac] 卡带光标："抓" 与拖动中的 "握住"（P85）');
(function cartCursor() {
    /* ★★ 根因：光标取的是"指针下**最深**的那个元素"。`body.sidebar-open *`
       （0,1,1）那条 cursor: auto !important 管着 .play-cart-no / -name
       这些孩子 —— 所以光标一移到卡带的文字上就变回箭头。孩子必须点名。 */
    ok('★★ 卡带 + 卡带里的文字都是"抓"（只写 .play-cart 会被它的孩子顶掉）',
        /body\.sidebar-open \.play-cart,\s*body\.sidebar-open \.play-cart \*\s*\{[^}]*cursor:\s*grab !important/.test(cssNC));
    ok('★★ 按住（:active）→ "握住"',
        /body\.sidebar-open \.play-cart:active,\s*body\.sidebar-open \.play-cart:active \*\s*\{[^}]*cursor:\s*grabbing !important/.test(cssNC));
    ok('★★ 拖动期间整块面板都是"握住"（挂在 body 上 —— 抓住指针后指针早就不在卡带上了）',
        /body\.is-cart-dragging,[\s\S]{0,320}?cursor:\s*grabbing !important/.test(cssNC) &&
        /body\.is-cart-dragging \.play-close[\s\S]{0,240}?cursor:\s*grabbing !important/.test(cssNC));
    ok('★★ 拖动期间游戏层不吃指针 —— 否则滑过"正在跑的游戏"时，光标归 iframe 里那份文档管，"握住"断在那儿',
        /\.play-body\.is-dragging \.play-stage\s*\{[^}]*pointer-events:\s*none/.test(cssNC));
    ok('★ 落点判定用的是 stageEl 的矩形，不靠 pointer-events —— 所以上面那条关得放心',
        /const overStage = \(x, y\) => overEl\(stageEl, x, y\);/.test(codeOnly(read('js/sidebar.js'))) &&
        /\.getBoundingClientRect\(\)/.test(codeOnly(read('js/sidebar.js'))));
    ok('★ 拖动开始 / 收尾各自加、摘 body 上那个类',
        /function startDrag[\s\S]{0,520}?body\.classList\.add\('is-cart-dragging'\)/.test(codeOnly(read('js/sidebar.js'))) &&
        /function endDrag[\s\S]{0,420}?body\.classList\.remove\('is-cart-dragging'\)/.test(codeOnly(read('js/sidebar.js'))));
})();

/* ============================================================
   2ad. 游戏发来的回执（P86）
   ============================================================ */
section('[2ad] 游戏 → 站点：屏幕上的回执（P86）');
(function gameMessage() {
    const jsSide = codeOnly(read('js/sidebar.js'));
    const msgCss = (cssNC.match(/\.play-msg\s*\{[^}]*\}/) || [''])[0];

    ok('★★ 游戏层里多了一个 .play-msg（排在 .play-stage 之后 → 盖在画面上）',
        /<div class="play-msg" data-play="msg" role="status"/.test(html) &&
        html.indexOf('data-play="stage"') < html.indexOf('data-play="msg"'));
    ok('★ 读屏会念（role=status + aria-live）', /aria-live="polite"/.test(html));
    ok('★★ 它不能挡住游戏吃鼠标（贴字，不是盖一层玻璃）',
        /pointer-events:\s*none/.test(msgCss) && /position:\s*absolute/.test(msgCss) &&
        /z-index:\s*\d/.test(msgCss));
    /* ★★ 这一段字是运行时从游戏来的，站点预知不了 —— 用展示字体的话，一个子集外的字
       就会去拉 3.2MB 的 HuXiaoBo-Full。所以这里必须是系统字体。 */
    ok('★★ 回执用系统字体（运行时文字 → 别为了一个生僻字去拉 3.2MB 的原字体）',
        /font-family:\s*system-ui/.test(msgCss) && /\.play-msg\.is-on/.test(cssNC));

    ok('★★ 两种协议都认：字符串前缀（jslib 拼字符串最省事）+ 对象（能带 ms）',
        /const MSG_KIND = 'resolualysis:play-msg';/.test(jsSide) &&
        /data\.indexOf\(MSG_KIND\) === 0/.test(jsSide) &&
        /showMessage\(data\.text, data\.ms\);/.test(jsSide));
    ok('★ 字符串里那句"前缀 + 文字"要剥干净（前缀 + 冒号/空白）',
        /data\.slice\(MSG_KIND\.length\)\.replace\(\/\^\[:\\s\]\+\/, ''\)/.test(jsSide));
    ok('★★ 按不可信输入对待：单行化 + 截断 + 防刷（窗口可调）+ 空文字=收掉',
        /replace\(\/\[\\r\\n\\t\]\+\/g, ' '\)/.test(jsSide) &&
        /\.slice\(0, MSG_MAX\)/.test(jsSide) &&
        /if \(t === msgLast\.text && now - msgLast\.at < win\) return;/.test(jsSide) &&
        /if \(!t\) \{ hideMessage\(\); return; \}/.test(jsSide));
    ok('★★ 回执用 textContent 写（这一段是外部字符串）；全站唯一的 innerHTML 只属于 README 那一处',
        /msgEl\.textContent = t;/.test(jsSide) &&
        (jsSide.match(/innerHTML/g) || []).length === 1 &&
        /readmeEl\.innerHTML = html;/.test(jsSide));
    ok('★ 新的一条顶掉旧的（不排队）+ ms=0 可以一直挂着',
        /if \(msgTimer\) clearTimeout\(msgTimer\);/.test(jsSide) &&
        /stay = \(typeof ms === 'number' && ms >= 0\) \? ms : MSG_MS/.test(jsSide) &&
        /stay > 0 \? setTimeout\(hideMessage, stay\) : 0/.test(jsSide));
    ok('★★ 游戏一停（stopGame）回执就跟着收掉 —— 不留上一局的残影',
        fnBody(jsSide, 'stopGame').indexOf('hideMessage();') !== -1);

    /* --- ★★ P87：同源时把 iframe 的控制台接到屏幕回执上（不用 jslib 的那条路）--- */
    ok('★★ P87：iframe 的 console 在 load 时被套一层（同源才做得到，跨源静默跳过）',
        /hookConsole\(frame\.contentWindow\)/.test(jsSide) &&
        /function hookConsole\(win\)/.test(jsSide) &&
        /win\.__playConsoleHooked/.test(jsSide));
    ok('★★ 只放行 SITE: 前缀的 log（不然 Unity 自己的日志会一行一闪）；error / warn 一律上屏',
        /const CONSOLE_TAG = 'SITE:';/.test(jsSide) &&
        /if \(line\.indexOf\(CONSOLE_TAG\) === 0\)/.test(jsSide) &&
        /wrap\('error', 'ERR', false\)/.test(jsSide) &&
        /wrap\('warn', 'WARN', false\)/.test(jsSide) &&
        /wrap\('log', '', true\)/.test(jsSide));
    ok('★★ 控制台回执要防刷屏：更宽的防重窗口 + 一局里的条数上限（stopGame 归零）',
        /const MSG_ERR_DEDUPE = 4000;/.test(jsSide) &&
        /msgErrShown >= MSG_ERR_MAX/.test(jsSide) &&
        fnBody(jsSide, 'stopGame').indexOf('msgErrShown = 0;') !== -1);
    ok('★ 套层里出事不许影响游戏本身：原函数照旧被调用（try 包住自己的活）',
        /return orig\.apply\(win\.console, arguments\);/.test(jsSide) &&
        /try \{[\s\S]{0,400}?reportConsole/.test(jsSide));
})();

/* ============================================================
   2ae. 游戏详细页 = 一页 README（P91）
   ============================================================ */
section('[2ae] 游戏详细页 = 一页 README（P91）');
(function readmeWiring() {
    const jsSide = codeOnly(read('js/sidebar.js'));
    const jsMd = read('js/markdown.js');
    const sideCss = cssNC;

    ok('★★ 游乐区里多了一块 .play-readme，而且**排在游戏层之前**（它是普通流里的兄弟，不是盖上去的）',
        /<div class="play-readme" data-play="readme"><\/div>/.test(html) &&
        html.indexOf('class="play-readme"') < html.indexOf('class="play-stage"') &&
        html.indexOf('class="play-spec"') < html.indexOf('class="play-readme"'));
    ok('★ 可见性靠 class（.play-body.is-readme），**不用 hidden 属性** —— 两者会打架（见 .play-notice 那段）',
        /\.play-readme\s*\{\s*display:\s*none/.test(sideCss) &&
        /\.play-body\.is-readme\s+\.play-readme\s*\{[^}]*display:\s*block/.test(sideCss) &&
        !/class="play-readme"[^>]*hidden/.test(html));

    /* ★★ 字体分工：标题/表头 → 展示字体；正文 → 系统字体。
       这条也是"只有标题和表头要进字体子集"的依据（见 _dev/glyph-set.js 的 mdChars）。 */
    ok('★★ 正文用系统字体、标题/表头显式写回展示字体（不写就等于标题也走了系统字体）',
        /\.play-readme\s*\{[^}]*font-family:\s*system-ui/.test(sideCss) &&
        /\.play-readme h1,\s*\n\.play-readme h2[\s\S]{0,400}?font-family:\s*"HuXiaoBo"/.test(sideCss) &&
        /\.play-readme table\.md-table th\s*\{[^}]*font-family:\s*"HuXiaoBo"/.test(sideCss));
    ok('★★ 字色走 --play-ink（面板在深浅两套主题里都是暗的，不能用会跟着主题翻的 --text）',
        /--play-ink:\s*#E1E1E1/.test(sideCss) && /color:\s*var\(--play-ink/.test(sideCss));

    /* --- ★★ P93e：README 的滚动条（长文必须看得出"还能滚"，而且要配暗面板）--- */
    /* ★ 取"某个选择器所在的规则块"：滚动条那几条是**共用一条规则**的
       （`.play-readme::-webkit-scrollbar, .play-readme pre.md-code::-webkit-scrollbar { … }`），
       所以不能写 `选择器\s*\{` —— 中间还夹着逗号续行 ✗；
       也别在搜索串里带尾逗号（它可能是选择器表里的**最后一个**，末尾就没有逗号）。 */
    const ruleOf = function (sel) {
        const at = sideCss.indexOf(sel);
        if (at < 0) return '';
        const open = sideCss.indexOf('{', at);
        const close = sideCss.indexOf('}', open);
        return (open < 0 || close < 0) ? '' : sideCss.slice(open + 1, close);
    };
    ok('★（前置）README 这块自己滚（overflow-y: auto）—— 有内容滚得动才谈得上滚动条',
        /\.play-body\.is-readme\s+\.play-readme\s*\{[^}]*overflow-y:\s*auto/.test(sideCss));
    ok('★★ P93e：滚动条走 --play-* 那一套（不跟主题翻）—— 标准属性 + ::-webkit-* 两套都写',
        /\.play-readme\s*\{[^}]*scrollbar-width:\s*thin/.test(sideCss) &&
        /\.play-readme\s*\{[^}]*scrollbar-color:\s*var\(--play-line\)\s+transparent/.test(sideCss) &&
        /width:\s*10px/.test(ruleOf('.play-readme::-webkit-scrollbar')) &&
        /var\(--play-line\)/.test(ruleOf('.play-readme::-webkit-scrollbar-thumb')),
        ruleOf('.play-readme::-webkit-scrollbar'));
    ok('★★ P93e：滑块"细"是 border + background-clip 做的，所以 hover **只能改 background-color**' +
        '（用 background 简写会把 clip 重置 → 指上去的一瞬间滑块变宽、跳一下 ✗）',
        /background-clip:\s*content-box/.test(ruleOf('.play-readme::-webkit-scrollbar-thumb')) &&
        /border:\s*2px solid transparent/.test(ruleOf('.play-readme::-webkit-scrollbar-thumb')) &&
        /background-color:\s*var\(--accent\)/.test(ruleOf('.play-readme::-webkit-scrollbar-thumb:hover')) &&
        /* ★ 只查**我们这几条**：main 那条老滚动条用的就是 background 简写（它没有细滑块，无所谓） */
        !/\.play-readme[^{}]*scrollbar-thumb:hover[^{}]*\{\s*background:/.test(sideCss));
    ok('★ P93e：代码块的**横向**滚动条同款（长命令行不会突然冒出一条系统默认滚动条）',
        /\.play-readme pre\.md-code\s*\{[^}]*scrollbar-width:\s*thin/.test(sideCss) &&
        /height:\s*8px/.test(ruleOf('.play-readme pre.md-code::-webkit-scrollbar')) &&
        /pre\.md-code::-webkit-scrollbar-thumb:hover/.test(sideCss));

    ok('★★ 解析器零依赖、纯函数：不碰 DOM、不发请求（只有 escapeHtml / slug / toHtml / safeUrl）',
        /global\.Markdown = \{/.test(jsMd) &&
        !/document\.|querySelector|fetch\(/.test(jsMd) &&
        !/require\(|import /.test(jsMd));
    ok('★★ 源文本**整体先转义**再解析 → .md 里写内联 HTML 不会被执行（只会原样显示）',
        /const text = escapeHtml\(String\(src/.test(jsMd));
    ok('★★ URL 白名单：只放行 http/https/mailto，其余带 scheme 的一律丢掉（javascript: / data: 都拦）',
        jsMd.indexOf('function safeUrl(raw)') !== -1 &&
        jsMd.indexOf('/^[a-z][a-z0-9+.\\-]*:/i') !== -1 &&          // 先判"有没有 scheme"
        jsMd.indexOf('/^(https?|mailto):/i') !== -1 &&            // 有 scheme 的只放行这两个
        jsMd.indexOf("? s : ''") !== -1);                         // 其余一律丢掉

    ok('★★ 接线：select() 里 loadReadme、resetStage() 里 hideReadme',
        /renderNotice\(w\);[\s\S]{0,120}?loadReadme\(w\);/.test(jsSide) &&
        /function resetStage\(\)[\s\S]{0,400}?hideReadme\(\);/.test(jsSide));
    ok('★★ 取不到就退回 detail（页面不会空）：catch 分支走 readmeFallback',
        /\.catch\(function \(err\) \{[\s\S]{0,220}?readmeFallback\(w,/.test(jsSide) &&
        /const items = \(w && w\.detail\) \|\| \[\]/.test(jsSide));
    ok('★ 按路径缓存 + 到达时比对 token（切了卡带就不许把旧内容盖上来）',
        /if \(readmeCache\[path\] != null\) \{ renderReadme\(readmeCache\[path\]\); return; \}/.test(jsSide) &&
        /if \(token !== readmeToken\) return;/.test(jsSide));
    ok('★ 没写 readme / 没有 Markdown / 没有 fetch → 一律安静地保持原样（不报错、不空页）',
        /if \(!path\) \{ hideReadme\(\); return; \}/.test(jsSide) &&
        /typeof Markdown === 'undefined' \|\| typeof fetch !== 'function'/.test(jsSide));
    ok('★ markdown.js 的 script 排在 sidebar.js 之前（渲染时要用它）',
        html.indexOf('<script src="js/markdown.js">') !== -1 &&
        html.indexOf('<script src="js/markdown.js">') < html.indexOf('<script src="js/sidebar.js">'));

    ok('★★ P91b：README 里的 #锚点由站点接管 —— 面板自己滚，不动整页 hash',
        /readmeEl\.addEventListener\('click'/.test(jsSide) &&
        /if \(href\.charAt\(0\) !== '#'\) return;/.test(jsSide) &&
        /readmeEl\.scrollTop \+= \(r\.top - c\.top\) - 10;/.test(jsSide));
    ok('★ 锚点用 id 逐个比对，**不拼** "#" + id 选择器（数字开头的 id 会让选择器直接抛）',
        /querySelectorAll\('\[id\]'\)/.test(jsSide) && !/querySelector\('#' \+ /.test(jsSide));

    /* works.js 里的 readme 路径必须**真的存在** —— 写错一个字会静默退回 detail，
       页面上看不出任何异常 ✗，所以这条由自检来喊 ✓ */
    const readmePath = (/readme: '([^']+)'/.exec(read('data/works.js')) || [])[1] || '';
    ok('★ works.js 里 readme 指向的 .md 真的存在：' + (readmePath || '(没写)'),
        !!readmePath && fs.existsSync(path.join(ROOT, readmePath)));
})();

/* ============================================================
   2af. 导航栏上的"游戏控件"：关闭 / 静音 / 全屏（P93）
   ============================================================ */
section('[2af] 导航栏上的游戏控件：关闭 / 静音 / 全屏（P93）');
(function playControls() {
    const jsSide = codeOnly(read('js/sidebar.js'));

    ok('★★ 导航栏里多了一组 .play-controls（三个键：关闭 / 静音 / 全屏）',
        /<div class="play-controls" role="group"/.test(html) &&
        /data-play="ctl-close"/.test(html) && /data-play="ctl-mute"/.test(html) &&
        /data-play="ctl-full"/.test(html));
    ok('★ 静音 / 全屏是"开关"：带 aria-pressed，而且**没在玩游戏时 disabled**',
        /data-play="ctl-mute"[^>]*aria-pressed="false"[^>]*disabled/.test(html) &&
        /data-play="ctl-full"[^>]*aria-pressed="false"[^>]*disabled/.test(html));

    /* ★★ 这就是"收起的一瞬间还回来"的全部实现：纯 class 驱动，没有 JS 定时器。
       close() 第一件事就是摘掉 body.sidebar-open → 导航键立刻回来 ✓（不用等滑完）。
       ★ P93b（你的要求）：展开时**只藏导航链接** —— logo 与主题切换键留着，
         所以这里不只验"藏了 nav-links"，还反过来验"那两条**没有**被藏" ✓。 */
    ok('★★ 展开时藏导航链接、显示游戏控件（纯 body.sidebar-open 驱动，瞬时）',
        /body\.sidebar-open \.nav-links\s*\{[^}]*display:\s*none/.test(cssNC) &&
        /body\.sidebar-open \.play-controls\s*\{[^}]*display:\s*block/.test(cssNC) &&
        /\.play-controls\s*\{\s*display:\s*none/.test(cssNC));
    ok('★★ P93b：logo 与主题切换键**不跟着藏**（它们不是跳走的入口 —— 你的要求）',
        !/body\.sidebar-open \.logo\s*[,{]/.test(cssNC) &&
        !/body\.sidebar-open \.theme-toggle/.test(cssNC) &&
        /* ★ 反过来也要成立：藏起来的那条规则里**不许**捎带这两个（防止哪天又被加回去） */
        (function () {
            const rule = (cssNC.match(/body\.sidebar-open[^{]*\{[^}]*display:\s*none[^}]*\}/g) || []).join(' ');
            return rule.indexOf('.nav-links') !== -1 &&
                rule.indexOf('.logo') === -1 && rule.indexOf('.theme-toggle') === -1;
        })(), (cssNC.match(/body\.sidebar-open[^{]*\{[^}]*display:\s*none[^}]*\}/g) || []).join(' '));
    ok('★★ 收起是"一瞬间"：close() 一开头就摘掉 sidebar-open（不靠定时器、不等过渡）',
        /classList\.remove\(['"]sidebar-open['"]\)/.test(jsSide) &&
        !/setTimeout\([^)]*sidebar-open/.test(jsSide));
    ok('★ 开关按键的"按下"态有样式（aria-pressed="true" → 主题红）',
        /\.play-ctl\[aria-pressed="true"\]\s*\{[^}]*var\(--accent\)/.test(cssNC));

    /* ★★ P93：手机那边导航栏是**顶部横条**（不是 75px 竖轨），所以这一组要横过来排。
       陷阱：覆盖规则如果只写 `.play-controls { display: flex }`，它和基础那条
       `display: none` 特异度相同 (0,1,0) 却排在后面 → 关着游乐区也会露出这三个键 ✗。
       所以只允许两种：基础那条 display:none，或者带 body.sidebar-open 的覆盖 ✓ */
    const ctlBlocks = cssNC.match(/[^\n{}]*\.play-controls\s*\{[^}]*\}/g) || [];
    ok('★★ 手机顶栏里这组控件横排，而且覆盖规则挂在 body.sidebar-open 上（关着时不会漏出来）',
        /body\.sidebar-open \.play-controls\s*\{[^}]*display:\s*flex/.test(cssNC) &&
        /body\.sidebar-open \.play-ctl\s*\{[^}]*width:\s*auto/.test(cssNC) &&
        ctlBlocks.length >= 3 &&
        ctlBlocks.every(function (r) {
            const t = r.replace(/^\s+/, '');
            return /display:\s*none/.test(t) || /^body\.sidebar-open/.test(t);
        }), ctlBlocks.length + ' 条：' + ctlBlocks.join(' | '));

    ok('★★ 三个键都接上了：关闭走 close()、另外两个走自己的开关函数',
        /ctlClose\.addEventListener\(['"]click['"], function \(\) \{ close\(ctlClose\); \}\)/.test(jsSide) &&
        /ctlMute\.addEventListener\(['"]click['"], function \(\) \{ toggleMute\(\); \}\)/.test(jsSide) &&
        /ctlFull\.addEventListener\(['"]click['"], function \(\) \{ toggleFullscreen\(\); \}\)/.test(jsSide));
    ok('★★ 按钮状态跟着**现实**走：startGame / stopGame 都同步，全屏还能按 Esc 退出',
        /function syncControls\(\)/.test(jsSide) &&
        /if \(stageEl\) stageEl\.dataset\.state = ['"]play['"];\s*\n\s*syncControls\(\);/.test(jsSide) &&
        fnBody(jsSide, 'stopGame').indexOf('syncControls();') !== -1 &&
        /addEventListener\(['"]fullscreenchange['"], syncControls\)/.test(jsSide));

    /* 静音：同源 → 给 iframe 的 AudioContext 套一层 master gain（最可靠的路），
       套不上就退回 suspend()/resume()，再顺手静音 <audio>/<video>。 */
    ok('★★ 静音：在 load 那一刻给 iframe 的 AudioContext 套 master gain（赶在 Unity 建上下文之前）',
        /try \{ registerAudio\(frame\.contentWindow\); \}/.test(jsSide) &&
        /const real = ctx\.destination;/.test(jsSide) &&
        /Object\.defineProperty\(ctx, ['"]destination['"]/.test(jsSide) &&
        /master\.gain\.value = gameMuted \? 0 : 1;/.test(jsSide));
    ok('★★ 静音兜底：suspend()/resume() + iframe 里的 <audio>/<video> 也一并静音',
        /ctx\.suspend\(\) : ctx\.resume\(\)/.test(jsSide) &&
        /querySelectorAll\(['"]audio,video['"]\)/.test(jsSide));
    ok('★ 找不到抓手时说老实话（屏幕上给一条提示），不让按钮假装静音了',
        /hits === 0/.test(jsSide) && /showMessage\(/.test(jsSide));
    ok('★ 全屏：请求的是 iframe 本身（游戏铺满），退出走 document.exitFullscreen',
        /frame\.requestFullscreen \|\| frame\.webkitRequestFullscreen/.test(jsSide) &&
        /doc\.exitFullscreen \|\| doc\.webkitExitFullscreen/.test(jsSide));

    /* ★★ P93c：全屏 + Keyboard Lock（浏览器保留键只能靠它要回来） */
    const lockBody = fnBody(jsSide, 'lockKeyboard'), unlockBody = fnBody(jsSide, 'unlockKeyboard');
    ok('★★ P93c：有 lockKeyboard / unlockKeyboard，而且都**先做能力检测**（Firefox / Safari 没这 API）',
        /window\.navigator && window\.navigator\.keyboard/.test(lockBody) &&
        /typeof kb\.lock !== ['"]function['"]/.test(lockBody) &&
        /typeof kb\.unlock !== ['"]function['"]/.test(unlockBody));
    const lockList = (jsSide.match(/const LOCK_CODES = \[[\s\S]*?\];/) || [''])[0];
    const needCodes = ['Tab', 'ArrowLeft', 'ArrowRight', 'KeyT', 'KeyN', 'Digit1', 'Digit9'];
    ok('★★ P93c：锁的是那一串**浏览器保留键**（Ctrl+T/N、Ctrl+1…9、Ctrl+Tab、Alt+←→）',
        needCodes.every(function (c) { return lockList.indexOf("'" + c + "'") !== -1; }),
        'list=' + JSON.stringify(lockList));
    ok('★★ P93c：故意**不锁** Escape / KeyW / F11 / F12 —— 四个逃生口一个都不许进 LOCK_CODES',
        /const LOCK_CODES = \[[\s\S]*?\];/.test(jsSide) &&
        (function () {
            const list = (jsSide.match(/const LOCK_CODES = \[[\s\S]*?\];/) || [''])[0];
            return list.indexOf("'Escape'") === -1 && list.indexOf("'KeyW'") === -1 &&
                list.indexOf("'F11'") === -1 && list.indexOf("'F12'") === -1 &&
                list.indexOf("'F4'") === -1;      // F4 留着：Alt+F4 是系统级的"关窗口"
        })());
    ok('★★ P93c：顺序照规范 —— 进全屏**先 lock() 再 requestFullscreen()**、退出**先 exitFullscreen() 再 unlock()**',
        lockBody.length > 0 &&
        jsSide.indexOf('lockKeyboard();') < jsSide.indexOf('req.call(frame)') &&
        (jsSide.match(/exit\.call\(doc\)[\s\S]{0,120}?unlockKeyboard\(\)/) || []).length === 1 &&
        fnBody(jsSide, 'stopGame').indexOf('unlockKeyboard();') !== -1);
    ok('★★ P93c：全屏没了（含按 Esc 自己退的）就解锁 —— 别让"锁"在后台挂着',
        /if \(!fsEl\) unlockKeyboard\(\);/.test(fnBody(jsSide, 'syncControls')));

    /* ★★ P93d：真全屏 —— 把**游戏页里的 canvas** 也拉满
       （Unity 默认模板把它写死成 960×540 居中，所以我们只全屏 iframe 是不够的） */
    const fillBody = fnBody(jsSide, 'applyGameFill');
    const fillCssArr = (jsSide.match(/const FILL_CSS = \[[\s\S]*?\]\.join/) || [''])[0];
    const fillCssText = (fillCssArr.match(/'[^']*'/g) || []).map(function (s) { return s.slice(1, -1); }).join('');
    const fillRules = fillCssText.split('}').map(function (r) { return r.replace(/^\s+/, ''); })
        .filter(function (r) { return r.length > 0; });
    ok('★★ P93d：每一条规则都挂在 html.site-fs 下 —— 不全屏时对游戏页一个像素都不动 ✓',
        fillRules.length >= 4 && fillRules.every(function (r) { return /^html\.site-fs/.test(r); }),
        fillRules.length + ' 条：' + fillRules[0]);
    ok('★★ P93d：canvas 尺寸带 !important（模板写的是**内联** 960×540，普通样式压不过内联）',
        /html\.site-fs #unity-canvas[^{]*\{[^}]*width: 100% !important/.test(fillCssText) &&
        /[^}]*height: 100% !important/.test(fillCssText));
    ok('★ P93d：容器也拉满（模板是 left/top:50% + translate(-50%,-50%) 居中）+ 藏掉 Unity 自带的页脚',
        /#unity-container \{ position: absolute !important; left: 0 !important; top: 0 !important;/.test(fillCssText) &&
        /transform: none !important/.test(fillCssText) &&
        /#unity-footer \{ display: none !important; \}/.test(fillCssText));
    ok('★★ P93d：由 syncControls 驱动（进/退全屏那一刻加/摘类）；样式只插一次；跨源时静默跳过',
        /applyGameFill\(!!fsEl\)/.test(fnBody(jsSide, 'syncControls')) &&
        /if \(!doc\.getElementById\(FILL_ID\)\)/.test(fillBody) &&
        /classList\.remove\(['"]site-fs['"]\)/.test(fillBody) &&
        /try \{ doc = frame\.contentDocument \|\| null; \} catch \(err\) \{ return; \}/.test(fillBody));
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
        /* ★ P62：`.ak-card.is-hot` 不再要求了 —— 那张卡在 index.html 里是注释掉的，
           它的悬停规则后来被删了。上面那条"不许有 :hover"照样管着它，
           所以这里少要求一项不会漏掉问题。 */
        /#about \.container\.is-hot/.test(cssNC));
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
            '.play-close:hover',             // ★ P63：侧边栏是 fixed chrome，不随页面滚
            '.play-cart:hover',              // ★ P64：卡带栏同上（也在侧边栏里）
            '.play-cart:hover::after',       // ★ P94：卡带选中/悬停的那层红遮罩（同上）
            '.play-start:hover',             // ★ P81：「开始游戏」同上
            '.play-readme::-webkit-scrollbar-thumb:hover',             // ★ P93e：README 滚动条
            '.play-readme pre.md-code::-webkit-scrollbar-thumb:hover', // ★ P93e：代码块横向滚动条
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
        /if \(scrolling\) \{\s*\n\s*refusedDrag = true;\s*\n\s*(?:if \(!inPlay\) )?showToast\([\s\S]{0,120}?\} else if \(!guidesOn\(\)\) \{/.test(jsCross) &&
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
         都要回来改自检（P34 的教训）。
       ★ P75：回执外面套了一层 `if (!inPlay)`（游乐区里不弹），所以这里
         允许那个可选前缀 —— 钉的是"作废 + 给回执"，不是那一行的字面形状。 */
    ok('★ 没有网格时"作废这次按下 + 给回执"，而不是 return（return 会让准星卡住）',
        /else if \(!guidesOn\(\)\) \{\s*\n\s*refusedDrag = true;\s*\n\s*(?:if \(!inPlay\) )?showToast\("按 G[^"]*"/.test(jsCross));
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
   [2l] 点面板换底图（P50）
   ------------------------------------------------------------
   时序：网点 → 全不透明 ⭢ 红遮罩从上往下盖住 ⭢ 换图 + 网点透明
         ⭢ 红遮罩往下收回 ⭢ 网点镜像回静止渐变。

   ★ 这里**没有浏览器**，所以断的是"这套编排里那些**写错了也不报错**的
     地方"：换手时两个状态对不对得上、有没有兜底、事件听没听对名字、
     有没有把 .media-panel 从浮窗那边放行。像素和曲线不在这里验证。
   ============================================================ */
section('[2l] 点面板换底图（P50）');
(function mediaSwap() {
    const jsSwap = codeOnly(read('js/media-swap.js'));
    const jsWin = codeOnly(read('js/floating-window.js'));

    /* ---------- 网点那三个值必须是 @property 注册过的 ----------
       ★★ 没注册的自定义属性是**离散**的：四个关键帧会变成四下硬切，
         看着像卡顿而不像扫过。这是"写错了也照样跑"的典型。 */
    ok('★★ 网点的三个自定义属性都注册了 @property（没注册就是离散跳变，不是渐变）',
        /@property --hl-solid\s*\{[^}]*syntax:\s*"<percentage>"/.test(cssNC) &&
        /@property --hl-end\s*\{[^}]*syntax:\s*"<percentage>"/.test(cssNC) &&
        /@property --hl-a\s*\{[^}]*syntax:\s*"<number>"/.test(cssNC));
    /* ★ inherits: true 不能省：动画挂在 .media-panel-bg（真元素）上，
       用值的却是它的 ::after。改成 false 的话网点根本读不到动画值。 */
    ok('★★ 三个属性都 inherits: true（动画在真元素上、用值在 ::after 上）',
        (cssNC.match(/@property --hl-(solid|end|a)\s*\{[^}]*inherits:\s*true/g) || []).length === 3);

    /* ---------- 静止态必须和改之前**逐像素等价** ---------- */
    ok('★ 静止态 = 0%/40%/0.8，等于改之前那条两段渐变（实心段宽度 0 等于没有）',
        /@property --hl-solid\s*\{[^}]*initial-value:\s*0%/.test(cssNC) &&
        /@property --hl-end\s*\{[^}]*initial-value:\s*40%/.test(cssNC) &&
        /@property --hl-a\s*\{[^}]*initial-value:\s*0\.8/.test(cssNC));
    ok('★ 网点渐变是三段结构（实心 → 淡出 → 全透明），停止点全走变量',
        /\.media-panel-bg::after\s*\{[\s\S]{0,600}?linear-gradient\(\s*\n\s*to bottom,\s*\n\s*rgba\(225, 25, 25, var\(--hl-a/.test(cssNC) &&
        /var\(--hl-solid/.test(cssNC) && /var\(--hl-end/.test(cssNC));

    /* ---------- 网点：只断言**端点与方向** ----------
       ★★ P52 改：不再钉中间那两级。
          中间帧是"编排"（你把它简化成两级了），端点才是"语义"：
          halftoneToSolid 必须"静止 → 全不透明"，halftoneFromSolid 必须
          "全不透明 → 静止"。钉中间帧的代价就是每次调编排都要回来改自检
          （P34 的教训）。下面这两条对"两级"和"四级"两种写法都成立。 */
    const kf = (name) => (new RegExp('@keyframes ' + name + '\\s*\\{([\\s\\S]*?)\\n\\}').exec(cssNC) || [])[1] || '';
    /* 静止 = 0% / 40%；全不透明 = 100% / 200%（淡出段整段在盒外） */
    const REST = '--hl-solid:\\s*0%;[\\s\\S]{0,80}?--hl-end:\\s*40%';
    const SOLID = '--hl-solid:\\s*100%;[\\s\\S]{0,80}?--hl-end:\\s*200%';
    ok('★★ ① 网点：静止(0%/40%) → 全不透明(100%/200%)，顺序不能反',
        new RegExp(REST + '[\\s\\S]{0,300}?' + SOLID).test(kf('halftoneToSolid')));
    ok('★★ ⑤ 网点：全不透明 → 静止（端点对调 = 反向；顺序错了就成"越收越实"）',
        new RegExp(SOLID + '[\\s\\S]{0,300}?' + REST).test(kf('halftoneFromSolid')));
    /* ★ "全不透明"用 100%/200% 表达：淡出区整段推到盒子外面。
       不用这一手的话就得为那一帧单开一条规则，切换瞬间会跳。 */
    ok('★ "全不透明"是把淡出区推到盒子外（100% / 200%）+ 顶端 alpha 到 1',
        new RegExp(SOLID).test(kf('halftoneToSolid')) &&
        /--hl-a:\s*1;/.test(kf('halftoneToSolid')));

    /* ---------- 红遮罩：软边 + 两次都是"向下" ----------
       ★★ P52 换了实现：不再是"scaleY 撑开 + 换 transform-origin"，
          而是"一条比格子高两个羽化量的幕，从上往下滑过去"。
          原因写在 CSS 里：scaleY 会把渐变一起压扁，软边永远收在元素盒子里 ——
          那样**罩子底部永远留一截半透明**，而换图正好发生在那一刻。
          所以断言也跟着换成新机制的三个要点。 */
    ok('★★ 遮罩比格子高两个羽化量，软边两头都软（P54 起软边走 mask）',
        /\.media-panel-veil\s*\{[^}]*bottom:\s*calc\(-2 \* var\(--panel-feather\)\)/.test(cssNC) &&
        /\.media-panel-veil\s*\{[\s\S]{0,1400}?mask-image:\s*linear-gradient\(\s*\n\s*to bottom,\s*\n\s*rgba\(0, 0, 0, 0\) 0,\s*\n\s*#000 var\(--panel-feather\),\s*\n\s*#000 calc\(100% - var\(--panel-feather\)\),\s*\n\s*rgba\(0, 0, 0, 0\) 100%/.test(cssNC));

    /* ============================================================
       P54：盖满那一刻，红色 → 容器底色（--bg-alt）
       ------------------------------------------------------------
       ★★ 让这件事成立的关键改动：遮罩的**背景从四段渐变变成一块纯色**，
          软边挪到 mask 上。渐变背景是插值不动的（各家支持不齐），
          而 background-color 的 transition 到处都能跑。
       ============================================================ */
    const veilBlk = (cssNC.match(/\.media-panel-veil\s*\{[\s\S]*?\n\}/) || [''])[0];
    ok('★★ 遮罩底色是**纯色**（不是渐变）—— 否则变色没法用普通 transition 做',
        /background-color:\s*var\(--accent\)/.test(veilBlk) &&
        !/background(-color)?:\s*linear-gradient/.test(veilBlk));
    /* ★ P55：颜色**不再绕一层自定义属性**。绕一层的话，那条 transition 的
       插值目标要经过一次变量解析，多一个可能出岔子的环节。 */
    ok('★ 底色直接写在 background-color 上，不再经过 --panel-veil-tint 中转',
        !/--panel-veil-tint/.test(cssNC));
    ok('★★ 变色用 background-color 的 transition（时长 = --panel-tint）',
        /transition:\s*background-color var\(--panel-tint\)/.test(veilBlk) &&
        /--panel-tint:\s*\d+ms/.test(cssNC));
    /* ★★ 盖满那一刻（is-veiled，JS 第 ③ 步和换图同一帧）把颜色换成容器底色。
       令牌名是 --bg-alt（用户写的 --alt-bg 是反的）。 */
    ok('★★ is-veiled 把遮罩底色换成容器底色 var(--bg-alt)',
        /\.media-panel\.is-veiled \.media-panel-veil\s*\{\s*\n\s*background-color:\s*var\(--bg-alt\);/.test(cssNC));
    /* ★★ P55：收起阶段**再写死一次** + 关键帧里也写 ——
       三层保险，让"正在收的幕是红的"从结构上不可能发生。 */
    ok('★★ is-uncovering 也写死底色，关键帧里也写（三层保险）',
        /\.media-panel\.is-uncovering \.media-panel-veil\s*\{\s*\n\s*background-color:\s*var\(--bg-alt\);/.test(cssNC) &&
        /@keyframes panelVeilOut\s*\{[\s\S]{0,900}?background-color:\s*var\(--bg-alt\);\s*\n\s*\}\s*\n\s*\n[\s\S]{0,600}?background-color:\s*var\(--bg-alt\);/.test(cssNC));
    /* ★ 这个颜色得**真的是容器底色**：面板那层夹层用的就是它 ——
       两处同一个令牌，才不会"变成了另一种灰"。 */
    ok('★ 变色目标 = 面板夹层用的那个底色（同一个 --bg-alt）',
        /\.media-panel-bg::before\s*\{[^}]*background:\s*var\(--bg-alt\)/.test(cssNC));
    /* ★★ 收起要等变色走完：is-uncovering 的 delay = --panel-tint。
       不等的话就成了"幕一边变色一边往外滑"，看不出"先空掉"这一拍。 */
    ok('★★ 收起等变色走完（is-uncovering 的 animation-delay = --panel-tint）',
        /\.media-panel\.is-uncovering \.media-panel-veil\s*\{[^}]*animation-delay:\s*var\(--panel-tint/.test(cssNC));
    /* ============================================================
       ★★★ P55：修"变完底色突然闪回红色"
       ------------------------------------------------------------
       现象原因：幕变成底色之后往下收，露出来的是**幕后面的东西**；
       网点那时还停在"全不透明"（实心红），于是幕一动就是一大片实心红，
       等它慢慢淡回静止渐变，看着又"变回底色"。
       修法：把网点的返回挪到**幕开始收之前**走完 —— delay = tint − sweep。
       （这就是那条不变式：delay + sweep ≤ tint。差值可以是负数，
         负的 animation-delay 合法，表示这段已经跑过一部分了。）
       ============================================================ */
    ok('★★★ 网点在"幕开始收"之前就返回完：delay = tint − sweep',
        /animation-delay:\s*calc\(var\(--panel-tint, 0ms\) - var\(--panel-sweep, 0ms\)\)/.test(cssNC));
    /* ★★ 而且它的时机必须锚在"盖满"那一刻 —— 不能挂在 `await loaded` 之后，
       否则图片加载一慢，网点返回就漂到幕已经动起来之后了（红又露出来）。 */
    ok('★★ is-sweep-out 和 is-veiled 同一帧挂上（不跟图片加载漂）',
        /classList\.add\('is-veiled'\);\s*\n\s*st\.panel\.classList\.remove\('is-sweep-in'\);\s*\n\s*st\.panel\.classList\.add\('is-sweep-out'\);/.test(jsSwap) &&
        !/await loaded;[\s\S]{0,200}?classList\.add\('is-sweep-out'\)/.test(jsSwap));
    ok('★ tint 也是从 CSS 读出来的（JS 里没有第二份变色时长）',
        /const TINT = timeOf\('--panel-tint'\)/.test(jsSwap));

    /* ============================================================
       P55：换图之后新图"由大缩小"
       ============================================================ */
    ok('★★ 新图由大缩小：动画挂在 <img> 上，从大 scale 收到 1',
        /\.media-panel\.is-uncovering \.media-panel-bg img\s*\{\s*\n\s*animation:\s*panelImgZoom var\(--panel-zoom\)/.test(cssNC) &&
        /@keyframes panelImgZoom\s*\{\s*\n\s*from\s*\{\s*\n\s*transform:\s*scale\(var\(--panel-zoom-from/.test(cssNC) &&
        /@keyframes panelImgZoom[\s\S]{0,200}?to\s*\{\s*\n\s*transform:\s*scale\(1\);/.test(cssNC));
    /* ★★ 必须挂在 <img> 上，不能挂在 `.media-panel-bg` 上 ——
       bg 那一层已经被网点动画占着（同一个元素只能有一份 animation 声明，
       谁后写谁把另一条顶掉，网点动画会被静默干掉）。 */
    ok('★★ 挂 img 不挂 bg（bg 的 animation 槽被网点动画占着，会互相顶掉）',
        /\.media-panel\.is-uncovering \.media-panel-bg img/.test(cssNC) &&
        !/\.media-panel\.is-uncovering \.media-panel-bg\s*\{[^}]*animation:/.test(cssNC));
    /* ★ 手感和鼠标悬停那一套一致：同一条曲线、同样的起点距离（1.06）。 */
    ok('★ 曲线与起点照搬悬停那套（cubic-bezier(0.2,0.9,0.3,1)、1.06 → 1）',
        /panelImgZoom var\(--panel-zoom\) cubic-bezier\(0\.2, 0\.9, 0\.3, 1\)/.test(cssNC) &&
        /\.media-panel-bg\s*\{[^}]*transition:[^;]*transform 0\.8s cubic-bezier\(0\.2, 0\.9, 0\.3, 1\)/.test(cssNC) &&
        /--panel-zoom:\s*\d+ms/.test(cssNC) && /--panel-zoom-from:\s*1\.06/.test(cssNC));
    /* ★★ 收尾要**一起等缩放**：`--panel-zoom` 万一被调得比 --panel-cover 还长，
       不等它就会在动画中途摘类（图啪地跳到终态）。 */
    ok('★★ 收尾把缩放也等进去（调长也不会被掐）',
        /whenAnimated\(st\.img, 'panelImgZoom', TINT \+ ZOOM \+ SLACK\)/.test(jsSwap) &&
        /const ZOOM = timeOf\('--panel-zoom'\)/.test(jsSwap));
    /* ★★ 缩放和"幕收起"共用一个延迟（--panel-tint）：两边天然同步，
       不管图片加载拖多久都是"幕一动、图就跟着缩"。 */
    ok('★★ 缩放和幕收起共用延迟 --panel-tint（加载再慢也不会错位）',
        /animation:\s*panelImgZoom[^;]*var\(--panel-tint, 0ms\)\s*both;/.test(cssNC) &&
        /\.media-panel\.is-uncovering \.media-panel-veil\s*\{[^}]*animation-delay:\s*var\(--panel-tint/.test(cssNC));
    /* ★ `both` 不能省：延迟那一段要先把图定在"大"的起态上，
       否则幕还没动、图先以 1 露出来一瞬再跳大。 */
    ok('★ 缩放用 fill-mode: both（延迟期间就定在"大"的起态）',
        /panelImgZoom[^;]*var\(--panel-tint, 0ms\)\s*both;/.test(cssNC));
    /* ★★ 展开停在 -羽化量（不是 0）：罩子高 H+2F、实心段在局部 [F, H+F]，
       整体上移 F 之后实心段正好是 [0, H] —— 整格铺满，两条软边都在格子外。
       这条是"完全盖住"的算术前提，错了就会出现"底部一截是淡的、换图被看见"。 */
    ok('★★ 展开停在 -羽化量：实心段正好铺满 [0,100%]，软边全在格子外',
        /@keyframes panelVeilIn\s*\{\s*\n\s*from\s*\{\s*\n\s*transform:\s*translateY\(-100%\);\s*\n\s*\}\s*\n\s*\n\s*to\s*\{\s*\n\s*transform:\s*translateY\(calc\(-1 \* var\(--panel-feather\)\)\);/.test(cssNC));
    /* ★ 收起 = 接着往下滑出去：红色从上边开始消失、一路退到底。
       这也是"从上端 0% 向下 100% 逐渐收起"最直白的写法（不用再换 origin）。
       ★★ 终点必须是"刚好滑到格子下面"那一格（100% − 2×羽化量），
          不能是 100%：后者最后 2F 那一段屏幕上是空的（340ms 里约 60ms），
          红早走完了、动画还在空跑，而 JS 正等在这个 animationend 上 ——
          表现成"红没了"和"网点开始回来"之间多一小段空白。 */
    /* ★ 用 kf() 只看关键帧本体，**不跨注释**去数长度。
       ★★ 踩过的坑：这个文件里的 cssNC 是把注释换成"等长的空格串"
          （`' '.repeat(m.length)`，见文件开头），不是换成一个空格 ——
          所以任何跨注释的 `[\s\S]{0,n}` 都得留足余量，我原来写 {0,300}
          就正好卡在两条注释之间，断言假红。 */
    ok('★ 收起滑到"刚好出格"就停（100% − 2×羽化量），不留空跑的一段',
        /to\s*\{\s*\n\s*transform:\s*translateY\(calc\(100% - 2 \* var\(--panel-feather\)\)\);/.test(kf('panelVeilOut')) &&
        !/translateY\(100%\)/.test(kf('panelVeilOut')));
    /* ★ 两段行程一样长（都是 H + F）→ 同一个时长下展开和收起速度一致。 */
    ok('★ 展开与收起行程等长（-100%→-F 与 -F→100%-2F）',
        /to\s*\{\s*\n\s*transform:\s*translateY\(calc\(-1 \* var\(--panel-feather\)\)\);/.test(kf('panelVeilIn')) &&
        /from\s*\{\s*\n\s*transform:\s*translateY\(calc\(-1 \* var\(--panel-feather\)\)\);/.test(kf('panelVeilOut')));
    ok('★ 动画只动 transform（合成器；不重排不重画）',
        /\.media-panel-veil\s*\{[^}]*will-change:\s*transform/.test(cssNC) &&
        !/@keyframes panelVeil(In|Out)[\s\S]{0,200}?(width|height|top|bottom):/.test(cssNC));
    /* ★ P52/P53：羽化量只要是**绝对长度**就行（px / vh / rem…），
       唯一不能用的是 % —— 它在 translateY 和 height / 渐变里是两套参照系。
       （你把它从 90px 调成了 180vh；这条断言跟着放宽，但"不许是 %"留着。） */
    ok('★ 羽化量是绝对长度（px/vh/…），不是 %（% 在三处是两套参照系）',
        /--panel-feather:\s*[\d.]+(px|vh|vw|vmin|vmax|rem|em);/.test(cssNC) &&
        !/--panel-feather:\s*[\d.]+%/.test(cssNC));
    /* ★ 首尾用 rgba(同色, 0) 而不是 transparent：后者是 rgba(0,0,0,0)，
       和 --accent 插值有的引擎会中间发灰。 */
    ok('★ 软边两端用 rgba(225,25,25,0)，不用 transparent（避免插出灰色）',
        !/\.media-panel-veil\s*\{[\s\S]{0,700}?linear-gradient\([\s\S]{0,300}?transparent/.test(cssNC));
    ok('★ 遮罩盖得住整格（z-index 在文字 1 之上）而且是 JS 注入的',
        /\.media-panel-veil\s*\{[^}]*z-index:\s*2/.test(cssNC) &&
        /createElement\('div'\)[\s\S]{0,120}?className = 'media-panel-veil'/.test(jsSwap));
    /* ★★ 遮罩不能吃鼠标：准星靠 elementFromPoint 做命中测试，
       一层吃鼠标的遮罩会把 .media-panel 的悬停态整段掐掉。 */
    ok('★★ 遮罩 pointer-events: none（否则准星的命中测试会被它挡住）',
        /\.media-panel-veil\s*\{[^}]*pointer-events:\s*none/.test(cssNC));

    /* ---------- ③ 遮罩盖住那一刻：网点保持可见 + 换图 ----------
       ★★ P52：这一条你把它从 `opacity: 0` 改成了 1，是对的，断言跟着改。
          遮罩盖住那一段网点本来就看不见（被红幕压着），所以两种写法在
          "盖住"期间没区别；区别在**收起那一段**：
            用 0 → 面板重新露出来时是"光板一块"，第 ⑤ 步才啪地冒出网点；
            用 1 → 露出来的就是"红网点 + 新图"，然后再渐变回 0%~40%，
                   正好接上第 ⑤ 步（你 P50 要的"从完全不透明渐变回"）。
          所以这里断言的是**不变量**："遮罩期间不许把网点藏起来"。 */
    ok('★★ 遮罩期间不把网点藏起来（收起时露出来的才是"红网点 + 新图"）',
        !/\.media-panel\.is-veiled \.media-panel-bg::after\s*\{[^}]*opacity:\s*0/.test(cssNC));
    /* ★★ 换图必须**在**遮罩盖住之后、收起之前 —— 顺序反了就是"当着用户的面换图"。
       （P55 之后第 ③ 步里还夹着网点的换手，所以中间允许有它。） */
    ok('★★ ③ 换图夹在"盖住"与"收起"之间',
        /is-veiled'\);[\s\S]{0,300}?await loaded;\s*\n\s*applyNext\(st\);[\s\S]{0,300}?classList\.remove\('is-covering'\)/.test(jsSwap));

    /* ---------- 链子：听名字、有兜底、绝不卡死 ---------- */
    /* ★★ 同一个元素上先后跑两条不同的动画（网点进 / 网点出），
       只听元素不听名字会走错步。 */
    ok('★★ 等动画时连 animationName 一起判（同元素上先后有两条不同动画）',
        /function whenAnimated\(el, name, limit\)/.test(jsSwap) &&
        /if \(name && e\.animationName !== name\) return;/.test(jsSwap));
    /* ★★ 每一步都有兜底超时：事件不来也必须往下走 ——
       最坏是"动画没看见"，绝不能是"面板被一块红遮罩永久盖住"。 */
    ok('★★ 每一个"等"都有兜底超时（事件不来也不能把面板盖死）',
        /timer = setTimeout\(finish, limit\)/.test(jsSwap) &&
        /whenAnimated\([\s\S]{0,90}?\+ SLACK\)/.test(jsSwap) &&
        (jsSwap.match(/\+ SLACK\)/g) || []).length >= 3);
    /* ★★★ 真机上那个 bug 的碑：`finish()` 里引用定时器时，
       定时器必须**先声明并初始化**（`let timer = null`）。
       原来是 `const timer = setTimeout(...)` 写在后面，而缓存命中的图会
       **同步**调用 finish() —— 那一刻 const 还在 TDZ 里，直接
       ReferenceError → Promise 变 rejected → await 抛出 → finally 摘掉所有类。
       表现："红遮罩刚盖满就瞬间消失、后面什么都不发生"，而且控制台一片安静。 */
    ok('★★★ 定时器先 `let … = null` 再进闭包（TDZ 会同步炸，而且炸得没声音）',
        /let timer = null;/.test(jsSwap) &&
        /if \(timer !== null\) clearTimeout\(timer\)/.test(jsSwap) &&
        !/const timer = setTimeout\(finish, limit\)/.test(jsSwap));
    /* ★★ 出错要有声音：async 函数会把异常吞成 rejected promise，
       只剩 finally 在那儿默默复位 —— 页面看起来"动画坏了"，查不到原因。 */
    ok('★★ 链子出错时留一行 warn（否则 async 会把异常吞掉、静默坏掉）',
        /catch \(err\) \{[\s\S]{0,500}?console\.warn\('media-swap/.test(jsSwap));
    ok('★★ finally 里把六个类全摘掉（无论怎么出去都不留死画面）',
        /finally \{[\s\S]{0,400}?'is-swap', 'is-sweep-in', 'is-sweep-out',[\s\S]{0,120}?'is-covering', 'is-uncovering', 'is-veiled'\)/.test(jsSwap));
    /* ★★ 预载必须有超时 + onerror：图 404 时链子正停在"遮罩盖着"那一步，
       没有兜底就是把面板永久盖住。 */
    ok('★★ 预载有超时和 onerror（图 404 时不能把面板卡在遮罩后面）',
        /im\.onerror = finish/.test(jsSwap) &&
        /function preload\(src, limit\)/.test(jsSwap) &&
        /timer = setTimeout\(finish, limit\)/.test(jsSwap) &&
        /* ★ 缓存命中这条快路径必须显式写出来：真机第一次换图走的就是它 */
        /if \(im\.complete\) \{ finish\(\); return; \}/.test(jsSwap));

    /* ---------- P53：两半都是"错开着并行" ---------- */
    /* ★★ 起跑是并行的：点一下同时挂上 is-sweep-in 和 is-covering，
       而**不再**先 await 网点的 animationend 再挂遮罩 ——
       串行的写法会让"网点跑完"变成遮罩起跑的前提，两层就永远叠不起来。 */
    ok('★★ 两层并行起跑（同一个 try 里连挂两个类，中间不许 await）',
        /classList\.add\('is-sweep-in'\);\s*\n\s*st\.panel\.classList\.add\('is-covering'\);/.test(jsSwap) &&
        !/await whenAnimated\(bg, 'halftoneToSolid'/.test(jsSwap));
    /* ★★ 错开量必须是 CSS 的 animation-delay（两处都用 --panel-lag）。
       用 JS 定时器的话，降低动效把 animation-duration 压到 .01ms 之后就错位了。 */
    ok('★★ ①→② 的错开在 CSS 上：遮罩的 animation-delay = --panel-lag',
        /\.media-panel\.is-covering \.media-panel-veil\s*\{[^}]*animation-delay:\s*var\(--panel-lag/.test(cssNC));
    ok('★★ ④→⑤ 的错开也在 CSS 上：网点 delay = tint + lag',
        /\.media-panel\.is-sweep-out \.media-panel-bg\s*\{[^}]*animation-delay:\s*calc\(var\(--panel-tint/.test(cssNC));
    /* ★★ delay 写成独立的 longhand + 0ms 兜底：`var()` 取不到值会让整条
       animation 声明"计算值非法"而退成 none（动画根本不跑，只剩兜底超时）；
       拆成 animation-delay 最坏也只是"不延迟"。 */
    ok('★★ delay 是独立 longhand 且带 0ms 兜底（var() 失效时不至于把整条动画废掉）',
        /animation-delay:\s*var\(--panel-lag, 0ms\);/.test(cssNC) &&
        !/animation:[^;]*var\(--panel-lag/.test(cssNC));
    /* ★★ 最后要**一起等**：遮罩收起（cover）和网点收回（sweep+lag）是并行跑的，
       只等其中一个就会在另一个还没跑完时把类全摘掉（动画当场被掐）。 */
    ok('★★ 收尾等两段都跑完（Promise.all：遮罩收起 + 网点收回）',
        /Promise\.all\(\[[\s\S]{0,300}?whenAnimated\(st\.veil, 'panelVeilOut'[\s\S]{0,200}?whenAnimated\(bg, 'halftoneFromSolid'/.test(jsSwap));
    /* ★ 兜底超时也要跟着改：
         幕收起 = tint + cover；网点返回 = max(sweep, tint)（delay 可能是负的，
         所以它的**结束**时刻是 max(sweep, tint) 而不是两者相加）。 */
    ok('★ 兜底超时和新的延迟一致（tint+cover / max(sweep,tint)）',
        /whenAnimated\(st\.veil, 'panelVeilIn', COVER \+ LAG \+ SLACK\)/.test(jsSwap) &&
        /whenAnimated\(st\.veil, 'panelVeilOut', TINT \+ COVER \+ SLACK\)/.test(jsSwap) &&
        /whenAnimated\(bg, 'halftoneFromSolid', Math\.max\(SWEEP, TINT\) \+ SLACK\)/.test(jsSwap));
    /* ★ lag 也必须是"读出来"的，不能在 JS 里再写一个 200。 */
    ok('★ lag 也是从 CSS 读出来的（JS 里没有第二份错开量）',
        /const LAG = timeOf\('--panel-lag'\)/.test(jsSwap) && /--panel-lag:\s*\d+ms/.test(cssNC));

    /* ---------- 换手时状态必须接得上 ---------- */
    /* ★★ 每个类都带 forwards 填充，中途摘掉就会当着用户的面弹回起点；
       而 P53 之后 is-sweep-out 前面还有一段 delay ——
       那期间显示的正是它自己的基础声明（100%/200%/1 = 全不透明），
       所以"遮罩已经开始收、网点还停在实心"这段接缝是看不见的。 */
    ok('★★ sweep-in → sweep-out 同帧换手（不摘早，也不两段动画打架）',
        /classList\.remove\('is-sweep-in'\);\s*\n\s*st\.panel\.classList\.add\('is-sweep-out'\);/.test(jsSwap) &&
        !/classList\.remove\('is-sweep-out'\);\s*\n\s*st\.panel\.classList\.add\('is-sweep-in'\)/.test(jsSwap));
    ok('★ is-sweep-out 把"起态"写成基础声明（万一样式先算一次、动画还没起跑也不闪）',
        /\.media-panel\.is-sweep-out \.media-panel-bg\s*\{\s*\n\s*--hl-solid:\s*100%;\s*\n\s*--hl-end:\s*200%;\s*\n\s*--hl-a:\s*1;/.test(cssNC));
    ok('★ is-uncovering 也写了起态兜底（写成"已盖满"的位置，不是基础值）',
        /\.media-panel\.is-uncovering \.media-panel-veil\s*\{[^}]*transform:\s*translateY\(calc\(-1 \* var\(--panel-feather\)\)\)/.test(cssNC));

    /* ---------- 时长只有一份 ---------- */
    ok('★★ 时长写在 CSS 里、JS 读出来用（JS 里不出现第二份毫秒数）',
        /--panel-sweep:\s*\d+ms/.test(cssNC) && /--panel-cover:\s*\d+ms/.test(cssNC) &&
        /getPropertyValue\(name\)/.test(jsSwap) &&
        /const SWEEP = timeOf\('--panel-sweep'\)/.test(jsSwap) &&
        /* ★★ 第一版这里写的是 `timeOf(…, '--panel-sweep', 420)` —— 一个"看着稳妥"
           的兜底数字，其实就是把同一份时长抄了两遍。所以这条断言连兜底数字一起禁掉。 */
        !/timeOf\([^)]*,\s*\d/.test(jsSwap));
    /* ★ 读不到时长就别编排：直接换图，而不是拿一个猜的数字硬跑五步。 */
    ok('★ 时长读不到就不做动画（连时间都不知道，不该硬跑）',
        /const CAN_ANIMATE = SWEEP > 0 && COVER > 0;/.test(jsSwap) &&
        /if \(REDUCE\.matches \|\| !CAN_ANIMATE\) \{/.test(jsSwap));

    /* ---------- 图片来源 ---------- */
    ok('★ 图片列表读 data/works.js：gallery 用 shots[].src，其它用 cover',
        /if \(w\.kind === 'gallery' && Array\.isArray\(w\.shots\)/.test(jsSwap) &&
        /return w\.cover \? \[w\.cover\] : \[\]/.test(jsSwap) &&
        /window\.WORKS/.test(jsSwap));
    /* ★ 脚本必须排在 data/works.js 之后，否则读不到数据（而且是静默退化）。 */
    ok('★ media-swap.js 排在 data/works.js 之后',
        html.indexOf('src="js/media-swap.js"') > html.indexOf('src="data/works.js"') &&
        html.indexOf('src="js/media-swap.js"') > 0);

    /* ---------- 触发 ---------- */
    /* ★★ 用冒泡阶段，不用捕获：crosshair.js 那两个捕获阶段的 click 会
       stopPropagation（框选确认 / 吞掉拖框松手那一下），
       于是"正在量取时点一下面板"不会顺手把底图也换掉。 */
    ok('★★ 面板的点击走**冒泡**（capture 那条链上 crosshair 会吃掉量取时的点击）',
        /document\.addEventListener\('click', function \(e\) \{[\s\S]{0,400}?closest\('\.media-panel'\)/.test(jsSwap) &&
        !/addEventListener\('click', function \(e\) \{[\s\S]{0,400}?closest\('\.media-panel'\)[\s\S]{0,200}?\}, true\)/.test(jsSwap));
    ok('★ 键盘等价（面板是 role=button，回车 / 空格要能换）',
        /e\.key !== 'Enter' && e\.key !== ' '/.test(jsSwap) &&
        /* ★ preventDefault 不能省：空格默认会滚页面。
           这条断言只能看**代码**（codeOnly 把注释摘了）——
           "空格默认会滚页面"那句理由写在注释里，抓不到也不该抓。 */
        /e\.preventDefault\(\);\s*\n\s*swap\(stateOfPanel\(panel\)\);/.test(jsSwap));
    ok('★ 正在换的时候忽略后续点击（否则两次点击会打架）',
        /classList\.contains\('is-swap'\)\) return;/.test(jsSwap));
    /* ★★ 换图期间必须强制露出底图：.media-panel-bg 平时 opacity: 0，
       只在 .is-hot 时可见，而那条规则还包在 @media (hover…) 里 ——
       触屏点一下没有 hover，动画会在全透明的一层上演。 */
    ok('★★ 换图期间强制露出底图（触屏没有 hover，否则动画演在透明层上）',
        /\.media-panel\.is-swap \.media-panel-bg\s*\{[^}]*opacity:\s*1/.test(cssNC));

    /* ---------- 降低动效 ---------- */
    ok('★★ 降低动效下直接换图、不演这套扫除（也不留 0.01ms 的闪红）',
        /REDUCE\.matches[\s\S]{0,40}?\{\s*\n\s*applyNext\(st\);\s*\n\s*return;/.test(jsSwap) &&
        /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/.test(jsSwap));

    /* ---------- 和浮窗的关系 ---------- */
    ok('★★ 面板不再开浮窗（两个入口必须互斥，否则一次点击触发两件事）',
        /!el\.classList\.contains\('media-panel'\)/.test(jsWin) &&
        /const opensWindow = \(el\) =>/.test(jsWin));
    ok('★ .card 那条入口还在（放行条件只针对面板这一类）',
        /closest\('\[data-work\]'\)/.test(jsWin) &&
        /if \(!opensWindow\(el\)\) return;/.test(jsWin));
    /* ★★ 面板的 aria-label 得跟着改：它已经不是"打开"了。 */
    ok('★★ 面板的 aria-label 改成"切换底图"（它不再打开任何东西）',
        !/aria-label="打开：/.test(html) &&
        (html.match(/aria-label="切换底图：/g) || []).length === 4);
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
    /* ★★ P50：后代选择器（`.media-panel-bg img` 这种）必须**最先**判。
       第一版我把它放在函数末尾，而 `.media-panel-bg img` 是以 `.` 开头的，
       于是被上面那条"类选择器"分支直接 return false 掉了 —— 永远走不到。
       （表现：media-swap.js 在桩里找不到 <img>，整个模块静默地"没图可换"。）
       实现：最后一段匹配自己，前面每一段从祖先里从右往左找。 */
    if (/\s/.test(sel)) {
        const parts = sel.split(/\s+/);
        let node = el;
        for (let i = parts.length - 1; i >= 0; i--) {
            let found = null;
            while (node) {
                if (matchSel(node, parts[i])) { found = node; break; }
                node = node.parentElement;
            }
            if (!found) return false;
            node = found.parentElement;
        }
        return true;
    }
    if (sel === '*') return true;
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
        this.style = {
            _p: Object.create(null),
            setProperty(k, v) { this._p[k] = String(v); },
            removeProperty(k) { delete this._p[k]; },
            getPropertyValue(k) { return this._p[k] === undefined ? '' : this._p[k]; },
        };
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
    /* ★ P50：真 DOM 里的 appendChild 也要有 —— media-swap.js 用它挂遮罩
       （和 draft-layer.js 一个写法）。桩里缺它就报 TypeError，
       整节测试会在模块初始化那一步直接炸掉。 */
    appendChild(n) { this.append(n); return n; }
    replaceChildren(...nodes) { this.childNodes.forEach(n => { n.parentElement = null; n.isConnected = false; }); this.childNodes = []; this.innerHTML = ''; this.append(...nodes); }
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
    /* ★ P93：sidebar.js 的 stopGame() 要判断"正全屏的是不是自己这一局"
       （document.fullscreenElement 是不是舞台里的东西）→ 真 DOM 的 contains ✓ */
    contains(n) { let x = n; while (x) { if (x === this) return true; x = x.parentElement; } return false; }
    querySelectorAll(sel) { const out = []; const walk = n => n.childNodes.forEach(c => { if (c.nodeType === 1) { if (matchSel(c, sel)) out.push(c); walk(c); } }); walk(this); return out; }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    showModal() { if (this.open) throw new Error('dialog already open'); this.open = true; }
    /* ★ P64：桩里原本没有 focus()。js/sidebar.js 要"焦点进游乐区 / 关时还给
       按钮"，没这个方法会直接 TypeError、整节在初始化那一步炸掉。
       顺手把"谁拿到了焦点"记在 doc._focus 上，断言就有东西可查了。 */
    focus() { doc._focus = this; }
    /* ★ P75：桩里也没有 remove() —— 卡带悬停那条"跟随鼠标的回执"是临时节点，
       鼠标离开时要自己摘掉。注意 doc.querySelectorAll 走的是 _els（摘了也还在），
       所以断言要用 doc.body.querySelectorAll（走 childNodes）。 */
    /* ★★ P96：桩里原来**故意没有** cloneNode（那时拖动只靠舞台高亮），
       现在"浮起卡带"就是克隆出来的，缺它整条路都验不到 ✗ —— 补一个：
       深拷贝 class / attrs / dataset / 文本 / 孩子（孩子再递归克隆）。 */
    cloneNode(deep) {
        const c = new El(this.tagName);
        c.className = this.className;
        c.attrs = Object.assign(Object.create(null), this.attrs);
        c.dataset = Object.assign({}, this.dataset);
        c.textContent = this.textContent;
        c.hidden = this.hidden;
        c.style = Object.assign({ setProperty() { }, removeProperty() { }, getPropertyValue() { return ''; } }, this.style);
        if (deep) {
            this.childNodes.forEach((n) => {
                c.append(n.nodeType === 1 && n.cloneNode ? n.cloneNode(true)
                    : { nodeType: n.nodeType, textContent: n.textContent });
            });
        }
        doc._els.push(c);                     // 和 createElement 一致
        return c;
    }
    remove() {
        const p = this.parentElement;
        if (p) p.childNodes = p.childNodes.filter((n) => n !== this);
        this.parentElement = null;
        this.isConnected = false;
    }
    /* ★ P77：桩里给一个**假的**矩形。悬停回执那条要验"鼠标点一下不许被重建成
       键盘那份（摆在卡带右上角）"—— 没有这个方法就复现不出那个 bug
       （focus 分支里 `r` 会是 null，什么都不做，测试就白绿了）。 */
    getBoundingClientRect() {
        return { left: 0, top: 0, right: 40, bottom: 120, width: 40, height: 120 };
    }
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
    /* ★ P93：真 Document 也有 removeEventListener（临时侦听用完要摘掉） */
    removeEventListener(t, f) { if (doc._ev[t]) doc._ev[t] = doc._ev[t].filter(x => x !== f); },
    dispatchEvent(e) { (doc._ev[e.type] || []).forEach(f => f(e)); return true; },
};
doc.body = new El('body');
doc.documentElement = new El('html');
doc._els.push(doc.body, doc.documentElement);

global.Element = El;
global.CustomEvent = class { constructor(t) { this.type = t; } };
global.document = doc;
global.window = global;
/* ★ P82：桩里 window 就是 global，但 global 上没有 addEventListener ——
   sidebar.js 现在会监听游戏发来的"我退出了"（window 的 message）。
   补一个，转发到 doc 那套事件表，测试就能 dispatchEvent 一条 message 进来。 */
global.addEventListener = (t, f) => { (doc._ev[t] || (doc._ev[t] = [])).push(f); };
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
    /* ★ 数一数就行，**别钉死 1** —— 作品数据里 shots 迟早会不止一张
       （P56 时 art-draw 已经有 2 张了，钉死数字的代价就是每次加图都要回来改自检）。 */
    ok('渲染出图片', bodyEl.querySelectorAll('.win-shot').length >= 1,
        String(bodyEl.querySelectorAll('.win-shot').length) + ' 张');
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

    /* ============================================================
       [4] 点面板换底图：**真的跑一遍时序**（P50）
       ------------------------------------------------------------
       ★★ 这一节和上面 [2l] 那节的分工要说清楚：
          [2l] 检查"代码里写没写对"（grep 级别）；
          这里把模块**真的跑起来**，用极简 DOM 桩一步步 fire
          animationend，检查每一步的类状态、图片 src、收尾是否干净。
          "事件没来会不会把面板永久盖死""名字不对的 animationend 会不会
          走错步"这类问题，只有跑起来才看得见。
       ============================================================ */
    section('[4] 点面板换底图：跑一遍时序（P50）');

    /* 一个能被测试翻转的 reduce 开关。
       ★ 用 getter 而不是固定值：模块在**点击那一刻**读 .matches，
         于是不用把模块 eval 两遍（eval 两遍会注册两个点击监听，
         一次点击被处理两次，测出来的东西就不算数了）。 */
    let reduceNow = false;
    global.matchMedia = q => ({
        media: q,
        get matches() { return reduceNow && /reduced-motion/.test(q); },
        addEventListener() {}, removeEventListener() {},
    });
    /* 时长令牌：模块会 getComputedStyle 读它们。
       ★ 四个都要给全（含 P53 的 --panel-lag）—— 少给一个，模块读成 0，
         测出来的编排就不是真机上那一套了。 */
    global.getComputedStyle = () => ({
        getPropertyValue: n => ({
            '--panel-sweep': '420ms',
            '--panel-cover': '340ms',
            '--panel-lag': '200ms',
            '--panel-tint': '200ms',
            '--panel-zoom': '600ms',
        }[n] || ''),
    });
    /* 预载：同步完成，测试不等网
       ★★ P50 修：这里必须模拟"图已经在缓存里"。
          真机上第一次换图时 `_test.jpg` 早就显示在面板上了 ——
          `new Image(); im.src = 同一个 URL` 之后 `im.complete` **立刻**为 true。
          原来的桩没有 complete（undefined），这条路径根本测不到，
          于是真机上炸、自检全绿。 */
    global.Image = class {
        constructor() { this.complete = false; }
        set src(v) {
            this._src = v;
            this.complete = true;                       /* 缓存命中：同步就绪 */
            global.Image.__cached = (global.Image.__cached || 0) + 1;
            if (this.onload) setTimeout(() => this.onload(), 0);   /* load 事件仍是异步的 */
        }
        get src() { return this._src; }
    };

    /* 面板桩：.media-panel[data-work] > .media-panel-bg > img */
    const mkPanel = (id, src) => {
        const p = doc.createElement('article');
        p.className = 'media-panel';
        p.setAttribute('data-work', id);
        const bg = doc.createElement('div');
        bg.className = 'media-panel-bg';
        const im = doc.createElement('img');
        im.setAttribute('src', src);
        bg.append(im);
        p.append(bg);
        doc.body.append(p);
        return { panel: p, bg: bg, img: im };
    };
    /* gallery 面板补一张图 —— 否则"换没换"根本看不出来。
       ★★ 期望值要**算出来**，不能写死：作品数据里的 shots 会变
          （P56 时 art-draw 已经有 2 张真图了）。所以下面断言"换成了列表里的下一张"，
          不写死某个文件名。 */
    const galleryWork = (window.WORKS || []).filter(w => w.id === 'art-draw')[0];
    galleryWork.shots.push({ src: 'assets/images/_second.jpg', caption: '第二张（测试用）' });
    const srcList = galleryWork.shots.map(s => s.src);
    const nextOf = (cur) => srcList[(srcList.indexOf(cur) + 1) % srcList.length];
    const A = mkPanel('art-draw', srcList[0]);
    const B = mkPanel('music', 'assets/images/_test.jpg');

    eval(read('js/media-swap.js'));
    await sleep(10);

    const veilA = A.panel.querySelectorAll('.media-panel-veil')[0];
    ok('★ 遮罩由模块注入（HTML 里没有它）', !!veilA);
    const fireClick = (p) => {
        const e = { type: 'click', target: p, preventDefault() {}, stopPropagation() {} };
        (doc._ev.click || []).forEach(f => f(e));
    };
    const fireKey = (p, key) => {
        const e = { type: 'keydown', key: key, target: p, preventDefault() {}, stopPropagation() {} };
        (doc._ev.keydown || []).forEach(f => f(e));
    };
    const anim = (el, name) => el.fire('animationend', { animationName: name });
    const tick = () => sleep(0);
    const cls = (p, c) => p.classList.contains(c);

    /* ---------- ①② 两层**并行**起跑 ----------
       ★★ P53 之后这里不再"等网点跑完才挂遮罩"：点一下，两个类同时上去，
          遮罩的迟早在 CSS 的 animation-delay 上（桩里是 --panel-lag）。 */
    fireClick(A.panel);
    fireClick(A.panel);          // ★ 连点两下：第二下必须被忽略
    await tick();
    ok('①② 点一下：两层同时挂上（is-sweep-in + is-covering），不是一步接一步',
        cls(A.panel, 'is-swap') && cls(A.panel, 'is-sweep-in') && cls(A.panel, 'is-covering'));
    ok('★★ 此刻是在等**遮罩**的 animationend（网点的不用等）',
        !cls(A.panel, 'is-veiled'));
    /* ★★ 名字不对的 animationend 不许推进：同一个 .media-panel-bg 上
       先后跑着 halftoneToSolid / halftoneFromSolid 两条动画。 */
    anim(A.bg, 'halftoneFromSolid');
    anim(A.bg, 'halftoneToSolid');
    await tick();
    ok('★★ 网点的 animationend 不推进流程（它不卡任何一步，只有遮罩卡）',
        cls(A.panel, 'is-sweep-in') && !cls(A.panel, 'is-veiled'));

    /* ---------- ③ 遮罩盖满 → 换图 ＋ 网点开始返回 ----------
       ★★ P55：网点的换手（sweep-in → sweep-out）搬到了**盖满那一刻**，
          和 is-veiled 同一帧 —— 它的 delay 是 `tint − sweep`，
          正好在幕开始收之前把"实心红"收干净（否则幕一收就露红）。 */
    anim(veilA, 'panelVeilIn');
    await tick();
    ok('③ 盖满那一刻：is-veiled ＋ 网点换手（sweep-out），sweep-in 摘掉',
        cls(A.panel, 'is-veiled') && cls(A.panel, 'is-sweep-out') && !cls(A.panel, 'is-sweep-in'));
    /* ★ 这里**不**断言"此刻 is-covering 还在" —— 桩里的图片是同步/立刻就绪的，
       所以"等图片就位"这一段在这里几乎不占时间，断言会变成竞态（我第一版就是）。
       这个顺序由源码级那条"换图夹在盖住与收起之间"盯着。 */
    await sleep(30);
    ok('★ ③ 换图发生在遮罩盖满之后（连点两下只前进一张）',
        A.img.getAttribute('src') === nextOf(srcList[0]), A.img.getAttribute('src'));

    /* ---------- ④⑤ 幕收起 + 图缩小，两段同刻起跑 ---------- */
    ok('④⑤ 图片就位后才换手：uncovering 挂上、covering 摘掉（网点早已换好）',
        cls(A.panel, 'is-uncovering') && !cls(A.panel, 'is-covering') &&
        cls(A.panel, 'is-sweep-out'));
    /* ★★ 收尾要等**三条**动画（Promise.all）：幕、网点、图缩放。
       只放行幕那一段，链子必须继续等 —— 少等一个，那条动画会被当场掐掉。 */
    anim(veilA, 'panelVeilOut');
    await sleep(30);
    ok('★★ 幕收完了也不能收尾：还在等网点和图缩放',
        cls(A.panel, 'is-swap') && cls(A.panel, 'is-sweep-out'));
    /* ★ 名字不对的也不许结束它 */
    anim(A.bg, 'halftoneToSolid');
    await sleep(10);
    ok('★★ 名字不对的 animationend 不算数（要 halftoneFromSolid）',
        cls(A.panel, 'is-swap'));
    anim(A.bg, 'halftoneFromSolid');
    await sleep(30);
    /* ★★ 网点跑完了、幕也收完了，但**图缩放还没完** —— 还得等它，
       否则摘类会把它掐在半路（图啪地跳到终态）。 */
    ok('★★ 网点和幕都完了也要等图缩放（少等它就掐在半路）',
        cls(A.panel, 'is-swap'));
    anim(A.img, 'panelImgZoom');
    await sleep(30);
    ok('★★ 收尾干净：六个类一个不留（留一个就是一整块红遮罩盖死）',
        !cls(A.panel, 'is-swap') && !cls(A.panel, 'is-sweep-in') &&
        !cls(A.panel, 'is-sweep-out') && !cls(A.panel, 'is-covering') &&
        !cls(A.panel, 'is-uncovering') && !cls(A.panel, 'is-veiled'));

    /* ---------- 键盘等价 + 非 gallery 面板（列表取 cover） ---------- */
    fireKey(B.panel, 'Enter');
    await tick();
    ok('★ 回车能换（键盘等价于点一下）', cls(B.panel, 'is-swap') && cls(B.panel, 'is-covering'));
    const veilB = B.panel.querySelectorAll('.media-panel-veil')[0];
    anim(veilB, 'panelVeilIn'); await sleep(30);
    ok('★ 非 gallery 面板也能换（列表 = [cover]，不报错）',
        B.img.getAttribute('src') === 'assets/images/_test.jpg');
    anim(veilB, 'panelVeilOut'); await tick();
    anim(B.bg, 'halftoneFromSolid'); await tick();
    anim(B.img, 'panelImgZoom'); await sleep(30);
    ok('★ 非 gallery 面板也收得干净', !cls(B.panel, 'is-swap'));

    /* ---------- ★★ 事件一个都不来：链子也必须走完 ---------- */
    /* 这是整节最重要的那条：animationend 不来（元素被隐藏、浏览器不派发、
       系统降级…）时，最坏结果只能是"动画没看见"，
       绝不能是"面板被一块红遮罩永久盖住"。 */
    fireClick(A.panel);
    await tick();
    ok('★ 事件不来时：停在这一步等（两层都挂着，说明确实在等遮罩）',
        cls(A.panel, 'is-swap') && cls(A.panel, 'is-covering') && !cls(A.panel, 'is-veiled'));
    /* 等超过遮罩那一步的兜底预算：cover + lag + SLACK */
    await sleep(1400);
    ok('★★ 事件一个都不来，兜底超时也会把它推进（换图 + 开始收）',
        cls(A.panel, 'is-veiled') || cls(A.panel, 'is-uncovering'),
        '类: ' + A.panel.className);
    /* 把剩下的补上，让它干净收场（否则会留一个挂着的链子） */
    anim(veilA, 'panelVeilOut'); await tick();
    anim(A.bg, 'halftoneFromSolid'); await tick();
    anim(A.img, 'panelImgZoom'); await sleep(30);
    ok('★★ 兜底路径走完也是干净的', !cls(A.panel, 'is-swap') && !cls(A.panel, 'is-covering'));

    /* ---------- 降低动效：不演，直接换 ---------- */
    reduceNow = true;
    const before = A.img.getAttribute('src');
    fireClick(A.panel);
    await tick();
    ok('★★ 降低动效下不演这套动画（一个类都不加），但图照换',
        !cls(A.panel, 'is-swap') && A.img.getAttribute('src') !== before,
        A.img.getAttribute('src'));
    reduceNow = false;

    /* ★★ 这条断言是给**测试自己**立的：如果哪天有人把桩里的
       `complete = true` 去掉（图不再模拟"缓存命中"），下面这些全绿
       也说明不了任何问题 —— 真机上炸的就是那条同步路径。
       所以这里直接数一下它到底走过几次。 */
    ok('★★ 这一轮确实跑过"缓存命中"的同步预载路径（否则等于没测那个 bug）',
        (global.Image.__cached || 0) > 0, 'cached=' + (global.Image.__cached || 0));


    /* ============================================================
       5. 侧边栏状态机（P64）
       ------------------------------------------------------------
       用的是 [3] 里那套 DOM 桩。侧边栏现在有**真逻辑**了（按 works.js
       生成卡带、选中态、规格写进舞台），而浏览器在这台机器上跑不了 ——
       所以照 [3]/[4] 的老办法：把 index.html 的骨架搭成桩，
       把 js/sidebar.js 真跑一遍。
       ★ 这一节一个 await 都不需要：sidebar.js 里没有任何定时器
         （[2o] 那条断言钉的就是这件事），同步就能验完。
       ============================================================ */
    section('[5] 侧边栏状态机（P64）');
    (function sidebarMachine() {
        /* --- 按 index.html 搭骨架（只搭 sidebar.js 会查的那些） --- */
        const aside = doc.createElement('aside');
        aside.className = 'play-sidebar';
        aside.setAttribute('id', 'play-sidebar');
        aside.setAttribute('aria-hidden', 'true');

        const rail = doc.createElement('nav');
        rail.className = 'play-rail';
        /* ★★ P98：卡带登场前那张"标题卡"（和 index.html 一样，排在 ul 之前） */
        const railTitle = doc.createElement('p');
        railTitle.className = 'play-rail-title';
        railTitle.setAttribute('data-play', 'rail-title');
        railTitle.textContent = '游戏卡带';
        const carts = doc.createElement('ul');
        carts.className = 'play-carts';
        carts.setAttribute('data-play', 'carts');
        rail.append(railTitle, carts);
        /* ★★ P103：选中框（.play-carts 的**兄弟** —— 塞进 ul 里不合法、还会挤开卡带 ✓） */
        const cartFrameEl = doc.createElement('span');
        cartFrameEl.className = 'play-cart-frame';
        cartFrameEl.setAttribute('data-play', 'cart-frame');
        rail.append(cartFrameEl);

        const mainEl = doc.createElement('div');
        mainEl.className = 'play-main';
        const barEl = doc.createElement('header');
        barEl.className = 'play-bar';
        const sidebarClose = doc.createElement('button');
        sidebarClose.className = 'play-close';
        sidebarClose.setAttribute('data-play', 'close');
        barEl.append(sidebarClose);
        const stage = doc.createElement('div');
        stage.className = 'play-body';
        stage.setAttribute('data-play', 'body');
        stage.setAttribute('data-state', 'empty');       // ★ 和 index.html 一致
        const specNo = doc.createElement('p'); specNo.setAttribute('data-play', 'spec-no');
        const specName = doc.createElement('p'); specName.setAttribute('data-play', 'spec-name');
        const specMeta = doc.createElement('p'); specMeta.setAttribute('data-play', 'spec-meta');
        const startBtnEl = doc.createElement('button'); startBtnEl.setAttribute('data-play', 'start');
        const playStage = doc.createElement('div'); playStage.setAttribute('data-play', 'stage');
        stage.append(specNo, specName, specMeta, startBtnEl, playStage);

        /* ★★ P99/P101：开场黑幕 —— 是 playStage 的**兄弟**（住在里面会被 stopGame 的
           replaceChildren() 连根拔掉 ✗），和 index.html 一样排在舞台之后 ✓；
           「游玩注意」那行字住在黑幕**里面**（P101 从游戏区下方搬过来的）✓ */
        const curtainEl0 = doc.createElement('div');
        curtainEl0.className = 'play-curtain';
        curtainEl0.setAttribute('data-play', 'curtain');
        const noticeBox = doc.createElement('div');
        noticeBox.className = 'play-curtain-notice';
        noticeBox.setAttribute('data-play', 'notice');
        const noticeUl = doc.createElement('ul');
        noticeUl.className = 'play-notice-list';
        noticeUl.setAttribute('data-play', 'notice-list');
        noticeBox.append(noticeUl);
        curtainEl0.append(noticeBox);
        stage.append(curtainEl0);

        /* ★ P91：游戏详细页那块 README（和 index.html 一样，排在游戏层之前） */
        const readmeBox = doc.createElement('div');
        readmeBox.className = 'play-readme';
        readmeBox.setAttribute('data-play', 'readme');
        stage.append(readmeBox);

        /* ★ P86：游戏发来的回执（和 index.html 一样，默认不可见） */
        const msgEl = doc.createElement('div');
        msgEl.className = 'play-msg';
        msgEl.setAttribute('data-play', 'msg');
        msgEl.setAttribute('role', 'status');
        stage.append(msgEl);

        mainEl.append(barEl, stage);
        aside.append(rail, mainEl);

        /* 首页那个触发按钮 */
        const trigger = doc.createElement('button');
        trigger.className = 'btn primary';
        trigger.setAttribute('data-play', 'open');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute('aria-controls', 'play-sidebar');

        doc.body.append(aside, trigger);

        /* ★ P93：导航栏里那三个"游戏控件" —— 它们在 aside **外面**，sidebar.js 是
           用 document.querySelector 找的，所以直接挂到 body 上 ✓ */
        const ctlClose = doc.createElement('button');
        ctlClose.setAttribute('data-play', 'ctl-close');
        const ctlMute = doc.createElement('button');
        ctlMute.setAttribute('data-play', 'ctl-mute');
        ctlMute.setAttribute('aria-pressed', 'false');
        ctlMute.disabled = true;
        const ctlFull = doc.createElement('button');
        ctlFull.setAttribute('data-play', 'ctl-full');
        ctlFull.setAttribute('aria-pressed', 'false');
        ctlFull.disabled = true;
        doc.body.append(ctlClose, ctlMute, ctlFull);

        const pausedBefore = paused, resumedBefore = resumed;
        /* 刻度时钟的反向播放：给个计数桩，验"开关两侧都真的喊了它"
           （四角刻线不再需要桩：P67 起它纯粹由 CSS 看着 body.sidebar-open 自己飞） */
        let circleHide = 0, circleShow = 0;
        window.CircleReveal = { hide() { circleHide++; }, show() { circleShow++; } };

        /* ★★ P91：README 的解析器要先在（sidebar.js 渲染时会用 window.Markdown）。
           桩里做一次同步 thenable 的 fetch —— 真 fetch 是异步的，但这一节一直
           刻意保持"一个 await 都不用"（见段首说明），而这个桩足够验两条路径：
           取到 / 取不到。调用顺序：fetch(...).then(A).then(B).catch(C) —— 见 sidebar.js ✓ */
        eval(read('js/markdown.js'));
        let fetchCalls = 0;
        function syncFetch(res) {
            let value = res, error = null;
            const api = {
                then(fn) {
                    if (error || value == null) return api;
                    try { value = fn(value); } catch (e) { error = e; }
                    return api;
                },
                catch(fn) { if (error) fn(error); return api; },
            };
            return api;
        }

        /* ★★ P94：图标这条路**从数据里读**，不假设"只有一条带图标" ——
           你已经把 4 条能玩的都填上了（`assets/images/_test.jpg`）✓。
           万一以后一条都没填，这里临时给"第一张能玩的"补一个（只动内存里的对象，
           不碰你的数据文件）—— 这样这条测试永远有东西可验 ✓。
           ★ 必须在 eval(sidebar.js) **之前**写：卡带是模块初始化时生成一次的。 */
        const ICON_SRC = 'assets/images/_test.jpg';
        const unityData = (window.WORKS || []).filter(function (w) { return w.kind === 'unity'; });
        if (!unityData.some(function (w) { return !!w.icon; })) {
            const seed = unityData.findIndex(function (w) { return !!w.src; });
            if (seed >= 0) unityData[seed].icon = ICON_SRC;
        }

        eval(read('js/sidebar.js'));
        const PS = window.PlaySidebar;

        /* ============================================================
           ★★ P97/P98/P99：这一节里凡是**过场**都是"定时器串起来的"，
           所以从这里开始把 setTimeout 换成**手动泵**（测试里按时间点推）——
           这一节一直保持"一个 await 都不用" ✓。快照在最后还原（[6] 之后还有别的
           异步小节在等真的定时器 ✗ 不能就这么换掉不管）。
           ============================================================ */
        const toKeep = global.setTimeout, ctoKeep = global.clearTimeout;
        let timerSeq = 0;
        let timers = [];
        global.setTimeout = function (fn, ms) {
            timers.push({ id: ++timerSeq, fn: fn, ms: ms, dead: false });
            return timerSeq;
        };
        global.clearTimeout = function (id) {
            const t = timers.filter(function (x) { return x.id === id; })[0];
            if (t) t.dead = true;
        };
        /* 按**毫秒数**找待跑的那个，不按下标 —— 名单里混着别的过场（兜底 530ms、
           标题 1s、卡带 250ms……），按下标会指错 ✓ */
        const pending = function (ms) {
            return timers.filter(function (t) { return !t.dead && t.ms === ms; });
        };
        /* 取**最后排上的**那个 —— 同毫秒的两个（卡带的 250 / 幕布的 250）按注册先后分 ✓ */
        const firePending = function (ms) {
            const list = pending(ms);
            const t = list[list.length - 1];
            if (t) { t.dead = true; t.fn(); }
            return !!t;
        };
        /* ★★ P99/P100：开场几拍（250 md 闪没 → 400 停顿 → 250 幕布 → 450 停 →
           400 渐出；有「游玩注意」时中间还有 3000 + 400）——
           老的那些"点开始 / 拖到舞台上"的测试不关心这套，一句 flushIntro() 推完 ✓
           ★ 用"最老的那条待跑定时器"循环推进（不写死顺序）——
             有注意 / 没注意两条路都能推干净 ✓ */
        const INTRO_MS = [250, 400, 450, 3000];
        const flushIntro = function () {
            for (let i = 0; i < 20; i++) {
                const t = timers.filter(function (x) {
                    return !x.dead && INTRO_MS.indexOf(x.ms) !== -1;
                })[0];
                if (!t) return;
                t.dead = true;
                t.fn();
            }
        };

        ok('PlaySidebar 导出 open / close / toggle / select',
            !!PS && typeof PS.open === 'function' && typeof PS.close === 'function' &&
            typeof PS.toggle === 'function' && typeof PS.select === 'function');

        /* --- 卡带：按 works.js 生成 --- */
        const btns = carts.querySelectorAll('.play-cart');
        /* ★★ P103：桩里没有布局 → 给每张卡带一个人造的 offset/尺寸
           （选中框的位置就是按它们算的，不造就没得验 ✓） */
        btns.forEach(function (b, i) {
            b.offsetWidth = 40;
            b.offsetHeight = 112;
            b.offsetLeft = 6;
            b.offsetTop = 8 + i * 124;
        });
        const unity = (window.WORKS || []).filter((w) => w.kind === 'unity');
        /* ★★ 这一节全程**从数据里读**，不写死是哪一条：卡带内容是你的数据，随时会变
           —— 目前就出现过"只挂 readme、没有 src"的条目（md样式）✓。
           playIdx / secondPlayIdx = 前两张**真能玩**的（有 src）；
           otherIdx = 任意另一张（不要求能玩，桌面/注意那些测试用它）。 */
        const playable = unity.map((w, i) => i).filter((i) => !!unity[i].src);
        const playIdx = playable.length ? playable[0] : -1;
        const secondPlayIdx = playable.length > 1 ? playable[1] : playIdx;
        const otherIdx = unity.findIndex((w, i) => i !== playIdx);
        const play = playIdx >= 0 ? unity[playIdx] : null;
        const playBtn = playIdx >= 0 ? btns[playIdx] : null;
        const secondPlay = secondPlayIdx >= 0 ? unity[secondPlayIdx] : null;
        const secondPlayBtn = secondPlayIdx >= 0 ? btns[secondPlayIdx] : null;
        const otherWork = otherIdx >= 0 ? unity[otherIdx] : null;
        const otherBtn = otherIdx >= 0 ? btns[otherIdx] : null;
        /* ★ 后面到处都要用"另一张卡带" —— 上面已经一次算好（const 有 TDZ，
           别在下面才声明：前面用了会直接抛 ✗）。 */
        ok('★ 卡带按 works.js 里 kind === "unity" 的条数生成（' + btns.length + ' 张：' +
            btns.map((b) => b.getAttribute('data-cart')).join(', ') + '）',
            btns.length >= 2 && btns.length === unity.length);
        ok('★ 每张卡带都有编号和（竖排的）名字',
            btns.every((b) => b.querySelectorAll('.play-cart-no')[0].textContent &&
                b.querySelectorAll('.play-cart-name')[0].textContent));

        /* --- ★★ P94：卡带图标（works.js 的 icon 字段）---
           ★ 哪一张带图标**由数据决定**（你现在 4 条都填了），所以这里从 unity 里找
              "第一条写了 icon 的 / 第一条没写的"，不写死下标 ✓ */
        const iconIdx = unity.findIndex(function (w) { return !!w.icon; });
        const noIconIdx = unity.findIndex(function (w) { return !w.icon; });
        const iconImg = (iconIdx >= 0 && btns[iconIdx])
            ? btns[iconIdx].querySelectorAll('.play-cart-icon')[0] : null;
        ok('★★ P94：写了 icon 的卡带铺一张图标（src 就是那条路径），而且排在编号/名字之前',
            !!iconImg && iconImg.src === unity[iconIdx].icon &&
            btns[iconIdx].childNodes[0] === iconImg,
            iconImg ? String(iconImg.src) + ' / 第一个孩子=' +
                (btns[iconIdx].childNodes[0] || {}).className : '没有 img');
        ok('★★ P94：加载失败（路径写错 / 文件不存在）→ 把 <img> 摘掉，退回纯色卡带',
            (function () {
                if (!iconImg) return false;
                iconImg.fire('error', { target: iconImg });          // 浏览器加载失败就是这条事件
                return btns[iconIdx].querySelectorAll('.play-cart-icon').length === 0;
            })());
        ok('★ P94：没写 icon 的卡带一个 <img> 都不加（就是纯色一块）',
            noIconIdx < 0 || btns[noIconIdx].querySelectorAll('.play-cart-icon').length === 0,
            noIconIdx < 0 ? '（数据里每条 unity 都写了 icon —— 这条只剩静态那半）'
                : '第 ' + noIconIdx + ' 张（' + unity[noIconIdx].id + '）没有 icon');
        ok('★（前置）至少有一条 unity 带 src（有真能玩的游戏）：' + (play ? play.id : '(没有)'),
            !!play && !!playBtn);
        /* --- ★★ P75：默认**不**选中任何一张 --- */
        ok('★★ 默认不选中任何一张（PS.current 是 null，两张都没按下）',
            PS.current === null && btns[0].getAttribute('aria-pressed') === 'false' &&
            btns[1].getAttribute('aria-pressed') === 'false', String(PS.current));
        ok('★★ 舞台停在 empty 状态（显示那句"从左侧卡带栏拖动游戏到此处启动游戏"）',
            stage.dataset.state === 'empty' && /从左侧卡带栏拖动游戏到此处启动游戏/.test(html));

        /* --- ★★ P75：悬停卡带 → 一条跟着鼠标走的回执 --- */
        window.innerWidth = 1200;      // 给 placeToast 的"夹回视口内"一个真数
        window.innerHeight = 800;
        const first = btns[0];
        first.fire('mouseenter', { target: first, clientX: 120, clientY: 300 });
        const toast = doc.body.querySelectorAll('.cursor-toast')[0];
        ok('★★ 悬停卡带生出一条 .cursor-toast.is-follow，内容取自 works.js 的 desc',
            !!toast && toast.classList.contains('is-follow') &&
            toast.textContent === (unity[0].desc || unity[0].title),
            toast ? toast.textContent.slice(0, 20) : '(没有生成)');
        const t1 = toast && toast.style.transform;
        first.fire('mousemove', { target: first, clientX: 260, clientY: 520 });
        ok('★ 跟着鼠标走（位置写在 transform 上，不是 left/top）',
            !!t1 && !!toast && toast.style.transform !== t1 &&
            /^translate\(-?[\d.]+px, -?[\d.]+px\)$/.test(toast.style.transform || ''),
            t1 + '  →  ' + (toast && toast.style.transform));
        first.fire('mouseleave', { target: first });
        ok('★★ 鼠标离开就摘掉（不留常驻节点）',
            doc.body.querySelectorAll('.cursor-toast').length === 0);

        /* --- ★★ P77 / P78：鼠标点一下 ---
           P77 的要求是"跟随回执不许被 focus 那套重建成卡带顶端那份"；
           P78 把产品行为改成了"点过就收起来"（游戏区已经显示详细了），
           所以这里钉的是**新的**结果：收起来 + 之后 mousemove 也不冒回来。 */
        first.fire('mouseenter', { target: first, clientX: 120, clientY: 300 });
        ok('★ 点之前回执在', doc.body.querySelectorAll('.cursor-toast').length === 1);
        first.fire('click', { target: first });        // 点击会给按钮焦点
        first.fire('focus', { target: first });
        ok('★★ 点一下：回执收起来（而不是被"键盘那套"顶到卡带顶端）',
            doc.body.querySelectorAll('.cursor-toast').length === 0);
        first.fire('mousemove', { target: first, clientX: 200, clientY: 500 });
        ok('★★ 之后 mousemove 也不许冒回来（clicked 闸门）',
            doc.body.querySelectorAll('.cursor-toast').length === 0);
        first.fire('mouseleave', { target: first });

        /* --- ★★ P77b：回执被谁删掉之后，鼠标一按就补回来 ---
           （真机上"点一下回执就没了"我们没抓稳是哪条事件链，所以做了自愈：
             元素没了 / 脱离文档，下一次 mousedown 就整条重建。） */
        first.fire('mouseenter', { target: first, clientX: 150, clientY: 350 });
        ok('★ 重新悬停：回执又有了', doc.body.querySelectorAll('.cursor-toast').length === 1);
        doc.body.querySelectorAll('.cursor-toast')[0].remove();     // 模拟"被别处删了"
        ok('★（模拟）删掉之后它确实不在了', doc.body.querySelectorAll('.cursor-toast').length === 0);
        first.fire('mousedown', { target: first, clientX: 150, clientY: 350 });
        const healed = doc.body.querySelectorAll('.cursor-toast')[0];
        ok('★★ 鼠标一按就补回来，而且仍在鼠标旁边（不是卡带顶端）',
            !!healed && healed.classList.contains('is-follow') &&
            healed.style.transform === 'translate(164px, 364px)',
            healed && healed.style.transform);
        first.fire('mouseleave', { target: first });

        /* --- ★★ P78：点过之后回执收掉，直到鼠标移出 --- */
        first.fire('mouseenter', { target: first, clientX: 150, clientY: 350 });
        ok('★ 悬停时回执在', doc.body.querySelectorAll('.cursor-toast').length === 1);
        first.fire('click', { target: first });
        ok('★★ 点一下：回执立刻收掉（游戏区已经显示它的详细了）',
            doc.body.querySelectorAll('.cursor-toast').length === 0);
        first.fire('mousemove', { target: first, clientX: 160, clientY: 360 });
        ok('★★ 鼠标还停着就不许自己冒回来（clicked 闸门 / 自愈也要让路）',
            doc.body.querySelectorAll('.cursor-toast').length === 0);
        first.fire('mouseleave', { target: first });
        first.fire('mouseenter', { target: first, clientX: 150, clientY: 350 });
        ok('★★ 移出再悬停：回执照旧显示（clicked 已复位）',
            doc.body.querySelectorAll('.cursor-toast').length === 1);
        first.fire('mouseleave', { target: first });

        /* --- ★★ P80：指针拖拽（自己实现的那套）拖到舞台上启动 ---
           桩里所有元素的假矩形都是 (0,0,40,120)，所以指针落在 (20,60) 就算"在舞台上"。
           阈值 DRAG_MIN = 6：先按在 (10,10) 再移到 (20,60)，曼哈顿距离 60 ≥ 6 → 算拖动。 */
        /* ★★ 从这里开始的拖动/启动测试一律用 playBtn（第一张**能玩**的卡带）——
           它们要真的挂 iframe，碰上一张"只挂 readme、没有 src"的条目就白测了 ✓ */
        playBtn.fire('pointerdown', { target: playBtn, button: 0, pointerId: 1, clientX: 10, clientY: 10 });
        playBtn.fire('pointermove', { target: playBtn, pointerId: 1, clientX: 12, clientY: 12 });
        ok('★ 只挪 4px：还没到阈值，不算拖动（也就没进 is-dragging）',
            !stage.classList.contains('is-dragging'));
        playBtn.fire('pointermove', { target: playBtn, pointerId: 1, clientX: 20, clientY: 60 });
        ok('★★ 越过阈值：进拖动状态（舞台给虚线提示 is-dragging）+ 指针在舞台上 → is-drop',
            stage.classList.contains('is-dragging') && stage.classList.contains('is-drop'));
        ok('★★ P85：拖动期间 body 挂着 is-cart-dragging（整块面板换成"握住"光标）',
            doc.body.classList.contains('is-cart-dragging'));
        /* ★★ P95：拖起来的那张原位变成"空槽位"（CSS 把内容 visibility: hidden 掉） */
        ok('★★ P95：拖动期间**源卡带**挂上 is-taken —— 原位变成空槽（内容跟着手上那张走了）',
            playBtn.classList.contains('is-taken'));
        ok('★ P95：空槽里那三个孩子（图标/编号/名字）都还在 DOM 里（只隐藏，尺寸不跳）',
            playBtn.querySelectorAll('.play-cart-no').length === 1 &&
            playBtn.querySelectorAll('.play-cart-name').length === 1 &&
            playBtn.childNodes.length >= 2,
            String(playBtn.childNodes.length));
        ok('★ 拖动期间把跟随回执收掉了', doc.body.querySelectorAll('.cursor-toast').length === 0);
        playBtn.fire('pointerup', { target: playBtn, pointerId: 1, clientX: 20, clientY: 60 });
        flushIntro();                       // ★ P99：推完开场三拍（md 闪没 → 幕布 → 载入 → 渐出）
        ok('★★ 落在舞台上松手 = 启动（按这张卡带的 id 选中）',
            PS.current === play.id, String(PS.current));
        ok('★★ 松手之后两个提示类都清掉、影子也摘掉、body 的"握住"也摘掉',
            !stage.classList.contains('is-drop') && !stage.classList.contains('is-dragging') &&
            !doc.body.classList.contains('is-cart-dragging') &&
            doc.body.querySelectorAll('.is-ghost').length === 0);
        ok('★★ P95：松手后内容回到槽位里（is-taken 摘掉 —— 拖完还空着就露馅了）',
            !playBtn.classList.contains('is-taken'));
        /* 拖完那一下浏览器还会派发一次 click —— 必须被吃掉，否则状态会再跳一次 */
        playBtn.fire('click', { target: playBtn });
        ok('★ 拖完后的那次 click 被吃掉（不再重复选中 / 收执）', PS.current === play.id);

        /* --- 拖到舞台外松手：作废，不改选中 --- */
        const wasCurrent = PS.current;
        const other = otherBtn;
        other.fire('pointerdown', { target: other, button: 0, pointerId: 2, clientX: 200, clientY: 200 });
        other.fire('pointermove', { target: other, pointerId: 2, clientX: 220, clientY: 220 });
        other.fire('pointerup', { target: other, pointerId: 2, clientX: 220, clientY: 220 });
        ok('★ 拖到舞台外面松手 = 作废（选中不变）', PS.current === wasCurrent, String(PS.current));
        ok('★ P95：作废这一下槽位也还原了（内容回来，不留一个空壳）',
            !other.classList.contains('is-taken'));
        /* ★★ P100b：拖完那一下浏览器**还会**派发一次 click（指针被 capture 在卡带上，
           哪怕松手在卡带外面）→ 这里把那一下补上：必须被吃掉（选中不变）✓
           不补的话标志位会一直挂着，把后面某次正常点击吞掉 ✗（这条测出来的） */
        other.fire('click', { target: other });
        ok('★ P100b：拖到舞台外松手后那一下 click 也被吃掉（选中不变，不会误选）',
            PS.current === wasCurrent, String(PS.current));

        /* --- ★★ P95：中途取消（指针被打断 / Esc）也要把卡带放回槽位 --- */
        playBtn.fire('pointerdown', { target: playBtn, button: 0, pointerId: 9, clientX: 10, clientY: 10 });
        playBtn.fire('pointermove', { target: playBtn, pointerId: 9, clientX: 20, clientY: 60 });
        ok('★（前置）又拖起来了（source 是空槽）', playBtn.classList.contains('is-taken'));
        playBtn.fire('pointercancel', { target: playBtn, pointerId: 9 });
        ok('★★ P95：pointercancel（指针被打断）→ 空槽立刻还原',
            !playBtn.classList.contains('is-taken') && !stage.classList.contains('is-dragging'));

        /* --- ★★ P96：拿起那一下 + 延迟跟手（把 rAF 换成**手动泵**，推帧验缓动）---
           ★ 这一节一直是"一个 await 都不用"，所以不能等真的 rAF ——
             把 requestAnimationFrame 收进数组，测试里自己按时间戳推帧 ✓ */
        (function ghostEasing() {
            const rafKeep = global.requestAnimationFrame;
            const cafKeep = global.cancelAnimationFrame;
            let frames = [], cancelled = 0;
            global.requestAnimationFrame = function (fn) { frames.push(fn); return frames.length; };
            global.cancelAnimationFrame = function () { cancelled++; };
            const pump = function (now) { const f = frames.shift(); if (f) f(now); };
            const num = function (s, re) { return parseFloat((re.exec(String(s)) || [])[1] || 'NaN'); };
            const trX = function (s) { return num(s, /translate\((-?[\d.]+)px/); };
            const trY = function (s) { return num(s, /,\s*(-?[\d.]+)px\)/); };
            const trS = function (s) { return num(s, /scale\(([\d.]+)\)/); };

            playBtn.fire('pointerdown', { target: playBtn, button: 0, pointerId: 5, clientX: 100, clientY: 100 });
            playBtn.fire('pointermove', { target: playBtn, pointerId: 5, clientX: 200, clientY: 300 });
            const gh = doc.body.querySelectorAll('.is-ghost')[0];
            ok('★★ P96：拖起来那一刻，手上多了一张"浮起卡带"（就是那张卡带的克隆）',
                !!gh && gh.classList.contains('is-ghost') && gh.classList.contains('play-cart') &&
                gh !== playBtn, gh ? gh.className : '没有影子');
            /* 桩里的假矩形是 (0,0,40,120)：startDrag 是从 pointermove(200,300) 进来的，
               所以"抓点" = 指针相对卡带左上角 = (200,300)。
               ★ 于是克隆那一张的起始位置 = 指针 - 抓点 = (0,0) —— 也就是**原卡带自己的位置** ✓
                 （拿起来时卡带不跳，正是这条的意义）。 */
            ok('★★ P96：刚拿起来时克隆就摆在原卡带的位置上（不跳），而且还是"没抬起"的样子',
                trX(gh.style.transform) === 0 && trY(gh.style.transform) === 0 &&
                trS(gh.style.transform) === 1, String(gh.style.transform));
            ok('★ P96：缓动循环已经开起来了（排了一帧；起点钉在指针上，不会从别处飞过来）',
                frames.length === 1, '待推帧数=' + frames.length);

            /* 指针再走 200px（200 → 400）→ 卡带要"追"：一帧只追一部分，推够帧数才贴上 ✓ */
            playBtn.fire('pointermove', { target: playBtn, pointerId: 5, clientX: 400, clientY: 300 });
            pump(16.7);
            const x1 = trX(gh.style.transform);
            ok('★★ P96：延迟跟手 —— 指针又走 200px，一帧之后卡带只追了一小段（' + x1 + '，目标 200）',
                x1 > 0 && x1 < 200, String(gh.style.transform));
            ok('★ P96：抬起/放大也在推进（scale 已经大于 1、还没到 1.06）',
                trS(gh.style.transform) > 1 && trS(gh.style.transform) < 1.06,
                String(gh.style.transform));
            for (let i = 0; i < 60; i++) pump(16.7 * (i + 2));
            ok('★★ P96：停手就贴上来（推够帧数：位置追上目标、抬起走完 = 上移 8px + 放大到 1.06）',
                trX(gh.style.transform) === 200 && trY(gh.style.transform) === -8 &&
                trS(gh.style.transform) === 1.06,
                String(gh.style.transform));

            playBtn.fire('pointerup', { target: playBtn, pointerId: 5, clientX: 400, clientY: 300 });
            ok('★★ P96：松手 → 影子摘掉 + 缓动循环 cancel（这条 rAF 只在拖动期间活着）',
                !doc.body.querySelectorAll('.is-ghost')[0] && cancelled >= 1, String(cancelled));

            global.requestAnimationFrame = rafKeep;
            global.cancelAnimationFrame = cafKeep;
        })();

        /* --- ★★ P81：拖到舞台上 = 真的开始（往游戏层里挂 iframe） --- */
        playBtn.fire('pointerdown', { target: playBtn, button: 0, pointerId: 3, clientX: 10, clientY: 10 });
        playBtn.fire('pointermove', { target: playBtn, pointerId: 3, clientX: 20, clientY: 60 });
        playBtn.fire('pointerup', { target: playBtn, pointerId: 3, clientX: 20, clientY: 60 });
        flushIntro();                       // ★ P99：开场三拍推完，下面是"游戏已经挂上"的断言
        ok('★★ 舞台进 play 状态，游戏层里挂上了 iframe',
            stage.dataset.state === 'play' && playStage.querySelectorAll('.play-frame').length === 1,
            stage.dataset.state + ' / ' + playStage.querySelectorAll('.play-frame').length);
        ok('★ 载入层也在（等 iframe 的 load 才淡掉）',
            playStage.querySelectorAll('.play-loading').length === 1 &&
            !stage.classList.contains('is-loaded'));
        const mountedFrame = playStage.querySelectorAll('.play-frame')[0];
        ok('★★ iframe 指向 works.js 里那条 src（惰性设的，不是写死的）',
            mountedFrame.src === play.src,
            String(mountedFrame.src));
        mountedFrame.fire('load', { target: mountedFrame });
        ok('★★ 载入完 → is-loaded（CSS 里载入层淡掉）', stage.classList.contains('is-loaded'));

        /* --- ★★ P83：玩游戏的时候，浏览器别抢键 / 别抢右键 ---
           关键：焦点进了 iframe，父页面**收不到**键盘和右键事件 ——
           所以守卫要挂两份。桩里没有真的 iframe 文档，自己造一个"同源的"，
           设成 contentDocument 再重放一次 load，看守卫有没有挂进去。 */
        const innerDoc = {
            _ev: Object.create(null),
            addEventListener(t, f) { (this._ev[t] || (this._ev[t] = [])).push(f); },
        };
        mountedFrame.contentDocument = innerDoc;                // 装成"同源，够得着"
        mountedFrame.fire('load', { target: mountedFrame });    // 重新 load → 重挂守卫
        ok('★★ 同源：守卫挂进了 iframe 那份文档（keydown + contextmenu + 去重标记）',
            (innerDoc._ev.keydown || []).length === 1 &&
            (innerDoc._ev.contextmenu || []).length === 1 &&
            innerDoc.__playGuarded === true,
            JSON.stringify(Object.keys(innerDoc._ev)));
        let innerKey = 0, innerCtx = 0;
        (innerDoc._ev.keydown || []).forEach(function (f) {
            f({ key: 'r', ctrlKey: true, preventDefault() { innerKey++; } });
        });
        (innerDoc._ev.contextmenu || []).forEach(function (f) {
            f({ preventDefault() { innerCtx++; } });
        });
        ok('★★ 焦点在游戏里：Ctrl+R 被拦下、右键菜单被拦（游戏自己的处理照样收得到这个键）',
            innerKey === 1 && innerCtx === 1, innerKey + '/' + innerCtx);

        /* 父页面这一份：焦点在站点自己的控件上时管事 —— 而且**只**在玩的时候。
           桩里 fire 会冒泡到 doc，所以事件的 preventDefault 计数器两边都算，
           下面只断言"有没有被拦"，不断言拦了几次。 */
        const parentPress = function (o) {
            let hit = 0;
            doc.dispatchEvent(Object.assign({
                type: 'keydown', ctrlKey: false, shiftKey: false, metaKey: false,
                preventDefault() { hit++; },
            }, o));
            return hit;
        };
        ok('★★ 在玩：Ctrl+R / F5 / Ctrl+P 都被拦下（你报的就是第一条）',
            parentPress({ key: 'r', ctrlKey: true }) === 1 &&
            parentPress({ key: 'F5' }) === 1 &&
            parentPress({ key: 'p', ctrlKey: true }) === 1);
        /* ★★ P84：你列的那一大堆绑定 —— 一个都不许漏（这就是"不逐个列举"的意思） */
        ok('★★ P84：Ctrl+T / E / 1 / 2 / ` / - / = …… 带修饰键的一律拦（白名单式列举永远漏）',
            ['t', 'e', '1', '2', '`', '-', '='].every(function (k) {
                return parentPress({ key: k, ctrlKey: true }) === 1;
            }));
        ok('★ Alt 组合同样拦（Alt+← 后退这类浏览器动作）',
            parentPress({ key: 'ArrowLeft', altKey: true }) === 1 &&
            parentPress({ key: 'f', altKey: true }) === 1);
        ok('★★ 逃生口必须都在：Ctrl+W 关标签、F11 全屏、F12 控制台一律不动',
            parentPress({ key: 'w', ctrlKey: true }) === 0 &&
            parentPress({ key: 'w', ctrlKey: true, shiftKey: true }) === 0 &&
            parentPress({ key: 'F11' }) === 0 &&
            parentPress({ key: 'F12' }) === 0);
        ok('★★ 不做全键盘吞掉：光秃秃的键、Shift 组合、Tab 一律不碰',
            parentPress({ key: 'a' }) === 0 &&
            parentPress({ key: 'ArrowUp' }) === 0 &&
            parentPress({ key: 'A', shiftKey: true }) === 0 &&
            parentPress({ key: 'Tab' }) === 0);
        ok('★★ 输入框里放行（Unity 的隐藏 input：Ctrl+V / A / X 不能被吃，否则游戏里打不了字）',
            parentPress({ key: 'v', ctrlKey: true, target: { tagName: 'INPUT' } }) === 0 &&
            parentPress({ key: 'a', ctrlKey: true, target: { tagName: 'TEXTAREA' } }) === 0 &&
            parentPress({ key: 'c', ctrlKey: true, target: { isContentEditable: true } }) === 0);
        ok('★ 游戏在跑：舞台上的右键菜单被拦（右键留给游戏）', (function () {
            let hit = 0;
            playStage.fire('contextmenu', { type: 'contextmenu', preventDefault() { hit++; } });
            return hit >= 1;
        })());

        /* --- ★★ P82：游戏自己喊"我退出了"（postMessage）---
           桌面版的 Application.Quit() 在网页里会把 WebGL 循环停掉（"卡住"），
           站点接不住它 —— 但约定了这一句：收到就拔 iframe、退回详情页。 */
        mountedFrame.contentWindow = { fake: true };     // 桩里没有 contentWindow，给一个
        doc.dispatchEvent({
            type: 'message',
            source: { notTheFrame: true },               // 冒充的 → 必须被忽略
            data: 'resolualysis:play-exit',
        });
        ok('★ 别人发来的同一句话不算数（只认当前那个 iframe）',
            playStage.querySelectorAll('.play-frame').length === 1 && stage.dataset.state === 'play');
        doc.dispatchEvent({
            type: 'message',
            source: mountedFrame.contentWindow,
            data: 'resolualysis:play-exit',
        });
        ok('★★ 游戏自己喊退出：拔掉 iframe、退回详情页（不留空舞台）',
            playStage.querySelectorAll('.play-frame').length === 0 && stage.dataset.state === 'game',
            stage.dataset.state);

        /* 游戏一停，键和右键立刻还给浏览器 —— 否则你连 Ctrl+R 刷本站都刷不了 */
        ok('★★ 游戏停了：Ctrl+R / F5 立刻还给浏览器（守卫只认 playingGame）',
            parentPress({ key: 'r', ctrlKey: true }) === 0 &&
            parentPress({ key: 'F5' }) === 0);
        ok('★ 没在玩：右键菜单也还给浏览器', (function () {
            let hit = 0;
            playStage.fire('contextmenu', { type: 'contextmenu', preventDefault() { hit++; } });
            return hit === 0;
        })());

        /* 换一条：正在跑的那套要被卸掉（WebGL 上下文只留一个） */
        playBtn.fire('click', { target: playBtn });   // ★ 先清掉拖完那次 click 的吞（吞的是**被拖的那张**）
        secondPlayBtn.fire('click', { target: secondPlayBtn });
        ok('★★ 换到另一条：旧的 iframe 被卸掉、状态退回 game',
            playStage.querySelectorAll('.play-frame').length === 0 &&
            stage.dataset.state === 'game' && !stage.classList.contains('is-loaded'),
            stage.dataset.state + ' / ' + playStage.querySelectorAll('.play-frame').length);

        /* 「开始游戏」按钮：点击选中的那条路也能开 */
        startBtnEl.fire('click', { target: startBtnEl });
        flushIntro();                       // ★ P99：开场三拍推完
        ok('★ 点「开始游戏」：挂上 iframe、进 play',
            playStage.querySelectorAll('.play-frame').length === 1 && stage.dataset.state === 'play',
            'current=' + PS.current + ' frames=' + playStage.querySelectorAll('.play-frame').length +
            ' state=' + stage.dataset.state);
        /* 收个尾：点另一张把正在跑的卸掉，让后面的断言从干净的 game 态开始 */
        otherBtn.fire('click', { target: otherBtn });
        ok('★ 再点另一条：iframe 卸掉、退回 game 态',
            playStage.querySelectorAll('.play-frame').length === 0 && stage.dataset.state === 'game',
            'frames=' + playStage.querySelectorAll('.play-frame').length +
            ' state=' + stage.dataset.state + ' current=' + PS.current);

        /* --- 换一张卡带（★ 也是从数据里读：otherBtn）--- */
        otherBtn.fire('click', { target: otherBtn });        ok('★★ 点另一张：选中态翻过去、舞台规格跟着换、状态从 empty 变 game',
            PS.current === otherWork.id && otherBtn.getAttribute('aria-pressed') === 'true' &&
            btns[playIdx].getAttribute('aria-pressed') === 'false' &&
            specName.textContent === (otherWork.title || otherWork.id) &&
            specNo.textContent === (otherWork.no || '--') &&
            stage.dataset.state === 'game',
            specName.textContent + ' / ' + specNo.textContent + ' / ' + stage.dataset.state);
        ok('★ 挑卡带不会顺手把游乐区打开', !doc.body.classList.contains('sidebar-open'));

        /* --- 开 / 关 --- */
        /* ★★ P97/P98/P99：这几段过场都是"定时器串起来的"（亮 1s → 渐隐 → 0.25s 卡带冒；
           或者 md 闪没 → 幕布 → 载入 → 渐出）—— setTimeout 已经在上面换成**手动泵**了 ✓ */

        trigger.fire('click', { target: trigger });
        ok('★★ 点按钮：body 挂类 + aria 同步 + 焦点进关闭键 + 背景停表 + 刻度时钟反向闪没',
            doc.body.classList.contains('sidebar-open') &&
            aside.getAttribute('aria-hidden') === 'false' &&
            trigger.getAttribute('aria-expanded') === 'true' &&
            sidebarClose === doc._focus && paused === pausedBefore + 1 &&
            circleHide === 1 && circleShow === 0,
            'focus=' + (doc._focus && doc._focus.className) + ' paused=' + (paused - pausedBefore) +
            ' clock=' + circleHide + '/' + circleShow);

        /* --- ★★ P97/P98：滑到位 → 标题卡闪一下 → 卡带才逐个冒出来 --- */
        ok('★★ P97：刚开门（面板还在滑）时卡带栏**还没有** is-in —— 那 450ms 里是空栏',
            !carts.classList.contains('is-in') && !railTitle.classList.contains('is-in'));
        ok('★ P97：每张卡带的 --cart-i 就是它的序号（错开"冒出来"的先后靠它）',
            btns.every(function (b, i) { return b.style.getPropertyValue('--cart-i') === String(i); }),
            btns.map(function (b) { return b.style.getPropertyValue('--cart-i'); }).join(','));
        /* 面板上还挂着 visibility 那条过渡：它派发的 transitionend **不算数** ✓ */
        aside.fire('transitionend', { target: aside, propertyName: 'visibility' });
        ok('★ P98：只认 left 那条过渡 —— visibility 派发的 transitionend 不启动过场',
            !railTitle.classList.contains('is-in') && !carts.classList.contains('is-in'));
        aside.fire('transitionend', { target: aside, propertyName: 'left' });
        ok('★★ P98：滑到位 → 「游戏卡带」闪烁出现（is-in），此时卡带**一个都还没出来**',
            railTitle.classList.contains('is-in') && !railTitle.classList.contains('is-out') &&
            !carts.classList.contains('is-in'));
        ok('★★ P98：接着排上的是"亮着 1s"那个定时器（你说的 1s），'
            + '而那条兜底的 530ms 已经被取消 ✓',
            pending(1000).length === 1 && pending(530).length === 0,
            '1s=' + pending(1000).length + ' / 530=' + pending(530).length);
        firePending(1000);
        ok('★★ P98：1s 到 → 标题**开始渐隐**（is-out），卡带仍然没出来',
            railTitle.classList.contains('is-out') && !carts.classList.contains('is-in'));
        ok('★★ P98：下一个定时器是 0.25s（"开始渐隐之后 0.25s 再让卡带出现"）',
            pending(250).length === 1, String(pending(250).length));
        firePending(250);
        ok('★★ P98：0.25s 到 → 卡带才开始逐个冒（is-in；CSS 那边再逐张错开 90ms）',
            carts.classList.contains('is-in'));

        sidebarClose.fire('click', { target: sidebarClose });
        ok('★★ 点关闭：类摘掉 + aria 复位 + 焦点还给按钮 + 背景恢复 + 刻度时钟闪回来',
            !doc.body.classList.contains('sidebar-open') &&
            aside.getAttribute('aria-hidden') === 'true' &&
            trigger.getAttribute('aria-expanded') === 'false' &&
            trigger === doc._focus && resumed === resumedBefore + 1 &&
            circleShow === 1, 'clock=' + circleHide + '/' + circleShow);
        ok('★★ P97：关门**不摘** is-in —— 卡带跟着面板一起滑走，不能在滑走途中消失/冒出来',
            carts.classList.contains('is-in'));
        ok('★★ P98：关门把标题卡收掉（过场不该跟着面板滑出去时还亮着）+ 相关定时器全清',
            !railTitle.classList.contains('is-in') && !railTitle.classList.contains('is-out') &&
            [530, 1000, 250].every(function (ms) { return pending(ms).length === 0; }),
            [530, 1000, 250].map(function (ms) { return ms + ':' + pending(ms).length; }).join(' '));

        /* --- Esc --- */
        PS.open(trigger);
        doc.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() { } });
        ok('★★ Esc 能关', !PS.isOpen && !doc.body.classList.contains('sidebar-open'));

        /* --- 开屏期间不许开 --- */
        doc.body.classList.add('locked');
        PS.open(trigger);
        ok('★★ 开屏期间（body.locked）拒绝打开（否则它会落在开屏那几层下面）',
            !PS.isOpen && !doc.body.classList.contains('sidebar-open'));
        doc.body.classList.remove('locked');

        /* --- ★★ P81：关掉再打开 → 舞台回到干净状态 ---
           现象（你报的）：关掉再打开还留着刚才点过 / 拖进来的那一条。 */
        PS.open(trigger);
        /* ★ 复位会清掉选中（这正是要验的行为）—— 所以先重新选一条**能玩的**再开 */
        playBtn.fire('click', { target: playBtn });
        startBtnEl.fire('click', { target: startBtnEl });   // 先开一个游戏
        flushIntro();                                      // ★ P99：开场三拍推完
        ok('★ （前置）正在跑：play 态 + 有 iframe',
            stage.dataset.state === 'play' && playStage.querySelectorAll('.play-frame').length === 1,
            'current=' + PS.current + ' state=' + stage.dataset.state);
        PS.close();
        ok('★★ 关门就把 iframe 卸了（释放 WebGL 上下文），舞台退回 game 态（不是空舞台）',
            playStage.querySelectorAll('.play-frame').length === 0 && stage.dataset.state === 'game',
            stage.dataset.state);
        PS.open(trigger);
        ok('★★ P81/P97/P98：再开门 → 复位把 is-in 摘了、标题卡也收干净（下一轮重演）',
            !carts.classList.contains('is-in') &&
            !railTitle.classList.contains('is-in') && !railTitle.classList.contains('is-out'));
        aside.fire('transitionend', { target: aside, propertyName: 'left' });
        ok('★ P98：于是标题卡又闪一次（第二次 is-in）',
            railTitle.classList.contains('is-in') && !carts.classList.contains('is-in'));
        ok('★★ 再打开：舞台回到 empty、没有 iframe、卡带按下态清掉、选中置空',
            stage.dataset.state === 'empty' &&
            playStage.querySelectorAll('.play-frame').length === 0 &&
            PS.current === null && !stage.classList.contains('is-loaded') &&
            btns.every(function (b) { return b.getAttribute('aria-pressed') === 'false'; }),
            stage.dataset.state + ' / current=' + PS.current);
        ok('★★ 复位也把"点过"的闸门清了（再悬停照样能出回执）',
            (function () {
                first.fire('mouseenter', { target: first, clientX: 90, clientY: 90 });
                return doc.body.querySelectorAll('.cursor-toast').length === 1;
            })());
        first.fire('mouseleave', { target: first });
        PS.close();

        /* --- ★★ P84 → P101：「游玩注意」的内容渲染（黑幕上那行字）---
           开关与内容仍在 works.js（noticeOn / notice）。P101 起**选中时只把内容备好、
           不再显示**；显示时机交给开场过场（下面 P101 那段逐拍验）✓
           这里验的是"渲染这套机制"（数据驱动，不写死文案 ✓）。 */
        const wNot = play;                       // ★ 数据驱动：第一张能玩的卡带（别写死 id）
        const keepOn = wNot.noticeOn, keepText = wNot.notice;

        wNot.noticeOn = true;
        wNot.notice = ['第一段注意事项', '第二段注意事项'];
        playBtn.fire('click', { target: playBtn });            // ★ wNot 就是 play：点它的卡带
        ok('★★ P101：选中时**只把内容备好**（两个 li），但**一个类都不加** —— 还不显示 ✓',
            noticeUl.childNodes.length === 2 &&
            noticeUl.childNodes[0].textContent === '第一段注意事项' &&
            noticeUl.childNodes[1].textContent === '第二段注意事项' &&
            noticeUl.childNodes[0].className === 'play-notice-item' &&
            !noticeBox.classList.contains('is-on') && !noticeBox.classList.contains('is-out'),
            noticeUl.childNodes.length + ' 条 / ' + noticeBox.className);

        wNot.noticeOn = false;
        otherBtn.fire('click', { target: otherBtn });                   // 换到另一条（没开）
        playBtn.fire('click', { target: playBtn });                   // 再切回来
        ok('★★ 开关关掉：内容清空（不留上一条的残影）', noticeUl.childNodes.length === 0);

        wNot.noticeOn = true;
        wNot.notice = '   ';                                  // 开了但只有空白
        otherBtn.fire('click', { target: otherBtn });
        playBtn.fire('click', { target: playBtn });
        ok('★ 开了但内容是空白 → 一条都不留（过场那边就不会闪）', noticeUl.childNodes.length === 0);

        wNot.notice = '一句话注意\n第二行';                    // 字符串也吃，\n 分段
        otherBtn.fire('click', { target: otherBtn });
        playBtn.fire('click', { target: playBtn });
        ok('★ 内容写成字符串也行（\\n 分成两段）',
            noticeUl.childNodes.length === 2 &&
            noticeUl.childNodes[1].textContent === '第二行');

        wNot.noticeOn = keepOn; wNot.notice = keepText;        // 还原桩里的数据
        PS.open(trigger);
        ok('★★ 关门再开门（重置那一刻）：内容也清掉了', noticeUl.childNodes.length === 0);
        PS.close();

        /* --- ★★ P85：拦截是 works.js 里一条开关（keyGuardOn）管的 ---
           开关在按「开始游戏」那一刻抄走（"这一局"和"数据后来改了"互不影响），
           所以这里要**真的重开一局**才验得出来：换走 → 换回 → 开始。 */
        const wKey = play;                       // ★ 数据驱动：第一张能玩的卡带
        const keepKeyGuard = wKey.keyGuardOn;
        const startBoom = function () {
            secondPlayBtn.fire('click', { target: secondPlayBtn });      // 先换走（卸掉正在跑的那局）
            playBtn.fire('click', { target: playBtn });                  // 换回来
            startBtnEl.fire('click', { target: startBtnEl });            // 真的开
            flushIntro();                                               // ★ P99：开场三拍推完
        };

        wKey.keyGuardOn = keepKeyGuard;                        // 保持数据里那个值
        startBoom();
        ok('★（前置）正在跑 + 守卫开着',
            playStage.querySelectorAll('.play-frame').length === 1 &&
            parentPress({ key: 'r', ctrlKey: true }) === 1);

        wKey.keyGuardOn = false;                               // ★ 关掉开关
        startBoom();
        ok('★★ 这一条关着 keyGuardOn：Ctrl+R / F5 / Ctrl+E 一律不拦（浏览器照旧）',
            parentPress({ key: 'r', ctrlKey: true }) === 0 &&
            parentPress({ key: 'F5' }) === 0 &&
            parentPress({ key: 'e', ctrlKey: true }) === 0);
        ok('★★ 右键菜单也一并还回去（整条守卫是同一个开关）', (function () {
            let hit = 0;
            playStage.fire('contextmenu', { type: 'contextmenu', preventDefault() { hit++; } });
            return hit === 0;
        })());

        wKey.keyGuardOn = true;                                // ★ 开回来
        startBoom();
        ok('★★ 开回来再开一局：Ctrl+R 又被拦下（重开才生效 —— 正是我们要的语义）',
            parentPress({ key: 'r', ctrlKey: true }) === 1);

        /* --- ★★ P86：游戏 → 站点：屏幕上给一条回执 ---
           走的还是 P82 那条 postMessage 通道（只认当前 iframe 的 e.source），
           多认了一种消息。这里自己给 iframe 造个 contentWindow 来发消息。 */
        const msgFrame = playStage.querySelectorAll('.play-frame')[0];
        msgFrame.contentWindow = { fake: true };
        const sendMsg = function (data, source) {
            doc.dispatchEvent({
                type: 'message',
                source: source === undefined ? msgFrame.contentWindow : source,
                data: data,
            });
        };
        sendMsg('resolualysis:play-msg:任务完成');
        ok('★★ 字符串协议：前缀 + 冒号 + 文字 → 回执显示出来（前缀没混进正文）',
            msgEl.classList.contains('is-on') && msgEl.textContent === '任务完成',
            msgEl.textContent);
        sendMsg('resolualysis:play-msg:换一段\n带换行的');
        ok('★★ 单行化：换行压成空格（回执是一行字，不是一段文章）',
            msgEl.textContent === '换一段 带换行的', msgEl.textContent);
        sendMsg({ type: 'resolualysis:play-msg', text: '对象协议也行', ms: 0 });
        ok('★ 对象协议 + ms: 0（一直挂着，游戏自己控制何时收）',
            msgEl.textContent === '对象协议也行' && msgEl.classList.contains('is-on'));
        sendMsg('resolualysis:play-msg:' + 'x'.repeat(200));
        ok('★★ 超长截断到 120 字（游戏写错一个长串也不至于糊满屏幕）',
            msgEl.textContent.length === 120, String(msgEl.textContent.length));
        sendMsg('resolualysis:play-msg:别人冒充的', { notTheFrame: true });
        ok('★★ 不是当前 iframe 发来的消息一律不算数（连回执也认 e.source）',
            msgEl.textContent.length === 120, msgEl.textContent.slice(0, 12));
        sendMsg('resolualysis:play-msg:');
        ok('★ 空文字 = 让站点把这条收掉（游戏想自己控制消失时机时用）',
            !msgEl.classList.contains('is-on') && msgEl.textContent === '');
        sendMsg({ type: 'resolualysis:play-exit' });            // 顺手验对象形式的"退出"
        ok('★ 对象形式的"我退出了"也认（msgKind 两种协议通吃）',
            playStage.querySelectorAll('.play-frame').length === 0 && stage.dataset.state === 'game');

        /* --- ★★ P87：iframe 的控制台接到屏幕回执上（**不用 jslib** 的那条路）---
           这条存在的理由：WebGL 构建出问题时唯一有信息量的地方是控制台，
           而作品集访客（你调构建时也一样）通常没开控制台。同源 → 能套一层。 */
        startBoom();
        const cFrame = playStage.querySelectorAll('.play-frame')[0];
        const realLog = function () { };
        const fakeConsole = { log: realLog, warn: realLog, error: realLog };
        const fakeWin = { console: fakeConsole };
        cFrame.contentWindow = fakeWin;
        cFrame.fire('load', { target: cFrame });                // load 那一刻挂钩子
        ok('★★ 同源：iframe 的 console 三个口都被套上了（error / warn / log），且只套一次',
            fakeConsole.error !== realLog && fakeConsole.warn !== realLog &&
            fakeConsole.log !== realLog && fakeWin.__playConsoleHooked === true);
        fakeConsole.log('Unity 自己的日志：别上屏');
        ok('★ 没前缀的 log 一律不管（不然 Unity 的日志会一行一闪）',
            msgEl.textContent === '' && !msgEl.classList.contains('is-on'));
        fakeConsole.log('SITE:任务完成');
        ok('★★ Debug.Log("SITE:…") → 屏幕回执（前缀剥掉）—— 一行 C#、不用 jslib、不动构建',
            msgEl.textContent === '任务完成' && msgEl.classList.contains('is-on'), msgEl.textContent);
        fakeConsole.error('NullReferenceException: localPlayer is null');
        ok('★★ error 一律上屏并带 ERR 标签（WebGL 里最值钱的就是这一条）',
            msgEl.textContent === 'ERR NullReferenceException: localPlayer is null', msgEl.textContent);
        fakeConsole.warn('Thread not supported on this platform');
        ok('★ warn 上屏带 WARN 标签',
            msgEl.textContent === 'WARN Thread not supported on this platform', msgEl.textContent);
        for (let i = 0; i < 30; i++) fakeConsole.error('boom ' + i);
        const capped = msgEl.textContent;
        fakeConsole.error('额度之后的一条');
        ok('★★ 控制台回执有额度（一局上限 MSG_ERR_MAX 条）：用完之后不再上屏、也不刷屏',
            msgEl.textContent === capped && !/额度之后/.test(msgEl.textContent), msgEl.textContent);

        /* --- ★★ P91：游戏详细页 = 一页 README ---
           ★★ 这里**不写死哪一条**：readme 挂在哪个游戏上属于你的数据，随时会变
              （这条测试原来写死 semarlog，你把它换成 refactor 之后就误报了 ✗）。
              改成从 works.js 里找：第一条写了 readme 的 unity、第一条没写的 ✓。
              卡带是按 kind === 'unity' 的顺序生成的，所以下标一一对应 ✓。 */
        const unityWorks = (window.WORKS || []).filter(function (w) { return w.kind === 'unity'; });
        const withIdx = unityWorks.findIndex(function (w) { return !!w.readme; });
        const withoutIdx = unityWorks.findIndex(function (w) { return !w.readme; });
        const withWork = withIdx >= 0 ? unityWorks[withIdx] : null;
        ok('★（前置）至少有一条 unity 写了 readme，而且卡带下标对得上（' +
            (withWork ? withWork.id : '没有') + '）',
            !!withWork && !!readmeBox &&
            btns[withIdx].getAttribute('data-cart') === withWork.id);

        if (withoutIdx >= 0) {
            btns[withoutIdx].fire('click', { target: btns[withoutIdx] });
            ok('★ 没写 readme 的卡带（' + unityWorks[withoutIdx].id + '）：不切版式（还是规格卡 + 开始游戏）',
                !stage.classList.contains('is-readme') && readmeBox.innerHTML === '');
        }

        window.fetch = function () {
            fetchCalls++;
            return syncFetch({ ok: true, text: function () { return '# 标题\n\n正文 **粗**'; } });
        };
        btns[withIdx].fire('click', { target: btns[withIdx] });
        ok('★★ 写了 readme：版式切到 README（is-readme）+ 内容按 Markdown 渲染进去了',
            stage.classList.contains('is-readme') &&
            readmeBox.innerHTML.indexOf('<h1 id="标题">标题</h1>') !== -1 &&
            readmeBox.innerHTML.indexOf('<strong>粗</strong>') !== -1,
            readmeBox.innerHTML.slice(0, 72));

        if (withoutIdx >= 0) {
            btns[withoutIdx].fire('click', { target: btns[withoutIdx] });
            ok('★★ 切回没 readme 的卡带：README 版式收掉 + 内容清空（不留上一页）',
                !stage.classList.contains('is-readme') && readmeBox.innerHTML === '' &&
                readmeBox.childNodes.length === 0);
        }

        btns[withIdx].fire('click', { target: btns[withIdx] });
        ok('★ 第二次选中同一条：走缓存，不再发请求',
            fetchCalls === 1 && stage.classList.contains('is-readme'), String(fetchCalls));

        window.fetch = function () {
            fetchCalls++;
            return syncFetch({ ok: false, status: 404 });      // 取不到
        };
        /* ★ 必须换一个**没被缓存过**的路径 —— 原来那条刚才已经成功过、
           命中缓存就不会再请求了（这正是上面那条缓存断言验的 ✓）。 */
        const keepReadmePath = withWork.readme;
        withWork.readme = 'data/readmes/__missing__.md';
        if (withoutIdx >= 0) btns[withoutIdx].fire('click', { target: btns[withoutIdx] });
        btns[withIdx].fire('click', { target: btns[withIdx] });
        ok('★★ 取不到 → 退回 detail：留一行 ASCII 说明 + detail 的条目（页面不会空）',
            stage.classList.contains('is-readme') &&
            readmeBox.innerHTML.indexOf('md-note') !== -1 &&
            readmeBox.innerHTML.indexOf('README not loaded') !== -1 &&
            readmeBox.innerHTML.indexOf('<li>') !== -1,
            readmeBox.innerHTML.slice(0, 72));
        withWork.readme = keepReadmePath;                       // 还原桩里的数据

        /* --- ★ P91b：README 里的 #锚点点击 → 让面板自己滚（别动整页 hash） --- */
        (function anchorClick() {
            /* ★ 桩里 innerHTML 只是存了个字符串、**不会生成子元素**，而真实浏览器里
               标题是解析出来的 DOM —— 所以这里手工放一个带 id 的元素，模拟"标题在" ✓ */
            const target = doc.createElement('h2');
            target.setAttribute('id', '标题');
            readmeBox.append(target);

            const link = doc.createElement('a');
            link.setAttribute('href', '#标题');
            const hit = { prevented: false };
            readmeBox.fire('click', {
                target: link,
                preventDefault: function () { hit.prevented = true; },
            });
            ok('★★ 点页内锚点：#锚点被拦住（preventDefault），整页 hash 不会被改',
                hit.prevented === true);

            const outside = doc.createElement('a');
            outside.setAttribute('href', 'https://example.com');
            const hit2 = { prevented: false };
            readmeBox.fire('click', {
                target: outside,
                preventDefault: function () { hit2.prevented = true; },
            });
            ok('★ 外链 / 相对链接一律不拦（照旧新窗口打开）', hit2.prevented === false);

            const nowhere = doc.createElement('a');
            nowhere.setAttribute('href', '#没有这个标题');
            const hit3 = { prevented: false };
            readmeBox.fire('click', {
                target: nowhere,
                preventDefault: function () { hit3.prevented = true; },
            });
            ok('★ 找不到目标标题时也不拦（把点击交回浏览器，别把行为吞掉）', hit3.prevented === false);

            target.remove();
        })();

        PS.open(trigger);                                       // 开门 → resetStage → hideReadme
        ok('★★ 关门再开门（复位那一刻）：README 也收掉，下次进来是干净的',
            !stage.classList.contains('is-readme') && readmeBox.innerHTML === '');
        PS.close();

        /* --- ★★ P93：导航栏上那三个"游戏控件"（关闭 / 静音 / 全屏）---
           背景：游乐区展开后导航栏被推到最右边，那几个导航键**还点得动** ✗ ——
                 玩着游戏手一滑就跳走了。所以展开时把导航键藏掉、换成这三个；
                 收起的那一瞬间导航键回来（纯 body.sidebar-open 驱动，CSS 那条在 [2af]）。
           ★ 桩里的 iframe 摸不到音频（真浏览器里跨源也一样摸不到）—— 所以这里
             只能验"抓不到就**说实话**"，验不了真的静音（那要你的 Unity 构建）。
           ★ 全屏这一路可以完整验：桩里给 iframe 装上 requestFullscreen，
             再让 document.fullscreenElement / fullscreenchange 按浏览器的方式变 ✓ */
        (function navControls() {
            ok('★ 没在玩游戏时：静音 / 全屏是 disabled（没有对象可操作），关闭键照常能用',
                ctlMute.disabled === true && ctlFull.disabled === true && !ctlClose.disabled);

            /* 「关闭」＝ 收起游乐区的那条路（和面板里的 ✕ 同一个 close()）——
               ★ 顺手验"同步摘类"：click 刚派发（还在往上冒泡）时类就已经没了，
                 所以导航键是**当场**回来的，不靠定时器、不等 450ms 滑完 ✓ */
            let seenInClick = null;
            const peek = function () { seenInClick = doc.body.classList.contains('sidebar-open'); };
            doc.addEventListener('click', peek);
            PS.open(trigger);
            const openedByUs = PS.isOpen === true && doc.body.classList.contains('sidebar-open');
            ctlClose.fire('click', { target: ctlClose });
            doc.removeEventListener('click', peek);
            ok('★★ 点「关闭」：游乐区收起（aria 复位 + 焦点还给开门那个按钮）',
                openedByUs && PS.isOpen === false && !doc.body.classList.contains('sidebar-open') &&
                aside.getAttribute('aria-hidden') === 'true' && trigger === doc._focus,
                'open=' + PS.isOpen + ' focus=' + (doc._focus && doc._focus.className));
            ok('★★ 「收起的一瞬间」就还回来：click 还没冒泡完，body.sidebar-open 已经摘了',
                seenInClick === false, String(seenInClick));

            /* 开一局：静音 / 全屏这两个才有对象可操作 */
            PS.open(trigger);
            playBtn.fire('click', { target: playBtn });
            startBtnEl.fire('click', { target: startBtnEl });
            flushIntro();                       // ★ P99：开场三拍推完
            const ctlFrame = playStage.querySelectorAll('.play-frame')[0];
            ok('★ （前置）这一局真的在跑（舞台上挂着 iframe）',
                !!ctlFrame && stage.dataset.state === 'play', stage.dataset.state);
            ok('★★ 开跑那一刻：静音 / 全屏就解除 disabled（startGame 末尾同步的）',
                ctlMute.disabled === false && ctlFull.disabled === false);
            ok('★ 两个开关一开始都不是"按下"态',
                ctlMute.getAttribute('aria-pressed') === 'false' &&
                ctlFull.getAttribute('aria-pressed') === 'false');

            /* 静音：抓不到音频时**必须说实话**，不许让按钮假装静音了 ✓ */
            ctlMute.fire('click', { target: ctlMute });
            ok('★★ 点「静音」：开关进按下态（aria-pressed=true）',
                ctlMute.getAttribute('aria-pressed') === 'true');
            ok('★★ 一处在音频都抓不到就说抓不到（不许假装静音成功 —— 这是你一直在意的）',
                /音频/.test(msgEl.textContent), msgEl.textContent);
            ctlMute.fire('click', { target: ctlMute });
            ok('★ 再点一下：解除按下态', ctlMute.getAttribute('aria-pressed') === 'false');
            ctlMute.fire('click', { target: ctlMute });          // 留着按下的，验"不跨局"
            ok('★ （前置）现在静音是按下态', ctlMute.getAttribute('aria-pressed') === 'true');

            /* 全屏：桩里给 iframe 装上 requestFullscreen / exitFullscreen，
               并让 document.fullscreenElement 跟着变（浏览器就是这么做的） */
            let fsReq = 0, fsExit = 0;
            ctlFrame.requestFullscreen = function () {
                fsReq++;
                doc.fullscreenElement = ctlFrame;
                doc.dispatchEvent({ type: 'fullscreenchange' });
                return { catch() { } };
            };
            doc.exitFullscreen = function () {
                fsExit++;
                doc.fullscreenElement = null;
                doc.dispatchEvent({ type: 'fullscreenchange' });
                return { catch() { } };
            };

            /* ★★ P93c：Keyboard Lock 的桩。
               Node 自带的 navigator 是"只读 getter"（而且没有 .keyboard），
               所以用 defineProperty 顶掉它，用完还原 ✓。
               Chrome / Edge 有这 API，Firefox / Safari 没有 —— 两条路都要验。 */
            const kb = { locks: [], unlocks: 0 };
            const kbDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
            Object.defineProperty(globalThis, 'navigator', {
                value: {
                    keyboard: {
                        /* 不带参数 = 锁所有键（那时候 codes 是 undefined，记成 null） */
                        lock(codes) { kb.locks.push(codes === undefined ? null : codes.slice()); return { catch() { } }; },
                        unlock() { kb.unlocks++; },
                    },
                },
                configurable: true, writable: true,
            });

            /* ★★ P93d：给这一帧装一份"假游戏文档"，验"一进全屏就把 canvas 拉满、退出还原"。
               真文档里那件事由 CSS 完成（规则见 [2af]），Unity 会跟着把渲染分辨率调大 ✓ */
            const fillClass = {
                _s: {}, add(c) { this._s[c] = true; }, remove(c) { delete this._s[c]; },
                contains(c) { return !!this._s[c]; },
            };
            const fillStyles = [];
            const gameDoc = {
                documentElement: { classList: fillClass },
                head: { appendChild(n) { fillStyles.push(n); return n; } },
                byId: {},
                getElementById(id) { return this.byId[id] || null; },
                createElement(tag) {
                    const el = { tagName: String(tag).toUpperCase(), id: '', textContent: '' };
                    el.setAttribute = function (k, v) { if (k === 'id') { el.id = v; gameDoc.byId[v] = el; } };
                    return el;
                },
            };
            let innerResizes = 0;
            ctlFrame.contentDocument = gameDoc;
            ctlFrame.contentWindow = {
                Event: function (t) { this.type = t; },
                dispatchEvent() { innerResizes++; },
            };

            ctlFull.fire('click', { target: ctlFull });
            ok('★★ 点「全屏」：喊的是**正在跑的那个 iframe** 的 requestFullscreen（不是整页）',
                fsReq === 1, String(fsReq));
            ok('★★ 进了全屏：开关反映现实（aria-pressed=true）',
                ctlFull.getAttribute('aria-pressed') === 'true');
            /* ★★ P93c：lock() 要在 requestFullscreen **之前**喊（规范 4.1 的建议） */
            ok('★★ P93c：进全屏时也把浏览器保留键要回来了（navigator.keyboard.lock 被喊了一次）',
                kb.locks.length === 1, JSON.stringify(kb.locks));
            const lockArgs = kb.locks[0] || [];
            ok('★★ P93c：锁的正是"页面永远抢不到"的那一串（Ctrl+T/N、Ctrl+1…9、Ctrl+Tab、Alt+←→）',
                ['KeyT', 'KeyN', 'Digit1', 'Digit9', 'Tab', 'ArrowLeft', 'ArrowRight'].every(function (c) {
                    return lockArgs.indexOf(c) !== -1;
                }), JSON.stringify(lockArgs));
            ok('★★ P93c：逃生口一个都没锁（Esc 单击退全屏 / Ctrl+W 关标签 / F11 / F12 / Alt+F4）',
                ['Escape', 'KeyW', 'F11', 'F12', 'F4'].every(function (c) {
                    return lockArgs.indexOf(c) === -1;
                }), JSON.stringify(lockArgs));
            /* ★★ P93d：这才是"真全屏"那一步 —— 游戏页里那张写死 960×540 的 canvas 被拉满 */
            ok('★★ P93d：进全屏那一刻，游戏页里的 canvas 也被拉满（html.site-fs + 一条样式）',
                fillClass.contains('site-fs') && fillStyles.length === 1 &&
                fillStyles[0].id === 'site-fullscreen-fill' &&
                /width: 100% !important/.test(fillStyles[0].textContent),
                fillStyles.length + ' 条 / class=' + fillClass.contains('site-fs'));
            ok('★ P93d：顺手在游戏页里喊了一声 resize（老版本 Unity 靠它重算渲染分辨率）',
                innerResizes >= 1, String(innerResizes));

            /* Esc 退出是全屏 API 自己干的 —— 按钮必须跟得上（否则会永远显示"全屏中"） */
            doc.fullscreenElement = null;
            doc.dispatchEvent({ type: 'fullscreenchange' });
            ok('★★ 浏览器那边自己退了（例如 Esc）：按钮跟着复位，不需要我们再点',
                ctlFull.getAttribute('aria-pressed') === 'false' && fsExit === 0);
            ok('★★ P93c：按 Esc 自己退的这次也把锁解开了（不留"后台还锁着"的状态）',
                kb.unlocks >= 1, String(kb.unlocks));
            ok('★★ P93d：退出全屏 → 摘掉那个类（游戏页回到模板原本的 960×540 居中版式）',
                !fillClass.contains('site-fs'));

            ctlFull.fire('click', { target: ctlFull });          // 再进一次，验"停游戏时退全屏"
            ok('★ （前置）又进去了', fsReq === 2 && ctlFull.getAttribute('aria-pressed') === 'true');
            ok('★ P93c：再进一次 = 再要一次（lock 累计两次）', kb.locks.length === 2, JSON.stringify(kb.locks));
            ok('★ P93d：再进一次**不会**重复插样式（同一个游戏页只留一条）',
                fillStyles.length === 1 && fillClass.contains('site-fs'), String(fillStyles.length));

            /* ★ P93c：没有 Keyboard Lock 的浏览器（Firefox / Safari）—— 退全屏那块要静默跳过 ✓ */
            const unlockBefore = kb.unlocks;
            let noApiThrew = false;
            delete navigator.keyboard;
            try {
                doc.fullscreenElement = null;
                doc.dispatchEvent({ type: 'fullscreenchange' });   // 这里会走"没 API"那条路
            } catch (err) { noApiThrew = true; }
            ok('★ P93c：Firefox / Safari 那种没有 Keyboard Lock 的环境：退全屏照样不炸',
                noApiThrew === false && kb.unlocks === unlockBefore, String(kb.unlocks));
            ctlFull.fire('click', { target: ctlFull });          // 没 API 也要能正常进全屏
            ok('★ P93c：没 API 时全屏本身照旧（只是浏览器保留键拿不回来）',
                fsReq === 3 && ctlFull.getAttribute('aria-pressed') === 'true', String(fsReq));

            otherBtn.fire('click', { target: otherBtn });        // 换一条 → 这一局结束
            ok('★★ 这一局一停：全屏自动退出（别把浏览器全屏留给后面）',
                fsExit === 1 && doc.fullscreenElement === null, String(fsExit));
            ok('★★ 两个开关重新 disabled、按下态清掉 —— 静音**不跨局**（新一局默认有声）',
                ctlMute.disabled === true && ctlFull.disabled === true &&
                ctlMute.getAttribute('aria-pressed') === 'false' &&
                ctlFull.getAttribute('aria-pressed') === 'false');

            /* 还原：Node 自己的 navigator（后面几节还可能用它） */
            if (kbDesc) Object.defineProperty(globalThis, 'navigator', kbDesc);
            else delete globalThis.navigator;
            delete doc.fullscreenElement;
            delete doc.exitFullscreen;
        })();

        delete window.fetch;                                    // 桩撤掉，别影响后面的节

        wKey.keyGuardOn = keepKeyGuard;                        // 还原桩里的数据
        PS.close();

        /* ============================================================
           ★★ P99/P100：开场五拍（点开始 / 拖到舞台上 → md 闪没 → 停 0.4s → 黑幕 →
           载入 → 渐出）；以及"正在跑游戏时拖入新卡带 = 直接渐入黑幕"那条路 ✓
           ★ 手动泵定时器 —— 这一节一直不用 await ✓
           ============================================================ */
        PS.open(trigger);
        playBtn.fire('click', { target: playBtn });
        /* ★★ P101：下面这几段验的是"这条**没有**「游玩注意」"的时间线 ——
           先在数据里把**所有** unity 的注意关掉（你给几张开了 ✓），测完再还原 ✓ */
        const keepNotices = unity.map(function (w) {
            return { w: w, on: w.noticeOn, text: w.notice };
        });
        unity.forEach(function (w) { w.noticeOn = false; w.notice = ''; });
        playBtn.fire('click', { target: playBtn });   // 重新选中 → 内容按新的数据铺一次 ✓
        const curtain = aside.querySelector('[data-play="curtain"]');
        ok('★★ P99：游戏区里有一块开场黑幕（.play-curtain），而且是`.play-stage`的**兄弟**'
            + '（住在里面会被 stopGame 的 replaceChildren() 拔掉 ✗）',
            !!curtain && curtain.className === 'play-curtain' &&
            playStage.childNodes.indexOf(curtain) === -1 &&
            stage.childNodes.indexOf(curtain) === stage.childNodes.indexOf(playStage) + 1,
            curtain ? 'stage 里的第 ' + stage.childNodes.indexOf(curtain) + ' 个' : '没有幕布');

        startBtnEl.fire('click', { target: startBtnEl });
        ok('★★ P99：① 点开始的第一拍 = md 内容闪烁消失（.play-body.is-starting），'
            + '**此时还没有 iframe**（游戏要等幕布全黑才载入）',
            stage.classList.contains('is-starting') &&
            playStage.querySelectorAll('.play-frame').length === 0 &&
            !curtain.classList.contains('is-in'));
        ok('★ P99：① 排的是 250ms（md 闪没那一下）', pending(250).length >= 1,
            String(pending(250).length));
        firePending(250);
        ok('★★ P100：①′ 闪完之后先**停一下**（0.4s）—— 幕布这时还**没**起来',
            pending(400).length >= 1 && !curtain.classList.contains('is-in') &&
            playStage.querySelectorAll('.play-frame').length === 0,
            '0.4s 的定时器=' + pending(400).length);
        firePending(400);
        ok('★★ P99：② 停 0.4s 之后幕布才开始渐入（is-in）—— 但**仍然没有 iframe**',
            curtain.classList.contains('is-in') && !curtain.classList.contains('is-out') &&
            playStage.querySelectorAll('.play-frame').length === 0);
        ok('★ P99：② 排的是 250ms（幕布渐入那一下）', pending(250).length >= 1,
            String(pending(250).length));
        firePending(250);
        ok('★★ P99：③ 幕布**完全不透明之后**才开始载入（这一刻 iframe 才出现，'
            + '载入层也一起挂上）',
            playStage.querySelectorAll('.play-frame').length === 1 &&
            playStage.querySelectorAll('.play-loading').length === 1 &&
            curtain.classList.contains('is-in') && !curtain.classList.contains('is-out'));
        ok('★★ P99：③ 载入之后是 0.45s 的停顿（你说的 0.45s），还没开始渐出',
            pending(450).length === 1 && !curtain.classList.contains('is-out'),
            String(pending(450).length));
        firePending(450);
        ok('★★ P99：④ 0.45s 到 → 幕布渐出（is-out）', curtain.classList.contains('is-out'));
        ok('★ P99：④ 渐出是 400ms（排上的那条）', pending(400).length === 1,
            String(pending(400).length));
        firePending(400);
        ok('★★ P99：⑤ 收尾：三个类都摘掉（md 内容回到可见、幕布回到出厂状态），'
            + '游戏照旧在跑',
            !stage.classList.contains('is-starting') &&
            !curtain.classList.contains('is-in') && !curtain.classList.contains('is-out') &&
            playStage.querySelectorAll('.play-frame').length === 1);

        /* 半路停掉（换一条卡带 / 关面板）→ 过场立刻收干净，不留半个幕布 ✗ */
        playBtn.fire('click', { target: playBtn });
        startBtnEl.fire('click', { target: startBtnEl });
        firePending(250);                                      // md 闪没刚演完
        firePending(400);                                      // 幕布刚起来
        otherBtn.fire('click', { target: otherBtn });          // 换一条 = stopGame
        ok('★★ P99：过场演到一半被打断（换卡带 / 关面板）→ 幕布与 md 状态立刻收干净',
            !stage.classList.contains('is-starting') &&
            !curtain.classList.contains('is-in') && !curtain.classList.contains('is-out') &&
            playStage.querySelectorAll('.play-frame').length === 0);

        /* ============================================================
           ★★ P100：**正在跑游戏时拖入新卡带** → 直接渐入黑幕（不闪 md、不停 0.4s），
           全黑那一刻才关上一局 + 载入下一局，再 0.45s 渐出 ✓
           ============================================================ */
        playBtn.fire('click', { target: playBtn });
        startBtnEl.fire('click', { target: startBtnEl });
        flushIntro();
        const oldSrc = String(playStage.querySelectorAll('.play-frame')[0].src);
        ok('★（前置）先跑起来一局（' + oldSrc.replace(/^.*\//, '') + '）',
            playStage.querySelectorAll('.play-frame').length === 1 && !!oldSrc);

        /* 拖另一张到舞台上（= select(w.id, true) + startGame） */
        secondPlayBtn.fire('pointerdown', { target: secondPlayBtn, button: 0, pointerId: 7, clientX: 10, clientY: 10 });
        secondPlayBtn.fire('pointermove', { target: secondPlayBtn, pointerId: 7, clientX: 20, clientY: 60 });
        secondPlayBtn.fire('pointerup', { target: secondPlayBtn, pointerId: 7, clientX: 20, clientY: 60 });
        ok('★★ P100：换卡带时**跳过** md 那一拍（屏幕上正跑着游戏，没有 md 可闪）+ 幕布立刻渐入',
            !stage.classList.contains('is-starting') && curtain.classList.contains('is-in') &&
            !curtain.classList.contains('is-out'));
        ok('★★ P100：幕布渐入的这 250ms 里，**上一局还在跑**（不能先空场）',
            playStage.querySelectorAll('.play-frame').length === 1 &&
            String(playStage.querySelectorAll('.play-frame')[0].src) === oldSrc);
        ok('★ P100：换卡带走的是"幕布 250ms"那一拍（没有 0.4s 停顿在排队）',
            pending(250).length === 1 && pending(400).length === 0,
            '250=' + pending(250).length + ' / 400=' + pending(400).length);

        firePending(250);
        const newSrc = String(playStage.querySelectorAll('.play-frame')[0].src);
        ok('★★ P100：全黑那一刻才换：上一局卸掉、新一局挂上（同一时刻只有一张 iframe）',
            playStage.querySelectorAll('.play-frame').length === 1 && newSrc !== oldSrc &&
            playStage.querySelectorAll('.play-loading').length === 1,
            oldSrc.replace(/^.*\//, '') + ' → ' + newSrc.replace(/^.*\//, ''));
        firePending(450);
        ok('★ P100：然后同样停 0.45s 才渐出', curtain.classList.contains('is-out'));
        firePending(400);
        ok('★★ P100：收尾和普通开场一模一样（类摘掉、游戏照旧在跑）',
            !stage.classList.contains('is-starting') &&
            !curtain.classList.contains('is-in') && !curtain.classList.contains('is-out') &&
            playStage.querySelectorAll('.play-frame').length === 1);
        PS.close();

        /* ============================================================
           ★★ P100b：拖到舞台上时 **md 页保持上一个内容**（不提前换）+ 拖完那一下
           浏览器**还会**派发一次 click（指针被 capture 在卡带上）—— 必须被吃掉，
           否则它会把刚开始的过场按掉（stopGame + cancelIntro）→ 屏幕上只剩新卡带的
           md 页、游戏根本没起来 ✗✗（你报的第二件事就是它）
           ============================================================ */
        const fetched = [];
        window.fetch = function (url) {
            fetched.push(String(url));
            return syncFetch({ ok: true, text: function () { return '# MD:' + url; } });
        };
        const aIdx = unity.findIndex(function (w) { return !!w.readme && !!w.src; });
        const bIdx = unity.findIndex(function (w, i) { return i !== aIdx && !!w.src; });
        const aBtn = aIdx >= 0 ? btns[aIdx] : null, bBtn = bIdx >= 0 ? btns[bIdx] : null;
        ok('★（前置）两张能玩的卡带，A 带 readme（A=' + (aBtn && unity[aIdx].id) +
            ' / B=' + (bBtn && unity[bIdx].id) + '）', !!aBtn && !!bBtn);

        PS.open(trigger);
        aBtn.fire('click', { target: aBtn });                  // 选中 A（铺上 A 的 md）
        const mdA = readmeBox.innerHTML;
        startBtnEl.fire('click', { target: startBtnEl });       // A 跑起来
        flushIntro();
        const aSrc = String(playStage.querySelectorAll('.play-frame')[0].src);
        ok('★（前置）A 的 md 已铺上、A 的游戏也在跑',
            mdA.length > 0 && /MD:/.test(mdA) &&
            playStage.querySelectorAll('.play-frame').length === 1 && aSrc === unity[aIdx].src,
            mdA.slice(0, 48));

        /* 拖着 B 进舞台（此时 A 正在跑） */
        bBtn.fire('pointerdown', { target: bBtn, button: 0, pointerId: 21, clientX: 10, clientY: 10 });
        bBtn.fire('pointermove', { target: bBtn, pointerId: 21, clientX: 20, clientY: 60 });
        bBtn.fire('pointerup', { target: bBtn, pointerId: 21, clientX: 20, clientY: 60 });
        ok('★★ P100b：换卡带时 md 页**一个字都没换**（还留着 A 的内容）+ 幕布立刻起来',
            readmeBox.innerHTML === mdA && curtain.classList.contains('is-in') &&
            !stage.classList.contains('is-starting'));
        ok('★ P100b：这会儿 A 还在跑（旧画面没被提前拔掉）',
            playStage.querySelectorAll('.play-frame').length === 1 &&
            String(playStage.querySelectorAll('.play-frame')[0].src) === aSrc);

        /* ★★ 浏览器紧接着派发的那一下 click —— 修复前它会把过场按掉 */
        bBtn.fire('click', { target: bBtn });
        ok('★★ P100b：那一下 click 被吃掉 → 过场还活着（250ms 那一拍仍在），'
            + 'A 也没被提前 stopGame',
            pending(250).length === 1 &&
            playStage.querySelectorAll('.play-frame').length === 1 &&
            String(playStage.querySelectorAll('.play-frame')[0].src) === aSrc &&
            readmeBox.innerHTML === mdA,
            '250=' + pending(250).length);

        firePending(250);
        ok('★★ P100b：全黑那一刻才换：新游戏 = B 的 src（同一时刻只有一张 iframe）',
            playStage.querySelectorAll('.play-frame').length === 1 &&
            String(playStage.querySelectorAll('.play-frame')[0].src) === unity[bIdx].src,
            String(playStage.querySelectorAll('.play-frame')[0].src));
        ok('★★ P100b：内容也是那时才换的 —— md 页变成 B 的（幕后换 ✓）',
            readmeBox.innerHTML !== mdA && readmeBox.innerHTML.indexOf('MD:') !== -1,
            readmeBox.innerHTML.slice(0, 48));
        firePending(450);
        firePending(400);
        ok('★ P100b：收尾同普通开场（类摘掉、游戏照旧在跑）',
            !stage.classList.contains('is-starting') &&
            !curtain.classList.contains('is-in') && !curtain.classList.contains('is-out') &&
            playStage.querySelectorAll('.play-frame').length === 1);

        /* ★★ P100b 另一半：**没在跑游戏**时拖进来（你报的第一件事的常见场景）——
           md 页同样要保持上一个内容，直到黑幕全黑才换 ✓
           （这条专治"startGame 里那句 stopGame 顺手把待铺内容铺了" ✗） */
        PS.close();
        PS.open(trigger);
        aBtn.fire('click', { target: aBtn });                   // 重新铺上 A 的 md
        const mdA2 = readmeBox.innerHTML;
        ok('★（前置）A 的 md 又铺上了', mdA2.length > 0 && /MD:/.test(mdA2), mdA2.slice(0, 40));
        bBtn.fire('pointerdown', { target: bBtn, button: 0, pointerId: 22, clientX: 10, clientY: 10 });
        bBtn.fire('pointermove', { target: bBtn, pointerId: 22, clientX: 20, clientY: 60 });
        bBtn.fire('pointerup', { target: bBtn, pointerId: 22, clientX: 20, clientY: 60 });
        ok('★★ P100b：没在跑游戏时拖入也一样 —— 闪的是**上一个卡带**的 md（没提前换）',
            readmeBox.innerHTML === mdA2 && stage.classList.contains('is-starting') &&
            !curtain.classList.contains('is-in'),
            readmeBox.innerHTML.slice(0, 40));
        bBtn.fire('click', { target: bBtn });                   // 浏览器那一下
        flushIntro();
        ok('★ P100b：过场走完 → 内容才换成 B 的 + 游戏起来',
            readmeBox.innerHTML !== mdA2 && /MD:/.test(readmeBox.innerHTML) &&
            playStage.querySelectorAll('.play-frame').length === 1 &&
            String(playStage.querySelectorAll('.play-frame')[0].src) === unity[bIdx].src);
        delete window.fetch;
        PS.close();

        /* ============================================================
           ★★ P101：「游玩注意」= 黑幕上那行字
           时序：黑幕**完全不透明之后**闪出来 → 停 3s → 闪掉 →
                 **然后才**接黑幕剩下的动画（停 0.45s → 渐出 → 收尾）✓
           ============================================================ */
        keepNotices.forEach(function (k) { k.w.noticeOn = k.on; k.w.notice = k.text; });
        play.noticeOn = true;
        play.notice = ['第一段注意事项', '第二段注意事项'];
        PS.open(trigger);
        playBtn.fire('click', { target: playBtn });            // 内容先备好（还不显示 ✓）
        ok('★（前置）内容备好了（两个 li），而且**还没**显示',
            noticeUl.childNodes.length === 2 &&
            !noticeBox.classList.contains('is-on'), noticeBox.className);

        startBtnEl.fire('click', { target: startBtnEl });
        firePending(250);                                      // md 闪没
        firePending(400);                                      // 停 0.4s
        firePending(250);                                      // 幕布渐入（现在全黑了）
        ok('★★ P101：幕布全黑 —— 游戏在幕后开始载入，同时那行字**闪出来**（is-on，还没 is-out）',
            playStage.querySelectorAll('.play-frame').length === 1 &&
            noticeBox.classList.contains('is-on') && !noticeBox.classList.contains('is-out') &&
            noticeUl.childNodes.length === 2,
            noticeBox.className);
        ok('★★ P101：接着排的是"停 3s"（你说的 3s）',
            pending(3000).length === 1, '3000=' + pending(3000).length);
        ok('★ P101：这 3s 里幕布还**没有**开始渐出（剩下的动画等它闪完 ✓）',
            !curtain.classList.contains('is-out'));

        firePending(3000);                                     // 3s 到 → 开始闪掉
        ok('★★ P101：3s 到 → 那行字闪掉（is-out），幕布**仍然**没渐出',
            noticeBox.classList.contains('is-out') && !curtain.classList.contains('is-out'));
        ok('★★ P101：闪掉的过程是 400ms（和 CSS 的 noticeOut 对齐），排上了',
            pending(400).length === 1, String(pending(400).length));
        firePending(400);                                      // 闪完了
        ok('★★ P101：★ 这时才 = "黑幕完全不透明那一刻" → 接上剩下的动画（停 0.45s 排上了）',
            pending(450).length === 1 && !curtain.classList.contains('is-out'),
            String(pending(450).length));
        firePending(450);
        ok('★ P101：0.45s 到 → 幕布渐出', curtain.classList.contains('is-out'));
        firePending(400);
        ok('★★ P101：收尾 —— 幕布三个类 + 那行字的两个类都摘掉，游戏照旧在跑',
            !stage.classList.contains('is-starting') && !curtain.classList.contains('is-in') &&
            !curtain.classList.contains('is-out') &&
            !noticeBox.classList.contains('is-on') && !noticeBox.classList.contains('is-out') &&
            playStage.querySelectorAll('.play-frame').length === 1,
            noticeBox.className);
        PS.close();

        /* 没开注意的条目：全黑之后**不**闪那行字，直接走剩下的动画 ✓ */
        play.noticeOn = false;
        play.notice = '';
        PS.open(trigger);
        playBtn.fire('click', { target: playBtn });
        startBtnEl.fire('click', { target: startBtnEl });
        firePending(250);
        firePending(400);
        firePending(250);
        ok('★★ P101：这条没有注意 → 全黑之后不闪那行字，直接排"停 0.45s" ✓',
            playStage.querySelectorAll('.play-frame').length === 1 &&
            !noticeBox.classList.contains('is-on') && pending(3000).length === 0 &&
            pending(450).length === 1,
            '3000=' + pending(3000).length + ' / 450=' + pending(450).length);
        flushIntro();
        ok('★ P101：一路收尾干净', !curtain.classList.contains('is-in') &&
            !noticeBox.classList.contains('is-on') &&
            playStage.querySelectorAll('.play-frame').length === 1);
        PS.close();
        play.noticeOn = keepOn; play.notice = keepText;         // 还原数据（和前面的 P84 段一致）

        /* ============================================================
           ★★ P103：选中框 —— 跟着"当前选中的那张卡带"走的一个方框
           没选中 → 隐藏；选中 → 在那张卡带位置**闪烁出现**；
           已选中时点别的 / 拖别的进舞台 → **平移**过去（CSS 的 ease-in-out = 先慢后快再慢 ✓）
           ★ 放在这一节最后：它会额外开关面板几次，前面那些"开关次数"的断言不能被它打乱 ✓
           ============================================================ */
        (function cartFrame() {
            const frameEl = aside.querySelector('[data-play="cart-frame"]');
            const at = function (b) {
                return 'translate(' + (b.offsetLeft - 1) + 'px, ' + (b.offsetTop - 1) + 'px)';
            };
            ok('★（前置）桩里那个方框在，而且每张卡带都有假 offset（不然位置没得验）',
                !!frameEl && btns.every(function (b) { return b.offsetTop > 0; }));

            PS.open(trigger);                               // 开门 → 复位 → 没选中 ✓
            ok('★★ P103：没选中任何卡带时，方框整块隐藏（连 is-on 都没有）',
                !frameEl.classList.contains('is-on'));

            playBtn.fire('click', { target: playBtn });      // 选中第一张能玩的
            ok('★★ P103：一选中就**在那张卡带的位置闪烁出现**（is-on），而且比外轮廓大 1px'
                + '（位置 -1、宽高 +2）',
                frameEl.classList.contains('is-on') &&
                frameEl.style.transform === at(playBtn) &&
                frameEl.style.width === (playBtn.offsetWidth + 2) + 'px' &&
                frameEl.style.height === (playBtn.offsetHeight + 2) + 'px',
                frameEl.style.transform + ' / ' + frameEl.style.width + '×' + frameEl.style.height);
            ok('★ P103：第一次出现**不演平移**（is-placing 只在摆位那一瞬间挂上，之后已摘掉）',
                !frameEl.classList.contains('is-placing'));

            secondPlayBtn.fire('click', { target: secondPlayBtn });   // 已选中时点另一张
            ok('★★ P103：已选中时点别的卡带 → 方框**平移**过去（transform 换成新卡带的位置，'
                + '而且不重新闪）',
                frameEl.classList.contains('is-on') &&
                frameEl.style.transform === at(secondPlayBtn) &&
                at(secondPlayBtn) !== at(playBtn),
                frameEl.style.transform);

            /* "开始运行别的卡带的游戏"那条路（拖到舞台上）也要把框带过去 ✓ */
            playBtn.fire('pointerdown', { target: playBtn, button: 0, pointerId: 31, clientX: 10, clientY: 10 });
            playBtn.fire('pointermove', { target: playBtn, pointerId: 31, clientX: 20, clientY: 60 });
            playBtn.fire('pointerup', { target: playBtn, pointerId: 31, clientX: 20, clientY: 60 });
            ok('★★ P103：拖到舞台上开始另一条 → 方框也跟着移到那张卡带上 ✓',
                frameEl.style.transform === at(playBtn) && frameEl.classList.contains('is-on'));
            flushIntro();

            PS.close();
            PS.open(trigger);                               // 复位 → 选中置空 → 框藏起来 ✓
            ok('★★ P103：开门复位（选中置空）→ 方框又藏起来了；再选中会重新闪一次',
                !frameEl.classList.contains('is-on'));
            /* ★ 这里用 secondPlayBtn：playBtn 刚被拖过（它那一下 click 会被吞掉 ✓） */
            secondPlayBtn.fire('click', { target: secondPlayBtn });
            ok('★ P103：再选中 → 又闪烁出现（is-on 重新挂上 ✓）',
                frameEl.classList.contains('is-on') && frameEl.style.transform === at(secondPlayBtn));
            /* ★ 收个尾：把 playBtn 上那枚"拖完要吞一下 click"的标志位清掉
               （每次 pointerdown 都会清 ✓）—— 不然后面的测试点它会被吞 ✗ */
            playBtn.fire('pointerdown', { target: playBtn, button: 0, pointerId: 32, clientX: 10, clientY: 10 });
            playBtn.fire('pointerup', { target: playBtn, pointerId: 32, clientX: 10, clientY: 10 });
            PS.close();
        })();

        /* ============================================================
           ★★ P102：卡带表面那层蒙版 ——「正在运行…」→ 点一下「停止运行？」→
           再点一下：黑幕 → 关掉游戏 → **直接**渐出 → 露出这条的内容；蒙版闪烁消失 ✓
           ============================================================ */
        const veilTextOf = function (b) {
            const v = b.querySelectorAll('.play-cart-veil-text')[0];
            return v ? String(v.textContent) : '';
        };
        const armedCount = function () {
            return btns.filter(function (b) { return b.classList.contains('is-armed'); }).length;
        };

        PS.open(trigger);
        playBtn.fire('click', { target: playBtn });
        startBtnEl.fire('click', { target: startBtnEl });
        flushIntro();
        ok('★★ P102：这一局跑起来之后，那张卡带表面盖上「正在运行…」（is-running + 半透明黑）',
            playBtn.classList.contains('is-running') && !playBtn.classList.contains('is-armed') &&
            veilTextOf(playBtn) === '正在运行…' &&
            playStage.querySelectorAll('.play-frame').length === 1,
            playBtn.className + ' / ' + veilTextOf(playBtn));
        ok('★ P102：别的卡带表面没有蒙版', btns.every(function (b) {
            return b === playBtn || (!b.classList.contains('is-running') &&
                !b.classList.contains('is-armed'));
        }));

        /* 第一下：红蒙版 + 「停止运行？」—— **还没停** ✓ */
        playBtn.fire('click', { target: playBtn });
        ok('★★ P102：点第一下 → 换成「停止运行？」（is-armed），**游戏还在跑**（没被直接关掉）',
            playBtn.classList.contains('is-armed') && !playBtn.classList.contains('is-running') &&
            veilTextOf(playBtn) === '停止运行？' &&
            playStage.querySelectorAll('.play-frame').length === 1,
            playBtn.className + ' / ' + veilTextOf(playBtn));
        ok('★ P102：这一下也**没有**开黑幕（只是确认 ✓）',
            !curtain.classList.contains('is-in') && !stage.classList.contains('is-starting'));

        /* 再点一下：黑幕 → 全黑才关游戏 → **直接**渐出 ✓ */
        playBtn.fire('click', { target: playBtn });
        ok('★★ P102：第二下 → 黑幕渐入（游戏此刻还在跑，全黑之后才关 ✓）',
            curtain.classList.contains('is-in') && !curtain.classList.contains('is-out') &&
            playStage.querySelectorAll('.play-frame').length === 1);
        ok('★ P102：这一拍排的是幕布渐入的 250ms', pending(250).length === 1,
            String(pending(250).length));
        firePending(250);
        ok('★★ P102：全黑那一刻：游戏关掉了（iframe 拔掉、退回这条游戏的详情页）',
            playStage.querySelectorAll('.play-frame').length === 0 &&
            stage.dataset.state === 'game');
        ok('★★ P102：而且**直接**渐出黑幕 —— 没有开场那 0.45s 停顿（队列里没有 450）',
            curtain.classList.contains('is-out') && pending(450).length === 0,
            '450=' + pending(450).length);
        ok('★★ P102：卡带表面那层蒙版开始**闪烁消失**（is-veil-out，红/黑/字一起）',
            playBtn.classList.contains('is-veil-out') &&
            (playBtn.classList.contains('is-armed') || playBtn.classList.contains('is-running')),
            playBtn.className);
        firePending(400);                        // 幕布渐出那条
        firePending(400);                        // 蒙版闪烁消失那条
        ok('★★ P102：收尾干净 —— 幕布三个类 + 卡带蒙版三个类全没了，游戏确实停了',
            !curtain.classList.contains('is-in') && !curtain.classList.contains('is-out') &&
            !playBtn.classList.contains('is-running') && !playBtn.classList.contains('is-armed') &&
            !playBtn.classList.contains('is-veil-out') &&
            playStage.querySelectorAll('.play-frame').length === 0,
            playBtn.className);

        /* 确认之后又去点别的卡带 → 那一下作废 ✓ */
        playBtn.fire('click', { target: playBtn });
        startBtnEl.fire('click', { target: startBtnEl });
        flushIntro();
        playBtn.fire('click', { target: playBtn });          // 第一下 → is-armed
        ok('★（前置）已经进入"停止运行？"确认态', armedCount() === 1);
        otherBtn.fire('click', { target: otherBtn });        // 点别的卡带（会停掉这一局）
        ok('★★ P102：点了别的卡带 → 那个"确认"作废：蒙版开始闪掉、旧的一局也停了',
            playBtn.classList.contains('is-veil-out') &&
            playStage.querySelectorAll('.play-frame').length === 0,
            playBtn.className);
        firePending(400);                        // 蒙版闪完 → 三个类收干净 ✓
        ok('★★ P102：闪完之后一张都不剩（没有 is-armed / is-running / is-veil-out）',
            btns.every(function (b) {
                return !b.classList.contains('is-armed') && !b.classList.contains('is-running') &&
                    !b.classList.contains('is-veil-out');
            }), 'armed=' + armedCount());
        PS.close();

        /* ============================================================
           ★★ P104：**空卡带**（没写 src 的那种，比如 md样式）拖进"正在跑游戏"的游戏区 →
           和正常卡带一模一样：黑幕渐入 → 全黑才关掉旧的一局 → 渐出黑幕；
           只是把"加载新游戏"换成"显示这张卡带的 md 页" ✓
           ============================================================ */
        const emptyIdx = unity.findIndex(function (w) { return !w.src; });
        const emptyBtn = emptyIdx >= 0 ? btns[emptyIdx] : null;
        ok('★（前置）数据里有一条"空卡带"（没写 src）：' +
            (emptyBtn ? unity[emptyIdx].id : '（没有）'), !!emptyBtn);
        if (emptyBtn) {
            window.fetch = function (url) {
                return syncFetch({ ok: true, text: function () { return '# 空卡带的 md:' + url; } });
            };
            PS.open(trigger);
            playBtn.fire('click', { target: playBtn });          // 先跑起一局
            startBtnEl.fire('click', { target: startBtnEl });
            flushIntro();
            ok('★（前置）有一局在跑',
                playStage.querySelectorAll('.play-frame').length === 1);

            emptyBtn.fire('pointerdown', { target: emptyBtn, button: 0, pointerId: 41, clientX: 10, clientY: 10 });
            emptyBtn.fire('pointermove', { target: emptyBtn, pointerId: 41, clientX: 20, clientY: 60 });
            emptyBtn.fire('pointerup', { target: emptyBtn, pointerId: 41, clientX: 20, clientY: 60 });
            ok('★★ P104：空卡带拖进来也一样**立刻起幕布**（不闪 md、不停 0.4s），旧的一局还在跑',
                curtain.classList.contains('is-in') && !curtain.classList.contains('is-out') &&
                playStage.querySelectorAll('.play-frame').length === 1 &&
                !stage.classList.contains('is-starting'),
                curtain.className);
            ok('★ P104：排的是幕布渐入的 250ms（队列里没有 0.4s 那个停顿 ✓）',
                pending(250).length === 1 && pending(400).length === 0,
                '250=' + pending(250).length + ' / 400=' + pending(400).length);
            firePending(250);
            ok('★★ P104：全黑那一刻：**旧的一局关掉了**（iframe 拔掉、退回详情页），'
                + '而且**没有**挂新游戏（空卡带没有 src ✓）',
                playStage.querySelectorAll('.play-frame').length === 0 &&
                stage.dataset.state === 'game', stage.dataset.state);
            ok('★★ P104："加载新游戏"换成了"显示这张卡带的 md" —— 版式切到 README、内容是它那页 ✓'
                + '（★ 这页 md 在更早的 P91 测试里已经被取过一次，P91 有缓存 → 内容不会是刚才那个桩，'
                + '所以这里只断言"切过去了、而且非空" ✓）',
                stage.classList.contains('is-readme') &&
                readmeBox.innerHTML.length > 0,
                readmeBox.innerHTML.slice(0, 48));
            firePending(450);
            ok('★ P104：然后照常走"剩下的动画"：0.45s 到 → 幕布渐出 ✓',
                curtain.classList.contains('is-out'));
            firePending(400);
            ok('★★ P104：收尾干净（幕布类摘掉、舞台上没有 iframe、内容留在 md 页）',
                !curtain.classList.contains('is-in') && !curtain.classList.contains('is-out') &&
                playStage.querySelectorAll('.play-frame').length === 0 &&
                stage.classList.contains('is-readme'));

            /* 没在跑游戏时：不演黑幕，直接把 md 铺出来 ✓ */
            PS.close();
            PS.open(trigger);
            emptyBtn.fire('pointerdown', { target: emptyBtn, button: 0, pointerId: 42, clientX: 10, clientY: 10 });
            emptyBtn.fire('pointermove', { target: emptyBtn, pointerId: 42, clientX: 20, clientY: 60 });
            emptyBtn.fire('pointerup', { target: emptyBtn, pointerId: 42, clientX: 20, clientY: 60 });
            ok('★★ P104：没在跑游戏时拖空卡带 → **不演黑幕**，直接把它的 md 铺出来 ✓',
                !curtain.classList.contains('is-in') && !stage.classList.contains('is-starting') &&
                stage.classList.contains('is-readme') && readmeBox.innerHTML.length > 0);
            PS.close();
            delete window.fetch;
        }

        global.setTimeout = toKeep;                            // ★ 快照还原（后面还有异步小节）
        global.clearTimeout = ctoKeep;
    })();

    /* ============================================================
       [6] Markdown → HTML：真的跑一遍（P91）
       ------------------------------------------------------------
       js/markdown.js 是**纯函数**（不碰 DOM、不发请求），所以这一节不需要任何
       桩：直接喂字符串、断言输出 ✓。也正是"自己写解析器"的好处 —— 每条规则
       都能钉住，而不是"相信某个库"。
       ============================================================ */
    section('[6] Markdown → HTML（P91）');
    (function markdown() {
        eval(read('js/markdown.js'));
        const M = window.Markdown;
        const h = (s) => M.toHtml(s);

        ok('Markdown 导出 toHtml / slug / escapeHtml / safeUrl',
            !!M && typeof M.toHtml === 'function' && typeof M.slug === 'function' &&
            typeof M.escapeHtml === 'function' && typeof M.safeUrl === 'function');

        /* ---------- 标题 + 锚点 ---------- */
        ok('★ ATX 标题 → h1~h6 + GitHub 风格锚点 id（中文保留、空格转 -）',
            h('# 玩法说明') === '<h1 id="玩法说明">玩法说明</h1>' &&
            h('### A B') === '<h3 id="a-b">A B</h3>');
        ok('★ `#hashtag` 不是标题（ATX 要求 # 后面有空格）',
            h('#hashtag') === '<p>#hashtag</p>');
        ok('★★ 同名标题的 id 自动去重（-1 / -2），锚点不会互相打架',
            /id="重复"/.test(h('## 重复')) &&
            /id="重复-1"/.test(h('## 重复\n\n## 重复')) &&
            /id="重复-2"/.test(h('## 重复\n\n## 重复\n\n## 重复')));
        ok('★★ 预扫也跳过围栏代码块 —— 否则"代码块里的假标题"会让后面每个 id 错位一格',
            /id="真"/.test(h('```\n# 假\n```\n\n## 真')) &&
            !/id="假"/.test(h('```\n# 假\n```\n\n## 真')));
        ok('★ slug：去标点、去强调标记、小写（和 GitHub 一致）',
            M.slug('玩法与 **操作** 说明!') === '玩法与-操作-说明' && M.slug('Hello, World') === 'hello-world');

        /* ---------- 安全（最要紧的一组）---------- */
        ok('★★ 内联 HTML **不会**被执行：整段先转义（<script> 只会原样显示）',
            h('<script>alert(1)</script>') === '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
        ok('★★ `javascript:` / `data:` 链接整个**原样保留**（不生成 a 标签，也不丢括号）',
            h('[x](javascript:alert(1))') === '<p>[x](javascript:alert(1))</p>' &&
            h('![x](data:text/html,1)') === '<p>![x](data:text/html,1)</p>');
        ok('★★ 正常链接：https 自动开新窗 + rel=noopener；相对路径 / #锚点不加 target',
            /<a href="https:\/\/a\.com" target="_blank" rel="noopener noreferrer">链接<\/a>/.test(h('[链接](https://a.com)')) &&
            /<a href="assets\/a\.png">图<\/a>/.test(h('[图](assets/a.png)')) &&
            /<a href="#玩法">跳<\/a>/.test(h('[跳](#玩法)')) &&
            M.safeUrl('MAILTO:a@b.c') === 'MAILTO:a@b.c');
        ok('★ 图片 → img + alt + loading=lazy',
            h('![图](assets/x.png)') === '<p><img src="assets/x.png" alt="图" loading="lazy"></p>');

        /* ---------- 行内 ---------- */
        ok('★★ 行内代码优先：里面写成 *星号* 也不会变成 <em>',
            h('`a*b*c`') === '<p><code>a*b*c</code></p>');
        ok('★ 粗体 / 斜体 / 删除线',
            h('**粗**') === '<p><strong>粗</strong></p>' &&
            h('*斜*') === '<p><em>斜</em></p>' &&
            h('~~删~~') === '<p><del>删</del></p>');

        /* ---------- 段落 / 换行 / 分隔线 / 引用 ---------- */
        ok('★ 行尾两个空格 = 硬换行 <br>（★ 看的是**上一行**的结尾）',
            h('上  \n下') === '<p>上<br>\n下</p>' && h('上\n下') === '<p>上\n下</p>');
        ok('★ 单独一行 --- = <hr>；`|` 那一行不会被误判成分隔线',
            h('---') === '<hr>' && h('| a |\n| - |\n| 1 |').indexOf('<table') === 0);
        ok('★ 引用块按空行分段（两段 → 两个 p）',
            h('> 一\n>\n> 二') === '<blockquote>\n<p>一</p>\n<p>二</p>\n</blockquote>');

        /* ---------- 列表 ---------- */
        const nested = h('- 一\n  - 一甲\n- 二');
        ok('★★ 嵌套列表是**合法结构**：子 <ul> 在父 <li> 里面（不是 </li><ul>）',
            nested.indexOf('<li>一\n<ul>') !== -1 && nested.indexOf('</li><ul>') === -1 &&
            (nested.match(/<ul>/g) || []).length === 2 && (nested.match(/<\/ul>/g) || []).length === 2);
        ok('★ 有序列表 <ol>；同层从 ul 换成 ol 会正确关旧开新',
            h('1. 一\n2. 二').indexOf('<ol>') === 0 &&
            (h('- 一\n1. 一').match(/<\/ul>/g) || []).length === 1 &&
            h('- 一\n1. 一').indexOf('<ol>') !== -1);
        ok('★★ 任务列表：- [x] / - [ ] → 勾选框 + md-task 类（禁用态，点不动）',
            /<li class="md-task"><input type="checkbox" disabled checked> 做完/.test(h('- [x] 做完')) &&
            /<li class="md-task"><input type="checkbox" disabled> 没做/.test(h('- [ ] 没做')));

        /* ---------- 表格 ---------- */
        const tbl = h('| 名 | 数 | 说 |\n|:--|--:|:-:|\n| a | 1 | x |');
        ok('★★ GFM 表格：表头 + 分隔行（★ 单元格只写一个 - 也认，`|:-:|` 合法）',
            tbl.indexOf('<table class="md-table">') === 0 &&
            /<th class="md-l">名<\/th><th class="md-r">数<\/th><th class="md-c">说<\/th>/.test(tbl) &&
            /<td class="md-l">a<\/td><td class="md-r">1<\/td><td class="md-c">x<\/td>/.test(tbl));
        ok('★ 表格只在"下一行是分隔行"时才成立（否则就是普通段落）',
            h('| a | b |\n| 1 | 2 |').indexOf('<p>') === 0);

        /* ---------- 代码块 ---------- */
        const code = h('```csharp\nvar a = 1 < 2 && *b*;\n```');
        ok('★★ 围栏代码块：语言名进 data-lang，内容整体转义，而且**不做行内解析**',
            code === '<pre class="md-code" data-lang="csharp"><code>var a = 1 &lt; 2 &amp;&amp; *b*;</code></pre>');
        ok('★★ 代码块里的 `#` 不会被当成标题（围栏要真的被跟踪）',
            h('```\n# 不是标题\n```').indexOf('<h1') === -1);

        /* ---------- 目录 ---------- */
        const toc = h('[TOC]\n\n## 甲\n\n### 甲一\n\n## 乙');
        ok('★★ [TOC] → 自动目录，层级按标题嵌套，锚点指向标题 id',
            /<ul class="md-toc">/.test(toc) && /href="#甲"/.test(toc) && /href="#甲一"/.test(toc) &&
            (toc.match(/<ul class="md-toc">/g) || []).length === 2);
        ok('★ [[toc]] 也认（大小写不敏感）；没有标题时输出空（不留空壳）',
            /md-toc/.test(h('[[TOC]]\n\n# 甲')) && h('[TOC]') === '');

        /* ---------- 真文件也过一遍（站点里实际会渲染的那些 .md）---------- */
        const mdDir = path.join(ROOT, 'data/readmes');
        const mdFiles = fs.readdirSync(mdDir).filter((f) => f.endsWith('.md')).sort();
        ok('★ data/readmes 下有真文件可渲染（' + mdFiles.join(', ') + '）', mdFiles.length > 0);
        mdFiles.forEach((f) => {
            const out = h(fs.readFileSync(path.join(mdDir, f), 'utf8'));
            ok('★ 真 md 渲染干净：' + f + '（没 undefined、没裸露标签）',
                out.length > 0 && out.indexOf('undefined') === -1 &&
                out.indexOf('<script') === -1 && out.indexOf('[object') === -1);
        });

        /* ★★ 速查表里那些"危险示范"必须真的只显示为字面 —— 这是文档与解析器
           之间最容易脱节的地方（写文档的人以为会转义、实际没转 ✗）。 */
        const guideOut = h(fs.readFileSync(path.join(mdDir, '_syntax.md'), 'utf8'));
        ok('★★ 速查表：`javascript:` 链接没变成 <a>（原样显示），内联 HTML 示范被转义成字面',
            guideOut.indexOf('href="javascript:') === -1 &&
            guideOut.indexOf('&lt;b&gt;粗&lt;/b&gt;') !== -1);
        ok('★ 速查表：自己那行"行尾两个空格"确实渲染成了 <br>（文档在演示真行为）',
            /\u4e24\u4e2a\u7a7a\u683c<br>/.test(guideOut));
    })();

    console.log('\n' + '='.repeat(52));
    console.log(fail ? '\u2718 ' + pass + ' passed, ' + fail + ' failed' : '\u2714 全部通过：' + pass + ' 项');
    process.exit(fail ? 1 : 0);
})();