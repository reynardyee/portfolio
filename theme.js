document.addEventListener('DOMContentLoaded', () => {
    setupThemeToggle();
    setupNavIndicator();
});

function setupThemeToggle() {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;

    const stored = localStorage.getItem('theme');
    if (stored === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }

    function updateLabel() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const lightIcon = '<img src="https://img.icons8.com/?size=100&id=H3yHeysB1dxv&format=png&color=000000" alt="" class="theme-icon" />';
        const darkIcon = '<img src="https://img.icons8.com/?size=100&id=ttz0LmEuAD6m&format=png&color=000000" alt="" class="theme-icon" />';
        toggle.innerHTML = isDark ? lightIcon : darkIcon;
        toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    }

    function toggleTheme() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        }
        updateLabel();
    }

    toggle.addEventListener('click', toggleTheme);
    updateLabel();
}

function setupNavIndicator() {
    const nav = document.querySelector('nav');
    const menu = nav?.querySelector('ul');
    if (!nav || !menu) return;

    const links = Array.from(menu.querySelectorAll('a'));
    if (!links.length) return;

    for (const a of links) a.classList.add('nav-link');

    let indicator = menu.querySelector('.nav-indicator');
    if (!indicator) {
        indicator = document.createElement('span');
        indicator.className = 'nav-indicator';
        indicator.setAttribute('aria-hidden', 'true');
        menu.appendChild(indicator);
    }

    const STORAGE_KEY = 'nav_indicator_rect_v1';
    const STORAGE_TTL_MS = 8000;

    const keyToLink = new Map();
    for (const a of links) {
        const k = getNavKeyFromLink(a);
        if (k) keyToLink.set(k, a);
    }

    let activeKey = chooseInitialActiveKey();
    let activeLink = (activeKey && keyToLink.get(activeKey)) || null;
    if (!activeLink) activeLink = links[0];

    const restored = restoreIndicatorRect();
    if (restored) {
        applyIndicatorRect(restored, { immediate: true, visible: true });
    }

    requestAnimationFrame(() => {
        setActiveLink(activeLink, { moveIndicator: true });
    });

    // Hover/focus previews: move box to hovered link, then back to active.
    for (const a of links) {
        a.addEventListener('mouseenter', () => moveIndicatorToLink(a));
        a.addEventListener('focus', () => moveIndicatorToLink(a));
        a.addEventListener(
            'pointerdown',
            () => {
                const rect = calcIndicatorRectForLink(a);
                persistIndicatorRect(rect);
            },
            { passive: true }
        );
    }

    menu.addEventListener('mouseleave', () => moveIndicatorToLink(activeLink));
    menu.addEventListener('focusout', () => {
        // wait one tick so focus can move within the menu
        setTimeout(() => {
            if (!menu.contains(document.activeElement)) moveIndicatorToLink(activeLink);
        }, 0);
    });

    window.addEventListener('resize', () => moveIndicatorToLink(activeLink), { passive: true });

    // On index.html, highlight based on scroll position (section spy).
    if (isIndexPage()) {
        // Smooth scroll for in-page nav clicks (works nicely with scroll-snap).
        for (const a of links) {
            const key = getNavKeyFromLink(a);
            if (!key) continue;
            const href = (a.getAttribute('href') || '').trim();
            if (!href.startsWith('#')) continue;

            a.addEventListener('click', (e) => {
                // allow new-tab / modified clicks
                if (e.defaultPrevented) return;
                if (e.button !== 0) return;
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

                const target = document.getElementById(key);
                if (!target) return;

                e.preventDefault();

                const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
                target.scrollIntoView({
                    behavior: prefersReduced ? 'auto' : 'smooth',
                    block: 'start'
                });

                // Update URL without triggering an abrupt jump.
                try {
                    history.pushState(null, '', `#${key}`);
                } catch {
                    // ignore
                }
            });
        }

        setupSectionSpy((newKey) => {
            const next = keyToLink.get(newKey);
            if (next && next !== activeLink) {
                activeKey = newKey;
                activeLink = next;
                setActiveLink(activeLink, { moveIndicator: true });
            }
        });

        // Also respond immediately to hash changes.
        window.addEventListener(
            'hashchange',
            () => {
                const fromHash = (location.hash || '').replace('#', '');
                const next = keyToLink.get(fromHash);
                if (next) {
                    activeKey = fromHash;
                    activeLink = next;
                    setActiveLink(activeLink, { moveIndicator: true });
                }
            },
            { passive: true }
        );
    }

    function setActiveLink(link, { moveIndicator }) {
        for (const a of links) {
            a.classList.toggle('is-active', a === link);
            if (a === link) {
                a.setAttribute('aria-current', 'page');
            } else {
                a.removeAttribute('aria-current');
            }
        }
        if (moveIndicator) moveIndicatorToLink(link);
    }

    function moveIndicatorToLink(link) {
        if (!link) return;
        const rect = calcIndicatorRectForLink(link);
        applyIndicatorRect(rect, { immediate: false, visible: true });
    }

    function calcIndicatorRectForLink(link) {
        const linkRect = link.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        return {
            x: linkRect.left - menuRect.left,
            y: linkRect.top - menuRect.top,
            w: linkRect.width,
            h: linkRect.height
        };
    }

    function applyIndicatorRect(rect, { immediate, visible }) {
        indicator.classList.toggle('is-instant', !!immediate);
        indicator.classList.toggle('is-visible', !!visible);
        indicator.style.width = `${rect.w}px`;
        indicator.style.height = `${rect.h}px`;
        indicator.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`;
        if (immediate) {
            // allow transitions to resume after the immediate set
            requestAnimationFrame(() => indicator.classList.remove('is-instant'));
        }
    }

    function persistIndicatorRect(rect) {
        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({
                    ...rect,
                    ts: Date.now()
                })
            );
        } catch {
            // ignore
        }
    }

    function restoreIndicatorRect() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            if (Date.now() - Number(parsed.ts || 0) > STORAGE_TTL_MS) return null;
            if (![parsed.x, parsed.y, parsed.w, parsed.h].every((n) => Number.isFinite(Number(n)))) return null;
            return {
                x: Number(parsed.x),
                y: Number(parsed.y),
                w: Number(parsed.w),
                h: Number(parsed.h)
            };
        } catch {
            return null;
        }
    }

    function chooseInitialActiveKey() {
        const fromHash = (location.hash || '').replace('#', '');
        if (fromHash && keyToLink.has(fromHash)) return fromHash;

        // Any project detail page should highlight Projects by default.
        if (!isIndexPage()) {
            if (keyToLink.has('projects')) return 'projects';
        }

        return null;
    }

    function isIndexPage() {
        const p = (location.pathname || '').toLowerCase();
        return p.endsWith('/') || p.endsWith('/index.html') || p.endsWith('\\index.html');
    }

    function getNavKeyFromLink(a) {
        const href = (a.getAttribute('href') || '').trim();
        const idx = href.indexOf('#');
        if (idx === -1) return null;
        const key = href.slice(idx + 1);
        return key || null;
    }
}

function setupSectionSpy(onActiveKeyChange) {
    const sectionIds = ['hero', 'about', 'projects', 'skills', 'contact'];
    const sections = sectionIds
        .map((id) => document.getElementById(id))
        .filter(Boolean);

    if (!sections.length) return;

    let currentId = null;
    let ticking = false;

    function updateActiveSection() {
        ticking = false;
        const viewportCenter = window.innerHeight / 2;
        let bestId = null;
        let bestDist = Infinity;

        for (const sec of sections) {
            const rect = sec.getBoundingClientRect();
            const sectionCenter = rect.top + rect.height / 2;
            const dist = Math.abs(sectionCenter - viewportCenter);
            if (dist < bestDist) {
                bestDist = dist;
                bestId = sec.id;
            }
        }

        if (bestId && bestId !== currentId) {
            currentId = bestId;
            onActiveKeyChange(bestId);
        }
    }

    function onScroll() {
        if (!ticking) {
            window.requestAnimationFrame(updateActiveSection);
            ticking = true;
        }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', updateActiveSection, { passive: true });

    // Initial calculation so the correct section is active on load/refresh.
    updateActiveSection();
}

