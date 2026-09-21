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
        /prefers-reduced-motion[\s\S]*?\.df-name::before\s*\{\s*animation:\s*none/.test(cssNC));
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
    ok('圆形指针只做位置跟随（没有缩放 / 动画机制抢 transform）',
        /translate\(\$\{cx\}px, \$\{cy\}px\)/.test(read('js/main.js')) &&
        !/CURTAIN|coverScale|scaleTo|dot\.animate/.test(read('js/main.js')));

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