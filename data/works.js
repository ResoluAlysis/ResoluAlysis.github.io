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
   ============================================================ */
window.WORKS = [

    /* ---------- Unity WebGL ---------- */
    {
        id: 'boom-shooting',
        no: '01',
        kind: 'unity',
        title: 'Boom Shooting',
        subtitle: '第三人称射击原型',
        year: '2024',
        src: 'assets/unityGame/BoomShooting/index.html',
        cover: 'assets/images/_test.jpg',
        weight: '14.2 MB / 15 个文件',
        tags: ['Unity', 'C#', 'WebGL'],
        placeholder: true,
        desc: '占位描述：一句话说清玩什么、你负责了什么、最难的一处是什么。'
            + '建议 2~3 行，太长的说明放下面 detail。',
        detail: [
            '占位：玩法与操作说明。',
            '占位：技术难点 / 踩过的坑。',
            '占位：如果这不是你独立完成的，写清分工。',
        ],
    },
    {
        id: 'fission',
        no: '02',
        kind: 'unity',
        title: 'Fission',
        subtitle: '解谜原型',
        year: '2024',
        src: 'assets/unityGame/Fission/index.html',
        cover: 'assets/images/_test.jpg',
        weight: '23.2 MB / 23 个文件',
        tags: ['Unity', 'C#', 'WebGL'],
        placeholder: true,
        desc: '占位描述：这一套构建比 Boom Shooting 大一倍，首次载入会更慢，'
            + '正好用来验证惰性加载有没有生效。',
        detail: [
            '占位：玩法与操作说明。',
            '占位：技术难点 / 踩过的坑。',
        ],
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