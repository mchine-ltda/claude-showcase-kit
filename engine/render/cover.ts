import fs from 'node:fs';
import path from 'node:path';
import { FORMATS } from '../../src/layout';
import type { ShowcaseProps } from '../../src/schema';
import { buildTimeline, coverFrameOf } from '../../src/timeline';
import { launchBrowser } from '../capture/browser';
import { ensureDir, log, writeJson } from '../lib/util';
import { renderStills } from './remotion';

/**
 * Export the Instagram cover: the exact video frame chosen as cover (configured, or the
 * moment the cover lockup settles), rendered losslessly from the same composition and
 * props as the MP4, so it is that frame without H.264 softening. Also writes a preview of
 * how it crops in the profile grid (3:4, older 1:1) and how it reads at thumbnail size.
 */
export const exportCover = async (s: { props: ShowcaseProps; propsFile: string; publicDir: string }, outDir: string) => {
	ensureDir(outDir);
	const tl = buildTimeline(s.props, 30);
	const frame = coverFrameOf(s.props, tl);
	const tmp = path.join(outDir, '.cover-render');
	fs.rmSync(tmp, { recursive: true, force: true });
	await renderStills(s.propsFile, s.publicDir, tmp, [frame]);
	const file = path.join(outDir, 'instagram-cover.png');
	fs.copyFileSync(path.join(tmp, `frame-${String(frame).padStart(4, '0')}.png`), file);
	fs.rmSync(tmp, { recursive: true, force: true });
	const preview = await coverPreview(file, path.join(outDir, 'instagram-cover-preview.png'), s.props.format);
	const f = FORMATS[s.props.format];
	writeJson(path.join(outDir, 'instagram-cover.json'), {
		file: path.basename(file),
		frame,
		time: Number((frame / 30).toFixed(3)),
		lockup: Boolean(s.props.cover?.enabled),
		size: `${f.width}x${f.height}`,
		source: 'renderStill of the video composition at the cover frame (same props as the MP4)',
		gridCrops: { '3:4': cropBox(f.width, f.height, 3 / 4), '1:1': cropBox(f.width, f.height, 1) },
	});
	log.ok(`Instagram cover: ${file} (frame ${frame}, ${(frame / 30).toFixed(2)} s)`);
	if (preview) log.info(`grid crop preview: ${preview}`);
	return { file, frame, preview };
};

/** Centre crop of a frame to an aspect (w/h), as the profile grid shows it. */
const cropBox = (w: number, h: number, aspect: number) => {
	const ch = Math.min(h, Math.round(w / aspect));
	const cw = Math.round(ch * aspect);
	return { x: Math.round((w - cw) / 2), y: Math.round((h - ch) / 2), width: cw, height: ch };
};

const coverPreview = async (cover: string, out: string, format: ShowcaseProps['format']) => {
	const f = FORMATS[format];
	const src = 'file:///' + cover.replace(/\\/g, '/');
	const W = 420;
	const k = W / f.width;
	const H = Math.round(f.height * k);
	const box = (aspect: number, color: string, label: string) => {
		const c = cropBox(f.width, f.height, aspect);
		return `<div class="box" style="left:${c.x * k}px;top:${c.y * k}px;width:${c.width * k}px;height:${c.height * k}px;border-color:${color}"><span style="background:${color}">${label}</span></div>`;
	};
	const safe = `<div class="safe" style="left:${f.safe.left * k}px;top:${f.safe.top * k}px;right:${f.safe.right * k}px;bottom:${f.safe.bottom * k}px"></div>`;
	const tile = (w: number, aspect: number) => {
		const h = Math.round(w / aspect);
		return `<div class="tile" style="width:${w}px;height:${h}px;background-image:url('${src}');background-size:${w}px auto"></div>`;
	};
	const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#101012;color:#cfcfcf;font:14px system-ui,sans-serif;padding:24px}
.row{display:flex;gap:28px;align-items:flex-start}
h3{margin:0 0 10px;font-weight:600;color:#fff;font-size:14px}
.frame{position:relative;width:${W}px;height:${H}px;background:url('${src}') 0 0/${W}px ${H}px}
.box{position:absolute;border:2px solid;box-sizing:border-box}
.box span{position:absolute;left:-2px;top:-20px;color:#000;font-size:11px;padding:2px 6px;font-weight:600}
.safe{position:absolute;border:1px dashed rgba(255,255,255,.55)}
.tile{background-position:center center;background-repeat:no-repeat;background-color:#000;border-radius:2px}
.grid{display:grid;grid-template-columns:repeat(3,124px);gap:3px}
small{display:block;margin-top:6px;color:#8a8a8a;max-width:420px;line-height:1.4}
</style>
<div class="row">
 <div><h3>Cover 9:16 (${f.width}×${f.height})</h3><div class="frame">${safe}${box(3 / 4, '#4ad3ff', '3:4 profile grid')}${box(1, '#ffc24a', '1:1 older grid')}</div>
 <small>Dashed: Reels overlay safe area. Blue: the profile grid's 3:4 crop. Yellow: the older 1:1 crop.</small></div>
 <div><h3>Profile grid 3:4</h3>${tile(270, 3 / 4)}<h3 style="margin-top:22px">Square 1:1</h3>${tile(270, 1)}</div>
 <div><h3>At phone grid size</h3><div class="grid">${tile(124, 3 / 4)}${tile(124, 3 / 4)}${tile(124, 3 / 4)}</div>
 <small>One row of a profile at real size, the way a visitor sees the portfolio.</small></div>
</div>`;
	const htmlFile = out.replace(/\.png$/i, '.html');
	fs.writeFileSync(htmlFile, html);
	try {
		const browser = await launchBrowser();
		const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
		await page.goto('file:///' + htmlFile.replace(/\\/g, '/'));
		await page.waitForLoadState('load');
		await page.screenshot({ path: out, fullPage: true });
		await browser.close();
		fs.rmSync(htmlFile, { force: true });
		return out;
	} catch (e) {
		log.warn(`cover preview PNG skipped: ${(e as Error).message.split('\n')[0]}`);
		return htmlFile;
	}
};
