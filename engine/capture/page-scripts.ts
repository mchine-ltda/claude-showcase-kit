// In-page scripts for the capture pipeline. Kept as plain JavaScript source so
// the TypeScript toolchain cannot inject helpers that do not exist in the page.

/** CSS that hides dev overlays, consent banners, chat widgets and scrollbars. */
export const sanitizeCss = (hide: string[], blur: string[]) => `
html { scroll-behavior: auto !important; }
html::-webkit-scrollbar, body::-webkit-scrollbar, *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
html, body { scrollbar-width: none !important; }
* { caret-color: transparent !important; }
vite-error-overlay, nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog-overlay], #__next-build-watcher, #__next-prerender-indicator,
#webpack-dev-server-client-overlay, astro-dev-toolbar, #astro-dev-toolbar, #nuxt-devtools-container, [data-vercel-toolbar],
vercel-live-feedback, #vercel-live-feedback, #__vercel_toolbar, .__vercel-toolbar, #tanstack-query-devtools, .tsqd-parent-container,
#intercom-container, .intercom-lightweight-app, .intercom-launcher, #crisp-chatbox, #hubspot-messages-iframe-container,
.drift-frame-controller, #tawk-bubble-container, .tawk-min-container, #fb-root, .fb_dialog, #chat-widget-container,
#onetrust-banner-sdk, #onetrust-consent-sdk, #CybotCookiebotDialog, #CybotCookiebotDialogBodyUnderlay, .cc-window, .cc-banner,
#cookie-banner, .cookie-banner, #cookie-notice, .cookie-notice, #cookiescript_injected, .cky-consent-container, .cky-overlay,
#usercentrics-root, #iubenda-cs-banner, .grecaptcha-badge, #wpadminbar, #query-monitor-main
${hide.length ? ',' + hide.join(',\n') : ''} { display: none !important; }
${blur.length ? blur.join(',\n') + ' { filter: blur(12px) !important; }' : ''}
`;

/**
 * Hide obvious overlays the CSS list does not know: fixed consent/newsletter
 * boxes and modal dialogs open on load. Returns short descriptions for the log.
 */
export const HIDE_OVERLAYS = `(() => {
  const hidden = [];
  const vw = innerWidth, vh = innerHeight;
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    if (s.position !== 'fixed' && s.position !== 'sticky') continue;
    if (s.display === 'none' || s.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const text = (el.innerText || '').toLowerCase().slice(0, 600);
    const consent = /cookie|consent|gdpr|privacy preferences|we use cookies/.test(text) && el.querySelector('button, a');
    const modal = (el.getAttribute('role') === 'dialog' || el.getAttribute('aria-modal') === 'true') && r.width * r.height > vw * vh * 0.2;
    const promo = /newsletter|subscribe|sign up for|% off|discount code/.test(text) && r.width * r.height > vw * vh * 0.15 && r.top > 2;
    if (consent || modal || promo) {
      el.style.setProperty('display', 'none', 'important');
      hidden.push((consent ? 'consent banner' : modal ? 'modal dialog' : 'promo popup') + ' <' + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '>');
    }
  }
  document.querySelectorAll('video').forEach((v) => { try { v.pause(); } catch (e) {} });
  return hidden;
})()`;

/** Scroll through the page so lazy images and reveal-on-scroll content load. */
export const AUTO_SCROLL = `(async (cap) => {
  const step = Math.max(200, innerHeight * 0.7);
  const doc = document.scrollingElement || document.documentElement;
  let y = 0;
  for (let i = 0; i < 400; i++) {
    const max = Math.min(cap, doc.scrollHeight) - innerHeight;
    if (y >= max) break;
    y = Math.min(max, y + step);
    window.scrollTo({ top: y, behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 140));
  }
  await new Promise((r) => setTimeout(r, 400));
  window.scrollTo({ top: 0, behavior: 'instant' });
  await new Promise((r) => setTimeout(r, 300));
  return doc.scrollHeight;
})`;

/** Wait for every image to be loaded and decoded (bounded). */
export const WAIT_IMAGES = `(async (timeout) => {
  const until = Date.now() + timeout;
  const imgs = [...document.images];
  for (const img of imgs) { if (img.loading === 'lazy') img.loading = 'eager'; }
  await Promise.all(imgs.map((img) => {
    if (img.complete && img.naturalWidth > 0) return img.decode ? img.decode().catch(() => {}) : null;
    return new Promise((r) => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); setTimeout(r, Math.max(0, until - Date.now())); });
  }));
  await document.fonts.ready;
  return imgs.filter((i) => !(i.complete && i.naturalWidth > 0)).length;
})`;

/** Freeze running animations so sequential tiles stay consistent. */
export const FREEZE = `(() => {
  const style = document.createElement('style');
  style.id = '__wse_freeze';
  style.textContent = '*, *::before, *::after { animation-play-state: paused !important; }';
  document.head.appendChild(style);
  document.getAnimations().forEach((a) => { try { a.pause(); } catch (e) {} });
  document.querySelectorAll('video').forEach((v) => { try { v.pause(); } catch (e) {} });
})()`;

/** Shared helpers injected ahead of analysis scripts. */
const HELPERS = `
  const vw = innerWidth, vh = innerHeight;
  const doc = document.scrollingElement || document.documentElement;
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const absRect = (r) => ({ x: Math.round(r.left), y: Math.round(r.top + scrollY), width: Math.round(r.width), height: Math.round(r.height) });
  const uniqueSelector = (el) => {
    if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) return '#' + CSS.escape(el.id);
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      if (node.id && document.querySelectorAll('#' + CSS.escape(node.id)).length === 1) { parts.unshift('#' + CSS.escape(node.id)); break; }
      let i = 1, sib = node;
      while ((sib = sib.previousElementSibling)) if (sib.tagName === node.tagName) i++;
      parts.unshift(node.tagName.toLowerCase() + ':nth-of-type(' + i + ')');
      node = node.parentElement;
    }
    if (!parts[0] || !parts[0].startsWith('#')) parts.unshift('body');
    return parts.join(' > ');
  };
  // Any CSS colour (rgb, hex, oklab, color-mix, color(display-p3 ...)) resolved by the browser itself.
  const colorCtx = (() => { const c = document.createElement('canvas'); c.width = c.height = 1; return c.getContext('2d', { willReadFrequently: true }); })();
  const parseRgba = (s) => {
    if (!s || s === 'transparent' || s === 'none') return null;
    colorCtx.clearRect(0, 0, 1, 1);
    colorCtx.fillStyle = 'rgba(0,0,0,0)';
    colorCtx.fillStyle = s;
    colorCtx.fillRect(0, 0, 1, 1);
    const d = colorCtx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const parseRgb = (s) => {
    const c = parseRgba(s);
    return c && c[3] >= 0.5 ? [c[0], c[1], c[2]] : null;
  };
  const hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  const sat = (c) => { const mx = Math.max(...c), mn = Math.min(...c); return mx === 0 ? 0 : (mx - mn) / mx; };
  const bgOf = (el) => {
    let n = el;
    while (n && n.nodeType === 1) {
      const c = parseRgb(getComputedStyle(n).backgroundColor);
      if (c) return c;
      n = n.parentElement;
    }
    return [255, 255, 255];
  };
  const tightTextRect = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    return r.width > 0 ? r : el.getBoundingClientRect();
  };
`;

/** Find a pinned header (fixed/sticky, full width, at the top). Marks it with data-wse-header. */
export const FIND_HEADER = `(() => {
  ${HELPERS}
  let best = null;
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    if (s.position !== 'fixed' && s.position !== 'sticky') continue;
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (Math.abs(r.top) > 2 || r.width < vw * 0.9 || r.height < 30 || r.height > Math.min(260, vh * 0.32)) continue;
    if (!best || r.height > best.getBoundingClientRect().height) best = el;
  }
  if (!best) return null;
  best.setAttribute('data-wse-header', '1');
  return { selector: uniqueSelector(best), height: Math.ceil(best.getBoundingClientRect().bottom) };
})()`;

export const HEADER_STILL_PINNED = `(() => {
  const el = document.querySelector('[data-wse-header]');
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return Math.abs(r.top) <= 2 && r.height > 0;
})()`;

/** Make the header's background opaque so it composites cleanly over any section. */
export const OPAQUE_HEADER = `(() => {
  ${HELPERS}
  const el = document.querySelector('[data-wse-header]');
  if (!el) return;
  const v = parseRgba(getComputedStyle(el).backgroundColor);
  if (v && v[3] > 0 && v[3] < 1) {
    const base = bgOf(el.parentElement || document.body);
    const a = v[3];
    const mixc = [0, 1, 2].map((i) => v[i] * a + base[i] * (1 - a));
    el.style.setProperty('background-color', hex(mixc), 'important');
  }
  el.style.setProperty('backdrop-filter', 'none', 'important');
})()`;

/** Analyse page structure: sections, kinds, focus blocks, hero headline, background. */
export const ANALYZE = `((opts) => {
  ${HELPERS}
  window.scrollTo({ top: 0, behavior: 'instant' });
  const pageHeight = Math.min(opts.maxPageHeight, Math.max(doc.scrollHeight, document.body.scrollHeight));
  const pageBg = bgOf(document.body);

  const inFixed = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return true;
    return false;
  };
  const findGrid = (root) => {
    let best = null;
    const nodes = [root, ...root.querySelectorAll('*')].slice(0, 1500);
    for (const n of nodes) {
      const kids = [...n.children].filter(visible);
      if (kids.length < 3) continue;
      const rects = kids.map((k) => k.getBoundingClientRect());
      const w = rects.map((r) => r.width);
      const avg = w.reduce((a, b) => a + b, 0) / w.length;
      if (avg < 120) continue;
      const similar = w.filter((x) => Math.abs(x - avg) / avg < 0.6).length;
      const rows = new Set(rects.map((r) => Math.round(r.top / 30))).size;
      if (similar < 3 || rows > kids.length - 1) continue;
      const r = n.getBoundingClientRect();
      const score = kids.length * Math.min(1, r.width / (vw * 0.7));
      if (!best || score > best.score) best = { el: n, score, count: kids.length };
    }
    return best;
  };

  const describe = (el, index, total, forced) => {
    const r = el.getBoundingClientRect();
    const rect = absRect(r);
    const text = (el.innerText || '').toLowerCase().slice(0, 1500);
    const sig = ((el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '')).toLowerCase();
    const heading = [...el.querySelectorAll('h1, h2, h3')].find(visible) || null;
    const headingRect = heading ? absRect(tightTextRect(heading)) : null;
    const media = [...el.querySelectorAll('img, picture, video, svg, canvas, [style*="background-image"]')].filter((m) => {
      if (!visible(m)) return false;
      const mr = m.getBoundingClientRect();
      return mr.width * mr.height > 9000;
    });
    let paintArea = 0;
    for (const n of [...el.querySelectorAll('*')].slice(0, 1500)) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== 'none') {
        const nr = n.getBoundingClientRect();
        paintArea += nr.width * nr.height;
      }
    }
    for (const m of media) { const mr = m.getBoundingClientRect(); paintArea += mr.width * mr.height; }
    const mediaRatio = Math.min(1, paintArea / Math.max(1, r.width * r.height));
    const grid = findGrid(el);
    const price = /[€$£]\\s?\\d/.test(text);
    const bg = bgOf(el);
    const contrast = Math.abs(lum(bg) - lum(pageBg));
    let kind = 'content';
    if (forced && forced.kind) kind = forced.kind;
    else if (el.tagName === 'FOOTER' || el.getAttribute('role') === 'contentinfo' || (index === total - 1 && /©|copyright|all rights reserved/.test(text))) kind = 'footer';
    else if (index === 0 || (el.querySelector('h1') && rect.y < vh)) kind = 'hero';
    else if (el.querySelector('blockquote') || /testimonial|reviews?\\b|what (our )?(clients|customers) say/.test(text + ' ' + sig)) kind = 'testimonial';
    else if ((grid || (text.match(/[€$£]\\s?\\d/g) || []).length >= 2) && (price || /add to (bag|cart|basket)|shop|product/.test(text + ' ' + sig))) kind = 'products';
    else if ((media.length >= 4 || mediaRatio > 0.45) && (grid || /gallery|portfolio|work|projects|journal|instagram|case stud/.test(text.slice(0, 200) + ' ' + sig))) kind = 'gallery';
    else if ((el.querySelectorAll('ol > li').length >= 3) || /process|how it works|our approach|step 1|steps/.test(sig + ' ' + text.slice(0, 300))) kind = 'process';
    else if (el.querySelector('form') || /contact|get in touch|visit us|opening hours|find us|book a/.test(sig + ' ' + text.slice(0, 400))) kind = 'contact';
    else if (grid || /service/.test(sig)) kind = 'features';
    const bonus = { products: 0.3, features: 0.25, gallery: 0.3, process: 0.18, testimonial: 0.1, contact: 0.05, hero: 0.1, content: 0, cta: 0.05, footer: -0.5 }[kind] || 0;
    const score = Math.max(0, Math.min(1, 0.32 * mediaRatio + (grid ? 0.22 : 0) + (heading ? 0.1 : 0) + 0.18 * Math.min(1, contrast * 3) + bonus + Math.min(0.08, media.length * 0.02)));
    const label = forced && forced.label ? forced.label : heading ? heading.innerText.trim().replace(/\\s+/g, ' ').slice(0, 60) : kind;
    let focusEl = forced && forced.focus ? el.querySelector(forced.focus) || document.querySelector(forced.focus) : grid ? grid.el : null;
    const focus = focusEl && visible(focusEl) ? absRect(focusEl.getBoundingClientRect()) : null;
    return {
      kind, label, top: rect.y, height: rect.height, score: forced ? 1 : Math.round(score * 100) / 100,
      selector: uniqueSelector(el), heading: headingRect, focus,
    };
  };

  let sections = [];
  if (opts.overrides && opts.overrides.length) {
    const found = opts.overrides.map((o) => ({ o, el: document.querySelector(o.selector) })).filter((x) => x.el && visible(x.el));
    found.sort((a, b) => a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top);
    sections = found.map((x, i) => describe(x.el, i, found.length, x.o));
  } else {
    const cands = new Set();
    const add = (el) => { if (el && el !== document.body && el !== document.documentElement) cands.add(el); };
    document.querySelectorAll('header, main, main > *, body > *, section, footer, article, [class*="hero" i], [id*="hero" i]').forEach(add);
    ['main', '#root', '#__next', '#app', '#__nuxt', '#svelte', 'body > div'].forEach((sel) => {
      document.querySelectorAll(sel).forEach((root) => [...root.children].forEach(add));
    });
    const list = [...cands]
      .filter((el) => visible(el) && !el.hasAttribute('data-wse-header') && !inFixed(el))
      .filter((el) => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK'].includes(el.tagName))
      .map((el) => ({ el, r: absRect(el.getBoundingClientRect()) }))
      .filter(({ r }) => r.width >= vw * 0.72 && r.height >= 180 && r.height <= pageHeight * 0.75 && r.y < pageHeight);
    list.sort((a, b) => a.r.y - b.r.y || b.r.height - a.r.height);
    const accepted = [];
    for (const c of list) {
      const overlaps = accepted.some((a) => {
        const top = Math.max(a.r.y, c.r.y), bottom = Math.min(a.r.y + a.r.height, c.r.y + c.r.height);
        return bottom - top > Math.min(a.r.height, c.r.height) * 0.3;
      });
      if (!overlaps) accepted.push(c);
    }
    sections = accepted.map((c, i) => describe(c.el, i, accepted.length, null));
  }
  sections = sections.map((s, i) => Object.assign({ id: 's' + (i + 1) }, s));

  const h1 = [...document.querySelectorAll('h1')].find(visible) || [...document.querySelectorAll('h2')].find(visible);
  const heroHeadline = h1 ? absRect(tightTextRect(h1)) : null;
  const topEl = document.elementFromPoint(Math.round(innerWidth / 2), 2) || document.body;
  return { pageHeight: Math.round(pageHeight), sections, heroHeadline, background: hex(pageBg), topColor: hex(bgOf(topEl)) };
})`;

/** Brand signals: the site's own accent, background, text colour and heading font. */
export const BRAND = `(() => {
  ${HELPERS}
  const votes = new Map();
  const vote = (c, w) => {
    if (!c || sat(c) < 0.3) return;
    const l = lum(c);
    if (l < 0.07 || l > 0.93) return;
    const key = hex(c.map((v) => Math.round(v / 6) * 6));
    votes.set(key, (votes.get(key) || 0) + w);
  };
  for (const el of document.querySelectorAll('a, button, [class*="btn" i], [class*="button" i], [class*="cta" i], h1 *, h2 *, [class*="accent" i], [class*="highlight" i]')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const area = Math.min(4, (r.width * r.height) / 8000);
    vote(parseRgb(s.backgroundColor), 2 + area);
    vote(parseRgb(s.color), 1);
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  const themeColor = meta ? meta.getAttribute('content') : null;
  let accent = null, top = 0;
  for (const [k, v] of votes) if (v > top) { top = v; accent = k; }
  const body = document.body;
  const h1 = document.querySelector('h1');
  const font = h1 ? getComputedStyle(h1).fontFamily.split(',')[0].replace(/["']/g, '').trim() : null;
  const desc = document.querySelector('meta[name="description"]');
  return {
    accent, themeColor,
    background: hex(bgOf(body)),
    text: (() => { const c = parseRgb(getComputedStyle(body).color); return c ? hex(c) : null; })(),
    headingFont: font,
    title: document.title || '',
    description: desc ? desc.getAttribute('content') || '' : '',
  };
})()`;

/** Snapshot of visual state for an element subtree, to verify that an interaction really changes something. */
export const STYLE_SIGNATURE = `((selector) => {
  const root = selector ? document.querySelector(selector) : document.body;
  if (!root) return '';
  const props = ['transform', 'opacity', 'box-shadow', 'background-color', 'color', 'border-color', 'filter', 'clip-path', 'visibility', 'display', 'translate', 'scale'];
  const nodes = [root, ...root.querySelectorAll('*')].slice(0, 400);
  return nodes.map((n) => { const s = getComputedStyle(n); const r = n.getBoundingClientRect(); return props.map((p) => s.getPropertyValue(p)).join('|') + '@' + Math.round(r.top) + ',' + Math.round(r.height); }).join(';');
})`;

/** Candidate mobile menu toggle inside the pinned header or top of page. */
export const FIND_MENU_TOGGLE = `(() => {
  ${HELPERS}
  const cands = [...document.querySelectorAll('button, [role="button"], a, label')].filter(visible);
  const scoreOf = (el) => {
    const r = el.getBoundingClientRect();
    if (r.top > 160 || r.width > 120 || r.height > 120) return 0;
    const sig = ((el.getAttribute('aria-label') || '') + ' ' + (el.className && el.className.baseVal === undefined ? el.className : '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('aria-controls') || '')).toLowerCase();
    let s = 0;
    if (/menu|navigation|nav-toggle|burger|hamburger|drawer|open nav/.test(sig)) s += 3;
    if (el.hasAttribute('aria-expanded')) s += 2;
    if (el.querySelectorAll('span, i, div').length >= 2 && (el.innerText || '').trim().length < 3) s += 1;
    if (el.querySelector('svg') && (el.innerText || '').trim().length < 3) s += 0.5;
    if (r.left > innerWidth * 0.6) s += 0.5;
    return s;
  };
  let best = null, bestScore = 2;
  for (const el of cands) { const s = scoreOf(el); if (s > bestScore) { best = el; bestScore = s; } }
  return best ? uniqueSelector(best) : null;
})()`;

/** Hover candidates: cards that sit side by side inside the given sections (in priority order). */
export const FIND_HOVER_CARDS = `((sectionSelectors) => {
  ${HELPERS}
  const out = [];
  for (const sel of sectionSelectors) {
    const sec = document.querySelector(sel);
    if (!sec) continue;
    let best = null;
    for (const n of [sec, ...sec.querySelectorAll('*')].slice(0, 1500)) {
      const kids = [...n.children].filter(visible);
      if (kids.length < 2) continue;
      const rects = kids.map((k) => k.getBoundingClientRect());
      const w = rects.map((r) => r.width);
      const avg = w.reduce((a, b) => a + b, 0) / w.length;
      if (avg < 160 || avg > vw * 0.5) continue;
      if (rects.some((r) => r.height < 140)) continue;
      const sameRow = rects.filter((r) => Math.abs(r.top - rects[0].top) < 20).length;
      if (sameRow < 2) continue;
      if (!best || kids.length > best.length) best = kids;
    }
    if (best) {
      const order = [Math.min(best.length - 1, 1), 0, ...best.map((_, i) => i).slice(2)];
      for (const i of order) out.push(uniqueSelector(best[i]));
    }
  }
  return out.slice(0, 6);
})`;

/** Viewport rect of an element plus a scroll position that shows it well. */
export const TARGET_INFO = `((args) => {
  const el = document.querySelector(args.selector);
  if (!el) return null;
  const header = document.querySelector('[data-wse-header]');
  const headerH = header ? header.getBoundingClientRect().height : 0;
  const r = el.getBoundingClientRect();
  const doc = document.scrollingElement || document.documentElement;
  const maxScroll = Math.max(0, doc.scrollHeight - innerHeight);
  let top;
  if (args.scrollTo) {
    const anchor = document.querySelector(args.scrollTo);
    top = anchor ? anchor.getBoundingClientRect().top + scrollY - headerH - 24 : scrollY;
  } else if (header && header.contains(el)) {
    top = scrollY;
  } else {
    top = r.top + scrollY - Math.max(headerH + 16, (innerHeight - r.height) / 2);
  }
  return { scrollY: Math.round(Math.max(0, Math.min(maxScroll, top))) };
})`;

/** Undo FREEZE and the tiling-time hiding so a journey can keep interacting with the page. */
export const RESTORE = `(() => {
  const f = document.getElementById('__wse_freeze');
  if (f) f.remove();
  for (const a of (window.__wsePaused || [])) { try { if (a.playState === 'paused') a.play(); } catch (e) {} }
  window.__wsePaused = [];
  document.querySelectorAll('[data-wse-hidden]').forEach((el) => { el.style.removeProperty('visibility'); el.removeAttribute('data-wse-hidden'); });
  const h = document.querySelector('[data-wse-header]');
  if (h) h.style.removeProperty('visibility');
})()`;

/** Hide the pinned header and small fixed widgets for tiling, remembering what was hidden. */
export const HIDE_FOR_TILES = `(() => {
  const h = document.querySelector('[data-wse-header]');
  if (h) h.style.setProperty('visibility', 'hidden', 'important');
  for (const el of document.querySelectorAll('body *')) {
    if (h && (el === h || h.contains(el))) continue;
    const s = getComputedStyle(el);
    if (s.position !== 'fixed' || s.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height < innerWidth * innerHeight * 0.6) { el.style.setProperty('visibility', 'hidden', 'important'); el.setAttribute('data-wse-hidden', '1'); }
  }
})()`;

/** Freeze that remembers which animations it paused (so RESTORE can resume only those). */
export const FREEZE_TRACKED = `(() => {
  const style = document.createElement('style');
  style.id = '__wse_freeze';
  style.textContent = '*, *::before, *::after { animation-play-state: paused !important; }';
  document.head.appendChild(style);
  window.__wsePaused = document.getAnimations().filter((a) => a.playState === 'running');
  window.__wsePaused.forEach((a) => { try { a.pause(); } catch (e) {} });
})()`;

/**
 * Internal links the visitor can actually click right now: visible, inside the viewport,
 * not covered by another element, same origin, not legal/language/account links.
 * scope: 'header' | 'any'. Returns candidates scored by how showcase-worthy they are.
 */
export const FIND_LINKS = `((scope) => {
  ${HELPERS}
  const root = scope === 'header' ? (document.querySelector('[data-wse-header]') || document.querySelector('header') || document.body) : document.body;
  const here = location.pathname.replace(/\\/$/, '') || '/';
  const out = [];
  for (const a of root.querySelectorAll('a[href]')) {
    if (!visible(a)) continue;
    const r = a.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth || r.width < 8 || r.height < 8) continue;
    const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    const hit = document.elementFromPoint(cx, cy);
    if (!hit || !(hit === a || a.contains(hit) || hit.contains(a))) continue;
    let url;
    try { url = new URL(a.href, location.href); } catch (e) { continue; }
    if (url.origin !== location.origin) continue;
    const path = url.pathname.replace(/\\/$/, '') || '/';
    const raw = (a.innerText || a.getAttribute('aria-label') || '').trim();
    let text = raw.replace(/\\s+/g, ' ');
    // Card links (title + description, e.g. mega-menu items) are named by their first line.
    if (text.length > 40) text = (raw.split(/\\n/)[0] || '').trim().replace(/\\s+/g, ' ');
    if (!text || text.length > 40) continue;
    const sig = (text + ' ' + path).toLowerCase();
    if (/privacy|privacidade|cookie|legal|terms|termos|imprint|login|sign in|account|cart|checkout|wp-admin|sitemap/.test(sig)) continue;
    if (/^[a-z]{2}$/i.test(text) || /^(english|português|español|français|italiano|deutsch)$/i.test(text)) continue;
    const samePage = path === here;
    let score = 0;
    if (/servic|what we do|solution|product|shop|menu|offer/.test(sig)) score = 6;
    else if (/career|jobs|vacanc|work with us|join us|recruit/.test(sig)) score = 1;
    else if (/project|portfolio|our work|case stud|gallery|obras|projetos/.test(sig)) score = 5;
    else if (/about|team|story|quality|qualidade|sobre/.test(sig)) score = 3;
    else if (/contact|get in touch|quote|proposal|book|enquir|contacto/.test(sig)) score = 4;
    else score = 1;
    if (samePage) score -= 4;
    if (path === '/' || /^\\/[a-z]{2}$/.test(path)) score -= 3;
    out.push({ selector: uniqueSelector(a), text, path, samePage, score, contact: /contact|get in touch|quote|proposal|book|enquir|contacto/.test(sig) });
  }
  out.sort((x, y) => y.score - x.score);
  return out;
})`;

/** Header buttons that open a dropdown/mega menu, matched against a text pattern. */
export const FIND_TRIGGERS = `((pattern) => {
  ${HELPERS}
  const re = new RegExp(pattern, 'i');
  const root = document.querySelector('[data-wse-header]') || document.querySelector('header') || document.body;
  const out = [];
  for (const b of root.querySelectorAll('button, [role="button"], [aria-haspopup], [aria-expanded]')) {
    if (!visible(b)) continue;
    const r = b.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= innerHeight) continue;
    const text = (b.innerText || b.getAttribute('aria-label') || '').trim();
    if (!text || text.length > 40 || !re.test(text)) continue;
    if (!(b.hasAttribute('aria-expanded') || b.hasAttribute('aria-haspopup') || b.hasAttribute('data-state'))) continue;
    out.push({ selector: uniqueSelector(b), text });
  }
  return out;
})`;

/** Is the element's centre inside the viewport and not covered? */
export const IS_CLICKABLE = `((selector) => {
  const el = document.querySelector(selector);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.bottom <= 0 || r.top >= innerHeight) return false;
  const hit = document.elementFromPoint(Math.min(innerWidth - 1, r.left + r.width / 2), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)));
  return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
})`;
