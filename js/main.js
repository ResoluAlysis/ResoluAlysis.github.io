console.log("主页已加载...");

/* ===== 开屏锁 ===== */
document.body.classList.add("locked");

window.crosshairPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

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
    // ★ intro-done 让 .page-zoom 交还 transform，fixed 层才重新相对视口定位
    document.body.classList.add("crosshair-active-done", "intro-done");
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
        if (zoomEl) {
            const cur = new DOMMatrixReadOnly(getComputedStyle(zoomEl).transform).a || 1;
            zoomEl.getAnimations().forEach((anim) => anim.cancel());
            zoomEl.style.transform = `scale(${cur})`;     // 固定住当前值，别让它弹回 1.5
            zoomEl.animate(
                [{ transform: `scale(${cur})` }, { transform: "scale(1)" }],
                { duration: 300, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "forwards" }
            ).finished.then(() => {
                /* 动画自带 forwards 会一直压着 scale(1)；留着小尾巴无所谓，
                   但**内联 transform 必须清掉** —— 否则它会盖住 body.intro-done
                   那条 transform: none，.page-zoom 就一直当 fixed 子元素的包含块。 */
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
   十字准星光标
   ============================================================ */
(function () {
    const h = document.querySelector(".crosshair-h");
    const v = document.querySelector(".crosshair-v");
    if (!h || !v) return;

    /* ----- 动态线宽：保证物理 1px / 2px ----- */
    function updateScale() {
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        const root = document.documentElement;
        root.style.setProperty("--crosshair-h-scale", 1 / vh);
        root.style.setProperty("--crosshair-v-scale", 1 / vw);
    }
    if (window.World) {
        World.onLayout(updateScale);            // 注册时立刻跑一次
    } else {
        updateScale();
        window.addEventListener("resize", updateScale);
    }

    /* ----- 缓动跟随参数 -----
       EASE = 60fps 基准下每帧的追赶比例。
         0.10 = 现在的手感（约 0.17s 才追到 63%，是刻意的顺滑拖尾）
         1    = 完全实时，准星直接钉在鼠标上、不再缓动
       ★ 注意：尺子三角、以及以后任何「跟随准星」的元素，都是订阅下面
         这个位置推送的，所以它们会自动继承这里的手感。
         想让整套都实时，把 0.10 改成 1 就行。 */
    const EASE = 0.10;

    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let cx = mx;
    let cy = my;
    let frozen = false;
    let rafId = null;
    let lastCrossTime = 0;

    /* ----- 准星位置订阅（供尺子三角等元素零延迟跟随）-----
       ★ 为什么不能让跟随者去 World.onFrame 里轮询 window.crosshairPos：
         准星跑在自己的 rAF 回调里，World 是另一个 rAF 回调；
         同一帧里谁先执行由注册顺序决定。如果 World 先跑，跟随者读到的
         就是上一帧的位置 —— 静止时看不出来，但鼠标快速移动时这个
         「一帧错位」会按速度放大成肉眼可见的拖尾。
         改成由准星更新后直接推送，顺序问题就不存在了。 */
    const posSubs = new Set();

    window.onCrosshair = function (fn) {
        posSubs.add(fn);
        fn(cx, cy);                                  // 注册时先同步一次
        return function () { posSubs.delete(fn); };
    };

    function applyOrigin() {
        h.style.transformOrigin = `0 ${cy}px`;
        v.style.transformOrigin = `${cx}px 0`;

        // 保留旧接口（外面可能只是只读引用）
        if (window.crosshairPos) {
            window.crosshairPos.x = cx;
            window.crosshairPos.y = cy;
        }
        // ★ 同一帧内推送给订阅者，零延迟
        for (const fn of posSubs) fn(cx, cy);
    }

    function step(now) {
        /* ★ 同样按 dt 归一化，否则高刷屏上准星会比 60Hz 跟得更紧 */
        const dt = lastCrossTime ? Math.min((now - lastCrossTime) / (1000 / 60), 4) : 1;
        lastCrossTime = now;
        const k = 1 - Math.pow(1 - EASE, dt);

        cx += (mx - cx) * k;
        cy += (my - cy) * k;

        if (Math.abs(mx - cx) < 0.1 && Math.abs(my - cy) < 0.1) {
            cx = mx;
            cy = my;
            applyOrigin();
            rafId = null;
            return;
        }

        applyOrigin();
        rafId = requestAnimationFrame(step);
    }

    applyOrigin();

    window.addEventListener("mousemove", (e) => {
        mx = e.clientX;
        my = e.clientY;
        if (frozen) return;
        if (rafId === null) { lastCrossTime = 0; rafId = requestAnimationFrame(step); }
    }, { passive: true });

    /* ----- 收缩期间冻结跟随 ----- */
    const observer = new MutationObserver(() => {
        const active = document.body.classList.contains("crosshair-active");
        const done = document.body.classList.contains("crosshair-active-done");

        if (active && !done && !frozen) {
            //frozen = true;
            cx = 0;
            cy = 0;
            mx = 0;
            my = 0;
            applyOrigin();
        }
        if (done && frozen) {
            frozen = false;
        }
    });
    observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
    });

    /* ----- 鼠标离开 / 进入窗口 ----- */
    document.addEventListener("mouseleave", () => {
        document.body.classList.add("crosshair-hidden");
    });
    document.addEventListener("mouseenter", () => {
        document.body.classList.remove("crosshair-hidden");
    });

    /* ----- 悬停交互元素时变色 ----- */
    document.addEventListener("mouseover", (e) => {
        const interactive = e.target.closest(
            "a, button, .btn, .card, [role='button']"
        );
        document.body.classList.toggle("crosshair-hover", !!interactive);
    });
})();

/* ============================================================
   液滴层视差
   ------------------------------------------------------------
   原来这里是一个独立的 rAF 循环，每帧给 .liquid-bg 写 transform。
   现在位移完全由 CSS 算：.liquid-bg 上声明了 --parallax: 0.7143
   （等价于原来的 /1.4），--px 由 world.js 写入的 --scroll-x 驱动。
   ============================================================ */

(function cursorDot() {
    const dot = document.querySelector('.cursor-dot');
    if (!dot || !window.World) return;

    /* ★ 原来自己开了一个 rAF 无限循环，鼠标不动也每帧写 transform。
       现在挂到 World 上，并且位置稳定后就不再碰 DOM。
       （曾经在这里做过「点击阶段式收缩」和「开屏时当整屏红幕」，
         两套都要抢 transform，已按需求撤掉 —— 这个模块只负责位置。） */
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let cx = tx, cy = ty;
    let lastDrawX = NaN, lastDrawY = NaN;

    window.addEventListener('mousemove', (e) => {
        tx = e.clientX;
        ty = e.clientY;
    }, { passive: true });

    World.onFrame((dt) => {
        const k = 1 - Math.pow(1 - 0.8, dt);
        cx += (tx - cx) * k;
        cy += (ty - cy) * k;
        if (Math.abs(tx - cx) < 0.05 && Math.abs(ty - cy) < 0.05) { cx = tx; cy = ty; }

        if (cx === lastDrawX && cy === lastDrawY) return;   // 没动就不写 DOM
        lastDrawX = cx;
        lastDrawY = cy;
        dot.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
    });
})();

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