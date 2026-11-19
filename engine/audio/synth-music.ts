import fs from 'node:fs';
import path from 'node:path';
import { ENGINE_ROOT, ensureDir, log } from '../lib/util';
import { Biquad, mulberry32, normalize, reverb, SR, writeWav } from './synth-sfx';

// The engine's own music bed: an original, deterministic composition rendered
// from code (oscillators, filters, envelopes, algorithmic reverb). No samples,
// no third-party material, so it is cleared for organic posts, client work and ads.
//
// 100 BPM, 4/4, gentle modern-electronic: warm detuned pads, a soft pluck
// arpeggio with a ping-pong delay, sub bass, and restrained drums with
// sidechain-style ducking. Built to sit under a voice-over.

export const MUSIC_DIR = path.join(ENGINE_ROOT, 'public', 'engine', 'music');
export const BUILTIN_MUSIC = { file: 'engine-bed-100.wav', title: 'Engine Bed (100 BPM)', bpm: 100 };

const BPM = 100;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const BARS = 22;

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// One chord per bar, four-bar loop: Fmaj9 → Am9 → Cmaj9 → G6/9.
const PADS = [
	[53, 57, 60, 64, 67],
	[57, 60, 64, 67, 71],
	[55, 60, 62, 64, 71],
	[55, 59, 62, 64, 69],
];
const BASS = [41, 45, 48, 43];
const ARP = [
	[65, 69, 72, 76, 79],
	[69, 72, 76, 79, 83],
	[67, 72, 74, 76, 83],
	[67, 71, 74, 76, 81],
];
const ARP_PATTERN = [0, 2, 1, 3, 2, 4, 3, 1, 0, 2, 1, 3, 4, 3, 2, 1];

/** Band-limited sawtooth (polyBLEP) so pads stay smooth, not buzzy. */
const polyBlep = (t: number, dt: number) => {
	if (t < dt) {
		const x = t / dt;
		return x + x - x * x - 1;
	}
	if (t > 1 - dt) {
		const x = (t - 1) / dt;
		return x * x + x + x + 1;
	}
	return 0;
};

export const generateMusic = () => {
	ensureDir(MUSIC_DIR);
	const n = Math.round(BARS * BAR * SR);
	const L = new Float32Array(n);
	const R = new Float32Array(n);
	const rnd = mulberry32(7);

	// Kick times drive the sidechain envelope.
	const kicks: number[] = [];
	for (let bar = 2; bar < BARS; bar++) for (const b of [0, 2]) kicks.push((bar * 4 + b) * BEAT);
	const duck = new Float32Array(n).fill(1);
	for (const k of kicks) {
		const s = Math.round(k * SR);
		for (let i = 0; i < SR * 0.32 && s + i < n; i++) duck[s + i] = Math.min(duck[s + i], 1 - 0.38 * Math.exp(-i / (SR * 0.09)));
	}

	// ---- Pads: 3 detuned saws per note, slow attack/release, low-passed with a gentle sweep.
	const padL = new Float32Array(n);
	const padR = new Float32Array(n);
	for (let bar = 0; bar < BARS; bar++) {
		const chord = PADS[bar % 4];
		const t0 = bar * BAR;
		const len = BAR + 0.9;
		for (const note of chord) {
			for (const [det, pan] of [
				[-0.11, -0.6],
				[0, 0],
				[0.09, 0.6],
			]) {
				const f = midi(note) * Math.pow(2, det / 12);
				const dt = f / SR;
				let ph = rnd();
				const s0 = Math.round(t0 * SR);
				const s1 = Math.min(n, Math.round((t0 + len) * SR));
				for (let i = s0; i < s1; i++) {
					const t = (i - s0) / SR;
					const env = Math.min(1, t / 0.55) * Math.min(1, (len - t) / 0.9);
					ph += dt;
					if (ph >= 1) ph -= 1;
					const v = (2 * ph - 1 - polyBlep(ph, dt)) * env * 0.045;
					padL[i] += v * (1 - pan * 0.5);
					padR[i] += v * (1 + pan * 0.5);
				}
			}
		}
	}
	const lpL = new Biquad('lp');
	const lpR = new Biquad('lp');
	for (let i = 0; i < n; i++) {
		if (i % 64 === 0) {
			const t = i / SR;
			const open = Math.min(1, t / (BAR * 2));
			const fc = 650 + 1100 * open + 250 * Math.sin((2 * Math.PI * t) / (BAR * 4));
			lpL.set(fc, 0.6);
			lpR.set(fc * 1.02, 0.6);
		}
		L[i] += lpL.process(padL[i]) * duck[i];
		R[i] += lpR.process(padR[i]) * duck[i];
	}

	// ---- Sub bass: rounded sine on 8ths, from bar 3.
	for (let bar = 2; bar < BARS; bar++) {
		const f = midi(BASS[bar % 4]);
		for (let e = 0; e < 8; e++) {
			const start = bar * BAR + e * (BEAT / 2);
			const s0 = Math.round(start * SR);
			const len = BEAT * 0.45;
			let ph = 0;
			for (let i = 0; i < len * SR && s0 + i < n; i++) {
				const t = i / SR;
				const env = Math.min(1, t / 0.008) * Math.exp(-t / 0.22) * (e % 2 === 0 ? 1 : 0.7);
				ph += f / SR;
				const v = Math.tanh(Math.sin(2 * Math.PI * ph) * 1.4) * env * 0.16;
				L[s0 + i] += v * duck[s0 + i];
				R[s0 + i] += v * duck[s0 + i];
			}
		}
	}

	// ---- Pluck arpeggio: soft triangle with fast decay, 16ths, ping-pong delay.
	const arpL = new Float32Array(n);
	const arpR = new Float32Array(n);
	for (let bar = 0; bar < BARS; bar++) {
		const tones = ARP[bar % 4];
		for (let s = 0; s < 16; s++) {
			const start = bar * BAR + s * (BEAT / 4);
			const note = tones[ARP_PATTERN[s] % tones.length] + (bar >= 10 && bar < 14 && s % 4 === 3 ? 12 : 0);
			const f = midi(note);
			const vel = (s % 4 === 0 ? 1 : 0.62) * (bar < 2 ? 0.55 + bar * 0.2 : 1);
			const s0 = Math.round(start * SR);
			let ph = rnd();
			for (let i = 0; i < SR * 0.5 && s0 + i < n; i++) {
				const t = i / SR;
				const env = Math.min(1, t / 0.003) * Math.exp(-t / 0.11) * vel;
				ph += f / SR;
				if (ph >= 1) ph -= 1;
				const tri = 1 - 4 * Math.abs(ph - 0.5);
				const v = tri * env * 0.05;
				arpL[s0 + i] += v;
				arpR[s0 + i] += v;
			}
		}
	}
	const ar = new Biquad('lp');
	const al = new Biquad('lp');
	ar.set(3200, 0.7);
	al.set(3200, 0.7);
	const delay = Math.round(BEAT * 0.75 * SR);
	for (let i = 0; i < n; i++) {
		arpL[i] = al.process(arpL[i]);
		arpR[i] = ar.process(arpR[i]);
	}
	for (let i = delay; i < n; i++) {
		arpL[i] += arpR[i - delay] * 0.32;
		arpR[i] += arpL[i - delay] * 0.32;
	}
	for (let i = 0; i < n; i++) {
		L[i] += arpL[i] * (0.8 + 0.2 * duck[i]);
		R[i] += arpR[i] * (0.8 + 0.2 * duck[i]);
	}

	// ---- Drums from bar 3: soft kick (1, 3), snap (2, 4), closed hats on 8ths.
	const hp = new Biquad('hp');
	hp.set(7200, 0.7);
	const bp = new Biquad('bp');
	bp.set(1900, 1.1);
	for (let bar = 2; bar < BARS; bar++) {
		for (let b = 0; b < 4; b++) {
			const t = (bar * 4 + b) * BEAT;
			const s0 = Math.round(t * SR);
			if (b === 0 || b === 2) {
				let ph = 0;
				for (let i = 0; i < SR * 0.35 && s0 + i < n; i++) {
					const tt = i / SR;
					const f = 48 + 70 * Math.exp(-tt / 0.03);
					ph += f / SR;
					const v = Math.sin(2 * Math.PI * ph) * Math.exp(-tt / 0.16) * 0.34;
					L[s0 + i] += v;
					R[s0 + i] += v;
				}
			} else {
				for (let i = 0; i < SR * 0.18 && s0 + i < n; i++) {
					const tt = i / SR;
					const v = bp.process(rnd() * 2 - 1) * Math.exp(-tt / 0.045) * 0.22 + Math.sin(2 * Math.PI * 190 * tt) * Math.exp(-tt / 0.03) * 0.05;
					L[s0 + i] += v * 0.9;
					R[s0 + i] += v;
				}
			}
		}
		for (let e = 0; e < 8; e++) {
			const s0 = Math.round((bar * BAR + e * (BEAT / 2)) * SR);
			const vel = e % 2 === 1 ? 1 : 0.55;
			for (let i = 0; i < SR * 0.06 && s0 + i < n; i++) {
				const tt = i / SR;
				const v = hp.process(rnd() * 2 - 1) * Math.exp(-tt / 0.018) * 0.07 * vel;
				L[s0 + i] += v * 0.8;
				R[s0 + i] += v * 1.1;
			}
		}
	}

	reverb(L, R, 0.22, 1.5);
	for (let i = 0; i < n; i++) {
		L[i] = Math.tanh(L[i] * 1.1);
		R[i] = Math.tanh(R[i] * 1.1);
	}
	// Short fade in, long fade out at the very end (the player loops/fades anyway).
	for (let i = 0; i < SR * 0.05; i++) {
		L[i] *= i / (SR * 0.05);
		R[i] *= i / (SR * 0.05);
	}
	for (let i = 0; i < SR * 3; i++) {
		const g = i / (SR * 3);
		L[n - 1 - i] *= g;
		R[n - 1 - i] *= g;
	}
	normalize(L, R, -1.5);
	writeWav(path.join(MUSIC_DIR, BUILTIN_MUSIC.file), L, R);
	fs.writeFileSync(
		path.join(MUSIC_DIR, 'LICENSE.md'),
		`# Engine music\n\n\`${BUILTIN_MUSIC.file}\` (${BUILTIN_MUSIC.title}) is an original composition rendered entirely by\n\`engine/audio/synth-music.ts\` from oscillators, filters and an algorithmic reverb. It contains no\nsamples or third-party material. It may be used in client work, organic posts and paid advertising.\nTempo ${BPM} BPM, first beat at 0 s, ${BARS} bars.\n`,
	);
	log.ok(`Generated music bed public/engine/music/${BUILTIN_MUSIC.file} (${(n / SR).toFixed(1)} s)`);
};
