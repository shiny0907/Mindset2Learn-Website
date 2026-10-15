(() => {
  'use strict';

  const root = document.documentElement;
  const header = document.querySelector('[data-header]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const AUTOPLAY_MS = 4000;

  // Advances a carousel every AUTOPLAY_MS; pauses on hover / keyboard focus.
  // Returns a restart function to call after manual navigation.
  function autoplay(el, step) {
    let timer = null;
    const stop = () => clearInterval(timer);
    const start = () => {
      stop();
      if (!reduceMotion) timer = setInterval(step, AUTOPLAY_MS);
    };
    el.addEventListener('mouseenter', stop);
    el.addEventListener('mouseleave', start);
    el.addEventListener('focusin', (e) => e.target.matches(':focus-visible') && stop());
    el.addEventListener('focusout', start);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    start();
    return start;
  }

  /* ---------------------------------------------------------
     Smooth scroll (Lenis), with native fallback
     --------------------------------------------------------- */
  let lenis = null;
  if (!reduceMotion && typeof window.Lenis === 'function') {
    lenis = new window.Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    const raf = (time) => {
      lenis.raf(time);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }

  const headerOffset = () => (header ? header.offsetHeight : 0) + 16;

  // Long jumps (e.g. header button → form at the bottom) would race through
  // the whole page, so instead the page fades out, moves there instantly and
  // fades back in. The header stays put. Short scrolls stay smooth.
  const FAR_JUMP = 1.5;    // viewport heights
  const FADE_MS = 220;     // matches the opacity transition in the css

  function jumpTo(target) {
    const isTop = target === 'top';
    if (lenis) {
      lenis.scrollTo(isTop ? 0 : target, { offset: isTop ? 0 : -headerOffset(), immediate: true, force: true });
    } else if (isTop) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    } else {
      target.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  }

  function scrollToTarget(target) {
    const isTop = target === 'top';
    const destY = isTop ? 0 : target.getBoundingClientRect().top + window.scrollY - headerOffset();
    if (!reduceMotion && Math.abs(destY - window.scrollY) > window.innerHeight * FAR_JUMP) {
      root.classList.add('is-jumping');
      setTimeout(() => {
        jumpTo(target);
        setTimeout(() => root.classList.remove('is-jumping'), 40); // fade back in once the new spot is painted
      }, FADE_MS);
      return;
    }
    if (lenis) {
      lenis.scrollTo(isTop ? 0 : target, { offset: isTop ? 0 : -headerOffset() });
    } else if (isTop) {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    } else {
      target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
  }

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const hash = link.getAttribute('href');

    // Placeholder links (pages not built yet) — don't jump to top
    if (hash === '#') {
      e.preventDefault();
      return;
    }

    const id = hash.slice(1);
    const target = id === 'top' ? 'top' : document.getElementById(id);
    if (!target) return;

    e.preventDefault();
    closeMenu();
    scrollToTarget(target);
    history.replaceState(null, '', id === 'top' ? location.pathname : hash);
  });

  /* ---------------------------------------------------------
     Header shadow + mobile menu
     --------------------------------------------------------- */
  const onScroll = () => {
    header && header.classList.toggle('is-scrolled', window.scrollY > 8);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const menuToggle = document.querySelector('[data-menu-toggle]');

  function closeMenu() {
    if (!root.classList.contains('menu-open')) return;
    root.classList.remove('menu-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open menu');
    lenis && lenis.start();
  }

  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      const open = root.classList.toggle('menu-open');
      menuToggle.setAttribute('aria-expanded', String(open));
      menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (lenis) open ? lenis.stop() : lenis.start();
    });
    document.addEventListener('keydown', (e) => e.key === 'Escape' && closeMenu());
    window.addEventListener('resize', () => window.innerWidth > 960 && closeMenu());
  }

  /* ---------------------------------------------------------
     Footer reveal: footer is pinned under the page and uncovered
     while the page's bottom corners round from square to full
     --------------------------------------------------------- */
  const mainEl = document.querySelector('main');
  const footerEl = document.querySelector('.site-footer');

  function updateFooterReveal() {
    const footerH = footerEl.offsetHeight;
    // Only pin when the whole footer fits on screen, otherwise its top would stay hidden
    root.classList.toggle('footer-reveal', footerH < window.innerHeight * 0.9);
    const tucked = -parseFloat(getComputedStyle(footerEl).marginTop) || 0; // part hidden behind the page
    const uncovered = window.innerHeight - mainEl.getBoundingClientRect().bottom;
    const progress = Math.min(1, Math.max(0, uncovered / (footerH - tucked)));
    root.style.setProperty('--reveal-progress', progress.toFixed(3)); // read by main + footer
  }

  if (mainEl && footerEl) {
    window.addEventListener('scroll', updateFooterReveal, { passive: true });
    window.addEventListener('resize', updateFooterReveal);
    updateFooterReveal();
  }

  /* ---------------------------------------------------------
     Scroll spy for nav links
     --------------------------------------------------------- */
  const spyLinks = [...document.querySelectorAll('[data-spy]')];
  const spySections = spyLinks
    .map((a) => (a.dataset.spy === 'top' ? null : document.getElementById(a.dataset.spy)))
    .filter(Boolean);

  function updateSpy() {
    const line = headerOffset() + window.innerHeight * 0.25;
    let current = 'top';
    for (const section of spySections) {
      const rect = section.getBoundingClientRect();
      if (rect.top <= line && rect.bottom > line) current = section.id;
    }
    spyLinks.forEach((a) => a.classList.toggle('is-active', a.dataset.spy === current));
  }
  window.addEventListener('scroll', updateSpy, { passive: true });
  updateSpy();

  /* ---------------------------------------------------------
     Tutors strip: stays still until the visitor reaches it, then
     drifts sideways in an endless loop; can be dragged or flicked
     --------------------------------------------------------- */
  const marquee = document.querySelector('[data-team-marquee]');
  if (marquee) {
    const track = marquee.querySelector('.team-grid');
    const originals = [...track.children];
    // A second copy follows the first so the loop never shows a seam
    originals.forEach((li) => {
      const copy = li.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true');
      track.appendChild(copy);
    });

    const SPEED = 45;       // drift in px per second
    const FRICTION = 0.94;  // how quickly a flick slows down (per frame)
    let loopW = 0;          // width of one full set of cards
    let lead = 0;           // empty padding before the first card
    let pos = 0;
    let vel = 0;            // px per frame, left over from a flick
    let started = false;
    let drag = null;
    let raf = 0;
    let last = null;
    let leadIn = true;      // the empty padding is only shown at the very start

    const measure = () => {
      loopW = track.children[originals.length].offsetLeft - originals[0].offsetLeft;
      lead = parseFloat(getComputedStyle(track).paddingLeft) || 0;
    };
    // Jumping back one set is invisible only while the view starts past the
    // padding (cards are on both sides of the jump), so keep pos in
    // [lead, lead + loopW) once the strip has moved past it.
    const render = () => {
      if (loopW) {
        if (pos >= lead) leadIn = false;
        const min = leadIn ? 0 : lead;
        if (pos < min || pos >= lead + loopW) {
          pos = lead + ((((pos - lead) % loopW) + loopW) % loopW);
          leadIn = false;
        }
      }
      track.style.transform = `translate3d(${-pos}px, 0, 0)`;
    };

    const tick = (time) => {
      const dt = last === null ? 0 : Math.min(0.05, (time - last) / 1000);
      last = time;
      if (!drag) {
        if (Math.abs(vel) > 0.05) {
          pos += vel;
          vel *= FRICTION;
        } else vel = 0;
        if (started && !reduceMotion) pos += SPEED * dt;
        render();
      }
      raf = requestAnimationFrame(tick);
    };
    const play = () => {
      if (raf) return;
      last = null;
      raf = requestAnimationFrame(tick);
    };
    const pause = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    measure();
    render();
    window.addEventListener('resize', () => { measure(); render(); });

    // Starts once a good part of the strip is on screen; idles when it's gone
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(
        ([entry]) => {
          if (entry.intersectionRatio >= 0.4) {
            started = true;
            play();
          } else if (!entry.isIntersecting) pause();
        },
        { threshold: [0, 0.4] }
      ).observe(marquee);
    } else {
      started = true;
      play();
    }

    marquee.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, t: e.timeStamp };
      vel = 0;
      marquee.setPointerCapture(e.pointerId);
      marquee.classList.add('is-dragging');
      play();
    });
    marquee.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dt = Math.max(1, e.timeStamp - drag.t);
      pos -= dx;
      vel = Math.max(-60, Math.min(60, (-dx / dt) * 16));
      drag.x = e.clientX;
      drag.t = e.timeStamp;
      render();
    });
    const endDrag = (e) => {
      if (!drag) return;
      if (e.timeStamp - drag.t > 80) vel = 0; // held still before letting go: no flick
      drag = null;
      marquee.classList.remove('is-dragging');
    };
    marquee.addEventListener('pointerup', endDrag);
    marquee.addEventListener('pointercancel', endDrag);

    // Sideways trackpad swipes move it too
    marquee.addEventListener(
      'wheel',
      (e) => {
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
        e.preventDefault();
        pos += e.deltaX;
        render();
      },
      { passive: false }
    );
  }

  /* ---------------------------------------------------------
     Image placeholders (until real photos are added)
     --------------------------------------------------------- */
  document.querySelectorAll('.media img').forEach((img) => {
    const markEmpty = () => img.closest('.media').classList.add('is-empty');
    if (img.complete && img.naturalWidth === 0) markEmpty();
    img.addEventListener('error', markEmpty);
    img.addEventListener('load', () => img.closest('.media').classList.remove('is-empty'));
  });

  /* ---------------------------------------------------------
     Parallax photo: the image is taller than its frame and
     drifts down through it as the frame scrolls up the screen,
     so it moves a little slower than the page
     --------------------------------------------------------- */
  const parallaxFrames = [...document.querySelectorAll('[data-parallax]')];
  if (parallaxFrames.length && !reduceMotion) {
    let ticking = false;
    const updateParallax = () => {
      ticking = false;
      const vh = window.innerHeight;
      parallaxFrames.forEach((frame) => {
        const r = frame.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        const img = frame.querySelector('img');
        const extra = img.offsetHeight - frame.offsetHeight; // room to move
        const progress = (vh - r.top) / (vh + r.height);     // 0 = entering at the bottom, 1 = leaving at the top
        img.style.transform = `translate3d(0, ${((progress - 0.5) * extra).toFixed(1)}px, 0)`;
      });
    };
    const requestParallax = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateParallax);
    };
    window.addEventListener('scroll', requestParallax, { passive: true });
    window.addEventListener('resize', requestParallax);
    updateParallax();
  }

  /* ---------------------------------------------------------
     Scroll reveal
     --------------------------------------------------------- */
  // Footer year (set before any text is split)
  const year = document.querySelector('[data-year]');
  if (year) year.textContent = new Date().getFullYear();

  const canAnimate = 'IntersectionObserver' in window && !reduceMotion;

  // Items in a group (eyebrow, title, paragraph, button) reveal one after another
  document.querySelectorAll('[data-reveal-group]').forEach((group) => {
    [...group.querySelectorAll(':scope > [data-split], :scope > [data-pop]')].forEach((child, i) => {
      child.style.setProperty('--reveal-delay', `${(i * 0.09).toFixed(2)}s`);
    });
  });
  document.querySelectorAll('[data-delay]').forEach((el) => {
    el.style.setProperty('--reveal-delay', `${el.dataset.delay}s`);
  });

  // Line reveal: each line slides up from behind a clipping edge, one line
  // after another. Words are wrapped individually and every word on the same
  // line shares that line's delay, so the whole line moves as one.
  const LINE_STAGGER = 0.07;

  function splitText(el) {
    let srText = '';

    const wrapWord = (inner) => {
      const word = document.createElement('span');
      word.className = 'split-word';
      inner.classList.add('split-word-inner');
      word.appendChild(inner);
      return word;
    };

    const splitNode = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          if (child.tagName === 'BR') return;
          // Links stay intact (focusable + readable) and move as one piece
          if (child.tagName === 'A') {
            const placeholder = document.createComment('');
            child.replaceWith(placeholder);
            placeholder.replaceWith(wrapWord(child));
            return;
          }
          splitNode(child);
          return;
        }
        if (child.nodeType !== Node.TEXT_NODE) return;

        srText += child.textContent;
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) {
            frag.appendChild(document.createTextNode(' '));
            return;
          }
          const inner = document.createElement('span');
          inner.textContent = part;
          const word = wrapWord(inner);
          word.setAttribute('aria-hidden', 'true');
          frag.appendChild(word);
        });
        child.replaceWith(frag);
      });
    };

    splitNode(el);

    // Screen readers get the plain text instead of the split words
    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = srText.replace(/\s+/g, ' ').trim();
    el.prepend(sr);
    el.classList.add('split-ready');
  }

  // Measured right before the reveal so line breaks match the current width
  function setLineDelays(el, stagger = LINE_STAGGER) {
    let line = -1;
    let lineTop = null;
    el.querySelectorAll('.split-word').forEach((w) => {
      const top = w.offsetTop;
      if (lineTop === null || top - lineTop > w.offsetHeight * 0.5) {
        line += 1;
        lineTop = top;
      }
      w.style.setProperty('--line-delay', `${(line * stagger).toFixed(2)}s`);
    });
  }

  // Buttons and other small UI pieces rise as one solid block from behind an edge
  function preparePop(el) {
    const mask = document.createElement('span');
    mask.className = el.dataset.pop === 'block' ? 'pop-mask pop-mask--block' : 'pop-mask';
    el.replaceWith(mask);
    mask.appendChild(el);
    el.classList.add('pop-ready');
  }

  // Plays an element's reveal; afterwards the clipping edge is removed so
  // hover effects and keyboard focus rings are never cut off.
  // fast = the visitor scrolled quickly and the element is already well on
  // screen: skip the waiting and bring it in quickly so text never lags behind.
  function reveal(el, fast = false) {
    if (fast) {
      el.classList.add('reveal-fast');
      el.style.setProperty('--reveal-delay', '0s');
    }
    if (el.classList.contains('split-ready')) setLineDelays(el, fast ? 0.025 : LINE_STAGGER);
    el.classList.add('is-visible');
    const delay = parseFloat(el.style.getPropertyValue('--reveal-delay')) || 0;
    clearTimeout(el._revealTimer);
    el._revealTimer = setTimeout(() => {
      el.classList.add('reveal-done');
      if (el.parentElement.classList.contains('pop-mask')) el.parentElement.classList.add('is-done');
    }, (delay + 2.2) * 1000);
  }

  if (canAnimate) {
    document.querySelectorAll('[data-split]').forEach(splitText);
    document.querySelectorAll('[data-pop]').forEach(preparePop);
  }

  const revealEls = document.querySelectorAll('[data-split], [data-pop]');
  const startReveal = () => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const t = entry.target;
            // Normally detected as its top reaches ~90% of the screen; if it's
            // already above ~70%, the visitor is scrolling fast
            const fast = entry.boundingClientRect.top < window.innerHeight * 0.7;
            reveal(t.classList.contains('pop-mask') ? t.firstElementChild : t, fast);
            io.unobserve(t);
          }
        });
      },
      { threshold: 0, rootMargin: '0px 0px -10% 0px' } // starts when the top reaches 90% of the viewport
    );
    // A popped element starts hidden below its wrapper's edge, so we watch the
    // wrapper (always in place) rather than the element itself.
    // Anything on screen at load (even near the bottom edge) plays its full
    // entrance right away; the rest waits until it's scrolled into view.
    revealEls.forEach((el) => {
      if (el.closest('[data-step]')) return; // How it works steps appear with their line (below)
      const target = el.classList.contains('pop-ready') ? el.parentElement : el;
      const r = target.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) reveal(el);
      else io.observe(target);
    });
  };

  // Wait for the web fonts so line breaks are measured with the real typeface
  const fontsReady = Promise.race([
    document.fonts ? document.fonts.ready : Promise.resolve(),
    new Promise((r) => setTimeout(r, 1500)),
  ]);
  if (canAnimate) fontsReady.then(startReveal);
  else revealEls.forEach((el) => el.classList.add('is-visible'));

  /* ---------------------------------------------------------
     How it works path: a smooth dashed line runs from step to
     step and draws itself as the visitor scrolls; each step
     appears when the line reaches it
     --------------------------------------------------------- */
  const hiw = document.querySelector('[data-hiw]');
  if (hiw) {
    const svg = hiw.querySelector('[data-hiw-svg]');
    const steps = [...hiw.querySelectorAll('[data-step]')];
    const titles = steps.map((s) => s.querySelector('.hiw-step-title'));
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const PEN_AT = 0.85;   // the line is drawn down to this height of the screen
    const EASE = 0.14;     // how quickly the drawn line catches up (per frame)
    const MIN_STEP = 6;    // ...but never slower than this (px per frame), so it doesn't crawl at the end
    const ARRIVED = 24;    // px from a route's end that counts as reaching the next step

    // Each route's shape, traced from the design: given its start a, end b and
    // the steps' width W, returns the points the line passes through between
    // them. Loops are sized from the width, not the height, so the gap between
    // steps can grow without stretching them.
    const ROUTES = [
      // 01 → 02: out to the right, a round loop, then down onto step 2's title
      (a, b) => {
        const sx = b[0] - a[0];
        const sy = b[1] - a[1];
        const at = (u, v) => [a[0] + u * sx, a[1] + v * sy];
        const c = at(0.6, 0.42); // loop centre
        const r = Math.min(sx * 0.13, sy * 0.22);
        const around = (dx, dy) => [c[0] + dx * r, c[1] + dy * r];
        // The line comes down onto the circle's right side, goes clockwise all
        // the way round to the top (y points down), then leaves to the right,
        // crossing the way it came in at close to a right angle.
        const loop = [];
        for (let deg = 0; deg <= 270; deg += 30) {
          const rad = (deg * Math.PI) / 180;
          loop.push(around(Math.cos(rad), Math.sin(rad)));
        }
        return [around(-1.6, -3.3), around(0.35, -2.6), around(0.95, -1.3), ...loop, around(1.7, -0.75), at(0.97, 0.55), at(1, 0.82)];
      },
      // 02 → 03: left and up into a heart-shaped loop, then down onto step 3's title
      (a, b, W) => {
        const span = b[1] - a[1];
        const heart = Math.min(span, W * 0.29); // height unit for the heart
        const lift = 0.6;                          // how far it rises above the start
        const inHeart = [[0.475, 0.08], [0.411, 0.14], [0.379, 0.05], [0.375, -0.19], [0.382, -0.44], [0.346, -0.57],
          [0.314, -0.58], [0.282, -0.48], [0.269, -0.26], [0.217, -0.2], [0.152, -0.21], [0.101, -0.12], [0.081, 0.08],
          [0.101, 0.28]];
        const toStep3 = [[0.152, 0.36], [0.256, 0.48], [0.327, 0.63], [0.359, 0.81]];
        return [
          ...inHeart.map(([u, v]) => [u * W, a[1] + v * heart * (v < 0 ? lift : 1)]),
          ...toStep3.map(([u, v]) => [u * W, a[1] + v * span]),
        ];
      },
    ];

    // Title box relative to the steps container. Left/right come from the text
    // itself (titles are blocks); top/bottom from the block, which never moves.
    const titleBox = (title) => {
      const base = hiw.getBoundingClientRect();
      const block = title.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(title);
      const text = range.getBoundingClientRect();
      return {
        left: text.left - base.left,
        right: text.right - base.left,
        width: text.width,
        top: block.top - base.top,
        bottom: block.bottom - base.top,
      };
    };

    // Smooth curve through the points: centripetal Catmull-Rom, converted to
    // cubic Béziers. Unlike the plain version it never kinks or overshoots
    // where points are unevenly spaced.
    const smoothPath = (pts) => {
      const f = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
      const dist = (p, q) => Math.sqrt(Math.hypot(q[0] - p[0], q[1] - p[1])); // |pq|^0.5
      let d = `M${f(pts[0])}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2] || p2;
        const d1 = dist(p0, p1);
        const d2 = dist(p1, p2);
        const d3 = dist(p2, p3);
        const c1 = d1 < 1e-6 ? p1 : [0, 1].map((k) =>
          (d1 * d1 * p2[k] - d2 * d2 * p0[k] + (2 * d1 * d1 + 3 * d1 * d2 + d2 * d2) * p1[k]) / (3 * d1 * (d1 + d2)));
        const c2 = d3 < 1e-6 ? p2 : [0, 1].map((k) =>
          (d3 * d3 * p1[k] - d2 * d2 * p3[k] + (2 * d3 * d3 + 3 * d3 * d2 + d2 * d2) * p2[k]) / (3 * d3 * (d3 + d2)));
        d += ` C${f(c1)} ${f(c2)} ${f(p2)}`;
      }
      return d;
    };

    let segs = [];

    // Shows the first `drawn` px of a route as dashes. The cut-off is by
    // distance along the line (not by area), so where the line crosses itself
    // nothing ahead of the pen can show through.
    const DASH = 14;
    const GAP = 13;
    function paint(seg) {
      const { line, len, drawn } = seg;
      if (drawn < 1) {
        line.style.visibility = 'hidden';
        return;
      }
      line.style.visibility = '';
      const pattern = [];
      let at = 0;
      while (at + DASH < drawn) {
        pattern.push(DASH, GAP);
        at += DASH + GAP;
      }
      if (drawn > at) pattern.push(drawn - at, len);
      else pattern[pattern.length - 1] = len; // ends on a gap: hide the rest
      line.style.strokeDasharray = pattern.join(' ');
    }

    function build() {
      const W = hiw.clientWidth;
      const H = hiw.clientHeight;
      const [t1, t2, t3] = titles.map(titleBox);
      const ends = [
        [[t1.right + W * 0.02, t1.bottom + 12], [t2.left + t2.width * 0.72, t2.top - 18]],
        [[t2.left + t2.width * 0.13, t2.bottom + 30], [t3.left + t3.width * 0.42, t3.top - 18]],
      ];
      const previous = segs.map((s) => (s.len ? s.drawn / s.len : 0));

      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.replaceChildren();
      segs = ROUTES.map((route, k) => {
        const [a, b] = ends[k];
        const pts = [a, ...route(a, b, W), b];
        const d = smoothPath(pts);

        const line = document.createElementNS(SVG_NS, 'path');
        line.setAttribute('d', d);
        line.setAttribute('class', 'hiw-line');
        svg.append(line);

        const len = line.getTotalLength();
        const samples = [];
        for (let l = 0; l <= len; l += 6) samples.push({ len: l, y: line.getPointAtLength(l).y });
        const seg = { line, len, samples, drawn: reduceMotion ? len : (previous[k] || 0) * len };
        seg.target = seg.drawn;
        paint(seg);
        return seg;
      });
    }

    // Each route draws down to the "pen" line on screen, one after the other
    function updateTargets() {
      const penY = window.innerHeight * PEN_AT - hiw.getBoundingClientRect().top;
      let prevDone = true;
      segs.forEach((seg) => {
        if (reduceMotion) seg.target = seg.len;
        else if (!prevDone) seg.target = 0;
        else {
          const past = seg.samples.find((s) => s.y > penY);
          seg.target = past ? past.len : seg.len;
        }
        prevDone = seg.drawn >= seg.len - ARRIVED;
      });
    }

    const shown = new Set();
    function showStep(step) {
      if (shown.has(step)) return;
      shown.add(step);
      if (!canAnimate) return; // already visible
      step.querySelectorAll('[data-split]').forEach((el, i) => {
        el.style.setProperty('--reveal-delay', `${(i * 0.08).toFixed(2)}s`);
        reveal(el);
      });
    }
    function updateSteps() {
      const lineShown = getComputedStyle(svg).display !== 'none';
      steps.forEach((step, i) => {
        const reached = lineShown && i > 0
          ? segs[i - 1].drawn >= segs[i - 1].len - ARRIVED
          : step.getBoundingClientRect().top < window.innerHeight * 0.9;
        if (reached) showStep(step);
      });
    }

    let raf = 0;
    function frame() {
      raf = 0;
      updateTargets();
      segs.forEach((seg) => {
        const diff = seg.target - seg.drawn;
        const move = Math.max(Math.abs(diff) * EASE, MIN_STEP);
        seg.drawn = Math.abs(diff) <= move ? seg.target : seg.drawn + Math.sign(diff) * move;
        paint(seg);
      });
      updateSteps();
      updateTargets(); // a finished route lets the next one start
      if (segs.some((seg) => seg.drawn !== seg.target)) raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

    build();
    fontsReady.then(() => { build(); kick(); });
    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', () => { build(); kick(); });
  }

  /* ---------------------------------------------------------
     Hero slider
     --------------------------------------------------------- */
  const hero = document.querySelector('[data-hero-slider]');
  if (hero) {
    const slides = [...hero.querySelectorAll('.hero-slide')];
    const n = slides.length;
    const DURATION = 1000;    // normal transition
    const CATCH_UP = 550;     // follow-up transition after rapid clicks
    const RUSH_RATE = 2.5;    // speed-up applied to a transition interrupted by a click
    const EASE = 'cubic-bezier(0.7, 0, 0.25, 1)';

    let index = 0;    // slide on screen (or currently sliding in)
    let target = 0;   // where the visitor wants to end up
    let dir = 1;      // direction of the latest request
    let running = null;

    const setState = () => {
      slides.forEach((s, i) => {
        s.classList.toggle('is-active', i === index);
        s.setAttribute('aria-hidden', String(i !== index));
      });
    };

    // Only one transition ever runs. Clicks during a transition move the target
    // and speed up the current slide; when it lands we go straight to the target.
    // dir = 1: new slide enters from the right over the old one, which drifts
    // left at a slower pace (parallax). dir = -1 mirrors it.
    function transition(duration) {
      if (target === index) return;
      const outgoing = slides[index];
      const incoming = slides[target];
      index = target;
      setState();
      if (reduceMotion || !incoming.animate) return;

      outgoing.classList.add('is-leaving');
      const enter = incoming.animate(
        [{ transform: `translateX(${dir * 100}%)` }, { transform: 'translateX(0)' }],
        { duration, easing: EASE }
      );
      const leave = outgoing.animate(
        [
          { transform: 'translateX(0)', filter: 'brightness(1)' },
          { transform: `translateX(${dir * -35}%)`, filter: 'brightness(0.6)' },
        ],
        { duration, easing: EASE }
      );
      running = [enter, leave];

      Promise.all(running.map((a) => a.finished)).then(() => {
        outgoing.classList.remove('is-leaving');
        running = null;
        transition(CATCH_UP);
      });
    }

    // Dots follow where the visitor is heading (target), not the slide mid-transition
    const dotsWrap = hero.querySelector('[data-dots]');
    const dots = slides.map((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 't-dot';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', `Photo ${i + 1} of ${n}`);
      dot.addEventListener('click', () => { goTo(i); restart(); });
      dotsWrap.appendChild(dot);
      return dot;
    });
    const syncDots = () => dots.forEach((d, i) => d.setAttribute('aria-selected', String(i === target)));

    const goTo = (i, step = i > target ? 1 : -1) => {
      if (i === target) return;
      target = i;
      dir = step;
      syncDots();
      if (running) running.forEach((a) => a.updatePlaybackRate(RUSH_RATE));
      else transition(DURATION);
    };
    const go = (step) => goTo((target + step + n) % n, step);

    setState();
    syncDots();
    const restart = autoplay(hero, () => go(1));

    hero.querySelector('[data-prev]').addEventListener('click', () => { go(-1); restart(); });
    hero.querySelector('[data-next]').addEventListener('click', () => { go(1); restart(); });
  }

  /* ---------------------------------------------------------
     Testimonial carousel
     --------------------------------------------------------- */
  const tc = document.querySelector('[data-t-carousel]');
  if (tc) {
    const cards = [...tc.querySelectorAll('.t-card')];
    const dotsWrap = tc.querySelector('[data-dots]');
    const stage = tc.querySelector('[data-stage]');
    const n = cards.length;
    let index = Math.floor(n / 2);

    const dots = cards.map((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 't-dot';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', `Testimonial ${i + 1} of ${n}`);
      dot.addEventListener('click', () => goManual(i));
      dotsWrap.appendChild(dot);
      return dot;
    });

    function go(i) {
      index = (i + n) % n;
      cards.forEach((card, c) => {
        let pos = c - index;
        if (pos > n / 2) pos -= n;
        if (pos < -n / 2) pos += n;
        pos = Math.max(-2, Math.min(2, pos));
        // A card wrapping from one end to the other would sweep across the
        // stage (very visible when clicking fast) — jump it there instantly.
        const prev = Number(card.dataset.pos);
        if (card.dataset.pos !== undefined && Math.abs(pos - prev) > 2) {
          card.style.transition = 'none';
          card.dataset.pos = pos;
          void card.offsetWidth;
          card.style.transition = '';
        }
        card.dataset.pos = pos;
        card.setAttribute('aria-hidden', String(pos !== 0));
      });
      dots.forEach((d, c) => d.setAttribute('aria-selected', String(c === index)));
    }

    go(index);
    const restart = autoplay(tc, () => go(index + 1));
    function goManual(i) {
      go(i);
      restart();
    }

    tc.querySelector('[data-prev]').addEventListener('click', () => goManual(index - 1));
    tc.querySelector('[data-next]').addEventListener('click', () => goManual(index + 1));

    // Clicking a side card brings it to the center
    cards.forEach((card, c) => {
      card.addEventListener('click', () => {
        const pos = Number(card.dataset.pos);
        if (pos === 1 || pos === -1) goManual(c);
      });
    });

    // Keyboard + swipe
    tc.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') goManual(index - 1);
      if (e.key === 'ArrowRight') goManual(index + 1);
    });

    let startX = null;
    stage.addEventListener('pointerdown', (e) => { startX = e.clientX; });
    stage.addEventListener('pointerup', (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 45) goManual(index + (dx < 0 ? 1 : -1));
      startX = null;
    });
    stage.addEventListener('pointercancel', () => { startX = null; });
  }

  /* ---------------------------------------------------------
     FAQ accordion (one open at a time)
     --------------------------------------------------------- */
  const faq = document.querySelector('[data-faq]');
  if (faq) {
    const items = [...faq.querySelectorAll('.faq-item')];
    let faqTimer = null;
    items.forEach((item) => {
      const btn = item.querySelector('.faq-q button');
      btn.addEventListener('click', () => {
        const willOpen = !item.classList.contains('is-open');
        items.forEach((other) => {
          other.classList.remove('is-open');
          other.querySelector('.faq-q button').setAttribute('aria-expanded', 'false');
        });
        if (willOpen) {
          item.classList.add('is-open');
          btn.setAttribute('aria-expanded', 'true');
        }
        // Once the open/close animation settles, nudge the page only if the
        // opened answer ended up partly off screen (never past its question).
        root.classList.add('faq-animating');
        clearTimeout(faqTimer);
        faqTimer = setTimeout(() => {
          root.classList.remove('faq-animating');
          if (lenis) lenis.resize(); // page height changed; keep Lenis in sync
          if (!willOpen) return;
          const rect = item.getBoundingClientRect();
          const topRoom = rect.top - headerOffset();
          const overflow = rect.bottom - (window.innerHeight - 16);
          let delta = 0;
          if (topRoom < 0) delta = topRoom;
          else if (overflow > 0) delta = Math.min(overflow, topRoom);
          if (Math.abs(delta) < 1) return;
          if (lenis) lenis.scrollTo(window.scrollY + delta, { duration: 0.6 });
          else window.scrollBy({ top: delta, behavior: reduceMotion ? 'auto' : 'smooth' });
        }, 480);
      });
    });
  }

  /* ---------------------------------------------------------
     Subject list (tutoring page): each row opens on its own.
     No auto-scrolling and no closing other rows, so nothing above
     the clicked row moves and Lenis is never fought for the page.
     --------------------------------------------------------- */
  const subjectList = document.querySelector('[data-subjects]');
  if (subjectList) {
    let subjectTimer = null;
    subjectList.querySelectorAll('.subject').forEach((item) => {
      const btn = item.querySelector('.subject-q button');
      btn.addEventListener('click', () => {
        const open = item.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', String(open));
        root.classList.add('subjects-animating');
        clearTimeout(subjectTimer);
        subjectTimer = setTimeout(() => {
          root.classList.remove('subjects-animating');
          if (lenis) lenis.resize(); // page height changed; keep Lenis in sync
        }, 480);
      });
    });
  }

  /* ---------------------------------------------------------
     Forms (client-side validation): assessment + job application.
     Each .field is checked as a unit, since some hold several controls.
     --------------------------------------------------------- */
  const MAX_UPLOAD_MB = 10;

  // First problem in a field as [control, message], or null when it's fine
  function fieldProblem(field) {
    for (const c of field.querySelectorAll('input, select, textarea')) {
      if (c.validity.valueMissing) return [c, 'This field is required.'];
      if (c.validity.typeMismatch) return [c, 'Please enter a valid email address.'];
      if (c.type === 'tel' && c.value && c.value.replace(/\D/g, '').length < 10) {
        return [c, 'Please enter a valid phone number.'];
      }
      const file = c.type === 'file' && c.files[0];
      if (file && !/\.(pdf|docx?)$/i.test(file.name)) return [c, 'Please upload a PDF or Word file.'];
      if (file && file.size > MAX_UPLOAD_MB * 1024 * 1024) return [c, `Please upload a file under ${MAX_UPLOAD_MB}MB.`];
    }
    const [low, high] = field.querySelectorAll('[data-grade]');
    if (low && high && !high.disabled && low.value && high.value && Number(low.value) > Number(high.value)) {
      return [high, 'The lowest grade can’t be above the highest.'];
    }
    return null;
  }

  function showError(field, problem) {
    let err = field.querySelector('.field-error');
    field.classList.toggle('has-error', Boolean(problem));
    field.querySelectorAll('[aria-invalid]').forEach((c) => {
      c.removeAttribute('aria-invalid');
      c.removeAttribute('aria-describedby');
    });
    if (!problem) {
      if (err) err.remove();
      return;
    }
    const [control, msg] = problem;
    if (!err) {
      err = document.createElement('span');
      err.className = 'field-error';
      field.appendChild(err);
    }
    err.id = `${control.id}-error`;
    err.textContent = msg;
    control.setAttribute('aria-invalid', 'true');
    control.setAttribute('aria-describedby', err.id);
  }

  document.querySelectorAll('[data-form]').forEach((form) => {
    const status = form.querySelector('[data-form-status]');
    const fields = [...form.querySelectorAll('.field')];

    const validate = (field) => {
      const problem = fieldProblem(field);
      showError(field, problem);
      return !problem;
    };

    fields.forEach((field) => {
      // Checked once the visitor leaves a filled-in field (not when moving
      // between controls inside it); after an error, re-checked as they fix it
      field.addEventListener('focusout', (e) => {
        if (field.contains(e.relatedTarget)) return;
        const filled = [...field.querySelectorAll('input:not([type="checkbox"]), select, textarea')].some((c) => c.value);
        if (filled) validate(field);
      });
      field.addEventListener('input', () => field.classList.contains('has-error') && validate(field));
      field.addEventListener('change', (e) => {
        if (e.target.type === 'file' || field.classList.contains('has-error')) validate(field);
      });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const results = fields.map(validate);
      const firstInvalid = fields[results.indexOf(false)];
      if (firstInvalid) {
        firstInvalid.querySelector('[aria-invalid]').focus();
        status.textContent = '';
        return;
      }

      // TODO: send the data to your form service, e.g.
      // fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
      status.textContent = form.dataset.success;
      form.reset();
    });
  });

  /* ---------------------------------------------------------
     Job application extras: add-a-subject chip and the resume drop zone
     --------------------------------------------------------- */
  const chips = document.querySelector('[data-chips]');
  if (chips) {
    const addBtn = chips.querySelector('[data-chip-add]');
    const input = chips.querySelector('[data-chip-input]');

    const close = (keep) => {
      const value = input.value.trim();
      if (keep && value) {
        const chip = document.createElement('label');
        chip.className = 'chip';
        chip.dataset.custom = '';
        chip.innerHTML = '<input type="checkbox" name="subjects" checked><span></span>';
        chip.querySelector('input').value = value;
        chip.querySelector('span').textContent = value;
        chips.insertBefore(chip, addBtn);
      }
      input.value = '';
      input.hidden = true;
      addBtn.hidden = false;
    };

    addBtn.addEventListener('click', () => {
      addBtn.hidden = true;
      input.hidden = false;
      input.focus();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== 'Escape') return;
      e.preventDefault(); // Enter would submit the form
      close(e.key === 'Enter');
      addBtn.focus();
    });
    input.addEventListener('blur', () => !input.hidden && close(true));
    chips.closest('form').addEventListener('reset', () => {
      chips.querySelectorAll('[data-custom]').forEach((c) => c.remove());
    });
  }

  const dropzone = document.querySelector('[data-dropzone]');
  if (dropzone) {
    const input = dropzone.querySelector('input[type="file"]');
    const nameEl = dropzone.querySelector('[data-file-name]');
    const emptyText = nameEl.textContent;
    const sync = () => {
      const file = input.files[0];
      nameEl.textContent = file ? file.name : emptyText;
      dropzone.classList.toggle('has-file', Boolean(file));
    };
    input.addEventListener('change', sync);
    ['dragenter', 'dragover'].forEach((t) => input.addEventListener(t, () => dropzone.classList.add('is-dragover')));
    ['dragleave', 'drop'].forEach((t) => input.addEventListener(t, () => dropzone.classList.remove('is-dragover')));
    input.closest('form').addEventListener('reset', () => setTimeout(sync));
  }

})();
