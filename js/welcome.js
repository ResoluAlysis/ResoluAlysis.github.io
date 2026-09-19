(function welcomeSplash() {
    const el = document.querySelector('.welcome-splash');
    if (!el) return;

    const T = window.SPLASH_TIMELINE || {};
    const IN  = T.welcomeIn  || { delay: 0.3, duration: 2.0 };
    const OUT = T.welcomeOut || { delay: 2.3, duration: 1.0 };

    const text = el.textContent.trim();
    el.textContent = '';
    [...text].forEach((ch, i) => {
        const span = document.createElement('span');
        span.className = 'char';
        span.textContent = ch === ' ' ? '\u00A0' : ch;
        span.style.setProperty('--i', i);
        el.appendChild(span);
    });

    const CHAR_APPEAR = 0.7;
    const HOLD        = 0.5;
    const riseTotal   = IN.duration - HOLD;
    const n           = text.length;
    const stagger     = n > 1 ? Math.max(0, (riseTotal - CHAR_APPEAR) / (n - 1)) : 0;

    el.style.setProperty('--char-appear', CHAR_APPEAR + 's');
    el.style.setProperty('--char-stagger', stagger.toFixed(3) + 's');
    el.style.setProperty('--welcome-out-dur', OUT.duration + 's');

    setTimeout(() => {
        if (!el.isConnected) return;
        el.classList.add('leave');
    }, OUT.delay * 1000);

    el.addEventListener('animationend', (e) => {
        if (e.animationName === 'welcomeLeave') el.remove();
    }, { once: true });
})();