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

  function scrollToTarget(target) {
    const isTop = target === 'top';
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
    let pos = 0;
    let vel = 0;            // px per frame, left over from a flick
    let started = false;
    let drag = null;
    let raf = 0;
    let last = null;

    const measure = () => {
      loopW = track.children[originals.length].offsetLeft - originals[0].offsetLeft;
    };
    const render = () => {
      if (loopW) pos = ((pos % loopW) + loopW) % loopW;
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
  // Navbar on load: logo, links, then the button
  if (header) {
    header
      .querySelectorAll('.logo[data-pop], .main-nav [data-split], .header-cta[data-pop]')
      .forEach((el, i) => el.style.setProperty('--reveal-delay', `${(i * 0.06).toFixed(2)}s`));
  }

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
      const target = el.classList.contains('pop-ready') ? el.parentElement : el;
      const r = target.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) reveal(el);
      else io.observe(target);
    });
  };

  if (canAnimate) {
    // Wait for the web fonts so line breaks are measured with the real typeface
    const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
    Promise.race([fontsReady, new Promise((r) => setTimeout(r, 1500))]).then(startReveal);
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  /* ---------------------------------------------------------
     Hero slider
     --------------------------------------------------------- */
  const hero = document.querySelector('[data-hero-slider]');
  if (hero) {
    const slides = [...hero.querySelectorAll('.hero-slide')];
    const currentEl = hero.querySelector('[data-current]');
    hero.querySelector('[data-total]').textContent = slides.length;
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

    const go = (step) => {
      target = (target + step + n) % n;
      dir = step;
      currentEl.textContent = target + 1;
      if (running) running.forEach((a) => a.updatePlaybackRate(RUSH_RATE));
      else transition(DURATION);
    };

    setState();
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
        // When an open answer above collapses, everything below slides up. Keep
        // the clicked question pinned under the cursor by scrolling with it.
        const anchorTop = btn.getBoundingClientRect().top;
        const started = performance.now();
        const keepInPlace = () => {
          const drift = btn.getBoundingClientRect().top - anchorTop;
          if (Math.abs(drift) > 0.5) {
            if (lenis) lenis.scrollTo(window.scrollY + drift, { immediate: true, force: true });
            else window.scrollBy(0, drift);
          }
          if (performance.now() - started < 600) requestAnimationFrame(keepInPlace);
          else if (lenis) lenis.resize(); // page height changed; keep Lenis in sync
        };
        requestAnimationFrame(keepInPlace);
      });
    });
  }

  /* ---------------------------------------------------------
     Assessment form (client-side validation)
     --------------------------------------------------------- */
  const form = document.querySelector('[data-form]');
  if (form) {
    const status = form.querySelector('[data-form-status]');

    const setError = (input, msg) => {
      const field = input.closest('.field');
      let err = field.querySelector('.field-error');
      field.classList.toggle('has-error', Boolean(msg));
      input.setAttribute('aria-invalid', String(Boolean(msg)));
      if (msg) {
        if (!err) {
          err = document.createElement('span');
          err.className = 'field-error';
          err.id = `${input.id}-error`;
          field.appendChild(err);
          input.setAttribute('aria-describedby', err.id);
        }
        err.textContent = msg;
      } else if (err) {
        err.remove();
        input.removeAttribute('aria-describedby');
      }
    };

    const validate = (input) => {
      if (input.validity.valueMissing) return setError(input, 'This field is required.'), false;
      if (input.validity.typeMismatch) return setError(input, 'Please enter a valid email address.'), false;
      if (input.type === 'tel' && input.value && input.value.replace(/\D/g, '').length < 10) {
        return setError(input, 'Please enter a valid phone number.'), false;
      }
      setError(input, '');
      return true;
    };

    form.querySelectorAll('input[required]').forEach((input) => {
      input.addEventListener('blur', () => input.value && validate(input));
      input.addEventListener('input', () => input.closest('.field').classList.contains('has-error') && validate(input));
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const required = [...form.querySelectorAll('input[required]')];
      const results = required.map(validate);
      const firstInvalid = required[results.indexOf(false)];
      if (firstInvalid) {
        firstInvalid.focus();
        status.textContent = '';
        return;
      }

      // TODO: send the data to your form service, e.g.
      // fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
      status.textContent = 'Thanks! We’ll be in touch shortly to schedule your free assessment.';
      form.reset();
    });
  }

})();
