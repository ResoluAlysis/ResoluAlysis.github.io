'use strict';
/* ============================================================
   剥掉源文件开头的 UTF-8 BOM
   ------------------------------------------------------------
   跑法：
       node _dev/strip-bom.js          # 直接改（只动真的带 BOM 的文件）
       node _dev/strip-bom.js --dry    # 只看哪些文件带 BOM，不改

   为什么需要它：`_dev/check.js` 的 [0] 分组要求所有源文件都是
   **无 BOM 的合法 UTF-8**。而不少编辑器（尤其是 Windows 上把
   "UTF-8 with BOM" 当默认编码的那些）会在保存时**悄悄加上 BOM**。
   BOM 本身不会让页面报错，但会：
     · 让 Git 显示成"整个文件都改了"；
     · 让 check.js 的编码断言变红；
     · 混进字形收集器，被子集化检查报成"有个字没进子集"（其实是 U+FEFF）。
   所以这里给一个一键修好的入口。

   ★ 用 Node 读写，不要用 PowerShell 的 Get-Content / Set-Content ——
     那两个会按 ANSI 解码中文（整篇变乱码）并且**主动加上** BOM，
     等于把要修的问题再犯一遍。见 CHANGES 的 P27 §三.1。
   ============================================================ */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');
const BOM = [0xEF, 0xBB, 0xBF];

function targets() {
    const list = ['index.html', 'CHANGES.md', 'css/style.css', 'data/works.js',
        '_dev/check.js', '_dev/glyph-set.js', '_dev/subset-font.js',
        '_dev/package.json', '_dev/glyph-manifest.json'];
    for (const dir of ['js', 'data', 'css', '_dev']) {
        let names = [];
        try { names = fs.readdirSync(path.join(ROOT, dir)); } catch { continue; }
        for (const n of names) {
            if (/\.(js|css|html|json|md)$/.test(n)) list.push(dir + '/' + n);
        }
    }
    return [...new Set(list)].filter((f) => fs.existsSync(path.join(ROOT, f)));
}

const files = targets();
const hit = [];
for (const f of files) {
    const buf = fs.readFileSync(path.join(ROOT, f));
    if (!(buf[0] === BOM[0] && buf[1] === BOM[1] && buf[2] === BOM[2])) continue;
    hit.push(f);
    if (DRY) continue;

    /* 只切掉开头 3 个字节，其余**原样字节**写回 ——
       不经字符串解码再编码，避免任何意外改动。 */
    fs.writeFileSync(path.join(ROOT, f), buf.subarray(3));
}

console.log('扫描 ' + files.length + ' 个源文件');
if (!hit.length) {
    console.log('✔ 没有文件带 BOM');
} else if (DRY) {
    console.log('★ 这些文件带 BOM（加 --write 或去掉 --dry 就会修）：');
    hit.forEach((f) => console.log('   · ' + f));
} else {
    console.log('✔ 已剥掉 BOM：');
    hit.forEach((f) => console.log('   · ' + f + '  （-3 字节）'));
    console.log('\n顺带：改完之后 git diff 应该只剩真正的改动，不再"整个文件都变了"。');
}
