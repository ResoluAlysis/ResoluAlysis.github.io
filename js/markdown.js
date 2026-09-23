'use strict';
/* ============================================================
   Markdown → HTML（P91）
   ------------------------------------------------------------
   为什么自己写：这个站零依赖、没有构建步骤 —— 引 marked / markdown-it 就等于
   破了自己的规矩。所以这是一个**纯函数**解析器：不碰 DOM、不发请求、可以被
   _dev/check.js 直接喂字符串断言 ✓。

   支持的子集（GitHub README 常用面）：
     · ATX 标题 # ~ ######（自动生成 GitHub 风格锚点 id）
       ★ 只认 ATX；不认 `===` / `---` 下划线式标题（规则有歧义，README 里几乎没人用）
     · 段落（行尾两个空格 = 硬换行）、分隔线 ---
     · **粗体** / *斜体* / ~~删除线~~ / `行内代码`
     · ``` 围栏代码块（带语言名，不做语法高亮）
     · 无序 / 有序列表，按缩进嵌套；任务列表 - [ ] / - [x]
     · [文字](链接) / ![图](地址)（只放行 http(s) / mailto / 相对路径 / # 锚点）
     · > 引用块（按空行分段）
     · GFM 表格 + :-- / --: / :-: 对齐
     · 单独一行 [TOC] 或 [[toc]] → 自动目录

   ★★ 两条安全决定（都是有意的）：
     ① **整个源文本先整体 HTML 转义再解析** —— 所以 .md 里写内联 HTML 不会被执行，
        只会原样显示 ✓（想要 HTML 就别用这个渲染器）。
     ② URL 只放行 http/https/mailto/相对路径/# 锚点 —— `javascript:`、`data:`
        一律丢掉 ✓。
   ★ 标题走站里的展示字体、正文走系统字体（见 style.css）
     → 所以只有**标题和表头**的字需要进字体子集，_dev/glyph-set.js 专门扫这几行 ✓。
   ============================================================ */
(function (global) {

    const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ESC[c]; });
    }

    /* ---- URL 白名单 ---------------------------------------------------- */
    function safeUrl(raw) {
        // 控制字符先清掉，免得被人用 \n javascript: 这类绕过去
        const s = String(raw == null ? '' : raw).replace(/[\u0000-\u001f\u007f]/g, '').trim();
        if (/^[a-z][a-z0-9+.\-]*:/i.test(s)) {
            // 有 scheme：只放行这两个
            return /^(https?|mailto):/i.test(s) ? s : '';
        }
        return s;                       // 没有 scheme = 相对路径 / #锚点 → 放行
    }

    /* ---- 锚点 id：GitHub 风格（小写、去标点、空格→'-'，中日韩字保留）---- */
    function stripInline(s) {
        return String(s)
            .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')   // 链接/图片 → 只留文字
            .replace(/[`*~]/g, '');
    }

    function slug(text) {
        return stripInline(text)
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s\-_]/gu, '')
            .trim()
            .replace(/\s+/g, '-');
    }

    /* ---- 行内 ---------------------------------------------------------- */
    function inline(src) {
        const store = [];
        const keep = function (html) { store.push(html); return '\u0000' + (store.length - 1) + '\u0000'; };

        let s = src;

        // ① 行内代码最先 —— 免得代码里的 * _ ~ 被当成强调
        s = s.replace(/`([^`]+)`/g, function (m, code) { return keep('<code>' + code + '</code>'); });

        // ② 图片必须在链接之前（![]() 的尾巴也是 ]() ）
        //    ★ URL 被白名单拒掉时**原样保留**（不渲染、也不丢括号）——
        //      和 GitHub 对坏链接的处理一致：你就看到那段字面文本 ✓
        s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+[^)]*)?\)/g, function (m, alt, url) {
            const u = safeUrl(url);
            if (!u) return m;
            return keep('<img src="' + u + '" alt="' + alt + '" loading="lazy">');
        });

        // ③ 链接
        s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+[^)]*)?\)/g, function (m, text, url) {
            const u = safeUrl(url);
            if (!u) return m;
            const ext = /^https?:/i.test(u);
            return keep('<a href="' + u + '"' + (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + text + '</a>');
        });

        // ④ 强调
        s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
        s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        s = s.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?]|$)/g, '$1<em>$2</em>');

        // ⑤ 删除线
        s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');

        // ⑥ 还原占位
        return s.replace(/\u0000(\d+)\u0000/g, function (m, i) { return store[+i]; });
    }

    /* ---- 块的判定 ------------------------------------------------------ */
    const RE_ATX = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
    const RE_FENCE = /^\s*(```|~~~)\s*([^\s`]*)\s*$/;
    const RE_HR = /^ {0,3}([-*_])[ \t]*(\1[ \t]*){2,}$/;
    const RE_UL = /^(\s*)[-*+]\s+(.*)$/;
    const RE_OL = /^(\s*)\d+[.)]\s+(.*)$/;
    const RE_TASK = /^\[([ xX])\]\s+(.*)$/;
    const RE_QUOTE = /^\s*&gt;\s?(.*)$/;          // ★ 源文本已经转过义，> 变成了 &gt;
    const RE_TOC = /^\s*(\[\[toc\]\]|\[toc\])\s*$/i;
    // ★ GFM 的分隔行单元格允许**只写一个连字符**（`|:-:|` 合法）——
    //   写成 {2,} 会把 `|:--|--:|:-:|` 这种最常见的写法里最后一格判掉 ✗
    const RE_COLON_ALIGN = /^\s*:?-+:?\s*$/;
    const HAS_PIPE = /\|/;

    function isDelimRow(l) {
        if (!HAS_PIPE.test(l) && !RE_COLON_ALIGN.test(l)) return false;
        const cells = splitRow(l);
        if (!cells.length) return false;
        return cells.every(function (c) { return RE_COLON_ALIGN.test(c); });
    }

    /* 按未转义的 | 切单元格；首尾空单元格丢掉 */
    function splitRow(line) {
        const raw = String(line).trim().replace(/^\||\|$/g, '');
        const cells = [];
        let buf = '';
        for (let i = 0; i < raw.length; i++) {
            const c = raw[i];
            if (c === '\\' && raw[i + 1] === '|') { buf += '|'; i++; continue; }
            if (c === '|') { cells.push(buf); buf = ''; continue; }
            buf += c;
        }
        cells.push(buf);
        return cells.map(function (s) { return s.trim(); });
    }

    function alignOf(cell) {
        const left = /^\s*:/.test(cell);
        const right = /:\s*$/.test(cell);
        if (left && right) return 'md-c';
        if (right) return 'md-r';
        if (left) return 'md-l';
        return '';
    }

    /* ---- 主解析 -------------------------------------------------------- */
    function toHtml(src) {
        const text = escapeHtml(String(src == null ? '' : src).replace(/\r\n?/g, '\n'));
        const lines = text.split('\n');

        // ① 预扫一遍 ATX 标题：拿 id（TOC 要用，正文渲染时按同样的顺序取）
        //    ★ 只认 ATX（# 式）；不认 === / --- 下划线式 —— 那种写法规则有歧义
        //      （单独一行 --- 既可能是标题下划线也可能是分隔线），README 里也几乎没人用。
        const headings = [];
        const usedIds = Object.create(null);
        let fence = false;
        for (let i = 0; i < lines.length; i++) {
            // ★ 必须和正文一样跳过围栏代码块：代码块里的 `# 假标题` 要是被预扫算进去，
            //   后面每个标题的 id 都会错位一格（锚点和目录就全指向错地方了 ✗）
            if (RE_FENCE.test(lines[i])) { fence = !fence; continue; }
            if (fence) continue;
            const m = RE_ATX.exec(lines[i]);
            if (!m) continue;
            const level = m[1].length;
            const title = m[2];
            const base = slug(title) || ('section-' + (headings.length + 1));
            let id = base, n = 1;
            while (usedIds[id]) { id = base + '-' + n; n++; }
            usedIds[id] = true;
            headings.push({ level: level, id: id, text: inline(title) });
        }

        // ② 正文
        const out = [];
        let para = [];
        let quote = [];
        const listStack = [];          // [{ tag:'ul'|'ol', indent }]
        let headingCursor = 0;
        let i = 0;

        function flushPara() {
            if (!para.length) return;
            let html = '';
            for (let k = 0; k < para.length; k++) {
                // ★ 硬换行看的是**上一行**结尾有没有两个空格（不是当前行）
                const prevHard = k > 0 && / {2,}$/.test(para[k - 1]);
                const t = para[k].replace(/ {2,}$/, '');
                html += (k ? (prevHard ? '<br>\n' : '\n') : '') + inline(t);
            }
            out.push('<p>' + html + '</p>');
            para = [];
        }
        function closeItem() {
            const top = listStack[listStack.length - 1];
            if (top && top.li) { out.push('</li>'); top.li = false; }
        }
        function closeLists(toIndent) {
            while (listStack.length && listStack[listStack.length - 1].indent > toIndent) {
                closeItem();
                out.push(listStack.pop().tag === 'ol' ? '</ol>' : '</ul>');
            }
        }
        function closeAllLists() { closeLists(-1); }
        function flushQuote() {
            if (!quote.length) return;
            const groups = [[]];
            quote.forEach(function (l) {
                if (!l.trim()) { if (groups[groups.length - 1].length) groups.push([]); return; }
                groups[groups.length - 1].push(l);
            });
            const html = groups.filter(function (g) { return g.length; })
                .map(function (g) { return '<p>' + g.map(inline).join('<br>\n') + '</p>'; })
                .join('\n');
            out.push('<blockquote>\n' + html + '\n</blockquote>');
            quote = [];
        }
        function flushBlocks() { flushPara(); closeAllLists(); flushQuote(); }

        function tocHtml() {
            if (!headings.length) return '';
            // 先按层级搭成树，再递归输出 —— 比"边走边开关标签"那种写法可靠得多
            const root = { children: [] };
            const stack = [root];
            headings.forEach(function (h) {
                const lv = Math.min(h.level, 6);
                while (stack.length > 1 && stack[stack.length - 1].level >= lv) stack.pop();
                const node = { level: lv, id: h.id, text: h.text, children: [] };
                stack[stack.length - 1].children.push(node);
                stack.push(node);
            });
            const render = function (node) {
                if (!node.children.length) return '';
                return '<ul class="md-toc">\n' + node.children.map(function (c) {
                    return '<li class="md-toc-l' + c.level + '">' +
                        '<a href="#' + c.id + '">' + c.text + '</a>' + render(c) + '</li>';
                }).join('\n') + '\n</ul>';
            };
            return render(root);
        }

        for (i = 0; i < lines.length; i++) {
            const line = lines[i];

            // 围栏代码块
            const fence = RE_FENCE.exec(line);
            if (fence) {
                flushBlocks();
                const close = fence[1];
                const lang = fence[2] || '';
                const buf = [];
                i++;
                while (i < lines.length && !new RegExp('^\\s*' + close).test(lines[i])) { buf.push(lines[i]); i++; }
                out.push('<pre class="md-code"' + (lang ? ' data-lang="' + lang + '"' : '') + '><code>' +
                    buf.join('\n') + '</code></pre>');
                continue;
            }

            // 空行
            if (!line.trim()) { flushBlocks(); continue; }

            // 标题（ATX）
            const atx = RE_ATX.exec(line);
            if (atx) {
                flushBlocks();
                const h = headings[headingCursor++] || { id: '', text: inline(atx[2]) };
                out.push('<h' + atx[1].length + ' id="' + h.id + '">' + inline(atx[2]) + '</h' + atx[1].length + '>');
                continue;
            }

            // 分隔线
            if (RE_HR.test(line)) { flushBlocks(); out.push('<hr>'); continue; }

            // 目录
            if (RE_TOC.test(line)) { flushBlocks(); out.push(tocHtml()); continue; }

            // 引用
            const q = RE_QUOTE.exec(line);
            if (q) { flushPara(); closeAllLists(); quote.push(q[1]); continue; }
            if (quote.length) flushQuote();

            // 表格：当前行有 | 且下一行是分隔行
            if (HAS_PIPE.test(line) && i + 1 < lines.length && isDelimRow(lines[i + 1])) {
                flushBlocks();
                const head = splitRow(line);
                const delims = splitRow(lines[i + 1]);
                const aligns = head.map(function (_, k) { return alignOf(delims[k] || ''); });
                let html = '<table class="md-table">\n<thead>\n<tr>';
                head.forEach(function (c, k) {
                    html += '<th' + (aligns[k] ? ' class="' + aligns[k] + '"' : '') + '>' + inline(c) + '</th>';
                });
                html += '</tr>\n</thead>\n<tbody>\n';
                i += 2;
                while (i < lines.length && lines[i].trim() && HAS_PIPE.test(lines[i])) {
                    const cells = splitRow(lines[i]);
                    html += '<tr>';
                    for (let k = 0; k < head.length; k++) {
                        html += '<td' + (aligns[k] ? ' class="' + aligns[k] + '"' : '') + '>' +
                            inline(cells[k] == null ? '' : cells[k]) + '</td>';
                    }
                    html += '</tr>\n';
                    i++;
                }
                i--;
                html += '</tbody>\n</table>';
                out.push(html);
                continue;
            }

            // 列表项
            const ul = RE_UL.exec(line), ol = RE_OL.exec(line);
            if (ul || ol) {
                flushPara();
                const indent = (ul ? ul[1] : ol[1]).replace(/\t/g, '    ').length;
                const tag = ul ? 'ul' : 'ol';
                let rest = ul ? ul[2] : ol[2];

                closeLists(indent);                    // 先关掉所有比这一层更深的列表
                const top = listStack[listStack.length - 1];
                if (!top || top.indent < indent) {
                    // 新的一层 —— ★ 直接嵌在父项里面（不能先 closeItem，
                    //   否则会变成 <ul><li>a</ul><ul>…</ul> 这种非法结构）
                    out.push('<' + tag + '>');
                    listStack.push({ tag: tag, indent: indent, li: false });
                } else if (top.tag !== tag) {
                    // 同一层换类型（ul ↔ ol）→ 关旧开新
                    closeItem();
                    out.push('</' + top.tag + '>');
                    listStack.pop();
                    out.push('<' + tag + '>');
                    listStack.push({ tag: tag, indent: indent, li: false });
                } else {
                    closeItem();                       // 同层同类 → 关掉上一项
                }

                let checkbox = '';
                const task = RE_TASK.exec(rest);
                if (task) {
                    const done = task[1].toLowerCase() === 'x';
                    checkbox = '<input type="checkbox" disabled' + (done ? ' checked' : '') + '> ';
                    rest = task[2];
                }
                closeItem();
                out.push('<li' + (task ? ' class="md-task"' : '') + '>' + checkbox + inline(rest));
                listStack[listStack.length - 1].li = true;
                continue;
            }

            // 普通段落行
            para.push(line);
        }

        flushBlocks();
        return out.join('\n');
    }

    global.Markdown = { toHtml: toHtml, slug: slug, escapeHtml: escapeHtml, safeUrl: safeUrl };

})(typeof window !== 'undefined' ? window : globalThis);
