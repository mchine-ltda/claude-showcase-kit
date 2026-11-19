import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright';
import type { CaptureManifest, Journey, PageCapture, PageSection } from '../../src/types';
import { kindOf } from '../config/kinds';
import type { ProjectConfig } from '../config/schema';
import { ensureDir, log, sleep, writeJson } from '../lib/util';
import { launchBrowser, MOBILE_UA } from './browser';
import { ensureSanitize, recordJourney } from './journey';
import {
	ANALYZE,
	AUTO_SCROLL,
	BRAND,
	FIND_HEADER,
	FREEZE_TRACKED,
	HEADER_STILL_PINNED,
	HIDE_FOR_TILES,
	HIDE_OVERLAYS,
	OPAQUE_HEADER,
	WAIT_IMAGES,
} from './page-scripts';
import { serveStatic } from './static-server';

const TILE_CSS_HEIGHT = 1600;

type Viewport = 'desktop' | 'mobile';

/**
 * Capture a website for the showcase template by recording real browsing
 * sessions (journeys) on desktop and mobile:
 *  - every page the session lands on: full-page tiles at 2x/3x, pinned header layer,
 *    section analysis and the hero headline,
 *  - every click/tap: before/hover states and the site's own response, sampled frame by
 *    frame with its CSS/WAAPI motion slowed,
 *  - brand colours, heading font and the canonical domain.
 * Fresh browser contexts are used: no cookies, sessions or credentials.
 */
export const captureProject = async (opts: { dir: string; config: ProjectConfig; only?: Viewport }) => {
	const { dir, config } = opts;
	const outDir = path.join(dir, 'capture');
	const site = await resolveSite(config, dir);
	const startUrl = new URL(config.capture.startPath || '/', site.url).toString();
	log.step(`Capturing ${startUrl}`);
	const browser = await launchBrowser();
	const warnings: string[] = [];
	const previous = readPrevious(outDir);
	try {
		const devices = config.capture.devices ?? kindOf(config.project.kind).devices;
		const viewports: Viewport[] = opts.only ? [opts.only] : devices;
		for (const vp of viewports) fs.rmSync(path.join(outDir, vp), { recursive: true, force: true });
		fs.rmSync(path.join(outDir, 'interactions'), { recursive: true, force: true });

		const journeys: Partial<Record<Viewport, Journey>> = {};
		let brand: CaptureManifest['brand'] = previous?.brand ?? { accent: null, background: null, text: null, headingFont: null, themeColor: null };
		let title = previous?.title ?? '';
		let description = previous?.description ?? '';
		let canonicalHost = previous?.canonicalHost ?? null;

		for (const vp of viewports) {
			log.step(`${vp}: recording walkthrough`);
			const { context, page } = await openPage(browser, config, vp, dir);
			try {
				await loadReady(page, startUrl, config, warnings);
				if (vp === 'desktop') {
					const b = (await page.evaluate(BRAND)) as CaptureManifest['brand'] & { title: string; description: string };
					brand = { accent: b.accent, background: b.background, text: b.text, headingFont: b.headingFont, themeColor: b.themeColor };
					title = b.title;
					description = b.description;
					canonicalHost = (await page.evaluate(
						`(() => { const l = document.querySelector('link[rel="canonical"]') || document.querySelector('meta[property="og:url"]'); const v = l && (l.getAttribute('href') || l.getAttribute('content')); try { return v ? new URL(v).hostname.replace(/^www\\./, '') : null; } catch (e) { return null; } })()`,
					)) as string | null;
				}
				const plan = config.capture.journeys === 'auto' ? 'auto' : config.capture.journeys[vp];
				journeys[vp] = await recordJourney({
					page,
					context,
					vp,
					config,
					outDir,
					steps: plan,
					warnings,
					capturePage: (p, v, d, rel) => capturePage(p, config, v, d, rel, warnings),
				});
				const j = journeys[vp]!;
				log.ok(`${vp}: ${j.pages.length} page(s), ${j.steps.length} step(s)`);
			} finally {
				await context.close();
			}
		}

		// A device the project no longer shows is dropped; a device not recaptured this time is kept.
		const keep = (vp: Viewport) => (devices.includes(vp) ? (journeys[vp] ?? previous?.journeys?.[vp] ?? null) : null);
		const manifest: CaptureManifest = {
			version: 1,
			source: 'playwright',
			url: site.publicUrl,
			capturedAt: new Date().toISOString(),
			title,
			description,
			brand,
			desktop: keep('desktop')?.pages[0] ?? null,
			mobile: keep('mobile')?.pages[0] ?? null,
			interactions: [],
			journeys: { desktop: keep('desktop'), mobile: keep('mobile') },
			canonicalHost,
			warnings,
		};
		writeJson(path.join(outDir, 'manifest.json'), manifest);
		writeReport(outDir, manifest);
		for (const w of warnings) log.warn(w);
		log.ok(`Capture saved to ${path.relative(process.cwd(), outDir) || outDir}`);
		return manifest;
	} finally {
		await browser.close();
		await site.close();
	}
};

const readPrevious = (outDir: string): CaptureManifest | null => {
	const f = path.join(outDir, 'manifest.json');
	return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as CaptureManifest) : null;
};

/** Where to load the site from: a static folder we serve, a start command, or the URL itself. */
const resolveSite = async (config: ProjectConfig, dir: string) => {
	const src = config.source;
	if (src.serve) {
		const root = path.resolve(dir, src.serve);
		const server = await serveStatic(root);
		log.info(`serving ${root} at ${server.url}`);
		return { url: server.url, publicUrl: config.project.url || server.url, close: server.close };
	}
	if (src.start) {
		const child = startCommand(src.start.command, path.resolve(dir, src.start.cwd));
		await waitForUrl(src.start.url, src.start.timeoutSeconds * 1000);
		return { url: src.start.url, publicUrl: config.project.url || src.start.url, close: async () => killTree(child) };
	}
	if (!config.project.url) throw new Error('No source: set project.url, source.serve or source.start in showcase.config.json');
	return { url: config.project.url, publicUrl: config.project.url, close: async () => undefined };
};

const startCommand = (command: string, cwd: string) => {
	log.info(`starting: ${command} (in ${cwd})`);
	return spawn(command, { cwd, shell: true, stdio: 'ignore', detached: process.platform !== 'win32' });
};

const killTree = (child: ChildProcess) => {
	if (!child.pid) return;
	try {
		if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
		else process.kill(-child.pid, 'SIGTERM');
	} catch {
		// already gone
	}
};

const waitForUrl = async (url: string, timeoutMs: number) => {
	const until = Date.now() + timeoutMs;
	while (Date.now() < until) {
		try {
			const res = await fetch(url, { redirect: 'manual' });
			if (res.status < 500) return;
		} catch {
			// not up yet
		}
		await sleep(800);
	}
	throw new Error(`Site did not respond at ${url} within ${Math.round(timeoutMs / 1000)}s`);
};

const openPage = async (browser: Browser, config: ProjectConfig, vp: Viewport, dir: string): Promise<{ context: BrowserContext; page: Page }> => {
	const v = config.capture[vp];
	// A saved demo-account session (showcase login) for web apps and automations; otherwise a fresh, empty profile.
	const auth = config.capture.auth ? path.resolve(dir, config.capture.auth) : null;
	if (auth && !fs.existsSync(auth)) throw new Error(`capture.auth points to ${auth}, which does not exist. Run: showcase login <project>`);
	const context = await browser.newContext({
		storageState: auth ?? undefined,
		viewport: { width: v.width, height: v.height },
		deviceScaleFactor: v.deviceScaleFactor,
		isMobile: vp === 'mobile',
		hasTouch: vp === 'mobile',
		userAgent: vp === 'mobile' ? MOBILE_UA : undefined,
		reducedMotion: config.capture.reducedMotion ? 'reduce' : 'no-preference',
		colorScheme: 'light',
		locale: 'en-IE',
		timezoneId: 'Europe/Dublin',
		serviceWorkers: 'block',
		ignoreHTTPSErrors: true,
	});
	const page = await context.newPage();
	page.on('dialog', (d) => d.dismiss().catch(() => undefined));
	return { context, page };
};

const loadReady = async (page: Page, url: string, config: ProjectConfig, warnings: string[]) => {
	const res = await page.goto(url, { waitUntil: 'load', timeout: 90_000 });
	// Never capture an error page as if it were the website.
	if (res && res.status() >= 400) throw new Error(`HTTP ${res.status()} for ${url}: the page is not available, so nothing was captured`);
	await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => warnings.push('network never went idle; captured after 15 s'));
	await ensureSanitize(page, config);
	if (config.capture.waitForSelector) await page.waitForSelector(config.capture.waitForSelector, { timeout: 30_000 });
	await page.evaluate('document.fonts.ready');
	const hidden = (await page.evaluate(HIDE_OVERLAYS)) as string[];
	for (const h of hidden) log.info(`hid ${h}`);
	await page.evaluate(`${AUTO_SCROLL}(${config.capture.maxPageHeight})`);
	const missing = (await page.evaluate(`${WAIT_IMAGES}(15000)`)) as number;
	if (missing > 0) warnings.push(`${missing} image(s) had not loaded when captured`);
	await page.evaluate(HIDE_OVERLAYS);
	await page.waitForTimeout(config.capture.extraWaitMs);
};

const capturePage = async (page: Page, config: ProjectConfig, vp: Viewport, outDir: string, relDir: string, warnings: string[]): Promise<PageCapture> => {
	const v = config.capture[vp];
	const dir = ensureDir(outDir);
	const rel = (f: string) => `${relDir}/${f}`;

	// Pinned header: confirm it stays at the top after scrolling, then capture it alone.
	let header: PageCapture['header'] = null;
	const found = (await page.evaluate(FIND_HEADER)) as { selector: string; height: number } | null;
	if (found) {
		await page.evaluate(`window.scrollTo({ top: Math.min(900, document.documentElement.scrollHeight), behavior: 'instant' })`);
		await page.waitForTimeout(250);
		const pinned = await page.evaluate(HEADER_STILL_PINNED);
		await page.evaluate(`window.scrollTo({ top: 0, behavior: 'instant' })`);
		await page.waitForTimeout(250);
		if (pinned) {
			await page.evaluate(OPAQUE_HEADER);
			await page.screenshot({ path: path.join(dir, 'header.png'), clip: { x: 0, y: 0, width: v.width, height: found.height } });
			header = { src: rel('header.png'), height: found.height };
		} else {
			await page.evaluate(`document.querySelector('[data-wse-header]')?.removeAttribute('data-wse-header')`);
		}
	}

	const analysis = (await page.evaluate(`${ANALYZE}(${JSON.stringify({ maxPageHeight: config.capture.maxPageHeight, overrides: config.capture.sections })})`)) as {
		pageHeight: number;
		sections: PageSection[];
		heroHeadline: PageCapture['heroHeadline'];
		topColor: string;
		background: string;
	};
	if (config.capture.sections.length && analysis.sections.length < config.capture.sections.length) {
		warnings.push(`${vp}: ${config.capture.sections.length - analysis.sections.length} configured section selector(s) matched nothing`);
	}
	if (analysis.pageHeight <= v.height + 40) warnings.push(`${vp} ${new URL(page.url()).pathname}: page fits in one screen, so there is nothing to scroll (if the real page is longer, it scrolls inside a container)`);

	// Freeze motion, hide the header and other floating UI, then tile the page (RESTORE undoes this).
	await page.evaluate(FREEZE_TRACKED);
	await page.evaluate(HIDE_FOR_TILES);
	await page.evaluate(`window.scrollTo({ top: 0, behavior: 'instant' })`);
	await page.waitForTimeout(150);
	const tiles: PageCapture['tiles'] = [];
	for (let y = 0, i = 0; y < analysis.pageHeight; y += TILE_CSS_HEIGHT, i++) {
		const height = Math.min(TILE_CSS_HEIGHT, analysis.pageHeight - y);
		const file = `tile-${String(i).padStart(2, '0')}.png`;
		await page.screenshot({ path: path.join(dir, file), fullPage: true, clip: { x: 0, y, width: v.width, height } });
		tiles.push({ src: rel(file), y, height });
	}
	return {
		viewport: { width: v.width, height: v.height, deviceScaleFactor: v.deviceScaleFactor },
		pageHeight: analysis.pageHeight,
		tiles,
		header,
		background: analysis.background,
		topColor: analysis.topColor,
		sections: analysis.sections,
		heroHeadline: analysis.heroHeadline,
		recording: null,
	};
};

const writeReport = (outDir: string, m: CaptureManifest) => {
	const lines = [`# Capture report`, ``, `- URL: ${m.url}`, `- Captured: ${m.capturedAt}`, `- Title: ${m.title}`, `- Canonical host: ${m.canonicalHost ?? 'none'}`, ``];
	lines.push(`## Brand`, ``, `- Accent: ${m.brand.accent ?? 'not detected'}`, `- Background: ${m.brand.background}`, `- Heading font: ${m.brand.headingFont ?? '?'}`, ``);
	for (const vp of ['desktop', 'mobile'] as const) {
		const j = m.journeys?.[vp];
		if (!j) continue;
		const v = j.pages[0]?.viewport;
		lines.push(`## ${vp} walkthrough (${v?.width}×${v?.height} @${v?.deviceScaleFactor}x)`, ``, `### Steps`, ``);
		for (const st of j.steps) {
			if (st.kind === 'scroll') lines.push(`- \`${st.id}\` scroll p${st.page} ${st.from} → ${st.to}px`);
			else if (st.kind === 'cut') lines.push(`- \`${st.id}\` cut to p${st.page} (${j.pages[st.page]?.path}) at ${st.scrollY}px`);
			else
				lines.push(
					`- \`${st.id}\` ${st.action} "${st.label}" on p${st.page} at ${st.scrollY}px → ${st.result ? (st.result.page !== st.page ? `p${st.result.page} ${j.pages[st.result.page]?.path}` : `scroll ${st.result.scrollY}px`) : 'overlay open'} (${st.frames.length} frames, ${st.durationMs} ms motion)`,
				);
		}
		for (const [i, p] of j.pages.entries()) {
			lines.push('', `### p${i} ${p.path} (${p.pageHeight}px) "${p.title}"`, '');
			lines.push(`| id | kind | label | top | height | score |`, `|---|---|---|---|---|---|`);
			for (const s of p.sections) lines.push(`| ${s.id} | ${s.kind} | ${s.label.replace(/\|/g, '/')} | ${s.top} | ${s.height} | ${s.score} |`);
		}
		lines.push('');
	}
	if (m.warnings.length) lines.push('', '## Warnings', '', ...m.warnings.map((w) => `- ${w}`));
	fs.writeFileSync(path.join(outDir, 'report.md'), lines.join('\n') + '\n');
};
