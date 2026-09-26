/* =========================================================
   YSBA LIVE — Sponsor credits
   One config, three placements, any number of sponsors.

   Rendered into every element carrying
       data-sponsors="cell" | "strip" | "footer"

   - footer  shows every sponsor in a wrapping grid.
   - cell    (desktop header) and strip (phone header) show a
             fixed number of slots. When there are more sponsors
             than slots they rotate through the list in groups
             every few seconds (crossfade, or an instant swap for
             people who prefer reduced motion), paused on hover.

   To add a sponsor: put a logo pair in /images/sponsors
   (colour on white + white on dark; scripts/make-sponsor-logo.py
   can derive the white one) and add one entry below. `height`
   is the logo's resting height in px inside the header cell;
   every logo is also clamped to its slot width, so any shape
   is safe.
   ========================================================= */
(function () {
    'use strict';

    var LABEL = 'Presented by';
    var CREDIT = 'Proud sponsors of the Richmond Hill Phoenix 11U';

    var SPONSORS = [
        {
            id: 'ifixlaptops',
            name: 'ifixlaptops.biz',
            url: 'https://ifixlaptops.biz',
            logo: '/images/sponsors/ifixlaptops.png',
            logoOnDark: '/images/sponsors/ifixlaptops-white.png',
            width: 720, height_px: 101,
            height: 17
        },
        {
            id: 'sanction',
            name: 'Sanction',
            url: 'https://sanctionsnow.com',
            logo: '/images/sponsors/sanction.png',
            logoOnDark: '/images/sponsors/sanction-white.png',
            width: 320, height_px: 122,
            height: 25
        },
        {
            id: 'waltortho',
            name: 'Walt Ortho',
            url: 'https://waltortho.com',
            logo: '/images/sponsors/waltortho.png',
            logoOnDark: '/images/sponsors/waltortho-white.png',
            width: 640, height_px: 295,
            height: 30
        }
    ];

    /* How many slots each placement shows before it starts rotating. */
    var SLOTS = {
        cell: function () { return 3; },
        strip: function () { return window.matchMedia('(max-width: 479px)').matches ? 2 : 3; },
        footer: function () { return Infinity; }
    };
    var ROTATE_MS = 8000;   // time each group stays up
    var FADE_MS = 320;      // must match the CSS transition

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    function track(sponsor, placement) {
        if (typeof window.gtag === 'function') {
            window.gtag('event', 'sponsor_click', { sponsor: sponsor.id, placement: placement });
        }
    }

    function logoNode(sponsor, placement, onDark) {
        var img = document.createElement('img');
        img.src = onDark ? sponsor.logoOnDark : sponsor.logo;
        img.alt = sponsor.name;
        img.width = sponsor.width;
        img.height = sponsor.height_px;
        img.decoding = 'async';
        img.className = 'sp-logo';
        img.style.setProperty('--sp-h', sponsor.height + 'px');

        var wrap;
        if (sponsor.url) {
            wrap = document.createElement('a');
            wrap.href = sponsor.url;
            wrap.target = '_blank';
            wrap.rel = 'sponsored noopener';
            wrap.addEventListener('click', function () { track(sponsor, placement); });
        } else {
            wrap = document.createElement('span');
        }
        wrap.className = 'sp-slot';
        wrap.title = sponsor.name;
        wrap.appendChild(img);
        return wrap;
    }

    /* Sponsors k*size … k*size+size-1, wrapping around the list. */
    function group(k, size) {
        var n = SPONSORS.length, out = [];
        for (var i = 0; i < size && i < n; i++) out.push(SPONSORS[(k * size + i) % n]);
        return out;
    }

    function fill(container, sponsors, placement, onDark) {
        while (container.firstChild) container.removeChild(container.firstChild);
        sponsors.forEach(function (s) { container.appendChild(logoNode(s, placement, onDark)); });
    }

    function render(mount) {
        var placement = mount.getAttribute('data-sponsors') || 'cell';
        var onDark = placement === 'footer' || mount.hasAttribute('data-sponsors-dark');
        var size = (SLOTS[placement] || SLOTS.cell)();

        if (mount._spTimer) { clearInterval(mount._spTimer); mount._spTimer = null; }
        while (mount.firstChild) mount.removeChild(mount.firstChild);

        mount.classList.add('sp', 'sp--' + placement);
        mount.setAttribute('aria-label', 'Sponsors');

        var label = document.createElement('span');
        label.className = 'sp-label';
        label.textContent = LABEL;

        var logos = document.createElement('span');
        logos.className = 'sp-logos';

        var lead = document.createElement('span');
        lead.className = 'sp-lead';
        lead.appendChild(label);
        lead.appendChild(logos);
        mount.appendChild(lead);

        if (placement === 'footer') {
            var credit = document.createElement('span');
            credit.className = 'sp-credit';
            credit.textContent = CREDIT;
            mount.appendChild(credit);
        }

        var n = SPONSORS.length;
        if (n <= size) {
            fill(logos, SPONSORS, placement, onDark);
            return;
        }

        /* More sponsors than slots: rotate through groups. Start at a
           time-based offset so different page loads lead with different
           sponsors and everyone gets equal exposure. */
        var groups = n;                       // one group per starting index
        var k = Math.floor(Date.now() / ROTATE_MS) % groups;
        fill(logos, group(k, size), placement, onDark);

        var paused = false;
        mount.addEventListener('mouseenter', function () { paused = true; });
        mount.addEventListener('mouseleave', function () { paused = false; });
        mount.addEventListener('focusin', function () { paused = true; });
        mount.addEventListener('focusout', function () { paused = false; });

        mount._spTimer = setInterval(function () {
            if (paused || document.hidden) return;
            k = (k + 1) % groups;
            if (reduceMotion.matches) {
                fill(logos, group(k, size), placement, onDark);
                return;
            }
            logos.classList.add('is-fading');
            setTimeout(function () {
                fill(logos, group(k, size), placement, onDark);
                logos.classList.remove('is-fading');
            }, FADE_MS);
        }, ROTATE_MS);
    }

    function renderAll() {
        var mounts = document.querySelectorAll('[data-sponsors]');
        for (var i = 0; i < mounts.length; i++) render(mounts[i]);
    }

    function init() {
        renderAll();
        /* Slot counts depend on viewport width; re-render when it crosses. */
        var narrow = window.matchMedia('(max-width: 479px)');
        if (narrow.addEventListener) narrow.addEventListener('change', renderAll);
        else if (narrow.addListener) narrow.addListener(renderAll);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
