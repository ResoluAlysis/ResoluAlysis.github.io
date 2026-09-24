/* ============================================================
   作品数据（唯一数据源）
   ------------------------------------------------------------
   浮窗系统（js/floating-window.js）只认这个文件，不认 DOM。
   加一件作品 = 在数组里加一个对象；HTML 那边只写 data-work="id"。

   kind 四种：
     unity    → 惰性注入 <iframe>，关闭时销毁（WebGL 上下文很贵，
                留着会占显存、而且多个上下文一起跑会掉帧）
     gallery  → 图片网格，点开大图
     audio    → <audio> + 曲目列表
     list     → 一列按钮，点开另一件作品（用来做"分类页"）

   ★ placeholder: true 表示文案 / 图片还是占位（assets/ 里现在只有
     _test.jpg / _test.mp3）。浮窗会在标题旁挂一个「占位」角标，
     免得自己以后当成成品。真实素材就位时把这一项删掉即可。

   ★ 构建体积（weight）是手写的，因为浏览器拿不到目录体积；
     换构建后记得回来改这一行。

   ★★ 游玩注意（noticeOn / notice）—— 只有 kind: 'unity' 的条目用得上：
      noticeOn: false → 游乐区里那块「游玩注意」整块不出现（默认）；
      notice: 一段话，或一列段落（['第一段', '第二段']）。
      写得出来的场景：某个操作被浏览器抢走了、必须全屏才准、首次载入很慢……
      ★ 改这里的文字**必须**跑一次 node _dev/subset-font.js ——
        字体是子集化的，新字不在子集里会**静默**回退成系统字体
        （不报错，只是那一行字形不一样）；自检 [2b] 会把缺字喊出来。

   ★★ 快捷键拦截开关（keyGuardOn）—— 同样只有 kind: 'unity' 用得上：
      false / 不写 → 什么都不拦（**默认**：浏览器该刷新就刷新、该弹菜单就弹菜单）；
      true        → 玩游戏期间不让浏览器抢输入：
                     · 带 Ctrl / Cmd / Alt 的组合键 + F1-F10 都交给游戏
                       （Ctrl+W 关标签、F11 全屏、F12 控制台**故意留着**当逃生口）；
                     · 游戏里的右键不再弹出浏览器的右键菜单。
      哪些键浏览器至死不放（Ctrl+T / Ctrl+N / Ctrl+1…9 / Alt+←→）写在
      js/sidebar.js 那段注释里 —— 开关也管不了它们。
      ★ 改这一项后**重开一局**才生效（开关在按「开始游戏」那一刻抄走）。

   ★★ 游戏详细页 README（readme）—— 只有 kind: 'unity' 用得上：
      写一个 .md 的路径（相对站点根目录，放 data/readmes/ 下最省事）→ 选中这张
      卡带时，游乐区那块"说明书"就变成一页可滚动的 README ✓；
      不写 / 取不到 → 退回 detail 数组（页面永远不会空 ✓）。
      支持：标题/段落/粗斜体/删除线/行内代码/代码块/有序无序列表/任务列表/
            链接/图片/引用/分隔线/GFM 表格/单独一行 [TOC] → 自动目录 ✓
      （解析器 js/markdown.js；**内联 HTML 不生效**，会原样显示 ✓）
      ★★ 字体分工：**标题和表头**走站里的展示字体、**正文**走系统字体
         ⇒ 所以改 .md 的**标题/表头**文字要跑一次 node _dev/subset-font.js；
           正文随便写（系统字体，不吃子集）。自检 [2b] 会拦下漏裁的标题字 ✓。

   ★★ 卡带图标（icon）—— 只有 kind: 'unity' 用得上：
      写一个图片路径（相对站点根目录）→ 游乐区左边那张卡带上会**铺**这张图：
      80% 透明度、上下撑满、超出卡带圆角的部分裁掉（CSS object-fit: cover）；
      不写 / 留空 / **文件不存在** → 那张卡带就是一块**纯色**（--bg-alt，不透明）✓。
      ★ "文件不存在"是浏览器加载失败（img.onerror）时把图摘掉判出来的 ——
        路径写错**不会报错**，只是静默退回纯色；想确认就去游乐区看一眼那张卡带。
      ★ 图标是**装饰**：空 alt、不进 tab 顺序、不吃指针事件
        （卡带自己实现的拖拽不受影响，见 js/sidebar.js 的 makeCart）。
   ============================================================ */
window.WORKS = [

    /* ---------- Unity WebGL ---------- */

    {
        id: 'md样式',
        no: '00',
        kind: 'unity',
        title: 'md样式',
        subtitle: '',
        year: '',
        src: '',
        cover: '',
        icon: '',
        weight: '',
        tags: [],
        placeholder: true,
        desc: '这个是 README 样式参考...'
            + '',
        detail: [
            '',
            '',
        ],
        readme: 'data/readmes/_syntax.md',
        noticeOn: false,
        notice: [
            '',
            '',
        ],
        keyGuardOn: true,
    },

    {
        id: 'boom-shooting',
        no: '01',
        kind: 'unity',
        title: 'Boom Shooting',
        subtitle: '',
        year: '2026',
        src: 'assets/unityGame/BoomShooting/index.html',
        cover: 'assets/images/_test.jpg',
        icon: 'assets/images/_test.jpg',
        weight: '14.2 MB / 15 个文件',
        tags: ['Unity', 'C#', 'WebGL'],
        placeholder: true,
        desc: 'Boom Shooting - "敌人的威胁程度直接与玩家操作水平挂钩"',
        detail: [
            '游戏玩法：',
            '移动：WASD；射击：鼠标左键',
            '占位：玩法与操作说明。',
            '占位：技术难点 / 踩过的坑。',
            '占位：如果这不是你独立完成的，写清分工。',
        ],
        readme: 'data/readmes/boom-shooting.md',
        /* 游玩注意：开关在 noticeOn，内容在 notice。默认关着；
           打开只需把 false 改成 true（这段文字已经写好了，先用鼠标换操作）。 */
        noticeOn: true,
        notice: [
            '浏览器把 Ctrl+T / Ctrl+1 这类键留给了自己，游戏收不到 —— 这些操作请改用鼠标。',
        ],
        /* 快捷键拦截：true = 玩游戏时把键从浏览器手里要回来（见文件头说明）。
           ★ 你刚验过 Ctrl+R 已经归游戏了，所以这里显式写着 true；
             想要"浏览器优先"就改成 false / 删掉这一行（那就是默认行为）。 */
        keyGuardOn: true,
    },
    {
        id: 'fission',
        no: '02',
        kind: 'unity',
        title: 'Fission',
        subtitle: '',
        year: '2024',
        src: 'assets/unityGame/Fission/index.html',
        cover: 'assets/images/_test.jpg',
        icon: 'assets/images/_test.jpg',
        weight: '23.2 MB / 23 个文件',
        tags: ['Unity', 'C#', 'WebGL'],
        placeholder: true,
        desc: 'Fission - “经典弹幕游戏”',
        detail: [
            '占位：玩法与操作说明。',
            '占位：技术难点 / 踩过的坑。',
        ],
        readme: 'data/readmes/fission.md',
        noticeOn: true,
        notice: [
            '该游戏使用长按鼠标右键控制角色移动，若需体验请将该网站加入“浏览器鼠标手势”白名单...',
        ],
        keyGuardOn: true,
    },
    {
        id: 'semarlog',
        no: '03',
        kind: 'unity',
        title: 'SEMARLog',
        subtitle: '',
        year: '2025',
        src: 'assets/unityGame/SEMARLog/index.html',
        cover: 'assets/images/_test.jpg',
        icon: 'assets/images/_test.jpg',
        weight: '暂未',
        tags: ['Unity', 'C#', 'WebGL' , 'Mirror'],
        placeholder: true,
        desc: '占位描述：'
            + '',
        detail: [
            '占位：玩法与操作说明。',
            '占位：技术难点 / 踩过的坑。',
        ],
        readme: 'data/readmes/semarlog.md',
        noticeOn: false,
        notice: [
            '',
            '',
        ],
        keyGuardOn: true,
    },
    {
        id: 'refactor',
        no: '04',
        kind: 'unity',
        title: 'Refactor',
        subtitle: '',
        year: '2025',
        src: 'assets/unityGame/Refactor/index.html',
        cover: 'assets/images/_test.jpg',
        icon: 'assets/images/_test.jpg',
        weight: '暂未',
        tags: ['Unity', 'C#', 'WebGL' , 'Mirror'],
        placeholder: true,
        desc: '占位描述：'
            + '',
        detail: [
            '占位：玩法与操作说明。',
            '占位：技术难点 / 踩过的坑。',
        ],
        /* 游戏详细页 = 一页 README（P91）：写 .md 的路径就渲染它；
           没写 / 取不到 → 退回上面的 detail（页面不会空）。见文件头说明。 */
        readme: 'data/readmes/refactor.md',
        noticeOn: false,
        notice: [
            '',
            '',
        ],
        keyGuardOn: true,
    },

    /* ---------- 图片 ---------- */
    {
        id: 'art-draw',
        no: '03',
        kind: 'gallery',
        title: '绘画',
        subtitle: '手绘 / 速写 / 数字绘画',
        year: '2016 -',
        cover: 'assets/images/_test.jpg',
        tags: ['手绘', '数字绘画'],
        placeholder: true,
        desc: '占位描述：这里的图全是 assets/images/_test.jpg，'
            + '换成真图后把 shots 里的每一项 src / caption 改掉即可。',
        shots: [
            { src: 'assets/images/_test.jpg', caption: '占位图 1' },
            { src: 'assets/images/_test_1.jpg', caption: '占位图 2' }
        ],
        hint: '把作品图丢进 assets/images/，然后在 data/works.js 的 shots 里加一行：'
            + "{ src: 'assets/images/xxx.jpg', caption: '标题' }",
    },
    {
        id: 'art-model',
        no: '04',
        kind: 'gallery',
        title: '建模',
        subtitle: 'Blender / 硬表面 / 场景搭建',
        year: '2018 -',
        cover: 'assets/images/_test.jpg',
        tags: ['Blender', '硬表面'],
        placeholder: true,
        desc: '占位描述：硬表面与场景搭建的渲染图。',
        shots: [
            { src: 'assets/images/_test.jpg', caption: '占位图 1' },
        ],
        hint: '同上：shots 里继续加对象即可，网格会自动排。',
    },

    /* ---------- 音频 ---------- */
    {
        id: 'music',
        no: '05',
        kind: 'audio',
        title: '编曲',
        subtitle: '作曲 / 编曲 / 混音',
        year: '2020 -',
        cover: 'assets/images/_test.jpg',
        tags: ['作曲', '编曲', '混音'],
        placeholder: true,
        desc: '占位描述：这里现在放的是 assets/audio/_test.mp3，'
            + '它不是我的作品，只是用来验证播放器能跑通。',
        tracks: [
            { title: '占位曲目 1', src: 'assets/audio/_test.mp3', note: '测试音频' },
        ],
    },

    /* ---------- 分类页（list）：点进去开另一件作品 ---------- */
    {
        id: 'games',
        no: '06',
        kind: 'list',
        title: '游戏开发',
        subtitle: 'Unity / C# / 玩法原型',
        year: '2021 -',
        cover: 'assets/images/_test.jpg',
        tags: ['Unity', 'C#'],
        placeholder: false,
        desc: '两套 WebGL 构建。第一次点开才下载，关掉就释放 —— '
            + '不会一进首页就吃掉 37MB。',
        items: ['boom-shooting', 'fission'],
    },

];