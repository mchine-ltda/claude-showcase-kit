import path from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import type { TemplateId } from '../../src/templates';
import type { Journey, JourneyPage, JourneyStep, PageCapture } from '../../src/types';
import type { JourneyStepConfig, ProjectConfig } from '../config/schema';
import { ensureDir, log } from '../lib/util';
import {
	AUTO_SCROLL,
	FIND_HEADER,
	FIND_LINKS,
	FIND_MENU_TOGGLE,
	FIND_TRIGGERS,
	HIDE_OVERLAYS,
	IS_CLICKABLE,
	RESTORE,
	sanitizeCss,
	STYLE_SIGNATURE,
	TARGET_INFO,
	WAIT_IMAGES,
} from './page-scripts';

type Viewport = 'desktop' | 'mobile';
type LinkCandidate = { selector: string; text: string; path: string; samePage: boolean; score: number; contact: boolean };

export type CapturePageFn = (page: Page, vp: Viewport, dir: string, rel: string) => Promise<PageCapture>;

// Default walkthroughs when the config says "auto", per template. Each abstract step is
// resolved against the live page; steps that cannot be resolved are skipped with a warning.
const AUTO: Record<TemplateId, Record<Viewport, JourneyStepConfig[]>> = {
	'v2-stable': {
		desktop: [
			{ do: 'scroll', to: 'best' },
			{ do: 'link', scope: 'header', prefer: 'services' },
			{ do: 'scroll', to: 'best' },
			{ do: 'link', scope: 'header', prefer: 'projects' },
			{ do: 'scroll', to: 'best' },
		],
		mobile: [
			{ do: 'scroll', to: 'best' },
			{ do: 'menu' },
			{ do: 'link', scope: 'menu', prefer: 'services' },
			{ do: 'scroll', to: 'best' },
			{ do: 'link', scope: 'page', prefer: 'contact' },
			{ do: 'scroll', to: 'section:contact' },
		],
	},
	// More, shorter beats: a cut to a further section, a specific service page, a quick projects stop.
	'v3-dynamic': {
		desktop: [
			{ do: 'scroll', to: 'best' },
			{ do: 'cut', to: 'far' },
			{ do: 'link', scope: 'header', prefer: 'services', depth: 'detail' },
			{ do: 'scroll', to: 'best' },
			{ do: 'link', scope: 'header', prefer: 'projects' },
			{ do: 'scroll', to: '+420' },
		],
		mobile: [
			{ do: 'scroll', to: '+520' },
			{ do: 'menu' },
			{ do: 'link', scope: 'menu', prefer: 'services', depth: 'detail' },
			{ do: 'scroll', to: '+460' },
			{ do: 'link', scope: 'page', prefer: 'contact' },
			{ do: 'scroll', to: 'section:contact' },
		],
	},
};

/** The automatic walkthrough for a template, kind and device. */
const autoPlan = (config: ProjectConfig, vp: Viewport): JourneyStepConfig[] => {
	const base = AUTO[config.template][vp];
	switch (config.project.kind) {
		case 'branding':
			// A brand book or brand site is a long document: scroll, then cut through its sections.
			return [
				{ do: 'scroll', to: 'best' },
				{ do: 'cut', to: 'far' },
				{ do: 'scroll', to: '+600' },
				{ do: 'cut', to: 'far' },
				{ do: 'scroll', to: '+600' },
			];
		case 'automation':
			// An automation crosses several apps: it has to be scripted (goto, type, click, wait).
			return [{ do: 'scroll', to: 'best' }];
		default:
			return base;
	}
};

const PREFER = {
	services: /servic|what we do|solution|product|shop|menu|offer/i,
	projects: /project|portfolio|our work|case stud|gallery|obras/i,
	about: /about|team|story|quality|sobre/i,
	contact: /contact|get in touch|quote|proposal|book|enquir|contacto/i,
} satisfies Record<string, RegExp>;

const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const ensureSanitize = async (page: Page, config: ProjectConfig) => {
	await page.evaluate(
		`(() => { if (document.getElementById('__wse_sanitize')) return; const s = document.createElement('style'); s.id = '__wse_sanitize'; s.textContent = ${JSON.stringify(
			sanitizeCss(config.capture.hide, config.capture.blur),
		)}; document.head.appendChild(s); })()`,
	);
};

/** After a navigation: wait for the new page, load lazy content, hide overlays, end at the top. */
export const settle = async (page: Page, config: ProjectConfig, warnings: string[]) => {
	await page.waitForLoadState('load', { timeout: 30_000 }).catch(() => undefined);
	await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
	await ensureSanitize(page, config);
	if (config.capture.waitForSelector) await page.waitForSelector(config.capture.waitForSelector, { timeout: 20_000 }).catch(() => undefined);
	await page.evaluate('document.fonts.ready');
	await page.evaluate(HIDE_OVERLAYS);
	await page.evaluate(`${AUTO_SCROLL}(${config.capture.maxPageHeight})`);
	const missing = (await page.evaluate(`${WAIT_IMAGES}(12000)`)) as number;
	if (missing > 0) warnings.push(`${new URL(page.url()).pathname}: ${missing} image(s) had not loaded`);
	await page.evaluate(HIDE_OVERLAYS);
	await page.waitForTimeout(config.capture.extraWaitMs);
};

/**
 * Run a real browsing session and record it. Every page the session lands on is
 * captured in full (tiles + sections); every click/tap records the site's own
 * response frame by frame, with CSS/WAAPI motion slowed so transitions can be sampled.
 */
export const recordJourney = async (opts: {
	page: Page;
	context: BrowserContext;
	vp: Viewport;
	config: ProjectConfig;
	outDir: string;
	steps: JourneyStepConfig[] | 'auto';
	capturePage: CapturePageFn;
	warnings: string[];
}): Promise<Journey> => {
	const { page, context, vp, config, warnings } = opts;
	const base = ensureDir(path.join(opts.outDir, vp));
	const vh = config.capture[vp].height;
	const vw = config.capture[vp].width;
	const pages: JourneyPage[] = [];
	const steps: JourneyStep[] = [];
	const visited = new Set<string>();
	let current = 0;
	let scrollY = 0;
	let overlay = false;
	let n = 0;

	const pathname = () => new URL(page.url()).pathname.replace(/\/$/, '') || '/';
	let startHost: string | null = null;
	/** Pages on another site than the one the session started on keep their (labelled) host. */
	const hostHere = () => {
		const host = new URL(page.url()).host;
		if (startHost === null) startHost = host;
		return host === startHost ? null : (config.capture.hostLabels[host] ?? host.replace(/^www\./, ''));
	};
	const shot = async (dir: string, name: string) => {
		const file = path.join(dir, `${name}.jpg`);
		await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
		return `project/capture/${vp}/${path.relative(base, dir).replace(/\\/g, '/')}/${name}.jpg`;
	};
	const capturePageHere = async () => {
		const idx = pages.length;
		const pc = await opts.capturePage(page, vp, path.join(base, `p${idx}`), `project/capture/${vp}/p${idx}`);
		await page.evaluate(RESTORE);
		const title = (await page.title()) || pathname();
		pages.push({ ...pc, path: pathname(), title, host: hostHere() });
		visited.add(pathname());
		await page.evaluate(`window.scrollTo({ top: 0, behavior: 'instant' })`);
		log.info(`${vp}: page ${idx} ${pathname()} (${pc.pageHeight}px, ${pc.sections.length} sections)`);
		return idx;
	};
	const scrollTo = async (y: number) => {
		await page.evaluate(`window.scrollTo({ top: ${Math.round(y)}, behavior: 'instant' })`);
		await page.waitForTimeout(260);
		return (await page.evaluate('Math.round(window.scrollY)')) as number;
	};

	const findLink = async (scope: 'header' | 'any', text?: string, prefer?: keyof typeof PREFER, depth: 'overview' | 'detail' = 'overview') => {
		const links = ((await page.evaluate(`${FIND_LINKS}(${JSON.stringify(scope)})`)) as LinkCandidate[]).filter((l) => !l.samePage && !visited.has(l.path));
		if (text) return links.find((l) => l.text.toLowerCase().includes(text.toLowerCase()) || l.path === text) ?? null;
		if (prefer) {
			const m = links.filter((l) => PREFER[prefer].test(`${l.text} ${l.path}`));
			if (depth === 'detail') {
				// A specific page under the section (/services/welders), first in the menu's own order.
				const segs = (p: string) => p.split('/').filter(Boolean).length;
				const deepest = Math.max(0, ...m.map((l) => segs(l.path)));
				const detail = m.filter((l) => segs(l.path) === deepest && deepest > Math.min(...m.map((x) => segs(x.path))));
				if (detail.length) return detail[0];
			}
			// Otherwise prefer the overview page (shortest path), e.g. /services over /services/welders.
			return m.sort((a, b) => b.score - a.score || a.path.length - b.path.length)[0] ?? null;
		}
		return links.find((l) => l.score > 0) ?? null;
	};

	/** Perform one real action and record it as a step. Returns false if nothing happened. */
	const act = async (id: string, selector: string, kind: 'click' | 'tap' | 'hover', label: string, waitMs?: number) => {
		const actionPage = current;
		const res = await performAction({ page, context, vp, selector, kind, id, label, dir: ensureDir(path.join(base, 'steps', id)), shot, overlay, vw, vh, waitMs: waitMs ?? 900 });
		if (!res) {
			warnings.push(`${id}: ${kind} on ${selector} did not change anything; skipped`);
			return false;
		}
		const actionScroll = res.scrollY;
		let result: { page: number; scrollY: number } | null = null;
		if (res.navigated) {
			await settle(page, config, warnings);
			// The settled state of the new page is the last frame of the action.
			res.frames[res.frames.length - 1] = { src: await shot(res.dir, 'after'), t: 1 };
			const idx = await capturePageHere();
			result = { page: idx, scrollY: 0 };
			current = idx;
			scrollY = 0;
			overlay = false;
		} else if (res.scrolled !== null) {
			result = { page: current, scrollY: res.scrolled };
			scrollY = res.scrolled;
			overlay = false;
		} else {
			// The page changed in place (menu, dropdown, dialog): later actions start from this state.
			overlay = true;
			scrollY = actionScroll;
		}
		steps.push({
			id,
			kind: 'action',
			action: kind,
			label,
			page: actionPage,
			scrollY: actionScroll,
			target: res.target,
			before: res.before,
			hover: res.hover,
			frames: res.frames,
			durationMs: res.durationMs,
			result,
		});
		log.ok(`${vp}: ${kind} "${label}"${res.navigated ? ` → ${pathname()}` : overlay ? ' (overlay open)' : ''}`);
		return true;
	};

	current = await capturePageHere();

	const plan = opts.steps === 'auto' ? autoPlan(config, vp) : opts.steps;
	if (opts.steps === 'auto' && config.project.kind === 'automation')
		warnings.push(`${vp}: automations need a scripted journey (goto, type, click, wait); "auto" only scrolls the first page`);
	for (const step of plan) {
		const id = step.id ?? `${vp}-${++n}`;
		try {
			if (step.do === 'scroll') {
				if (overlay) {
					warnings.push(`${id}: cannot scroll while a menu/overlay is open; skipped`);
					continue;
				}
				const target = resolveScroll(pages[current], step.to, scrollY, vh);
				if (target === null || Math.abs(target - scrollY) < 40) {
					warnings.push(`${id}: scroll target "${String(step.to)}" gave no movement; skipped`);
					continue;
				}
				const to = await scrollTo(target);
				steps.push({ id, kind: 'scroll', label: step.label ?? `scroll ${pages[current].path}`, page: current, from: scrollY, to });
				scrollY = to;
				continue;
			}
			if (step.do === 'wait') {
				await page.waitForTimeout(step.ms);
				continue;
			}
			if (step.do === 'type') {
				const actionPage = current;
				const res = await performType({ page, vp, selector: step.selector, text: step.text, dir: ensureDir(path.join(base, 'steps', id)), shot, vw, vh, overlay });
				if (!res) {
					warnings.push(`${id}: no visible field ${step.selector}; skipped`);
					continue;
				}
				overlay = true;
				scrollY = res.scrollY;
				steps.push({
					id,
					kind: 'action',
					action: 'type',
					label: step.label ?? `type ${step.selector}`,
					page: actionPage,
					scrollY: res.scrollY,
					target: res.target,
					before: res.before,
					hover: null,
					frames: res.frames,
					durationMs: res.durationMs,
					result: null,
				});
				if (step.waitMs) await page.waitForTimeout(step.waitMs);
				log.ok(`${vp}: typed into ${step.selector}`);
				continue;
			}
			if (step.do === 'cut') {
				if (overlay) {
					warnings.push(`${id}: cannot cut while a menu/overlay is open; skipped`);
					continue;
				}
				const to = step.to ?? 'far';
				const target = resolveScroll(pages[current], to, scrollY, vh);
				if (target === null || Math.abs(target - scrollY) < vh * 0.5) {
					warnings.push(`${id}: cut target "${String(to)}" is too close to the current view; skipped`);
					continue;
				}
				const y = await scrollTo(target);
				steps.push({ id, kind: 'cut', label: step.label ?? `cut ${pages[current].path}`, page: current, scrollY: y });
				log.ok(`${vp}: cut to ${y}px on ${pages[current].path}`);
				scrollY = y;
				continue;
			}
			if (step.do === 'goto') {
				const url = new URL(step.path, page.url()).toString();
				await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
				await settle(page, config, warnings);
				current = await capturePageHere();
				scrollY = 0;
				overlay = false;
				steps.push({ id, kind: 'cut', label: step.label ?? step.path, page: current, scrollY: 0 });
				continue;
			}

			// Actions: resolve a selector, then act on it for real.
			const defaultKind: 'click' | 'tap' = vp === 'mobile' ? 'tap' : 'click';
			if (step.do === 'menu') {
				await page.evaluate(FIND_HEADER);
				const selector = (await page.evaluate(FIND_MENU_TOGGLE)) as string | null;
				if (!selector) {
					warnings.push(`${id}: no menu button found; skipped`);
					continue;
				}
				await act(id, selector, defaultKind, step.label ?? 'Menu', step.waitMs);
			} else if (step.do === 'link') {
				const scope = step.scope === 'header' ? 'header' : 'any';
				const depth = step.depth ?? 'overview';
				// A specific header page usually sits in a dropdown: open it first rather than taking a plain link.
				const viaDropdown = scope === 'header' && Boolean(step.via || depth === 'detail');
				let pick = viaDropdown ? null : await findLink(scope, step.text, step.prefer, depth);
				// Not visible? It may sit in a header dropdown: open it for real, then look again.
				if (!pick && scope === 'header' && !overlay) {
					const pattern = step.via ? escapeRe(step.via) : step.text ? escapeRe(step.text) : step.prefer ? PREFER[step.prefer].source : null;
					const triggers = pattern ? ((await page.evaluate(`${FIND_TRIGGERS}(${JSON.stringify(pattern)})`)) as { selector: string; text: string }[]) : [];
					if (triggers[0] && (await act(`${id}-open`, triggers[0].selector, vp === 'desktop' ? 'hover' : 'tap', triggers[0].text, 700))) {
						pick = await findLink('any', step.text, step.prefer, depth);
					} else if (viaDropdown) {
						// No dropdown on this site: a plain header link is fine.
						pick = await findLink(scope, step.text, step.prefer, depth);
					}
				}
				if (!pick) {
					warnings.push(`${id}: no visible link for ${step.text ?? step.prefer ?? 'navigation'} (${scope}); skipped`);
					continue;
				}
				await act(id, pick.selector, defaultKind, step.label ?? pick.text, step.waitMs);
			} else if (step.do === 'click' || step.do === 'tap' || step.do === 'hover') {
				await act(id, step.selector, step.do, step.label ?? step.do, step.waitMs);
			}
		} catch (e) {
			warnings.push(`${id}: ${(e as Error).message.split('\n')[0]}`);
		}
	}
	return { viewport: vp, pages, steps };
};

/** Turn a scroll target spec into a page-space scroll position. */
const resolveScroll = (page: JourneyPage, to: string | number, from: number, vh: number): number | null => {
	const max = Math.max(0, page.pageHeight - vh);
	const header = page.header?.height ?? 0;
	const clamp = (y: number) => Math.max(0, Math.min(max, Math.round(y)));
	if (typeof to === 'number') return clamp(to <= 1 ? to * max : to);
	if (to === 'bottom') return max;
	if (to.startsWith('+') || to.startsWith('-')) return clamp(from + Number(to));
	if (to.endsWith('%')) return clamp((Number(to.slice(0, -1)) / 100) * max);
	const sections = page.sections.filter((s) => s.kind !== 'hero' && s.kind !== 'footer');
	if (to === 'far') {
		// The strongest section beyond what a normal scroll would reach: worth an edit cut.
		const beyond = sections.filter((s) => s.top > from + vh * 1.5).sort((a, b) => b.score - a.score);
		return beyond[0] ? clamp(beyond[0].top - header - 24) : null;
	}
	if (to.startsWith('heading:')) {
		const q = to.slice(8).trim().toLowerCase();
		const s = page.sections.find((x) => (x.label ?? '').toLowerCase().includes(q));
		return s ? clamp(s.top - header - 24) : null;
	}
	if (to === 'best') {
		// The strongest section within about two screens, so scrolls stay readable on camera.
		const reach = from + Math.max(1200, vh * 1.7);
		const ahead = sections.filter((s) => s.top > from + vh * 0.25);
		const near = ahead.filter((s) => s.top - header - 24 <= reach).sort((a, b) => b.score - a.score);
		const s = near[0] ?? ahead.sort((a, b) => a.top - b.top)[0];
		if (!s) return clamp(from + vh * 0.9);
		return clamp(Math.min(s.top - header - 24, reach));
	}
	if (to.startsWith('section:')) {
		const kind = to.slice(8);
		const s = page.sections.find((x) => x.kind === kind || x.id === kind);
		return s ? clamp(s.top - header - 24) : null;
	}
	const s = page.sections.find((x) => x.selector === to || x.id === to);
	return s ? clamp(s.top - header - 24) : null;
};

/**
 * Type into a real field, the way a visitor would: bring it into view, click or tap it,
 * then type, screenshotting as the text appears. Use demo data only.
 */
const performType = async (o: {
	page: Page;
	vp: Viewport;
	selector: string;
	text: string;
	dir: string;
	shot: (dir: string, name: string) => Promise<string>;
	vw: number;
	vh: number;
	overlay: boolean;
}) => {
	const { page, selector } = o;
	const el = page.locator(selector).first();
	if (!(await el.count())) return null;
	if (!(await page.evaluate(`${IS_CLICKABLE}(${JSON.stringify(selector)})`))) {
		await el.scrollIntoViewIfNeeded().catch(() => undefined);
		await page.waitForTimeout(300);
	}
	const box = await el.boundingBox();
	if (!box) return null;
	const scrollY = (await page.evaluate('Math.round(window.scrollY)')) as number;
	if (o.vp === 'desktop' && !o.overlay) await page.mouse.move(o.vw - 3, o.vh - 3);
	const before = await o.shot(o.dir, 'before');
	if (o.vp === 'mobile') await el.tap({ timeout: 5000 });
	else await el.click({ timeout: 5000 });
	const frames: { src: string; t: number }[] = [{ src: before, t: 0 }];
	const chunks = Math.min(8, Math.max(2, Math.ceil(o.text.length / 4)));
	const size = Math.ceil(o.text.length / chunks);
	for (let i = 0; i < chunks; i++) {
		await el.pressSequentially(o.text.slice(i * size, (i + 1) * size), { delay: 25 });
		frames.push({ src: await o.shot(o.dir, `f${i + 1}`), t: (i + 1) / chunks });
	}
	frames[frames.length - 1].t = 1;
	return {
		scrollY,
		target: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(Math.min(box.width, 240)), height: Math.round(box.height) },
		before,
		frames,
		// Typing plays at a natural pace: about 16 characters a second, between 0.6 and 2.4 s.
		durationMs: Math.round(Math.min(2400, Math.max(600, o.text.length * 62))),
	};
};

const performAction = async (o: {
	page: Page;
	context: BrowserContext;
	vp: Viewport;
	selector: string;
	kind: 'click' | 'tap' | 'hover';
	id: string;
	label: string;
	dir: string;
	shot: (dir: string, name: string) => Promise<string>;
	overlay: boolean;
	vw: number;
	vh: number;
	waitMs: number;
}) => {
	const { page, selector } = o;
	// Bring the target into view the way a visitor would (unless an overlay is open).
	if (!(await page.evaluate(`${IS_CLICKABLE}(${JSON.stringify(selector)})`))) {
		if (o.overlay) return null;
		const info = (await page.evaluate(`${TARGET_INFO}(${JSON.stringify({ selector, scrollTo: null })})`)) as { scrollY: number } | null;
		if (!info) return null;
		await page.evaluate(`window.scrollTo({ top: ${info.scrollY}, behavior: 'instant' })`);
		await page.waitForTimeout(300);
		if (!(await page.evaluate(`${IS_CLICKABLE}(${JSON.stringify(selector)})`))) return null;
	}
	const scrollY = (await page.evaluate('Math.round(window.scrollY)')) as number;
	const el = page.locator(selector).first();
	const elBox = await el.boundingBox();
	if (!elBox) return null;
	// Aim at the label itself (a finger or cursor goes to the words, not the middle of a wide row).
	const textBox = (await page.evaluate(
		`((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = document.createRange(); r.selectNodeContents(el); const b = r.getBoundingClientRect(); return b.width > 4 && b.height > 4 && b.width <= el.getBoundingClientRect().width + 2 ? { x: b.left, y: b.top, width: b.width, height: b.height } : null; })(${JSON.stringify(selector)})`,
	)) as { x: number; y: number; width: number; height: number } | null;
	const box = textBox && textBox.width * textBox.height > 30 ? textBox : elBox;
	// Park the pointer away from the target, unless an open dropdown/menu needs it to stay inside.
	if (o.vp === 'desktop' && !o.overlay) await page.mouse.move(o.vw - 3, o.vh - 3);
	await page.waitForTimeout(250);
	const signature = (await page.evaluate(`${STYLE_SIGNATURE}(null)`)) as string;
	const before = await o.shot(o.dir, 'before');
	let hover: string | null = null;
	if (o.vp === 'desktop' && o.kind === 'click') {
		await el.hover({ timeout: 5000 });
		await page.waitForTimeout(450);
		hover = await o.shot(o.dir, 'hover');
	}

	const urlBefore = page.url();
	const cdp = await o.context.newCDPSession(page);
	await cdp.send('Animation.enable');
	const rate = 0.08;
	await cdp.send('Animation.setPlaybackRate', { playbackRate: rate });
	const started = Date.now();
	if (o.kind === 'tap') await el.tap({ timeout: 5000, noWaitAfter: true });
	else if (o.kind === 'click') await el.click({ timeout: 5000, noWaitAfter: true });
	else await el.hover({ timeout: 5000 });
	await page.waitForTimeout(80);
	const animMs = (await page
		.evaluate(
			`Math.max(0, ...document.getAnimations().map((a) => { const t = a.effect && a.effect.getComputedTiming(); if (!t) return 0; const d = Number(t.activeDuration); return Number.isFinite(d) ? (t.delay || 0) + d : 0; }).filter((x) => x < 4000))`,
		)
		.catch(() => 0)) as number;
	const frames: { src: string; t: number }[] = [{ src: hover ?? before, t: 0 }];
	const realMs = Math.min(9000, Math.max(250, animMs / rate));
	const middle = animMs > 40 ? 6 : 0;
	for (let i = 1; i <= middle; i++) {
		const due = started + (realMs * i) / (middle + 1);
		const wait = due - Date.now();
		if (wait > 0) await page.waitForTimeout(wait);
		frames.push({ src: await o.shot(o.dir, `f${i}`), t: Math.min(0.97, (Date.now() - started) / realMs) });
	}
	await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 }).catch(() => undefined);
	await cdp.detach().catch(() => undefined);
	await page.waitForTimeout(o.waitMs);
	frames.push({ src: await o.shot(o.dir, 'after'), t: 1 });

	const navigated = new URL(page.url()).pathname !== new URL(urlBefore).pathname;
	const newScroll = (await page.evaluate('Math.round(window.scrollY)')) as number;
	const scrolled = !navigated && Math.abs(newScroll - scrollY) > 40 ? newScroll : null;
	const changed = navigated || scrolled !== null || signature !== ((await page.evaluate(`${STYLE_SIGNATURE}(null)`)) as string);
	if (!changed) return null;
	return {
		dir: o.dir,
		scrollY,
		target: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) },
		before,
		hover,
		frames,
		durationMs: Math.round(Math.max(animMs, 160)),
		navigated,
		scrolled,
	};
};
