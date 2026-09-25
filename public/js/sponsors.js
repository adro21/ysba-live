/* =========================================================
   YSBA LIVE — Sponsor credits
   One config, three placements (rendered into any element
   carrying data-sponsors="cell" | "strip" | "footer").

   To add a sponsor: drop a logo pair into /images/sponsors
   (colour on white + white on dark), add one entry below.
   `height` is the logo's resting height in px inside the
   masthead cell; the strip and footer scale from it so logos
   with very different shapes (a wordmark vs. a pennant) can
   be balanced by eye.
   ========================================================= */
(function () {
    'use strict';

    var CREDIT = 'Proud sponsors of the Richmond Hill Phoenix 11U';
    var LABEL = 'Presented by';

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

    function track(sponsor, placement) {
        if (typeof window.gtag === 'function') {
            window.gtag('event', 'sponsor_click', {
                sponsor: sponsor.id,
                placement: placement
            });
        }
    }

    function logoNode(sponsor, placement, onDark) {
        var img = document.createElement('img');
        img.src = onDark ? sponsor.logoOnDark : sponsor.logo;
        img.alt = sponsor.name;
        img.width = sponsor.width;
        img.height = sponsor.height_px;
        img.loading = 'lazy';
        img.decoding = 'async';
        img.className = 'sp-logo';
        img.style.setProperty('--sp-h', sponsor.height + 'px');

        var wrap;
        if (sponsor.url) {
            wrap = document.createElement('a');
            wrap.href = sponsor.url;
            wrap.target = '_blank';
            wrap.rel = 'sponsored noopener';
            wrap.title = sponsor.name;
            wrap.addEventListener('click', function () { track(sponsor, placement); });
        } else {
            wrap = document.createElement('span');
            wrap.title = sponsor.name;
        }
        wrap.className = 'sp-link';
        wrap.appendChild(img);
        return wrap;
    }

    function render(mount) {
        var placement = mount.getAttribute('data-sponsors') || 'cell';
        var onDark = placement === 'footer' || mount.hasAttribute('data-sponsors-dark');

        mount.classList.add('sp', 'sp--' + placement);
        mount.setAttribute('aria-label', 'Sponsors');

        var label = document.createElement('span');
        label.className = 'sp-label';
        label.textContent = LABEL;

        var logos = document.createElement('span');
        logos.className = 'sp-logos';
        SPONSORS.forEach(function (s) { logos.appendChild(logoNode(s, placement, onDark)); });

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
    }

    function init() {
        var mounts = document.querySelectorAll('[data-sponsors]');
        for (var i = 0; i < mounts.length; i++) {
            if (!mounts[i].hasChildNodes()) render(mounts[i]);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
