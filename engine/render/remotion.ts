import fs from 'node:fs';
import path from 'node:path';
import { ENGINE_ROOT, ensureDir, log, remotion } from '../lib/util';

const ENTRY = 'src/index.ts';
const COMPOSITION = 'Showcase';

/** Instagram-friendly H.264 settings: yuv420p, BT.709 tags, AAC 320k @ 48 kHz, faststart. */
export const H264_FLAGS = [
	'--codec=h264',
	'--crf=16',
	'--x264-preset=slow',
	'--pixel-format=yuv420p',
	'--color-space=bt709',
	'--audio-codec=aac',
	'--audio-bitrate=320k',
	'--image-format=jpeg',
	'--jpeg-quality=95',
];

const common = (propsFile: string, publicDir: string) => [`--props=${propsFile}`, `--public-dir=${publicDir}`];

export const openStudio = async (propsFile: string, publicDir: string, port?: number) => {
	log.step('Starting Remotion Studio (Ctrl+C to stop)');
	const args = ['studio', ENTRY, ...common(propsFile, publicDir), '--no-open'];
	if (port) args.push(`--port=${port}`);
	return remotion(args);
};

export const renderVideo = async (propsFile: string, publicDir: string, outFile: string, opts: { concurrency?: string; frames?: string } = {}) => {
	ensureDir(path.dirname(outFile));
	const args = ['render', ENTRY, COMPOSITION, outFile, ...common(propsFile, publicDir), ...H264_FLAGS];
	// Remotion picks a safe default from the cores it can actually use.
	if (opts.concurrency) args.push(`--concurrency=${opts.concurrency}`);
	if (opts.frames) args.push(`--frames=${opts.frames}`);
	log.step(`Rendering ${path.basename(outFile)}`);
	const code = await remotion(args);
	if (code !== 0) throw new Error(`Render failed (exit ${code})`);
	return outFile;
};

/**
 * Render PNG stills for review: bundle once, then render each frame on one
 * shared browser (Node API; faster than one CLI call per frame).
 */
export const renderStills = async (propsFile: string, publicDir: string, outDir: string, frames: number[]) => {
	ensureDir(outDir);
	const { bundle } = await import('@remotion/bundler');
	const { openBrowser, renderStill, selectComposition } = await import('@remotion/renderer');
	log.step(`Bundling for ${frames.length} still(s)`);
	const serveUrl = await bundle({ entryPoint: path.join(ENGINE_ROOT, ENTRY), publicDir });
	const inputProps = JSON.parse(fs.readFileSync(propsFile, 'utf8')) as Record<string, unknown>;
	const browser = await openBrowser('chrome');
	try {
		const composition = await selectComposition({ serveUrl, id: COMPOSITION, inputProps, puppeteerInstance: browser });
		for (const frame of frames.filter((f) => f >= 0 && f < composition.durationInFrames)) {
			const output = path.join(outDir, `frame-${String(frame).padStart(4, '0')}.png`);
			await renderStill({ composition, serveUrl, frame, output, inputProps, puppeteerInstance: browser, imageFormat: 'png' });
			log.info(path.basename(output));
		}
	} finally {
		await browser.close({ silent: true });
	}
};
