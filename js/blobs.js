/* ============================================================
   液滴系统 v2：用极坐标生成路径
   ============================================================ */

// blobs.js 顶部
const isMobile = window.matchMedia('(max-width: 768px)').matches;
const CONFIG = isMobile ? BLOB_CONFIG.slice(0, 3) : BLOB_CONFIG;

/**
 * 生成一条绕原点漂移的闭合路径
 * @param {number} radius   平均半径（px）
 * @param {number} wobble   半径抖动幅度（px），0 = 正圆
 * @param {number} points   采样点数，越多越平滑
 * @param {number} phase    起始角度，用来错开多个液滴
 * @param {number} lobes    抖动次数，越大越"波浪"
 * @param {number} dir    运动方向（-1反方向，看起来是逆时针）
 */
function driftPath(radius, wobble = 0, points = 14, phase = 0, lobes = 3, dir = 1) {
    const path = [];
    for (let i = 0; i <= points; i++) {
        const t = (i / points) * Math.PI * 2 * dir + phase;
        const r = radius
            + Math.sin(t * lobes) * wobble
            + Math.sin(t * (lobes + 2) + 1.3) * wobble * 0.5;
        path.push([
            Math.cos(t) * r,
            Math.sin(t) * r,
        ]);
    }
    return path;
}

/*
大小 = size
速度 = duration（值越小越快）
移动范围 = path
让它更早动 = delay 加一个错开的秒数
换个颜色 = color 字段，写 var(--accent) 或 rgba(...)
*/
const BLOB_CONFIG = [
    {
        top: '50%', left: '50%',
        size: 250,
        duration: 35,
        delay: 0.2,
        pulseDur: 3,       // ★ 呼吸周期
        pulseDelay: 0.5,       // ★ 错开起始相位
        scaleMin: 0.85,      // ★ 最小缩到多少
        scaleMax: 1.0,      // ★ 最大胀到多少
        path: driftPath(60, 20, 20, Math.PI / 1.5, 0),
    },
    {
        top: '50%', left: '50%',
        size: 200,
        duration: 40,
        delay: 0.6,
        pulseDur: 8,       // ★ 呼吸周期
        pulseDelay: 0,       // ★ 错开起始相位
        scaleMin: 0.8,      // ★ 最小缩到多少
        scaleMax: 1.5,      // ★ 最大胀到多少
        path: driftPath(55, 20, 20, Math.PI, 0, -1),
    },
    {
        top: '50%', left: '50%',
        size: 280,
        duration: 50,
        delay: 0,
        pulseDur: 3.5,       // ★ 呼吸周期
        pulseDelay: 0,       // ★ 错开起始相位
        scaleMin: 0.85,      // ★ 最小缩到多少
        scaleMax: 1.15,      // ★ 最大胀到多少
        path: driftPath(50, 15, 16, 0, 3),
    },
    {
        top: '50%', left: '50%',
        size: 240,
        duration: 30,
        delay: 1.5,
        pulseDur: 3.5,       // ★ 呼吸周期
        pulseDelay: 0.2,       // ★ 错开起始相位
        scaleMin: 0.95,      // ★ 最小缩到多少
        scaleMax: 1.02,      // ★ 最大胀到多少
        path: driftPath(45, 20, 16, Math.PI / 3, 4),
    },
    {
        top: '50%', left: '50%',
        size: 280,
        duration: 20,
        delay: 0.8,
        pulseDur: 5,       // ★ 呼吸周期
        pulseDelay: 0.4,       // ★ 错开起始相位
        scaleMin: 0.90,      // ★ 最小缩到多少
        scaleMax: 1.05,      // ★ 最大胀到多少
        path: driftPath(35, 12, 14, Math.PI, 2),
    },
    {
        top: '50%', left: '50%',
        size: 30,
        duration: 30,
        delay: 2.2,
        pulseDur: 5,       // ★ 呼吸周期
        pulseDelay: 0,       // ★ 错开起始相位
        scaleMin: 0.5,      // ★ 最小缩到多少
        scaleMax: 1.0,      // ★ 最大胀到多少
        path: driftPath(55, 18, 18, Math.PI / 2, 5),
    },
    {
        top: '50%', left: '50%',
        size: 100,
        duration: 30,
        delay: 0,
        pulseDur: 3,       // ★ 呼吸周期
        pulseDelay: 0,       // ★ 错开起始相位
        scaleMin: 0.85,      // ★ 最小缩到多少
        scaleMax: 1.2,      // ★ 最大胀到多少
        path: driftPath(100, 200, 100, Math.PI, 0),
    },
    {
        top: '50%', left: '50%',
        size: 100,
        duration: 40,
        delay: 0.5,
        pulseDur: 8,       // ★ 呼吸周期
        pulseDelay: 0.5,       // ★ 错开起始相位
        scaleMin: 0.8,      // ★ 最小缩到多少
        scaleMax: 1.5,      // ★ 最大胀到多少
        path: driftPath(100, 200, 100, Math.PI / 2, 0),
    },

    {
        top: '50%', left: '50%',
        size: 50,
        duration: 20,
        delay: 1,
        pulseDur: 12,       // ★ 呼吸周期
        pulseDelay: 0.5,       // ★ 错开起始相位
        scaleMin: 0.8,      // ★ 最小缩到多少
        scaleMax: 1.2,      // ★ 最大胀到多少
        path: driftPath(100, 400, 100, Math.PI / 2, 0, -1),
    }
];

/* ============================================================
   把路径按"真实距离"分配 offset
   ============================================================ */
function buildKeyframes(path) {
    const segs = [];
    let total = 0;
    for (let i = 1; i < path.length; i++) {
        const dx = path[i][0] - path[i - 1][0];
        const dy = path[i][1] - path[i - 1][1];
        const d = Math.hypot(dx, dy) || 1;
        segs.push(d);
        total += d;
    }

    const offsets = [0];
    let acc = 0;
    for (const d of segs) {
        acc += d;
        offsets.push(acc / total);
    }

    return path.map(([x, y], i) => ({
        offset: offsets[i],
        transform: `translate(${x}px, ${y}px)`,
    }));
}

/* ============================================================
   生成液滴
   ============================================================ */
(function buildBlobs() {
    const layer = document.querySelector('.liquid-bg');
    if (!layer) return;

    BLOB_CONFIG.forEach((b) => {
        const el = document.createElement('span');
        el.className = 'blob';
        el.style.setProperty('--top', b.top);
        el.style.setProperty('--left', b.left);
        el.style.setProperty('--size', b.size + 'px');
        el.style.setProperty('--pulse-dur', (b.pulseDur || 4) + 's');
        el.style.setProperty('--pulse-delay', (b.pulseDelay || 0) + 's');
        el.style.setProperty('--scale-min', b.scaleMin ?? 0.85);
        el.style.setProperty('--scale-max', b.scaleMax ?? 1.15);
        if (b.color) el.style.setProperty('--color', b.color);
        layer.appendChild(el);

        let path = b.path;
        let keyframes = buildKeyframes(path);

        function playOnce() {
            const anim = el.animate(keyframes, {
                duration: b.duration * 1000,
                easing: 'linear',
                iterations: 1,
                fill: 'forwards',
            });

            anim.addEventListener('finish', () => {
                anim.cancel();

                // ★ 30% 概率翻转整条路径
                if (Math.random() < 0.3) {
                    path = path.slice().reverse();
                    keyframes = buildKeyframes(path);
                }

                playOnce();
            }, { once: true });
        }

        setTimeout(playOnce, (b.delay || 0) * 1000);
    });
})();
