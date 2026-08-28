/**
 * Native fixed-heading enhancement inspired by React Bits FoldText.
 * Project implementation; not the React/GSAP component or an installed registry item.
 * Reference and license: https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md
 * No business state, storage, model calls, or global heading scan.
 */
const controllers = new WeakMap();
const usedDocuments = new WeakSet();

export function getFoldTitlePlan(text, Segmenter = globalThis.Intl?.Segmenter) {
  const skip = (reason) => ({ ok: false, reason, pieces: [] });
  if (typeof text !== 'string' || !text.trim()) return skip('empty-title');
  if (/[\r\n]/.test(text)) return skip('multiline-title');
  if (typeof Segmenter !== 'function') return skip('segmentation-unavailable');
  try {
    const pieces = [...new Segmenter('zh-CN', { granularity: 'grapheme' }).segment(text)]
      .map(({ segment, index }) => ({ text: segment, start: index, end: index + segment.length }));
    if (!pieces.length || pieces.map((piece) => piece.text).join('') !== text) return skip('segmentation-failed');
    const totalMs = 400 + 20 * (pieces.length - 1);
    if (totalMs > 800) return skip('duration-budget');
    return { ok: true, pieces, durationMs: 400, staggerMs: 20, totalMs,
      perspective: 700, crease: 0.18, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
  } catch { return skip('segmentation-failed'); }
}

function staticController(reason) {
  let status = 'skipped';
  return { get status() { return status; }, get reason() { return reason; }, destroy() { status = 'destroyed'; } };
}

/** Explicit opt-in only. Call at page bootstrap, without awaiting business work. */
export function enhanceFoldTitle(heading) {
  const doc = heading?.ownerDocument;
  const win = doc?.defaultView;
  if (!heading || !doc || !win || !/^H[12]$/.test(heading.tagName || '')
      || !heading.hasAttribute?.('data-fold-title')) return staticController('not-an-opted-in-heading');
  if (controllers.has(heading)) return controllers.get(heading);
  if (usedDocuments.has(doc)) {
    const skipped = staticController('document-opportunity-consumed');
    controllers.set(heading, skipped);
    return skipped;
  }
  usedDocuments.add(doc);

  let state = 'pending';
  let reason = 'initializing';
  let layer = null;
  let observer = null;
  let pendingTimer = null;
  let fallbackTimer = null;
  let active = false;
  let epoch = 0;
  let media = null;
  const animations = [];
  const addedClasses = new Set();
  const removers = [];
  const originallyHadClass = heading.hasAttribute('class');
  const controller = {
    get status() { return state; },
    get reason() { return reason; },
    destroy() { if (state !== 'destroyed') finish('destroyed', 'destroyed'); },
  };
  controllers.set(heading, controller);

  function finish(nextState, nextReason) {
    if (state === 'destroyed') return;
    epoch += 1;
    observer?.disconnect();
    observer = null;
    if (pendingTimer !== null) win.clearTimeout(pendingTimer);
    if (fallbackTimer !== null) win.clearTimeout(fallbackTimer);
    pendingTimer = fallbackTimer = null;
    removers.splice(0).forEach((remove) => remove());
    animations.splice(0).forEach((animation) => { try { animation.cancel(); } catch { /* Already inactive. */ } });
    layer?.remove();
    layer = null;
    if (active) {
      addedClasses.forEach((name) => heading.classList.remove(name));
      addedClasses.clear();
      if (!originallyHadClass && !heading.classList.length) heading.removeAttribute('class');
      active = false;
    }
    // Original text nodes and inline styles were never replaced, so later business edits survive.
    state = nextState;
    reason = nextReason;
  }

  function listen(target, type, handler) {
    target.addEventListener(type, handler);
    removers.push(() => target.removeEventListener(type, handler));
  }

  function visible() {
    if (!heading.isConnected || heading.closest('[hidden]')) return false;
    const style = win.getComputedStyle(heading);
    return heading.getClientRects().length > 0 && style.display !== 'none' && style.visibility === 'visible';
  }

  function beforeFirstPaint() {
    // DOMContentLoaded alone cannot prove the user has not already read the title.
    if (doc.readyState === 'complete' || !win.PerformanceObserver?.supportedEntryTypes?.includes('paint')
        || typeof win.performance?.getEntriesByType !== 'function') return false;
    return !win.performance.getEntriesByType('paint').some((entry) => entry.name === 'first-contentful-paint');
  }

  function start(initialReveal = false) {
    if (state !== 'pending') return;
    if (!initialReveal && !beforeFirstPaint()) return finish('skipped', 'late-initialization');
    if (!visible()) return finish('skipped', 'not-visible');
    if (media.matches || doc.visibilityState !== 'visible') return finish('skipped', 'reduced-or-hidden');
    if (doc.fonts && doc.fonts.status !== 'loaded') return finish('skipped', 'fonts-not-ready');
    const originalNode = heading.firstChild;
    if (heading.childNodes.length !== 1 || originalNode?.nodeType !== 3) return finish('skipped', 'plain-fixed-text-required');
    const text = originalNode.data;
    const plan = getFoldTitlePlan(text, win.Intl?.Segmenter);
    if (!plan.ok) return finish('skipped', plan.reason);
    const style = win.getComputedStyle(heading);
    if (style.getPropertyValue('--fold-title-style-ready').trim() !== '1') return finish('skipped', 'styles-not-ready');
    if (style.transform !== 'none' || heading.classList.contains('fold-title-active')) return finish('skipped', 'unsupported-heading-style');
    const box = heading.getBoundingClientRect();
    const range = doc.createRange();
    const measured = plan.pieces.map((piece) => {
      range.setStart(originalNode, piece.start);
      range.setEnd(originalNode, piece.end);
      const rects = [...range.getClientRects()];
      return { piece, rect: rects.length === 1 ? rects[0] : null };
    });
    const firstRect = measured[0]?.rect;
    if (!firstRect || measured.some(({ rect }) => !rect || rect.width <= 0 || rect.height <= 0
        || Math.abs(rect.top - firstRect.top) > 1)) return finish('skipped', 'multiline-or-unmeasurable');
    if (!initialReveal && !beforeFirstPaint()) return finish('skipped', 'late-initialization');

    observer?.disconnect();
    observer = null;
    if (pendingTimer !== null) win.clearTimeout(pendingTimer);
    pendingTimer = null;
    layer = doc.createElement('span');
    layer.className = 'fold-title-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.style.color = style.color;
    layer.style.textShadow = style.textShadow;
    const pieces = measured.map(({ piece, rect }) => {
      const glyph = doc.createElement('span');
      glyph.className = 'fold-title-piece';
      glyph.textContent = piece.text;
      glyph.style.left = `${rect.left - box.left - heading.clientLeft}px`;
      glyph.style.top = `${rect.top - box.top - heading.clientTop}px`;
      glyph.style.width = `${rect.width}px`;
      glyph.style.height = `${rect.height}px`;
      glyph.style.lineHeight = `${rect.height}px`;
      const shade = doc.createElement('span');
      shade.className = 'fold-title-crease';
      glyph.append(shade);
      layer.append(glyph);
      return { glyph, shade };
    });
    heading.append(layer);
    for (const [index, { glyph, shade }] of pieces.entries()) {
      const timing = { duration: plan.durationMs, delay: index * plan.staggerMs, fill: 'both', easing: plan.easing };
      const flip = glyph.animate([
        { opacity: 0, transform: `perspective(${plan.perspective}px) rotateX(-92deg)` },
        { opacity: 1, transform: `perspective(${plan.perspective}px) rotateX(0deg)` },
      ], timing);
      animations.push(flip);
      void flip.finished.catch(() => {});
      const crease = shade.animate([{ opacity: plan.crease }, { opacity: 0 }], timing);
      animations.push(crease);
      void crease.finished.catch(() => {});
      flip.pause(); crease.pause();
      flip.currentTime = 0; crease.currentTime = 0;
    }
    active = true;
    heading.classList.add('fold-title-active');
    addedClasses.add('fold-title-active');
    if (style.position === 'static' && !heading.classList.contains('fold-title-positioned')) {
      heading.classList.add('fold-title-positioned');
      addedClasses.add('fold-title-positioned');
    }
    state = 'running';
    reason = 'playing-once';
    const runEpoch = epoch;
    // Observe only after our layer exists; later heading edits cancel without restoring old text.
    if (typeof win.MutationObserver === 'function') {
      observer = new win.MutationObserver(() => finish('settled', 'heading-changed'));
      observer.observe(heading, { childList: true, characterData: true, subtree: true });
    }
    Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (epoch === runEpoch && state === 'running') finish('settled', 'completed');
    });
    fallbackTimer = win.setTimeout(() => finish('settled', 'animation-timeout'), plan.totalMs + 150);
    animations.forEach((animation) => animation.play());
  }

  try {
    if (typeof win.Element?.prototype.animate !== 'function' || typeof win.matchMedia !== 'function'
        || !win.CSS?.supports?.('transform', 'perspective(700px) rotateX(0deg)')) {
      finish('skipped', 'animation-unavailable');
      return controller;
    }
    media = win.matchMedia('(prefers-reduced-motion: reduce)');
    if (media.matches || doc.visibilityState !== 'visible') {
      finish('skipped', 'reduced-or-hidden');
      return controller;
    }
    listen(media, 'change', () => { if (media.matches) finish('settled', 'reduced-motion'); });
    listen(win, 'pagehide', () => controller.destroy());
    listen(win, 'resize', () => finish('settled', 'viewport-changed'));
    listen(doc, 'visibilitychange', () => { if (doc.visibilityState !== 'visible') finish('settled', 'document-hidden'); });
    if (doc.fonts?.addEventListener) listen(doc.fonts, 'loading', () => finish('settled', 'fonts-changing'));
    if (heading.closest('[hidden]')) {
      // Current hidden state alone is not proof that the title has never been painted.
      if (!beforeFirstPaint()) finish('skipped', 'late-initialization');
      else if (typeof win.MutationObserver !== 'function') finish('skipped', 'reveal-observer-unavailable');
      else {
        reason = 'awaiting-initial-reveal';
        observer = new win.MutationObserver(() => {
          try { if (visible()) start(true); } catch { finish('skipped', 'enhancement-failed'); }
        });
        for (let node = heading; node; node = node.parentElement) {
          observer.observe(node, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
        }
        pendingTimer = win.setTimeout(() => finish('skipped', 'initial-reveal-timeout'), 5000);
      }
    } else start(false);
  } catch { finish('skipped', 'enhancement-failed'); }
  return controller;
}
