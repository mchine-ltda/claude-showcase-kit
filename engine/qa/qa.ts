import fs from 'node:fs';
import path from 'node:path';
import { FORMATS, stageBands } from '../../src/layout';
import type { ShowcaseProps } from '../../src/schema';
import { actionTiming, buildSfxCues, buildTimeline, COVER_BEATS, coverFrameOf, needsPreScroll, outroBeats, SFX_LENGTH_SECONDS, stepContexts, type Timeline } from '../../src/timeline';
import { decodeAudio } from '../audio/wav';
import { launchBrowser } from '../capture/browser';
import { ensureDir, ffmpeg, ffprobe, log, writeJson } from '../lib/util';
import type { StemLevels } from './stems';

type Check = { name: string; ok: boolean; detail: string; level: 'error' | 'warn' | 'info' };

// Analysis resolution for motion statistics (keeps the decode tiny and fast).
const AW = 108;
const AH = 192;

/**
 * Technical + editorial QA for a rendered showcase. Remotion's bundled ffmpeg is
 * a minimal build, so frame and audio statistics are computed here:
 *  - container / codec / resolution / fps / pixel format / duration vs. timeline,
 *  - black frames, long freezes, abrupt jumps (page changes are expected cuts),
 *  - desktop/mobile balance, stable desktop scale (no zoom),
 *  - narration placed inside the scene it describes, voice clearly above music,
 *  - loudness and true peak, review frames + contact sheet.
 */
export const runQa = async (videoFile: string, props: ShowcaseProps, outDir: string, extra: { stems?: StemLevels | null } = {}) => {
	if (!fs.existsSync(videoFile)) throw new Error(`No video at ${videoFile}`);
	ensureDir(outDir);
	const checks: Check[] = [];
	const add = (name: string, ok: boolean, detail: string, level: Check['level'] = 'error') =>
		checks.push({ name, ok, detail, level: ok ? 'info' : level });

	const fmt = FORMATS[props.format];
	const fps = 30;
	const tl = buildTimeline(props, fps);
	const spec = tl.spec;
	const expectedFrames = tl.total;

	const probe = await ffprobe(['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', '-count_frames', videoFile]);
	const info = JSON.parse(probe.stdout.toString() || '{}') as { streams?: Record<string, string | number>[]; format?: Record<string, string> };
	const v = info.streams?.find((s) => s.codec_type === 'video');
	const a = info.streams?.find((s) => s.codec_type === 'audio');
	if (!v) throw new Error('No video stream found');
	const frames = Number(v.nb_read_frames ?? v.nb_frames ?? 0);
	const duration = Number(info.format?.duration ?? 0);
	add('container', /mp4/.test(String(info.format?.format_name)), `${info.format?.format_name}`);
	add('video codec', v.codec_name === 'h264', `${v.codec_name} ${v.profile ?? ''} level ${v.level ?? '?'}`);
	add('resolution', v.width === fmt.width && v.height === fmt.height, `${v.width}×${v.height} (expected ${fmt.width}×${fmt.height}, ${fmt.label})`);
	add('frame rate', v.r_frame_rate === '30/1' || v.avg_frame_rate === '30/1', `${v.r_frame_rate}`);
	add('pixel format', v.pix_fmt === 'yuv420p', String(v.pix_fmt));
	add('frame count', Math.abs(frames - expectedFrames) <= 1, `${frames} frames (timeline ${expectedFrames})`);
	add('duration', Math.abs(duration - expectedFrames / fps) < 0.1, `${duration.toFixed(2)} s (timeline ${(expectedFrames / fps).toFixed(2)} s)`);
	add('colour tags', v.color_primaries === 'bt709' || v.color_space === 'bt709', `primaries ${v.color_primaries ?? 'unset'}, matrix ${v.color_space ?? 'unset'}`, 'warn');
	const mbps = Number(info.format?.bit_rate ?? 0) / 1e6;
	add('bitrate', mbps > 2 && mbps < 40, `${mbps.toFixed(1)} Mbps, ${(Number(info.format?.size ?? 0) / 1e6).toFixed(1)} MB`, 'warn');
	if (a) add('audio', a.codec_name === 'aac' && Number(a.sample_rate) === 48000, `${a.codec_name} ${a.sample_rate} Hz, ${a.channels} ch`, 'warn');
	else add('audio', false, 'no audio stream', props.narration.lines.length ? 'error' : 'warn');

	// ---- Structure: balance, stable framing, narration placement.
	const seg = (k: string) => tl.scenes.find((s) => s.key === k);
	const d = seg('desktop');
	const m = seg('mobile');
	if (d && m) {
		const ds = d.slotFrames / fps;
		const ms = m.slotFrames / fps;
		add('desktop/mobile balance', Math.abs(ds - ms) / Math.max(ds, ms) < 0.1, `desktop ${ds.toFixed(2)} s · mobile ${ms.toFixed(2)} s`, 'warn');
	}
	for (const k of ['intro', 'outro'] as const) {
		const s = seg(k);
		if (s) add(`${k} length`, s.slotFrames / fps <= 3.2, `${(s.slotFrames / fps).toFixed(2)} s`, 'warn');
	}
	for (const k of ['desktop', 'mobile'] as const) {
		const plans = tl.steps[k];
		if (!plans.length) continue;
		const lens = plans.map((p) => p.duration / fps);
		const interactions = plans.filter((p) => p.step.kind !== 'scroll').length;
		add(
			`${k} pacing`,
			true,
			`${plans.length} steps (${interactions} cuts/clicks/taps), ${(lens.reduce((x, y) => x + y, 0) / lens.length).toFixed(2)} s average, shortest ${Math.min(...lens).toFixed(2)} s, longest ${Math.max(...lens).toFixed(2)} s`,
			'info',
		);
	}
	const vp = props.capture?.journeys?.desktop?.pages[0]?.viewport;
	if (vp) {
		const bands = stageBands(props.format, props.subtitles.enabled);
		const scale = Math.min((fmt.width * 0.93) / vp.width, (bands.deviceBottom - bands.deviceTop) / (vp.height + 76));
		add('desktop framing', true, `browser fixed at ${scale.toFixed(3)}× (${Math.round(vp.width * scale)}×${Math.round((vp.height + 76) * scale)} px) for the whole desktop part: no zoom`, 'info');
	}
	const misplaced = tl.lines.filter((l) => {
		const s = seg(l.line.segment);
		if (!s) return true;
		// A template may start a line before its part (closing question) or let it run into the next (L-cut).
		const lo = s.slotFrom - Math.round(Math.max(0.5, 0.1 - spec.pacing.lead[l.line.segment]) * fps);
		const hi = s.slotFrom + s.slotFrames + Math.round((0.6 + spec.pacing.overhang[l.line.segment]) * fps);
		return l.from < lo || l.from + l.duration > hi;
	});
	if (props.narration.lines.length) {
		add(
			'narration matches scenes',
			misplaced.length === 0,
			misplaced.length
				? misplaced.map((l) => `"${l.line.text.slice(0, 30)}…" (${l.line.segment}) at ${(l.from / fps).toFixed(2)} s`).join('; ')
				: `${tl.lines.length} lines, each inside its part (${tl.lines.reduce((s, l) => s + l.line.seconds, 0).toFixed(1)} s of speech)`,
		);
		const overlaps = tl.lines.filter((l, i) => i > 0 && l.from < tl.lines[i - 1].from + tl.lines[i - 1].duration);
		add('narration lines never overlap', overlaps.length === 0, overlaps.length ? `${overlaps.length} overlap(s)` : 'sequential');
	}

	// ---- Frame statistics from a downscaled grey decode (image2pipe + rawvideo: no raw muxer in this build).
	const raw = await ffmpeg(['-v', 'error', '-i', videoFile, '-vf', `scale=${AW}:${AH},format=gray`, '-c:v', 'rawvideo', '-f', 'image2pipe', '-']);
	const size = AW * AH;
	const n = Math.floor(raw.stdout.length / size);
	const mean: number[] = [];
	const peak: number[] = [];
	const diff: number[] = [0];
	for (let f = 0; f < n; f++) {
		let s = 0;
		let mx = 0;
		let dd = 0;
		const o = f * size;
		for (let i = 0; i < size; i++) {
			const px = raw.stdout[o + i];
			s += px;
			if (px > mx) mx = px;
			if (f > 0) dd += Math.abs(px - raw.stdout[o - size + i]);
		}
		mean.push(s / size);
		peak.push(mx);
		if (f > 0) diff.push(dd / size);
	}
	add('decoded frames', n === frames, `${n} frames analysed`);
	const blackFrames = mean.map((mm, i) => (mm < 6 && peak[i] < 28 ? i : -1)).filter((i) => i >= 0);
	const badBlack = blackFrames.filter((i) => i < expectedFrames - 10);
	add('no black frames', badBlack.length === 0, badBlack.length ? `black at frames ${ranges(badBlack)}` : `none before the final fade (${blackFrames.length} in the fade-out)`);
	const freezes: [number, number][] = [];
	for (let i = 1, start = -1; i <= n; i++) {
		if (i < n && diff[i] < 0.05) {
			if (start < 0) start = i;
		} else if (start >= 0) {
			if (i - start >= fps * spec.qa.maxStillSeconds) freezes.push([start, i - 1]);
			start = -1;
		}
	}
	add(
		'no long freezes',
		freezes.length === 0,
		freezes.length ? freezes.map(([s, e]) => `frames ${s}–${e}`).join(', ') : `motion never stalls ≥ ${spec.qa.maxStillSeconds} s`,
		'warn',
	);
	const pageChanges = navigationFrames(props, tl);
	const jumps: { frame: number; diff: number; local: number; expected: boolean }[] = [];
	for (let i = 1; i < n; i++) {
		const neigh = [diff[i - 3], diff[i - 2], diff[i + 2], diff[i + 3]].filter((x) => x !== undefined) as number[];
		const local = median(neigh);
		if (diff[i] > 9 && diff[i] > local * 3.5 + 2) jumps.push({ frame: i, diff: diff[i], local, expected: pageChanges.some((p) => Math.abs(p - i) <= 6) });
	}
	const unexpected = jumps.filter((j) => !j.expected);
	add(
		'no abrupt jumps',
		unexpected.length === 0,
		unexpected.length
			? unexpected.map((j) => `frame ${j.frame} (Δ${j.diff.toFixed(1)} vs ${j.local.toFixed(1)})`).join(', ')
			: `${jumps.length} instant change(s), all real page changes or in-page cuts; max frame change ${Math.max(...diff).toFixed(1)}`,
		'warn',
	);

	// ---- Audio: loudness, true peak, voice above music.
	let audioStats: Record<string, number> | null = null;
	if (a) {
		const loud = await ffmpeg(['-v', 'info', '-i', videoFile, '-af', 'loudnorm=print_format=json', '-vn', '-f', 'null', '-']);
		const json = /\{[\s\S]*?"input_i"[\s\S]*?\}/.exec(loud.stderr);
		if (json) {
			const l = JSON.parse(json[0]) as { input_i: string; input_tp: string };
			const tp = Number(l.input_tp);
			add('true peak', tp <= -1, `${tp.toFixed(1)} dBTP (keep ≤ -1)`, 'warn');
			add('loudness', Number(l.input_i) > -24 && Number(l.input_i) < -10, `${Number(l.input_i).toFixed(1)} LUFS integrated (Reels: -16 to -12 typical)`, 'warn');
		}
		if (tl.lines.length) {
			const pcm = await decodeAudio(videoFile, { mono: true, sampleRate: 16000 });
			const x = pcm.channels[0];
			const sr = pcm.sampleRate;
			const rmsDb = (s: number, e: number) => {
				let sum = 0;
				const a0 = Math.max(0, Math.floor(s * sr));
				const b0 = Math.min(x.length, Math.floor(e * sr));
				for (let i = a0; i < b0; i++) sum += x[i] * x[i];
				return 10 * Math.log10(Math.max(1e-12, sum / Math.max(1, b0 - a0)));
			};
			const speech = tl.lines.map((l) => rmsDb((l.from + 3) / fps, (l.from + l.duration - 3) / fps));
			// Music-only windows: pauses between lines at least 0.5 s long (ignoring the very start),
			// minus every sound effect, so only the music bed is measured.
			const busy = (props.audio.sfx.enabled ? buildSfxCues(props, tl) : []).map((c) => [c.frame, c.frame + Math.ceil(SFX_LENGTH_SECONDS[c.name] * fps)] as const);
			const gaps: number[] = [];
			let prevEnd = Math.round(fps * 0.8);
			for (const l of tl.lines) {
				if (l.from - prevEnd > fps * 0.5) {
					let pieces: [number, number][] = [[prevEnd + 10, l.from - 6]];
					for (const [b0, b1] of busy)
						pieces = pieces.flatMap(([x, y]): [number, number][] => (b1 <= x || b0 >= y ? [[x, y]] : ([[x, b0], [b1, y]] as [number, number][]).filter(([p, q]) => q > p)));
					for (const [x, y] of pieces) if (y - x >= 12) gaps.push(rmsDb(x / fps, y / fps));
				}
				prevEnd = l.from + l.duration;
			}
			const sp = speech.reduce((s, z) => s + z, 0) / speech.length;
			const quiet = speech.filter((z) => z < sp - 8);
			const gp = gaps.length ? gaps.reduce((s, z) => s + z, 0) / gaps.length : null;
			audioStats = { speechDb: sp, gapDb: gp ?? NaN };
			add('narration audible in every line', quiet.length === 0, `${speech.length} lines, mean ${sp.toFixed(1)} dBFS RMS${quiet.length ? `; ${quiet.length} unusually quiet` : ''}`);
			const st = extra.stems;
			if (st) {
				// Measured on stems rendered with the same timeline: the voice against the music + SFX under it.
				add(
					'voice above music (ducking)',
					st.worstSeparationDb >= 8,
					`voice ${st.separationDb.toFixed(1)} dB above the music + SFX under it (worst line ${st.worstSeparationDb.toFixed(1)} dB, aim ≥ 8; measured on stems)`,
					'warn',
				);
				audioStats = { ...audioStats, stemSeparationDb: st.separationDb, stemWorstDb: st.worstSeparationDb };
			}
			// Mix-only estimate: speech (with the ducked music under it) against music-only pauses at full level.
			if (gp !== null) add(st ? 'speech vs pauses' : 'voice above music (ducking)', st ? true : sp - gp >= 6, `speech ${sp.toFixed(1)} dB vs music-only pauses ${gp.toFixed(1)} dB (${(sp - gp).toFixed(1)} dB)`, st ? 'info' : 'warn');
			else if (!st)
				add('voice above music (ducking)', true, `no pause free of sound effects to measure in the mix (run: showcase -- mix <project>)`, 'info');
		}
	}

	// ---- Instagram cover: the exported PNG must be the chosen frame of this video, composed and settled.
	if (props.cover?.enabled) {
		const coverFile = path.join(path.dirname(videoFile), 'instagram-cover.png');
		const cf = coverFrameOf(props, tl);
		const intro = seg('intro');
		const settled = !intro || (cf >= intro.from + COVER_BEATS.settled - 2 && cf < intro.slotFrom + intro.slotFrames - Math.round(intro.exit / 2));
		add('cover frame', settled || props.cover.frame !== null, `frame ${cf} (${(cf / fps).toFixed(2)} s)${props.cover.frame !== null ? ', set in config' : ', lockup settled, before the transition'}`, 'warn');
		if (!fs.existsSync(coverFile)) add('instagram cover exported', false, `missing ${coverFile}`, 'warn');
		else {
			const gray = async (args: string[]) => (await ffmpeg(['-v', 'error', ...args, '-vf', `scale=${AW}:${AH},format=gray`, '-frames:v', '1', '-c:v', 'rawvideo', '-f', 'image2pipe', '-'])).stdout;
			const png = await gray(['-i', coverFile]);
			const vid = await gray(['-ss', ((cf + 0.25) / fps).toFixed(4), '-i', videoFile]);
			let d = 0;
			for (let i = 0; i < Math.min(png.length, vid.length); i++) d += Math.abs(png[i] - vid[i]);
			const mean = d / Math.max(1, Math.min(png.length, vid.length));
			const dims = await ffprobe(['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', coverFile]);
			const [cw, ch] = dims.stdout.toString().trim().split(',').map(Number);
			add('instagram cover exported', cw === fmt.width && ch === fmt.height, `instagram-cover.png ${cw}×${ch} PNG`, 'warn');
			add('cover matches the video frame', mean < 4, `mean difference ${mean.toFixed(2)}/255 against frame ${cf} of the MP4`, 'warn');
		}
	}

	// ---- Review frames + contact sheet.
	const marks = keyFrames(props, tl).filter((mk) => mk.frame >= 0 && mk.frame < frames);
	const framesDir = ensureDir(path.join(outDir, 'frames'));
	for (const f of fs.readdirSync(framesDir)) fs.rmSync(path.join(framesDir, f));
	const files: string[] = [];
	for (const mk of marks) {
		const file = path.join(framesDir, `${String(mk.frame).padStart(4, '0')}-${mk.label}.png`);
		await ffmpeg(['-v', 'error', '-y', '-ss', ((mk.frame + 0.25) / fps).toFixed(4), '-i', videoFile, '-frames:v', '1', '-update', '1', file]);
		if (!fs.existsSync(file)) await ffmpeg(['-v', 'error', '-y', '-sseof', '-0.08', '-i', videoFile, '-frames:v', '1', '-update', '1', file]);
		if (fs.existsSync(file)) files.push(file);
	}
	add('review frames', files.length === marks.length, `${files.length}/${marks.length} written to ${path.relative(process.cwd(), framesDir)}`, 'warn');
	const sheet = await contactSheet(outDir, files, fmt.width / fmt.height);
	if (sheet) log.info(`contact sheet: ${sheet}`);

	const errors = checks.filter((c) => !c.ok && c.level === 'error');
	const warns = checks.filter((c) => !c.ok && c.level === 'warn');
	const report = [
		`# QA report: ${path.basename(videoFile)}`,
		'',
		`Result: **${errors.length ? 'FAIL' : warns.length ? 'PASS with warnings' : 'PASS'}**`,
		'',
		`Template: ${spec.name} (\`${spec.id}\`)`,
		'',
		'| Check | Result | Detail |',
		'|---|---|---|',
		...checks.map((c) => `| ${c.name} | ${c.ok ? 'ok' : c.level === 'error' ? 'FAIL' : 'warn'} | ${c.detail} |`),
		'',
		'## Timeline',
		'',
		...tl.scenes.map((s) => `- ${s.key}: ${(s.slotFrom / fps).toFixed(2)}–${((s.slotFrom + s.slotFrames) / fps).toFixed(2)} s (${(s.slotFrames / fps).toFixed(2)} s)`),
		'',
		'## Narration',
		'',
		...tl.lines.map((l) => `- ${(l.from / fps).toFixed(2)} s [${l.line.segment}] "${l.line.text}" (${l.line.seconds.toFixed(2)} s)`),
		'',
		'## Review frames',
		'',
		'Contact sheet: `contact-sheet.png` (also `contact-sheet.html`).',
		'',
		...marks.map((mk) => `- frame ${mk.frame} (${(mk.frame / fps).toFixed(2)} s): ${mk.label.replace(/-/g, ' ')}`),
		'',
	].join('\n');
	fs.writeFileSync(path.join(outDir, 'report.md'), report);
	writeJson(path.join(outDir, 'report.json'), {
		video: videoFile,
		template: spec.id,
		timeline: {
			total: tl.total / fps,
			scenes: tl.scenes.map((s) => ({ key: s.key, from: s.slotFrom / fps, seconds: s.slotFrames / fps })),
			steps: (['desktop', 'mobile'] as const).flatMap((k) => {
				const s = seg(k);
				return tl.steps[k].map((p) => ({
					part: k,
					id: p.step.id,
					kind: p.step.kind === 'action' ? p.step.action : p.step.kind,
					label: p.step.label,
					from: ((s?.from ?? 0) + p.from) / fps,
					seconds: p.duration / fps,
				}));
			}),
			lines: tl.lines.map((l) => ({ id: l.line.id, segment: l.line.segment, text: l.line.text, from: l.from / fps, seconds: l.line.seconds })),
		},
		checks,
		marks,
		motion: { mean, diff },
		jumps,
		freezes,
		audioStats,
	});
	for (const c of checks) (c.ok ? log.info : c.level === 'error' ? log.error : log.warn)(`${c.name}: ${c.detail}`);
	if (errors.length) log.error(`QA failed: ${errors.map((e) => e.name).join(', ')}`);
	else log.ok(`QA ${warns.length ? 'passed with warnings' : 'passed'}; report at ${path.join(outDir, 'report.md')}`);
	return { ok: errors.length === 0, checks };
};

/** Global frames where a click/tap swaps the page (instant changes there are real, not glitches). */
const navigationFrames = (props: ShowcaseProps, tl: Timeline) => {
	const out: number[] = [];
	for (const key of ['desktop', 'mobile'] as const) {
		const s = tl.scenes.find((x) => x.key === key);
		if (!s) continue;
		const plans = tl.steps[key];
		const ctxs = stepContexts(plans);
		plans.forEach((p, i) => {
			const st = p.step;
			if (st.kind === 'cut') out.push(s.from + p.from);
			if (st.kind !== 'action') return;
			const t = actionTiming(st, p.duration, needsPreScroll(st, ctxs[i]), key === 'desktop', tl.fps, tl.spec);
			for (let f = t.press; f <= t.flipEnd + 2; f++) out.push(s.from + p.from + f);
			out.push(s.from + p.from + p.duration);
		});
	}
	return out;
};

const median = (xs: number[]) => {
	if (!xs.length) return 0;
	const s = [...xs].sort((x, y) => x - y);
	return s[Math.floor(s.length / 2)];
};

const ranges = (idx: number[]) => {
	const out: string[] = [];
	let s = idx[0];
	for (let i = 1; i <= idx.length; i++) {
		if (idx[i] !== idx[i - 1] + 1) {
			out.push(s === idx[i - 1] ? `${s}` : `${s}–${idx[i - 1]}`);
			s = idx[i];
		}
	}
	return out.join(', ');
};

/** Contact sheet as HTML, rasterised to PNG with Playwright. */
const contactSheet = async (outDir: string, files: string[], aspect: number) => {
	if (!files.length) return null;
	const cols = aspect < 1 ? 6 : 4;
	const tiles = files
		.map((f) => {
			const name = path.basename(f, '.png');
			const [frame, ...label] = name.split('-');
			return `<figure><img src="frames/${path.basename(f)}"><figcaption><b>${Number(frame)}</b> ${label.join(' ')}</figcaption></figure>`;
		})
		.join('');
	const html = `<!doctype html><meta charset="utf-8"><title>Contact sheet</title><style>
body{margin:0;background:#141416;color:#ddd;font:13px system-ui,sans-serif;padding:16px}
.grid{display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px}
figure{margin:0}img{width:100%;display:block;border-radius:6px;background:#000}
figcaption{padding:6px 2px;color:#aaa}b{color:#fff}
</style><div class="grid">${tiles}</div>`;
	const htmlFile = path.join(outDir, 'contact-sheet.html');
	fs.writeFileSync(htmlFile, html);
	try {
		const browser = await launchBrowser();
		const page = await browser.newPage({ viewport: { width: 1800, height: 900 }, deviceScaleFactor: 1 });
		await page.goto('file:///' + htmlFile.replace(/\\/g, '/'));
		await page.waitForLoadState('load');
		const png = path.join(outDir, 'contact-sheet.png');
		await page.screenshot({ path: png, fullPage: true });
		await browser.close();
		return png;
	} catch (e) {
		log.warn(`contact sheet PNG skipped: ${(e as Error).message.split('\n')[0]}`);
		return htmlFile;
	}
};

/** Frames worth looking at: intro, every journey step (mid-action), transitions, outro. */
export const keyFrames = (props: ShowcaseProps, tl = buildTimeline(props, 30)) => {
	const marks: { frame: number; label: string }[] = [];
	const push = (frame: number, label: string) => marks.push({ frame: Math.round(frame), label: label.replace(/[^a-z0-9-]+/gi, '-').toLowerCase() });
	tl.scenes.forEach((s, i) => {
		if (i > 0) push(s.from + s.enter / 2, `transition-into-${s.key}`);
		if (s.key === 'intro') push(props.cover?.enabled ? coverFrameOf(props, tl) : s.from + Math.min(s.duration - 4, 26), props.cover?.enabled ? 'instagram-cover' : 'intro-title');
		if (s.key === 'desktop' || s.key === 'mobile') {
			const plans = tl.steps[s.key];
			const ctxs = stepContexts(plans);
			plans.forEach((p, j) => {
				const st = p.step;
				if (st.kind === 'action') {
					const t = actionTiming(st, p.duration, needsPreScroll(st, ctxs[j]), s.key === 'desktop', tl.fps, tl.spec);
					push(s.from + p.from + Math.max(0, t.press - 2), `${s.key}-${j + 1}-${st.action}-${st.label}`);
					push(s.from + p.from + Math.min(p.duration - 1, t.flipEnd + 4), `${s.key}-${j + 1}-result`);
				} else push(s.from + p.from + p.duration * 0.6, `${s.key}-${j + 1}-${st.kind}`);
			});
		}
		if (s.key === 'outro') {
			const b = outroBeats(s.duration, s.enter, tl.spec);
			push(s.from + Math.min(s.duration - 2, b.markIn + 22), 'outro-signature');
			push(tl.total - 1, 'last-frame');
		}
	});
	return marks.sort((x, y) => x.frame - y.frame).filter((mk, i, arr) => i === 0 || mk.frame !== arr[i - 1].frame);
};
