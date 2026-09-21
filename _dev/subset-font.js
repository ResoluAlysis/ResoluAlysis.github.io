'use strict';
/* ============================================================
   字体子集化 —— 把 3.2MB 的 HuXiaoBo.otf 裁成「页面真正用到的字」
   ------------------------------------------------------------
   跑法（改过文案之后都要重跑一次）：

       cd _dev && npm install      # 只需要一次，装 subset-font
       node _dev/subset-font.js    # 生成 assets/fonts/HuXiaoBo-subset.woff2

   为什么要做这件事：
     HuXiaoBo.otf 里有 7409 个字形（一整套 CJK），但站点实际用到的
     只有 361 个码位。字体是**开屏闸门**在等的东西 —— 3.2MB 下完之前
     WELCOME 会先用系统字体渲染，字体到了再当着用户的面重排一次。
     裁到几十 KB 之后几乎瞬间到位，那条 MAX_WAIT=2000ms 的兜底基本
     不会被触发。

   这个脚本做四件事：
     1. 用 glyph-set.js 收集「页面上会被渲染到的字」（不含注释）
     2. 调 subset-font（harfbuzz wasm）出 woff2
     3. **验四遍**（任何一条不过就不写文件）：
        ① cmap —— 请求的码位一个不少
        ② glyf  —— 逐个字形比对轮廓字节，防止裁出"看着在、其实是空壳"
        ③ 度量 —— unitsPerEm / hhea / OS/2 逐项相同
        ④ hmtx —— 每个字的字宽相同
        ③④ 是这个站点**特别**需要的：js/welcome.js 用 canvas measureText
        量 WELCOME 的宽度反推字号，CSS 的 --splash-ink-nudge 又是从
        hhea 的 859/188 手算的。度量一变，整套版式会整体错位且不报错。
     4. 写 _dev/glyph-manifest.json —— check.js 靠它检测「文案变了但
        字体没重裁」，那个文件不需要 npm 依赖就能读

   加 --check 只做第 4 步的比对，不写任何文件（CI / 不想装依赖时用）。

   ★ 注意：这个脚本依赖 subset-font。check.js 不依赖任何包，
     所以别把 require('subset-font') 挪到 check.js 里去。
   ============================================================ */

const fs = require('fs');
const path = require('path');
const { collect, toRanges, rangeText, ROOT } = require('./glyph-set.js');

const SRC = 'assets/fonts/HuXiaoBo.otf';
const OUT = 'assets/fonts/HuXiaoBo-subset.woff2';
const MANIFEST = '_dev/glyph-manifest.json';

const abs = (f) => path.join(ROOT, f);
const size = (n) => (n / 1024).toFixed(1) + ' KB';

/* ------------------------------------------------------------
   sfnt / cmap 解析（只够用，不引第三方）
   ------------------------------------------------------------ */
function parseSfnt(buf) {
    if (buf.readUInt32BE(0) !== 0x00010000) throw new Error('不是 TrueType sfnt（flavor=' + buf.readUInt32BE(0).toString(16) + '）');
    const n = buf.readUInt16BE(4);
    const tables = {};
    for (let i = 0; i < n; i++) {
        const o = 12 + i * 16;
        tables[buf.toString('latin1', o, o + 4)] = { offset: buf.readUInt32BE(o + 8), length: buf.readUInt32BE(o + 12) };
    }
    return tables;
}

/* 把 cmap 里所有码位读出来（format 4 / 12 两种够覆盖 TrueType 输出的） */
function readCmap(buf, tables) {
    const cm = tables.cmap;
    if (!cm) throw new Error('没有 cmap 表');
    const base = cm.offset;
    const cps = new Set();
    for (let i = 0; i < buf.readUInt16BE(base + 2); i++) {
        const rec = base + 4 + i * 8;
        const t = base + buf.readUInt32BE(rec + 4);
        const fmt = buf.readUInt16BE(t);
        if (fmt === 4) {
            const segX2 = buf.readUInt16BE(t + 6);
            const endO = t + 14, startO = endO + segX2 + 2;
            for (let s = 0; s < segX2 / 2; s++) {
                const end = buf.readUInt16BE(endO + s * 2);
                const start = buf.readUInt16BE(startO + s * 2);
                if (start === 0xffff) continue;
                for (let c = start; c <= end && c !== 0x10000; c++) cps.add(c);
            }
        } else if (fmt === 12) {
            const g = buf.readUInt32BE(t + 12);
            for (let k = 0; k < g; k++) {
                const o = t + 16 + k * 12;
                const s = buf.readUInt32BE(o), e = buf.readUInt32BE(o + 4);
                for (let c = s; c <= e; c++) cps.add(c);
            }
        }
    }
    return cps;
}

/* 码位 → 字形 id */
function cmapLookup(buf, tables, cp) {
    const base = tables.cmap.offset;
    for (let i = 0; i < buf.readUInt16BE(base + 2); i++) {
        const rec = base + 4 + i * 8;
        if (buf.readUInt16BE(rec) !== 3) continue;          // 只信 platform 3（Windows BMP）
        const t = base + buf.readUInt32BE(rec + 4);
        const fmt = buf.readUInt16BE(t);
        if (fmt === 4) {
            const segX2 = buf.readUInt16BE(t + 6);
            const seg = segX2 / 2;
            const endO = t + 14, startO = endO + segX2 + 2, deltaO = startO + segX2, rangeO = deltaO + segX2;
            for (let s = 0; s < seg; s++) {
                const end = buf.readUInt16BE(endO + s * 2);
                if (cp > end) continue;
                const start = buf.readUInt16BE(startO + s * 2);
                if (cp < start) return 0;
                const delta = buf.readInt16BE(deltaO + s * 2);
                const ro = buf.readUInt16BE(rangeO + s * 2);
                if (ro === 0) return (cp + delta) & 0xffff;
                const gi = rangeO + s * 2 + ro + (cp - start) * 2;
                const g = buf.readUInt16BE(gi);
                return g === 0 ? 0 : (g + delta) & 0xffff;
            }
        }
    }
    return 0;
}

/* 取某个字形的原始字节（loca/glyf）。复合字形的组件 id 会被重编号，
   所以比对时只信「简单字形」——简单字形的字节里没有别的 gid。 */
function glyphBytes(buf, tables, gid) {
    const head = tables.head.offset, maxp = tables.maxp.offset;
    const longLoca = buf.readInt16BE(head + 50) === 1;
    const loca = tables.loca.offset, glyf = tables.glyf.offset;
    const a = longLoca ? buf.readUInt32BE(loca + gid * 4) : buf.readUInt16BE(loca + gid * 2) * 2;
    const b = longLoca ? buf.readUInt32BE(loca + gid * 4 + 4) : buf.readUInt16BE(loca + gid * 2 + 2) * 2;
    if (b <= a) return Buffer.alloc(0);
    const nContours = buf.readInt16BE(glyf + a);
    const simple = nContours >= 0;
    return { simple, bytes: buf.subarray(glyf + a, glyf + b) };
}

/* ------------------------------------------------------------
   度量：head / hhea / OS/2 / hmtx
   ------------------------------------------------------------
   ★ 这一组是这个站点**特别**需要的：js/welcome.js 用 canvas
     measureText('400 100px "HuXiaoBo"') 去量 WELCOME 的宽度反推字号，
     CSS 里 --splash-ink-nudge 的 0.062em 又是从 hhea 的 859/188 手算出来的。
     子集要是把 unitsPerEm / 垂直度量 / 字宽改了，整套排版会**整体错位**，
     而且不会报错。所以逐项比一遍。
   ------------------------------------------------------------ */
function readMetrics(buf, tables) {
    const head = tables.head.offset, hhea = tables.hhea.offset;
    const os2 = tables['OS/2'] ? tables['OS/2'].offset : null;
    const m = {
        unitsPerEm: buf.readUInt16BE(head + 18),
        hheaAscender: buf.readInt16BE(hhea + 4),
        hheaDescender: buf.readInt16BE(hhea + 6),
        hheaLineGap: buf.readInt16BE(hhea + 8),
    };
    if (os2) Object.assign(m, {
        sTypoAscender: buf.readInt16BE(os2 + 68),
        sTypoDescender: buf.readInt16BE(os2 + 70),
        sTypoLineGap: buf.readInt16BE(os2 + 72),
        usWinAscent: buf.readUInt16BE(os2 + 74),
        usWinDescent: buf.readUInt16BE(os2 + 76),
    });
    return m;
}

/* 字宽（hmtx）。gid 超过 numberOfHMetrics 时沿用最后一条。 */
function advanceWidth(buf, tables, gid) {
    const n = buf.readUInt16BE(tables.hhea.offset + 34);
    return buf.readUInt16BE(tables.hmtx.offset + Math.min(gid, n - 1) * 4);
}

/* ------------------------------------------------------------ */

async function build() {
    const subsetFont = require('subset-font');
    const { text, bySource } = collect();
    const ranges = toRanges(text);
    const wanted = new Set();
    for (const [a, b] of ranges) for (let c = a; c <= b; c++) wanted.add(c);

    console.log('收集到 ' + wanted.size + ' 个码位（' + ranges.length + ' 段）');
    for (const [f, s] of Object.entries(bySource)) {
        const n = new Set([...s].filter((c) => c.codePointAt(0) > 127)).size;
        if (n) console.log('   ' + f.padEnd(24) + n + ' 个非 ASCII 字');
    }

    const src = fs.readFileSync(abs(SRC));
    const srcTables = parseSfnt(src);
    const srcHas = readCmap(src, srcTables);

    /* ★ 请求集里有一部分字**原字体本来就没有**（↗ ✕ 各种破折号/引号…）——
       它们今天是靠字体栈回退到系统字体显示的。子集当然也造不出来，
       所以校验只针对「原字体有、子集也必须有」的那部分。 */
    const wantedAll = wanted;
    const absent = [...wanted].filter((cp) => !srcHas.has(cp));
    for (const cp of absent) wanted.delete(cp);

    const t0 = Date.now();
    const woff2 = await subsetFont(src, text, { targetFormat: 'woff2' });
    console.log('\n子集化完成：' + size(src.length) + '  →  ' + size(woff2.length) +
        '   (' + (woff2.length / src.length * 100).toFixed(2) + '%, 省 ' +
        ((1 - woff2.length / src.length) * 100).toFixed(1) + '%, ' + (Date.now() - t0) + 'ms)');
    if (absent.length) {
        console.log('说明：其中 ' + absent.length + ' 个码位原字体就没有，照旧回退系统字体 —— ' +
            absent.map((c) => (c >= 32 && c < 127 ? String.fromCharCode(c) : String.fromCodePoint(c)) + '(U+' + c.toString(16) + ')').join(' '));
    }

    /* ---------- 验 ---------- */
    const wawoff2 = require('wawoff2');
    const back = Buffer.from(await wawoff2.decompress(woff2));
    const subTables = parseSfnt(back);

    const got = readCmap(back, subTables);
    const missing = [...wanted].filter((cp) => !got.has(cp));
    console.log('校验 1/4 cmap 覆盖：请求 ' + wanted.size + ' 个，实际 ' + got.size +
        ' 个，缺 ' + missing.length + (missing.length ? '  → ' + missing.slice(0, 20).map((c) => 'U+' + c.toString(16)).join(' ') : ''));
    let same = 0, diff = 0, skipped = 0;
    const diffs = [];
    for (const cp of wanted) {
        const g1 = cmapLookup(src, srcTables, cp), g2 = cmapLookup(back, subTables, cp);
        if (!g1 || !g2) { skipped++; continue; }
        const a = glyphBytes(src, srcTables, g1), b = glyphBytes(back, subTables, g2);
        if (!a.simple || !b.simple) { skipped++; continue; }
        if (a.bytes.equals(b.bytes)) same++;
        else { diff++; if (diffs.length < 10) diffs.push('U+' + cp.toString(16)); }
    }
    console.log('校验 2/4 轮廓字节：逐字节相同 ' + same + ' 个，不同 ' + diff + ' 个' +
        (skipped ? '（空字形/复合字形跳过 ' + skipped + '）' : '') + (diffs.length ? '  → ' + diffs.join(' ') : ''));

    /* --- 校验 3：度量必须一模一样 --- */
    const ms = readMetrics(src, srcTables), mb = readMetrics(back, subTables);
    const metricDiff = Object.keys(ms).filter((k) => ms[k] !== mb[k]);
    console.log('校验 3/4 度量：' + Object.entries(mb).map(([k, v]) => k + '=' + v).join(' ') +
        (metricDiff.length ? '  → 不一致: ' + metricDiff.map((k) => k + '(' + ms[k] + '→' + mb[k] + ')').join(' ') : ''));

    /* --- 校验 4：每个字的字宽必须一模一样（canvas 测宽靠它） --- */
    let wSame = 0;
    const wDiff = [];
    for (const cp of wanted) {
        const g1 = cmapLookup(src, srcTables, cp), g2 = cmapLookup(back, subTables, cp);
        if (!g1 || !g2) continue;
        const w1 = advanceWidth(src, srcTables, g1), w2 = advanceWidth(back, subTables, g2);
        if (w1 === w2) wSame++;
        else wDiff.push('U+' + cp.toString(16) + '(' + w1 + '→' + w2 + ')');
    }
    console.log('校验 4/4 字宽：相同 ' + wSame + ' 个，不同 ' + wDiff.length + ' 个' +
        (wDiff.length ? '  → ' + wDiff.slice(0, 10).join(' ') : ''));

    if (missing.length || diff || metricDiff.length || wDiff.length) {
        console.error('\n✘ 子集有问题，没有写文件。');
        process.exit(1);
    }

    fs.writeFileSync(abs(OUT), woff2);
    fs.writeFileSync(abs(MANIFEST), JSON.stringify({
        _: '由 _dev/subset-font.js 生成。check.js 用它检测「文案变了但字体没重裁」。',
        source: SRC,
        output: OUT,
        sourceBytes: src.length,
        outputBytes: woff2.length,
        glyphs: wanted.size,
        ranges,
        absent,          // 原字体就没有的码位（一直靠系统字体兜），不算"漏裁"
    }, null, 0) + '\n');

    console.log('\n✔ 写出 ' + OUT + '  ' + size(woff2.length));
    console.log('✔ 写出 ' + MANIFEST + '  ' + wanted.size + ' 个码位（另有 ' + absent.length + ' 个原字体就没有）');
    console.log('\n记得：改过页面文案后重跑一次这个脚本，否则 check.js 会报「有新字没进子集」。');
}

/// --check：只比对 manifest 与当前文案，不读字体、不写文件、不需要 npm 包
function check() {
    const { text } = collect();
    if (!fs.existsSync(abs(MANIFEST))) {
        console.log('✘ 没有 _dev/glyph-manifest.json —— 先跑一次 node _dev/subset-font.js');
        process.exit(1);
    }
    const m = JSON.parse(fs.readFileSync(abs(MANIFEST), 'utf8'));
    const cps = [...new Set([...text].map((c) => c.codePointAt(0)))];
    const absent = new Set(m.absent || []);
    const miss = cps.filter((cp) => !absent.has(cp) && !m.ranges.some(([a, b]) => cp >= a && cp <= b));
    if (miss.length) {
        console.log('✘ 有 ' + miss.length + ' 个字不在子集里：' +
            miss.slice(0, 40).map((c) => String.fromCodePoint(c) + '(U+' + c.toString(16) + ')').join(' '));
        console.log('  → 跑 node _dev/subset-font.js 重裁一次');
        process.exit(1);
    }
    console.log('✔ 当前文案全部在子集里（' + cps.length + ' 个码位，manifest 记了 ' + m.glyphs + ' 个）');
    console.log('  字体 ' + m.source + ' ' + size(m.sourceBytes) + ' → ' + m.output + ' ' + size(m.outputBytes));
    if (!fs.existsSync(abs(OUT))) { console.log('✘ 但 ' + OUT + ' 不在！'); process.exit(1); }
}

const fn = process.argv.includes('--check') ? check : build;
Promise.resolve(fn()).catch((e) => { console.error(e); process.exit(1); });
