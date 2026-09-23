console.log("主页已加载...");

/* ===== 开屏锁 ===== */
document.body.classList.add("locked");

/* 注：准星（四条线 + 吸边）已经拆到 js/crosshair.js（P32）。
   它跟开屏状态机没有耦合，只是一套指针逻辑。 */

/* ===== 读取总时长 ===== */
const T = window.SPLASH_TIMELINE || {};
const cross = T.cross || { delay: 4.8, duration: 1.2 };
const TOTAL = window.SPLASH_TOTAL || 6;

/* ===== 降低动效偏好：直接跳过整段开屏 =====
   CSS 的 prefers-reduced-motion 会把动画压到 0.01ms（画面瞬间静止），
   但 body.locked 仍然要等 TOTAL 秒才解除 —— 用户会盯着一个动不了、
   也点不动的页面。所以这里直接跳到已结束状态。 */
const REDUCE_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let introFinished = false;

function finishIntro(log) {
    /* ★ 先让开屏闸门放行。否则 welcome.js / circle-parallax.js 还在
       await Intro.armed，会一直不执行 —— 用户跳过或降低动效时就会卡住。 */
    if (window.Intro) window.Intro.cancel();
    if (introFinished) return;
    introFinished = true;
    document.querySelectorAll(".splash-遮罩, .splash-渐显, .splash-化开, .splash-网点, .welcome-splash, .welcome-tagline").forEach(el => el.remove());
    /* ★★ 这两个 class 必须**一起**加，少一个准星就会停在满屏。
       准星出生时是个铺满视口的实心矩形（.crosshair-h/-v 是 100vw×100vh），
       「变细成十字」是靠 body.crosshair-active 给的那条
       transform: scaleY(--crosshair-h-scale) / scaleX(--crosshair-v-scale)；
       crosshair-active-done 只负责把过渡时长设成 0s（即"直接跳到终态"）。
       所以只加 -done 不加 -active，transform 从头到尾就是基础规则的 scaleY(1)
       —— 准星会一直是一块盖住整页的实心色块。
       ★ 这正是"降低动效"那条路径之前的 bug：它直接调 finishIntro()，
         从来没加过 crosshair-active，于是开了减少动效的用户看到的是一整屏
         准星色（深色主题 #191919 / 浅色主题 #c8c8c8）而不是一个十字。
       ★ 放在 finishIntro() 里而不是各分支各写一遍：这条路径同时也是
         「等字体兜底」那条，幂等（已经加过再加是无害的），
         正常路径走到这里时 3.0s 早就加过了。 */
    // ★ intro-done 让 .page-zoom 交还 transform，fixed 层才重新相对视口定位
    document.body.classList.add("crosshair-active", "crosshair-active-done", "intro-done");
    document.body.classList.remove("locked");
    // ★ 放行闸门：所有「等开屏结束」的初始化在这里统一执行
    if (window.World) World.openGate();
    if (log) console.log(log);
}

if (REDUCE_MOTION) {

    finishIntro("降低动效偏好：已跳过开屏");

} else {

    /* ★ 开屏的所有计时都从「开屏起点」算起：timeline.js 会先等字体就绪
       （最多 Intro.maxWait 毫秒），那一刻才是 t = 0。
       原来是从页面加载直接算起，于是字体晚到时，那行巨大的 WELCOME
       会先用替代字体渲染、再当着用户的面重排一次。 */
    const introStart = window.Intro ? window.Intro.armed : Promise.resolve(0);

    introStart.then(() => {
        if (window.Intro && window.Intro.cancelled) return;   // 已被跳过 / 降级

        /* ===== 到点触发准星收缩 ===== */
        setTimeout(() => {
            document.body.classList.add("crosshair-active");
        }, cross.delay * 1000);

        /* ===== 收缩结束，解冻跟随 ===== */
        setTimeout(() => {
            document.body.classList.add("crosshair-active-done");
        }, (cross.delay + cross.duration) * 1000);

        /* ===== 全部结束：解锁页面 + 移除遮罩 + 交还 fixed 定位 ===== */
        setTimeout(() => {
            finishIntro("开屏完成，页面已解锁");
        }, TOTAL * 1000 + 100);
    });

    /* ===== 跳过：任意键/点击直接跳到最后 ===== */
    let skipped = false;
    const skip = () => {
        if (skipped) return;
        skipped = true;
        console.log("开屏被跳过");

        // 0. ★ 放行开屏闸门。等字体期间动画是 animation-play-state: paused 的，
        //    这一步同时解除暂停（下面 updatePlaybackRate 才真的会生效），
        //    也避免 welcome.js / circle-parallax.js 一直卡在 await 上。
        if (window.Intro) window.Intro.cancel();

        // 1. 移除遮罩
        document.querySelectorAll(".splash-遮罩, .splash-渐显, .splash-化开, .splash-网点").forEach(el => el.remove());
        // ★ 顺便清掉 WELCOME 和它的两行副标题
        document.querySelector(".welcome-splash")?.remove();
        document.querySelectorAll(".welcome-tagline").forEach(el => el.remove());

        /* 2. 整页缩放：从当前值**平滑**落到 1。
           ★ 原来只是 updatePlaybackRate(5)：到点 body.intro-done 会把动画整个砍掉，
             而那时缩放还在半路（约 0.85）—— 被 transform:none 一把拉到 1，就是"跳"。
             现在改成：先量出当前缩放 → 停掉原动画 → 用 300ms 的补间落到 1，
             等它落稳（下面的 330ms 到点）再加 intro-done，两边对齐就不会跳。 */
        const zoomEl = document.querySelector(".page-zoom");
        let zoomSettle = null;      // ★ P74：补间要留引用 —— 跑完必须 cancel（见下）
        if (zoomEl) {
            const cur = new DOMMatrixReadOnly(getComputedStyle(zoomEl).transform).a || 1;
            zoomEl.getAnimations().forEach((anim) => anim.cancel());
            zoomEl.style.transform = `scale(${cur})`;     // 固定住当前值，别让它弹回 1.5
            zoomSettle = zoomEl.animate(
                [{ transform: `scale(${cur})` }, { transform: "scale(1)" }],
                { duration: 300, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "forwards" }
            );
            zoomSettle.finished.then(() => {
                /* ★★ P74：这里原来只清内联 transform，**没有取消动画本身** ——
                   带 fill: forwards 的 WAAPI 动画会一直把 transform 顶成 scale(1)，
                   而"非 none 的 transform"让 .page-zoom 继续当**层叠上下文**：
                   里面所有 z-index（导航栏 100、刻度尺 9996、准星 9997…）
                   都只在它**内部**有效；对外它只是"层号 0 的非定位元素"。
                   游戏区是 body 的直接子元素、position: fixed、又在 DOM 更后面，
                   于是整体压在整站之上 —— 导航栏的外阴影就是这样被它的背景盖住的
                   （那种"同一声明、两侧观感不同"的怪事，根子在这里）。
                   这条坑 style.css 720 行那段 .draft-frame 的注释里写着，
                   只是没人想到"动画跑完了它还在"。 */
                zoomSettle.cancel();
                zoomEl.style.transform = "";
            }, () => {});
        }

        // 3. 用 class 缩短准星收缩时长（不污染 CSS 变量）
        document.body.classList.add("crosshair-fast");
        document.body.classList.add("crosshair-active");

        // 4. 收缩跑完后去掉 fast、加上 done，并放行闸门
        setTimeout(() => {
            document.body.classList.remove("crosshair-fast");
            if (zoomEl) zoomEl.style.transform = "";   // 兜底：内联 transform 一定要清干净
            if (zoomSettle) zoomSettle.cancel();       // ★ P74：兜底这条路也要取消补间
            document.body.classList.add("crosshair-active-done", "intro-done");
            if (window.World) World.openGate();
        }, 330);   // 0.25s + 一点余量（缩放补间是 300ms，落稳了再解锁）

        // 5. 解锁页面
        document.body.classList.remove("locked");

    };
    document.addEventListener("keydown", skip, { once: true });
    document.addEventListener("click", skip, { once: true });

    /* ===== 兜底：万一动画没触发 =====
       必须算上「等字体」最多花掉的时间，否则开屏还没开始兜底就先触发了。 */
    const armWait = window.Intro ? window.Intro.maxWait : 0;
    setTimeout(() => {
        finishIntro();
    }, (armWait + TOTAL + 3) * 1000);

}   // end if (REDUCE_MOTION)

/* ============================================================
   滚轮横向滚动（加速 + 惯性）
   ============================================================ */
(function () {
    const isTouch = window.matchMedia('(hover: none)').matches;
    if (isTouch) return;   // 移动端跳过

    const main = document.querySelector("main");
    if (!main) {
        console.error("找不到 main 元素！");
        return;
    }

    console.log("滚轮横向滚动已启用（带加速 + 惯性）");

    const FRICTION = 0.95;        // 每帧（60fps 基准）保留的比例
    const WHEEL_ACCEL = 0.20;
    const FOLLOW = 0.50;
    const MAX_VELOCITY = 60;

    let targetX = main.scrollLeft;
    let velocity = 0;
    let rafId = null;
    let jumpRafId = null;   // ★ 新增：锚点跳转专用动画
    let isSprinting = false;   // ★ 新增：是否正在冲刺跳转
    let lastStepTime = 0;

    function step(now) {
        /* ★ 原先是逐帧计算：144Hz 屏幕上惯性衰减速度会是 60Hz 的 2.4 倍，
             滚动距离和手感跟着刷新率变。这里把 dt 归一化到 60fps 基准。 */
        const dt = lastStepTime ? Math.min((now - lastStepTime) / (1000 / 60), 4) : 1;
        lastStepTime = now;

        targetX += velocity * dt;
        velocity *= Math.pow(FRICTION, dt);

        const max = main.scrollWidth - main.clientWidth;
        if (targetX < 0) {
            targetX = 0;
            velocity = 0;
        }
        if (targetX > max) {
            targetX = max;
            velocity = 0;
        }

        const cur = main.scrollLeft;
        const diff = targetX - cur;
        main.scrollLeft = cur + diff * (1 - Math.pow(1 - FOLLOW, dt));

        if (Math.abs(velocity) < 0.2 && Math.abs(diff) < 0.5) {
            main.scrollLeft = targetX;
            velocity = 0;
            rafId = null;
            return;
        }

        rafId = requestAnimationFrame(step);
    }

    document.addEventListener(
        "wheel",
        function (e) {
            if (document.body.classList.contains("locked")) {
                e.preventDefault();
                return;
            }

            /* ★ 浮窗打开时别拦滚轮 —— 交给浏览器去滚浮窗自己的内容区。
               这里原来只拦了 locked：浮窗开着的时候，滚轮会被下面这套
               惯性代码吃掉，结果是浮窗里滚不动、背后的 main 却在横向漂。 */
            if (document.body.classList.contains("window-open")) return;

            if (isSprinting) {
                e.preventDefault();   // 冲刺期间拦截滚轮，避免打断动画
                return;
            }

            const rect = main.getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX > rect.right) return;
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
            if (canScrollUnderCursor(e.target, e.deltaY, main)) return;

            e.preventDefault();

            let delta = e.deltaY;
            if (e.deltaMode === 1) delta *= 16;
            else if (e.deltaMode === 2) delta *= window.innerHeight;

            velocity += delta * WHEEL_ACCEL;
            velocity = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, velocity));

            if (rafId === null) { lastStepTime = 0; rafId = requestAnimationFrame(step); }
        },
        { passive: false }
    );

    /* 导航锚点平滑跳转（覆盖所有 a[href^="#"]：logo / hero 按钮 / 导航链接） */
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
        a.addEventListener("click", (e) => {
            const href = a.getAttribute("href");
            if (!href || href === "#") return;
            const el = document.querySelector(href);
            if (!el) return;

            // ★ 移动端是竖向排布（main 不横向滚动），改 scrollLeft 没有意义，
            //   交给浏览器原生锚点 + html{scroll-behavior:smooth}
            if (getComputedStyle(main).overflowX !== "auto") return;

            e.preventDefault();

            // ★ 用 relative 坐标算目标（不受 main 的 margin-left 影响）
            const mainRect = main.getBoundingClientRect();
            const elRect = el.getBoundingClientRect();
            const target = main.scrollLeft + (elRect.left - mainRect.left);

            // ★ 走"加速冲刺 + 急刹车"通道
            animateTo(target);

            // targetX 同步一下，避免之后滚轮从旧位置算起
            targetX = target;

            // 淡化
            document.body.style.transition = 'opacity 0.3s';
            document.body.style.opacity = '0.6';
            setTimeout(() => { document.body.style.opacity = '1'; }, 200);
        });
    });
    /* ============================================================
    加速冲刺 + 急刹车跳转
    ============================================================ */
    const SPRINT_RATIO = 0.35;   // 前 ？% 加速，后 100-？% 刹车
    const SPRINT_POW = 3.0;    // 加速曲线陡度，越大越"推背"
    const BRAKE_POW = 3.2;    // 刹车曲线陡度，越大越"顿"
    const VMAX = 2800;   // 峰值速度上限（px/秒）
    const EASE_K = 2.54;   // 本缓动曲线的峰值速度倍数（不要改）
    let sprintToken = 0;

    function animateTo(target) {
        if (jumpRafId) { cancelAnimationFrame(jumpRafId); jumpRafId = null; }
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        velocity = 0;

        isSprinting = true;
        const myToken = ++sprintToken;   // ★ 本次动画的唯一标识

        const startX = main.scrollLeft;
        const distance = target - startX;

        // 距离越远耗时越长，但峰值速度不超过 VMAX
        const duration = Math.min(
            2000,
            Math.max(500, (EASE_K * Math.abs(distance) / VMAX) * 1000)
        );

        const startTime = performance.now();

        function ease(t) {
            if (t < SPRINT_RATIO) {
                const p = t / SPRINT_RATIO;
                return Math.pow(p, SPRINT_POW) * (1 - 1 / (1 + SPRINT_POW));
            }
            // 刹车段：位置连续，速度会掉一截 → 观感就是"急刹"
            const p = (t - SPRINT_RATIO) / (1 - SPRINT_RATIO);
            const p1 = 1 - 1 / (1 + SPRINT_POW);   // 加速段结束时的位置
            return p1 + (1 - Math.pow(1 - p, BRAKE_POW)) * (1 - p1);
        }

        function frame(now) {
            const t = Math.min((now - startTime) / duration, 1);
            main.scrollLeft = startX + distance * ease(t);

            if (t < 1) {
                jumpRafId = requestAnimationFrame(frame);
            } else {
                main.scrollLeft = target;
                jumpRafId = null;
                // ★ 只有自己还是最新那次，才把 sprinting 关掉
                if (myToken === sprintToken) {
                    isSprinting = false;
                }
            }
        }
        jumpRafId = requestAnimationFrame(frame);
    }

    function canScrollUnderCursor(el, deltaY, stopAt) {
        while (el && el !== stopAt) {
            if (el.scrollHeight > el.clientHeight) {
                const style = getComputedStyle(el);
                const canScrollY =
                    style.overflowY === "auto" || style.overflowY === "scroll";

                if (canScrollY) {
                    const atTop = el.scrollTop <= 0;
                    const atBottom =
                        el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
                    if ((deltaY > 0 && !atBottom) || (deltaY < 0 && !atTop)) return true;
                }
            }
            el = el.parentElement;
        }
        return false;
    }
})();

/* ============================================================
   液滴层视差
   ------------------------------------------------------------
   原来这里是一个独立的 rAF 循环，每帧给 .liquid-bg 写 transform。
   现在位移完全由 CSS 算：.liquid-bg 上声明了 --parallax: 0.7143
   （等价于原来的 /1.4），--px 由 world.js 写入的 --scroll-x 驱动。
   ============================================================ */

/* 注：圆形指针（.cursor-dot）也搬去 js/crosshair.js 了（P33）——
   它和准星共用同一套"鼠标位置"语义，放一起更好对照。 */

/* 注：这里原本给 #about .container 加 .shine 类，但 style.css 里从来没有
   .shine 这条规则，而且 mouseenter 里还做了一次强制 reflow
   （void el.offsetWidth）——纯粹的无用功，已移除。
   之后要做「扫光重播」的话，先把 CSS 动画补好再把它加回来。 */

/* ============================================================
   禁用文本选择 / 拖拽 / 双击选词
   ============================================================ */
(function disableSelection() {
    // 禁止拖动（针对 img 和 a，即使 CSS 已经处理，JS 兜底）
    document.addEventListener('dragstart', (e) => {
        /* ★ P79 曾在这里给 .play-cart 开过后门（为了原生拖放）；
           P80 起卡带的拖动是**自己实现的指针拖拽**（js/sidebar.js），
           跟原生拖放没关系了 —— 所以后门撤掉，这条恢复成一律拦。 */
        e.preventDefault();
    });

    // 禁止双击选中文字
    document.addEventListener('mousedown', (e) => {
        if (e.detail > 1) e.preventDefault();   // 只拦双击及以后
    });

    // 禁止长按弹菜单（iOS 上的兼容）
    document.addEventListener('contextmenu', (e) => {
        // 如果你想保留右键菜单，删掉这一段
        // e.preventDefault();
    });
})();

/* ============================================================
   点击涟漪（模糊版，缩放结束后才启用）
   ============================================================ */
(function clickRipple() {
    const isTouch = window.matchMedia('(hover: none)').matches;
    if (isTouch) return;

    let rippleEnabled = false;

    /* ★ 原来为了「开屏结束才启用」叠了三套机制：zoomEl 的 animationend
       监听 + 自定义 bodyzoomend 事件 + 兜底 setTimeout，并且一直握着
       page-zoom 的引用。现在统一交给 World 的开屏闸门。
       （降级分支 finishIntro() 里也会 openGate，所以不会出现永远禁用。） */
    if (window.World) {
        World.gate(() => { rippleEnabled = true; });
    } else {
        setTimeout(() => { rippleEnabled = true; }, 3000);
    }

    /* ----- 点击时判断 ----- */
    document.addEventListener('click', (e) => {
        if (!rippleEnabled) return;        // ★ 缩放期间不触发
        if (e.button !== 0) return;

        const el = document.createElement('div');
        el.className = 'click-ripple';
        el.style.left = e.clientX + 'px';
        el.style.top = e.clientY + 'px';
        document.body.appendChild(el);

        el.addEventListener('animationend', () => el.remove(), { once: true });
    });
})();