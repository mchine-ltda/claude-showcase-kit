import fs from 'node:fs';
import path from 'node:path';
import type { CaptureManifest, Journey, JourneyStep, PageCapture } from '../../src/types';
import { ensureDir, imageSize, log, writeJson } from '../lib/util';
import { launchBrowser } from './browser';

/**
 * Fallback input: build a capture from screenshots/recordings the user supplies
 * (e.g. a site behind a login, or a design exported from Figma). Full-page
 * images are re-tiled losslessly through a headless page at their native
 * device scale; recordings are copied and played inside the device frame.
 */
export const importManual = async (opts: {
	dir: string;
	url: string;
	desktop?: string;
	desktopWidth: number;
	desktopViewportHeight: number;
	mobile?: string;
	mobileWidth: number;
	mobileViewportHeight: number;
	desktopRecording?: string;
	mobileRecording?: string;
}) => {
	const outDir = ensureDir(path.join(opts.dir, 'capture'));
	const manifest: CaptureManifest = {
		version: 1,
		source: 'manual',
		url: opts.url,
		capturedAt: new Date().toISOString(),
		title: '',
		description: '',
		brand: { accent: null, background: null, text: null, headingFont: null, themeColor: null },
		desktop: null,
		mobile: null,
		interactions: [],
		journeys: { desktop: null, mobile: null },
		warnings: ['Manual import: sections are evenly spaced bands. Edit capture/manifest.json to name them precisely.'],
	};
	const journeys: Record<'desktop' | 'mobile', Journey | null> = { desktop: null, mobile: null };
	const browser = await launchBrowser();
	try {
		for (const vp of ['desktop', 'mobile'] as const) {
			const image = vp === 'desktop' ? opts.desktop : opts.mobile;
			const recording = vp === 'desktop' ? opts.desktopRecording : opts.mobileRecording;
			const cssWidth = vp === 'desktop' ? opts.desktopWidth : opts.mobileWidth;
			const vh = vp === 'desktop' ? opts.desktopViewportHeight : opts.mobileViewportHeight;
			if (!image && !recording) continue;
			const vpDir = ensureDir(path.join(outDir, vp));
			for (const f of fs.readdirSync(vpDir)) fs.rmSync(path.join(vpDir, f), { recursive: true });
			let page: PageCapture = {
				viewport: { width: cssWidth, height: vh, deviceScaleFactor: 1 },
				pageHeight: vh,
				tiles: [],
				header: null,
				background: '#ffffff',
				sections: [],
				heroHeadline: null,
				recording: null,
			};
			if (image) {
				const abs = path.resolve(image);
				const { width, height } = imageSize(abs);
				const dpr = width / cssWidth;
				const pageHeight = Math.round(height / dpr);
				const ctx = await browser.newContext({ viewport: { width: cssWidth, height: vh }, deviceScaleFactor: dpr });
				const p = await ctx.newPage();
				const data = fs.readFileSync(abs).toString('base64');
				const mime = /\.jpe?g$/i.test(abs) ? 'image/jpeg' : 'image/png';
				await p.setContent(`<style>html,body{margin:0;background:#fff}img{display:block;width:${cssWidth}px;height:${pageHeight}px}</style><img src="data:${mime};base64,${data}">`);
				await p.waitForFunction('document.images[0] && document.images[0].complete');
				const TILE = 1600;
				for (let y = 0, i = 0; y < pageHeight; y += TILE, i++) {
					const h = Math.min(TILE, pageHeight - y);
					const file = `tile-${String(i).padStart(2, '0')}.png`;
					await p.screenshot({ path: path.join(vpDir, file), fullPage: true, clip: { x: 0, y, width: cssWidth, height: h } });
					page.tiles.push({ src: `project/capture/${vp}/${file}`, y, height: h });
				}
				await ctx.close();
				const bands = Math.max(1, Math.min(6, Math.floor(pageHeight / vh)));
				page = {
					...page,
					viewport: { width: cssWidth, height: vh, deviceScaleFactor: dpr },
					pageHeight,
					sections: Array.from({ length: bands }, (_, i) => ({
						id: `s${i + 1}`,
						kind: i === 0 ? ('hero' as const) : ('content' as const),
						label: i === 0 ? 'Hero' : `Section ${i + 1}`,
						top: Math.round((pageHeight / bands) * i),
						height: Math.round(pageHeight / bands),
						score: i === 0 ? 0.5 : 0.6,
						selector: null,
						heading: null,
						focus: null,
					})),
				};
				log.ok(`${vp}: ${page.tiles.length} tiles from ${path.basename(abs)} (${width}×${height}, ${dpr.toFixed(2)}x)`);
			}
			if (recording) {
				const ext = path.extname(recording).toLowerCase();
				fs.copyFileSync(path.resolve(recording), path.join(vpDir, `recording${ext}`));
				page.recording = { src: `project/capture/${vp}/recording${ext}`, durationSeconds: 0 };
				log.ok(`${vp}: recording ${path.basename(recording)}`);
			}
			manifest[vp] = page;
			// A one-page walkthrough: a natural scroll through the screenshot (a recording simply plays).
			const travel = Math.min(Math.max(0, page.pageHeight - vh), Math.round(vh * 1.6));
			const steps: JourneyStep[] = page.tiles.length && travel > 40 ? [{ id: `${vp}-scroll`, kind: 'scroll', label: 'scroll', page: 0, from: 0, to: travel }] : [];
			journeys[vp] = { viewport: vp, pages: [{ ...page, path: '/', title: '' }], steps };
		}
	} finally {
		await browser.close();
	}
	manifest.journeys = journeys;
	writeJson(path.join(outDir, 'manifest.json'), manifest);
	return manifest;
};
