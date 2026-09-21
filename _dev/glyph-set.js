'use strict';
/* ============================================================
   收集「页面上真正会被文字字体渲染到的字符」
   ------------------------------------------------------------
   为什么要专门写这个：不能把源码里出现的所有字符都塞进子集。
   css/style.css 有 3400 多行、里面大量中文注释，js/*.js 也是 ——
   这些字永远不会显示，却能把子集从几十 KB 撑到几百 KB，
   等于白做。所以必须把「正文」和「注释」分开：

     · index.html → 去注释 / <script> / <style> 之后剩下的文本节点，
                    外加会显示出来的属性（alt / title / placeholder / value）
     · js, data   → 扫描器剥掉注释和正则，只取字符串字面量与模板串
     · css        → 只取 `content: "…"` 的值

   ★ 这个文件**不依赖任何 npm 包** —— `_dev/check.js` 也要用它。
     真正需要 subset-font 的只有 `_dev/subset-font.js`。

   ⚠️ 万一这里漏收了某个字（比如将来加了动态拼出来的文案），
      页面上不会缺字：字体栈里 "HuXiaoBo-Full"（3.2MB 原字体）
      会兜住那一个字，只是那一次会下载原字体。见 style.css。
   ============================================================ */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* 一定要有的基础集：ASCII 可打印 + 一批中文标点。
   标点单独列出来是因为它们散落在模板串里、容易被扫描器漏掉，
   而一个字的代价只有几百字节。 */
const BASE_RANGES = [
    [0x20, 0x7e],           // 空格 ~ ~
    [0x00a0, 0x00a0],       // 不换行空格
    [0x2010, 0x2015],       // ‐ ‑ ‒ – — ―
    [0x2018, 0x201f],       // ‘ ’ ‚ ‛ “ ” „ ‟
    [0x2026, 0x2026],       // …
    [0x2039, 0x203a],       // ‹ ›
    [0x3001, 0x3002],       // 、。
    [0x3008, 0x3011],       // 〈〉《》「」『』
    [0x3014, 0x3015],       // 〔〕
    [0xff01, 0xff01],       // ！
    [0xff08, 0xff09],       // （）
    [0xff0c, 0xff0c],       // ，
    [0xff1a, 0xff1b],       // ：；
    [0xff1f, 0xff1f],       // ？
];

const ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
    copy: '\u00a9', reg: '\u00ae', trade: '\u2122', hellip: '\u2026',
    mdash: '\u2014', ndash: '\u2013', middot: '\u00b7', times: '\u00d7',
    laquo: '\u00ab', raquo: '\u00bb', deg: '\u00b0', times: '\u00d7',
};

const decodeEntities = (s) => s.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, g) => {
    if (g[0] === '#') {
        const hex = g[1] === 'x' || g[1] === 'X';
        const cp = parseInt(hex ? g.slice(2) : g.slice(1), 16 * 0 + (hex ? 16 : 10));
        return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, g) ? ENTITIES[g] : m;
});

/* ------------------------------------------------------------
   JS / TS 扫描器：剥注释、取字符串
   ------------------------------------------------------------
   一个字符一个字符地走状态，不用正则去"抠注释"——因为
   `'https://…'` 里的 `//`、正则字面量里的 `/*` 都会骗过正则版。
   ------------------------------------------------------------ */
const REGEX_PREV_CHARS = new Set(['(', '[', '{', ',', ';', ':', '=', '!', '&', '|',
    '?', '+', '-', '*', '%', '~', '^', '<', '>', '']);
const REGEX_PREV_WORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new',
    'delete', 'void', 'do', 'else', 'case', 'yield', 'await']);

function jsStrings(src) {
    const out = [];
    const n = src.length;
    let i = 0, prev = '', word = '';

    const isRegexAllowed = () => prev === '' || REGEX_PREV_CHARS.has(prev) || REGEX_PREV_WORDS.has(word);

    while (i < n) {
        const c = src[i], c2 = src[i + 1];

        if (c === '/' && c2 === '/') { while (i < n && src[i] !== '\n') i++; continue; }
        if (c === '/' && c2 === '*') {
            i += 2;
            while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
            i += 2; continue;
        }

        if (c === '"' || c === "'" || c === '`') {
            const q = c; i++;
            let buf = '';
            while (i < n) {
                const ch = src[i];
                if (ch === '\\') { if (src[i + 1] !== undefined) buf += src[i + 1]; i += 2; continue; }
                if (ch === q) { i++; break; }
                if (q !== '`' && ch === '\n') break;   // 未闭合：别把后面整段吞掉
                buf += ch; i++;
            }
            out.push(buf);
            prev = q; word = ''; continue;
        }

        if (c === '/' && isRegexAllowed()) {
            const save = i;
            i++;
            let closed = false, inClass = false;
            while (i < n) {
                const ch = src[i];
                if (ch === '\\') { i += 2; continue; }
                if (ch === '\n') break;
                if (ch === '[') inClass = true;
                else if (ch === ']') inClass = false;
                else if (ch === '/' && !inClass) { closed = true; i++; break; }
                i++;
            }
            if (closed) { while (i < n && /[a-z]/.test(src[i])) i++; }
            else i = save + 1;                       // 不是正则，当除号
            prev = '/'; word = ''; continue;
        }

        if (/[A-Za-z_$]/.test(c)) {
            const s = i;
            while (i < n && /[\w$]/.test(src[i])) i++;
            word = src.slice(s, i); prev = src[i - 1];
            continue;
        }
        if (!/\s/.test(c)) { prev = c; word = ''; }
        i++;
    }
    return out.join(' ');
}

/* ------------------------------------------------------------ */

const htmlChars = (src) => {
    const stripped = src
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
    const attrs = [...stripped.matchAll(/(?:^|[\s"'])(alt|title|aria-label|placeholder|value)\s*=\s*"([^"]*)"/g)]
        .map((m) => m[2]);
    const text = stripped.replace(/<[^>]*>/g, ' ');
    return decodeEntities(text + ' ' + attrs.join(' '));
};

const cssChars = (src) => {
    const noComments = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
    return [...noComments.matchAll(/content\s*:\s*(["'])((?:\\.|(?!\1)[^\\])*)\1/g)].map((m) => m[2]).join(' ');
};

const listDir = (dir, ext) => {
    try { return fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(ext)); }
    catch { return []; }
};

/* 返回 { text, bySource } —— text 是要喂给 subset-font 的那串字 */
function collect() {
    const bySource = {};

    bySource['index.html'] = htmlChars(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
    bySource['css/style.css'] = cssChars(fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8'));

    const jsFiles = [...listDir('js', '.js').map((f) => 'js/' + f),
    ...listDir('data', '.js').map((f) => 'data/' + f)];
    for (const f of jsFiles) bySource[f] = jsStrings(fs.readFileSync(path.join(ROOT, f), 'utf8'));

    let text = BASE_RANGES.map(([a, b]) => {
        let s = '';
        for (let c = a; c <= b; c++) s += String.fromCharCode(c);
        return s;
    }).join('');

    for (const k of Object.keys(bySource)) text += ' ' + bySource[k];

    /* 控制字符（模板串里的真换行、Tab…）不需要字形，留着只会让
       "缺字"的校验报假警。零宽字符同理 —— 尤其 U+FEFF：
       编辑器加了 BOM 的话它会是文件的第一个"字符"，但它永远不会被画出来。
       真正的 BOM 问题由 check.js 的 [0] 编码断言负责喊（那条更准确），
       这里只是别让它再引发第二个、看起来很像"缺字"的报错，
       免得把"编码问题"误诊成"要重裁字体"。
       修 BOM：node _dev/strip-bom.js */
    text = text.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200d\u2060\ufeff]/g, '');

    return { text, bySource, jsFiles };
}

/* 把一串字折成 [ [start,end], … ] 的紧凑区间（manifest 用） */
function toRanges(text) {
    const cps = [...new Set([...text].map((c) => c.codePointAt(0)))].sort((a, b) => a - b);
    const out = [];
    for (const cp of cps) {
        const last = out[out.length - 1];
        if (last && cp === last[1] + 1) last[1] = cp;
        else out.push([cp, cp]);
    }
    return out;
}

const inRanges = (cp, ranges) => {
    let lo = 0, hi = ranges.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const [a, b] = ranges[mid];
        if (cp < a) hi = mid - 1;
        else if (cp > b) lo = mid + 1;
        else return true;
    }
    return false;
};

const rangeText = (ranges) => ranges.map(([a, b]) =>
    a === b ? 'U+' + a.toString(16).toUpperCase().padStart(4, '0')
        : 'U+' + a.toString(16).toUpperCase().padStart(4, '0') + '-' + b.toString(16).toUpperCase().padStart(4, '0')
).join(' ');

module.exports = { collect, toRanges, inRanges, rangeText, jsStrings, htmlChars, cssChars, BASE_RANGES, ROOT };
