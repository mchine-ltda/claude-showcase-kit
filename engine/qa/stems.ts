import fs from 'node:fs';
import path from 'node:path';
import type { ShowcaseProps } from '../../src/schema';
import { buildTimeline } from '../../src/timeline';
import { parseWav } from '../audio/wav';
import { log, remotion, writeJson } from '../lib/util';

export type StemLevels = Awaited<ReturnType<typeof measureStems>>;

/**
 * The true voice-over-music balance, measured on stems instead of the final mix:
 * the soundtrack is rendered twice with the same timeline (voice only; music + SFX
 * only, the music muted rather than removed so beat-snapped timings do not move),
 * and their levels are compared inside every narration line.
 */
export const measureStems = async (props: ShowcaseProps, stageDir: string, publicDir: string) => {
	const tl = buildTimeline(props, 30);
	const variants: Record<'voice' | 'bed', ShowcaseProps> = {
		voice: {
			...props,
			audio: { ...props.audio, music: props.audio.music ? { ...props.audio.music, volume: 0, duckTo: 0 } : null, sfx: { ...props.audio.sfx, enabled: false } },
		},
		bed: { ...props, narration: { ...props.narration, volume: 0 } },
	};
	const stems = {} as Record<'voice' | 'bed', { x: Float32Array; sr: number }>;
	for (const k of ['voice', 'bed'] as const) {
		const propsFile = path.join(stageDir, `props-stem-${k}.json`);
		writeJson(propsFile, variants[k]);
		const wav = path.join(stageDir, `stem-${k}.wav`);
		log.step(`Rendering ${k} stem`);
		const code = await remotion(['render', 'src/index.ts', 'Showcase', wav, `--props=${propsFile}`, `--public-dir=${publicDir}`, '--codec=wav', '--log=error']);
		if (code !== 0) throw new Error(`${k} stem render failed (exit ${code})`);
		const pcm = parseWav(fs.readFileSync(wav));
		const l = pcm.channels[0];
		const r = pcm.channels[1] ?? l;
		const x = new Float32Array(l.length);
		for (let i = 0; i < l.length; i++) x[i] = (l[i] + r[i]) / 2;
		stems[k] = { x, sr: pcm.sampleRate };
	}
	const db = (s: { x: Float32Array; sr: number }, a: number, b: number) => {
		let sum = 0;
		const i0 = Math.max(0, Math.floor(a * s.sr));
		const i1 = Math.min(s.x.length, Math.floor(b * s.sr));
		for (let i = i0; i < i1; i++) sum += s.x[i] * s.x[i];
		return 10 * Math.log10(Math.max(1e-12, sum / Math.max(1, i1 - i0)));
	};
	const lines = tl.lines.map((l) => {
		const a = (l.from + 3) / 30;
		const b = (l.from + l.duration - 3) / 30;
		const voice = db(stems.voice, a, b);
		const bed = db(stems.bed, a, b);
		return { id: l.line.id, text: l.line.text, voice, bed, separation: voice - bed };
	});
	const mean = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / Math.max(1, xs.length);
	const result = {
		lines,
		voiceDb: mean(lines.map((l) => l.voice)),
		bedUnderSpeechDb: mean(lines.map((l) => l.bed)),
		separationDb: mean(lines.map((l) => l.separation)),
		worstSeparationDb: Math.min(...lines.map((l) => l.separation)),
	};
	for (const l of lines) log.info(`${l.id.padEnd(12)} voice ${l.voice.toFixed(1)} dB · music+SFX under it ${l.bed.toFixed(1)} dB · ${l.separation.toFixed(1)} dB`);
	(result.worstSeparationDb >= 8 ? log.ok : log.warn)(
		`voice ${result.voiceDb.toFixed(1)} dB, music+SFX under speech ${result.bedUnderSpeechDb.toFixed(1)} dB: ${result.separationDb.toFixed(1)} dB separation (worst line ${result.worstSeparationDb.toFixed(1)} dB; aim for ≥ 8)`,
	);
	return result;
};
