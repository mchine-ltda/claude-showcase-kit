import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { NarrationLine } from '../../src/types';
import { encodeWav, parseWav, type Pcm } from '../audio/wav';
import { ensureDir, log, readJson, writeJson } from '../lib/util';
import { synthesize, type VoiceConfig } from './tts';

/** Bump when master() changes so cached takes are re-levelled. */
const MASTER_VERSION = 3;

export type ScriptLine = { id: string; segment: NarrationLine['segment']; text: string; step: string | null };

/**
 * Generate (or reuse) one audio file per narration line. Lines are cached by
 * a hash of text + voice settings, so editing one sentence only re-voices that
 * sentence. Every take is trimmed and levelled the same way, so lines sit at a
 * consistent loudness in the mix.
 */
export const buildNarration = async (opts: { dir: string; voice: VoiceConfig; lines: ScriptLine[] }) => {
	const outDir = ensureDir(path.join(opts.dir, 'narration'));
	const manifestFile = path.join(outDir, 'narration.json');
	const previous = fs.existsSync(manifestFile) ? readJson<{ lines: (NarrationLine & { hash: string })[] }>(manifestFile) : null;
	const result: (NarrationLine & { hash: string })[] = [];
	let generated = 0;
	for (const line of opts.lines) {
		const hash = crypto
			.createHash('sha1')
			.update(JSON.stringify([MASTER_VERSION, opts.voice.provider, opts.voice.voice, opts.voice.speed, opts.voice.model, opts.voice.instructions, line.text]))
			.digest('hex')
			.slice(0, 10);
		const file = `${line.id}-${hash}.wav`;
		const abs = path.join(outDir, file);
		let seconds: number;
		const cached = previous?.lines.find((l) => l.hash === hash && fs.existsSync(path.join(outDir, l.src.split('/').pop()!)));
		if (cached && fs.existsSync(abs)) {
			seconds = cached.seconds;
		} else {
			log.info(`voicing "${line.text}"`);
			const raw = await synthesize(line.text, opts.voice);
			const clean = master(raw);
			fs.writeFileSync(abs, encodeWav(clean));
			seconds = clean.channels[0].length / clean.sampleRate;
			generated++;
		}
		result.push({ id: line.id, segment: line.segment, text: line.text, step: line.step, src: `project/narration/${file}`, seconds, hash });
	}
	// Remove takes that are no longer in the script.
	const keep = new Set(result.map((r) => r.src.split('/').pop()));
	for (const f of fs.readdirSync(outDir)) if (f.endsWith('.wav') && !keep.has(f)) fs.rmSync(path.join(outDir, f));
	// Rewrite the manifest only when the takes changed, so re-renders leave a committed project untouched.
	const unchanged = !generated && previous && JSON.stringify(previous.lines) === JSON.stringify(result);
	if (!unchanged) writeJson(manifestFile, { voice: opts.voice, generatedAt: new Date().toISOString(), lines: result });
	if (generated) log.ok(`narration: ${generated} line(s) voiced with ${opts.voice.provider}/${opts.voice.voice}`);
	return result.map(({ hash: _hash, ...l }) => l);
};

/** Trim silence, level speech to about -18 dBFS RMS, soft-limit peaks under -3 dBFS (headroom for music + AAC), add tiny fades. */
export const master = (pcm: Pcm, { trim = true } = {}): Pcm => {
	const sr = pcm.sampleRate;
	const x = pcm.channels[0];
	const win = Math.round(sr * 0.01);
	const rmsAt = (i: number) => {
		let s = 0;
		const end = Math.min(x.length, i + win);
		for (let k = i; k < end; k++) s += x[k] * x[k];
		return Math.sqrt(s / Math.max(1, end - i));
	};
	const gate = Math.pow(10, -42 / 20);
	let first = 0;
	while (first < x.length && rmsAt(first) < gate) first += win;
	let last = x.length - win;
	while (last > first && rmsAt(last) < gate) last -= win;
	const start = trim ? Math.max(0, first - Math.round(sr * 0.03)) : 0;
	const end = trim ? Math.min(x.length, last + win + Math.round(sr * 0.14)) : x.length;
	const y = x.slice(start, end);

	// Loudness from active speech only.
	let sum = 0;
	let count = 0;
	for (let i = 0; i < y.length; i += win) {
		let s = 0;
		const e = Math.min(y.length, i + win);
		for (let k = i; k < e; k++) s += y[k] * y[k];
		const r = Math.sqrt(s / Math.max(1, e - i));
		if (r > gate * 4) {
			sum += s;
			count += e - i;
		}
	}
	const rms = count ? Math.sqrt(sum / count) : 0.1;
	const gain = Math.pow(10, -18 / 20) / Math.max(1e-6, rms);
	const ceiling = Math.pow(10, -3 / 20);
	for (let i = 0; i < y.length; i++) {
		let v = y[i] * gain;
		// Soft knee above -6 dBFS keeps peaks under the ceiling without audible clipping.
		const a = Math.abs(v);
		const knee = 0.4;
		if (a > knee) v = Math.sign(v) * (knee + (ceiling - knee) * Math.tanh((a - knee) / (ceiling - knee)));
		y[i] = v;
	}
	const fin = Math.round(sr * 0.005);
	const fout = Math.round(sr * 0.04);
	for (let i = 0; i < fin && i < y.length; i++) y[i] *= i / fin;
	for (let i = 0; i < fout && i < y.length; i++) y[y.length - 1 - i] *= i / fout;
	return { sampleRate: sr, channels: [y] };
};

export const readNarrationWav = (file: string) => parseWav(fs.readFileSync(file));
