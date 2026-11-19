import { decodeAudio } from './wav';

// Tempo and beat-phase estimation for a user-supplied music track:
// spectral-flux onset envelope → autocorrelation tempo (with a gentle prior
// around 120 BPM) → phase that best aligns a beat grid with the onsets.

const SR = 22050;
const HOP = 512;
const N = 1024;

const fft = (re: Float64Array, im: Float64Array) => {
	const n = re.length;
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			[re[i], re[j]] = [re[j], re[i]];
			[im[i], im[j]] = [im[j], im[i]];
		}
	}
	for (let len = 2; len <= n; len <<= 1) {
		const ang = (-2 * Math.PI) / len;
		const wr = Math.cos(ang);
		const wi = Math.sin(ang);
		for (let i = 0; i < n; i += len) {
			let cr = 1;
			let ci = 0;
			for (let k = 0; k < len / 2; k++) {
				const ar = re[i + k];
				const ai = im[i + k];
				const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
				const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
				re[i + k] = ar + br;
				im[i + k] = ai + bi;
				re[i + k + len / 2] = ar - br;
				im[i + k + len / 2] = ai - bi;
				const t = cr * wr - ci * wi;
				ci = cr * wi + ci * wr;
				cr = t;
			}
		}
	}
};

export const decodeMono = async (file: string, maxSeconds = 90) => {
	const pcm = await decodeAudio(file, { mono: true, sampleRate: SR, maxSeconds });
	return pcm.channels[0];
};

export const analyzeBeats = async (file: string) => {
	const pcm = await decodeMono(file);
	const frames = Math.floor((pcm.length - N) / HOP);
	if (frames < 200) throw new Error('Track too short to analyse (need > 5 s)');
	const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
	let prev = new Float64Array(N / 2);
	const onset = new Float64Array(frames);
	for (let f = 0; f < frames; f++) {
		const re = new Float64Array(N);
		const im = new Float64Array(N);
		for (let i = 0; i < N; i++) re[i] = pcm[f * HOP + i] * win[i];
		fft(re, im);
		const mag = new Float64Array(N / 2);
		let flux = 0;
		for (let k = 1; k < N / 2; k++) {
			mag[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));
			const d = mag[k] - prev[k];
			if (d > 0) flux += d;
		}
		onset[f] = flux;
		prev = mag;
	}
	// Remove slow trend so autocorrelation sees pulses, not loudness.
	const mean = onset.reduce((a, b) => a + b, 0) / frames;
	const env = onset.map((v) => Math.max(0, v - mean));
	const fps = SR / HOP;
	let best = { bpm: 120, score: -Infinity, lag: 0 };
	for (let bpm = 70; bpm <= 180; bpm += 0.25) {
		const lag = (60 / bpm) * fps;
		let s = 0;
		for (let m = 1; m <= 4; m++) {
			const L = lag * m;
			const l0 = Math.floor(L);
			const fr = L - l0;
			for (let i = 0; i + l0 + 1 < frames; i++) s += env[i] * (env[i + l0] * (1 - fr) + env[i + l0 + 1] * fr);
		}
		const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
		const score = s * prior;
		if (score > best.score) best = { bpm, score, lag };
	}
	// Phase: offset (in onset frames) that maximises the onset energy on the grid.
	let bestPhase = 0;
	let bestPhaseScore = -Infinity;
	for (let p = 0; p < best.lag; p += 0.5) {
		let s = 0;
		for (let t = p; t < frames; t += best.lag) s += env[Math.round(t)] ?? 0;
		if (s > bestPhaseScore) {
			bestPhaseScore = s;
			bestPhase = p;
		}
	}
	const offset = (bestPhase * HOP) / SR;
	// Confidence: grid energy relative to average energy at random phases.
	let base = 0;
	const samples = 16;
	for (let k = 0; k < samples; k++) {
		let s = 0;
		const p = (best.lag * k) / samples;
		for (let t = p; t < frames; t += best.lag) s += env[Math.round(t)] ?? 0;
		base += s / samples;
	}
	const confidence = Math.max(0, Math.min(1, (bestPhaseScore / Math.max(1e-9, base) - 1) / 1.5));
	return { bpm: Math.round(best.bpm * 100) / 100, offsetSeconds: Math.round(offset * 1000) / 1000, confidence: Math.round(confidence * 100) / 100 };
};
