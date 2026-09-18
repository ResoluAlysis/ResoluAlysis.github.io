console.log("主页已加载...");

/* ===== 开屏锁 ===== */
document.body.classList.add("locked");

/* ===== 读取总时长 ===== */
const T = window.SPLASH_TIMELINE;
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
    document.querySelectorAll(".splash-遮罩, .splash-渐显").forEach(el => el.remove());
    document.body.classList.add("crosshair-active", "crosshair-active-done");
    document.body.classList.remove("locked");
    console.log("开屏被跳过");
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

    /* 导航锚点平滑跳转 */
    document.querySelectorAll('.nav-links a[href^="#"]').forEach((a) => {
        a.addEventListener("click", (e) => {
            const el = document.querySelector(a.getAttribute("href"));
            if (!el) return;
            e.preventDefault();
            targetX = el.offsetLeft;
            velocity = 0;
            if (rafId === null) rafId = requestAnimationFrame(step);
        });
    });

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
        root.style.setProperty("--crosshair-h-scale", 2 / vh);
        root.style.setProperty("--crosshair-v-scale", 2 / vw);
    }
    updateScale();
    window.addEventListener("resize", updateScale);

    /* ----- 缓动跟随参数 ----- */
    const EASE = 0.12;

    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let cx = mx;
    let cy = my;
    let frozen = false;
    let rafId = null;

    function applyOrigin() {
        h.style.transformOrigin = `0 ${cy}px`;
        v.style.transformOrigin = `${cx}px 0`;
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