import fs from 'node:fs';
import path from 'node:path';
import type { NarrationLine } from '../../src/types';
import { decodeAudio, durationOf, encodeWav, type Pcm } from '../audio/wav';
import { ensureDir, log, writeJson } from '../lib/util';
import { master, type ScriptLine } from './narrate';

type Take = [start: number, end: number];

/** Find speech ranges separated by pauses in a clean talking-head recording. */
export const detectTakes = (pcm: Pcm, minPause: number): Take[] => {
	const audio = pcm.channels[0];
	const window = Math.round(pcm.sampleRate * 0.02);
	const db: number[] = [];
	for (let i = 0; i < audio.length; i += window) {
		const end = Math.min(i + window, audio.length);
		let energy = 0;
		for (let j = i; j < end; j++) energy += audio[j] * audio[j];
		db.push(10 * Math.log10(Math.max(1e-12, energy / (end - i))));
	}
	const sorted = [...db].sort((a, b) => a - b);
	const floor = sorted[Math.floor(sorted.length * 0.1)];
	const speech = sorted[Math.floor(sorted.length * 0.95)];
	if (!Number.isFinite(speech) || speech <= -75) return [];
	const threshold = Math.max(floor + 12, speech - 35);
	const hop = window / pcm.sampleRate;
	const takes: Take[] = [];
	for (let i = 0; i < db.length; i++) {
		if (db[i] <= threshold) continue;
		const begin = i;
		while (i + 1 < db.length && db[i + 1] > threshold) i++;
		const start = begin * hop;
		const end = Math.min(durationOf(pcm), (i + 1) * hop);
		const previous = takes.at(-1);
		if (previous && start - previous[1] < minPause) previous[1] = end;
		else takes.push([start, end]);
	}
	const speechTakes = takes.filter(([start, end]) => end - start >= 0.2);
	return speechTakes.map(([start, end], i) => [
		Math.max(0, (speechTakes[i - 1]?.[1] ?? 0), start - 0.06),
		Math.min(durationOf(pcm), speechTakes[i + 1]?.[0] ?? Infinity, end + 0.12),
	]);
};

const verifyTakes = (takes: Take[], lines: ScriptLine[], seconds: number) => {
	if (takes.length !== lines.length) {
		const ranges = takes.map(([start, end]) => `${start.toFixed(2)}–${end.toFixed(2)}s`).join(', ');
		throw new Error(`Presenter audio has ${takes.length} take(s) for ${lines.length} script lines.${ranges ? ` Ranges: ${ranges}.` : ''} Review the recording and set presenter.takes or presenter.minPause.`);
	}
	for (const [i, [start, end]] of takes.entries()) {
		if (start < 0 || end <= start || end > seconds || (i > 0 && start < takes[i - 1][1])) {
			throw new Error(`Presenter take ${i + 1} must be in chronological order, within the recording (0–${seconds.toFixed(2)}s), and must not overlap the previous take.`);
		}
	}
};

/** Cut and level the actual recording without trimming away the picture's sync. */
export const buildPresenterNarration = async (opts: {
	dir: string;
	video: string;
	lines: ScriptLine[];
	minPause: number;
	takes?: Take[];
	videoSeconds?: number;
}): Promise<NarrationLine[]> => {
	const pcm = await decodeAudio(opts.video, { mono: true, sampleRate: 48000 });
	const seconds = Math.min(durationOf(pcm), opts.videoSeconds ?? Infinity);
	const takes = opts.takes ?? detectTakes(pcm, opts.minPause).map(([start, end]): Take => [start, Math.min(end, seconds)]);
	verifyTakes(takes, opts.lines, seconds);

	const dir = ensureDir(path.join(opts.dir, 'narration'));
	const result = opts.lines.map((line, i) => {
		const [start, end] = takes[i];
		const first = Math.round(start * pcm.sampleRate);
		const last = Math.round(end * pcm.sampleRate);
		if (last <= first) throw new Error(`Presenter take ${i + 1} is too short to contain audio.`);
		const slice = pcm.channels[0].slice(first, last);
		const file = `presenter-${i + 1}.wav`;
		fs.writeFileSync(path.join(dir, file), encodeWav(master({ sampleRate: pcm.sampleRate, channels: [slice] }, { trim: false })));
		return { ...line, src: `project/narration/${file}`, seconds: slice.length / pcm.sampleRate, sourceStart: first / pcm.sampleRate };
	});
	writeJson(path.join(dir, 'narration.json'), { presenter: path.basename(opts.video), lines: result });
	log.ok(`presenter: ${result.length} take(s) cut from ${path.basename(opts.video)}`);
	for (const { id, sourceStart, seconds } of result) log.info(`${id}: source ${sourceStart.toFixed(2)}–${(sourceStart + seconds).toFixed(2)}s`);
	return result;
};
