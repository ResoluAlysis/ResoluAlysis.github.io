# ResoluAlysis 个人页 — P0 修复记录

本目录是原始文件的一份**可运行副本**，只做了「先修 Bug」这一轮改动（不做性能重构、不改视觉风格）。
目录结构与原项目一致：

```
index.html
css/style.css
js/  timeline.js  welcome.js  particles.js  fore-particles.js  blobs.js
     mosaic.js  main.js  rulers.js  guides.js  colck.js
     circle-parallax.js  theme-toggle.js
```

把文件覆盖回你的项目即可（`assets/` 里的字体、图片、音频不在本次改动范围内）。

---

## 0. 兼容基线

本次改动按 **Safari 15.4+（macOS 12.3 / iOS 15.4）** 为最低目标：

| 用到的特性 | Safari 起始版本 | 说明 |
|---|---|---|
| `100dvh` | 15.4 | 不支持的旧版会自动回落到上一行的 `100vh` |
| 独立 `translate` 属性 | 14.1 | 你原本就在用，保留 |
| `?.` / `??` | 13.1 | 保留 |
| `Element.getAnimations()`、`el.animate()` | 13.1 | 保留 |
| `-webkit-backdrop-filter` | 9 | 原本已带前缀，保留 |
| `-webkit-mask-composite` | 9.1 | 原本已带前缀，保留 |

**Safari 仍需你自己在真机上确认的两处**（我无法在浏览器里跑）：

1. **`filter: url(#goo)`**（`.liquid-bg`）—— Safari 对「用 SVG 滤镜作用于 HTML 元素」的支持一向比 Chrome 差，可能出现液态球不黏连、或是明显掉帧。如果观感不对，第一选择是把这一层在 Safari 关掉（见第 4 节）。
2. **`#foreground-particles { filter: blur(1px) }`** —— 全屏模糊叠在一张每帧重绘的 canvas 上，Safari 上开销很大。建议下一轮改成「画柔边 sprite」，或先删掉这行 CSS。

---

## 1. 这一轮修掉的问题

### `index.html`

| # | 问题 | 改动 |
|---|---|---|
| 1 | `.container.hero-box` 没有闭合标签，浏览器隐式补 `</div>`，DOM 里多出一个空的 flex 子项，hero 布局会漂 | 在 `</section>` 前补上 `</div>` |
| 2 | 主题在 `</body>` 前才由 JS 应用 → 刷新时先渲染深色再跳浅色（闪白） | `<head>` 里加同步引导脚本，在首次绘制前给 `<html>` 加 `light` 类；并支持无记录时跟随系统 `prefers-color-scheme` |
| 3 | `<div class="panel scanlines scanbeam">` —— 这三个 class 在 CSS 里**一个都不存在**（`scanlines` 那段是注释掉的），纯死代码 | 删除 |
| 4 | `<source type="audio/mp3">` 不是合法 MIME | 改成 `audio/mpeg` |
| 5 | 占位卡片 `href="#" target="_blank"` 会打开空白标签页 | 去掉 `target` |
| 6 | 外部链接缺 `rel` | GitHub 链接补 `rel="noopener noreferrer"` |

### `css/style.css`

| # | 问题 | 改动 |
|---|---|---|
| 7 | **`body::before` 缺 `position`** —— `inset` / `z-index` 对 static 元素无效，而 `::before` 是 0×0 的 inline 盒子，噪点层**从来没有被画出来过** | 加 `position: fixed; width: 100%; height: 100%` |
| 8 | 同一条 `background-image` 的 data URI 里 `<` `>` `#` `%` 全部未转义，Safari 对未转义字符更严格 | 改成 `;charset=utf-8,` + 全量百分号转义 |
| 9 | **`.page-zoom` 同时有 `transform`（动画 `forwards` 停在 `scale(1)`）和 `overflow: hidden` + `height: 100vh`** → 它成了所有 `position: fixed` 子元素的包含块，HUD 层（粒子 / 尺子 / 参考线 / 准星 / 圆环）其实是相对它定位的；移动端更因为 `overflow:hidden` 而**整页滚不动** | 新增 `body.intro-done .page-zoom { animation: none; transform: none; height: auto; overflow: visible }`，由 JS 在开屏结束/跳过时加类；移动端另有兜底覆盖 |
| 10 | `.digital-clock` 用 `font:` 简写但漏了 `font-size` → **整条声明非法被丢弃，Astron 数字字体从未生效** | 改为 `font-family:` |
| 11 | `.circle-ticks` 引用了 **并不存在的 `@keyframes circleReveal`**，那条 `animation` 一直是死声明（圆环能显示全靠 JS 的 WAAPI 兜着） | 删掉该声明，只留初始 `opacity: 0` |
| 12 | `.theme-toggle` 在 75px 导航里：`padding: 8px 12px` + 单字，内容盒只剩 9px，字会溢出 | `gap: 8px; padding: 6px 4px; justify-content: center` |
| 13 | `.footer` 是 `display:flex` **横向**排列，两行文字（`© - 2026` + `ResoluAlysis`）加起来远超 75px，加上 `white-space: nowrap` 必然溢出 | 改成 `flex-direction: column` + `gap: 2px` |
| 14 | 移动端 `.footer` 注释写着「页脚取消固定」，代码却仍是 `position: fixed` + 75px 宽，压住正文左下角 | 改为 `position: static; width: 100%` + 上边框 |
| 15 | 移动端仍执行 `.hero .container { transform: translateX(-37.5px) }`（那是为左侧导航做的补偿），导致 hero 内容整体偏左 | 移动端改为 `transform: none` |
| 16 | `#guide-layer` 没有任何初始透明度，而 JS 里 `visible` 初值是 `false` → 参考线一进页面就显示，G 键状态和视觉对不上 | CSS 加 `opacity: 0` + `transition`，JS 同步设初值 |
| 17 | iOS Safari 的 `100vh` 会被底部工具栏遮住 | `body` / `.page-zoom` / `.navbar` / `main` / `.section, .hero` 都补一行 `height: 100dvh` |

### `js/rulers.js`

| # | 问题 | 改动 |
|---|---|---|
| 18 | **`drawBottom` 写死 `h = 4`、`drawLeft` 写死 `w = 4`，同时 `setup()` 又把这些值写成内联 `style.height/width`，直接盖掉 CSS 的 28px / 40px** → 最长 14px 的主刻度被整片裁在画布外，长短刻度看起来完全一样，「刻度尺」这个核心视觉基本失效 | 尺寸改为从 CSS / 视口读取；`setup()` 只负责后备缓冲区，不再写内联样式（否则 resize 时读到的是旧值，画布再也不会跟着窗口变） |
| 19 | 移动端 CSS 已把刻度尺 `display:none`，JS 仍在空画 | `render()` 里加 `display` 判断 |

> **需要你确认的一处观感**：尺子现在真的宽/高 28px / 40px 了，而两个位置指示三角当初是按 4px 薄尺摆的，现在会落在尺子内部（不是外沿）。
> 若想让它贴外沿：`.ruler-marker-x { bottom: 5px }` → `28px`，`.ruler-marker-y { left: 5px }` → `40px`。

### `js/timeline.js` + `js/welcome.js`

| # | 问题 | 改动 |
|---|---|---|
| 20 | `timeline.js` 里配了 `welcomeIn.delay = 0.8`，但 `welcome.js` **从头到尾没读过 `IN.delay`**，字符动画实际从 0s 就开始（藏在渐显遮罩后面） | `welcome.js` 写入 `--welcome-in-delay`，CSS `.char` 的 `animation-delay` 加上它 |
| 21 | 时间线自相矛盾：`welcomeOut.delay = 1.5` **早于** 入场结束时间 `0.8 + 2.0 = 2.8s`（现在只是碰巧因为第 20 条 bug 才看着正常） | `welcomeOut.delay` 改为 `2.8`，并在注释里写明这个等式 |
| 22 | `el.addEventListener('animationend', ..., { once: true })` —— `.char` 上的 `charRise` 结束时事件会冒泡到 `el`，第一个冒上来的事件就把监听器消耗掉，`welcomeLeave` 永远不会被处理，整块 WELCOME 会**一直留在 DOM 里** | 改成具名回调 + 判断 `e.target === el && e.animationName === 'welcomeLeave'` |

### `js/main.js`

| # | 问题 | 改动 |
|---|---|---|
| 23 | `prefers-reduced-motion` 下 CSS 把动画压到 0.01ms（画面瞬间静止），但 `body.locked` 仍要等 `TOTAL` 秒才解除 → 用户盯着一个**既不能动也点不动**的页面近 5 秒 | 新增 `REDUCE_MOTION` 短路：直接跳到「已结束」状态 |
| 24 | 解锁逻辑散在 3 个 `setTimeout` 里，各自加 class / 删遮罩 | 抽出 `finishIntro()` 统一收尾，并在解锁时加上 `intro-done`（配合第 9 条交还 `transform`） |
| 25 | 所有 `a[href^="#"]` 被 `preventDefault()` 后改 `main.scrollLeft`，但移动端 `main` 是竖向排布、`scrollLeft` 恒为 0 → **移动端点导航完全没反应** | 加守卫：只有 `overflowX === "auto"`（横向模式）才接管，否则交给浏览器原生锚点 |

### `js/fore-particles.js`（这一层原本几乎等于「一层不可见 + 一次全屏模糊开销」）

| # | 问题 | 改动 |
|---|---|---|
| 26 | 算出来的 `alpha`（opacity × 层透明度 × 边缘淡出）**没有进入 `fill`**，`fill` 用的是常量 `rgba(0,0,0,0.1)` → 淡入淡出、边缘淡出全部失效 | `alpha` 真正参与 `fill`；新增 `alphaBase` 作为整体不透明度上限（想让前景更明显就调大它） |
| 27 | `shadowColor` 被拼成 `rgba(0,0,0,0.1, 0.42)` —— **5 个分量的非法字符串，赋值被浏览器忽略** → 发光也是坏的 | 拆成 `color`（纯 R,G,B）+ 正确的 `rgba(r,g,b,a)` |
| 28 | `beginPath()` + `arc()` 建了圆路径却从不 `fill`，实际用 `fillRect` 画方块；`CONFIG.blur` 从未使用 | 改为 `arc() + fill()`（观感会从**方块变成圆点**，这是唯一一处视觉变化，想改回方块就把 `ctx.fill()` 换回 `ctx.fillRect(px - p.r, p.y - p.r, p.r*2, p.r*2)`） |
| 29 | `LAYERS` 只有一项却写着「分三层视差」，且 `weight: 0.15` 让 85% 的随机数落空（靠 fallback 巧合工作）；`size: [10.0, 5.0]` 上下界写反 | `weight` 改为 `1.0` 并修正注释，`size` 改为 `[5.0, 10.0]` |
| 30 | 本意是「只在上下两条带内生成」，但 `update()` 做的是**整屏 y 轴环绕**，粒子迟早漂到屏幕中间并留在那 | 每颗粒子固定分配到上带或下带，在带内往返（`bandTop`） |
| 31 | 纯装饰层没有尊重降低动效偏好 | 顶部加 `prefers-reduced-motion` 短路 |

### 其他 JS

| # | 文件 | 问题 | 改动 |
|---|---|---|---|
| 32 | `theme-toggle.js` | 主题类挂在 `body` 上，`<head>` 引导脚本跑在 body 存在之前；`localStorage` 在隐私模式会抛错 | 类改挂 `<html>`（对应 CSS `:root.light`）；读写 `localStorage` 加 `try/catch`；补 `aria-pressed` / `aria-label` |
| 33 | `circle-parallax.js` | `circlesReveal` 里 `if (!T) return;` —— 一旦时间线缺失（或用户要求减少动效），而 CSS 初始 `opacity: 0`，圆环会**永远不可见** | 加兜底：无时间线 / 降低动效时直接把 `opacity` 设为 1 |
| 34 | `particles.js` | 纯装饰层没有尊重降低动效偏好 | 顶部加短路（和 `blobs.js` 保持一致） |

---

## 2. 我**没有**动的东西（留给下一轮，避免这次改动过大）

1. **性能重构**：9 个常驻 `requestAnimationFrame` 循环、每帧给几百个 mosaic 方块写 `--px`、`.mosaic-tile` 上滥用 `will-change`、`shadowBlur` 粒子、帧率相关的物理。这是下一轮性价比最高的一项（合并 ticker + 用单个 `--scroll-x` 驱动全部视差）。
2. **命名**：`splash-遮罩` / `splash-渐显` / `@keyframes body缩放` / `--colck`（拼错的 `clock`）仍然是中文/拼错标识符。语法合法，但一上压缩工具或换编码保存就危险。
3. **`colck.js` 的网络对时**：`syncInterval` 的指数退避算了但 `setInterval` 里写死 30 分钟，退避完全没用；`worldtimeapi.org` 经常挂、也会把访客 IP 给第三方。建议直接删掉网络对时。
4. **死代码**：`main.js` 里永不触发的 `frozen` + MutationObserver、`.shine`（CSS 里没有这个类）、空的 `contextmenu` 监听、`window.__themeTimer` 挂全局。
5. **`.section { justify-content: center; overflow-y: auto }`** 的经典坑：内容超过一屏时顶部会被裁且滚不到。修法有讲究（`safe center` 的 Safari 支持要看版本），所以没在这次动。
6. **可访问性 / SEO**：`* { cursor: none !important }` 全局禁用光标、`body { user-select: none }` 让访客无法复制你的简介、装饰性 canvas 缺 `aria-hidden`、`<img>` 分组缺 `alt`、缺 `description` / OG / favicon / theme-color。
7. **浮窗系统**：`<dialog>` + `inert` + 焦点归还 + Unity iframe 惰性注入 + `startViewTransition()`，以及 `data/works.js` 数据驱动卡片。

---

## 3. 建议的手动验证清单

- [ ] 桌面：开屏能正常播完并解锁；**按任意键 / 点击**跳过也正常
- [ ] 桌面：底部与左侧刻度尺**看得到长短刻度之分**（这是第 18 条的验收点）
- [ ] 桌面：拖动窗口大小，刻度尺跟着变（第 18 条后半段）
- [ ] 桌面：鼠标移动时两个位置指示三角跟随
- [ ] 桌面：按 `G` 键——初始应是**隐藏**的，按一次显示、再按隐藏
- [ ] 桌面：刷新页面时主题**不闪**
- [ ] 桌面：点导航 / hero 按钮，能横向平滑跳转
- [ ] 桌面：把系统设为「减少动态效果」后刷新 —— 应立即进入可用状态，不锁屏
- [ ] 移动端（真机 + 设备模拟都试）：**整页能竖向滚动**，内容不被裁（第 9 条）
- [ ] 移动端：点顶部导航能跳到对应区块（第 25 条）
- [ ] 移动端：页脚在底部正常排成两行、不溢出
- [ ] 控制台应无报错

---

## 4. 如果 Safari 上 goo 液滴或前景模糊有问题

按「Safari 影响最小」的顺序：

```css
/* 1) 前景粒子的全屏模糊 —— 直接去掉最省事 */
#foreground-particles { filter: none; -webkit-filter: none; }

/* 2) goo 液滴 —— 只在 Safari 关掉（用 @supports 无法可靠区分，建议用 UA 类或直接关） */
.liquid-bg { display: none; }
```
---

# P1 性能重构（第二轮）

目标：把 9 个各自为战的 rAF 循环收敛成 1 个，并让所有特效在**没有变化时完全不工作**。

## 新增两个基础模块

| 文件 | 作用 |
|---|---|
| `js/world.js` | 全站唯一的 rAF 调度器 + 横向滚动位置。`World.onScroll(fn)` 只在滚动位置变化时回调；`World.onFrame(fn)` 每帧回调并带上归一化 dt（60fps = 1）。标签页切到后台整体暂停。`scrollX` 是缓存值，特效层读它不会重复触发强制布局。 |
| `js/sprite.js` | `makeGlowSprite()`：把「形状 + 光晕」预渲染成一张 64x64 的离屏 canvas，用来替掉逐颗粒子的 `shadowBlur`。 |

`index.html` 里这两个脚本排在所有特效脚本之前。

## 循环收敛对照

| 模块 | 重构前 | 重构后 |
|---|---|---|
| `particles.js` | 独立 rAF + 每颗 shadowBlur | `World.onFrame` + sprite |
| `fore-particles.js` | 独立 rAF + 每颗 shadowBlur | `World.onFrame` + sprite |
| `guides.js` | 独立 rAF，**每帧重画整张全屏参考线** | `World.onScroll`，只在滚动时重画 |
| `rulers.js`（指示三角） | 独立 rAF，**每帧无条件写 transform + dataset** | `World.onFrame`，位置没变就不碰 DOM |
| `mosaic.js`（视差） | 独立 rAF + 逐个方块写 `--px` | 循环整个删除，每个方块只写一次 `--parallax` |
| `circle-parallax.js`（视差） | 独立 rAF + 逐个元素写 `--px` | 整个 IIFE 删除，系数写进 CSS |
| `main.js`（液滴跟随） | 独立 rAF，每帧写 transform | 删除，改为 CSS 视差 |
| `main.js`（鼠标点） | 独立 rAF，每帧写 transform | `World.onFrame`，位置稳定后停止写入 |
| `colck.js` | 独立 rAF | `World.onFrame`；数字时钟只在秒变化时写 DOM |

**9 个常驻 rAF 收敛为 1 个。** 现在只剩两处临时动画还在自己开 rAF：`main.js` 的滚轮惯性与锚点冲刺，动画结束即停止。

## 视差改为单一变量驱动

`style.css` 顶部新增：

```css
@property --scroll-x { syntax: '<number>'; inherits: true; initial-value: 0; }

.circle, .circle-ticks, .digital-clock, .mosaic-tile, .liquid-bg {
    --px: calc(var(--scroll-x, 0) * var(--parallax, 0) * -1 * 1px);
}
```

各层只声明系数（`.circle-1 { --parallax: 0.08 }`、`.digital-clock { --parallax: 0.4 }`、`.liquid-bg { --parallax: 0.7143 }`），`world.js` 每帧**只写一次** `--scroll-x`。

**需要说清楚的一点**：`--scroll-x` 是继承的自定义属性，浏览器仍然要为引用了它的元素做样式重算。所以这里的收益主要在 **JS 侧**——每帧 1 次 DOM 写入代替约 20~35 次，并且能整块删掉 mosaic 与圆环两个模块的循环——**而不是**「样式计算少了 400 倍」。

顺带更正第一轮我说错的一个数字：mosaic 实测在 1920x1080 下三个区块合计只有**约 40 个方块**（其中约 16 个参与视差），不是我之前说的 200~400 个。我把 `style.css` 里写错的注释也一并改了。

## 其他改动

- **dt 归一化**：两个粒子层、滚轮惯性（`FRICTION` / `FOLLOW`）、准星跟随（`EASE`）、鼠标点，全部改成按归一化 dt 计算。这些参数原本是「每帧」的，144Hz 屏幕上粒子速度和惯性衰减会是 60Hz 的 2.4 倍。
- **`.mosaic-tile` 去掉 `will-change: transform`**：每个 tile 还带一个 `tileFloat` 漂浮动画，挂 `will-change` 等于同时建一堆合成层。
- **`.liquid-bg` 去掉 `will-change: transform`**：不再逐帧改 transform，而且它是一张全屏 + SVG 滤镜的图层。
- **`#foreground-particles` 去掉 `filter: blur(1px)`**：这张 canvas 每帧重绘，等于每帧一次全屏模糊（Safari 上尤其贵）。柔边现在由 sprite 画出来。
- **`colck.js` 删掉网络对时**：不再每 30 分钟请求 `worldtimeapi.org`（免费接口不稳定，还会把访客 IP 交给第三方）；同时删掉了那段算了却从未生效的指数退避。
- **`main.js` 删掉 `syncLiquidLayer` 循环**，以及 `#about .container` 上那个没有对应 CSS 规则、还带强制 reflow 的 `.shine` 处理器。
- canvas 后备缓冲区尺寸统一 `Math.round(W * dpr)`，避免 DPR 为 1.25 / 1.5 时的半像素毛边。

## 需要你确认的观感变化

1. **粒子光晕现在跟随 sprite 一起缩放**（原来是固定 3px 光晕）。为此我把两层的 `CONFIG.glow` 从 3 / 4 提到了 10 / 6，让柔度尽量贴近原来。仍会有一点差别：
   - 远处那档极小粒子会显得比原来「硬」，因为原来那 3px 光晕相对它们的尺寸是很大的；
   - 近处的大粒子会比原来更柔。
   这两个值就是唯一的旋钮：`particles.js` 的 `CONFIG.glow` 越大越柔，太糊就调小。
2. **参考线 / 尺子三角 / 鼠标点在静止时不再刷新**——这是预期行为，不是渲染出错。
3. 若某个视差层不跟着滚动，先确认 `js/world.js` 正常加载（它必须排在所有特效脚本之前）。

## 仍然没做（第三轮候选）

- 命名清理（`splash-遮罩` / `body缩放` / `--colck`）
- `.section { justify-content: center; overflow-y: auto }` 的顶部裁切
- 可访问性 / SEO
- 浮窗系统 + 数据驱动
- `@property` 只对 Safari 16.4+ 生效；更低版本自动退回未注册的自定义属性，功能不受影响
---

# P2 基础设施（第三轮：断点残留 / 字体就绪 / 开屏闸门）

这三条不是视觉改动，是把地基补上。全部用你已有的 `World` 扩展，没有引入 GSAP 或 Lenis。

## 1. `World.onLayout(fn)` —— 布局变化的唯一入口

触发时机：注册时立刻一次；`resize`（120ms 防抖）；`orientationchange`；以及 **`document.fonts.ready`**。

为什么必须等字体：文字尺寸一变，节内容就可能超过一屏而出现内部滚动条，`clientWidth` 跟着少十几 px —— 于是所有「按宽度算位置」的东西都会偏（马赛克方块的 `leftBound`、参考线画布宽度）。

原来有 **7 个模块各自 `addEventListener('resize')`**，节奏还不一致（只有 `mosaic` 自己做了 150ms 防抖，其余每帧都跑）。现在全部收敛到这一个入口：

| 模块 | 原来 | 现在 |
|---|---|---|
| `particles.js` | 自己的 resize 监听 | `World.onLayout(resize)` |
| `fore-particles.js` | 自己的 resize 监听 + 加载时一次性判断移动端 | `onLayout` 每次重读 `display` |
| `rulers.js` | 自己的 resize 监听 | `World.onLayout(render)` |
| `guides.js` | 自己的 resize 监听 + 一次性判断移动端 | `World.onLayout(...)` |
| `mosaic.js` | 自己的 150ms 防抖 resize | `World.onLayout(render)` + 尺寸签名去重 |
| `main.js`（准星线宽） | 自己的 resize 监听 | `World.onLayout(updateScale)` |

## 2. `World.effect(query, handler)` —— 断点感知的效果生命周期

```js
World.effect('(max-width: 768px)', function (isMobile) {
    // ...启动...
    return function () { /* 可选：清理 */ };
});
```

匹配状态每次变化时：先调用上一次返回的清理函数，再用新的布尔值调用一次。

修掉的真 bug：

| 文件 | 原来 | 症状 |
|---|---|---|
| `blobs.js` | 加载时判断一次 | 桌面缩到移动端后，桌面那 9 颗液滴一直留着（本应只剩 3 颗） |
| `mosaic.js` | `if (isMobile) return;` | 移动端放大到桌面后，马赛克永远不会出现 |
| `guides.js` | `if (isMobile) return;` | 同上，参考线永远不出现 |
| `fore-particles.js` | 加载时判断一次 | 同上，前景粒子层永远不启动 |

顺带修掉一个泄漏：`blobs.js` 的循环重播原来是无条件递归的 —— 元素被移除后动画链还在自我重启（跨断点重建时就会不断累积）。现在有 `stopped` 开关和完整的清理函数。

## 3. `World.gate(fn)` / `World.openGate()` —— 开屏闸门

开屏结束前排队，结束后统一执行（已放行则在微任务里立即执行）。

`main.js` 的 `finishIntro()` / 跳过 / 降级三条路径都会 `openGate()`，所以不会出现「永远被禁用」。

第一个受益者：`clickRipple` 原来为了「开屏结束才启用」叠了 **三套机制**——`zoomEl` 的 `animationend` 监听 + 自定义 `bodyzoomend` 事件 + 兜底 `setTimeout`，还一直握着 `page-zoom` 的引用。现在只剩一行 `World.gate(...)`。（`bodyzoomend` 的两处派发也一并删掉了，因为不再有人监听。）

## 其他

- **`index.html` 加了字体预加载**：`HuXiaoBo.otf` 有 3.2MB，走 CSS 里的 `@font-face` 意味着浏览器必须先下 CSS、解析、匹配到规则，才开始下字体。`<link rel="preload" as="font" crossorigin>` 能明显缩短「先用替代字体渲染、再突然换成 HuXiaoBo」的窗口。字体请求是 CORS 模式，`crossorigin` 不能省。
- `mosaic.js` 的重建去重键从「窗口宽度」改成了「各 section 实际 `clientWidth`/`clientHeight` 的签名」——否则「字体加载导致出现内部滚动条」这种情况会被漏掉（那正是本轮要解决的场景）。另外离开桌面时必须清掉签名，否则「桌面 → 移动端 → 回到同样宽度的桌面」会跳过重建，而方块其实已被拆除。

## 已知仍未解决（建议单独一轮）

1. **WELCOME / 大标题的字体切换重排**（真问题）。`welcome.js` 在字体到达前就把 `WELCOME` 拆成字符并开始动画，HuXiaoBo 一到，那行巨大的文字会重排。彻底的解法是「开屏等到字体就绪再开始」——把 `SPLASH_TIMELINE` 的全部延迟整体平移一个 offset，并加超时兜底。这会改变开屏行为，值得单独做。本轮只做到了「缩短窗口」（字体预加载）。
2. 其余「一次性环境判断」：`clickRipple` 的 `(hover: none)`、`theme-toggle` 的 `prefers-color-scheme` 仍是加载时判断一次（这两类很少中途改变，影响很小）。
3. **`HuXiaoBo.otf` 3.2MB 建议做子集化**：页面实际用到的字形可能只有几十个，用 `pyftsubset` / `glyphhanger` 裁一下能降到几十 KB。这比任何预加载都有效。
---

# P3 开屏等字体（第四轮）

## 要解决的问题

WELCOME 和正文都用 `HuXiaoBo.otf`（**3.2MB**）。原来所有开屏计时都从「页面加载」那一刻开始算，而字体往往要晚一两秒才到 —— 结果那行巨大的 WELCOME 会**先用替代字体渲染，等字体到了再当着用户的面重排一次**。字体越大、网络越慢，这个抽动越难看。

## 做法：把「开屏起点」推迟到字体就绪

不是把延迟整体平移（那样会让已经播到一半的动画倒退回去，出现闪回），而是**让开屏整体停表**：

**CSS 侧**（`style.css` 文件末尾）

```css
html:not(.intro-armed) .splash-渐显,
html:not(.intro-armed) .splash-遮罩,
html:not(.intro-armed) .page-zoom,
html:not(.intro-armed) .welcome-splash .char {
    animation-play-state: paused;
}
```

动画已经应用，所以画面各自停在 0% 状态：黑遮罩满屏、红遮罩铺满、页面 `scale(1.5)`、WELCOME 字符隐藏 —— 但时钟不走。等到 `timeline.js` 给 `<html>` 加上 `.intro-armed`，那一刻才是所有开屏延迟的 `t = 0`。于是字体切换的重排发生在遮罩后面，用户看不到。

**JS 侧**（`timeline.js` 新增 `window.Intro`）

```js
window.Intro = {
    armed,        // Promise<number>：放行时刻
    maxWait,      // 最多等字体多少毫秒（默认 2000）
    armedNow,     // boolean
    cancelled,    // boolean
    cancel(),     // 跳过 / 降级时调用：立即放行，避免等待者卡死
};
```

只 `document.fonts.load()` 开屏真正用到的两个字体，并**和超时赛跑**（`MAX_WAIT = 2000`）。用户跳过或降低动效时走 `cancel()`。

各模块改为从「开屏起点」计时：

| 模块 | 改动 |
|---|---|
| `welcome.js` | `.leave` 的 setTimeout 放进 `Intro.armed.then()`；被跳过时不再补播滑出 |
| `circle-parallax.js` | WAAPI 登场放进 `Intro.armed.then()`（WAAPI 不吃 `animation-play-state`，必须自己等）；被跳过时直接 `opacity: 1` |
| `main.js` | 准星收缩 / 解冻 / 解锁三条 setTimeout 全部移进 `introStart.then()`；`finishIntro()` 先 `Intro.cancel()` 再返回（幂等）；兜底计时加上 `maxWait` |

## 顺手补掉的两个坑

1. **`.page-zoom` 的 `animation-fill-mode` 从 `forwards` 改成 `both`。**
   暂停期间动画处于 delay 阶段，`forwards` 不填充、会显示基础样式（`scale(1)`），一旦开播就突然跳到 `scale(1.5)`。改成 `both` 后 `backwards` 会先把 0% 的 `scale(1.5)` 顶上。

2. **⚠️ `animation` 简写会重置 `animation-play-state`。**
   暂停规则一开始我写在文件中部，结果被后面 `.splash-渐显` / `.splash-遮罩` / `.welcome-splash .char` 的 `animation` 简写覆盖回 `running`，暂停完全失效。现在用**双保险**：规则挪到整个文件末尾（`style.css` 最后 14 行），并且选择器加上 `html:not(.intro-armed)` 提高优先级。

## 新增的「保险丝」

开屏动画现在是「默认暂停、等 `.intro-armed`」——这意味着**如果 `timeline.js` 里创建 `window.Intro` 时出了任何差错，暂停的遮罩就永远不会被放行，页面会永久卡在开屏画面下**。所以 `index.html` 末尾加了一个与 `Intro` 无关的纯 `setTimeout` 兜底（3 秒后强制加类）。正常路径下 `Intro` 会在 2 秒内放行，重复加同名类是无害的。

## 需要你确认的观感变化

- **最坏情况下会多出一段纯色开屏等待**（最多 `MAX_WAIT` = 2 秒），因为要等字体。用户看到的是纯色遮罩，观感上像「在加载」。
- 如果觉得等太久：把 `timeline.js` 里的 `MAX_WAIT` 调小（代价是慢网络下可能又看到重排）；调大则相反。
- **真正治本的办法是把 `HuXiaoBo.otf` 做子集化**（页面实际用到的字形可能只有几十个，用 `pyftsubset` / `glyphhanger` 裁到几十 KB）。那样字体几乎瞬间到位，`MAX_WAIT` 甚至可以降到 600ms —— 这一条比本轮的机制重要得多。
- 顺带：`welcome.js` 里的字符拆分仍在页面加载时执行（不是等字体），这是有意的 —— 元素需要先存在才能被 CSS 暂停。此时画面被遮罩盖着，替代字体的渲染不可见。
---

# P4 时钟锚到页面左上角（按你的调整改）

你做了两处调整：把 `.circle` 那三个 div 从 HTML 移除（只留 3 个 SVG 刻度环）、数字时钟字体换成 `Crunch-Light`。这一轮把你的新要求（左上角对齐 + 半径 80vh）接上，并修掉字体改名遗留的失效引用。

## 1. 半径改由屏幕高度决定

`:root` 新增一个变量，它是**半径**不是直径：

```css
--clock-r: 80vh;    /* 最外圈的半径 = 屏幕高度的 80% */
```

每圈用 `--k` 声明自己相对最外圈的半径倍数，保留你原来的 90:80:70 比例：

| 圈 | `--k` | `--size`（直径） | 半径 | vh 表示 |
|---|---|---|---|---|
| 1（秒） | 1 | `calc(--clock-r * 1 * 2)` | 80vh | 864px @1080 高 |
| 2（分） | 0.8889 | — | 71.1vh | 768px |
| 3（时） | 0.7778 | — | 62.2vh | 672px |

`--size` 在 `.circle` / `.circle-ticks` 里统一算出来，每圈只提供 `--k`：

```css
--size: calc(var(--clock-r, 80vh) * var(--k, 1) * 2);
```

原来写的是 `--size: 90vw`（直径），所以半径是 45vw —— 换成 `80vh` 之后**由高度驱动**，横向超宽屏不会再把时钟撑爆，竖向窄屏也不会缩太小。

> 顺带一个巧合：16:9 屏幕上 `45vw` 和 `80vh` 数值**恰好相等**（1920×1080 下都是 864px），所以在你现在这块屏幕上，**尺寸观感完全不变**，变的是位置。换个宽高比才会看出区别。

## 2. 圆心钉在页面左上角

```css
left: 0;
top: 0;
bottom: auto;                                    /* 覆盖原来的 bottom: 10vh */
translate: calc(-50% + var(--px, 0px)) -50%;     /* 圆心 = 视口 (0,0) + 视差 */
```

`left/top: 0` 把元素的左上角放到视口角上，再用 `translate(-50%, -50%)` 把自己推回一半 —— 于是**元素的正中心正好落在视口左上角**，可见部分就是右下那一象限，一条四分之一圆弧。

`transform-origin: center` 保持不变：`transform: rotate()` 绕元素自身中心旋转，而那个中心现在就是圆心，所以时针/分针/秒针的旋转逻辑（`colck.js` 里那套 `180 - value * step`）**一行都不用改**。

可见弧线的端点（1920×1080）：

```
第1圈（秒）：(0, 864) → (864, 0)     右 864px / 下 864px
第2圈（分）：(0, 768) → (768, 0)
第3圈（时）：(0, 672) → (672, 0)
```

## 3. 数字时钟跟着锚到左上角

抽了两个偏移变量，方便微调：

```css
--clock-x: calc(var(--nav-width) + 2.4vh);   /* 躲开左侧导航栏 75px + 刻度尺 40px */
--clock-y: 2.4vh;
left: var(--clock-x);
top: var(--clock-y);
translate: var(--px, 0px) 0;                 /* 不再用 -50% 居中，只保留视差 */
```

落点 x ≈ 101px / y ≈ 26px（1080 高时），在导航栏（0~75px）和刻度尺（0~40px）右侧，不会被压住。

**这是我的判断，不一定是你想要的**：读数现在贴着左上角。想换位置只改 `--clock-x` / `--clock-y` 两个值；想还原成「底部居中」，规则里已经写好了四行替换注释。

## 4. 修掉字体改名遗留的两处失效引用

你把 `@font-face` 从 `'Astron_数字用'` 改名成 `'Astron'`，同时新增 `'Crunch-Light'` 并让 `.digital-clock` 使用它。但另外两处还指着旧名字：

| 位置 | 原来 | 改成 | 为什么重要 |
|---|---|---|---|
| `js/timeline.js` | `document.fonts.load('1em "Astron_数字用"')` | `document.fonts.load('1em "Crunch-Light"')` | 这个家族名已经不存在，`load()` 会立刻以空数组 resolve —— 于是 P3 的「开屏等字体」**不再覆盖时钟字体**，Crunch-Light 可能晚到并当着用户的面换字 |
| `index.html` | `preload ... Astron-2.otf` | `preload ... Crunch-Light-2.ttf` | 原来预加载的是**已经没人用的字体**（18KB 白下），而真正在用的 69KB 字体没预加载 |

## 5. 我没动、但你可能想处理的

1. **`.circle` / `.circle-1~3` 规则现在是死代码** —— 你已把那三个 div 从 HTML 移除，只留 SVG 刻度环。CSS 我保留了（万一你想加回来），但如果不打算加，这 4 条规则可以删。
2. **`.digital-clock .digit` 规则匹配不到任何元素** —— `index.html` 里是纯文本 `<div class="digital-clock">00:00:00</div>`，而 `colck.js` 用 `elText.textContent = txt` 写值；如果你给它加 `<span class="digit">`，**`textContent` 会在第一次刷新时把子元素全清掉**。要让定宽数字真正生效，得改成「预建 8 个 span，只更新变化的那个」。（`letter-spacing: 0.2em` 对 `inline-block` 子元素是否生效各家浏览器不太一致，这点也要一起调。）
3. **`@font-face "Astron"` 已无任何规则引用** —— 我把它的 preload 换掉了，字体文件 `assets/fonts/Astron-2.otf`（18KB）现在可以删，或者留着以后当展示字体用。
---

# P5 布局规格化（Layout spec）

把散落各处的硬编码尺寸收敛成一套令牌。核心原则抄自参考站那套 `--vg` 的用法：**一条轴只留一个变量**。

## 新增的令牌（`style.css` 的 `:root`）

```css
--gutter: clamp(24px, 5vh, 72px);   /* 页面四周留白 —— 你说的 5vh，两端夹住 */
--nav-pad: 14px;                    /* 导航栏内部左右留白 */
--ruler-w: 8px;                     /* HUD 边缘厚度 */
--ruler-h: 8px;

--content-x: calc(var(--nav-width) + var(--gutter));   /* 固定层的内容起点 */
--safe-b: calc(var(--ruler-h) + var(--gutter));        /* 内容安全区下边界 */

--nudge-logo: 0px;                  /* 光学微调（见下） */
--nudge-clock: 0px;
```

**为什么 `--gutter` 用 vh 而不是 px**：这套界面是贴边 HUD，垂直方向的节奏比水平重要；而横向留白实际上由「内容居中 + `max-width: 960px`」决定，不需要跟着宽度变。用 px 的话，同一份留白在矮屏上会显得太松、在高屏上太紧。

**为什么外面套 `clamp`**：纯 `5vh` 在 600px 高的窗口只有 30px（挤），在 1440px 高的屏又有 72px（松）。夹住两端之后，中间仍然是你要的 5vh，1920×1080 下正好 54px。

## 各屏下的实际值

| 视口 | 高 | `--gutter` | 内容起点 `--content-x` | 安全区下边界 `--safe-b` |
|---|---|---|---|---|
| 1280×600 | 600 | 30px | 105px | 38px |
| 1440×900 | 900 | 45px | 120px | 53px |
| 1920×1080 | 1080 | **54px** | **129px** | 62px |
| 2560×1440 | 1440 | 72px | 147px | 80px |

## 改为引用令牌的规则

| 规则 | 原来 | 现在 |
|---|---|---|
| `.navbar` | `padding: 20px` | `padding: calc(var(--gutter) + var(--nudge-logo)) var(--nav-pad)` |
| `.section, .hero` | `padding: 60px 40px` | `padding: var(--gutter) var(--gutter) var(--safe-b)` |
| `.section` | `padding: 60px 40px` | 同上 |
| 移动端 `.section, .hero` | `padding: 60px 0` | `padding: var(--gutter) 0` |
| `.digital-clock` | `--clock-x: calc(var(--nav-width) + 2.4vh)` / `--clock-y: 2.4vh` | `--clock-x: var(--content-x)` / `--clock-y: calc(var(--gutter) + var(--nudge-clock))` |
| `#ruler-bottom` | `height: 8px` | `height: var(--ruler-h)` |
| `#ruler-left` | `width: 8px` | `width: var(--ruler-w)` |

**导航栏的 logo 与数字时钟现在共用一条顶线**：两者的盒顶都在 `--gutter` 处。它们不可能共用 x —— logo 在左侧栏里（x = `--nav-pad`），时钟在内容区起点（x = `--content-x`）。

## ⚠️ 顺带发现：8px 的刻度尺吃掉了刻度层级

你把刻度尺从 28/40px 改成 8px 之后，`rulers.js` 里写死的刻度长度没跟着变：

| 刻度 | 声明长度 | 8px 尺子上的实际可见 | 结果 |
|---|---|---|---|
| `major` | 14px | 8px（被裁） | 与中刻度**完全一样** |
| `mid` | 9px | 8px（被裁） | 与主刻度**完全一样** |
| `minor` | 4px | 4px | 唯一还能区分的 |

要恢复层级，把长度改成随尺子厚度走（`rulers.js` 的 `drawBottom` / `drawLeft` 各一处）：

```js
const len = isMajor ? h * 0.95 : isMid ? h * 0.62 : h * 0.35;
```

这样以后不管你把尺子调成 8px 还是 40px，三级刻度都会自动保持比例。

## 还没有令牌化的（下一步）

- **内部节奏**：`--nav-width` 之外的 `.nav-container { gap: 45px }`、`.section h2 { margin-bottom: 28px }`、`.card-grid { gap: 22px }`、`.skill-list { gap: 12px }`、`.hero-buttons { gap: 14px }` 等仍是硬编码。建议再补一组 3~4 档的间距刻度。
- **移动端导航栏**：`padding: 14px 20px` 仍是硬编码（横向排布时 `--gutter` 未必合适）。
- **光学微调**：`--nudge-logo` / `--nudge-clock` 我保留为 `0px` 没有猜值 —— 两者字号差一倍（1.4rem vs 2.5rem）且字体不同（HuXiaoBo vs Crunch-Light），盒顶对齐后字形顶边还会差几像素，需要你在浏览器里看一眼再定。
---

# P6 刻度尺：降为两级 + 压淡（按你的定位改）

你说刻度尺只是装饰、不用抢眼，所以不做「三级刻度按比例缩放」那套，改成**简化 + 压淡**。顺手修掉三个原来就有的毛病。

## 1. 只有两级刻度

原来的三级是 `major(100px) / mid(50px) / minor(10px)`，三档长度 `14 / 9 / 4`。

现在只剩两级：**主刻度每 100px、次刻度每 10px**，中间那档 `50px` 的去掉了。两级在 8px 的尺子上就是「长一点 / 短一点」，够用且干净。

## 2. 长度不再写死，改成尺子厚度的比例

这是**根因**：你把尺子从 28/40px 改成 8px，而 `rulers.js` 里长度还是写死的 `14 / 9 / 4` —— 于是主刻度(14px)和中刻度(9px)都被裁到满格 8px，**两者看起来一模一样**，三级层次直接消失。

现在长度按厚度算：

```js
lenMajor: 0.92,   // 主刻度长度 = 尺子厚度 × 0.92
lenMinor: 0.32,   // 次刻度长度 = 尺子厚度 × 0.32
```

8 CSS px 的尺子上：主刻度约 **7.4px**、次刻度约 **2.6px**。以后你把尺子调成 12px 还是 40px，两级比例都自动保持。

## 3. 对比度整体压低

原来 `BG` 是 55% 黑、刻度是 90% 红 —— 挺抢眼的。现在收进一个 `STYLE` 对象，一眼能看全：

| 项 | 原来 | 现在 |
|---|---|---|
| 底色带 `bg` | `rgba(0,0,0,0.55)` | `rgba(0,0,0,0.30)` |
| 贴内容的亮边 `edgeAlpha` | 0.70 | 0.40 |
| 主刻度 `majorAlpha` | 0.90 | 0.50 |
| （原中刻度） | 0.90 | — |
| 次刻度 `minorAlpha` | 0.90 | 0.22 |

**这四个 alpha 就是唯一的旋钮** —— 觉得太淡/太显眼，改 `js/rulers.js` 顶部的 `STYLE` 即可，不用碰逻辑。

## 4. 修掉：细线在 125% / 150% 系统缩放下会糊

原来 `setup()` 里写了 `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`，然后坐标写 `x + 0.5`。这个 `+0.5` 是「用 stroke 画线」时代的习惯；对 `fillRect` 来说：

- dpr = 1：`x + 0.5` 让 1px 宽矩形横跨两个像素各一半 → **糊**
- dpr = 1.25 / 1.5（Windows 常见缩放）：坐标换算到设备像素后仍落在非整数上 → **糊成 2px 灰边**
- dpr = 2：恰好能落在整数设备像素上 → 清晰

也就是说**只有整数倍 dpr 才清晰**。现在改成：不设缩放变换，所有绘制都在**设备像素**坐标系里取整数，任何 dpr 下 1px 细线都是干净的。同时 `dpr` 改成在 `render()` 里重读 —— 你换显示器或改系统缩放时它会跟着更新。

## 5. 修掉：小数 dpr 下主刻度会和次刻度错开

原来的逻辑是 `x % 100 === 0` 判定主刻度、`x += 10` 步进。一旦把步长按 dpr 换算并四舍五入，比如 dpr = 1.25 → 次刻度 13px、主刻度 125px，两者互质，**主刻度永远落不到次刻度网格上**，视觉上就是刻度歪了。

现在主刻度取成次刻度的**整数倍**（`major = minor × ratio`），任何 dpr 下都严格对齐。

## 6. 一处观感变化：左尺的刻度挪到外侧了

原来两条尺子的刻度方向**不一致**：

- 底尺：亮边在上（贴内容），刻度贴**下**（外侧）
- 左尺：亮边在右（贴内容），刻度也贴**右**（内容侧）

现在统一成「亮边贴内容、刻度贴外侧」（像胶片齿孔那种边缘装饰），更符合「只是装饰」的定位。

想还原左尺（刻度回到内容侧），把 `drawLeft()` 里两处 `ctx.fillRect(0, ...)` 的 x 从 `0` 改成 `W - m.lenM` / `W - m.lenm` 即可。

## 顺带

`.ruler-marker-x / .ruler-marker-y` 两个指示三角的 CSS 还是 `bottom: 5px` / `left: 5px`，那是按很薄的尺子摆的，现在会压在刻度上。如果想让它们贴到尺子外沿：`bottom` 改 `var(--ruler-h)` 的负值方向、`left` 同理，按你看的效果调。
---

# P7 刻度尺指示三角：挪到外沿 + 缩小

## 先澄清一个容易记反的几何

CSS 三角形的 `width/height` 都是 0，形状完全由 `border` 决定：

> **一对相对的透明边框构成「底边」，那条有颜色的边框才是「高」（= 尖端指向）。**

所以改之前你看到的那个 `10px` —— `.ruler-marker-x` 的 `border-bottom: 10px` —— 其实是**高度**，而底边宽是两侧透明边框之和 `6 + 6 = 12px`。

| | 改之前 | 改之后 |
|---|---|---|
| `.ruler-marker-x`（底尺，尖朝上） | `border-left/right: 6px` → 底边 **12px**<br>`border-bottom: 10px` → 高 **10px** | 底边 **12px**（不变）<br>高 **5px** |
| `.ruler-marker-y`（左尺，尖朝右） | `border-top/bottom: 6px` → 底边 **12px**<br>`border-left: 10px` → 宽 **10px** | 底边 **12px**（不变）<br>宽 **5px** |

也就是按你说的「那个 10px 缩成 5px、另一维不变」来做的 —— 两个三角形都变成 **12px 底边 × 5px 尖高**，且仍然是同一个三角形旋转 90°。

## 位置：挪到尺子外沿

| | 改之前 | 改之后 |
|---|---|---|
| `.ruler-marker-x` | `bottom: 8px`（贴在尺子**内**沿） | `bottom: 2px`（外沿往里 2px） |
| `.ruler-marker-y` | `left: 8px`（贴在尺子**内**沿） | `left: 2px` |

尺子厚 8px、三角形高 5px，所以现在它**整个落在尺子内部**，只在靠屏幕边那一侧留 2px：占用区间 `2 ~ 7px`，内侧还剩 1px。

> 想更贴边：把两个 `2px` 改成 `1px`。
> 想正好竖直/水平居中：改成 `1.5px`（`(8 - 5) / 2`）。

## 顺带把几何写进了注释

因为这两个三角形的尺寸必须同步改（否则两条尺子会不一致），我把「底边 / 高 / 指向」的对应关系和位置计算都写在了 `style.css` 的规则上方，以后改不会踩坑。

## 还没动的：三角上方的数字标签

`.ruler-marker-x::after` / `::after-y` 那对 `attr(data-x)` / `attr(data-y)` 数字（9px 等宽）位置没变。它们在 CSS 里是相对那个 0×0 的 marker 盒定位的，所以现在会浮在尺子上方约 5px 处 —— 三角形变小、贴到外沿之后，标签看起来会比之前更「脱开」。

如果想让它们也收进尺子附近，改 `.ruler-marker-x::after { bottom: 5px }` 这个值即可；或者干脆去掉（尺子已经定位成装饰了，坐标数字可能反而是多余的信息）。
---

# P8 三角跟随准星的延迟：拆成两处分别处理

你反馈三角跟随准星有延迟。查下来是**两个独立的来源**，不是一个问题：

## 来源一：一帧的调度错位（真 bug，已修）

准星跑在**自己的 rAF 回调**里，而三角跑在 **World 的 rAF 回调**里，靠 `World.onFrame` 去轮询 `window.crosshairPos`。

同一帧里两个 rAF 回调谁先执行，取决于注册顺序。如果 World 先跑，三角读到的就是**上一帧**的位置。静止时完全看不出来，但**鼠标快速移动时，这一帧错位会按速度放大成肉眼可见的拖尾** —— 比如 1500px/s 的移动速度下，一帧就是 25px 的差距。

**修法：把「轮询」换成「同帧推送」。** 准星在更新自己的 `transformOrigin` 之后，立刻把坐标推给订阅者：

```js
// main.js —— 准星侧
const posSubs = new Set();

window.onCrosshair = function (fn) {
    posSubs.add(fn);
    fn(cx, cy);                       // 注册时先同步一次
    return function () { posSubs.delete(fn); };
};

function applyOrigin() {
    ...
    for (const fn of posSubs) fn(cx, cy);   // 同一帧内推送，零延迟
}
```

```js
// rulers.js —— 三角侧
if (window.onCrosshair) {
    window.onCrosshair(place);        // 订阅代替轮询
} else {
    World.onFrame(...);               // 兜底：准星元素缺失时仍可工作
}
```

顺带把数字标签的写入也收紧了：`content: attr(data-x)` 会因 `dataset` 变化触发伪元素重算，所以改成**只在整数位变化时才写**（原来每帧无条件写）。

## 来源二：准星自身的缓动（设计如此，不是 bug）

`main.js` 里 `const EASE = 0.10;` —— 这是「每帧追赶 10%」的缓动，大约要 **0.17 秒**才追到 63%，所以准星本身就拖在鼠标后面。三角是**跟随准星**的，因此它继承的是**完全相同**的滞后，两者是严格重合的。

**如果你要的「实时」是指整套都不拖尾**，把 `EASE` 从 `0.10` 改成 `1` 即可（一行，注释里写了）。改完之后准星直接钉在鼠标上，三角依然严丝合缝地跟着。

## 怎么区分你遇到的是哪一个

| 现象 | 原因 | 修法 |
|---|---|---|
| 三角和准星**之间有缝隙**，快速移动时缝隙变大、停下就贴上 | 一帧调度错位 | 已修（同帧推送） |
| 三角**和准星完全重合**，但两者一起拖在鼠标后面 | 准星的缓动 | 改 `EASE = 1` |

## 顺带说明

`--crosshair-*` 之外，`.cursor-dot`（那个 10px 的小圆点）有一条 `transition: transform`，是**另一套**跟随（`0.8` 缓动 + CSS 过渡），它和三角、准星三者之间本来是各自为政的。如果哪天觉得这三者在快速移动时「散开」了，根源就在这 —— 它们用了三套不同的跟随速度。要统一的话可以一起挂到 `window.onCrosshair` 上。
---

# P9 开屏副标题：上下两行 + 闪烁浮现 + 反向离场

## 加了什么

`WELCOME` 上下各一行 **`WELCOME FOR RESOLUALYSIS WEB`**：

- 颜色与 WELCOME 相同（都用 `var(--text)`），字体也沿用 HuXiaoBo
- **在 WELCOME 完全落位之后才开始闪烁浮现**
- 离场时 **WELCOME 向左、它们向右**（并且同样横向压扁，是 `welcomeLeave` 的镜像）

## 结构上的关键决定：副标题不是 WELCOME 的子节点

WELCOME 的离场是给**容器**加 `.leave` 触发 `welcomeLeave`（整体 `translateX(-140vw)`）。**子元素无法摆脱父级的 transform** —— 所以副标题只能做成 `.welcome-splash` 的**兄弟节点**，各自拿到方向相反的离场动画：

```html
<div class="welcome-splash">WELCOME</div>
<div class="welcome-tagline welcome-tagline-top">WELCOME FOR RESOLUALYSIS WEB</div>
<div class="welcome-tagline welcome-tagline-bottom">WELCOME FOR RESOLUALYSIS WEB</div>
```

## 时序：它正好吃满设计里那段 HOLD

`welcome.js` 里新增的计算（**不写死数字，从时间线推导**）：

```js
lastCharLands = IN.delay + (n - 1) * stagger + CHAR_APPEAR;
blinkWindow   = OUT.delay - lastCharLands - 0.05;
```

默认数值下（`welcomeIn {0.8, 2.0}`、`welcomeOut.delay 2.8`、7 个字）：

| 时刻 | 事件 |
|---|---|
| 0.80s | WELCOME 首字开始上升 |
| **2.30s** | **最后一字落位 → 副标题从此刻开始闪** |
| 2.30 – 2.75s | **闪烁窗口 0.45s**（闪 3 次后稳定） |
| 2.80s | WELCOME 向左移出 / 副标题向右移出 |
| 3.80s | 全部移完 |

也就是说：**落位到离场之间那 0.5s 的 HOLD，正好够副标题闪一下并稳住** —— 没有改动原时间线，也没有挤压其它轨道。

闪烁用 `steps(1, end)`（透明度在关键帧之间**直接跳、不插值**），像读数「啪」地亮起来，而不是柔和淡入。

## 字号：你要的 1/2 放不下，我加了上限兜底

`--tagline-scale: 0.5`（你要的 1/2）已经写进 `:root`，但它实测超得多：

| 视口 | 按 1/2 的字号 | 那一行的估算宽度 |
|---|---|---|
| 1920 | 256px | ≈ 4531px（**236vw**） |
| 1440 | 256px | ≈ 4531px（**315vw**） |

原因是这行有 28 个字符，而 WELCOME 只有 7 个 —— 想铺满一行，倍率大约只能取 **0.22**。

所以我用 `min()` 加了个「一行大致铺满视口」的上限：

```css
--tagline-fs: min(calc(var(--welcome-fs) * var(--tagline-scale)), 5.4vw);
```

**想纯粹看 1/2 的效果**：把 `min(...)` 整段删掉，只留 `calc(var(--welcome-fs) * var(--tagline-scale))`。
**想微调大小**：只改 `--tagline-scale`（推荐试 0.18 / 0.22 / 0.28）。

## 位置：偏移量是推导出来的

```css
--tagline-shift: calc(var(--welcome-fs) * 0.35 + var(--tagline-fs) * 0.85 + 1.5vh);
```

= 半个 WELCOME 字高 + 半个自己 + 一点缝。因为两项都跟着字号走，所以你改字号时上下两行会自动重新贴到标题旁，不需要手调偏移。

实测（相对视口中心）：1080 高的屏上，副标题带落在 232~335px，WELCOME 字形约占 ±179px —— 间距合适。

## 与开屏闸门的配合

- 副标题也加入了 `html:not(.intro-armed)` 的**停表**规则，所以等字体期间它不会偷偷闪完
- 跳过 / 降低动效 / 正常收尾三条路径都会把它一起清掉（`main.js` 的 `finishIntro()` 与 `skip()`、以及 `welcome.js` 的降低动效分支）

## 已知边界：极扁的窗口会被裁

`--welcome-fs` 只按**宽度**夹（`clamp(12rem, 40vw, 32rem)`），所以在 2560×700 这种「很宽很矮」的窗口里，上下两行会被裁掉一点。

要根治，让标题也参考高度：

```css
--welcome-fs: clamp(12rem, min(40vw, 42vh), 32rem);
```

这会稍微改变 WELCOME 在矮窗口里的字号，所以我没有擅自改 —— 你说要我再动。
---

# P10 开屏三行：宽度按 vw 精确控制，高度改为「量出来再反推」

你的要求是「三行宽度 80~90vw、WELCOME 高度 50~60vh、小字高度 10~15vh」。这件事**不是调 `font-size` 能做到的** —— 所以实现方式变了。

## 为什么不能直接调字号

字形的**宽和高被字体的天然宽高比锁死**。我用 .NET 把你自己的字体文件量了一遍：

字体族名是 **胡晓波真帅体**。在 100px 字号下：

| 文字 | advance 宽 | 墨迹宽 | 墨迹高 | 宽高比 |
|---|---|---|---|---|
| `WELCOME` | 331.4px | 327.4px | 77.9px | **4.25 : 1** |
| `WELCOME FOR RESOLUALYSIS WEB` | 1297.2px | 1293.2px | 78.0px | 16.6 : 1 |

所以：**一旦宽度定死，高度就跟着定了**。想要两个维度都命中你给的数字，只有两条路：改字号（等比，只能命中一个）或者纵向拉伸（非等比，会变形）。

## 现在的实现

**① 宽度：量出来反推（精确命中）**

`js/welcome.js` 用 canvas 的 `measureText` 量出「每 1px 字号渲染多宽」，再把字号写成 CSS 表达式：

```js
rootEl.style.setProperty('--welcome-fs', `calc(${targetW} / ${ratioW.toFixed(4)})`);
```

写成 `calc` 之后，**窗口再变也不用重跑 JS**（`86vw / 3.314` 会自己跟）。换字体、改字串，宽度都会稳定落在 `--splash-w` 上。

> 注意：canvas 不认 CSS 的 `letter-spacing`，所以按字符数补了回来（副标题有 `0.05em` 字距，补完后比例从 12.972 变成 14.372）。

**② 高度：算出需要纵向拉伸几倍**

字号被宽度锁死后，墨迹高度是个定值。代码把它和目标高度一比，得出拉伸倍数，写进 `--welcome-stretch` / `--tagline-stretch`（用独立的 `scale` 属性，不和离场动画的 `transform` 打架）。

**③ 想保真？** 两种写法都行：把 stretch 设成 `1`，或者更省事 —— 把 `--welcome-h` / `--tagline-h` 直接写成 **`auto`**，代码识别到就不拉伸。

## 1920×1080 下的实际结果

| 行 | 算出字号 | 自然墨迹高 | 你要的高 | 需要拉伸 |
|---|---|---|---|---|
| `WELCOME` | ≈ 498px | 388px = **35.9vh** | 55vh | **1.53×** |
| 副标题（28 字） | ≈ 115px | ≈ 90px = **8.3vh** | 12vh | **≈ 1.45×** |

纵向排布：`55vh + 2×(2vh + 12vh) = 83vh` —— 放得下。

顺带一个对照：**你原本想的「1/2」实际约等于 0.23**（因为副标题有 28 个字、WELCOME 只有 7 个）。现在不再需要那个倍率了，宽度是直接量的。

## 新增/改动的规格变量（`style.css` 的 `:root`）

```css
--splash-w: 86vw;        /* 三行统一宽度 —— 你说的 80~90，取中 */
--welcome-h: 55vh;       /* WELCOME 目标墨迹高度 —— 你说 50~60，取中 */
--tagline-h: 12vh;       /* 小字目标墨迹高度 —— 你说 10~15，取中 */
--splash-gap: 2vh;       /* 行与行的缝 */
```

上下两行的偏移改成纯推导，不再依赖字号：

```css
--tagline-shift: calc(var(--welcome-h) / 2 + var(--splash-gap) + var(--tagline-h) / 2);
```

## 重算时机

挂在 `World.onLayout` 上，所以下列情况都会自动重算：`resize`、横竖屏切换、**以及 `document.fonts.ready`**。

最后一条很关键：字体没到就量，量到的是**替代字体**的比例；而 `vw → px` 的换算也随视口变（拉伸倍数 = 目标高 ÷ 自然高，对宽高比尤其敏感）。
---

# P11 修复：WELCOME 被向上推了 ~20vh（我引入的 bug）

## 症状

加上纵向拉伸之后，WELCOME 整块往上偏，实测约 **-20 ~ -25vh**（在极宽屏上小一些）。

## 根因：`transform` 属性和 `translate`/`scale` 独立属性的合成顺序

这是本轮唯一真正的坑，记下来避免以后再踩。CSS Transforms 规定：

```
最终矩阵 = translate × rotate × scale × transform      ← 最右边的先作用于元素
```

也就是说 **`transform` 属性里的东西是最先生效的**。

我原来写的是：

```css
transform: translate(-50%, -50%);     /* ← 居中 */
scale: 1 var(--welcome-stretch);      /* ← 纵向拉伸 */
```

执行顺序变成：**先**平移 (-50%,-50%)（此时盒子中心被移到原点），**然后**才按 `transform-origin`（= 盒子中心 `(w/2, h/2)`）缩放 —— 而盒子的视觉中心这时已经不在那个点了。于是每缩放一次，整块字就被推走一段：

```
偏移 = 盒高 / 2 × (1 − 拉伸倍数)
```

实测（`line-height: 1.7` → 盒高 = 1.7 × 字号）：

| 视口 | 字号 | 盒高 | 拉伸倍 | 偏移 |
|---|---|---|---|---|
| 1920×1080 | 498px | 847px | 1.53 | **−225px（−20.8vh）** |
| 1440×900 | 374px | 635px | 1.70 | **−222px（−24.7vh）** |
| 2560×1440 | 664px | 1129px | 1.53 | **−300px（−20.8vh）** |
| 3440×1440 | 893px | 1518px | 1.14 | −105px（−7.3vh） |

拉伸倍数为 1（保真）时偏移为 0 —— 所以这个问题只在开了拉伸之后才出现。

## 修法

把居中从 `transform` 挪到**独立的 `translate` 属性**：

```css
.welcome-splash {
    top: 50%;
    left: 50%;
    translate: -50% -50%;                 /* ★ 居中：先绕盒中心缩放，再整体平移 */
    scale: 1 var(--welcome-stretch, 1);
}
```

这样执行顺序变成「先缩放（基准点 = 盒子中心，正确）→ 再平移」，偏移归零。

同时 `welcomeLeave` 关键帧里那两处 `translate(-50%, -50%)` 必须删掉（否则会平移两次）：

```css
@keyframes welcomeLeave {
    0%   { transform: translateX(0) scaleX(1); opacity: 1; }
    100% { transform: translateX(-140vw) scaleX(0); opacity: 0; }
}
```

## 为什么 tagline 没这个问题

`.welcome-tagline` 当初就是按「`margin-top` 做偏移 + 独立 `translate` 做居中」写的，从来没把居中塞进 `transform`，所以它一直是对的。

## 一个同类的潜在耦合（不是 bug，先没动）

`.blob` 的漂移是 WAAPI 动画写的 `transform: translate(...)`，脉冲是 CSS 的 `scale`。按同样的顺序，`transform` 先生效、`scale` 后生效，结果是**脉冲会顺带缩放漂移幅度**（±15%）。因为 blob 是背景装饰、幅度又小，看不出来，所以没动；真要严格，把漂移改成写独立的 `translate` 属性即可。
---

# P12 修复（第二轮）：行盒中心 ≠ 字迹中心

P11 修掉的是 `transform` 合成顺序造成的 **−20vh**（那是我引入的）。剩下的 **5~10vh** 是另一个原因，而且是字体本身的属性，和变换无关。

## 根因：行盒是按字体的 ascent/descent 撑起来的

CSS 的「行盒」高度 = `line-height`，但内部的基线位置是 `半行距 + 字体 ascent`，而**字迹不一定在行盒里居中**。

我把 `HuXiaoBo.otf` 的二进制表直接读了出来：

| 表 | ascender | descender | lineGap |
|---|---|---|---|
| `hhea` | 859 | −188 | 0 |
| `OS/2` sTypo | 826 | −188 | 100 |
| `OS/2` usWin | 856 | 188 | — |

`head.unitsPerEm = 1000`，`OS/2.fsSelection` bit7（USE_TYPO_METRICS）= **0** → Windows 上浏览器用 **usWin**。

再看「WELCOME」的墨迹（像素扫描实测）：**−0.786em ~ +0.006em**（相对基线）—— 全大写、几乎没有基线以下的墨迹。

于是：

```
字迹中心比行盒中心高 = (A − D)/2 − (墨迹上 − 墨迹下)/2
                     = (0.856 − 0.188)/2 − (0.786 + 0.006)/2
                     = 0.334 − 0.396 = −0.062em
```

**三种候选度量算出来是 −0.060 ~ −0.062em（相差 0.002em ≈ 1px）**，所以这个值不依赖浏览器选了哪套度量 —— 修法很稳。

而且推导里 `line-height` 会约掉：**这个偏移和行高无关**，所以不能靠调 `line-height` 解决（纯 CSS 无解）。

## 修法：补偿 0.062em × 拉伸倍数

`:root` 新增一个变量：

```css
--splash-ink-nudge: 0.062em;    /* 正 = 往下；em 会按使用处的字号解析 */
```

三处按各自的拉伸倍数补：

```css
.welcome-splash {
    margin-top: calc(var(--splash-ink-nudge) * var(--welcome-stretch, 1));
}
.welcome-tagline-top {
    margin-top: calc(-1 * var(--tagline-shift) + var(--splash-ink-nudge) * var(--tagline-stretch, 1));
}
.welcome-tagline-bottom {
    margin-top: calc(var(--tagline-shift) + var(--splash-ink-nudge) * var(--tagline-stretch, 1));
}
```

**为什么写在 `margin` 而不是 `translate`**：上下两行的离场关键帧会动画 `translate` 和 `scale`，如果把补偿写进 `translate` 就会被关键帧覆盖、出发瞬间弹一下。`margin` 不参与那两条动画，所以是安全的。

## 补偿量是恒定的 4.4vh

| 视口 | 字号 | 拉伸倍 | 补偿量 |
|---|---|---|---|
| 1920×1080 | 498px | 1.53 | 47px = **4.4vh** |
| 1440×900 | 374px | 1.70 | 39px = **4.4vh** |
| 2560×1440 | 664px | 1.53 | 63px = **4.4vh** |
| 3440×1440 | 893px | 1.14 | 63px = **4.4vh** |

为什么各屏都是 4.4vh：字号 ∝ 视口**宽**（vw），拉伸倍数 = 目标高 ÷ 自然高 ∝ 视口**高/宽**，两者相乘 ∝ 视口**高** → 换成 vh 就是常数。

## 如果还剩一点偏差

只改 `--splash-ink-nudge` 一个数：**正 = 往下**，试 `0.05 / 0.07 / 0.09`。它是 `em`，会跟着字号自动缩放，不需要再乘任何东西。
---

# P13 section 底色统一（#media 起）+ 「黑方块可见度」结论更正

## 改了什么

1. **`#media` / `#contact` / `#projects` 统一上真正的 CSS 底色**

```css
#projects,
#media,
#contact { background: var(--bg-alt); }
```

为什么连 `#projects` 一起写：它原来的「底色」**不是自己的 CSS 背景**，而是 mosaic 层的**色带**（`--band-left: 0%` 铺满整屏）。但移动端 CSS 把 `.mosaic-layer` 整个 `display:none` 了 —— 只靠色带的话，`#projects` 在手机上会退回 body 色，跟「统一」的意图正好相反。写成真正的 `background` 之后桌面和手机一致（桌面上视觉无变化，因为色带本来就是同色）。

2. **`mosaic.js` 支持把「色带颜色」和「方块颜色」分开**

原来 `#contact` 的色带和方块共用 `--mosaic-color`（都是 `var(--black)`），没法只改其中一个。现在：

```js
// #contact
color: 'var(--bg-alt)',      // 色带 = 底色 → 与 #projects 一致
tileColor: 'var(--black)',   // 方块 → 仍是黑的
```

```css
.mosaic-tile { background: var(--mosaic-tile-color, var(--mosaic-color)); }
```

于是 `#contact` 的色带与 section 底色同色（看不见色带），只剩黑方块浮在 `#191919` 上；方块之间的缝隙露出的也是 `#191919`，整块才统一。

3. **`#media`** 本来没有 mosaic 层，只能靠第 1 条。

## ⚠️ 更正：我上一轮说的「黑方块会几乎看不见」是错的

我当时给了 WCAG 对比度 1.19:1，并称这是「物理上限」。**这个判断不成立**，因为用错了度量：

- WCAG 对比度的公式是 `(L1 + 0.05) / (L2 + 0.05)`，那个 `+0.05` 是**环境光抬升项**，为「亮房间里读小字」设计。把纯黑代入后它被强行抬成 0.05，相对差就被压平了 —— 拿它量**大面积深色肌理**会严重低估。
- 正确的度量是**感知亮度（CIE L\*）**：

| 颜色 | 线性亮度 Y | 感知亮度 L\* |
|---|---|---|
| `#000000` 方块 | 0.00000 | 0.00 |
| `#191919` 新底色 | 0.00972 | **8.76** |
| `#323232` 旧底色 | 0.03190 | 20.79 |
| `#e5e5e5` 浅色主题 | 0.78354 | 90.94 |

**ΔL\* = 8.76（新）vs 20.79（旧）**。大面积色块「刚可分辨」的阈值约 ΔL\* ≈ 1，所以 8.76 是阈值的 **8~9 倍**，属于「清楚」这一档 —— 与实测观感一致（HDR + 高对比面板会让它更明显，因为黑位压得越低，`#191919` 相对纯黑就越突出）。

另外注意：Weber 对比 `(底色−方块)/底色` 在两种情况**都是 100%**（因为前景是纯黑）—— 相对对比度一点没丢，减半的只是绝对差值。

**唯一仍然成立的一点**：绝对差值从 50 档降到 25 档，所以在「黑位被抬高的屏幕」（漏光 LCD）或「强环境光」下，方块会比原来显得淡。这是显示条件问题，不是普遍上限。

## 待定：浅色主题的对称性

浅色主题下 ΔL\* = **90.94**（黑方块在 `#e5e5e5` 上），和深色主题的 8.76 差了一个数量级。也就是说同一套方块在两种主题下的存在感差异很大。要拉平的话，得让 `tileColor` 跟着主题走（`body.light` 里覆盖 `--mosaic-tile-color`）。这一点还没做。
---

# P14 #contact：实色带与黑方块同色

## 改动

上一轮我顺手把 `#contact` 的**实色带**也刷成了 `--bg-alt`，那超出了原本的要求（原话是「把 section 容器的**背景**改成 #projects 的颜色，保留黑方块」）。这一轮改回来：

```js
// mosaic.js —— #contact
color: 'var(--black)',        // 实色带 = 黑，与方块同色
tileColor: 'var(--black)',    // 方块 = 黑
```

两者都显式写成黑。现在分工是：

| 变量 | 控制谁 | #contact 的值 |
|---|---|---|
| `--mosaic-color`（`color`） | `.mosaic-layer::before` 实色带 | `#000` |
| `--mosaic-tile-color`（`tileColor`） | `.mosaic-tile` 方块 | `#000` |
| `#contact` 的 CSS `background` | 方块**之间**露出的底色 | `var(--bg-alt)` = `#191919` |

## 1920×1080 下的实际构成

```
section 宽 1845px（= 100vw − 侧栏 75px）

  x = 0 ─────────────── 553 ────────────────────────── 1845
  │  底色 #191919 + 约 17 个黑方块  │      实色带 #000     │
  └────────── 左侧 30% ───────────┴────── 右侧 70% ──────┘
              ↑ 方块只在这一侧生成         ↑ 从 --band-left 铺到右边缘
```

色带与方块同色之后，靠近分界线的方块会**自然融进色带**里 —— 分界线不再是硬边，而是从「散落的方块」过渡到「实心」。

## 想切换的话

- **整块都是 `--bg-alt`、只有方块是黑的**：把 `color` 换成 `'var(--bg-alt)'`（色带与底色同色 → 看不见色带）。
- **整块都是黑**：把 `#contact` 的 CSS `background` 也换成 `var(--black)`，或者把 `--band-left` 设成 `0%`（但后者会让方块几乎不再生成，因为方块只在分界线左侧生成）。
---

# P15 #media：四列面板（绘画 / 建模 / 编曲 / 游戏开发）

## 参考类逐段对应

参考站那串 utility 我拆成了你的令牌，对应关系如下：

| 参考类 | 含义 | 这边怎么落 |
|---|---|---|
| `flex w-full h-[70dvh] flex-col` | 手机：满宽、约 70dvh 高、纵向排列 | `display:flex; flex-direction:column; min-height:60dvh` |
| `justify-between` | 编号贴顶、正文贴底 | `justify-content: space-between` |
| `gap-10` | 上下两组的间距 | `gap: 4vh`（桌面 `0`，因为两端已经撑开） |
| `border-[#5f5a54]` | 一个中性的暖灰细线 | `--panel-line`（深色下是淡红，见下） |
| `border-b px-5 py-8` | 底部边框 + 内边距 | `border-bottom` + `padding` |
| `last:border-b-0` | 最后一个不要底线 | `.media-panel:last-child { border-bottom: 0 }` |
| `md:h-full` | 桌面撑满高度 | grid 行高 `1fr` + 容器 `flex:1` |
| `md:w-[calc(40_*_var(--scale))]` | 桌面固定列宽（按等比单位） | **改成 grid 等分**（见下面的说明） |
| `md:shrink-0` | 不参与收缩 | grid 单元格天然不收缩 |
| `md:border-b-0 md:border-l` | 桌面把底线换成左线 | 媒体查询里覆盖 |
| `md:p-(--vg)` | 内边距用统一的锚点变量 | `padding: var(--panel-pad)` |
| `relative group overflow-hidden` | 悬停揭示的容器 | `position:relative; isolation:isolate; overflow:hidden` + `:hover` |

## 唯一一处偏离：用 grid 等分，而不是固定列宽

参考站用 `calc(40 * var(--scale))`（`--scale = 100vw/144`）给每列一个**按视口等比换算的固定宽度**，列数多了就让整行横向溢出、靠横向滚动看。

这套在你这里不合适：你的 `#media` 是**固定一屏**的横向面板，里面正好 4 列 —— 用 `1fr` 等分等价，而且以后加第 5 个类别不用改宽度；窄屏还能自动退回两列。

**想换成参考站那种固定列宽**（列宽恒定、行可横向滚动）就改两行：

```css
.media-panels { display: flex; flex-direction: row; overflow-x: auto; }
.media-panel  { flex: 0 0 calc(40 * var(--unit)); }   /* 需要先定义 --unit */
```

## 响应式：1 → 2 → 4 列

| 断点 | 列数 | 说明 |
|---|---|---|
| `< 769px` | 1 | 纵向堆叠，每格 `min-height: 60dvh` |
| `769 ~ 1099px` | 2 | 两列 × 两行，避免四列被挤成细缝 |
| `≥ 1100px` | 4 | 四列并排 |

四列时每格 ≈ `(100vw − 75px) / 4`，在 1920 上是 461px、内容宽约 380px —— 够用。这就是 `--panel-pad` 取 `--gutter × 0.75` 的原因（页面 gutter 在四列里太奢侈）。

## 新增的令牌

```css
--panel-line: rgba(225, 25, 25, 0.25);   /* 深色主题：面板分隔细线 */
--panel-line: rgba(170, 30, 30, 0.30);   /* :root.light 里覆盖 */
--panel-pad: calc(var(--gutter) * 0.75); /* 面板内边距 */
```

刻意**不用** `--border`（`#E13232` 那个高饱和红）—— 四列并排会有很多条线，高饱和会把版面切碎。

## 悬停揭示

`.media-panel-bg` 现在是一层**零素材**的点阵 + 红色渐变（复用已有的 `--halftone-color`），`opacity: 0 → 1` 且 `scale: 1.06 → 1`。

- 想换成真图：把 `<img>` 塞进 `.media-panel-bg` 里即可（`background-image` 换掉）。
- 悬停效果包在 `@media (hover: hover) and (pointer: fine)` 里，触屏不会残留 hover 态。

## 被替换掉的内容

原来的 `<audio controls>` + 两个 `.gallery` 占位块（都是 `_test.*`）已从 `#media` 移除。原样记在这里以便恢复：

```html
<h3>音频</h3>
<audio controls>
    <source src="assets/audio/_test.mp3" type="audio/mpeg" />
    您的浏览器不支持音频播放...
</audio>
<h3>建模</h3>
<div class="gallery"><img src="assets/images/_test.jpg" /><img src="assets/images/_test.jpg" /><img src="assets/images/_test.jpg" /></div>
<h3>绘画</h3>
<div class="gallery"><img src="assets/images/_test.jpg" /><img src="assets/images/_test.jpg" /><img src="assets/images/_test.jpg" /></div>
```

`audio` / `.gallery` / `.gallery img` 的 CSS 我**保留了**（暂时用不到），做浮窗时可以直接复用。

## 待办

- 面板文案（`手绘 / 速写 / 数字绘画`、`12 幅` 等）都是占位，等真实内容。
- 面板现在只是静态块，还没有点击行为 —— 接浮窗系统时，给 `.media-panel` 加 `data-work-type` 之类，由浮窗模块统一接管。
---

# P16 面板底图：居中 + 按上下铺满

## 改了什么

```css
.media-panel-bg img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    max-width: none;          /* ★ 解除全局 img { max-width: 100% } */
    object-fit: cover;
    object-position: center;
}
```

`.media-panel-bg` 也补了 `overflow: hidden`（它整体会放大 1.06 做悬停动效，裁切范围要收在这一层里）。

## 为什么原来的图不是「按上下填充」

全局有一条 `img { max-width: 100%; display: block }`。它把图压到**面板宽度**以内、高度按比例缩 —— 于是约束变成了「宽度」，图只占面板高度的一小截（461px 宽的面板里，16:9 的图只有 259px 高）。

所以关键是两件事：**显式写 `width/height: 100%`**，并且 **`max-width: none` 解除那条全局规则**。

## 为什么 `object-fit: cover` 就等于「基于上下填充」

`cover` 取「较大的那个缩放系数」，等价于：

> 图片宽高比 **>** 面板宽高比 → 按**高度**缩放（左右被裁）
> 图片宽高比 **<** 面板宽高比 → 按宽度缩放（上下被裁）

你的面板是 **461 × 1080**，宽高比 **0.427**（很窄很高），所以：

| 图片比例 | 宽高比 | 按哪一维 | 渲染后 | 裁切 |
|---|---|---|---|---|
| 16:9 横图 | 1.778 | **按高度** | 1920 × 1080 | 左右各裁 730px |
| 3:2 横图 | 1.500 | **按高度** | 1620 × 1080 | 左右各裁 579px |
| 4:3 横图 | 1.333 | **按高度** | 1440 × 1080 | 左右各裁 490px |
| 1:1 方图 | 1.000 | **按高度** | 1080 × 1080 | 左右各裁 309px |
| 2:3 竖图 | 0.667 | **按高度** | 720 × 1080 | 左右各裁 130px |
| 9:16 竖图 | 0.563 | **按高度** | 608 × 1080 | 左右各裁 73px |
| 1:2.5 长竖图 | 0.400 | 按宽度 | 461 × 1152 | 上下各裁 36px |

**只要图片比面板「宽」（>0.427），就一律按高度缩放** —— 横图、方图、常见竖图全部命中，正是「基于上下填充」。

那最后一行呢？这是 `cover` 比「严格只按高度」更好的地方：

> 严格写法 `height:100%; width:auto` 遇到 1:2.5 这种长竖图，宽度只有 432px < 面板 461px，**左右会露出 29px 的空隙**。
> `cover` 会自动改成按宽度缩放，把它补满。

想换成严格写法（接受留缝），CSS 注释里已经写好了替换的几行。

## 两个连带影响

1. **`.media-panel-bg` 上原有的点阵 + 红色渐变现在被图盖住了**（图是不透明的）。那层装饰只在没有图的时候可见。想在图上面再加纹理/暗角，得另起一层，例如：
   ```css
   .media-panel-bg::after {
       content: "";
       position: absolute;
       inset: 0;
       pointer-events: none;
       background: linear-gradient(to top, rgba(0, 0, 0, 0.55), transparent 55%);
   }
   ```
2. **建议加暗角（scrim）**：悬停揭示的是照片，而编号/标题就压在上面，图一亮文字就容易糊。上面那段 `::after` 就是干这个的，要我加吗？

## 另外发现

`#media` 里的 `<h2>多媒体</h2>` 和 `.media-head` 包装被删掉了，所以 `.media-head` 那两条 CSS 现在是死代码。面板贴满整屏是合理的选择（参考站的 Services 区块也没有区标题），但如果想保留可访问性，可以放一个视觉隐藏的 `<h2>`。
---

# P17 面板底图：三层结构（图片 / 夹层 / 网点）

## 最终结构

```
.media-panel-bg                 （z-index:0，整体做悬停的淡入 + 放大）
├─ <img>                        z-index:0   图片本身，opacity 恢复 100%
├─ ::before                     z-index:1   半透明纯色夹层 background: var(--bg-alt)
└─ ::after                      z-index:2   网点渐变（上红 → 下透明）
```

三项伪元素/图片都显式写了 `z-index`，否则夹层插不进「图片与网点之间」（同为 `z-index:auto` 时按 DOM 顺序绘制，`::before` 会跑到图片**下面**）。

## 逐项改动

| 要求 | 落法 |
|---|---|
| 删掉底下的网点 | `.media-panel-bg` 上那条 `background-image`（点阵 + 红渐变）整段删除，规则现在保持干净 |
| 网点改成上红下透明 | 渐变停止点反转：`0.58 → 0.10(58%) → 0`（原来是 `0 → 0.10(42%) → 0.58`） |
| 图片改回 100% | 移除 `<img>` 上的 `opacity`，同时删掉已无用的 `--panel-img-opacity` 令牌 |
| 图片与网点之间加半透明纯色 | 新增 `.media-panel-bg::before`，`background: var(--bg-alt)` + `opacity: var(--panel-scrim-alpha, 0.5)` |

**夹层的颜色没有写死**：用的是 `var(--bg-alt)` 配 `opacity`，所以亮/暗主题会自动跟着走（`--bg-alt` 在 `:root.light` 里是 `#e5e5e5`、深色下是 `#191919`）。只留 `--panel-scrim-alpha` 一个旋钮。

## 副作用（可接受）

`.media-panel-bg` 本来那层装饰是"没有图片时的兜底"。现在删掉之后，**将来某格不放 `<img>` 的话，悬停只会浮现夹层 + 网点** —— 不再有红渐变。如果之后要留白格子，给那一格单独加背景即可。
---

# P18 网点渐变：0% 红 → 40% 全透明

```css
.media-panel-bg::after {
    background-image: linear-gradient(
        to bottom,
        rgba(225, 25, 25, 0.58) 0%,   /* 顶部最红 */
        rgba(225, 25, 25, 0)    40%   /* 40% 处全透明 */
    );
    -webkit-mask-image: radial-gradient(circle, #000 1px, transparent 1.5px);
            mask-image: radial-gradient(circle, #000 1px, transparent 1.5px);
    -webkit-mask-size: 5px 5px;
            mask-size: 5px 5px;
}
```

**只写了两个停止点**：CSS 渐变在最后一个停止点之后会一直沿用它的值，所以 40% ~ 100% 自动保持全透明，不需要再补一个 `100%` 的停止点。（原来那版是 `0 → 0.10(58%) → 0(100%)`，等于红色一直拖到底。）

两个旋钮：
- 顶部浓度：`0.58`（改这个）
- 衰减到透明的分界：`40%`（改这个，往上调 = 红色铺得更长）

配合 mask，网点的颜色天生带上这个上下透明度变化 —— 顶部是红点、40% 以下没有点。
---

# P19 面板固定宽度 + 永远单行（改回参考站的做法）

P15 里我「故意偏离」了参考站：用 `grid` 等分（1 → 2 → 4 列，会随窗口换行）。这一轮改回参考站那套 —— **固定列宽、永不换行**。

## 三处改动

```css
/* ① 面板宽度固定为视口宽度的百分比 */
--panel-w: 28vw;

/* ② 桌面：单行、不换行、容器宽度 = 4 只之和 */
@media (min-width: 769px) {
    .media-panels { flex-direction: row; flex-wrap: nowrap; width: max-content; }
    .media-panel  { flex: 0 0 var(--panel-w); }
}

/* ③ 让 #media 自己被撑宽（而不是锁死 100vw） */
@media (min-width: 769px) {
    #media { flex: 0 0 auto; width: max-content; }
}
```

第 ③ 条是关键，也是这边和参考站最大的结构差异：

- 参考站的 Services 区块写的是 `md:w-max` —— **区块本身被内容撑宽**，溢出交给整页的横向滚动；
- 你的 `#media` 原来是 `flex: 0 0 calc(100vw - var(--nav-width))`（锁死一屏）。如果只改 ①②，溢出的面板会**糊到隔壁 #contact 上**或者需要再套一层内部横向滚动。
- 改成 `width: max-content` 之后，4 只面板的总宽直接变成 `main` 的横向滚动距离 —— 复用你已有的滚轮/惯性/锚点那套，不需要新机制。

`4 × 28vw = 112vw` → 一行比视口宽出 12%，正好留出"还有更多"的暗示。

## ⚠️ 关于「2800px 宽时每只 110px」

这个数**在物理上放不下内容**：

2800×1440 时 `--gutter = clamp(24px, 5vh=72px, 72px) = 72px`，而 `--panel-pad = --gutter × 0.75 = 54px`（单边）。所以 110px 宽的面板，扣掉左右内边距后**内容区只剩 2px** —— 「游戏开发」四个字（约 128px）根本放不进去。

各种取值的实际后果（2800px 宽）：

| `--panel-w` | 每只宽 | 一行总宽 | 每只内容宽 | 结果 |
|---|---|---|---|---|
| `110px` | 110px | 440px（16%） | **2px** | ✘ 放不下 |
| `1100px` | 1100px | 4400px（161%） | 992px | ✔ |
| `20vw` | 560px | 2240px（82%） | 452px | ✔ 一行装得下 |
| `25vw` | 700px | 2800px（103%） | 592px | ✔ 刚好一行 |
| **`28vw`（当前默认）** | **784px** | **3136px（115%）** | **676px** | ✔ 略溢出 |
| `39.3vw` | 1100px | 4402px（162%） | 992px | ✔ 大幅溢出 |

我猜 `110px` 是 `1100px` 的笔误（对应 `39.3vw`）。默认先取 **28vw**（略溢出、留一点滚动暗示），改一个数即可。

## 移动端例外

`min-width: 769px` 以上才用固定宽度单行。**768px 以下是整站切竖屏布局的既有断点**，那里仍然纵向堆叠 —— 手机上 28vw 只有 105px，四只并排没法用。要"任何宽度都单行"的话，把 `#media`/`.media-panels`/`.media-panel` 那三条从媒体查询里提出来即可，但手机体验会很差。
---

# P20 主题切换的交叉淡入：不是失效，是「太短 + 曲线把变化压在前头」

## 诊断（三层原因叠在一起）

**① 曲线问题（主因）**：生效的是 `0.25s ease`。`ease` = `cubic-bezier(.25,.1,.25,1)`，它把变化全压在开头：

| 时间 | 已完成 |
|---|---|
| 50ms | 30% |
| **100ms** | **68%** |
| 150ms | 89% |
| 250ms | 100% |

**前 100ms 就走完 68%** —— 所以肉眼像"秒切"。换成 `cubic-bezier(.4,0,.2,1)` 之后，前 100ms 只走 **11%**，同样时长下过渡感强 2.5 倍以上。

**② 死代码**：`body` 规则里那条 `transition: background-color 0.1s` 被后面同特异性的 `0.25s` 整条覆盖，从来没生效过。

**③ 6 处表面根本不在过渡名单里**（硬切，叠加起来强化了"秒切"感）：卡片底色、时钟刻度 `stroke`、半调网点、马赛克色带、马赛克方块、技能标签边框。

**顺带排除**：本机 `MinAnimate = 1`（Windows 动画开着），所以不是被 `prefers-reduced-motion` 那条全局规则杀掉的。

## 改了什么

```css
--theme-dur: 0.55s;
--theme-ease: cubic-bezier(0.4, 0, 0.2, 1);
```

通用过渡规则改成令牌驱动，并补齐选择器；**故意只列颜色类属性**（`background-color` / `color` / `border-color` / `background-image` / `stroke`），不含 `transform` / `opacity` —— 否则会把准星、时钟指针、马赛克漂浮这些自己的动画一起拖慢。

新增进名单的：`.card` `.subtitle` `.card p` `.skill-list li` `.media-panel` `.media-panel-desc` `.media-panel-no` `.media-panel-meta` `.circle` `.mosaic-layer` `.mosaic-tile` `body::before` `body::after` `.media-panel-bg::before`。

### 两处「自家 transition 把通用规则盖掉」的补救

CSS 的 `transition` 是**一条整体声明**，后面的规则会整条覆盖前面 —— 检查时发现两处被盖掉：

| 元素 | 它自己的 transition（在后面） | 补救 |
|---|---|---|
| `.card` | `transform 0.2s, border-color 0.2s` | 把 `background-color` 合并进去 |
| `#about .container` | `transform 1s, box-shadow 1s` | 把 `background-color` / `border-color` 合并进去 |
| `.media-panel-bg::before` | 伪元素**不继承**父级的 transition | 单独把 `::before` 列进通用规则 |

`stroke` 也是同理：它挂在 `.circle-ticks line`（子元素）上，所以过渡必须写在那条已有规则里 —— 父级 SVG 上的 `transition` 管不到子元素。

## 减少动效下的例外

原来 `@media (prefers-reduced-motion: reduce)` 里的 `* { transition-duration: .01ms !important }` 会把换色淡入也一起杀掉（对这类用户就是硬切）。

**但换色不是"动效"** —— 它不产生位移或缩放，不引起前庭不适；反而硬切一下对光敏感的人更刺眼。所以在这个媒体查询里把交叉淡入单独恢复：

```css
@media (prefers-reduced-motion: reduce) {
    /* ...原来的 * { transition-duration: .01ms !important } 保留... */
    body, .navbar, .footer, main, .section.alt-bg, #about .container,
    .digital-clock, .card, .skill-list li, .mosaic-layer, .mosaic-tile, .circle {
        transition-duration: var(--theme-dur) !important;
    }
}
```

（两条都带 `!important` 时，特异性 0,0,1 高于 `*`，所以这条胜出。）

## 调法

只改 `--theme-dur` 一个数：`0.35s` 更利落、`0.8s` 更绵长。改 `--theme-ease` 可以调曲线手感。
---

# P21 浮窗系统：作品查看器（`<dialog>` + 惰性 iframe + View Transitions + 数据驱动）

## 为什么做这个

这是「功能缺口」而不是打磨：`index.html` 里那段 `<section id="game">` 早就被注释掉了，
点卡片、点四只多媒体面板**什么都不会发生**（原来卡片上那个 `<a href="#" class="link">` 点了只会跳回页首）。
Unity 两套构建共 **37.4MB** 躺在 `assets/unityGame/` 里，从来没有被页面加载过。

按你定的默认方案落地：`<dialog>` + iframe 惰性注入 + `startViewTransition` + `data/works.js` 数据驱动。

## 新增 / 改动

| 文件 | 说明 |
|---|---|
| `data/works.js` ★新增 | 唯一数据源，7 件作品 4 种 `kind` |
| `js/floating-window.js` ★新增 | 浮窗控制器（410 行） |
| `index.html` | 加 `<dialog>` 骨架、卡片/面板加 `data-work`、引入两个脚本 |
| `css/style.css` | `:root` 加 `--win-*` 令牌；文件末尾新增第 8 节（约 690 行） |
| `js/world.js` | 新增 `World.pause() / resume()` |
| `js/main.js` | 滚轮处理器加一条早退 |
| `_dev/check.js` ★新增 | 开发自检，`node _dev/check.js` |

## 七个决策，都踩过或差点踩到

**① 为什么是 `<dialog>` 而不是自绘 div**
`showModal()` 一次给到四样东西：焦点陷阱、背景 `inert`、ESC 关闭、关闭后焦点自动回到触发元素。
自己写这四样要几百行且极易漏 aria。另外它在 **top layer**，天然盖住全站所有 z-index
（准星 9997、刻度尺 99999、粒子 9996 一个都不用改）。

**② `display` 只能写在 `[open]` 上 —— 这条错了整站都点不动**
UA 靠 `dialog:not([open]) { display: none }` 隐藏浮窗。它和 `dialog.win` **同权重**，
而我们的规则在后面 —— 如果无条件写 `display: flex`，关掉的浮窗会永远铺在页面上、
`pointer-events` 全部吃掉，看起来就是"网站死了"。所以只写 `dialog.win[open] { display: flex }`。

**③ 用自绘 `.win-scrim` 替掉 `::backdrop`**
三个原因：View Transitions **拍不到 `::backdrop`**（它不在 DOM 树里，快照里没有）；
伪元素没法用 class 控制进出场；还要跟 UA 那条 `::backdrop { background: rgba(0,0,0,.1) }` 打架。
换成 dialog 内部一个 `position: absolute; inset: 0` 的 div 之后，压暗层和面板是**同一个
`view-transition-name` 组**，一起进出，动画天然同步。

**④ 浮窗必须放在 `.page-zoom` 外面**
`<dialog>` 是 `position: fixed`，而 `.page-zoom` 身上挂着开屏那份 `transform` ——
有 transform 的祖先会成为 fixed 子元素的**包含块**，浮窗会被它带着缩放 / 定位错位。
（这和 P0 第 9 条是同一个坑：`.page-zoom` 的 transform 把整套 HUD 的 fixed 定位吃掉了。）
所以 `<dialog>` 是 `<body>` 的直接子元素，并且 `data/works.js` / `floating-window.js`
两个 `<script>` 放在它**之后** —— 控制器在 IIFE 里就直接查 `#work-window`，放前面会查不到。

**⑤ iframe 惰性 + 关闭即销毁**
Unity 的 WebGL 上下文很贵：一个构建 14~23MB，两个一起留着会吃显存、还会拖低帧率。
所以是「打开才建、关闭就 `bodyEl.replaceChildren()` 拔掉」。代价是**游戏进度不保留**
（想保留就改成缓存一个 iframe 不销毁，两行的事，见文件里的注释）。

**⑥ 打开期间必须把系统光标还回来**
全站是 `* { cursor: none !important }` + 自定义准星。而 **iframe 里的 `mousemove` 不会冒泡到父页面** ——
准星会卡在边框上不动，用户在游戏里就没有光标可用了。所以：

```css
body.window-open,
body.window-open * { cursor: auto !important; }   /* 特异性 0,1,1 压过 * 的 0,0,0 */
body.window-open .crosshair-h,
body.window-open .crosshair-v,
body.window-open .cursor-dot { opacity: 0 !important; }
```

**⑦ 打开时顺手停掉 World 主循环（新增 `pause/resume`）**
面板背后那些粒子 / 视差 / 时钟完全看不见，却还在每帧跑，白抢 CPU。
`World.pause()` 里加了一个 `paused` 标志位，`start()` 里早退 —— 不然 `visibilitychange`
或者之后任何一次 `onFrame()` 注册都会把它偷偷重启。

```js
function start() { if (paused) return; ... }   // 暂停期间谁也别想偷偷重启
function pause()  { paused = true;  stop(); }
function resume() { paused = false; start(); }  // frame() 里 lastNow = 0，不会跳一大步
```

## 开关动画：两条路径

```js
canVT()  // document.startViewTransition 存在 且 用户没要求减少动效
```

**有 VT**：`startViewTransition(() => { dialog.showModal(); dialog.classList.add('is-in'); })`。
注意 `is-in` 是在**同一拍**加上的 —— 元素刚从 `display:none` 变成渲染态，CSS transition 根本不会跑，
画面直接是终态，动画交给快照。CSS 那边 `::view-transition-old/new(work-window)` 各自定义进出场，
并且**故意把 `root` 的动画关掉**：

```css
::view-transition-old(root), ::view-transition-new(root) { animation: none; }
```

整页并没有变化，让 root 默认交叉淡入会出现"整页闪一下"的错觉。

**没有 VT**（Safari < 18 / Firefox）：退回纯 CSS 过渡。入场是 `showModal()` 之后
**等两帧**再加 `is-in`（`raf2`），否则 `display:none → block` 这一拍不产生过渡、面板会硬出现；
退场是「先撤 `is-in` → 等 240ms 过渡跑完 → 才真的 `close()`」，因为 `close()` 一调用元素就没了。

**降低动效**：`canVT()` 直接返回 false，且 `close()` 跳过 240ms 等待 —— 硬切。

## 顺手修的几处

| 项 | 说明 |
|---|---|
| 滚轮穿透 | 浮窗开着时，`main.js` 那套惯性滚动会被滚轮喂饱：浮窗里滚不动、背后的 `main` 却在横向漂。加一条 `if (body.window-open) return;`（不拦截，交给浏览器滚浮窗自己的内容区） |
| `.win-body { overscroll-behavior: contain }` | 滚到底不要传给外面的 `main` |
| `#media` 补 `<h2 class="sr-only">多媒体</h2>` | 你删掉 h2 之后这一节在屏幕阅读器里是个**没有名字的 section**。没有把 `<h2>` 大张旗鼓加回去（会挤掉面板高度、改变你定的版式），而是用 `.sr-only` 补语义、不动版面。`.media-head` 那两条 CSS 仍然是死的 —— 要不要真的加回视觉标题，你定 |
| 卡片里的假链接 | `<a href="#" class="link">` 换成 `<span class="card-open">查看 ↗</span>`：`href="#"` 会跳回页首，而且 `article` 里嵌 `<a>` 的话整卡点击的语义会打架。`.card .link` 那几条 CSS 从此也成了死代码 |
| 装饰 canvas | 5 个 canvas 补 `aria-hidden="true"`（屏幕阅读器眼里它们是空的、无意义的） |
| `<img alt>` | 面板底图和卡片封面原来只有"占位符"，现在写明是什么的占位图 |
| 卡片可键盘操作 | `role="button" tabindex="0"` + 回车/空格（委托在 document 上，`Enter`/`Space` 都能开） |

## 怎么用 / 怎么改

```js
// 加一件作品：data/works.js 里加一个对象，HTML 上挂 data-work="新 id" 即可
{ id: 'xxx', kind: 'gallery', title: '…', shots: [{ src: '…', caption: '…' }] }
```

`kind` 四种：`unity`（惰性 iframe）/ `gallery`（网格 + 点开大图）/ `audio`（曲目列表 + `<audio>`）/
`list`（一列按钮，点开另一件 —— 现在 `#media` 的"游戏开发"用的就是它）。

调版式只动 `:root` 里那组：`--win-w / --win-h / --win-pad / --win-scrim / --win-dur-in / --win-dur-out`。

## 验证：46 项自检

这台机器上 **headless Edge 起不来**（`mojo platform_channel: 拒绝访问`，沙箱里建不了命名管道），
装不了 jsdom（无外网），所以写了个 **极简 DOM 桩**把控制器真跑一遍：

```
node _dev/check.js     →  46 项全过
```

覆盖：静态（HTML 标签平衡 / `data-work` 与 `works.js` 对得上 / 素材存在 / 骨架没被改名 /
CSS 括号平衡 / **`var()` 全都有定义或兜底或由 JS 注入** / **每个 `animation` 名都有对应 `@keyframes`**）
＋ 行为（开·关·就地换作品 / 四种 kind 的渲染 / iframe 惰性建与销毁 / `World.pause·resume` /
点卡片委托 / 点图放大 / 点遮罩 / ESC / VT 分支 / 降低动效分支）。

那个 `var()` 审计和 `@keyframes` 审计建议**以后每轮都跑**：P0 那批 bug 里有两条
（`.circle-ticks` 引用了不存在的 keyframes、`font:` 简写非法被整条丢弃）都是这类静态错误，
肉眼 review 很容易漏。

> 桩是手写的，和 `index.html` 会漂移 —— 所以 `check.js` 第 [1] 部分专门断言了
> `work-window / win-scrim / win-scrim / win-no / win-ext / win-badge / win-panel / win-bar`
> 这些名字还在。

## 还没做 / 有风险

1. **View Transitions 的浏览器覆盖**：Chrome 111+ / Safari 18+ / Firefox 还没上。
   没 VT 的浏览器走 CSS 过渡兜底，观感差别不大，但**建议你在 Safari 真机上确认一次**
   （尤其 `view-transition-name` 挂在 top layer 的 `<dialog>` 上这一条，我只在 Chrome 内核上验证过思路）。
2. **Unity 首次载入 14~23MB**，没做进度条（iframe 只有 `load` 事件，拿不到字节进度）。
   真要进度条得换成自己 fetch + UnityLoader 回调，那是另一件事。
3. `data/works.js` 里的**文案、图片、音频全是占位**（`_test.jpg` / `_test.mp3`），
   `placeholder: true` 的会在标题旁挂一个「占位」角标提醒。
4. `js/main.js` 553 行还没拆；`_dev/check.js` 需要装 Node 才能跑。

## 待办变化

- ✅ 划掉「浮窗系统」
- 剩下的高优先项：**HuXiaoBo.otf 3.2MB 子集化**（这台机器上没有 fontTools / 无外网，
  这轮做不了 —— 你在有网的机器上 `pip install fonttools` 然后
  `pyftsubset assets/fonts/HuXiaoBo.otf --text-file=<收集到的字> --flavor=woff2` 就行，
  记得同时改 `style.css` 的 `@font-face` 和 `index.html` 的 `preload`）
- 其余照旧：占位文案、`--panel-w` 定值、`main.js` 拆分、命名清理、可访问性剩下的几条
---

# P22 技能页（#skills）改成「容器左上角的文字说明」

## 要求

`id="skills"` 这一节用来放**文字说明**：
文字从**容器左上角**开始铺，且**首行盒顶与左侧导航栏 logo 的盒顶齐平**。

## 原来是什么样

```css
.section        { justify-content: center; }            /* 内容被顶到正中央 */
.section .container { margin: auto 0; }                  /* 上下 auto，再居中一次 */
```

所以 `#skills` 的标题和列表是**整块居中**的，离左上角很远。

## 改了什么

**① 新增一个光学微调令牌**（跟 `--nudge-logo` / `--nudge-clock` 放在一组）：

```css
--nudge-skills: 0px;
```

**② `#skills` 两条规则**（`.section` 通用规则一行没动，其它几节还是居中）：

```css
#skills {
    justify-content: flex-start;
    /* ★ logo 的盒顶 = .navbar 的 padding-top，所以这里抄同一个表达式 */
    padding-top: calc(var(--gutter) + var(--nudge-logo) + var(--nudge-skills));
}

#skills .container {
    margin: 0;                 /* 顶掉 .section .container 的 margin: auto 0 */
}
```

**③ 正文收窄到 42em**（`#skills .skills-text`）。容器本身**仍是 960px** ——
标题那根红竖条要和其它几节落在同一条竖线上；收窄的只是"读的部分"，一行 60em 太长了。

**④ `index.html`**：`<h2>` 下面多套一层 `<div class="skills-text">` 当正文区，
塞了一段明确标着"占位"的自我介绍（原来的 `<ul class="skill-list">` 原样保留在里面）。

## 对齐是怎么算出来的

| 要对的边 | 表达式 |
|---|---|
| logo 盒顶 | `--gutter + --nudge-logo`（就是 `.navbar` 的 `padding-top`） |
| 技能页首行盒顶 | `#skills` 的 `padding-top`（section 顶 = 视口顶，因为每节都是 `height: 100dvh` 且 `main` 没有上边距） |

两者写成同一个表达式 → 改 `--gutter` 时**永远同步**，不需要去两个地方改数字。

## 顺带修掉一个老问题

`.section` 是 `overflow-y: auto` 配 `justify-content: center` —— 这是 flex 居中的经典坑：
**内容一旦超过一屏，顶部会被裁掉，而且滚不上去**（能滚的区间在下方，顶部那段永远够不着）。
TODO 里"`.section` 居中 + `overflow-y:auto` 的顶部裁切"那条就是它。
`#skills` 改成 `flex-start` 之后正常了。

**其它几节没动** —— 它们的内容现在都没超过一屏，暂时看不出来；等哪节内容变长了，
照 `#skills` 这样改一遍就行（或者把 `.section` 通用规则一起改掉，那要整体看一眼）。

## 两个 3 秒可调的点

1. **要"看着齐"而不是"盒顶齐"**：`h2` 是 1.8rem、logo 是 1.4rem，盒顶严格相等时，
   字迹顶边会差 `(1.8-1.4) × 0.466em ≈ 3px`（半行距 + ascent 到 cap 的那段差值，同字体同 line-height）。
   把 `--nudge-skills` 设成 `-3px` 起步，看着调。
2. **段落 vs 标题的左边缘**：`.section h2` 有 `padding-left: 14px`（给红竖条让位），
   所以正文段落（0）会比标题文字（14px）多出 14px 的左边距 —— 这跟 `#about` 那节本来就一样。
   要段落也缩进到和标题文字齐平，加一条 `#skills .skills-text { padding-left: 14px; }`。

## 验证

`node _dev/check.js` → 46 项全过（含 HTML 标签平衡、`var()` 审计 —— `--nudge-skills` 已登记）。
---

# P23 技能页改纯散文 + 把「正文距视口顶 / 底 10~15vh」做成一条规格

## 要求

1. `#skills` 改成**纯散文**（没有 `h2`、没有标签列表）；
2. **页面上所有文本**距离视口顶端 / 底端各约 **10~15vh**。

## 为什么必须拆变量

原来垂直和水平共用一个 `--gutter`：

```css
--gutter: clamp(24px, 5vh, 72px);          /* 5vh —— 同时管纵向留白和左右留白 */
.section { padding: var(--gutter) var(--gutter) var(--safe-b); }
```

正文要 10~15vh、左右留白要 5vh —— **一个变量满足不了两个数**：改垂直会顺带改水平，
改水平又会顺带改垂直。所以按"一条轴一个变量"的老原则拆开：

```css
--v-inset: clamp(48px, 12vh, 320px);   /* 新：正文距视口顶 / 底 */
--gutter:  clamp(24px,  5vh,  72px);   /* 旧：只管左右留白 */
```

`--v-inset` 取 10~15vh 的中值 **12vh**，两头套 clamp 防止极端窗口把留白挤没 / 撑爆：
窗口矮于 400px 兜在 48px，高于 2666px 兜在 320px，中间一律就是 12vh。
**想要 10vh / 15vh，只改这一个数。**

## 改了什么（一条对齐链）

| 元素 | 表达式 | 作用 |
|---|---|---|
| `.section` / `.hero` `padding-top` | `var(--v-inset)` | 正文顶 = 视口顶 + 12vh |
| `--safe-b` | `calc(var(--ruler-h) + var(--v-inset))` | 正文底 = 视口底 − 12vh（再让开 8px 刻度尺） |
| `.navbar` `padding-top` | `calc(var(--v-inset) + var(--nudge-logo))` | 左上角 logo 与正文首行**同一条线** |
| `.digital-clock` `--clock-y` | `calc(var(--v-inset) + var(--nudge-clock))` | 数字时钟也在这条线上 |

四处抄的是**同一个表达式**：以后改 `--v-inset`，整站的顶线一起走，不会散。

## 还改了两处「不然规格不成立」

**① `.section { justify-content: center → flex-start }`**
居中时"距顶 12vh"只是个**最小值** —— 内容短就被顶到更下面去了。
（顺带：`center` + `overflow-y: auto` 是经典坑，内容超过一屏时顶部会被裁掉且滚不上去。）

**② `.section .container { margin: auto 0 → 0 }`**
上下 `auto` 会在垂直方向**再居中一次**，正文照样顶不到那条线。横向居中不靠 margin，
靠 `.section` 的 `align-items: center`。

## `#skills`：纯散文

HTML 里只剩 `<div class="skills-text">` + 两段占位正文（`h2` 和 `<ul class="skill-list">` 都删了）。
版式不用在 `#skills` 上写一行 —— 全由 `.section` 通用规则给。剩下两条：

```css
#skills { overflow-y: auto; }        /* ★ 见下面「一个坑」 */
#skills .skills-text {
    max-width: 42em;                 /* 容器仍 960px：左边缘和其它节对齐，只收窄"读的部分" */
    translate: 0 var(--nudge-skills);/* 光学微调，见下 */
}
```

**光学微调**：这一节首行是 1rem 正文，其它节首行是 1.8rem 标题。盒顶严格相等时，
**字迹**顶边会差 `(1.4−1.0) × 0.466em ≈ 3px`（对齐目标是 logo 的 1.4rem）。
要"看着齐"就把 `--nudge-skills` 设成 `+3px` 起步。用 `translate` 不用 `margin`：不参与布局。

## 一个坑：`.section.alt-bg { overflow: visible }`

`.section` 本来是 `overflow-y: auto`，但 `.section.alt-bg` 把它**改回了 `visible`**
（当初为了让马赛克色带 / 网点能溢出——P0 之前的遗留）。后果是：**这几节的内容一旦超过
100dvh，下半截会被 `body { overflow: hidden }` 吃掉，而且滚不到**。
`#skills` 现在可能装长文，所以单独给它加回了 `overflow-y: auto`。
`#projects` / `#contact` / `#about` 内容都还短，暂时没动 —— **哪天某一节内容变长了，记得加这一条。**

## 两个自己决定的、你可能想改回来的地方

1. **hero（首屏）没有顶对齐**：它是满屏居中的开屏标题，`justify-content: center` 我留着没动，
   只享受了"距顶至少 12vh"。要一起顶对齐就加 `.hero { justify-content: flex-start; align-items: flex-start; }`。
2. **移动端没跟着改**：`@media (max-width: 768px)` 里那条 `.section, .hero { padding: var(--gutter) 0 }`
   仍然是 5vh —— 手机上页面是纵向长滚，导航栏 sticky 在流内，"离视口顶 12vh"这回事不成立。
   要手机也 12vh，把那条里的 `--gutter` 换成 `--v-inset`。

## 验证

`node _dev/check.js` → **56 项全过**。这轮给自检补了 10 条：

- **垂直留白链**（9 条）：`--v-inset` 有定义 / `.section, .hero` 用它 / `--safe-b` = 刻度尺 + 它 /
  navbar 顶线用它 / 时钟顶线用它 / `.section` 是 flex-start / `.container` 不再上下 auto /
  `--gutter` 不再出现在纵向 padding 里 / 页面上已经没有 `skill-list`。
  以后再有人把链子改断，跑一次就报出来。
- **注释符成对**（1 条）：这轮我改注释时**真的写丢过一个 `*/`** ——
  CSS 从那一刻起把后面整段吞成注释，而括号检查也跟着失真（只报"少了 1 个 }"，完全指不到地方）。
  加了这条之后一眼就定位到了。
---

# P24 每一节：高度锁死，宽度随内容长

## 要求

页面上所有 section 容器**高度不变** —— 内容可以把容器**横向**拉长，但不能把它**拉高**。

## 结论：靠四个属性

```css
.section,
.hero {
    flex: 0 0 auto;                                 /* ① 不放大、不收缩 */
    width: max-content;                             /* ② 宽度按内容走 */
    min-width: calc(100vw - var(--nav-width));      /* ③ 但至少一屏 */
    height: 100dvh;                                 /* ④ 高度三件套 */
    min-height: 100dvh;
    max-height: 100dvh;
    padding: var(--v-inset) var(--gutter) var(--safe-b);
}
```

### 为什么高度要写三遍

| 只写… | 会被什么顶穿 |
|---|---|
| `height` | 以后谁加一句 `height: auto`、或者父级 `align-items` 一改，内容就能顶高它 |
| `min-height` | flex 项的**内容最小尺寸**（`min-height: auto` 的自动最小值）会顶穿它 |
| `max-height` | 内容照样会把盒子撑到 max 那一条线上 |

三个一起写，盒子在任何内容下都停在 `100dvh`。

### 为什么宽度是 max-content + min-width，而不是写死一屏

- 内容是窄的（`.container` 上限 960px）→ `min-width` 生效，**每节照样正好一屏**，
  和以前 `flex: 0 0 calc(100vw - nav)` 完全一样；
- 内容比一屏还宽（`#media` 那四只面板 = 4 × 28vw = 112vw）→ 这一节**自己变宽**，
  多出来的部分交给 `main` 横滚。

这就是「内容可以横向拉长它」。**顺带**：`#media` 原来要单独写一套
`flex: 0 0 auto; width: max-content` 覆盖，现在通用规则就是它想要的样子（那两条留着，冗余但无害）。

### `flex` 必须是 `0 0 auto`，不能有 shrink

总宽超过 `main` 时，`flex-shrink: 1` 的默认行为是**把每节压窄**（内容被挤变形、文字重新折行），
而这里要的是「节不变形，让 main 横滚」。

## 现状核对：原来真正会「长高」的只有手机

桌面其实本来就顶不高 —— `height: 100dvh` 是 definite 高度，flex 的自动最小尺寸只作用于**主轴**（这里是横向），
纵向根本管不着。所以这轮**桌面是零视觉变化**，只是把规格写显式了。

**真正会随内容长高的是移动端**：`@media (max-width:768px)` 里那句 `height: auto`
（那是故意的 —— 手机上是纵向长滚，不是一屏一格）。现在给它显式复位：

```css
@media (max-width: 768px) {
    .section, .hero {
        width: 100%;
        min-width: 0;        /* ★ 复位「至少一屏宽」 */
        max-height: none;    /* ★ 复位「最多一屏高」 */
        height: auto;
        min-height: auto;
        overflow-y: visible;
        padding: var(--gutter) 0;
    }
}
```

**不复位会怎样**：手机上内容超过一屏就被 `100dvh` 裁掉，而且滚不到。

## 高度锁死之后，超出一屏的内容去哪了

由**每一节自己的 `overflow`** 决定：

| 节 | overflow | 超一屏时 |
|---|---|---|
| `#about`、`#skills` | `overflow-y: auto` | 在这一屏里滚（内容够得到） |
| `#projects`、`#media`、`#contact` | `.section.alt-bg` 给的 `visible` | 溢出被 `main { overflow-y: hidden }` 裁掉 |

`.section.alt-bg { overflow: visible }` 是留给马赛克色带 / 方块外溢的（它们的 `left < --band-left`、
`top` 也都在节内，外溢量很小），没动它。
**哪一节以后要写长内容，给它补一句 `overflow-y: auto` 就行**（`#skills` 已经补过了）。

## 副作用要说清

- **视口宽 ≥ 约 1150px**：每节 `min-width` 都大于内容宽度 → 和以前一模一样，**没有任何变化**。
- **窄一点的桌面窗口**（≤ ~1150px）：内容比一屏宽时，这一节会比一屏**宽一点**，多出来交给 `main` 横滚。
  这正是「内容把容器横向拉长」的要求；代价是那一档宽度的横滚距离变了。
- **手机**：仍然是纵向长滚（上面那套复位）。

## 想反悔 / 想加严

- **让某一节永远不多长**：给它 `max-width: calc(100vw - var(--nav-width))`。
- **让所有节都必须恰好一屏**：把 `.section, .hero` 里的
  `width: max-content; min-width: …` 换回 `width: calc(100vw - var(--nav-width))`。

## 验证

`node _dev/check.js` → **60 项全过**。这轮补了 4 条锁规格的：

1. 高度三件套都写死 `100dvh`；
2. 宽度随内容长（`max-content` + 一屏的 `min-width`）；
3. `flex: 0 0 auto`（写了 shrink 就会把节压窄）；
4. 移动端把「一屏一格」复位（`min-width: 0` / `max-height: none` / `height: auto`）。

> 顺带一个自检本身的坑：文件里有 **8 个** `@media (max-width:768px)`（浮窗、前景粒子各自都有），
> 第 4 条断言一开始抓错了块（抓到最后那个浮窗的）。现在按「块里有没有 `.section,`」来认。
---

# P25 修 P23 埋的雷：`#skills` 里能上下滚，不是内容超过 100vh，是马赛克方块掉出去了

## 现象

`#skills` 那一节可以在容器里上下滚（左右也能滚一点），看起来像"内容高度超过 100vh"。

## 原因

**是我在 P23 给 `#skills` 加的那句 `overflow-y: auto`。**

`mosaic.js` 的 `CONFIG` 里，`#skills` 和 `#projects` / `#contact` 一样挂了一层
`.mosaic-layer`：

```js
{ selector: '#skills', opts: { gap: 160, sizeMin: 100, sizeMax: 500, jitter: 16, floatMax: 100 } }
```

方块的落点是：

```js
const rows = Math.ceil(H / cfg.gap) + 1;              // 多铺一行
const gy   = r * cfg.gap - cfg.gap / 2 + jitter;      // 最后一行的中心 ≈ H
tile.style.top = gy + 'px';  tile.style.width = size; // size 最大 500
```

最后一行的方块**中心就落在节底那条线上**，半径最大 250px，再叠上 `--dy` 最多 100px 的漂浮位移
—— 最远能掉到节底下方 **四五百 px**。

而 `.mosaic-layer` 是 `position: absolute`、`.section.alt-bg` 给了 `position: relative`，
所以它的包含块就是这一节；它 `overflow: visible`，方块的溢出会一路算到**最近的滚动容器**头上。

于是链条是：

```
方块溢出（约 400~500px）
  → .mosaic-layer 的 scrollable overflow
  → #skills 成了滚动容器（P23 那句 overflow-y: auto）
  → 你可以在这一节里往下滚四五百 px
```

**装饰性溢出被算进了滚动区** —— 这不是内容高，也不是 bug 在 mosaic，是"谁成了滚动容器"的问题。

顺带一条：`overflow-y: auto` 会把 `overflow-x: visible` 一起算成 `auto`（CSS Overflow 规定，
一个轴不是 visible 时另一个不能再是 visible）—— 所以左右也能滚一点，同一个原因。

## 修复

**让这一节不滚，把滚动交给正文列。** 正文列里没有任何装饰，不会被污染：

```css
/* 整节保持 .section.alt-bg 给的 overflow: visible：不滚、也不裁 */

#skills .container {
    max-height: 100%;     /* 上限 = section 的内容盒（100dvh − 上下留白） */
    overflow-y: auto;     /* 真写长了就在这里滚 */
}
```

为什么不干脆把 `overflow` 全删掉？删掉之后整节 `overflow: visible`，散文一超过一屏，
下半截会被 `main { overflow-y: hidden }` 裁掉而且**滚不到**（P23 想解决的正是这个）。
现在这样两头都占：**节不滚**（方块溢出只是画在节外，被 main 裁掉，和 P23 之前一样），
**长文能滚**（滚的是 960px 那一列，滚动条正好贴着文字右边缘）。

## 怎么自己确认（DevTools）

1. 选中 `#skills`，看 `scrollHeight` 和 `clientHeight` —— 之前差 ~400px，现在是 0；
2. 或者临时把 `#skills .mosaic-layer` 删掉再看：之前"多出来的高度"会立刻消失，
   这就证明那段滚动距离完全来自方块，和文字无关。

## 验证

`node _dev/check.js` → **62 项全过**，新增两条把这条规格钉住：

1. `#skills` **自己**不能有 `overflow`（方块会污染滚动区）；
2. `#skills .container` 必须有 `max-height: 100%` + `overflow-y: auto`。
---

# P26 会话汇总（交接用）—— P25 之后的全部改动

> **注意**：P25 之后我按"只报改了哪几个文件"的约定干活，**没再写 CHANGES**。
> 这一节就是那一段的完整记录。下次接手请先读这里。

## 一、规模（本轮结束时）

| 文件 | 行数 | 大小 |
|---|---|---|
| `index.html` | 408 | 19 KB |
| `css/style.css` | **3478** | 105.8 KB |
| `js/`（**17 个文件**） | — | — |
| &nbsp;&nbsp;`main.js` | 574 | 22.7 KB |
| &nbsp;&nbsp;`home-underline.js` ★新 | 96 | 5.6 KB |
| &nbsp;&nbsp;`draft-layer.js` ★新 | 76 | 3.4 KB |
| `_dev/check.js`（自检） | 453 | 25.7 KB |
| `CHANGES.md` | 1932 | 104.7 KB |

新增文件：`js/home-underline.js`、`js/draft-layer.js`、`_dev/davinci.html`、`_dev/mechanical.html`。
另：`data/works.js`、`js/floating-window.js`（P21）也在，但**当前被开关关掉了**。

## 二、逐项改了什么

### 1. 主题切换 → View Transitions（修掉帧）
- `js/theme-toggle.js`：能用 `startViewTransition` 就走「快照交叉淡入」，**一帧 DOM 都不用重绘**；老浏览器退回原来的逐元素过渡。
- `css/style.css`：新增 `html.theme-vt *` 临时关掉逐元素过渡（**必须**：新快照是改动后立刻拍的，不关会拍到过渡第 0 帧 → 观感变成"先不动、最后突然变色"）；VT 淡入时长接 `--theme-dur`。
- 掉帧主因记录：过渡名单里 `.mosaic-tile` 那一坨（最多 ~70 块、单块最大 500×500px），`background-color` 不是合成器属性 → 每帧重绘。

### 2. 时钟环与数字时钟
- 三环 `--k`：`1 / 0.95 / 0.90`（`--clock-r: 100vh`）。
- **数字时钟整个移除**：`index.html` 的 div、CSS 全套规则、`--nudge-clock` 令牌；`js/colck.js` 里那段死代码也清了（136 → 122 行）。

### 3. body 网点（`body::after`）
- 静态：**上下两条带** —— `linear-gradient(#000 0%, transparent 20%, transparent 80%, #000 100%)`；点阵画在 `background-image`（`var(--halftone-color)`）。
- **★ 教训**：不要用 `mask-composite: intersect` 把「点阵」和「渐变」求交 —— 多层 mask 求交在"第一层 + 初始背景"上各浏览器不一致，图层会整个变空（网点就是这样"肉眼不可见"过一次）。
- 动态：`.halftone-scan`（新元素）+ `::before`，**父子 mask 天然相乘**（外层管"哪里有点"、内层管"扫到哪"）→ 从 50% 中线向上下**单向发射**一条 `--scan-h` 高的扫描带，扫过处网点被叠一层同色点阵 = 透明度翻倍。用 `mask-position: 0 50% → 0 -50% / 0 150%`，`linear infinite` 不往复。

### 4. 开屏（新加两层 + 若干修）
- **时间线**（`js/timeline.js`）新增两条轨道：
  - `iris: { delay: 3.0, duration: 1.5 }` —— 起点**现算**为 `maskShrink.delay + 0.2`
  - `dots: { delay: 3.2, duration: 1.3 }` —— `maskShrink.delay + 0.4`（duration 取 1.3 是为了 `--t-total` 仍是 4.5s）
  - 加了 `sec()` 抹掉 `3.1999999999999997` 这种浮点尾巴
- **`.splash-化开`**（z 9997，红幕之下、准星之上）：纯色 `var(--text)`，两层**软边渐变 mask**（60/40），`mask-size` 从 `100% 50%` 收到 `100% 0%` → 从中线向上下化开。
- **`.splash-网点`**（z 9996）：网点画在 background，**复用同一个 `@keyframes splashIris`**，比上一层晚 0.2s。
- 两层都进了「等字体期间停表」名单（`html:not(.intro-armed) ...`），不写进去会跑偏。
- **body 缩放**改成多段关键帧（现有数值是手调过的）：`2 → 1.1（62.22%）→ 1.3（80%）→ 1`；`keyframe` 百分比不能用 `var()`，改时长要回手算。
- **★ 修「跳过开屏时缩放会跳」**：`skip()` 里不能再只 `updatePlaybackRate(5)`（到点 `intro-done` 会把动画整个砍掉，缩放停在半路被 `transform:none` 一把拉到 1）。现在改成：量出当前缩放 → 停掉原动画 → 300ms 补间落到 `scale(1)` → 330ms 后才加 `intro-done`；内联 `transform` 必须清干净，否则会盖住 `body.intro-done` 的 `transform: none`，`.page-zoom` 会一直当 fixed 子元素的包含块。
- **圆形指针**：默认 `opacity: 0`，`body.intro-done .cursor-dot { opacity: 1 }` + `transition: opacity .5s`。
- 中途做过又**撤掉**的：圆点当整屏红幕 + 阶段跳跃式收缩（会和红幕打架，已按需求撤销；点击收缩也一并撤了）。

### 5. `#home` 标题下划线 + media 红框（`js/home-underline.js`）
- 下划线是**独立固定元素** `.hero-underline`：`left: var(--nav-width)`、`width: calc(100vw - var(--nav-width))`、`transform: scaleX(var(--hero-line))` —— **不跟着文字滑走**。
- 右端被 `#media .media-panels` **钳住**：`len = clamp(0, min(长满, mediaEdge - barRight))`。长满的那一刻正好是 media 容器刚进入视口（两边都等于 `innerWidth`，不会跳）；此后线越来越短，media 贴住导航栏时归零。
- **media-panel 红框**：JS 给每个 `.media-panel` 注入 `.panel-frame`（4 条边放面板内部，跟着面板滚，不用每帧定位）；`--pf` 用 `clamp()` 分三段：**左 → 上+下同时 → 右**；`SLOW = 1.6` 放慢整体节奏。
- **★ 最大的坑**：`.hero-underline` 元素一度被放在**脚本之后** → `querySelector` 拿到 null → 模块开头 `if (!line) return;` 静默退出 → 变量从没写过 → 线永远 `scaleX(0)` 看不见。**元素必须排在脚本之前解析**（`_dev/check.js` 已加断言盯着）。

### 6. 制图框装饰（`js/draft-layer.js`，新）
- **点**：`.draft-frame` 四角刻线（位置全取布局令牌 `--v-inset / --gutter / --safe-b / --content-x`）+ 进度点 + 一颗 `step-end` 硬闪的点。
- **线**：刻线两条边、竖直轨道、推进线。
- **面**：导航栏里那条**竖排进度带** `.df-strip` —— 插进 `.nav-container`，`flex: 1` 撑满「nav 链接下方 → 页脚上方」（**关键**：`.nav-container` 必须 `height: 100%`，否则 flex-grow 没有可分配空间，会缩成内容高）。
- **数字**：`X 01845.00` / `38%` / `SHEET 01` / `SCALE 1:1`，等宽 tabular。
- **-90° 的做法**：不用 `transform: rotate(-90deg)` 转整块（容器宽高未知会横向溢出），改成**行列互换 + 文字各自 `writing-mode: vertical-rl; transform: rotate(180deg)`**（从下往上读）。
- 轨道 `scaleY` + `transform-origin: center bottom` = 自下而上；端点跟 `bottom: %` 上升。
- 顶部 `ENABLED` 开关，改 `false` 整块不注册。

### 7. 开发工具
- `_dev/check.js`：**46 → 75 项**。除行为测试外，重点是几条"规格锁"：垂直留白链（正文距顶/底 10~15vh）、高度三件套 100dvh、注释符成对、`var()` 审计、`@keyframes` 引用审计、主题 VT、开屏红幕/纯色层/网点层、`#home` 下划线、media 红框、制图框、**脚本顺序**。
  - 踩过的自检坑：`-like '*[debug]*'` 会被当字符集（删错过文件）；`@keyframes` 审计要把 `step-end` / `step-start` 放进白名单。
- `_dev/davinci.html` / `_dev/mechanical.html`：两套线条风格试验页（手稿 vs 机械图），没接进站点。

## 三、留着的坑与待办

1. **`CHANGES.md` 之前停在 P25** —— 就是这一节补上的。
2. **reduce-motion 里 `animation-duration: .01ms !important` 对 infinite 动画是反效果**（0.01ms + infinite = 每帧落在周期里的随机位置 = 乱跳）。已修的只有 `body::after` 和 `.halftone-scan::before`；**还欠**：`navGlow`（导航栏光带）、`tileFloat`（马赛克方块）、`blobPulse` / `blobWobble`（液滴）、`winLoading`。
3. **`mask-size` / `mask-position` 是绘制属性**：`.halftone-scan::before`、`.panel-frame` 的边都是每帧重算 mask / 变换。真机若掉帧，替代方案是「两态烘焙 + opacity 交叉淡入」（纯合成器）。
4. **`main.js` 574 行**，还没拆（原待办里的"准星 / 滚轮惯性 / 点击涟漪 / 骨架各自独立"仍然成立）。
5. **没在真机验证过**：View Transitions（Safari 18+）、`filter: url(#goo)`、`mask-composite`、多层渐变 mask 的软边插值。我这边 headless 浏览器起不来（mojo 通道被拒），全部靠 `_dev/check.js` + 算术验证。
6. 死代码：`.circle-1/2/3`（HTML 里只有 `.circle-ticks-*`）、`.gallery`、`.media-head`、`.card .link`、`.splash-遮罩` 的关键帧（元素不再用它自己演，`.splash-遮罩` 现在 `display:none`）。
7. 占位素材/文案照旧（`_test.jpg` / `_test.mp3`）。

## 四、跑一下就知道有没有坏

```
node _dev/check.js      # 75 项，全过说明静态规格 + 浮窗状态机都还在
```

---

# P27 字体子集化（3.17MB → 30.3KB）+ 降低动效补齐

> 这一轮做的是 P26「待办」里最建议先做的两条：① 字体子集化 ② reduce-motion
> 里那几条 infinite 动画。顺带把 P26 删数字时钟时留下的一个**真实遗漏**修了
> （开屏闸门一直在等一个全站没人用的字体）。

## 一、规模（本轮结束时）

| 文件 | 行数 | 大小 | 变化 |
|---|---|---|---|
| `index.html` | 413 | 19.4 KB | 408 → 413（换 preload） |
| `css/style.css` | **3548** | 110.1 KB | 3478 → 3548 |
| `js/`（17 个文件） | 2814 | — | 只有 `timeline.js` / `welcome.js` 动了 |
| &nbsp;&nbsp;`main.js` | 574 | 22.7 KB | 没动 |
| `_dev/check.js` | **653** | 37.8 KB | 453 → 653（**75 → 101 项**） |
| `_dev/glyph-set.js` | 215 | 8.6 KB | ★新 |
| `_dev/subset-font.js` | 293 | 14.3 KB | ★新 |
| `_dev/package.json` | 13 | 0.3 KB | ★新（只有一个 devDependency） |
| `_dev/glyph-manifest.json` | 1 | 3.4 KB | ★新（生成物） |
| `assets/fonts/HuXiaoBo-subset.woff2` | — | **30.3 KB** | ★新（生成物） |
| `CHANGES.md` | 2019 → 2269 | 128.0 KB | — |

新增依赖：只在 `_dev/` 里，`npm install` 装 9 个包 / 3.4MB（`subset-font` =
harfbuzz wasm + wawoff2）。**站点本身依然是零依赖、无构建步骤。**

## 二、逐项改了什么

### 1. 字体子集化：3,168.1 KB → 30.3 KB（原体积的 0.96%）

原字体 `HuXiaoBo.otf` 是 TrueType flavored（`glyf` 表，不是 CFF），共
**7409 个字形**（一整套 CJK），而站点真正用到的只有 **346 个码位**。

- **为什么这条最值钱**：这个字体正是 P3 那条**开屏闸门**在等的东西。
  3.2MB 下完之前，那行巨大的 WELCOME 先用系统字体渲染、字体到了再当着用户
  的面重排一次。30KB 基本瞬间到位 —— 闸门还在，但正常情况下已经不会真的"等"
  了。**这比任何预加载、任何时序微调都有效。**

- **怎么做**：`_dev/glyph-set.js` 收集"页面上会被渲染到的字"，`_dev/subset-font.js`
  调 `subset-font`（harfbuzz wasm）出 woff2。

- **★ 关键点一：收集时**不能**把源码里所有字符都拿来用。**
  `style.css` 有 3500 多行、`js/*.js` 也有大量中文注释，这些字永远不会显示，
  却能轻松把子集从 30KB 撑到几百 KB —— 等于白做。所以
  `_dev/glyph-set.js` 里写了个小扫描器（状态机，不是正则）：
  - `index.html` → 去注释 / `<script>` / `<style>` 后剩下的文本节点 + 会显示的属性
  - `js/`、`data/` → 剥掉注释和正则字面量，只取字符串与模板串
  - `css` → 只取 `content: "…"`

  用**状态机**而不是正则抠注释，是因为 `'https://…'` 里的 `//`、正则里的
  `/*` 都会骗过正则版。`check.js` 里留了 3 条扫描器回归断言盯着这件事。

- **★ 关键点二：兜底必须另起一个 family 名。**
  结构是三层的：

  | 层 | family | 文件 | 什么时候被下载 |
  |---|---|---|---|
  | 1 | `HuXiaoBo` | `HuXiaoBo-subset.woff2` 30KB | 总是（这就是常态） |
  | 2 | `HuXiaoBo-Full` | `HuXiaoBo.otf` 3.2MB | **只在子集缺某个字形时** |
  | 3 | `system-ui` … | — | 前两层都没有时 |

  字体栈写成 `"HuXiaoBo", "HuXiaoBo-Full", system-ui, …`。
  **不能**把兜底那条写成同一个 `'HuXiaoBo'` 名字：两条同名 `@font-face`、
  后一条又不带 `unicode-range` 时，按规范**后声明的会赢**，子集就永远轮不上。
  用 `unicode-range` 写补集也不行 —— 原字体有 3623 段，补集写进 CSS 就是
  几十 KB 的文本，比字体本身还大。

  这样即使将来加了新文案又忘了重裁，页面也**不会缺字**（只是那一次会拉
  3.2MB 原字体），代价可控。想彻底瘦身/删掉 3.2MB 原文件的话，
  就得接受"忘重裁 = 回退系统字体"这个风险，那时 `check.js` 那条断言就是唯一的防线。

- **★ 关键点三：`preload` 必须跟着换。**
  原来 `index.html` 里 preload 的是 `HuXiaoBo.otf`。不换的话浏览器照样把
  3.2MB 拉下来 —— 字体裁了等于白裁。现在 preload 的是子集 woff2
  （`type="font/woff2"`，`crossorigin` 照旧不能省）。

- **★ 关键点四：度量必须逐项一致，否则整套版式会静默错位。**
  这个站点有两处依赖字体度量：
  - `js/welcome.js` 用 canvas `measureText('400 100px "HuXiaoBo"')` 量
    WELCOME 的宽度，反推 `--welcome-fs` / `--tagline-fs` / 拉伸倍数；
  - `css` 里 `--splash-ink-nudge` 的 `0.062em` 是从 hhea 的 **859 / 188**
    手算出来的（见 P12）。

  所以 `subset-font.js` 收尾会**验四遍**，任何一条不过就不写文件：

  | # | 验什么 | 本次结果 |
  |---|---|---|
  | 1 | cmap 覆盖：请求的码位一个不少 | 346 / 346，缺 0 |
  | 2 | glyf 轮廓：逐字形比字节（防"看着在、其实是空壳"） | 345 个全同，0 不同 |
  | 3 | 度量：`unitsPerEm` / hhea / OS/2 逐项相同 | `1000`、`859/-188/0`、`826/-188/100`、`856/188` 全同 |
  | 4 | hmtx 字宽：每个字的字宽相同 | 346 个全同 |

  第 3 条跑出来的 `hheaAscender=859 hheaDescender=-188` 正好就是 CSS 里
  那个补偿常数的来源 —— 对上了，说明补偿依然有效。

- **改文案之后要做什么**：`node _dev/subset-font.js` 重裁一次。
  忘了也不要紧：`check.js` 会报「页面文案的字全在子集里」失败，并直接告诉你
  缺哪个字、该跑哪条命令。（这条断言我做了正反两次验证：注入一个 `龘` →
  精确报出 `龘(U+9f98)` 并 exit 1；按提示重裁 → 又全过。）

- **★ 关键点五：原字体也有它自己没有的字形 —— 兜底必须写 `unicode-range`。**
  这是我做完之后回头审才发现的，值得单独记一条。
  页面上真正用到、而 `HuXiaoBo.otf` **里根本没有**的字有两个：

  | 字 | 码位 | 在哪 |
  |---|---|---|
  | `↗` | U+2197 | 浮窗的「新标签打开 ↗」 |
  | `✕` | U+2715 | 浮窗的关闭按钮 |

  它们一直是靠回退到系统字体显示的（以前原字体整个下完，所以没人注意到）。
  但换成子集之后，字体栈变成 `HuXiaoBo → HuXiaoBo-Full → system-ui`：
  浏览器为这两个字会**把 3.2MB 的 `HuXiaoBo-Full` 整个拉下来**，
  然后发现里面还是没有，再回退系统字体 —— **白下 3.2MB**。

  今天还不一定踩得到：浮窗总开关是关的（`ENABLED = false`）、
  `<dialog>` 也没 `open`，而 `display:none` 的内容不做字体匹配。
  **但一旦打开浮窗就会踩。** 所以给 `HuXiaoBo-Full` 补了
  `unicode-range`，把它限定在它真正能服务的范围（CJK 基本区 + 扩展 A +
  兼容区 + 中文标点 + 全角形式）：新加的中文文案照样走兜底，
  符号 / emoji 直接落到系统字体，不再触发 3.2MB。

  `check.js` 里加了两条方向相反的断言：**兜底范围不许罩住"原字体根本没有"
  的码位**（会白下 3.2MB），**但必须罩得住中文**（否则"忘了重裁"就真缺字了）。

### 2. 修 P26 的遗漏：开屏闸门一直在等一个**全站没人用**的字体

- P26 把数字时钟整个删了（div / CSS / `--nudge-clock` / `colck.js` 里的死代码），
  但漏了两处指回那个时钟字体 `Crunch-Light` 的地方：
  - `index.html` 里 `preload … Crunch-Light-2.ttf`（69KB）
  - `js/timeline.js` 的开屏闸门里 `document.fonts.load('1em "Crunch-Light"')`
- 第二条是真花钱的：`document.fonts.load()` 是**明说"请把这个字体下下来"**，
  它会实打实拉 69KB 并和正文抢带宽，**把开屏闸门往后拖** —— 而全站已经
  没有任何元素用这个字体了。
- 两处都删了。`@font-face 'Crunch-Light'` 规则和字体文件**保留**（零成本，
  想加回时钟随时能用）。`Astron-2.otf`（18KB）同样是死字体，同理保留。
- 顺带补了一条通用断言：**闸门里 `document.fonts.load()` 的每个 family 都
  必须真的被 CSS 声明过** —— 这类"等一个不存在的东西"以后不会再溜进来。

### 3. 降低动效：infinite 动画补齐

P20 那条 `* { animation-duration: .01ms !important }` 对**有限次**动画是对的，
对 `infinite` 是**反效果**：0.01ms 的周期 + 无限循环 = 每一帧都落在周期里的
随机位置 = 元素乱跳。

P26 待办点了四条，这轮逐条核对的结果是 —— **只有三条真的要补**：

| P26 点名 | 选择器 | 本轮 |
|---|---|---|
| `navGlow` | `.navbar::after` | ★补上 |
| `tileFloat` | `.mosaic-tile.float` | ★补上 |
| `blobPulse` / `blobWobble` | `.blob` | ★补上（一条规则盖两个动画） |
| `winLoading` | `.win-loading-bar::after` | **早就在文件末尾那份「浮窗：降低动效」里关掉了**，是重复条目 |

另外**多找出来一条** P26 没点名的：`borderFlow`（`#about .container:hover::before`）。
它只在 hover 时跑，但那时同样是 `infinite` + 0.01ms，一样乱跳，一起关了。
（`#about` 那一节目前整个是注释掉的，所以这条今天碰不到 —— 留着就是坑。）

- **观感变化（要说清）**：这些都是"关掉动、保留静态外观"，不是把元素藏起来。
  - `.navbar::after` 原来在 `opacity .4→1` 之间呼吸，关掉后停在基态 `1` ——
    导航栏右缘那条红边会比动的时候**略亮一点**。想压回去就在那条规则里加
    `opacity: .7;`（位置：`css/style.css` 的 reduce 块内）。
  - `.mosaic-tile` 的 `transform`、`.blob` 的 `scale` / `border-radius` 都回到
    各自基态，不会留"动画演到一半"的错位。

- **★ 加了一条全量断言，而不只是盯着这四条**：
  `check.js` 会**扫出全站所有带 `infinite` 的 animation 使用点**，
  再逐个到 reduce 块里找对应的 `animation: none`，漏一个就报出来。
  当前扫到 **7 处**，全部覆盖。这样以后新加任何常驻动效都会被自动盯住，
  不用再靠人记。

### 4. 自检：75 → 101 项

新增的断言（除上面零散提到的）：

- **[0] 源文件编码**（★新分组）—— 所有源文件必须是**无 BOM 的合法 UTF-8** +
  行尾不混用。这条是被一次真实翻车逼出来的，见下面「踩过的坑」。
- **[2b] 字体子集化** —— 子集/清单存在、体积比、文案覆盖、扫描器 3 条回归、
  `@font-face` 接线、三层兜底、字体栈 3 处、`preload` 已换、
  **canvas 量字的字体栈和 CSS 那条一致**（量字体和渲染字体不是同一套的话，
  算出来的字号就是错的）、闸门等的字体都真的存在。
- **[2c] 降低动效** —— 上面的 infinite 全量核对。

## 三、★ 这轮踩过的坑

1. **PowerShell 的文本 cmdlet 会毁掉中文源码。**
   我做「注入一个字验证自检会不会报」这个负向测试时，用
   `Get-Content -Raw` 读、`Set-Content -Encoding utf8` 写，结果**同时**踩两个雷：
   读的时候按 ANSI/GBK 解码（整篇变乱码），写的时候加了 BOM。
   中文文件不会因此报错，只会变成一屏看不懂的字。
   后来改用编辑工具重做，并且把「无 BOM 合法 UTF-8」立成了 `check.js` 的 `[0]`
   分组。**读写这些文件请用编辑工具或 Node，不要用 PowerShell 的文本 cmdlet。**
   （`Copy-Item` 是字节级的，做备份/还原没问题。）

2. **不要在 `check.js` 里对着源码 `grep` 字体名。**
   我写的第一条断言是「`timeline.js` 里不许出现 `Crunch-Light`」——
   结果被**我自己刚写的注释**绊倒了（注释里正好在解释"这里原来等的是
   Crunch-Light"）。改成先过 `glyph-set.js` 的 `jsStrings()` 只取字符串字面量，
   注释天然被滤掉。

3. **校验要区分"我请求了"和"字体本来就没有"。**
   第一版校验报了 15 个"缺字"：`↗` `✕` `–` `""` … —— 这些**原字体里就没有**，
   今天一直是靠字体栈回退到系统字体显示的，子集当然也造不出来。
   现在这类码位记进 manifest 的 `absent` 名单，不算漏裁（本次 14 个）。

4. **`_dev/` 里装 npm 包要记得把 cache 也指到工作区内。**
   默认的 `%LocalAppData%\npm-cache` 在沙箱外，`npm install` 会 `EPERM`。
   加 `--cache <工作区路径>` 就好（一次性的事，不用记）。

5. **"原字体没有某个字形"这件事，只有在做子集化时才会浮出水面。**
   见上面「关键点五」。以前原字体整个下完再回退，成本是 0；换成子集之后，
   "回退"变成一个要下载 3.2MB 的动作。**凡是引入"按需下载"的地方，
   都要重算一遍"按需"的触发条件。**

## 四、留着的坑与待办

1. **改过页面文案就要重跑 `node _dev/subset-font.js`** —— 这是子集化唯一的
   使用成本。忘了的话 `check.js` 会拦住你（缺哪个字、跑什么命令都写清楚了）。
2. **`Crunch-Light-2.ttf`（69KB）和 `Astron-2.otf`（18KB）现在是死字体**：
   `@font-face` 还在，但没有任何元素用它们。文件我留着（零成本）。
   真要加回数字时钟时，记得 ① 把 `preload` 加回 `index.html`、
   ② 把 `document.fonts.load('1em "Crunch-Light"')` 加回 `timeline.js` 的闸门。
3. **`MAX_WAIT`（`js/timeline.js`，现在 2000ms）现在纯粹是兜底** ——
   30KB 都下不动的极端网络才会触发。想收紧可以放心往 800~1000 调，
   但我**没动它**（那是改开屏行为，不该混在字体轮里）。
4. **没在真机验证过**：woff2 本身所有现代浏览器都支持；退一步说，
   万一 woff2 加载失败，字体栈会退到 `HuXiaoBo-Full` 的 `.otf`（格式更老、
   支持更广），再退到系统字体。算是天然降级。
   我这边依然起不了 headless 浏览器，全部靠 `_dev/check.js` + 二进制级校验。
5. **原字体 `HuXiaoBo.otf` 3.2MB 还留在仓库里**（作为 `HuXiaoBo-Full` 兜底）。
   删掉能再省 3.2MB，但会失去"忘重裁不绝字"的保险。
6. P26 那份待办里**没做**的照旧：`main.js` 574 行还没拆、
   `mask-size`/`mask-position` 是绘制属性（真机掉帧的话改「两态烘焙 +
   opacity 交叉淡入」）、P26 §三 第 6 条那批死代码、
   `_test.jpg` / `_test.mp3` 占位素材。
7. `_dev/node_modules`（3.4MB）现在在项目里。它只服务 `subset-font.js`；
   `check.js` **不依赖任何包**，删掉 `node_modules` 它照样跑。

## 五、跑一下就知道有没有坏

```
node _dev/check.js              # 101 项，全过说明静态规格 + 浮窗状态机 + 字体接线都还在
node _dev/subset-font.js --check # 只比对文案与子集是否同步（不需要 npm 包）
node _dev/subset-font.js         # 改过文案后重裁（需要 _dev/node_modules）
```

`--check` 和完整版都做了正反两次验证：注入 `龘` → 精确报 `龘(U+9f98)` 并 exit 1；
按提示重裁 → 恢复全过。

## 六、独立审计（另一个 agent 拿着改动清单逐条复核，只读）

结论：**改动集里没有 PROBLEM 级问题。** 审计是拿着行号逐个读文件做的，
下面几条值得留档（都是我原来没写进去、或它帮我确认的）：

### 1. ★ 确认：`tileFloat` 那条不是"理论上的坑"，是**活的 bug**

审计指出 `js/mosaic.js` **没有** `prefers-reduced-motion` 检查，而 `.float` 是
它在运行时（`mosaic.js:104`）加上去的。我自己验了一遍 `js/` 全部 17 个文件：

```
blobs / circle-parallax / floating-window / fore-particles / main /
particles / theme-toggle / timeline / welcome   → 有 reduce 检查
colck / draft-layer / guides / home-underline / mosaic /
rulers / sprite / world                          → 没有
```

其中 `mosaic` 是**唯一**一个"没有 reduce 检查、又会启动 CSS 动画"的 ——
也就是说在 P27 之前，`prefers-reduced-motion: reduce` 的用户看马赛克方块
是**一直在乱跳**的。P26 待办里那条现在是真修掉了，不是补保险。

（另外几个"没有检查"的：`colck` 是逐帧旋转环、`rulers`/`guides`/`sprite`/`world`
是 canvas 绘制、`home-underline`/`draft-layer` 在 CSS 里已经 `display:none` 或
`animation:none` —— 都不受影响。）

### 2. ⚠ 审计发现一个**先于本轮**的疑点：`font-weight: 1000` vs `@font-face: 400`

- `css/style.css:2003`（`.welcome-splash`）和 `2078`（`.welcome-tagline`）写的是
  **`font-weight: 1000`**；
- 两条 `@font-face` 声明的是 **`400`**（全站没有 `font-synthesis` 规则）；
- 而 `js/welcome.js:88` 的 canvas 量字用的是 **`400`**。

于是：**元素按 1000 渲染、按 400 量宽**。如果浏览器对它做合成加粗
（synthetic bold），渲染宽度就可能和量出来的对不上，
`--welcome-fs` / `--tagline-fs` / 拉伸倍数就会偏一点点。

我**没有动它**，原因有三个：
1. **不是本轮引入的** —— 改前改后都是这个组合（两条 `@font-face` 的
   `font-weight` 都是 400），子集化不改变权重匹配；
2. **大概率无害** —— Blink / Firefox / WebKit 的合成加粗都是"描边"实现，
   **不改 advance width**（多出来的墨只是溢出字身框）。真有偏差也是墨迹高度那一路。
3. 这块是你 P9~P12 一路手调出来的，动它必须你在屏幕前看着。

**想确认的话**，一行就能试：给那两条规则加 `font-synthesis: none;`，
如果 WELCOME 的观感**变了**，说明合成加粗一直在起作用（那量宽就该改成 1000）；
如果**没变**，说明根本没合成，现在就是对的。

### 3. 它确认过的、和我上面说法一致的点

- 四条 `animation: none !important` 确实赢过基础规则的 `infinite`，
  也赢过 `* { animation-duration: .01ms !important }`（两者都 important 时比特异性，
  `*` 是 0,0,0 输给 0,1,1 等）；而且 `animation-name: none` 本身就够了，
  跟 duration 无关。**全文件带 `!important` 的 animation 只有那 6 行**，
  JS 里没有任何地方写 `style.animation` / `setProperty('animation')`。
- `.blob` 那条是**防御性**的（`blobs.js:234` 在 reduce 下直接 return，
  根本没建 `.blob`）；`#about …` 那条今天是死规则（该节被注释掉了）。
- `preload` 的 href 和 `@font-face` 的 `src` 解析到**同一个 URL**，
  是预热而不是下载两次；裸 `crossorigin`（= anonymous）和字体请求的 CORS 模式一致，
  换成 `use-credentials` 反而会多下一次。
- `Crunch-Light` / `Astron` 虽然 `@font-face` 还在，但**没有任何规则引用**，
  而未被匹配的 `@font-face` 不会发起请求 —— 所以是 0 字节，只是磁盘上的死重量。
- `Promise.all([单元素])` 等价于那个 promise 本身，`timeline.js` 的控制流
  （`settled` 守卫 + `setTimeout` 赛跑 + `arm()` 自带守卫）和改前完全一致。
- `_dev/davinci.html:19` 虽然也写着 `"HuXiaoBo"` 却没加兜底 —— **不要紧**：
  那个试验页是独立的，inline `<style>` 里既没有 `@font-face` 也没有引样式表，
  这个 family 在那儿本来就没声明，两种情况都是回退系统字体。

### 4. 审计没覆盖到的（它自己声明的局限）

没有浏览器，所以「reduce 下的层叠结果」和「`unicode-range` 的惰性下载」
**都是按规范推的、不是实测的**；`↗`/`✕` 那条路径要真的开一次浮窗才会走到。
这和我 §四.4 里说的局限是同一条。

---

# P28 修：系统开「减小动效」时准星不缩小（它一直是一块盖住整页的实心色块）

> 你报的现象。根因不在 CSS 也不在 P27 —— 是**开屏"跳过"路径漏加了一个 class**，
> 而且是那种"代码看着没错、页面也不报错、就是不对"的类型。

## 一、现象

系统开启「减小动效」（`prefers-reduced-motion: reduce`）后，准星不缩小。

实际比这句话更严重：准星不是"没变小"，而是**从头到尾就是一块铺满视口的
实心矩形**，把整页内容盖住 —— 深色主题下是 `#191919`（= `--crosshair-vColor`），
浅色主题下是 `#c8c8c8`。因为 `.crosshair-v` 是不透明、`z-index: 9995`、
`100vw × 100vh` 的 `position: fixed` 元素，在同层叠上下文里正 z-index 画在
`main` 之上。

## 二、机制：准星是"缩"出来的，不是"画"出来的

```css
.crosshair-h, .crosshair-v {
    position: fixed; width: 100vw; height: 100vh;   /* ← 出生就是满屏 */
    transition: transform var(--t-cross-dur, 1.2s) …;
}
.crosshair-h { transform: scaleY(1); }              /* 基础态：还是满屏 */
.crosshair-v { transform: scaleX(1); }

body.crosshair-active .crosshair-h { transform: scaleY(var(--crosshair-h-scale)); }  /* ← 收缩在这 */
body.crosshair-active .crosshair-v { transform: scaleX(var(--crosshair-v-scale)); }

body.crosshair-active-done .crosshair-h,
body.crosshair-active-done .crosshair-v { --t-cross-dur: 0s; }   /* 只改时长 */
```

`--crosshair-h-scale = 1/vh`、`--crosshair-v-scale = 1/vw` 由 `main.js` 的
`updateScale()` 注入，`transform-origin` 由 `applyOrigin()` 钉在鼠标位置
（`0 ${cy}px` / `${cx}px 0`）。所以：

- **`crosshair-active`** = 真正把它收成十字的那条 `transform`
- **`crosshair-active-done`** = 只负责把过渡时长归零（"直接跳终态"）

开屏期间你看不到那块满屏色，是因为红幕（`z-index: 9998`）压在上面；
等红幕和遮罩层演完（4.3~4.4s），准星已经在 3.0~4.2s 缩成线了。

## 三、根因：降低动效那条路径只加了 `-done`，没加 `-active`

`main.js` 有**三条**把页面推进"开屏结束"状态的路径：

| 路径 | 怎么写的 | 加 `crosshair-active` 吗 |
|---|---|---|
| 正常演完 | `setTimeout(…, cross.T.delay*1000)` 单独加 | ✔ 第 3.0s |
| 用户跳过 | `skip()` 里显式 `add("crosshair-active")` | ✔ |
| **降低动效** | 直接调 `finishIntro()` | ✘ **从来没有过** |
| （等字体兜底） | 也调 `finishIntro()` | 同上 |

而 `finishIntro()` 里原本只有：

```js
document.body.classList.add("crosshair-active-done", "intro-done");
```

于是降低动效路径：`crosshair-active-done` 加了（时长归零）、`crosshair-active`
没加（**那条 `transform` 永远不生效**）→ 基础规则的 `scaleY(1)` 一直在 →
准星永远是一块满屏实心色。CSS 没错、JS 没报错、`intro-done` 也正常，
页面就是不对。

## 四、修法

`finishIntro()` 里两个 class **必须一起加**：

```js
// js/main.js:42
document.body.classList.add("crosshair-active", "crosshair-active-done", "intro-done");
```

放在 `finishIntro()` 里而不是每条分支各写一遍，理由：

- 它本来就是"把页面推进终态"的唯一入口，降低动效 / 等字体兜底 / 正常收尾都走它；
- **幂等** —— 正常路径走到这里时 `crosshair-active` 早在 3.0s 就加过了，重复加无害；
- 兜底那条路径（`armWait + TOTAL + 3`）也顺带被治好。

降低动效下的实际行为：两个 class 同一帧加上 → `--t-cross-dur: 0s`
（而且 reduce 的 `* { transition-duration: .01ms !important }` 也压着）
→ **没有动画，直接落到十字终态**，正是"减少动效"该有的语义。

`transform-origin` 也在同一帧就对：`main.js` 顶部的 `finishIntro()` 先跑，
但浏览器要到脚本执行完才做样式计算，那时 crosshair IIFE 已经把
`--crosshair-*-scale` 和 `transform-origin` 都写好了（初值就是屏幕中心）。

## 五、验证

- `_dev/check.js` 新增 `[2d] 准星收缩` 分组（9 条，总数 101 → **110**），
  钉住两件事：
  1. **机制别被改坏** —— 出生是 `100vw×100vh`、收缩由 `body.crosshair-active`
     的 `scaleY/scaleX` 驱动、`-done` 只管 `--t-cross-dur: 0s`、
     两个 scale 变量确实由 JS 注入；
  2. **所有"跳到终态"的路径都得加 `-active`** —— 直接断言 `finishIntro()`
     里同时有这两个 class，外加一条更一般的不变式：
     **加 `-active` 的次数 ≥ 加 `-done` 的次数**（每一次"收尾"都要有一次
     "收细"跟它配对；当前 4 vs 4）。
     注意 `"crosshair-active"` 是 `"crosshair-active-done"` 的前缀，
     所以比对时**必须连引号一起比**。
- **做了负向验证**：把 `finishIntro()` 改回旧写法 → 断言如实报出
  `✘ finishIntro() 同时加 crosshair-active → 只加了 -done`
  和 `✘ 加 -active 的次数 ≥ 加 -done 的次数（3 vs 4）`，2 项失败；
  改回来 → 110 项全过。
- 顺带把 CSS 里**所有** `body.<状态类>` 选择器列出来核了一遍，确认
  开屏路径管的只有 `locked` / `intro-done` / `crosshair-active` /
  `crosshair-active-done` 四个，**降低动效路径现在四个全覆盖**，
  没有第二处同类遗漏。其余（`crosshair-fast` / `-hidden` / `-hover` /
  `window-open` / `theme-switching`）都是交互中才加的，不属于开屏终态。

## 六、★ 教训

**"跳过动画"和"演完动画"必须是同一个终态，而终态往往不止一个 class。**

这个 bug 的形态很典型：`finishIntro()` 名字叫"结束开屏"，看着就该负责一切，
但它只加了 `-done`（名字最像"结束"的那个），漏了 `-active`（真正干活的
那个）。两个 class 名字还长得很像，review 时眼睛会自动跳过。

一个可迁移的检查方式：**凡是"分多条路径到达同一终态"的地方，就把终态本身
写成一条断言**（这里就是"加 `-done` 的次数不能多于加 `-active` 的次数"），
而不是去逐条 review 路径。P27 那条 infinite 全量扫描也是同一个思路。

---

# P29 修：减少动效下制图框的两个问题（红点高频频闪 / 推进点不跟随）

> 你报的两条。第一条是**死选择器**，第二条是**布局属性与合成器属性混用**。
> 更要紧的是：第一条本来该被 P27 那条"infinite 全量扫描"抓住，
> 但我的匹配判据写得太松，给了它一个**假通过**。判据已经改严。

## 一、红点高频频闪：一条从未匹配过任何元素的死选择器

**现象**：减少动效下，`.df-v.df-name` 的 `::before`（那颗红点）高速频闪。

**根因**：降低动效块里那条关动画的规则，选择器写的是

```css
.draft-frame .df-name::before { animation: none; }   /* ← 匹配不到任何东西 */
```

但 DOM 是这样：

```
.draft-frame            ← 只有四角刻线（js/draft-layer.js 的 innerHTML 就 4 个 .df-corner）
.df-strip               ← 插进 .nav-container 里
   └ .df-v.df-name      ← 那颗红点在这
```

**`.df-name` 根本不在 `.draft-frame` 里面**，所以那条 `animation: none`
从来没有生效过。于是 `.df-name::before` 的基础规则
`animation: dfBlink 1.6s step-end infinite` 照旧在跑，再被同块的

```css
* { animation-duration: 0.01ms !important; }
```

一压 —— **0.01ms 周期 + 无限循环 + `step-end`** ＝ 那颗红点每秒在
`opacity: 1` 和 `opacity: 0.15` 之间翻十万次，肉眼就是一片高频频闪。

**修法**：选择器改成和基础规则**一模一样**：

```css
.df-name::before { animation: none; }
```

顺带把 P26/P27 那批同类规则一起核了一遍（`.halftone-scan::before`、
`.hero-underline`、`.panel-frame`、`.navbar::after`、`.mosaic-tile.float`、
`.blob`、`.win-loading-bar::after`、两个 `::view-transition-*`）——
**只有这一条是死的**。`#about .container:hover::before` 那条今天也匹配不到，
但那是因为 `#about` 整节被注释掉了，属于已知情况（注释里写了）。

## 二、推进点有时不跟随进度条：`bottom`（布局）和 `transform`（合成器）混用

**现象**：`.df-bar` 里的 `data-dot`"有时"不跟着进度条走。

**根因**：右边这条轨道和它的推进点，用的是**两类不同的属性**：

```js
fillEl.style.transform = 'scaleY(' + p + ')';   // 合成器属性：可以只走合成器
dotEl.style.bottom     = (p * 100) + '%';       // 布局属性：必须过布局 + 重绘
```

两者在同一次 `draw()` 里一起写，所以**不是 JS 的问题** —— 问题出在上屏那一步：
`transform` 的改动可以只交给合成器（连重绘都不用），而 `bottom` 一定要走
一遍布局 + 重绘。主线程一忙（旁边有常驻动画在跑、或者在快速滚动），
前者已经上屏、后者还在排队，于是就出现"条在走、点不跟"，而且是**时有时无**。

**修法**：让推进点也走 `transform`。做法是把进度写进一个 CSS 变量，
剩下的交给 CSS：

```js
dotEl.style.setProperty('--df-p', (p * 100).toFixed(3) + '%');
```

```css
.df-bar b {
    position: absolute;
    left: -2px;
    top: 0; bottom: 0;                 /* 盒子高度 = 整条轨道 */
    width: 5px;
    transform: translateY(calc(-1 * var(--df-p, 0%)));
}
.df-bar b::after {                     /* 可见的 5×5 方块画在盒子下沿 */
    content: "";
    position: absolute; left: 0; bottom: 0;
    width: 5px; height: 5px;
    background: var(--accent);
    transform: translateY(2.5px);      /* 骑在推进线上 */
}
```

**为什么盒子要 `top: 0; bottom: 0`**：`translateY` 的百分比是相对**元素自己**的
高度算的。只有让盒子的高度等于整条轨道，`-100%` 才等于"从轨道底走到轨道顶"。

**观感完全没变**（验算过）：设轨道高 H，`::after` 的中心落在
`y = H(1−p)`，而 `.df-bar i` 的 `scaleY(p)`（`transform-origin: bottom`）
的上沿正好也在 `y = H(1−p)` —— 和原来 `bottom: p%` + `translateY(2.5px)`
是同一个位置。

顺带给 `.df-bar` 加了 `pointer-events: none`：盒子现在有整条轨道那么高，
虽然它是透明的，但不该去挡导航栏的交互。

## 三、★ 更要紧的：P27 那条扫描给了这个 bug 一个**假通过**

P27 我加了一条"扫出全站所有 `infinite` 动画，逐个到降低动效块里找
`animation: none`"的断言。**它本该抓住这次这条死选择器**，但我把覆盖判据
写成了宽松版：

```js
const covered = s => off.some(o => o === s || o.endsWith(s));   // ← 太松
```

`'.draft-frame .df-name::before'.endsWith('.df-name::before')` → `true`，
于是被当成"被更具体版盖住了"。**可那个祖先选择器根本不命中这个元素。**

宽松匹配默认了一件**没法静态证明**的事：**"前缀里那个祖先，一定真的包着这个元素"**。
所以现在改成**必须同名**：

```js
const covered = s => off.has(s);
```

要求同名还顺带保证了两条规则**同特异性** —— 不会出现"降动效那条被基础规则压住"
这种反向问题。代价是：如果有人真需要写 `.祖先 .元素` 形式的降动效规则，
这条断言会报"漏了"逼他改成同名（绝大多数情况同名就是对的）。

**做了负向验证**：把选择器改回 `.draft-frame .df-name::before`，三条断言同时报错

```
✘ 制图框：四角刻线 + 标题栏（点线面 + 数字），位置全取布局令牌
✘ 没有 `.draft-frame .df-…` 这种死选择器（那两个元素不在 .draft-frame 里）
✘ 每一条 infinite 动效在降低动效下都被关掉   → 漏: .df-name::before
```

改回来 → 114 项全过。

## 四、新增的断言（总数 110 → 114）

| 断言 | 防的是 |
|---|---|
| `每一条 infinite 动效…都被关掉`（判据改成**必须同名**） | 死选择器 / 祖先链写歪 |
| `没有 .draft-frame .df-… 这种死选择器` | 直接点名这个陷阱（附一条前提断言：`.df-strip` 确实插在 `.nav-container` 里） |
| `制图框…` 里那条改成**行首锚定** | 原来是子串匹配，被 `.draft-frame .df-name::before` 骗过 |
| `推进点由 transform 驱动（不写 style.bottom）` | 退回布局属性 |
| `推进点的盒子高度 = 整条轨道（top/bottom 都 0），可见方块画在 ::after` | 百分比 translate 的前提被改掉 |

## 五、★ 教训（两条，都是关于"怎么验证"）

1. **子串匹配不是匹配。** `/\..df-name::before\s*\{/` 会命中
   `.draft-frame .df-name::before`；`endsWith` 同理。凡是"判断 CSS 规则有没有
   覆盖某个选择器"，**必须比整个选择器**，不能比后缀。
2. **宽松的判据比没有判据更糟 —— 它会给你一个"已验证"的错觉。**
   这条断言在 P27、P28 两轮里都是绿的，我还在报告里拿它当证据说
   "7 处 infinite 全覆盖"。它当时确实漏了一个。**一条永远为绿的检查
   不是资产，是负债。** 所以这轮我特地把当轮修的两个 bug 都做了负向验证
   （把代码改回去，确认断言会红），而不是只看它绿。

---

# P30 去掉三件装饰：标题下划线 / media 红框 / body 噪点层

## 一、关掉了什么

| # | 装饰 | 在哪 | 怎么关的 |
|---|---|---|---|
| ① | **#home 标题下划线** | `index.html` 的 `.hero-underline` + `js/home-underline.js` | 模块总开关 `ENABLED = false` |
| ② | **media-panel 红色包围框** | `js/home-underline.js` 注入的 `.panel-frame` | 同上（同一模块） |
| ③ | **body 噪点层** | `css/style.css` 的 `body::before` | `display: none` |

前两件本来就是同一个模块干的（`home-underline.js` 一个 IIFE 里既管线、
又给每个 `.media-panel` 注入红框），所以**一个开关就把两件一起关了**。

## 二、★ 术语要小心：「噪点」和「网点」是两层不同的东西

你说的"body 的噪点"我核过一遍再动手，因为这个项目里有两个容易混的层：

| 层的名字 | 选择器 | 是什么 | 这次 |
|---|---|---|---|
| **噪点** | `body::before` | `feTurbulence` 颗粒，`opacity: 0.1`，`z-index: 10000`（盖在最上面） | ★ 关掉 |
| **网点** | `body::after` + `.halftone-scan` | 半调点阵（上下两条带 + 那条扫描带） | **保留** |

判据是**代码自己的用词**，不是我猜的：
`css/style.css:473` 的注释写着「否则伪元素是 0×0 的 inline 盒子，
inset / z-index 全部失效，**噪点**根本画不出来」——就在 `body::before` 里；
而 `CHANGES.md:55` 也把它叫「噪点层」。网点那套一律叫「网点」
（`body::after`、`.splash-网点`、`.halftone-scan`）。

`check.js` 里为此专门立了一条**反向**断言：**网点层必须还在**，
免得以后有人看到"关掉 body 的某个点阵层"就顺手把 `body::after` 也关了。

## 三、为什么是"开关"而不是"删掉"

- 这个项目的既有套路就是这个：`js/draft-layer.js` 和 `js/floating-window.js`
  顶部都有 `const ENABLED = ...`，CHANGES 里还写着「想关掉：把 ENABLED
  改成 false（和浮窗一个套路）」。
- ①② 加起来是近百行**调过参数**的几何代码（下划线被 media 容器"吃"短的
  clamp、红框左→上下一同→右的三段 `clamp`）。删了以后想回来就得重推。
- 关掉之后**一点运行开销都没有**：`home-underline.js` 直接 return，
  连 `World` 都不订阅，滚动时不再有任何每帧计算。

想恢复：`js/home-underline.js` 的 `ENABLED` 改回 `true`；
`body::before` 那条把 `display: none;` 删掉。（两处都在注释里写了。）

## 四、★★ 关掉装饰真正的难点：**别留下半截**

`body::before` 和 `.panel-frame` 都无所谓 —— 一个是纯 CSS 加一条
`display: none`，另一个是 JS 注入的、不注入就没有元素。

**但 `.hero-underline` 是个陷阱**：它是 `index.html` 里的**静态元素**，
靠 JS 写 `--hero-line` 驱动。JS 一停，没人写这个变量，于是

```css
transform: scaleX(var(--hero-line));      /* ← 缺兜底 */
```

会**在计算值阶段非法**，transform 回落到初始值 `none` ——
那条 2px 红线会**以满宽露出来**，比不关还显眼。

好在现有代码本来写的就是带兜底的：

```css
transform: scaleX(var(--hero-line, 0));   /* ✅ 没人写变量 → scaleX(0) → 不可见 */
```

**这个 `, 0` 现在变成承重结构了**，所以 `check.js` 里单独立了一条断言盯着它，
并且做了负向验证（把那 `, 0` 删掉 → 断言立刻红）:

```
✘ ★ .hero-underline 的 transform 有 0 兜底（否则开关一关，线会以满宽露出来）
```

这和 P26 那次 `.hero-underline` 因为"元素排在脚本后面"而整条看不见，
是同一个 `var()` 家族的两个方向：**变量缺失时，声明不是"没效果"，
而是"回落到初始值"** —— 有时候是消失，有时候是满宽。

## 五、顺手处理的一个真实事故：`index.html` 被加了 BOM

动这一轮的时候 `check.js` 的 `[0] 编码` 分组突然报红：

```
✘ 所有源文件都是无 BOM 的合法 UTF-8   → index.html(有 BOM)
✘ 页面文案的字全在子集里              → ﻿(U+FEFF)
```

我这一轮**没有编辑过 `index.html`**，于是先查了字节和 mtime，又拿 P27 留下的
备份比了一遍，结论是：

- 你（或你的编辑器）在某一轮之间改了 `index.html`：
  `12 幅 → X 幅`、`8 个 → X 个`、`6 首 → X 首`、`2 个 → X 个`（四处占位文案）；
- **编辑器保存时顺手加了 UTF-8 BOM。**

我只剥掉了 BOM，**没有动你的那四处改动**（已核对仍在）。

顺带做了两件事：

1. 新增 **`_dev/strip-bom.js`** —— `node _dev/strip-bom.js` 一键剥掉所有源文件
   开头的 BOM（`--dry` 只看不改）。它**只用 Node 读写**，不动字符串解码：
   直接切掉开头那 3 个字节，其余原样写回，不会碰到中文。
   （⚠️ 千万别用 PowerShell 的 `Get-Content`/`Set-Content` 修这个 ——
    那两个会按 ANSI 解码中文并且**主动加上** BOM，等于把问题再犯一遍。）
2. `_dev/glyph-set.js` 现在也把零宽字符（含 `U+FEFF`）从字形集里剔掉。
   BOM 永远画不出来、不该算"缺字"；**真正的 BOM 由 `[0]` 那条编码断言负责喊**,
   这里只是别让它再引发第二个看起来像"要重裁字体"的误导性报错。

> 这条正好说明 `[0]` 那组断言是有用的：它在我完全没碰那个文件的情况下，
> 把一次"外部改动引入的编码退化"当场抓住了。

## 六、验证

- `node _dev/check.js`：**114 → 120 项全过**（新增 `[2e] P30 关掉的三件装饰`
  分组 6 条）。
- 负向验证：把 `.hero-underline` 的 `, 0` 兜底删掉 → 断言如实报红；
  改回来 → 全过。
- 21 个 JS 文件语法全 OK；`subset-font.js --check` 通过
  （文案改动只涉及 ASCII，子集不用重裁）。
- `node _dev/strip-bom.js --dry` 现在报「没有文件带 BOM」。

## 七、留给你的两个开关位置

```
js/home-underline.js   const ENABLED = false;   // ← 改 true 恢复 ①②
css/style.css          body::before { ... display: none; }   // ← 删掉这行恢复 ③
```

---

# P31 准星改成四条线（两条垂直 + 两条水平）+ 一三角配一线

## 一、做了什么

原来是一个十字：`.crosshair-h` + `.crosshair-v` 各一个满屏元素，
靠 `transform-origin` 定位、`scaleY(1/vh)` / `scaleX(1/vw)` 收成 1px 线。

现在是**四条线**：

| 元素 | 跟哪个位置 | 平时 | 吸住大块时 |
|---|---|---|---|
| `h1` 上 | `y1` | 鼠标 y | 元素上边缘 `rect.top` |
| `h2` 下 | `y2` | 鼠标 y | 元素下边缘 `rect.bottom` |
| `v1` 左 | `x1` | 鼠标 x | 元素左边缘 `rect.left` |
| `v2` 右 | `x2` | 鼠标 x | 元素右边缘 `rect.right` |

四条**共用**同一份 `EASE`（跟随缓动）、同一份 `--t-cross-dur`、
同一份 `--crosshair-h-scale` / `--crosshair-v-scale`（所以线宽永远一致）。

- **平时四条都收在鼠标处**（`x1 = x2 = mx`，`y1 = y2 = my`）——
  因为线是满屏元素被 scale 收成 1px 的，四条叠在一起，
  **看起来和原来那个单十字一模一样**，这一步没有视觉回归。
- **悬停大块**（`.card` / `.media-panel` / `.btn`）→ 四条分别吸到它的四边，
  围成一个框；离开收回鼠标处。
- **开屏收缩**：一对（`h1` + `v1`）落到**左上角**，
  另一对（`h2` + `v2`）落到**左下角** —— 也就是收到一半的 `[` 形，
  方向和红幕"缩到左侧"一致。
  > ⚠ **P34 已改**：第二对现在落到**右下角**（每条线收到自己那一侧的屏幕边）。
  > 下面这段是当时的记录，读的时候按 P34 理解。

## 二、动了哪些文件

| 文件 | 改了什么 |
|---|---|
| `index.html` | 准星 2 个 div → **4 个**（`data-cross="h1/h2/v1/v2"`）；三角 2 个 → **4 个**（`data-cross="x1/x2/y1/y2"`）；**新增 2 个读数元素**。全部仍在脚本之前 |
| `js/main.js` | 准星模块整体重写（约 353-579 行）：四个独立位置 + 各自缓动 + 吸边 + 两角收缩 |
| `js/rulers.js` | 三角模块重写：四条"通道"，每条跟一条线，各自带对齐方式；读数改成中点共享 |
| `css/style.css` | 三角那段整体重写：**四个直角三角形** + `.ruler-read` 读数样式；顺带修掉一段和代码对不上的注释（见 §四） |
| `_dev/check.js` | 新增 `[2f]` 分组 **34 条**（120 → 154 项） |
| `CHANGES.md` | 本节 |

## 三、准星部分的几个实现决定

1. **位置仍然写 `transform-origin`，不用 `translate`。**
   线是 `100vw × 100vh` 的满屏元素，改 origin 只影响"这条线从哪里收起来"，
   不触发布局；`transform` 那条（scale）是共用的、由 CSS 的
   `.crosshair-active` 驱动。四条线各写各的 origin，互不干扰。

2. **吸边走的是同一套缓动，不是 CSS transition。**
   `transform-origin` 虽然理论可动画，但过渡它各家实现不一致；
   改成"给四条线各自算目标 + 每帧朝目标缓动"，于是
   **跟随和吸边天然是同一手感**，符合你说的"共用动画参数"。

3. **★ 吸住之后滚动，不重读布局。**
   悬停那一刻量一次 `getBoundingClientRect()`；之后页面滚了就按
   `World.scrollX - snapScrollX` 的**差值**平移目标。
   于是零布局读取（这个项目到处在避免强制布局），
   而且"鼠标停在卡片上滚轮横向滚"——这站是常态——也不会脱开。
   `check.js` 里有条断言专门盯着"`targetFromSnap()` 的代码里不许出现
   `getBoundingClientRect`"。

4. **进出判定只用 `mouseover`，不用 `mouseout`。**
   离开块时 `mouseout` 的 `target` 还在块里，`closest()` 仍然返回那个块，
   会误判成"还吸着"。而走到块外的任何元素都会再触发一次 `mouseover`，
   那时 `closest()` 就是 `null` —— 一个监听器就够。

5. **变色那套选择器保持原来的宽度，没跟着收窄。**
   你说"只吸大的块"，我按字面只改了**吸边**的目标；
   悬停变色仍然是 `a, button, .btn, .card, [role='button']`
   （导航链接照样变色），这是原来就有的行为，不该顺手改掉。

6. **降低动效那条路径被刻意排除在两角收缩之外。**
   它加的是 `crosshair-active` + `crosshair-active-done`
   （同一个 `classList.add`，只触发一次 mutation），
   观察器用 `active && !done` 把它排除 —— 那条路径本来就要
   "直接停在屏幕中心的正常十字"，不该先摆成左边那个 `[`。
   （这跟 P28 那次准星不缩小是同一段逻辑，别再改回去。）

7. **四条线保持"全长"**（你确认过）：`v1` 吸到元素左边缘时，
   它仍是一条贯穿整个视口高度的竖线，不是只画元素那一段。

## 四、三角：四个直角三角形 + 同轴共用一个读数

### 4.1 形状：从等腰改成直角，朝"离开准星框"的方向伸

四个三角现在各自往**离开准星框**的方向伸出去 —— 展开时像一对朝外张开的
括号，完全合并时同轴的两个又正好拼成一个左右对称的尖：

| 三角 | 跟谁 | 伸出方向 | 直角在盒子 | 哪条"腿"代表线位置 | JS 对齐 |
|---|---|---|---|---|---|
| `.ruler-marker-x[data-cross="x1"]` | 左垂直线 x1 | 左 + 上 | 右下角 | 竖直腿在**右**边缘 | `translateX(v) translateX(-100%)` |
| `.ruler-marker-x[data-cross="x2"]` | 右垂直线 x2 | 右 + 上 | 左下角 | 竖直腿在**左**边缘 | `translateX(v)` |
| `.ruler-marker-y[data-cross="y1"]` | 上水平线 y1 | 上 + 右 | 左下角 | 水平腿在**下**边缘 | `translateY(v) translateY(-100%)` |
| `.ruler-marker-y[data-cross="y2"]` | 下水平线 y2 | 下 + 右 | 左上角 | 水平腿在**上**边缘 | `translateY(v)` |

- 形状由「**一条有色边 + 一条相邻透明边**」唯一决定，外接框尺寸和改之前
  一样（底尺 4×8，左尺 8×4），只是从等腰变直角 —— 符合你说的"长宽高不变"。
- 每条规则都先用 `border: 0` 清干净再给两条边。CSS 三角形最容易被
  残留的 border 搞坏，`check.js` 里有一条断言专门盯这个。
- `data-cross` 现在**不只是标签**，还是 CSS 认形状的依据
  （`[data-cross="x1"]` 等四个属性选择器）。

### 4.2 读数：同一把尺子上的两个三角共用一个，位置取中点

原来每个三角各挂一个 `::after`。现在三角会张开到几百像素远，
读数**没法再挂在其中某一个身上**，所以拆成两个独立元素
`.ruler-read-x` / `.ruler-read-y`（一把尺子一个）：

- **位置** = 两个三角的中点（`(x1+x2)/2`、`(y1+y2)/2`）。
  底尺那个用 `bottom: calc(var(--ruler-h) + 2px)` 让开尺子，
  左尺那个用 `left: calc(var(--ruler-w) + 2px)` —— 用 token，不硬编码。
- **内容**：
  - 准星**展开**（吸住元素）时 → 两个三角的**间隔像素**
    （顺带就是那个元素的宽 / 高，挺有用）
  - 准星**完全合并**时 → 准星在该轴上的**坐标**
  - 判据 `Math.abs(gap) < 0.5px`：缓动收敛时两条线会被精确赋成同一个
    目标值，所以静止时间隙正好是 0。
- 只在文字真的变了时才写 `textContent`（改它会触发这一小块重排）。

### 4.3 顺带修掉一段和代码对不上的注释

三角那段注释原来写的是「`border-left/right = 6px` → 底边宽 12px、
`border-bottom = 5px` → 高 5px」，而**代码实际是**
`border-left/right = 2px`（底边 4px）、`border-bottom = 8px`（高 8px）；
位置注释还写着"往里 2px"，代码却是 `bottom: 0`。
这段正好是我这轮要动的区域，而且它**主动误导**（照它改尺寸会改错），
所以整段按实际情况重写了。

## 五、验证

- `node _dev/check.js`：**120 → 154 项全过**（`[2f]` 分组共 34 条）。
  重点覆盖：
  - 2+2 条线 / 2+2 个三角 / **只有 2 个读数**；
  - **这些元素都必须在脚本之前解析**（P26 那个"querySelector 拿到 null
    就静默 return"的坑）；
  - **四个三角形的形状**逐条断言（哪条有色边 + 哪条透明边）；
    等腰那套 `2px transparent` 必须一条不剩；
  - 读数：中点定位、让开尺子用 token、展开取间隔 / 合并取坐标、
    只在文字变了才写、不再往 `dataset` 写；
  - 对齐：`anchor: 'end' | 'start'` 与 `translate(-100%)`。
- 负向验证做了两次：
  1. 从 `index.html` 删掉一条 `.crosshair-v` → 报
     `✘ index.html 里是 2 条水平 + 2 条垂直（2 + 1）`；
  2. 把 `x1` 的透明边从 `border-left` 换成 `border-right`（三角形方向反了）→
     报 `✘ .ruler-marker-x[data-cross="x1"] = 向左上（透明左边 4 + 有色底边 8）`。
  两次都改回来 → 全过。
- 写 `[2f]` 时又踩了一次 P27 的老坑：断言"`targetFromSnap()` 里没有
  `getBoundingClientRect`"，结果被我**自己那句解释它的注释**绊倒。
  现在比对前先剥注释 —— **对着源码做字符串断言时，注释里的同一个词
  一定会骗过你**（这已经是第三次了，所以在断言里直接写了说明）。

## 六、留给你在屏幕上确认的几点

我这边起不了浏览器，以下几点是**推导**出来的，需要你看一眼：

1. **合并时两个三角拼成的尖是 8px 宽**（改之前整个三角是 4px 宽）。
   单看每个三角的外接框没变，但两个拼一起就宽了一倍 ——
   如果觉得合并状态比原来"胖"，把四个 `4px` 的透明边改成 `2px` 即可
   （那样每个三角就是 2×8，拼起来 4×8，和原来一样宽）。
2. **读数的位置**：底尺那个现在在尺子上方 2px（原来 `::after` 是压在尺子里的
   `bottom: 5px`），左尺那个在尺子右侧 2px。想调就改
   `.ruler-read-x` / `.ruler-read-y` 里那两个 `calc(var(--ruler-*) + 2px)`。
3. **读数在"展开↔合并"之间会切换含义**（间隔像素 ↔ 坐标），
   所以收回准星的过程中数字会从"元素宽度"变成"坐标"。
   这是你要求的行为；如果觉得跳，可以改成只在动效结束后切换。
4. **`will-change: transform` 现在挂在 4 个满屏元素 + 4 个三角上。**
   真觉得卡 / 显存吃紧，第一个可以试的就是把它们改成 `will-change: auto`。
5. **`h1`/`v1` 是"上/左"，`h2`/`v2` 是"下/右"** —— 顺序由 `index.html`
   里的出现顺序决定，`check.js` 会盯着这个数量。

---

# P32 准星拆成独立文件 + 展开时"拉出"红带

## 一、拆文件

`js/main.js` 里的准星模块（四条线 + 吸边 + 两角收缩，约 226 行）整段搬到
**`js/crosshair.js`**。这是从 P26 挂到现在的待办。

| 文件 | 行数 | 变化 |
|---|---|---|
| `js/main.js` | **451** | 678 → 451 |
| `js/crosshair.js` | 248 | ★新 |
| `js/rulers.js` | 240 | 172 → 240（多写一套条带） |
| `js/`（18 个文件） | 3339 | 17 → 18 个文件 |

**搬走了什么、留下了什么**（这条界线是刻意划的）：

| 搬去 `crosshair.js` | 留在 `main.js` |
|---|---|
| `window.crosshairPos` 初始化 | `finishIntro()` |
| 四条线的 IIFE（位置、缓动、吸边、两角收缩） | `crosshair-active` / `-done` / `-fast` 这三个 class 的**时机** |
| `window.onCrosshair` 订阅接口 | 跳过开屏、降低动效、等字体兜底三条路径 |
| `setSnap()`（吸边状态唯一入口） | — |

理由：准星本体跟开屏状态机**没有任何耦合**，它只是一套"跟随 + 吸边"的
指针逻辑，而且数据是**单方向往外推**的（`window.onCrosshair`，
`rulers.js` 消费）。`main.js` 负责"什么时候开始收缩"，
`crosshair.js` 负责"收缩成什么样"—— 所以 main.js 里那三个 class 的
赋值**必须留着**，`check.js` 有一条断言专门防止有人"顺手"把状态机也搬走。

**脚本顺序**（`index.html`）：`world → main → **crosshair** → home-underline → rulers → …`

- `crosshair.js` 必须在 `rulers.js` **之前**：后者在加载时就调
  `window.onCrosshair(place)`，排在前面会拿到 `undefined` → 静默退回轮询
  （不报错，只是白掉一帧的跟手）。`check.js` 钉了这条顺序。
- 排在 `main.js` 之后，语义更顺（它是"准星的实现"，不是"准星的状态机"）。

## 二、展开时"拉出"半透明红带

### 2.1 它是什么

准星吸住大块（`body.crosshair-snap`）时，两条尺子上各从两个三角中间
**拉出一条半透明红带**，正好盖住两条线之间那一段：

| 元素 | 位置 | 盖住 |
|---|---|---|
| `.ruler-band-x` | 底尺，`height: var(--band-h)`（16px） | `[x1, x2]` |
| `.ruler-band-y` | 左尺，`width: var(--band-w)`（16px） | `[y1, y2]` |

### 2.2 为什么条带比尺子厚

`--band-h / --band-w = 16px`，而尺子只有 8px。**这是故意的**：
条带一半压在尺子上、一半探进内容区，读数的"让开"动作才有意义
（否则读数本来就在尺子上方，让它"移动至条带上方"根本看不出位移）。

### 2.3 位置用 transform，不用 left/width

```js
const tx = `translateX(${x1}px) scaleX(${(Math.max(0, x2 - x1) / vw).toFixed(6)})`;
```

CSS 里条带的宽度写死 `100vw`（纵向那条写 `100vh`），所以 scale 的比率
就是「间隔 ÷ 视口」。走合成器、不触发布局，和准星线是同一套做法。

**★ `transform-origin` 必须是 `left center`（纵带是 `center top`）** ——
否则它会从中间往两头长，看起来不像"从三角那里拉出来"。
`check.js` 有一条断言专门盯这个。

显隐**不在 JS 里管**：`.ruler-band { opacity: 0 }` +
`body.crosshair-snap .ruler-band { opacity: 1 }`，淡化交给 CSS 过渡。

### 2.4 `body.crosshair-snap`：吸边状态只有一个入口

新加的这个 class 由 `crosshair.js` 的 `setSnap()` **唯一**负责挂/摘：

```js
function setSnap(el) {
    if (el === snapEl) return;
    snapEl = el;
    document.body.classList.toggle("crosshair-snap", !!el);   // ← 只有这一处
    ...
}
```

之前 `snapEl` 是在 `mouseover` 里直接赋值的、开屏收缩时又单独 `snapEl = null`
一次 —— 现在两处都收敛进 `setSnap()`。**理由**：这一轮新加的"条带淡入"
依赖这个 class，如果以后有人只改了 `snapEl` 却忘了摘 class，
条带就会永远留在屏幕上；收敛成一个入口就不会。
`check.js` 断言这个字符串**带引号地**只出现一次。

### 2.5 读数：让开 + 逐渐变色

```css
.ruler-read { transition: color .35s var(--theme-ease), bottom .35s …, left .35s …; }
body.crosshair-snap .ruler-read      { color: var(--text); }   /* 红底红字看不清 */
body.crosshair-snap .ruler-read-x    { bottom: calc(var(--ruler-h) + 2px + var(--read-lift)); }
body.crosshair-snap .ruler-read-y    { left:   calc(var(--ruler-w) + 2px + var(--read-lift)); }
```

- 底尺那个读数**往上升**（让开横着的条带），左尺那个**往右让**（让开竖着的）。
  两者位移都走 `--read-lift`（18px），一个 token 调完。
- 变色是为了可读：条带是红的，读数原本也是 `--accent` 红 —— 叠在一起看不清，
  所以切到 `--text`（跟随主题，深浅两套都是高对比）。
- **降低动效那条 `* { transition-duration: .01ms !important }` 会把它压成硬切** ——
  这正是想要的：状态变化保留、过程去掉。

### 2.6 一个刻意的连带行为

开屏收缩时 `setSnap(null)` 会把 `crosshair-snap` 一起摘掉，
所以那半透明的红带**不会**在开屏期间冒出来。`check.js` 也钉了这条。

## 三、可调的都在一处

`css/style.css` 的 `:root`，紧挨着 `--ruler-w/h`：

```css
--band-alpha: 0.22;   /* 条带浓度 */
--band-h: 16px;       /* 底尺那条的厚度（尺子只有 8px） */
--band-w: 16px;       /* 左尺那条的宽度 */
--read-lift: 18px;    /* 读数让开条带多少 */
```

## 四、验证

- `node _dev/check.js`：**154 → 172 项全过**（新增 `[2g]` 18 条）。
  覆盖：文件拆分（main.js 里不再有准星本体、但那三个 class 必须还在、
  `crosshairPos` 跟着搬走）、**脚本顺序**、条带元素的个数 / opacity /
  token 化的颜色 / **transform-origin** / 用 translate+scale /
  没变不重写、读数的让开与变色、`crosshair-snap` 只有一处挂载、
  开屏时会被摘掉。
- 负向验证：把 `js/crosshair.js` 的 `<script>` 从 `index.html` 删掉 →
  3 条断言同时报红（含"排在 rulers.js 之前"）。加回来 → 全过。

## 五、★ 又栽在同一个坑上（第 4 次）

写 `[2g]` 的"脚本顺序"断言时，我用的是 `html.indexOf('js/rulers.js')`。
结果它命中的是**我这一轮新加的那句注释**——

```
<!-- 准星展开时从两个三角中间"拉出来"的半透明红带（P32）——
     宽度/位置由 js/rulers.js 写 transform，淡入淡出交给 … -->
```

这句注释在 `index.html` 里排在真正的 `<script src="js/rulers.js">` **之前**，
于是 `indexOf` 拿到的是注释的位置，断言直接判反。

**这已经是同一个坑的第 4 次**（P27 的 Crunch-Light、P29 的
`getBoundingClientRect`、P31 的 `getBoundingClientRect`、
这次的文件名）。规律很清楚：

> **凡是对源码做字符串断言，注释里的同一个词一定会骗过你。**

所以这轮的修法是把"找脚本位置"改成锚**属性**：
`html.indexOf('src="js/rulers.js"')` —— 注释里不会写 `src="…"`。
另外两处老断言（`[1]` 的 home-underline、`[2f]` 的准星元素）也一起改成了
`src="…"`，免得下次换个注释名又中招。

## 六、留给你确认的

1. **条带厚度 16px / 浓度 0.22 是我定的**，你可能想更薄或更淡 ——
   §三 那三个 token 改一下就行，不用碰逻辑。
2. **读数的让开方向**：底尺往上升、左尺往右让（我按"让开条带"推的）。
   如果你想让左尺那个也往上升，改 `.ruler-read-y` 那条规则即可。
3. **条带跟着准星一起缓动**（同一个 `place()` 调用里写），所以它和四条线
   是严格同步的；而它的**淡入**是 CSS 过渡（0.35s）—— 两者时间接近但不完全一样。
   想让淡入也严格跟手，就得把 opacity 也交给 JS。
4. `--band-h: 16px` 压在尺子（8px）上，所以条带上沿比尺子高 8px。
   如果它盖住了你觉得重要的东西，把 `--band-h` 改回 8px（等于贴在尺子上）。
5. `will-change` 那件事照旧：现在多了 2 个条带、1 个新文件。

---

# P33 圆形指针并入 crosshair.js + 吸附期缓动系数 ×2

## 一、动了哪些文件

| 文件 | 行数 | 改了什么 |
|---|---|---|
| `js/crosshair.js` | 248 → **301** | 新增 `cursorDot` 模块；新增 `EASE_SNAP` 与 `step()` 里的选择 |
| `js/main.js` | 451 → **423** | `cursorDot` 整段搬走，原地留一行指路注释 |
| `_dev/check.js` | — | 新增 `[2h]` 9 条 + **新增 `codeOnly()` 助手**（172 → 181 项） |
| `CHANGES.md` | — | 本节 |

## 二、圆形指针并入

`(function cursorDot() {...})()` 整段从 `main.js` 搬到 `crosshair.js`，
逻辑**一个字没改**（还是 `World.onFrame` + 0.8 系数 + 位置稳定就不碰 DOM）。
搬的理由：它和准星共用"鼠标在哪"这件事，放一起好对照。

搬过去之后在文件里补了一段说明**它和四条线的区别**，免得以后有人想"顺手合并"：

| | 四条线 | 圆形指针 |
|---|---|---|
| 位置 | 会被**吸走**到元素边缘 | **永远跟着鼠标** |
| 跟随系数 | `EASE` = 0.10（刻意的顺滑拖尾） | 硬编码 `0.8`（几乎实时） |
| 驱动 | 自己的 rAF（收敛就停） | `World.onFrame`（位置稳定就不写 DOM） |

**两者刻意不共享一份位置状态** —— 准星那四个位置吸住时是"元素边缘"，
而圆点永远是鼠标本身。硬凑成一份会立刻出错。

## 三、吸附期间缓动系数 ×2

```js
const EASE    = 0.10;
const EASE_SNAP = EASE * 2;                    // 吸附期两倍
...
const ease = snapEl ? EASE_SNAP : EASE;
const k = 1 - Math.pow(1 - ease, dt);
```

效果：吸住元素的瞬间，四条线"飞过去"的那段从 0.17s 缩到 0.08s（到 63%），
干脆很多。离开元素时 `snapEl` 已经清空，所以**收回来那一段仍是原速** ——
这是"吸附**期间**提高一倍"的字面意思。想让来回对称，把那个三元判断去掉、
只用 `EASE_SNAP` 就行（注释里写了）。

## 四、★ 关于"指针"指谁 —— 我按"准星"理解，理由如下

原话是"让**指针**'吸附'可交互元素期间的'缓动跟随系数'提高一倍"。
这句里的"指针"可以指刚提到的圆形指针，也可以指准星这套指针系统。
我按**准星**做了，理由是数学上只有这一种解释站得住：

- 准星的系数是 **0.10**，×2 = 0.20 —— 完全正常，而且效果明显（快一倍）。
- 圆形指针的系数是 **0.8**（每帧走完剩余距离的 80%，约 3 帧就到位）。
  **×2 = 1.6 > 1**，代入 `k = 1 - (1-1.6)^dt` 会得到 `k = 1.6`，
  也就是每帧**过冲 60%** —— 圆点会在鼠标两侧来回震荡，越走越远。
  而且 0.8 本身已经接近实时，就算按"每帧走两步"（`1-0.2² = 0.96`）来"提高一倍"，
  差别也只有 3 帧 → 2 帧，肉眼看不出。
- 另外 **"吸附"这件事只有准星有**：圆形指针从不吸附任何东西，它只跟鼠标。

**如果你要的其实是圆点**，正确做法不是把 0.8 乘 2，而是把它的**步数**乘 2：
`const k = 1 - Math.pow(1 - 0.8, dt * 2)`（吸附期间）。说一声我改。

`check.js` 里为此专门加了一条**防过冲**断言：把 `EASE` 和倍率都解析出来，
要求 `EASE × 倍率 < 1`。负向验证过 —— 把 `EASE` 改成 `0.6`（×2 = 1.2）会红：

```
✘ ★ EASE = 0.6，吸附期 = ×2 = 1.20，必须 < 1（≥1 每帧过冲 → 震荡）
```

> 这条断言是这一轮唯一"数学上真的会坏"的地方：
> 缓动系数只要 ≥ 1 就会震荡，而"提高一倍"这种需求最容易把 0.1 改成 0.6 再乘 2。

## 五、★★ 终于给"注释骗过断言"这个坑做了根治

第 2 节那个负向测试里，我断言"main.js 里不该再有 `.cursor-dot`"，
结果被**我自己刚写的那行注释**绊倒：

```js
/* 注：圆形指针（.cursor-dot）也搬去 js/crosshair.js 了（P33）—— */
```

**这是同一个坑的第 5 次**（P27 `Crunch-Light`、P29/P31
`getBoundingClientRect`、P32 `js/rulers.js`、P33 `.cursor-dot`）。
前四次我都是"就地修一下、记住下次注意"，于是第五次照旧。

这次不再靠记性，在 `check.js` 顶部加了一个共用助手，并在注释里把五次
都列了出来：

```js
const codeOnly = (src) => String(src)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')      // 块注释
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');  // 行注释（避开 https:// ）
```

规矩是：**凡是对源码做"有没有某个词"的判断，一律走 `codeOnly()`**；
只有极少数故意要查注释的断言才直接对原文做（并在名字里注明）。

## 六、验证

- `node _dev/check.js`：**172 → 181 项全过**（新增 `[2h]` 9 条）。
  覆盖：圆点在 crosshair.js 且 main.js 里没有（防止两边各留一份）、
  仍然只写 transform、仍然挂 `World.onFrame` 且**没有自己开 rAF**、
  圆点自己的 0.8 与准星那套分开、`EASE_SNAP = EASE × 2`、
  `step()` 按吸附状态选系数、`k` 用的是选出来的 `ease`、
  以及上面那条**防过冲**断言。
- 负向验证：把 `EASE` 改成 `0.6` → 两条断言报红（含防过冲那条）；
  改回 0.10 → 全过。

## 七、留给你确认的

1. **"指针"是不是准星**（见 §四）。如果不是，圆点的正确改法在那一节里。
2. **吸附期 0.20 合不合手**。想更快就 `EASE_SNAP = EASE * 3`（= 0.30，
   仍安全）；想再来回对称就按 §三 最后一句改。
3. `main.js` 现在 **423 行**，剩下的基本是开屏状态机（`finishIntro` /
   `skip` / 三条路径）+ 滚轮惯性 + 涟漪 + 文本选择。要再拆的话，
   **开屏状态机是最独立的一块**（它只跟 `body` 的 class 和
   `World.openGate()` 打交道）。

---

# P34 吸附期系数改成写死的 0.75 + 开屏第二对改收右下角

## 一、吸附期缓动系数：`EASE × 2` → 直接写死的 `0.75`

你确认了"指针"指的是准星的吸附，并说 0.20 还是有点低，让改成 0.6~0.9
之间的一个数。现在是一个**字面量**：

```js
const EASE      = 0.10;   // 平时（跟鼠标）—— 不动
const EASE_SNAP = 0.75;   // 吸附期（飞向元素四边）—— P34 手调
```

| 系数 | 约几帧到位 | 说明 |
|---|---|---|
| 0.60 | ~5 帧（83ms） | 区间下端 |
| **0.75** | **~4 帧（67ms）** | ← 现在用这个 |
| 0.90 | ~3 帧（50ms） | 区间上端，已经接近"瞬间" |
| ~~1.00+~~ | — | **不行**：`k ≥ 1` 每帧过冲 → 震荡 |

改成字面量（而不是 `EASE * N`）的理由：这是**手调量**，不该跟 `EASE`
绑成比例 —— 以后调平时的手感时，不应该顺手把吸附的手感也一起改了。

`check.js` 里跟着改了三件事：
1. 断言它现在是**字面量**（`!/EASE_SNAP = EASE/`），不再解析倍率；
2. 断言 `EASE_SNAP > EASE`（吸附期必须更快，别改反）；
3. **`★ 两个系数都必须 < 1`** —— 防过冲。这条是保命的：
   "再快一点"这种需求很容易一路加到 1 以上。
   另外加了一条软提示：吸附系数要落在约定的 **0.6~0.9** 区间内，
   免得以后悄悄飘到区间外。

负向验证：把 `EASE` 改到 0.6（旧写法下 ×2 = 1.2）会红；现在把
`EASE_SNAP` 写到 `1.2` 同样会红。

## 二、开屏第二对：从左下角 → **右下角**

```js
/* 第一对 → 左上角 */
x1 = tx1 = 0;                      // 左线收到屏幕左边
y1 = ty1 = 0;                      // 上线收到屏幕上边
/* 第二对 → 右下角（P34 从"左下角"改过来） */
x2 = tx2 = window.innerWidth;      // 右线收到屏幕右边
y2 = ty2 = window.innerHeight;     // 下线收到屏幕下边
```

**改完之后设计反而更自洽了**：原来是"两条垂直线都收到左边、
两条水平线一个收上边一个收下边"，读起来是"收到一半的 `[` 形"。
现在变成**每条线收到自己那一侧的屏幕边**：

| 线 | 它是哪条 | 收到哪 |
|---|---|---|
| `v1` | 左 | `x = 0`（屏幕左边） |
| `h1` | 上 | `y = 0`（屏幕上边） |
| `v2` | 右 | `x = innerWidth`（屏幕右边） |
| `h2` | 下 | `y = innerHeight`（屏幕下边） |

两对正好落在**对角**（左上 / 右下），收缩结束时四条线沿视口四边摆成一个
**框** —— 正好接上"悬停时展开成框"那个正式用法，开屏的收尾和日常的
展开成了同一个图形。平面设计上对角也比同侧更稳。

- 收缩结束的位置**只是 origin**：`scaleY/scaleX` 收到 1px 后，
  四条线分别贴在视口的上/下/左/右四条边上。
- **降低动效那条路径不受影响**：它加的是 `crosshair-active` +
  `crosshair-active-done`（同一个 `classList.add`，只触发一次 mutation），
  观察器的 `active && !done` 照样把它排除，直接停在屏幕中心的正常十字。

## 三、动了哪些文件

| 文件 | 改了什么 |
|---|---|
| `js/crosshair.js` | `EASE_SNAP` 改成字面量 `0.75` + 注释重写；观察器里 `x2` 改成 `window.innerWidth`；文件头与段注释同步 |
| `_dev/check.js` | `[2f]` 的"开屏两角"断言改成左上/右下；`[2h]` 改成解析两个字面量 + 新增区间断言（181 → 183 项） |
| `CHANGES.md` | 本节；**并回到 P31 节那里加了一行 `⚠ P34 已改` 的更正标记**（那节写的是"左下角"，不改的话后面读的人会被误导） |

## 四、验证

- `node _dev/check.js`：**183 项全过**。
- 负向验证两处：`EASE`/`EASE_SNAP` 越界会红；删掉 `crosshair.js` 的
  `<script>` 会让三条顺序断言同时红。
- 23 个 JS 语法全 OK。

## 五、留给你确认的

1. **0.75 合不合手**。区间两端分别是 0.6（更柔）和 0.9（更硬），
   换一个数就一行（`js/crosshair.js` 的 `const EASE_SNAP = …`）；
   注意别超过 1。
2. **"收回来"那一段仍然是 `EASE` = 0.10**（因为离开元素时 `snapEl`
   已经清空）。所以现在的观感是"吸过去很快、松手回来慢"。
   如果觉得不对称、想让回去也快，把 `step()` 里那个三元判断去掉、
   只用 `EASE_SNAP` 就行 —— 这是**目前最可能让你觉得"还是有点怪"的地方**，
   我特意留着没动。
3. 开屏收缩的终点现在是四个视口边的框。如果你更想要"收到中间某处"
   或者别的形状，改那四行赋值即可，`check.js` 会跟着提示要改哪条断言。

---

# P35 修：不动鼠标只滚滚轮时，"悬停 / 吸边"状态会变陈

## 一、现象与根因

**现象**：鼠标移到可交互对象上 → 吸边生效；然后**鼠标不动、只滚滚轮**，
对象滚走了，四条线却还吸在它身上跟着滑出屏幕，`crosshair-hover` 也还挂着。

**根因**：`mouseover` **只在鼠标移动到新元素上时触发**。
页面在光标底下滚过去时，浏览器**不会**补发 `mouseover`/`mouseout`
（CSS 的 `:hover` 会跟着更新，但 JS 事件不会）。
于是"光标底下已经换人了"这件事没人知道，状态就一直停在旧的。

原来的注释里我还写着"只靠 mouseover 就够判断进出"——**那句只在鼠标会动的前提下成立**。
滚动这条路径完全没覆盖。你的判断是对的：检测确实只在鼠标移动时触发。

## 二、修法

把"悬停判定"收敛成一个函数，然后在**三个**时机调用它：

```js
function applyHover(t) {
    document.body.classList.toggle("crosshair-hover", !!(t && t.closest(HOVER_SEL)));
    setSnap(t ? t.closest(SNAP_SEL) : null);
}
```

| 时机 | 谁触发 | 说明 |
|---|---|---|
| 鼠标移动到新元素 | `mouseover` | 原来就有 |
| **页面滚动** | `document` 的 **capture 阶段** `scroll` | ★ 新增，就是这次的修 |
| **布局变化** | `World.onLayout` / `resize` | ★ 新增，resize / 横竖屏 / 字体到位后重排 |

后两条都用 `document.elementFromPoint(mx, my)` 问"光标底下现在是谁"。

几个关键细节：

1. **`capture: true`**：`scroll` 事件不冒泡，但**仍然会走捕获阶段** ——
   所以在 `document` 上挂捕获监听，连 `#skills` 那种**嵌套滚动容器**里的
   滚动也能收到（`World.onScroll` 只看 `main.scrollLeft`，收不到嵌套的）。
2. **每帧最多一次**：滚动事件比帧密得多，所以用一次 `requestAnimationFrame`
   合并（`recheckRaf` 守卫）。
3. **`pointerSeen` 守卫**：鼠标从没进过窗口时，`mx/my` 还是初始的屏幕中心 ——
   这时候做命中测试会**凭空吸住屏幕中心那个东西**。所以先不做。
4. **命中测试会跳过准星自己**：四条线 / 三角 / 读数 / 红带 / 圆点
   全都是 `pointer-events: none`，`elementFromPoint` 天然返回不到它们。
   `check.js` 里为此加了一条断言 —— 这是整个修法的前提，改坏一个就全错。
5. **两条滚动处理都要留**，它们管的是不同的事：

   | | 管什么 | 机制 |
   |---|---|---|
   | `World.onScroll`（原有） | 元素**还在**光标下、只是位置挪了 → 线条跟着它走 | 用 `scrollX` 差值，零布局读取 |
   | `recheckUnderCursor`（新） | 元素**已经不在**光标下了 → 该松手就松手 | `elementFromPoint` 命中测试 |

   只有前者 → 线条会"跟着跑掉的元素滑出去"（就是你看到的现象）；
   只有后者 → 元素还在光标下但滚走一点时，线条不会跟着挪。两条都不能删，
   `check.js` 有断言盯着。

**代价（要说清）**：`elementFromPoint` 是一次命中测试，滚动时每帧一次。
它不像 `getBoundingClientRect` 那样必然触发布局（滚动期间布局通常是干净的），
但确实比"纯算差值"贵。之所以接受：**不动鼠标就想知道光标底下换了谁，
没有更便宜的通用办法**（元素的 rect 我们没法预先知道）。真在 profile 里
看到它了，可以加一条便宜的前置判断：还吸着时先用滚动差值算出的矩形
判断"光标是否仍在里面"，在才做命中测试。

## 三、★ 顺手发现的一件事：`EASE_SNAP` 现在是 `0.4`，而且我的断言在挡它

这轮跑自检时有一条红了：

```
✘ ★ 吸附期系数落在约定的 0.6~0.9 区间内（当前 0.4）
```

我查了一下：`check.js` **没有任何写文件的调用**，`strip-bom.js` 只以 `--dry`
跑过 —— 所以 `0.4` 不是我这边写的，也不是我上轮设的 `0.75`。
看起来是你自己调的（我上一轮报告里写的是 0.75）。

**我没有去改它**（你在调手感，不该被我的默认值覆盖）。但这条断言必须处理：

> ★ **断言只能编码"会坏掉"的边界，不能编码"我觉得好看"的区间。**

"必须落在 0.6~0.9"是我上一轮**把你的建议当成了规格**写进断言的 ——
结果它变成了一个**挡住你调参的构建错误**。这和 P29 那条教训是同一个东西
（"一条永远为绿的检查不是资产，是负债"），只是这次表现成"一条拦住用户的检查"。

所以现在只剩数学事实那一条：**`0 < 系数 < 1`**（≥1 每帧过冲 → 震荡）。
具体取多少完全不限制，注释里留了几个参考量级供你挑。

## 四、验证

- `node _dev/check.js`：**183 → 191 项全过**（新增 `[2i]` 9 条）。
  覆盖：`applyHover()` 收敛且被**两处**调用、滚动命中测试、
  `capture: true`、每帧一次、布局变化也重判、`pointerSeen` 守卫、
  准星元素全是 `pointer-events: none`（命中测试的前提）、
  两条滚动处理都在。
- 负向验证：把 `capture: true` 去掉 → 断言如实报红；加回来 → 全过。
- 23 个 JS 语法全 OK。

## 五、留给你确认的

1. **滚动场景请实际试一下**：把鼠标停在一个 media 面板上不动，滚动滚轮，
   面板滑走时四条线应该**松开并回到鼠标位置**（而不是跟着面板滑出去），
   红带也应同时淡出。
2. `EASE_SNAP` 现在是 **0.4**（你的值）。想更快就往 1 靠，
   参考：0.4 约 7 帧、0.6 约 5 帧、0.75 约 4 帧、0.9 约 3 帧。**不能 ≥ 1**。
3. 嵌套滚动（`#skills` 那个竖滚容器）现在也覆盖到了 —— 不过准星的吸边目标
   （`.card` / `.media-panel` / `.btn`）都不在那个容器里，所以实际影响不大，
   算是顺手做全。

---

# P36 修：滚轮把元素送进光标下时吸附有偏移 + media-panel 的 `:hover` 也会变陈

P35 那两个修复各自都还差一截，这轮补上。

## 一、吸附"向着滚动方向偏一点，滚得越快越偏"

### 根因：基准 scrollX 和 rect 不同源，差了**一帧的滚动量**

吸边的定位是"量一次 rect，之后只算滚了多少"：

```js
snapRect    = el.getBoundingClientRect();   // ← 浏览器**当下**的滚动位置
snapScrollX = World.scrollX;                // ← world.js 在**它自己的 rAF 里**刷的缓存值
...
target = snapRect.left - (World.scrollX - snapScrollX);
```

`getBoundingClientRect()` 反映的是当下的滚动位置，而 `World.scrollX` 是
`syncScroll()` 在 World 那个 rAF 里刷新的缓存 —— 两者**可能差一帧的滚动量 δ**。

于是记下来的基准是"旧"的：之后每次算出来的 `dx` 都整体偏 δ，
而 **δ 正比于滚动速度** → 表现就是"滚得越快偏得越多"。
偏移方向也正好是滚动方向（因为 δ 就是这一帧滚过的距离）。

### 修法：两处，缺一不可

```js
/* ① 基准必须读**实时**的 scrollLeft，和 rect 同一时刻、同一源头 */
function liveScrollX() {
    return (window.World && World.main) ? World.main.scrollLeft : 0;
}
...
snapRect    = el.getBoundingClientRect();
snapScrollX = liveScrollX();      // ← 这两行必须挨着
targetFromSnap(0);                // ← ② 刚量完，dx 必须是 0
```

- **①** 让基准和 rect 口径一致，之后 `World.scrollX - snapScrollX` 才是准的
  （`World.onScroll` 那一刻 `World.scrollX` 就是刚读的 `mainEl.scrollLeft`，是新的）。
- **②** `targetFromSnap` 改成**由调用方给 dx**：`setSnap` 里是"刚量完 → 0"，
  `World.onScroll` 里才是差值。不这样做的话，第一拍会拿那个还落后一帧的缓存值
  再算一次，把同一段滚动**算两遍**。

两条都补上之后：rect 与基准同步 → 初拍不重复扣 → 偏移消失。
`check.js` 有两条断言分别盯着它们（负向验证：把 ① 改回 `World.scrollX`
会让两条同时报红）。

## 二、media-panel 的悬停也是同一个毛病，只是长在 CSS 那侧

你说"media-panel 容器也有这个鼠标不移动就不触发进入、离开的事件"——
查下来它的悬停揭示（底图淡入 + 标题变红）是**纯 CSS `:hover`**：

```css
@media (hover: hover) and (pointer: fine) {
    .media-panel:hover .media-panel-bg { opacity: 1; transform: scale(1); }
    .media-panel:hover .media-panel-title { color: var(--accent); ... }
}
```

**浏览器在"页面从光标底下滚过去"时并不保证更新 `:hover`** ——
这和 `mouseover` 是同一个毛病，只是换到了 CSS 那侧。

### 修法：同一次命中测试顺手维护一个 `is-hot`

`js/crosshair.js` 已经在滚动 / 布局变化时做 `elementFromPoint` 了，
所以不用再加一次命中测试 —— 就着同一个结果给命中的面板标一个类：

```js
const LIVE_HOVER_SEL = ".media-panel";
function setLiveHot(el) {
    if (el === hotEl) return;
    if (hotEl) hotEl.classList.remove("is-hot");   // 只留一个
    hotEl = el;
    if (hotEl) hotEl.classList.add("is-hot");
}
```

CSS 那边 `:hover` 和 `.is-hot` 各写一份、指向同一套样式
（保留 `:hover` 是因为它在正常鼠标移动时是免费的、而且触屏那条
`@media (hover: hover)` 保护也还要它）。

★ 只在 `applyHover()` 里调用 —— 和吸边、变色共用**同一个**"光标底下是谁"的结论，
所以三者永远不会互相不一致。

## 三、动了哪些文件

| 文件 | 改了什么 |
|---|---|
| `js/crosshair.js` | 新增 `liveScrollX()`；`targetFromSnap(dx)` 改成由调用方给 dx；`setSnap` 里 rect 与基准挨着取；新增 `LIVE_HOVER_SEL` / `hotEl` / `setLiveHot()`，并在 `applyHover()` 里接上 |
| `css/style.css` | `.media-panel` 的两条悬停规则各加了 `.is-hot` 版本 |
| `_dev/check.js` | `[2i]` 追加 7 条（191 → **198** 项）；`targetFromSnap` 的正则放宽以适配新签名 |
| `CHANGES.md` | 本节 |

## 四、验证

- `node _dev/check.js`：**198 项全过**。
- 负向验证：把 `snapScrollX` 改回 `World.scrollX` → 两条断言同时报红
  （包括"刚量完 dx 必须是 0"那条，因为两处是配套的）。
- 23 个 JS 语法全 OK。

## 五、留给你确认的

1. **滚轮把面板送进光标下**：现在吸附应该**正好落在面板四边**上，
   不再有随速度增长的偏移。
2. **面板滚走**：底图应该跟着灭、标题跟着回黑（`is-hot` 被摘掉）。
   注意 `is-hot` 和 `:hover` 现在都可能命中，两者指向同一套样式，不会打架。
3. `EASE_SNAP` 还是你那个 **0.4**，我没动。
4. 如果还有别的"纯 CSS `:hover` 且会随页面滚走"的装饰，把它的选择器加进
   `LIVE_HOVER_SEL`、CSS 那边补一条 `.is-hot` 版本就行 —— 机制是通用的，
   目前只接了 `.media-panel`（你点到的那一个）。

---

# P37 修：P36 只补了"能用的那条路"，没拆掉"会卡的那条"

## 一、现象与根因

**现象**：鼠标**主动移进** media-panel / 按钮（悬停生效），
再**只滚滚轮**把它们移开 —— 悬停态**不消失**，元素一直亮着。
（对比：P35/P36 修的"滚轮把元素送进光标下"是好的。）

**根因**：P36 我写的是「`:hover` 和 `.is-hot` 各一份指向同一套样式」：

```css
.media-panel:hover .media-panel-bg,
.media-panel.is-hot .media-panel-bg { opacity: 1; transform: scale(1); }
```

`is-hot` 会被我们的滚动命中测试**可靠地摘掉** —— 但**浏览器那条卡住的
`:hover` 还在**（"页面从光标底下滚过去时 `:hover` 不保证更新"就是 P36 自己
写下的根因，我只是给它加了个伴，没把它请走）。

于是"先移鼠标进去"（`:hover` 挂上）→"再滚轮滚走"（`is-hot` 摘了、
`:hover` 卡住）→ 元素依旧亮着。**我修的是入口，漏的是出口。**

## 二、修法：判据只能留一个，而且是**我们能清除**的那个

> ★★ **两个判据指向同一套样式时，只要有一个会卡，整体就是卡的。**

所以 `main` 里所有悬停规则一律**去掉 `:hover`、只留 `.is-hot`**。
不是"再加一条"，而是**把会卡的那条删掉**：

| 位置 | 之前 | 现在 |
|---|---|---|
| `.media-panel`（底图 / 标题） | `:hover` + `.is-hot` | **只有 `.is-hot`** |
| `.btn.primary` / `.btn.ghost` | `:hover` | `.is-hot` |
| `.hero h1` | `:hover` | `.is-hot` |
| `.card` / `.card[data-work]` | `:hover` | `.is-hot`（停用段落，一并改，免留地雷） |
| `.ak-card` / `.ak-card::after` | `:hover` | `.is-hot`（同上） |
| `#about .container` / `::before` | `:hover` | `.is-hot`（同上，含降动效块那条） |

`LIVE_HOVER_SEL` 相应扩成
`.media-panel, .btn, .hero h1, .card, .ak-card, #about .container`。

**停用段落也一起改了**：`.card` / `.ak-card` / `#about` 现在 HTML 里是注释掉的，
但它们是 `main` 里的东西，重新启用时会立刻踩同一个坑
（而 `#projects` 的卡片是浮窗的入口，迟早要回来）。顺手改掉，不留地雷。

**固定的导航栏 / 弹窗保留 `:hover`**：导航栏是 `position: fixed`，
不随页面滚动，`:hover` 在那边是准的，没必要多绕一层 JS；
弹窗在顶层 `<dialog>` 里，不随 `main` 滚。

## 三、连带的必要改动：移出窗口要自己摘类

`:hover` 一走，浏览器就不再替我们清悬停态了。所以补上：

```js
document.addEventListener("mouseleave", () => {
    document.body.classList.add("crosshair-hidden");
    applyHover(null);        // ← P37 新增：不清的话，鼠标移出窗口后面板还亮着
});
```

**这一条不是锦上添花，是去掉 `:hover` 之后必须还的债** ——
只要自己接管了悬停态，就得自己负责在每一个"不再悬停"的时刻清掉。
（"不再悬停"的三个时刻：移开 / 滚走 / 移出窗口。前两个 P35 已经覆盖。）

## 四、★ 加了一条全量守卫，防止这个坑再长出来

原来的断言只盯着几个具体选择器，所以 P36 那种"两个判据并存"没被拦住。
现在改成**全量白名单**：

```
:hover 只出现在白名单里（固定 chrome / 弹窗 / 滚动条），共 7 处
```

它扫出 CSS 里**所有**带 `:hover` 的选择器，逐个对照白名单
（`.nav-links a` / `.theme-toggle` / 滚动条 / 四个 `.win-*`），
白名单外一旦出现就失败，并直接说明为什么：

```
✘ :hover 只出现在白名单里（固定 chrome / 弹窗 / 滚动条），共 8 处
   → 白名单外: .subtitle:hover  → main 里的东西会随页面滚走，:hover 会卡住
```

这样以后**任何人想在 `main` 里加一条 `:hover`，都会被拦下来**，
并被要求先回答"它会不会随页面滚走"。

## 五、动了哪些文件

| 文件 | 改了什么 |
|---|---|
| `css/style.css` | 8 组悬停规则去掉 `:hover`、改成 `.is-hot`（含降动效块里配套的那条 `borderFlow`）；`.media-panel` 那组不再双判据 |
| `js/crosshair.js` | `LIVE_HOVER_SEL` 扩到 6 个选择器；`mouseleave` 时 `applyHover(null)` |
| `_dev/check.js` | 换成 `.is-hot` 那组断言 + **全量 `:hover` 白名单守卫**（198 → **201** 项） |
| `CHANGES.md` | 本节 |

## 六、验证

- `node _dev/check.js`：**201 项全过**，其中那条全量白名单报
  "共 7 处"，全在固定 chrome / 弹窗 / 滚动条里。
- 负向验证：临时给 `.subtitle` 加一条 `:hover` → 断言如实报红并指名道姓；
  删掉 → 全过。
- 23 个 JS 语法全 OK；CSS 无 BOM、合法 UTF-8（负向测试时我用 Node 直接改过
  那个文件，事后核过编码）。

## 七、留给你确认的

1. **鼠标主动移进面板/按钮 → 滚滚轮移开**：悬停态现在应该跟着消失。
2. **鼠标移出浏览器窗口**：面板应该灭掉（这条是这次新补的）。
3. **固定的导航栏链接**仍然是原生 `:hover`（没变）。
4. `EASE_SNAP` 还是 **0.4**，我没动。
5. 以后想给 `main` 里的新元素加悬停：**用 `.is-hot`，别用 `:hover`**，
   并把选择器加进 `js/crosshair.js` 的 `LIVE_HOVER_SEL`。
   check.js 会在你误用 `:hover` 时告诉你。

---

# P38 吸附到位后锁死（系数 1）+ 读数按吸附状态切换

## 一、缓动系数改成三档

```js
const ease = locked ? 1 : (snapEl ? EASE_SNAP : EASE);
```

| 状态 | 系数 | 语义 |
|---|---|---|
| 平时（跟鼠标） | `EASE` = 0.10 | 刻意的顺滑拖尾 |
| 吸住元素、**还在飞过去** | `EASE_SNAP` = 0.4 | 干脆地扑上去 |
| **已经完全吸住** | **1** | **零缓动，元素怎么动我就怎么跟** |

- **`locked` 在哪儿置上**：`step()` 里"四条都到位"那一拍（`if (snapEl) locked = true;`）。
  也就是"飞过去了"和"贴住了"是同一个判断的两面。
- **在哪儿解除**：`setSnap()` 里（换元素 / 松手）。所以"直到切换元素或
  鼠标离开元素"这句话正好对应它 —— 除此以外不会掉出锁死态。
  **重新量 rect（resize）不解锁**：那还是同一个元素，只是它换了个尺寸/位置，
  该继续贴死。
- 系数 `1` 在这里是**安全**的：`k = 1 - (1-1)^dt = 1`，一步到位、不过冲。
  （≥1 才会震荡，`1` 正好是边界上的"完全跟死"。）

**为什么需要它**：元素一旦被吸住，它的位置就不再由鼠标决定 ——
滚轮把它带走、窗口缩放改了它的尺寸，四条线都得**同一帧**贴住。
有缓动尾巴的话，滚动时那个框会明显"拖"在元素后面。

## 二、读数改成按**吸附状态**切换，而不是"等两条线合拢"

之前：

```js
const txtX = gapX < MERGED ? String(Math.round(x1)) : String(Math.round(gapX));
```

问题：脱离吸附之后，两条线要动画收回鼠标位置，这段过程里**间隔还在**，
于是读数会显示一个正在缩小的数字（`120 → 80 → 30 → 0`），要到合拢那一刻
才跳到坐标 —— 既不好看也不好看懂。

现在：

```js
const snapped = document.body.classList.contains("crosshair-snap");
const txtX = snapped ? String(Math.round(gapX)) : String(Math.round(midX));
```

- **吸附中** → 两个三角的间隔像素（顺带就是那个元素的宽 / 高）
- **其余时刻** → **中点坐标**

于是**一松手读数立刻就是坐标**，不再有那段"缩小的间隔"。
而且用的坐标是**中点**（`(x1+x2)/2`）—— 读数本来就摆在中点上，
标签和位置自洽。

判据为什么读 class 而不是让 `crosshair.js` 多传一个参数：
`crosshair-snap` 本来就是"吸着没有"的唯一出口（P32 定的），
读它等于读同一个事实，也省得再改一次订阅签名。
`MERGED` 那个阈值随之删掉了（留着说明没改干净，check.js 有断言盯着）。

## 三、顺手修掉一个相关的旧问题：resize 时 rect 会变馊

吸边定位是"量一次 rect，之后只算滚了多少"。**这招只对横向滚动成立** ——
resize 会改变元素的位置和**尺寸**，差值救不了。

原来的 `setSnap` 里，如果命中的还是同一个元素，会直接 `return`（不重量），
所以**窗口缩放时如果鼠标正悬停着，那个框会一直按旧的 rect 摆**。

这轮把"量 rect"抽成 `anchor(el)`，并新增 `relayout()`：

```js
function relayout() {
    if (snapEl) { anchor(snapEl); wake(); }   // 同一个元素也要重量
    recheckUnderCursor();                     // 顺便再判一次命中
}
World.onLayout(relayout);
```

**滚动仍然不重量**（走差值，省一次布局读取）——
只有布局变化才重量，这是两者的正确分工。

> 这条不是新需求，但它和这轮的目标是同一件事：你要的是"贴死"，
> 而一个陈旧的 rect 会让"贴死"贴到错误的地方。

## 四、动了哪些文件

| 文件 | 改了什么 |
|---|---|
| `js/crosshair.js` | 新增 `locked`；`step()` 三档系数 + 到位置锁；`setSnap()` 解锁；抽出 `anchor()`；新增 `relayout()`（resize 重量 rect） |
| `js/rulers.js` | 读数判据换成 `body.crosshair-snap`；坐标改用中点；删掉 `MERGED` |
| `_dev/check.js` | 更新 3 条旧断言 + 新增 6 条（201 → **207** 项） |
| `CHANGES.md` | 本节 |

## 五、验证

- `node _dev/check.js`：**207 项全过**。
- 负向验证：把 `locked = true` 改成 `false` → 断言如实报红；改回来 → 全过。
- 23 个 JS 语法全 OK。

## 六、★ 顺带记一下：那个"注释骗过断言"的坑第 6 次出现了

这轮我把 `jsRulers` 从 `read('js/rulers.js')` 改成 **`codeOnly(read(...))`** ——
因为我在 `rulers.js` 的注释里写了 `crosshair-snap` 和 `MERGED` 这两个词，
而这一组里正好有几条"**不该**包含某个词"的断言。

**这是同一个坑的第 6 次**（P27 / P29 / P31 / P32 / P33 / 这次）。
区别是这次我**有工具了**（P33 加的 `codeOnly()`），所以是"改一个词"而不是
"debug 半小时"。P33 那次立的规矩正在生效。

## 七、留给你确认的

1. **吸住之后滚滚轮**：框应该**严丝合缝跟着元素走**，一点不拖。
2. **吸住之后拖窗口缩放**：框也应该跟着变（这条是顺手修的旧问题）。
3. **松手的瞬间**：读数应该**立刻**变成中点坐标，而不是先显示一个缩小的间隔。
4. `EASE_SNAP` 还是你那个 **0.4**（"飞过去"那一段的速度），我没动。
   锁死那一档的 `1` 是死的，没有可调空间（也不能再大）。

---

# P39 修：锁死改成"整个取消缓动"（问题不在系数，在时机）

你说"就算缓动系数为 1，肉眼始终可见一点点延迟" —— **这个判断是对的，
而且原因不是系数**。先把机理说清楚，因为它决定了修法。

## 一、为什么系数 1 也救不了

`ease = 1` 时 `k = 1 - (1-1)^dt = 1`，`x += (tx - x) * 1` 就是 `x = tx`，
**数值上是精确的、没有插值残留**。剩下的延迟来自**两处时机**：

| # | 问题 | 代价 |
|---|---|---|
| ① | `World.onScroll` 里只调了 `wake()`，它再排一个 rAF，`apply()` 要等**下一帧**才发生 | 多 1 帧 |
| ② | `scroll` 事件在同一帧里**排在 rAF 之前**；内容是在**合成器**上滚的，而我们等 rAF 才写 `transform-origin` | 至少 1 帧 |

② 是根子：**内容先在合成器上滚走了，准星下一帧才追上**。
调系数只会改变"追上的速度"，改变不了"第几帧才开始追"。

## 二、修法

### 1. 锁死阈值：0.1px → **10px**（`LOCK_EPS`）

```js
const LOCK_EPS = 10;
...
if (snapEl && far < LOCK_EPS) { locked = true; snapToTargets(); rafId = null; return; }
```

原来要等四条线都进到 0.1px 才锁 —— 那基本等于等缓动尾巴走完，
而**那段尾巴本身就是你看到的那点延迟**。现在 10px 以内直接认作"到位"，
提前锁上、把尾巴砍掉。

`far` 取四条里最远的那条（`Math.max`），少一条没到都不算。

### 2. 锁死之后：不是"系数 1"，是**整个缓动机制退役**

```js
function snapToTargets() {
    if (x1 === tx1 && x2 === tx2 && y1 === ty1 && y2 === ty2) return;  // 没变就不白写
    x1 = tx1; x2 = tx2; y1 = ty1; y2 = ty2;
    apply();
}
```

没有系数、没有 `Math.pow`、没有插值、**不排 rAF** —— 直接赋值。
`step()` 在锁死之后**再也不会被进入**（它现在只剩两档系数：
吸附中 `EASE_SNAP` / 平时 `EASE`）。

### 3. 目标变化的出口收敛成 `settle()`

```js
function settle() {
    if (locked) { snapToTargets(); return; }   // 同步落位
    wake();                                     // 走缓动
}
```

`setSnap` / `World.onScroll` / `relayout` / `mousemove` 全部改调它 ——
以后加新的"改目标"的地方也只需要记一件事：**调 `settle()`，别直接调 `wake()`**。

### 4. ★★ 真正消掉延迟的一步：锁死时在 `scroll` 事件里**同步**更新

```js
document.addEventListener("scroll", () => {
    if (locked && snapEl) {
        targetFromSnap(liveScrollX() - snapScrollX);
        snapToTargets();          // ← 当场写，不等 rAF
    }
    recheckUnderCursor();
}, { passive: true, capture: true });
```

这是整个修复的关键：`scroll` 事件在**同一帧里排在 rAF 之前**，
所以当场写 `transform-origin`，这次写入会和内容的滚动**一起提交到同一帧** ——
两者同帧移动，看不出任何延迟。

**非锁死状态仍然交给 rAF**：那本来就是一段动画（飞过去 / 收回来），
不需要也不应该去抢帧。

> 现在一共两条滚动处理，分工是：
> | 谁 | 管什么 | 时机 |
> |---|---|---|
> | capture 里那条（新） | 锁死后逐帧对齐 | **同步**，抢在同一帧 |
> | `World.onScroll`（原有） | 滑入 / 滑出动画中的目标更新 | rAF |
>
> 两者用的是同一个 `targetFromSnap`，先跑先算、后跑算出来一样，重复无害。

## 三、代价（要说清）

锁死那一刻会有**最多 10px 的一下"落位"**：从"还差 9px"直接跳到"精确贴合"。
相对它换来的零延迟，这个代价可以忽略；想再小就把 `LOCK_EPS` 调小
（越小越晚锁、落位越平滑，但延迟回来得越多）。这一个数就是全部的权衡。

## 四、动了哪些文件

| 文件 | 改了什么 |
|---|---|
| `js/crosshair.js` | 新增 `LOCK_EPS = 10` / `snapToTargets()` / `settle()`；`step()` 去掉锁死档、改为按 `LOCK_EPS` 判定；`scroll` 监听改成锁死时同步落位；所有改目标的地方改调 `settle()` |
| `_dev/check.js` | 更新 6 条旧断言 + 新增 4 条（207 → **211** 项） |
| `CHANGES.md` | 本节 |

## 五、验证

- `node _dev/check.js`：**211 项全过**。
- 负向验证：把 `scroll` 里那段同步落位删掉（退回"只 recheck"）→
  断言如实报红；加回来 → 全过。
- 23 个 JS 语法全 OK。

## 六、留给你确认的

1. **吸住后滚滚轮**：现在应该**完全看不出延迟**了 —— 框和元素同帧移动。
2. **锁死那一下**：从 ≤10px 精确贴合，理论上有个极小的"落位"，
   如果看得见就把 `LOCK_EPS` 调到 6~8 试试。
3. **如果还能看出一丝延迟**，那就只剩最后一条路：**把线放进滚动容器里
   做 `position: absolute`**，让浏览器自己带着它滚（合成器级、绝对零延迟）。
   代价是准星要拆成"跟鼠标的一套 + 跟元素的一套"两组元素、按状态切换，
   是个结构性改动。**先试试现在这版** ——理论上它已经和内容同帧了。
4. `EASE_SNAP` 仍是 **0.4**，没动。锁死那一档现在没有系数可调了
   （它不再是缓动），唯一的旋钮是 `LOCK_EPS`。

---

# P40 框选量取：拖出一个框 → 规格进剪贴板

## 一、这是什么

按住左键拖出一个框，松手把这一块的**规格**写进剪贴板：

```
467 × 608 @ (1053, 236)  ·  #media 绘画
```

底尺读数在拖的过程中实时变成框的宽（左尺是框的高），松手后读数旁边挂一个
"已复制"。就这些 —— 不动布局、不碰浮窗。

## 二、★★ 触发方式：位移阈值，不是长按

你的原始想法是"长按左键框选"，我换掉了，理由很具体：

- **长按在给出反馈之前，无法区分"点一下"和"按住了"** —— 必然要等一个
  200~400ms 的窗口才能决定。而这站的 `.media-panel` / `.card`
  **单击是打开作品浮窗的**，加这个窗口就等于给"打开作品"加延迟、加误触。
- **时间阈值制造延迟，位移阈值不制造。** 松手时移动不到 `DRAG_MIN`(4px)
  算单击（放行），超过就算拖框（把随后的 click 拦掉）。所有画图工具都是这么分的。
- 拖拽本来就是空着的：你们已经全局 `user-select: none` + 拦了 `dragstart`，
  没有任何原生行为在占这个手势。**所以根本不需要"长按"来腾地方。**

## 三、★★ 四条线本来就是框，所以一个新元素都不用加

准星是"两条垂直 + 两条水平"，**框选也是同一个形状**。所以这次没有任何新元素：

| 已有的东西 | 在框选里的角色 |
|---|---|
| 四条线 | 框的四条边（位置从"元素四边"换成"框的两个角"，min/max 归一化，任意方向拖都对） |
| 红带 | 框在尺子上的投影（**同一套** `.crosshair-measuring`） |
| 四个三角 | 框的四个边界刻度 |
| 两个读数 | 框的 宽 / 高（W 在底尺、H 在左尺，和吸住元素时完全一致） |
| 复制回执 | 读数上挂一个 CSS `::after`（**没有新增 DOM**） |

**吸住元素**和**拖框量取**是同一台仪器的两个挡位，表现完全一样，
所以我把那个类合成一个 `crosshair-measuring`（原来是 `crosshair-snap`），
由 `syncMeasuring()` 唯一挂/摘：

```js
classList.toggle("crosshair-measuring", !!(snapEl || dragging))
```

两个状态各写一半表现，迟早会不一致 —— 所以只留一个开关。

## 四、几个必须处理的坑

1. **拖过就不算点击**：浮窗是 `document` 上的委托监听（冒泡阶段）。
   在**捕获阶段**挂一个一次性的 `click` 拦掉它 —— 捕获先跑，
   `stopPropagation()` 之后冒泡整段不会发生。再挂一个 rAF 兜底摘掉，
   防止"松手在元素外、click 没来"时它一直挂着挡别的点击。
2. **拖框期间冻结悬停/吸边**：`applyHover()` 开头 `if (dragging) return`。
   不然鼠标一动就会重新判"底下是谁"，把框的目标抢走。
3. **拖框走同步落位**：`settle()` 的条件从 `if (locked)` 变成
   `if (locked || dragging)` —— 橡皮筋必须跟手，不能有缓动尾巴。
   顺带这也让 `settle()` 的语义更清楚了：**"仪器正在读一个跨度"就零缓动。**
4. **拖到窗口外要取消**：拿不到 `mouseup`，框会卡住。
   `mouseleave` 里 `endDrag(false)`（不复制）。
5. **浮窗开着时不抢**：`body.window-open` 时直接不开始拖框，
   否则弹窗里稍微拖一下就会把 click 吃掉。

## 五、顺手被自检抓住的一件事

新加的字符串里有三个新字：`已复制` 的 **复 / 制**，还有规格格式里的 **×**。
`check.js` 当场报：

```
✘ 页面文案的字全在子集里（363 个码位） → 复(U+590d) 制(U+5236) ×(U+d7)
  → 跑 node _dev/subset-font.js
```

按提示重裁 → 349 个码位、30.6 KB、四重校验全过。**P27 那条"忘了重裁字体"
的断言在这轮真的救了场** —— 否则这三个字会静默回退到系统字体，
在一条"仪器级"的读数上混出两种字形。

## 六、动了哪些文件

| 文件 | 改了什么 |
|---|---|
| `js/crosshair.js` | 新增框选量取：`DRAG_MIN` / `pressing` / `dragging` / `dragTo` / `beginDrag` / `endDrag` / `buildSpec` / `writeClipboard` / `suppressNextClick` / `flashCopied` / `syncMeasuring`；`settle()` 加拖框分支；`applyHover` 加拖框守卫；mousemove 接入拖框；mouseleave 取消 |
| `css/style.css` | `crosshair-snap` → `crosshair-measuring`（4 条规则）；新增 `.ruler-read-x::after` 的"已复制"回执 |
| `js/rulers.js` | 读数判据跟着改名 |
| `assets/fonts/HuXiaoBo-subset.woff2` | 重裁（349 码位 / 30.6 KB） |
| `_dev/check.js` | 更新 8 条 + 新增 `[2j]` 18 条（212 → **230** 项） |
| `CHANGES.md` | 本节 |

## 七、验证

- `node _dev/check.js`：**230 项全过**。
- 负向验证：去掉 `ev.stopPropagation()` → 断言如实报红；加回来 → 全过。
- 23 个 JS 语法全 OK；`subset-font.js --check` 通过。

## 八、留给你试的 / 我没做的

1. **手感**：`DRAG_MIN = 4px`。嫌太敏感就调大到 6~8（单击更容易通过），
   嫌拖不出来就调到 2。这是这个手势唯一的旋钮。
2. **回执位置**：现在"已复制"挂在**底尺读数**旁边（纯 CSS、不新增元素）。
   它的好处是拖框时你的视线本来就在读数上；坏处是它在屏幕边缘、
   离你松手的地方远。**想改成跟着光标的小提示，就要新增一个元素** ——
   这是我故意留着没做的一步，你说要我就加。
3. **没做**：`ESC` 中途取消框选（3 行的事，但会多一个键盘监听）；
   `B 方案`的多选作品（要先把浮窗打开）；按住 Shift 锁定正方形/边长的约束。
4. **和"主动量距"的关系**：这一版量的是"你随手拖的框"，已经比原来
   "只能量吸住的那个元素"进了一步。上一轮我建议的 `Alt + 拖`（对标 Figma）
   现在其实**已经等价于直接拖**了 —— 如果你想要"平时拖 = 页面上选东西、
   Alt + 拖 = 量取"，那就得反过来给拖框加修饰键，说一声。

---

# P41 拖框三条修正：起步不跳 / 框内淡红 / 回执跟着光标

## 一、起步那一"跳"是怎么来的（不是玄学）

你之前的判断"拖动开始时还是有点跳"是对的，而且原因很具体：

**平时跟鼠标用的是 `EASE = 0.10`，四条线一直在光标后面拖一截**
（那是刻意的顺滑拖尾）。拖框一开始如果直接 `snapToTargets()` 精确落位，
那一下就是把这段拖尾**一次性补上** —— 看起来就是"跳"。

所以拖框不该是"零缓动"，而是"一点点缓动"：

```js
const EASE_DRAG = 0.8;
const ease = dragging ? EASE_DRAG : (snapEl ? EASE_SNAP : EASE);
```

现在系数分三档，语义也清楚了：

| 状态 | 系数 | 为什么是这个 |
|---|---|---|
| **完全吸住**（locked） | 零缓动（`snapToTargets`） | 元素**自己**会动（滚动、改尺寸），必须同帧贴死 |
| **拖框** | `EASE_DRAG` = 0.8 | **手**在动，留一点点反而更顺；0.8 约 2 帧到位 |
| 吸附中（飞过去） | `EASE_SNAP` = 0.4 | 干脆地扑上去 |
| 平时跟鼠标 | `EASE` = 0.10 | 刻意的顺滑拖尾 |

> 一句话：**"零延迟"只对"目标自己在动"成立；手在动的时候，零延迟就是抖。**

`settle()` 也跟着简化回 `if (locked)`。

## 二、框内那层极淡的主题红

新增 `.crosshair-fill`（**这次确实新增了一个元素**，因为 1px 的线画不出面）：

- 和红带**同一种做法**：CSS 里写死 `100vw × 100vh`，
  JS 只写 `translate(x1, y1) scale((x2-x1)/100vw, (y2-y1)/100vh)`，
  `transform-origin: 0 0`。走合成器，不触发布局。
- 浓度 `--fill-alpha: 0.07`（"极低"），想更明显只改这一个数。
- `z-index: 9994` —— **在准星线（9995）之下**：它是底色，不该盖住那四条线。
- 显隐走新加的 `body.crosshair-dragging`（**只在拖框时**，吸住元素时不加，
  因为元素自己有视觉，再糊一层红是多余的）。
- **它是装饰，所以不参与"结构不对就整套不启用"的守卫**：
  `fillEl` 缺失时准星照样工作，代码里到处 `if (fillEl)`。

## 三、回执挪到圆形光标旁边

撤掉了读数旁边那个 `::after`"已复制"，改成**松手那一刻在光标位置生一句会淡出的字**：

- 位置用松手那一刻的 `clientX/clientY`（+12/+10 让开圆形指针那 10px），
  **生成之后就固定在那儿**，不跟着鼠标走 → 符合"固定在原位"。
- 淡出交给 CSS 动画（1s，**只动 opacity、不位移**）→ 符合"慢慢淡出"。
- `animationend` 时自己 `remove()` —— 和 `.click-ripple` 同一套，
  **不留定时器、不留常驻元素**。
- 文案按写入结果给：成功"已复制"、失败"复制失败"。
  为此 `writeClipboard()` 改成返回 `Promise<boolean>`（异步 API 被拒时
  退回 `execCommand`，那一刻还在 mouseup 的调用栈里、用户手势有效）。

## 四、★ 我的负向测试抓出了我自己的一个断言漏洞

按惯例，做完就做负向测试：把 `crosshair-dragging` 的 toggle 改成 `false`，
**结果断言全绿。**

也就是说我原来那三条"框内淡红"的断言（CSS 规则对不对、`--fill-alpha` 是不是极低、
JS 会不会写 transform）**全都证明不了"这个类真的会被挂上"**。
CSS 可以完美、JS 也可以写 transform，但只要没人挂类，它就是一片透明 ——
**静默失效**，正好是这个项目最怕的那种。

补了一条只盯"挂类"这一步的断言，再跑负向测试 → 如实报红。

> 教训：**"配置对了"和"配置生效了"是两件事**，
> 断言必须落在**最后那一步动作**上，而不是它前面的一串铺垫。
> 这跟 P29 那条"永远为绿的检查不是资产"是同一个方向的坑。

## 五、顺手修掉我自己的一个回归

这轮我一开始把 `EASE_DRAG = 0.8`、`--fill-alpha: 0.07`、`LOCK_EPS = 10`
都写成了**精确值断言**。这正是 P34 我自己总结过的错误：

> ★ **断言只能编码"会坏掉"的边界，不能编码"我觉得好看"的区间。**

而这三个恰恰是你最可能手调的数（你原话就是"比如小于10px"、"比如0.8"——
都是举例，不是规格）。已经全部改成不变式：

| 断言 | 从 | 改成 |
|---|---|---|
| `EASE_DRAG` | `=== 0.8` | `0.10 < v < 1`（比平时跟手、但不是零缓动） |
| `LOCK_EPS` | `=== 10` | `0 < v <= 50`（太大会看出落位、0 则永远锁不上） |
| `--fill-alpha` | `=== 0.07` | `0 < v <= 0.15`（确实是"极低"） |

## 六、动了哪些文件

| 文件 | 改了什么 |
|---|---|
| `js/crosshair.js` | 新增 `EASE_DRAG`；`step()` 三档系数；`settle()` 简化回 `if (locked)`；新增 `fillEl` 与 `apply()` 里的填色更新；`syncMeasuring()` 增加 `crosshair-dragging`；`flashCopied` 换成 `showToast`；`writeClipboard` 返回 Promise |
| `index.html` | 新增 `.crosshair-fill` 一个 div |
| `css/style.css` | 新增 `.crosshair-fill` + `body.crosshair-dragging` + `--fill-alpha` token；撤掉读数 `::after` 回执；新增 `.cursor-toast` + `@keyframes cursorToast` |
| `assets/fonts/HuXiaoBo-subset.woff2` | 重裁（351 码位 / 30.8 KB） |
| `_dev/check.js` | 更新 6 条 + 新增 12 条（230 → **242** 项） |
| `CHANGES.md` | 本节 |

## 七、验证

- `node _dev/check.js`：**242 项全过**。
- 负向验证两次：① 去掉 `ev.stopPropagation()` → 报红；
  ② 把 `crosshair-dragging` 的 toggle 改成 `false` → **一开始全绿**
  （就是这个暴露了断言漏洞），补断言后再测 → 报红。
- 又重裁了一次字体子集：新文案 "复制失败" 带来 **失 / 败** 两个字，
  自检当场报出来并按提示重裁（351 码位 / 30.8 KB / 四重校验全过）。
- 23 个 JS 语法全 OK。

## 八、三个旋钮

```
js/crosshair.js   const EASE_DRAG = 0.8;    // 拖框跟手程度（越小越"顺"、越大越"贴"）
js/crosshair.js   const LOCK_EPS  = 10;     // 吸到多近算"完全吸住"
css/style.css     --fill-alpha: 0.07;       // 框内那层红的浓度
```

三个都不再被断言钉死具体值，改完直接跑自检就知道有没有踩到"会坏掉"的边界。

---

# P42 框选改成"先框、再确认"：等确认 / 闪白 / 回执改词

## 〇、"复制页面截图"到底行不行 —— 结论：基本行不通

你要的是**真的那一块页面**的像素。三条路我都过了一遍：

| 路子 | 能不能拿到 | 代价 |
|---|---|---|
| DOM → canvas（html2canvas 那类） | **这站会渲染得一塌糊涂** | 整站视觉是 `mask-composite`、`mix-blend-mode`、多层渐变 mask、canvas 刻度尺、合成器层 `transform` 拼出来的 —— DOM 重放里这些全丢或失真。还要引一个几十 KB 的库，而项目是零依赖无构建 |
| SVG `foreignObject` | 同上，更糟 | 连外部样式表都不保证应用 |
| `getDisplayMedia` + 裁切 | **唯一能拿到真实渲染** | 必须弹"选择要共享的内容"权限框；屏幕/窗口共享时坐标系对不上（要 Chrome 独有 `CropTarget` 才能精确裁切），只有共享**标签页**时才能靠 `videoWidth / innerWidth` 反推缩放比 |

让访客为"省一次手动截图"点一次屏幕共享授权，这个信任成本我认为不划算。
**所以 payload 暂时还是文本规格** —— 但你要的那套交互和 payload 无关，已经做了。
真要接截图，见最后一节。

## 一、松手不再直接复制，先停在"等确认"

```
拖出框 → 松手 → 框留在原地 + 框中央出一行提示
                 · 左键单击 → 抓取 → 闪白 → 回执
                 · 右键 / Esc → 取消
                 · 再拖一次 → 换一个框（不用先取消）
```

- **为什么加这一步**：框选本身是个**有歧义**的手势（你到底想量什么、
  框到什么程度算够），而**剪贴板是有副作用的**。给一次反悔的机会比
  "松手就写剪贴板"稳妥得多。
- 提示文案是 `js/crosshair.js` 里的 `HINT_TEXT` 一个常量 ——
  **payload 换了它就要跟着换**，check.js 会盯着它存在。
- 提示摆在**框中心**，并且会**夹回视口内**（框贴着屏幕边时不然看不见）。
  这一次 `getBoundingClientRect` 只在松手那一刻发生，不在每帧路径里。
- 确认走**捕获阶段**的 click + `stopPropagation` —— 这一下不该顺便把作品浮窗点开。
- 右键**只在有框时**压掉右键菜单（平时右键菜单照旧，原来那个 contextmenu 监听是空的）。
- `Esc` 也能取消。没有它的话键盘用户会被卡在这个状态里出不来。
- **等确认期间滚动 = 取消**：框的坐标是视口坐标，一滚它就对不上底下的内容了，
  这时候让你确认"截取的就是框住的那块"是错的。
- 等确认时 `mousemove` **不许**把四条线拉回鼠标（否则框上那四条线会跑掉）——
  这条单独立了断言。

## 二、抓取那一刻"闪白"

框自己由红变白再消失，像闪光灯。

★★ **闪的必须是 `.crosshair-fill` 自己的 `opacity + background`，
不能在它里面套一层。** 父元素的 `opacity` 会**乘**到子元素上：
外层是 `--fill-alpha` = 0.07，套一层的话 0.07 × 0.9 ≈ 0.06 —— **等于没闪**。
（CSS 动画在层叠里高于普通声明，所以这一下会盖过
`body.crosshair-box .crosshair-fill` 的透明度，闪得出来。）

框先留着让闪白演完再收（420ms），不然会"闪到一半框先没了"。

## 三、回执改词：`已复制进剪贴板`

仍然是**松手/点击那一刻在光标旁边**生一句会淡出的字（P41 的做法不变）。

## 四、★★ 自检又抓到一个真陷阱：全角空格

我第一版提示文案里用了全角空格（`U+3000`）。自检当场报：

```
✘ 兜底的 unicode-range 没罩住"原字体根本没有"的字（15 个要避开）
  → 　(U+3000) 会白白拉 3.2MB
```

**P27 立的那条断言（兜底字体的 unicode-range 不许罩住原字体没有的字形）
在这轮真的救了场**，而且救的是一个**空格**：HuXiaoBo 原字体里没有 U+3000，
而它正好落在兜底字体 `unicode-range` 的第一段 `U+3000-30FF` 里 ——
于是为了一个空格，浏览器会把 3.2MB 原字体整个拉下来，然后发现还是没有。

两处都修了（**修实例，也修这一类**）：

1. 提示文案改用普通空格（子集里有）；
2. 兜底字体的 `unicode-range` 从 `U+3000-30FF` 收成 **`U+3001-30FF`** ——
   以后任何地方再用到全角空格，都不会触发那次下载。
   check.js 那边也加了一条断言：`HINT_TEXT` 里不许出现 U+3000。

## 五、动了哪些文件

| 文件 | 改了什么 |
|---|---|
| `js/crosshair.js` | 新增 `pending` 状态 / `HINT_TEXT` / `hintEl` / `showHint` / `hideHint` / `enterPending` / `dropBox` / `confirmBox` / `flashBox`；click / contextmenu / keydown 三个监听；`applyHover` 与 mousemove 加 pending 守卫；`crosshair-dragging` → `crosshair-box` |
| `index.html` | 新增 `.crosshair-hint` 一个 div |
| `css/style.css` | 新增 `.crosshair-hint` + `@keyframes crosshairFlash`；兜底 `unicode-range` 收成 `U+3001-30FF`；类名改名 |
| `assets/fonts/HuXiaoBo-subset.woff2` | 重裁（362 码位 / 32.1 KB） |
| `_dev/check.js` | 更新 9 条 + 新增 13 条（242 → **255** 项） |
| `CHANGES.md` | 本节 |

## 六、验证

- `node _dev/check.js`：**255 项全过**。
- 负向验证：把等确认时的 mousemove 守卫去掉（`!pending`）→ 断言如实报红；
  加回来 → 全过。
- 又重裁了一次字体子集（提示文案 + "已复制进剪贴板" 带来 13 个新字，
  362 码位 / 32.1 KB / 四重校验全过）。
- 23 个 JS 语法全 OK。

## 七、留给你确认 / 决定的

1. **交互先试**：拖框 → 松手（框留着 + 中间出提示）→ 左键（闪白 + "已复制进剪贴板"）；
   右键 / Esc 取消；等确认时再拖一次会换框。
2. **提示文案**：现在是"左键复制该区域规格 · 右键取消"，写的是**规格**不是**图片** ——
   因为 payload 还没换成图片，写"截取图片"就是骗人。换成图片后这行字我会一起改。
3. **要不要接真·截图**：技术上可行（`getDisplayMedia` + 标签页共享 + 按
   `videoWidth / innerWidth` 反推缩放裁切），代价是每次抓取都会弹一次
   "选择要共享的内容"权限框，而且必须共享**当前标签页**才裁得准
   （屏幕/窗口共享在 Chrome 外没有 `CropTarget`，坐标对不上）。
   要做的话建议：**只在支持且用户点过"截取"时走这条路，失败/拒绝就退回文本规格**。
   你说要我再动。

---

# P43 修"松手即确认"：一个定义了却从没被调用的函数

## 一、现象与根因

你报的：拖框 → 松手（提示出来了）→ **立刻**闪白 + "已复制进剪贴板"，没等确认。

根因是 **P40 埋下的一个洞**：`mouseup` 之后浏览器**还会派发一个 `click`**，
它属于"结束拖框"这个手势本身，不是"我要确认"。而我在 P40 写过一个
`suppressNextClick()` 专门吞它 —— **却从来没有调用过它。**

```js
function suppressNextClick() { ... }     // ← 定义了
// 全文件只有两处出现它：这一行定义，和一句提到它名字的注释
```

于是这个 click 一直畅通无阻：
- **P40/P41 时**：松手会顺手触发那个 click → 本该打开作品浮窗。
  但浮窗是关的（`ENABLED = false`），**所以肉眼看不出任何异常**。
- **P42 加了确认处理器之后**：同一个 click 直接命中 `confirmBox()`
  → 表现成"松手就闪白、根本没等你点"。

**一个死了两轮的函数，被第三个功能踩响。**

## 二、修法：判据放进**同一个处理器**，而不是再挂一个监听

```js
let swallowClick = false;                    // 松手后那一下 click 要吞

function enterPending() { ...; swallowClick = true; ... }

document.addEventListener("click", (e) => {
    if (swallowClick) {                      // ← 吞和确认在同一段代码里
        swallowClick = false;
        e.preventDefault();
        e.stopPropagation();
        return;
    }
    if (!pending || dragging) return;
    ...
    confirmBox();
}, true);
```

**为什么不照原样再挂一个捕获监听**：两个都是 `document` 上的 capture 监听，
执行顺序按**注册先后** —— `suppressNextClick` 是松手时才注册的，
永远排在模块初始化时注册的确认监听**后面**。
就算我把它调用起来，确认也已经先跑完了。所以判据必须和确认**同一处**。

**标志位什么时候清**：在 `mousedown` 里清。万一下一次 click 根本没来
（松手在元素外），标志位会挂在那儿把**下一次**点击吞掉 —— 清掉它，
它就只活一个手势的寿命。

## 三、★★ 顺手加了一条通用 lint：定义了却从没被调用的函数

这次的洞不是逻辑错，是**"看着接上了、其实没接"**。这类东西人工 review
最容易漏（它有函数名、有注释、甚至有一条断言"证明"它存在）。
所以加了一条机器检查：

```js
// 扫出所有 function 声明，引用次数 ≤ 1（只有定义那一处）= 没人调
```

**它立刻先教了我一课**：第一版没排除**具名 IIFE** ——
`(function cursorDot(){})()`，它天生自己调用自己、名字只出现一次，
被误报成"没人调"。判据改成"定义前面那个字符是不是 `(`"之后对了
（现在扫 27 个函数，全部有人调）。

> 这条 lint 和 P41 那条"挂了才看得见"是同一个方向：
> **断言必须落在"最后那一步动作"上**。P41 是"类挂了没有"，
> 这次是"函数调了没有"。

## 四、动了哪些文件

| 文件 | 改了什么 |
|---|---|
| `js/crosshair.js` | 删掉从没被调用的 `suppressNextClick()`；新增 `swallowClick` 标志；`enterPending()` 里置上；确认处理器的**开头**消费它；`mousedown` 里清掉 |
| `_dev/check.js` | 3 条旧断言（断言"函数存在"）换成 4 条新断言（断言**链路**）+ 新增通用"没人调"lint（255 → **258** 项） |
| `CHANGES.md` | 本节 |

## 五、验证

- `node _dev/check.js`：**258 项全过**。
- 负向验证：把 `enterPending()` 里的 `swallowClick = true;` 注释掉 →
  "松手那一下的 click 被吞掉"如实报红；取消注释 → 全过。
- 23 个 JS 语法全 OK；`subset-font.js --check` 通过（这轮没有新文案）。

## 六、留给你确认的

**完整流程现在应该是**（麻烦实测）：

1. 按住左键拖 → 框跟着走（读数实时显示宽高）
2. 松手 → 框**留着**、中间出提示、四条线**钉住不动** ← 这一步不再闪
3. **左键单击** → 闪白一下 + 光标旁"已复制进剪贴板"
4. 右键 / Esc → 取消；等确认时再拖一次 → 换一个框

另外：P40/P41 那两轮里，**拖框松手其实会顺手打开作品浮窗**
（只是浮窗关着所以没暴露）—— 这次一并修好了。
如果以后你把浮窗的 `ENABLED` 改成 `true`，这条已经不会出问题了。

---

# P44 框选：点框内才复制 / 3 秒时限 / 取消后回到原来的悬停

## 一、点框内 = 复制，点框外 = 取消

判据：

```js
const inside = e.clientX >= tx1 && e.clientX <= tx2 &&
               e.clientY >= ty1 && e.clientY <= ty2;
if (inside) confirmBox(); else dropBox();
```

用**目标位置**（`tx1..ty2`）而不是收敛中的当前值判"框内"：
框刚画完可能还在最后几像素上，用目标位置更稳、也更符合
"你看到的那四条线在哪"。

右键 / Esc 取消照旧（它们不区分框内框外）。

## 二、3 秒时限：到点自动取消

```js
const BOX_TTL = 3000;
function armBoxTimer() {
    endBoxTimer();
    if (REDUCE_MOTION) return;                  // ★ 见下
    boxTimer = setTimeout(dropBox, BOX_TTL);
}
```

三个决定值得说：

### 2.1 ★ 降低动效下**不设**这个时限

`prefers-reduced-motion` 那条偏好里有一条隐含的意思：**别催我**。
拿一个 3 秒的倒计时去催一个主动要求减少动效的人，正好是反的。
所以那个偏好下框会一直等着，手动取消（框外点击 / 右键 / Esc）照旧有效。

### 2.2 ★ 时限必须**看得见**，否则框会"无缘无故消失"

提示下面加了一条倒计时细线（`.crosshair-hint::after`），按时限从左缩到右。
**时长走 `--box-ttl`，由 JS 从 `BOX_TTL` 写进去** ——
一个常量同时决定"多久自动取消"和"这条线多长"，不可能各自漂移
（和 timeline.js 把 `--t-*` 写进 CSS 是同一个套路）。

降低动效下这条线**不出现** —— 留着一条不动的线等于在说"有时间限制"，是错的。

### 2.3 ★★ 倒计时线**只做指示，不能驱动取消**

差一点就写成 `animationend` → 取消了（那样时长就只有 CSS 一处，很诱人）。
但降低动效块里那条 `* { animation-duration: .01ms !important }`
会让倒计时**瞬间跑完** → 框瞬间消失。
所以：**取消永远走 JS 的 `setTimeout`，CSS 动画只负责画那条线。**
check.js 有一条断言专门禁止"从 hintCountdown 走到 dropBox"。

时限在**取消 / 确认 / 重新拖框**三处都要清掉 ——
不然它会在后面某一刻突然把框收掉（尤其"重新拖框"那次：
旧时限会在新拖框途中触发，直接把新框干掉）。

## 三、取消后回到"拖框之前吸着的那个元素"

```js
if (!pending) prevSnapEl = snapEl;      // 只在"新起一个框"时记
...
const back = (prevSnapEl && prevSnapEl.isConnected) ? prevSnapEl : null;
setSnap(back);                          // 重新 anchor，按 EASE_SNAP 飞回去
```

两个细节：

- **`if (!pending)` 这个条件不能省**：等确认时再拖一次属于"换一个框"，
  那时 `snapEl` 已经是 `null` 了 —— 不加条件就会把"本来吸着谁"覆盖成 null，
  取消之后就回不去了。
- **`isConnected` 守卫**：如果那个元素已经被移除（比如浮窗开关切换过 DOM），
  就别往回吸，直接回到鼠标。
- 回去的时候 `setSnap` 会**重新量一次 rect**（`anchor`）——
  这段时间里它可能被滚走或被 resize 改过。
- **确认之后也走同一条路**（`confirmBox` 最后调 `dropBox`）——
  复制完同样回到原来的悬停状态，不该因为量了一次尺寸就把浏览状态弄丢。

## 四、动了哪些文件

| 文件 | 改了什么 |
|---|---|
| `js/crosshair.js` | 新增 `BOX_TTL` / `REDUCE_MOTION` / `prevSnapEl` / `boxTimer` / `armBoxTimer` / `endBoxTimer`；`enterPending` 装时限；`dropBox` 清时限 + 回原状态；`beginDrag` 记 `prevSnapEl` + 清旧时限；click 处理器判框内/框外；`HINT_TEXT` 改词；把 `--box-ttl` 写进 CSS |
| `css/style.css` | `.crosshair-hint::after` 倒计时线 + `@keyframes hintCountdown`；降低动效下不显示它 |
| `assets/fonts/HuXiaoBo-subset.woff2` | 重裁（358 码位 / 31.5 KB） |
| `_dev/check.js` | 更新 3 条 + 新增 13 条（258 → **268** 项） |
| `CHANGES.md` | 本节 |

## 五、验证

- `node _dev/check.js`：**268 项全过**。
- 负向验证：把 `dropBox()` 里的 `setSnap(back)` 改成 `setSnap(null)` →
  "取消后回到拖框之前吸着的那个元素"如实报红；改回来 → 全过。
- 又重裁了一次字体子集（新提示文案带来 3 个字，358 码位 / 31.5 KB / 四重校验全过）。
- 23 个 JS 语法全 OK。

## 六、留给你确认的

1. **完整流程**：拖框 → 松手（框留着 + 提示 + 下面一条倒计时线）
   → **点框内**（闪白 + "已复制进剪贴板"）/**点框外**（直接收起，无回执）
   /右键/Esc/3 秒到点 → 都收起。
2. **取消后**：如果拖框之前正吸着一个面板，四条线应该**飞回那个面板的四边**；
   否则回到鼠标处。
3. **降低动效下没有 3 秒时限**（也看不到那条倒计时线）—— 这是我加的判断，
   严格说超出了你的原话。不同意就说一声，去掉那两行即可。
4. 提示文案现在是"点击框内复制 · 框外取消"。payload 换成图片后要一起改。
5. `BOX_TTL = 3000` 是唯一的时限旋钮（CSS 那条线跟着它走，不用分开改）。

---

# P45 修两个框选 bug：滚动中框不出来 / 取消后状态卡在旧元素

## 一、滚动中"根本框不出来"

### 根因

不是不能开始拖，是**刚框好就被收掉**：

```
按住拖 → 松手 → enterPending()（框留下）
                   ↓
        惯性滚动的下一个 scroll 事件 → `if (pending) dropBox();`
                   ↓
              框当场消失
```

惯性滚动会连续发很多 scroll 事件，于是**整个滚动过程中怎么框都留不住**，
表现出来就是"滚动结束前无法再次框选"。

### 修法：滚动中**拒绝**画框 + 明确回执

```js
const SCROLL_SETTLE = 150;      // 这么久没有 scroll 事件才算"页面静止"
...
document.addEventListener("scroll", () => {
    scrolling = true;
    clearTimeout(scrollSettleTimer);
    scrollSettleTimer = setTimeout(() => { scrolling = false; }, SCROLL_SETTLE);
    ...
});
```

拖框那边：

```js
if (scrolling) {
    if (!refusedDrag) { refusedDrag = true; showToast("请等待页面静止…", e.clientX, e.clientY); }
    return;                     // ★ pressing 保持 true
}
beginDrag();
```

三个决定：

- **回执给在"越过位移阈值"那一刻**，不在 mousedown。不然一次普通点击
  也会弹提示（而你只是想点一下作品）。
- **拒绝时保持 `pressing`**：滚动一停（150ms 内没有新 scroll）这一拖就接上，
  不用松手重按。`refusedDrag` 只让**这一次按住**提示一次，不刷屏。
- **保留"滚轮取消框"**：那是你要的（框是视口坐标，一滚就对不上内容）。
  两件事配合起来才是完整的：**要画框就等页面静止；已经画好了，一滚就取消。**

`SCROLL_SETTLE = 150` 是唯一旋钮。理论上还有个小缝：恰好在惯性最后一刻
开始拖（`scrolling` 刚翻 false、又来了一个残留事件）—— 概率很低，
真遇到了把 150 调大即可。

## 二、取消后准星/悬停卡在上一个元素

### 根因

P44 我做的是"取消后**回到拖框之前吸着的那个元素**"（`prevSnapEl`）。
但你是**点框外来取消**的 —— 这时鼠标已经在新位置了：
可能还在同一个元素上、可能移到别的可交互元素上、也可能在空地上。
"回到上一个"于是显得呆板：**准星和 `.is-hot` 悬停态一起卡在旧元素上**。

### 修法：取消后**重新判一次"光标底下现在是谁"**

```js
function refreezeHover() {
    const el = pointerSeen ? document.elementFromPoint(mx, my) : null;
    applyHover(el instanceof Element ? el : null);     // 变色 + 吸边 + is-hot 一起跟着走
}
```

**这比"更新一下坐标"更彻底，而且顺带把 `prevSnapEl` 整套删掉了** ——
重新命中测试在三种情况下都更对：

| 取消时鼠标在哪 | `prevSnapEl`（旧） | 命中测试（新） |
|---|---|---|
| 还在原来那个元素上 | 回到它 ✓ | 回到它 ✓ 一样 |
| 移到**别的**可交互元素上 | 回到旧的 ✗ | 吸到新的 ✓ |
| 移到空地上 | 回到旧的 ✗ 呆板 | 松开、回到鼠标 ✓ |

- **必须同步做**，不能等 `recheckUnderCursor` 那个 rAF ——
  否则这一帧四条线还挂在旧的吸附位置上。
- 顺序不能反：**先 `syncMeasuring()` 再 `refreezeHover()`**。
  如果此刻本来就没吸着元素，`applyHover` 里那条 `setSnap(null)`
  会提前 return，`crosshair-box` 就摘不掉了。
- `is-hot`（面板悬停）也由 `applyHover` 一起重判 ✓ 你提的第二半（悬停态
  也卡住）就在这一条里解决了。

## 三、动了哪些文件

| 文件 | 改了什么 |
|---|---|
| `js/crosshair.js` | 新增 `SCROLL_SETTLE` / `scrolling` / `scrollSettleTimer` / `refusedDrag` / `refreezeHover()`；scroll 里维护"页面是否静止"；mousemove 里滚动时拒绝画框 + 回执；`dropBox` 改成命中测试重判；**删掉 `prevSnapEl` 整套** |
| `assets/fonts/HuXiaoBo-subset.woff2` | 重裁（362 码位 / 32.1 KB） |
| `_dev/check.js` | 更新 4 条 + 新增 8 条（268 → **273** 项） |
| `CHANGES.md` | 本节 |

## 四、验证

- `node _dev/check.js`：**273 项全过**。
- 负向验证：把 `dropBox()` 里的 `refreezeHover()` 删掉 →
  3 条断言同时报红，其中一条是 **P43 加的那条通用 lint**：

  ```
  ✘ ★ 没有"定义了却从没调用"的函数（扫了 30 个）→ 没人调: refreezeHover
  ```

  **那条 lint 第二次自己抓住了我** —— 它当初就是为"定义了却没接上"写的，
  这次我写完 `refreezeHover` 忘了调用，它当场喊出来。
- 又重裁了一次字体子集（"请等待页面静止…"带来 4 个字，362 码位 / 32.1 KB）。
- 23 个 JS 语法全 OK。

## 五、留给你确认的

1. **滚动中拖**：应该弹一句"请等待页面静止…"，框不出现；
   **按住不放**、等页面停住，这一拖会自动接上。
2. **滚动中已有框**：仍然直接取消（这条没改）。
3. **点框外取消**：准星、悬停变色、（面板的）底图揭示应该**一起跟到鼠标现在的位置**，
   而不是留在上一个元素上。
4. `SCROLL_SETTLE = 150` 是"页面算不算静止"的旋钮。

---

# P46 修四个框选 bug

四个都找到了确切的代码原因，不是调参。

## 一、滚动中按住鼠标 → 准星卡在原地

**根因就是我上一轮自己写的那句 `return`。** 滚动时拒绝画框的分支：

```js
if (scrolling) { refusedDrag = true; showToast(...); return; }   // ← 这个 return
...
if (!snapEl && !dragging && !pending) targetFromMouse();          // ← 被它跳过了
settle();
```

`return` 一跳，**下面那句"跟着鼠标走"就不会执行** —— 于是按住不放时准星不动，
直到页面停下（`scrolling` 翻 false）才突然 `beginDrag()` 开始画框。
现象完全对得上。

**修法：不 return。** 改成"标记本次按下作废 + 照常往下走"：

```js
if (scrolling) {
    refusedDrag = true;                       // 本次按下就此作废
    showToast("请等待页面静止…", e.clientX, e.clientY);
} else {
    beginDrag();
}
```

- `refusedDrag` 进了"开始画框"的条件（`!dragging && !refusedDrag && …`），
  所以**后面再怎么移动也不会突然开始画框** —— 这才是"忽略本次按下"。
- 但代码继续往下走到跟随更新，**准星照常跟鼠标**。
- 想画框：松手 → 等页面静止 → 重新按。`refusedDrag` 在 `mousedown` 复位。

## 二、取消/复制之后没动过鼠标 → 准星停在框选的位置

**根因**：`dropBox()` → `refreezeHover()` → `applyHover(null)` → `setSnap(null)`，
而 `setSnap` 在**本来就没吸着元素**时会**提前 return**：

```js
function setSnap(el) {
    if (el === snapEl) return;      // ← 此刻 snapEl 已经是 null，直接返回
    ...
    targetFromMouse();              // ← 永远走不到
}
```

于是四条线的目标**一直停在框的四边**。只要期间没动过鼠标，
就没有别的代码去纠正它 —— 表现就是"取消了，准星却还留在框选的位置"。
（复制那一路同样中招，因为 `confirmBox` 最后也走 `dropBox`。）

**修法**：`refreezeHover()` 末尾补一句：

```js
if (!snapEl) targetFromMouse();     // 没吸着任何东西 → 必须回到鼠标
```

## 三、闪白的那一下中间还压着提示和进度条

**修法**：`confirmBox()` 里把 `hideHint()` 提到 `flashBox()` **之前**。

原来 `hideHint()` 在 `dropBox()` 里，而 `dropBox` 是闪完 420ms 才调的 ——
所以闪的时候提示和倒计时线还在框中央，看起来不像"闪了一下框"。

## 四、拖得快时"红框已经定形、准星还在跟鼠标"

**根因是两件事叠在一起**，都在松手那一瞬间：

| | 松手前 | 松手后 |
|---|---|---|
| 四条线 | 靠 `EASE_DRAG`(0.8) 追目标，可能还差几像素 | 系数掉回 `EASE`(0.10) → 这几像素要走半秒 |
| 红框 | `apply()` 里以 `dragging` 为条件更新 | 条件不成立 → **当场定形不动** |

一个停了、一个还在慢慢爬 —— 就是你看到的那个错位。

**修法**（两处，缺一不可）：

```js
function enterPending() {
    dragging = false;
    pending = true;
    ...
    snapToTargets();        // ★ 松手立刻钉死，两边都用最终目标，一次对齐
    ...
}
```
```js
if ((dragging || pending) && fillEl) { ... }   // ★ 红框的条件要带上 pending
```

只钉死不带上 `pending` 也不行：红框不会跟着这次钉死后的 apply 更新。
只带 `pending` 不钉死也不行：四条线仍会被 EASE 拖半秒。

## 五、动了哪些文件

| 文件 | 改了什么 |
|---|---|
| `js/crosshair.js` | 拒绝分支不再 `return` + `!refusedDrag` 进条件；`refreezeHover()` 补"没吸着就回鼠标"；`confirmBox()` 先 `hideHint()` 再 `flashBox()`；`enterPending()` 里 `snapToTargets()`；红框更新条件加上 `pending` |
| `_dev/check.js` | 更新 3 条 + 新增 6 条（273 → **278** 项） |
| `CHANGES.md` | 本节 |

## 六、验证

- `node _dev/check.js`：**278 项全过**。
- 负向验证：把 `refreezeHover()` 里那句 `if (!snapEl) targetFromMouse();`
  注释掉 → "重判之后没吸着就必须回到鼠标"如实报红；改回来 → 全过。
- 写断言时踩了个小坑并修掉了：那句"拒绝时不许 return"的负向断言，
  原本用 `[\s\S]{0,400}?return` 往后再扫，会撞上后面
  `if (dragging) { … return; }` 那个**合法**的 return 而误报。
  改成只看 `if (scrolling) { … }` 这对花括号**里面**（`[^}]*`）。
- 23 个 JS 语法全 OK；`subset-font.js --check` 通过（这轮没有新文案）。

## 七、留给你确认的

1. **滚动中按住拖**：应该立刻弹"请等待页面静止…"，**准星照常跟鼠标**，
   而且这一按不会再突然开始画框（松手重按才行）。
2. **框选后不动鼠标**（直接点框外取消 / 点框内复制）：准星应该回到鼠标处
   （如果鼠标底下正好是可交互元素，就吸到它）。
3. **闪白那一下**：框中央应该已经没有提示和进度条了。
4. **快速拖完立刻松手**：四条线应该**当场**贴到框上，不再有"红框定了、准星还在爬"。




# P47 截图功能（文本规格一并保留）

按你说的"先保留当前功能"做的。**"保留"我理解成"两个都给"**：
确认之后剪贴板里同时有 `text/plain`（那行规格）和 `image/png`（那块像素）——
粘进文本编辑器拿到规格，粘进 Figma / 微信 / 图片工具拿到图片。
哪一步失败就退回只写文字，**规格这条路一次都没断过**。

## 一、先说我否决了什么，以及为什么

| 方案 | 结论 | 原因 |
|---|---|---|
| `html2canvas` 那类 DOM→canvas | **否决** | 这站的视觉是 `mask-composite`、`mix-blend-mode`、多层渐变 mask、canvas 尺子、合成器层 `transform` 拼出来的。DOM 重放里这些**全部丢失或失真** —— 截出来的不是这个页面 |
| SVG `foreignObject` + `drawImage` | **否决** | 比上面更糟：外部资源（字体/图片）默认不进快照，且 taint canvas |
| `getDisplayMedia` 抓标签页 + 自己裁 | **采用** | 唯一能拿到"真的那一块像素"的路 |

## 二、每次截取都会弹一次权限框 —— 这是绕不过去的

```js
const CAPTURE_CONSTRAINTS = {
    video: { displaySurface: "browser" },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    monitorTypeSurfaces: "exclude",
    surfaceSwitching: "exclude",
};
stream = await requestCaptureStream();
```

**这一节里有一条是"不写就整个功能不可用"的，我差点漏掉：**

> Chrome 从 **108** 起把 `selfBrowserSurface` 的默认值改成了 `"exclude"` ——
> 也就是说**"当前标签页"根本不在选择列表里**。

只写 `preferCurrentTab: true` 是不够的（那只是"如果当前标签页在列表里，就把它
放在最显眼的位置"）。必须显式 `selfBrowserSurface: "include"`。
漏了它的表现是：权限框里**没有"当前标签页"这个选项**，
用户只好去选窗口或屏幕，然后被下面的比例自检拒掉 ——
整个功能看起来"就是不能用"，而代码本身毫无报错。
（依据：[Chrome 108 起 selfBrowserSurface 默认改为 exclude](https://developer.chrome.com/blog/media-picker-reorder)、
[MDN: getDisplayMedia 的 selfBrowserSurface / preferCurrentTab](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)。）

其余三条的含义：

- `monitorTypeSurfaces: "exclude"` —— 把**整个屏幕**从列表里去掉。
  这是"消灭最大的一类误选"，而不是等用户选完了再靠自检去拒：
  我们这个功能本来也只处理得了标签页，给一个注定失败的选项是坏交互。
- `surfaceSwitching: "exclude"` —— 一次性抓取，不需要
  "共享期间切换到别的标签页"那个控件。
- `displaySurface: "browser"` —— 仍然只要 `browser`，**不写 `monitor`**：
  `monitorTypeSurfaces: "exclude"` 和 `displaySurface: "monitor"`
  是明确互斥的，同时出现会抛 `TypeError`。

**为什么要包一层 `requestCaptureStream()`：** 约束集**不被支持**时的失败方式是
**静默的** —— `catch` 到就 `return null`，功能悄悄退成"纯文字规格"，
用户永远不会知道为什么没有图。所以：

```js
catch (err) {
    if (!err || err.name !== "TypeError") throw err;   // ★ 只对"约束不认"重试
    return await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false,
        preferCurrentTab: true, selfBrowserSurface: "include" });
}
```

- **只对 `TypeError` 重试一次**：`TypeError` = "你给的约束我不认"。
- **`NotAllowedError` 绝不能重试** —— 那是"用户点了取消"，
  重试等于**再弹一次权限框**，是最讨厌的那种 bug。

其它几条行为约束：

- `preferCurrentTab` / `selfBrowserSurface` 都只是**提示**，不是强制。
  用户仍然可以选"某个窗口"（屏幕已经被上面那条去掉了）。
- **必须共享当前标签页**：标签页捕获的画面就是视口，
  `videoWidth / innerWidth` 正好是设备缩放比；窗口共享带着浏览器边框，
  两个方向的比值不相等，坐标系整体对不上。
  所以有一道自检（下面第四节）。用户选错时**宁可放弃截图**，
  也不能给一张坐标偏移的错图 —— 错图比失败更坏：它看上去是对的。
- **取流必须是 `captureImage()` 里第一个 `await`**：
  它要 transient activation，而那份激活来自"确认"那一下点击。
  我把它写成第一个 `await` 并列进了自检
  （顺序一改，功能就是坏的，但代码看着仍然很合理）。
- 抓完立刻 `stream.getTracks().forEach(t => t.stop())` ——
  不停掉，"正在共享"那条提示会一直挂在页面上，像还在采集。

## 三、采帧前"清场"：用 `visibility`，不用 `opacity`/`display`

```js
await video.play();
await waitVideoReady(video);        // ★ 先等"真的有画面"
document.body.classList.add("capture-hide");
await waitVideoFrames(video, 2);    // ★ 藏完再等 2 个**新到的**帧
document.body.classList.remove("capture-hide");
```

**这三行的顺序每一行都有理由，写反了都不会报错：**

1. **先等"有画面"再藏仪器。** `MediaStream` 挂上 `<video>` 之后首帧不是立刻到的，
   这中间 `videoWidth` 是 **0**。不等它就有两个后果：
   - `scaleX = 0` → 被下面的比例自检判成"选错了共享对象" → `return null`，
     于是**第一次截取永远是"未能截图"、第二次才成功**。
     这种"重来一次就好"的 bug 最难查 —— 用户不会来报，他会以为自己手抖了。
   - 就算侥幸过了比例自检，`drawImage` 从一个 0 尺寸的源上也什么都画不出来。

   用 `loadedmetadata`（`MediaStream` 上"首帧尺寸已知"就是它），不轮询；
   带 1.5s 兜底，事件不来也不会挂住。

2. **顺序反了就白等。** 先 `capture-hide` 再等画面，等于在一个 0×0 的视频上
   等 2 帧 —— 等到的是"还没开始"。

3. **`requestVideoFrameCallback` 不能单独用**（这是我写完第一版之后补的）：

```js
const byTimer = new Promise((r) => setTimeout(r, FRAME_WAIT_MS));
if (typeof video.requestVideoFrameCallback !== "function") return byTimer;
...
return Promise.race([byFrames, byTimer]);
```

我们的 `<video>` 是**游离在文档外**的（不塞进 DOM 是为了零副作用：不占布局、
不会被截进图里）。rVFC 只在"新帧提交"时回调 —— 万一某个浏览器对这种视频
不派发 rVFC，单独等它就是一个**永远不 resolve 的 Promise**：
表现是"点了确认之后毫无反应"，而且**没有任何报错**。
`race` 一个 400ms 的定时器就解决了：rVFC 正常时它赢（精确），
不正常时定时器赢（有界，不挂死）。400ms 比 2 帧间隔（约 33ms）宽得多，
正常路径永远先赢，用户感觉不出来。

**为什么用 `visibility`：**

- **`opacity` 有过渡** → 采样可能正落在半透明的中间态，截出来带着准星的鬼影。
- **`display: none` 会重排** → 采样那一帧可能正在重排，截出来是错位的。
- `visibility` 两个毛病都没有：瞬时、不动布局。
- 藏起来的是**仪器**：四条准星线、圆形指针、红框、提示、四个三角、
  两条红带、两个读数、两把尺子、参考线层。**内容一个像素都不动**。
- ★ 一个我替你做的判断：**两把刻度尺也一起藏了**。它们是常驻画面的一部分，
  但截出来当交付物时，左下角压着一个刻度尺通常是噪声。
  想留的话，删掉 `style.css` 里 `body.capture-hide #ruler-bottom,` 和
  `body.capture-hide #ruler-left,` 这两行就行（一行一个，互不影响）。

## 四、裁切数学 + 那道挡"选错共享对象"的闸

```js
const scaleX = video.videoWidth  / window.innerWidth;
const scaleY = video.videoHeight / window.innerHeight;
if (!(scaleX > 0) || !(scaleY > 0) ||
    Math.abs(scaleX - scaleY) / Math.max(scaleX, scaleY) > 0.02) {
    return null;                 // 多半选成了窗口/整个屏幕
}
```

- 用**两个方向的比值**而不是只算一个：只算 `scaleX` 的话，
  选成窗口共享（比如 1920×1080 的窗口 vs 1512×945 的视口）会得到
  一个"看起来合理"的缩放比，然后**安静地**截出一张错图。
- 源矩形 = 框 × 缩放比；目标 = **整块画布**（不是从视口原点切）。
  `Math.max(1, …)` 是防 0 宽/0 高 —— 拖出一个 1px 的框时
  `canvas.width = 0` 会让 `toBlob` 直接返回 `null`。

## 五、"保留当前功能" = 写两个类型，不是二选一

```js
const item = new ClipboardItem({ "text/plain": asText(), "image/png": imageBlob });
return navigator.clipboard.write([item])
    .then(() => true, () => writeClipboard(text, null));   // 图写不进去就只写文字
```

- 递归那一句是关键：**图写失败要退回只写文字**。
  否则一个不给写 `image/png` 的浏览器会把文字也一起丢掉 ——
  那就变成"新功能把旧功能挤掉了"，正好违背你说的"先保留当前功能"。
- 回执按结果分三种，都说实话：

| 情况 | 回执 |
|---|---|
| 图 + 文字都写进去了 | `已复制规格和截图` |
| 只写进文字（没截到 / 被拒 / 比例不对） | `已复制规格（未能截图）` |
| 剪贴板写失败 | `复制失败` |

- 框中央那行提示也跟着能力走：能截图时写 `点击框内截取 · 框外取消`，
  没有 `getDisplayMedia`/`ClipboardItem` 时写 `点击框内复制 · 框外取消`。
  写死"截取"而浏览器做不到，就是骗人。

## 六、矩形必须在弹权限框**之前**定死

```js
const spec = buildSpec();
const box = { left: Math.round(Math.min(x1, x2)), top: Math.round(Math.min(y1, y2)),
              w: Math.round(Math.abs(x2 - x1)), h: Math.round(Math.abs(y2 - y1)) };
captureImage(box).then((blob) => writeClipboard(spec, blob).then(…));
```

- 点下去之后马上弹"选择要共享的内容"，那期间框会被收掉、鼠标也会跑。
  等截图回来再读 `x1/x2`，拿到的**已经不是这个框了**。
- `box` 和 `buildSpec()` 用**同一组** `x1/x2/y1/y2`：
  规格上写的数字和裁出来的像素必须是同一个矩形，不然对不上账。

## 七、动了哪些文件

| 文件 | 改了什么 |
|---|---|
| `js/crosshair.js` | 新增 `CAN_SCREENSHOT` / `CAPTURE_CONSTRAINTS` / `requestCaptureStream()` / `waitVideoReady()` / `waitVideoFrames()` / `captureImage()`；`writeClipboard` 改成写两个类型；`HINT_TEXT` 按能力分支；`confirmBox()` 先取 `spec` + 定死 `box` 再截图 |
| `css/style.css` | 新增 `.capture-hide` 清场规则，`visibility: hidden` |
| `_dev/check.js` | 更新 3 条 + 新增 21 条（278 → **299** 项） |
| `_dev/glyph-manifest.json`、`assets/fonts/HuXiaoBo-subset.woff2` | 重跑子集（362 → **363** 个码位，32.1 → 32.3 KB；新字：截 / 规 / 和） |
| `CHANGES.md` | 本节 |

## 八、验证

- `node _dev/check.js`：**299 项全过**。
- 25 个 JS 文件 `node --check` 全过；编码审计（无 BOM / 行尾统一 / 页面文案无 U+3000）全过。
- `node _dev/subset-font.js --check`：`当前文案全部在子集里（377 个码位，manifest 记了 363 个）`。
- 写断言时又踩了 `codeOnly()` 那个老坑（**第 7 次**）：
  我照着源码里的注释写 `\/\*[\s\S]{0,200}?\*\/` 去匹配
  "取流是函数第一个 await"之间的那段注释 —— 而 `codeOnly` 把注释
  换成了一个空格，永远匹配不上。断言当场报红，两分钟就修好了；
  这也说明这条断言本身是有效的（不是恒真）。
- **这一轮抓到两个"没有浏览器就看不出来"的坑，都不是靠自检抓到的：**
  1. `selfBrowserSurface` 的默认值（查 Chrome 更新记录抓到）。
     原本只写 `preferCurrentTab: true`，看着完全合理、断言也不会报错，
     但实际用起来**权限框里根本没有"当前标签页"这个选项**。
  2. 采帧前没等 `videoWidth > 0` 和 rVFC 没有兜底（重读自己的代码抓到）。
     前者会让**第一次截取必然失败、第二次才成功**；
     后者会让"点了确认毫无反应"且不报错。
  记在这里，因为这类 bug 的共同点是：**代码看起来完全正确，断言也全绿**。
- 这一组断言**不验证像素**：这里没有浏览器，`getDisplayMedia`、
  `videoWidth`、`ClipboardItem` 一个都跑不了。所以断的是
  "这段代码有没有把**已知会错的地方**主动挡掉"（顺序、约束集、
  比例自检、轨道停掉、失败退回 null、两个类型、矩形提前定死、CSS 真的藏了仪器）——
  挡它的那几行是可验证的，像素不是。

## 九、留给你确认的 / 已知限制

1. **权限框里应该能看到"当前标签页"这个单独选项**（靠 `selfBrowserSurface: "include"`）。
   如果看不到，第一件要查的就是这句有没有生效。
2. **必须真的共享"当前标签页"**。选窗口 → 会走比例自检 →
   回执是 `已复制规格（未能截图）`，剪贴板里只有那行规格。这是**设计如此**，
   不是失败。想确认这条闸在工作，故意选一次窗口看看。
3. **每次截取都要点一次权限框**。这是浏览器的规矩，页面绕不过去。
   我翻了 Permissions API 的权限项和 Chrome 的屏幕共享文档，
   **没有**找到"页面可以跳过选择框"的机制 —— 这条**未实机验证**，
   你要是发现有，这里可以省掉一次点击。
4. **精确度**：`videoWidth` 是设备像素，缩放比按视口算，
   所以 HiDPI 下截出来的图是 2× 分辨率、不是模糊放大 —— 这点是好的。
   但 1px 级别的边缘对齐我没法在这里验证，请你实机框一个小方块比一下。
5. **降低动效下**：截图这条路和动效无关，行为应当完全一样。
   唯一差别是待确认的框**没有 3 秒时限**（P44 定的），
   所以你可以慢慢点权限框。这条我提了两次都没等到你的意见，
   先按"不催"保留。
   → **已在 P48 定案**：降低动效下**也计时**，见下一节。




# P48 框选与键盘：G 键是闸门 + Enter 确认 + 降低动效下也计时

三件事：① 降低动效下那个框**保留 3 秒自动取消**（你定案了）；
② 框选绑到 **G 键的参考网格**上；③ 键盘能走完全程。

## 一、降低动效下也计时（连带修了那条倒计时线）

你确认"保留"，所以 `armBoxTimer()` 里那句
`if (REDUCE_MOTION) return;` 删掉了：

```js
function armBoxTimer() {
    endBoxTimer();
    boxTimer = setTimeout(dropBox, BOX_TTL);   // 不再分动效偏好
}
```

**★ 连带的一致性问题（这条比上面那句删改更值得看）：**
CSS 里降低动效下原本把倒计时线设成 `animation: none`，
理由写在注释里是"时限不存在，留着一条不动的线等于在说'有时间限制'，是错的"。

现在时限**是真的**了，那句话就反过来了：

- 继续藏 → "框会在 3 秒后消失"这件事**完全没有视觉提示**，用户会以为是 bug。
- 照常动 → 那条 `prefers-reduced-motion` 的全局规则会把 `animation-duration`
  压到 `.01ms`，它会在第一帧里**瞬间跑完**，变成一条空线 —— 比不动还糟。

所以现在降低动效下是一条**静止的满格线**（`animation: none` + `transform: scaleX(1)`）：
不含任何动效，但确实在说"这里有时限"。**"还剩多少"这个读数在降低动效下就不提供了** ——
那必须靠动效表达，属于那个偏好明确要求去掉的东西。

**★ `BOX_TTL` 现在的值是 1500，不是我改的。** 我上一轮跑自检时还是 3000，
再打开时已经是 1500（应该是你自己调的）。我**没有把它改回去**，
而是把自检里那条 `const BOX_TTL = 3000;` 的**钉死断言**换成了不变式：

```js
const boxTtl = parseInt((/const BOX_TTL = (\d+);/.exec(jsCross) || [])[1], 10);
ok('★ 框有确认时限（BOX_TTL = ' + boxTtl + 'ms），到点自动取消',
    Number.isFinite(boxTtl) && boxTtl > 0 && boxTtl <= 10000 && ...);
```

这正是 P34 那条教训（**只断言不变式，不钉可调的数**）——
钉死一个手感参数，代价是"调一下手感要改两处 + 自检报红"。
如果你刚才那个 1500 是误改，把它写成 3000 就行，自检不会拦你。

## 二、框选绑在 G 键的参考网格上

规则：**没开参考网格（G）就不能框选。**

状态**不跨文件传变量**，走 body 上的类（`guides.js` 负责挂/摘）：

```js
// guides.js
document.body.classList.toggle('guides-on', visible);

// crosshair.js
function guidesOn() {
    const cls = document.body.classList;
    return !cls.contains('guides-ready') || cls.contains('guides-on');
}
```

被闸门挡住时的处理，和"页面还在滚"那条**完全同构**：

```js
if (scrolling) {
    refusedDrag = true;
    showToast("请等待页面静止…", e.clientX, e.clientY);
} else if (!guidesOn()) {
    refusedDrag = true;
    showToast("按 G 开启参考线…", e.clientX, e.clientY);
} else {
    beginDrag();
}
```

- 同样是"**作废这次按下**"而不是 `return` ——
  `return` 会跳过 `targetFromMouse()`，准星就卡在原地不动了（P46 那个 bug）。
- **必须给回执**。这是这条规则唯一的代价：用户会以为"拖框坏了"，
  而不会想到要去按 G。把话说出口，代价就只剩一行字。

### ★★ fail-open：参考线挂掉不能连框选一起弄死

`guides.js` 开头是 `if (!canvas || !window.World) return;`。
那个守卫一旦成立，**G 键处理器根本不存在**，`guides-on` 永远是 false ——
如果 `guidesOn()` 直接 `return cls.contains('guides-on')`，
框选就被**永久禁用**了，而且没有任何报错。

"守卫把整套功能静默关掉"在这个项目里已经出现过两次
（`crosshair-active` 漏挂、`--hero-line` 缺变量），所以这次提前堵：

```js
// guides.js：守卫之后打个标记（守卫成立时这行不会执行）
document.body.classList.add('guides-ready');
```

**没有这个标记就放开闸门**：参考线不可用是它自己的问题，不该顺手把框选也弄死。

## 三、键盘能走完全程

| 键 | 作用 |
|---|---|
| `G` | 开/关参考网格 = 开/关框选（guides.js 本来就有） |
| `Enter` | **确认**待确认的框（= 点框内，截图 + 规格） |
| `Esc` | 取消 |
| 右键 | 取消 |

`Enter` 是这轮加的：既然框选已经和键盘绑上了，就该能用键盘走完全程 ——
拖出框、看一眼、`Enter` 截取。没有它，键盘用户画完框还得去够鼠标。

**输入框里不抢键**：这站有输入元素，打字时按 `Enter` 不该截屏。
`Enter`/`Esc` 和 guides.js 里那道 `INPUT / TEXTAREA / contentEditable` 守卫保持一致。

### ★ G 键关掉网格时，已经画出来的框也要收掉

不然"没有网格就没有框选"会留下一个例外：框还在，还能确认。

```js
document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() !== "g" || !pending) return;
    requestAnimationFrame(() => { if (pending && !guidesOn()) dropBox(); });
});
```

**为什么是 `requestAnimationFrame` 而不是直接读：**
这个 G 键处理器和 `guides.js` 里那个是**各注册一次**的，
谁先跑取决于两个 `<script>` 的先后。直接读的话，注册早的那个读到的是**旧**状态，
表现是"按一下 G 没反应、再按一下才把框收掉"。
放到下一帧再读，所有同事件的处理器都已经跑完，状态一定是最终的 ——
**不依赖加载顺序**。

## 四、动了哪些文件

| 文件 | 改了什么 |
|---|---|
| `js/crosshair.js` | `armBoxTimer()` 去掉 `REDUCE_MOTION` 分支（该常量一并删掉，不留死变量，708 附近）；新增 `guidesOn()`(774) fail-open；拖框被闸门挡住时作废+回执(1062)；`keydown` 加 `Enter` 确认(927)；新增 G 键收框的 rAF 处理器(947) |
| `js/guides.js` | 守卫之后打 `guides-ready` 标记(124)；G 键同步挂/摘 body 上的 `guides-on`(127/137) |
| `css/style.css` | 降低动效下倒计时线从"藏起来"改成"静止的满格线"(2558 附近) |
| `_dev/check.js` | 更新 4 条 + 新增 7 条（299 → **306** 项）；`BOX_TTL` 那条从钉死值改成不变式 |
| `assets/fonts/HuXiaoBo-subset.woff2`、`_dev/glyph-manifest.json` | 重跑子集（363 → **368** 个码位，32.3 → 32.9 KB；新字：按 / 参 / 考 / 线 / 选） |
| `index.html` | **不是我改的**：又出现了 UTF-8 BOM（应该是编辑器的默认行为），跑 `_dev/strip-bom.js` 去掉了 |
| `CHANGES.md` | 本节 |

## 五、验证

- `node _dev/check.js`：**306 项全过**。
- 编码审计：无 BOM、无 U+3000、行尾统一。
- `node _dev/subset-font.js --check`：当前文案全部在子集里。
- 一个我自己踩的坑，记一下：改 `BOX_TTL` 上面那段注释时，
  我用字符串匹配连试两次都没命中 —— 那段注释里有引号、全角标点，
  手抄 `old_string` 差一个字符就全不匹配。最后改成**按位置改**：
  用 ASCII 的 `const BOX_TTL` 定位，再往上找块注释的 `/*`。
  写一次性脚本时又挂了一次：向上扫描的条件写成"遇到不以 `*` 开头的行就停"，
  而这段注释的续行是以 `★` 开头的（不是 `*`）—— 于是还没走到 `/*` 就停了。
  改成"遇到空行才停"才对。**教训：中文注释块不适合当匹配锚点。**
- `★ 时限在降低动效下也生效` 这条断言是**反向**的：它不光要求
  `armBoxTimer()` 里没有那个分支，还要求**整个文件里不出现 `REDUCE_MOTION`**。
  这样"有人把那句加回来"会被立刻抓住 —— 而且我确实顺手把那个常量删了，
  因为留着它就是留一个"看起来还在用"的死变量。

## 六、留给你确认的

1. **不按 G 直接拖框**：应该弹 `按 G 开启参考系…`（你后来把措辞改短了），
   而且准星**照常跟鼠标**（不会卡在原地），这一按不会再突然开始画框。
2. **`G` → 拖框 → `Enter`**：应当直接截取并回执。全程不碰鼠标。
3. **框还在时按 `G` 关掉网格**：框（和提示、倒计时线）应当立刻收掉，
   准星回到鼠标处。
4. **降低动效下**：框依然是 1.5 秒自动取消，提示文字下面是一条
   **静止的、不动的**满格线。
5. 我替你做的判断，两个，都好改：
   - `Enter` = 确认（你没点名，是我按"与键盘结合"推的）。
     不想要的话，删掉 `js/crosshair.js` 里 `keydown` 的 `Enter` 那一段即可。
   - 关掉 G 会把**已经画出来的**框一起收掉。如果你觉得"框都画了就该让它留着确认"，
     把那个 rAF 处理器删掉就行（其余逻辑不受影响）。



# P49 修：四角刻线压在开屏动画上（我上一版改错了地方）

## 一、先更正：上一版我改的是**另一件东西**

你说"四角刻线"，我理解成了 `.ruler-marker-x/y` 那四个三角，
把它们的 z 从 9998 改成 999。**这个改动已经撤回**（改回 9998）。原因：

- 你要改的是 `.draft-frame`（`js/draft-layer.js` 里的 crop mark），不是三角；
- 三角那个改动**对开屏没有任何影响** —— 原因见第二节：跨层叠上下文时比数字没有用；
- 它还带来两个**看得见**的小瑕疵：红带盖过三角、准星线在三角的腿上切过 1px。
  为了一个**看不见**的问题换两个看得见的瑕疵，不划算。

顺手把三角那条事实记清楚（是真的，但不值得动）：三角和 `.splash-遮罩` 同为 9998，
三角在 index.html 第 55–58 行、遮罩在第 43 行 —— 同层号时后出现的在上，
所以三角确实压在红幕上；**但红幕本身就是 `var(--accent)` 的实心红，红三角落上去看不见**。

## 二、★ 真正的机制：跨层叠上下文时，比 z-index 的数字是没有用的

`.draft-frame` 原来的 z-index 是 **4**，红幕是 **9998** —— 4 却压在 9998 上面。
看着像 bug，其实是规则：

1. `.page-zoom` 身上挂着开屏那份 transform（`animation: body缩放 … both`）
   → 它在开屏期间是一个**层叠上下文**；
2. 它是**非定位元素**形成的层叠上下文，在 body 里按**层号 0** 参与排序
   —— 和"z-index: 0 的定位元素"同一批，而不是跟着普通块级内容排；
3. 开屏那几层的 z-index（9996 / 9997 / 9998 / 10000）**全部关在这个上下文里面**，
   一个都出不来。它们再大，也只是"0 里面的大"；
4. 而 `.draft-frame` 是 **body 的直接子元素** + `position: fixed` + 正层号
   → 永远排在层号 0 **之后**。

所以：

> 4 和 999 是一样的。**都是正数，都压在整页上面。**
> 要落到 `.page-zoom` 那一层下面，层号只能是**负数**。

这就是为什么"把它改成 999"看起来合理（999 < 9996）却完全没用 ——
**两个数比大小只在同一个层叠上下文里成立**；跨上下文时先比上下文，再比里面的数。

`.draft-frame` 是 JS 用 `document.body.appendChild` 挂上去的，
而开屏那几层在 `.page-zoom` 里面 —— 一个在里、一个在外，就是这件事的全部。

## 三、改法

```css
body:not(.intro-done) .draft-frame {
    z-index: -1;
}
```

- **门用 `intro-done`**，和 `body.intro-done .page-zoom { transform: none }`
  **同一个判定**。这不是巧合：这条规则成立的唯一理由就是
  "`.page-zoom` 上还挂着那份 transform"。哪天 transform 提前清掉，
  这条负层号自动失效，不会留下一个多余的负层号。
- **不能靠搬家解决**：把 `.draft-frame` 放进 `.page-zoom` 里，它就会被那份
  transform 当成 `position: fixed` 的包含块，跟着缩放 / 定位错位 ——
  index.html 第 419 行附近关于浮窗的那条注释写的是同一个坑。
  所以它必须留在 body 上，"修层级"只能靠负层号。
- `.draft-frame` 的**基础层号保持 4 不变**（活着的时候：正文 ≤ 11 之上，
  导航栏 100 / 页脚 101 / 仪器 9994~9998 之下）。
  你要的 999 我没有写进去 —— 它不但没用，还会让刻线在开屏结束后压到
  导航栏和页脚上面。**要是你要的就是那个效果，说一声，改一个数就行。**

## 四、开屏期间的实际观感

`.page-zoom` 的层号 0 排在负层号**之后**，所以那几秒里刻线在整页之下；
红幕是不透明实心红，**刻线被它挡住，看不见**。
红幕撤掉之后（`finishIntro()` 一开始就把那几层从 DOM 里 `remove()` 掉），
刻线位于 body 背景之上、正文之下 —— 在空处看起来和平时一模一样，
所以 `intro-done` 那一刻**不会有"跳出来"的感觉**。

（唯一可能的差别：那 330ms 尾巴里，如果某个不透明内容正好压在刻线那 16px 上，
刻线会被挡住；`intro-done` 一到就回到正文之上。1px 量级的事。）

## 五、动了哪些文件

| 文件 | 改了什么 |
|---|---|
| `css/style.css` | 新增 `body:not(.intro-done) .draft-frame { z-index: -1 }`(701)，并把"为什么必须这样写 / 为什么 999 没用"整段写在旁边；`.draft-frame` 基础层号的注释补一句；**撤回**上一版对 `.ruler-marker-x/y` 的 999 |
| `_dev/check.js` | 新增一节 `[2k] 开屏期间四角刻线必须在整页之下（P49）`（5 条）；**撤回**上一版那 4 条三角层号断言（它们断言的关系本身就是错的） |
| `CHANGES.md` | 本节（**整节重写** —— 上一版记录的是一个改错地方的修复） |

## 六、验证

- `node _dev/check.js`：**312 项全过**。
- 这一节**故意不断言**"刻线的 z 小于红幕"那种看着合理、实际不成立的关系，
  断的是真的起作用的东西：
  1. 那条规则存在，而且层号是**负数**（正数再怎么改都没用）；
  2. 负层号的门 = 清 transform 的门（两个门分叉，就会出现
     "transform 已清、刻线还躲在后面"的窗口期）；
  3. 前提还在：`.page-zoom` 开屏期间确实带 transform（连"未武装时暂停"一起断言 ——
     那条保证第一帧就是 0% 的 scale，而不是先渲染 scale(1) 再跳）；
  4. 刻线挂在 **body** 上、`draft-layer.js` 里不出现 `page-zoom`
     （搬家会让它被开屏的 transform 缩放）；
  5. `.draft-frame` 的 `z-index` 只在基础规则里声明一次。
- 写第 3 条时踩了个坑，记一下：那条选择器是**逗号列表**里的一项
  （`… .splash-网点,` / `… .page-zoom,` / `… {`），我第一版写成
  `\.page-zoom\s*\{`，等于要求它后面直接跟 `{` —— 断言当场报红。
  改成 `,\s*[\s\S]{0,400}?animation-play-state` 才对。

## 七、留给你确认的

1. 重新开一次页面：开屏那几秒**四角刻线应该完全看不见**，红幕撤掉后才出现。
2. 开屏结束后刻线的位置、粗细、颜色和之前完全一样
   （位置来自布局令牌，和 z-index 无关）。
3. 如果你要的是"刻线在开屏结束后也要压在导航栏(100)/页脚(101)之上"，
   那才轮到 999 —— 那是一个**独立的**需求，和这次的 bug 无关。

