/* ============================================================
   浮窗：作品查看器
   ------------------------------------------------------------
   为什么是 <dialog> 而不是自绘 div：
     · showModal() 自带「焦点陷阱 + 背景 inert + ESC 关闭 + 焦点归还」，
       这四件事自己写要好几百行，还极容易漏掉 aria。
     · 它在 top layer 里 —— 天然盖住全站所有 z-index（准星 9997、
       刻度尺 99999、粒子 9996），不用再跟满页的层叠去打架。

   这个文件负责四件事：
     1. 惰性注入 Unity iframe —— 打开才建、关闭就销毁（WebGL 上下文
        很贵：一个构建 14~23MB，两套一起留着会吃显存、还会掉帧）；
     2. 开关动画 —— 能用 View Transitions 就用，否则退回 CSS 过渡；
     3. 打开期间接管光标 —— 全站是 cursor: none，靠自定义准星；
        iframe 里的鼠标事件不会冒泡到父页面，准星会「卡住」，
        所以打开浮窗时把准星藏掉、把系统光标还回来；
     4. 打开期间停掉 World 主循环（面板后面那些粒子/时钟不用白跑）。
   ============================================================ */
window.WorkWindow = (function () {
    'use strict';

    /* ============================================================
       ★ 总开关（当前：禁用）
       ------------------------------------------------------------
       false = 整个浮窗系统不启用：脚本照旧加载，但不注册任何监听、
       点卡片 / 面板没有任何反应。想恢复就把下面这行改成 true。

       关掉之后仍然存在的东西（都是惰性的，不需要清理）：
         · index.html 里的 <dialog id="work-window">（没有 open 属性，
           永远 display:none）；卡片上的 data-work / role="button"；
         · css/style.css 第 8 节「浮窗」整段；
         · data/works.js 与 World.pause/resume（只被这里用到）。
       ============================================================ */
    const ENABLED = false;

    if (!ENABLED) {
        /* 给外部一个同样形状的空壳，免得谁调 WorkWindow.open() 时报 undefined */
        return {
            open() {}, close() {},
            ids() { return []; },
            get isOpen() { return false; },
            get current() { return null; },
        };
    }
    const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)');

    const dialog = document.getElementById('work-window');
    if (!dialog) {
        console.warn('[WorkWindow] 没找到 #work-window，浮窗未启用');
        return { open() {}, close() {}, get isOpen() { return false; } };
    }

    const bodyEl  = dialog.querySelector('[data-win="body"]');
    const titleEl = dialog.querySelector('.win-title');
    const noEl    = dialog.querySelector('.win-no');
    const extEl   = dialog.querySelector('.win-ext');
    const badgeEl = dialog.querySelector('.win-badge');
    const panelEl = dialog.querySelector('.win-panel');

    let works = [];
    let byId  = new Map();
    let current  = null;
    let frameEl  = null;      // 当前 Unity iframe
    let zoomEl   = null;      // 图片放大层（懒建）

    /* ---------- 小工具 ---------- */
    function h(tag, attrs, children) {
        const el = document.createElement(tag);
        if (attrs) {
            for (const k in attrs) {
                const v = attrs[k];
                if (v == null || v === false) continue;
                if (k === 'class') el.className = v;
                else if (k === 'text') el.textContent = v;
                else if (k === 'dataset') Object.assign(el.dataset, v);
                else if (v === true) el.setAttribute(k, '');
                else el.setAttribute(k, v);
            }
        }
        if (children != null) {
            (Array.isArray(children) ? children : [children]).forEach(function (c) {
                if (c == null || c === false) return;
                el.append(c.nodeType ? c : document.createTextNode(String(c)));
            });
        }
        return el;
    }

    function raf2(fn) { requestAnimationFrame(function () { requestAnimationFrame(fn); }); }

    function canVT() {
        return typeof document.startViewTransition === 'function' && !REDUCE.matches;
    }

    /* ---------- 数据 ---------- */
    function boot() {
        works = Array.isArray(window.WORKS) ? window.WORKS : [];
        byId = new Map();
        works.forEach(function (w) { if (w && w.id) byId.set(w.id, w); });
        if (!works.length) console.warn('[WorkWindow] window.WORKS 是空的，检查 data/works.js 有没有先加载');
    }

    /* ---------- 头部信息（所有 kind 共用） ---------- */
    function renderInfo(work, collapsed) {
        const meta = h('p', { class: 'win-meta' }, [
            work.year, work.weight, (work.tags || []).join(' / '),
        ].filter(Boolean).join('   ·   '));

        const inner = [meta];
        if (work.desc) inner.push(h('p', { class: 'win-desc', text: work.desc }));
        if (Array.isArray(work.detail) && work.detail.length) {
            inner.push(h('ul', { class: 'win-detail' },
                work.detail.map(function (d) { return h('li', { text: d }); })));
        }
        if (work.hint) inner.push(h('p', { class: 'win-hint', text: work.hint }));

        if (!collapsed) return h('div', { class: 'win-info' }, inner);

        /* Unity 的 stage 要占满高度，所以信息折进一个 <details> 里，
           需要的时候再展开 —— 原生折叠，不用写一行 JS。 */
        return h('details', { class: 'win-info win-info-fold' }, [
            h('summary', null, '说明 / 元信息'),
            h('div', { class: 'win-info-body' }, inner),
        ]);
    }

    /* ============================================================
       kind: unity —— 惰性 iframe
       ============================================================ */
    function renderUnity(work) {
        const loading = h('div', { class: 'win-loading' }, [
            h('span', { class: 'win-loading-bar' }),
            h('p', { text: '正在载入 Unity 构建…' }),
            h('p', { class: 'win-loading-size', text: (work.weight || '') + '（首次打开才下载）' }),
        ]);

        const frame = document.createElement('iframe');
        frame.className = 'win-frame';
        frame.title = work.title;
        frame.src = work.src;
        frame.setAttribute('allow', 'fullscreen; gamepad; autoplay; xr-spatial-tracking; cross-origin-isolated');
        frame.setAttribute('allowfullscreen', '');
        frame.addEventListener('load', function () {
            stageFrame.classList.add('is-ready');
        });
        frameEl = frame;

        const stageFrame = h('div', { class: 'win-stage-frame' }, [loading, frame]);

        const bar = h('div', { class: 'win-stage-bar' }, [
            h('span', { class: 'win-stage-note', text: 'Unity WebGL · ' + (work.weight || '') }),
            h('button', {
                class: 'win-btn', type: 'button', dataset: { win: 'reload' },
                title: '重新载入构建',
            }, '重新载入'),
        ]);

        return h('div', { class: 'win-stage win-stage-unity' }, [
            bar, stageFrame, renderInfo(work, true),
        ]);
    }

    /* ============================================================
       kind: gallery —— 图片网格 + 点开大图
       ============================================================ */
    function renderGallery(work) {
        const shots = work.shots || [];
        const grid = h('div', { class: 'win-grid' }, shots.map(function (s) {
            return h('figure', {
                class: 'win-shot', dataset: { src: s.src, caption: s.caption || '' },
                tabindex: '0', role: 'button', 'aria-label': '放大：' + (s.caption || s.src),
            }, [
                h('img', { src: s.src, alt: s.caption || '', loading: 'lazy', decoding: 'async' }),
                s.caption ? h('figcaption', { text: s.caption }) : null,
            ]);
        }));

        return h('div', { class: 'win-stage' }, [grid, renderInfo(work, false)]);
    }

    /* ============================================================
       kind: audio
       ============================================================ */
    function renderAudio(work) {
        const tracks = work.tracks || [];
        const audio = h('audio', { controls: true, preload: 'none' });
        const list = h('div', { class: 'win-tracks' }, tracks.map(function (t) {
            return h('button', {
                class: 'win-track', type: 'button',
                dataset: { src: t.src }, 'aria-label': '播放：' + t.title,
            }, [
                h('span', { class: 'win-track-title', text: t.title }),
                h('span', { class: 'win-track-note', text: t.note || '' }),
            ]);
        }));
        list.addEventListener('click', function (e) {
            const btn = e.target.closest('.win-track');
            if (!btn) return;
            list.querySelectorAll('.win-track').forEach(function (b) {
                b.classList.toggle('is-playing', b === btn);
            });
            audio.src = btn.dataset.src;
            audio.play().catch(function () { /* 浏览器可能挡自动播放，用户再点一次就行 */ });
        });

        return h('div', { class: 'win-stage' }, [list, audio, renderInfo(work, false)]);
    }

    /* ============================================================
       kind: list —— 分类页，点开另一件作品
       ============================================================ */
    function renderList(work) {
        const items = (work.items || []).map(function (id) { return byId.get(id); })
            .filter(Boolean);

        const list = h('div', { class: 'win-list' }, items.map(function (w) {
            return h('button', {
                class: 'win-list-item', type: 'button', dataset: { work: w.id },
            }, [
                h('span', { class: 'win-list-no', text: w.no || '' }),
                h('span', { class: 'win-list-main' }, [
                    h('span', { class: 'win-list-title', text: w.title }),
                    h('span', { class: 'win-list-sub', text: w.subtitle || '' }),
                ]),
                h('span', { class: 'win-list-go', text: '打开 →' }),
            ]);
        }));

        return h('div', { class: 'win-stage' }, [list, renderInfo(work, false)]);
    }

    const RENDERERS = {
        unity: renderUnity,
        gallery: renderGallery,
        audio: renderAudio,
        list: renderList,
    };

    /* ---------- 渲染一整个作品 ---------- */
    function render(work) {
        frameEl = null;                       // 旧 iframe 随 replaceChildren 一起走
        hideZoom();

        titleEl.textContent = work.title || '未命名';
        noEl.textContent = work.no || '--';
        badgeEl.hidden = !work.placeholder;
        extEl.hidden = work.kind !== 'unity';
        if (work.kind === 'unity') extEl.href = work.src;

        bodyEl.dataset.kind = work.kind || 'gallery';
        const fn = RENDERERS[work.kind] || renderGallery;
        bodyEl.replaceChildren(fn(work));

        /* 打开后焦点落在面板上（不是关闭按钮）—— 屏幕阅读器会先念标题；
           关闭按钮用 Tab 一步就到。 */
        panelEl.setAttribute('tabindex', '-1');
    }

    /* ============================================================
       图片放大层：懒建，挂在 .win-panel 里（不是 dialog 上，
       因为 dialog 自己就是整个视口，挂上去会跟 scrim 抢层）
       ============================================================ */
    function ensureZoom() {
        if (zoomEl) return zoomEl;
        zoomEl = h('div', { class: 'win-zoom', hidden: true }, [
            h('img', { class: 'win-zoom-img', alt: '' }),
        ]);
        zoomEl.addEventListener('click', hideZoom);
        panelEl.append(zoomEl);
        return zoomEl;
    }
    function showZoom(src, caption) {
        const z = ensureZoom();
        const img = z.querySelector('img');
        img.src = src;
        img.alt = caption || '';
        z.hidden = false;
    }
    function hideZoom() {
        if (!zoomEl || zoomEl.hidden) return;
        zoomEl.hidden = true;
        zoomEl.querySelector('img').removeAttribute('src');
    }

    /* ============================================================
       打开 / 关闭
       ============================================================ */
    function show() {
        document.body.classList.add('window-open');
        if (window.World && World.pause) World.pause();   // 面板后面不用白跑 rAF

        if (!canVT()) {
            dialog.showModal();
            if (REDUCE.matches) dialog.classList.add('is-in');
            else raf2(function () { dialog.classList.add('is-in'); });
            return;
        }
        try {
            document.startViewTransition(function () {
                dialog.showModal();
                dialog.classList.add('is-in');
            });
        } catch (e) {
            dialog.showModal();
            dialog.classList.add('is-in');
        }
    }

    function close() {
        if (!dialog.open) return;
        hideZoom();

        if (!canVT()) {
            if (REDUCE.matches) { dialog.close(); return; }
            /* 退场：先撤 is-in，等 CSS 过渡跑完再真的关 ——
               close() 一调用元素就没了，来不及演 */
            dialog.classList.remove('is-in');
            setTimeout(function () { if (dialog.open) dialog.close(); }, 240);
            return;
        }
        document.startViewTransition(function () {
            dialog.classList.remove('is-in');
            dialog.close();
        });
    }

    function open(id) {
        const work = byId.get(id);
        if (!work) { console.warn('[WorkWindow] 未知作品 id:', id); return; }

        if (!dialog.open) {
            current = work;
            render(work);
            show();
        } else if (current !== work) {
            /* 已经在浮窗里（比如从"游戏开发"分类点进某一件）：
               就地换内容，不重播开关动画 */
            current = work;
            render(work);
        }
    }

    /* 关闭必须统一走 close 事件：ESC、点 scrim、点关闭按钮、
       close() 自己调用 —— 四条路都会到这里，清理只写一遍。 */
    dialog.addEventListener('close', function () {
        dialog.classList.remove('is-in');
        hideZoom();
        bodyEl.replaceChildren();       // ★ 拔掉 iframe → 释放 WebGL 上下文
        frameEl = null;
        current = null;
        document.body.classList.remove('window-open');
        if (window.World && World.resume) World.resume();
        document.dispatchEvent(new CustomEvent('workwindow:close'));
    });

    /* ESC：先关放大层，否则做退场动画（不 preventDefault 的话
       ESC 会让 dialog 瞬间消失，看不到过渡） */
    dialog.addEventListener('cancel', function (e) {
        e.preventDefault();
        if (zoomEl && !zoomEl.hidden) { hideZoom(); return; }
        close();
    });

    /* 浮窗自己的按钮 */
    dialog.addEventListener('click', function (e) {
        const el = e.target instanceof Element ? e.target.closest('[data-win]') : null;
        if (!el) return;
        const act = el.dataset.win;
        if (act === 'close') close();
        else if (act === 'reload' && frameEl) frameEl.src = frameEl.src;
    });

    /* ============================================================
       触发：全站任何 [data-work] 都能开浮窗
       （用委托，不改卡片自己的结构，以后 JS 动态加的也算）
       ============================================================ */
    document.addEventListener('click', function (e) {
        if (!(e.target instanceof Element)) return;
        const el = e.target.closest('[data-work]');
        if (!el || el.closest('#work-window')) return;   // 浮窗内部的按钮自己处理
        e.preventDefault();
        open(el.dataset.work);
    });

    /* 卡片是 role=button，回车/空格要能开 */
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (!(e.target instanceof Element)) return;
        const el = e.target.closest('[data-work]');
        if (!el || el.closest('#work-window')) return;
        if (el.tagName === 'BUTTON' || el.tagName === 'A') return;   // 原生的自己会触发
        e.preventDefault();
        open(el.dataset.work);
    });

    /* 图片网格：点图放大（同样是委托，渲染完不用重新绑） */
    bodyEl.addEventListener('click', function (e) {
        const fig = e.target instanceof Element ? e.target.closest('.win-shot') : null;
        if (!fig) return;
        showZoom(fig.dataset.src, fig.dataset.caption);
    });
    bodyEl.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const fig = e.target instanceof Element ? e.target.closest('.win-shot') : null;
        if (!fig) return;
        e.preventDefault();
        showZoom(fig.dataset.src, fig.dataset.caption);
    });

    boot();

    return {
        open: open,
        close: close,
        ids: function () { return works.map(function (w) { return w.id; }); },
        get isOpen() { return dialog.open; },
        get current() { return current; },
    };
})();