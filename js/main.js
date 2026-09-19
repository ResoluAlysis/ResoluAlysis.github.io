console.log("主页已加载...");

/* ===== 开屏锁 ===== */
document.body.classList.add("locked");

window.crosshairPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

/* ===== 读取总时长 ===== */
const T = window.SPLASH_TIMELINE || {};
const cross = T.cross || { delay: 4.8, duration: 1.2 };
const TOTAL = window.SPLASH_TOTAL || 6;

/* ===== 到点触发准星收缩 ===== */
setTimeout(() => {
    document.body.classList.add("crosshair-active");
}, cross.delay * 1000);

/* ===== 收缩结束，解冻跟随 ===== */
setTimeout(() => {
    document.body.classList.add("crosshair-active-done");
}, (cross.delay + cross.duration) * 1000);

/* ===== 全部结束：解锁页面 + 移除遮罩 ===== */
setTimeout(() => {
    document.querySelectorAll(".splash-遮罩, .splash-渐显").forEach(el => el.remove());
    document.body.classList.add("crosshair-active-done");
    document.body.classList.remove("locked");
    console.log("开屏完成，页面已解锁");
}, TOTAL * 1000 + 100);

/* ===== 跳过：任意键/点击直接跳到最后 ===== */
let skipped = false;
const skip = () => {
    if (skipped) return;
    skipped = true;
    console.log("开屏被跳过");

    // 1. 移除遮罩
    document.querySelectorAll(".splash-遮罩, .splash-渐显").forEach(el => el.remove());
    // ★ 顺便清掉 WELCOME
    document.querySelector(".welcome-splash")?.remove();

    // 2. 加快 page-zoom 的 body缩放
    const zoomEl = document.querySelector(".page-zoom");
    if (zoomEl) {
        zoomEl.getAnimations().forEach((anim) => {
            anim.updatePlaybackRate(5);
        });
    }

    // 3. 用 class 缩短准星收缩时长（不污染 CSS 变量）
    document.body.classList.add("crosshair-fast");
    document.body.classList.add("crosshair-active");

    // 4. 收缩跑完后去掉 fast、加上 done
    setTimeout(() => {
        document.body.classList.remove("crosshair-fast");
        document.body.classList.add("crosshair-active-done");
    }, 330);   // 0.25s + 一点余量

    // 5. 解锁页面
    document.body.classList.remove("locked");

    // 6. 通知 clickRipple
    window.dispatchEvent(new Event("bodyzoomend"));
};
document.addEventListener("keydown", skip, { once: true });
document.addEventListener("click", skip, { once: true });

/* ===== 兜底：万一动画没触发 ===== */
setTimeout(() => {
    document.body.classList.remove("locked");
    document.body.classList.add("crosshair-active-done");
    document.querySelectorAll(".splash-遮罩, .splash-渐显").forEach(el => el.remove());
}, (TOTAL + 3) * 1000);

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

    const FRICTION = 0.95;
    const WHEEL_ACCEL = 0.20;
    const FOLLOW = 0.50;
    const MAX_VELOCITY = 60;

    let targetX = main.scrollLeft;
    let velocity = 0;
    let rafId = null;
    let jumpRafId = null;   // ★ 新增：锚点跳转专用动画
    let isSprinting = false;   // ★ 新增：是否正在冲刺跳转

    function step() {
        targetX += velocity;
        velocity *= FRICTION;

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
        main.scrollLeft = cur + diff * FOLLOW;

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

            if (rafId === null) rafId = requestAnimationFrame(step);
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
    updateScale();
    window.addEventListener("resize", updateScale);

    /* ----- 缓动跟随参数 ----- */
    const EASE = 0.10;

    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let cx = mx;
    let cy = my;
    let frozen = false;
    let rafId = null;

    function applyOrigin() {
        h.style.transformOrigin = `0 ${cy}px`;
        v.style.transformOrigin = `${cx}px 0`;

        // ★ 暴露准星位置给 ruler-marker
        if (window.crosshairPos) {
            window.crosshairPos.x = cx;
            window.crosshairPos.y = cy;
        }
    }

    function step() {
        cx += (mx - cx) * EASE;
        cy += (my - cy) * EASE;

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
        if (rafId === null) rafId = requestAnimationFrame(step);
    });

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
   液滴层视差跟随
   ============================================================ */
(function syncLiquidLayer() {
    const main = document.querySelector('main');
    const liquidBg = document.querySelector('.liquid-bg');
    if (!main || !liquidBg) return;

    function tick() {
        liquidBg.style.transform = `translateX(${-main.scrollLeft / 1.4}px)`;
        requestAnimationFrame(tick);
    }
    tick();
})();

(function cursorDot() {
    const dot = document.querySelector('.cursor-dot');
    if (!dot) return;

    let tx = 0, ty = 0, cx = 0, cy = 0;
    window.addEventListener('mousemove', e => {
        tx = e.clientX;
        ty = e.clientY;
    });
    (function loop() {
        cx += (tx - cx) * 0.8;
        cy += (ty - cy) * 0.8;
        dot.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
        requestAnimationFrame(loop);
    })();
})();

document.querySelectorAll('#about .container').forEach(el => {
    el.addEventListener('mouseenter', () => {
        el.classList.remove('shine');
        // 强制 reflow，让动画能重新触发
        void el.offsetWidth;
        el.classList.add('shine');
    });
});

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

    const zoomEl = document.querySelector('.page-zoom');
    if (!zoomEl) return;

    let rippleEnabled = false;

    /* ----- 监听 body 缩放动画结束 ----- */
    zoomEl.addEventListener('animationend', (e) => {
        if (e.animationName === 'body缩放') {
            rippleEnabled = true;
        }
    });

    // 兼容 skip 时手动派发的事件
    window.addEventListener('bodyzoomend', () => {
        rippleEnabled = true;
    });

    /* ----- 兜底：万一 animationend 没触发（比如 reduced-motion 或组件被移除）----- */
    const bodyDur = (window.SPLASH_TIMELINE?.body?.duration ?? 2.5) * 1000;
    setTimeout(() => { rippleEnabled = true; }, bodyDur + 200);

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