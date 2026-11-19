import fs from 'node:fs';
import path from 'node:path';
import { ENGINE_ROOT, ensureDir, log } from '../lib/util';

// Procedural sound design for the template. Every sound is synthesised from
// scratch here (noise, oscillators, filters, a small reverb), so the files are
// original works of this project with no third-party licence attached.
// Deterministic: fixed seeds produce identical files on every run.

export const SR = 48000;

export const mulberry32 = (seed: number) => () => {
	seed |= 0;
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** RBJ biquad with per-sample coefficient updates (for sweeps). */
export class Biquad {
	private x1 = 0;
	private x2 = 0;
	private y1 = 0;
	private y2 = 0;
	private b0 = 1;
	private b1 = 0;
	private b2 = 0;
	private a1 = 0;
	private a2 = 0;
	constructor(private type: 'lp' | 'hp' | 'bp') {}
	set(freq: number, q: number) {
		const w = (2 * Math.PI * Math.min(freq, SR * 0.45)) / SR;
		const cos = Math.cos(w);
		const alpha = Math.sin(w) / (2 * q);
		const a0 = 1 + alpha;
		if (this.type === 'lp') {
			this.b0 = (1 - cos) / 2 / a0;
			this.b1 = (1 - cos) / a0;
			this.b2 = (1 - cos) / 2 / a0;
		} else if (this.type === 'hp') {
			this.b0 = (1 + cos) / 2 / a0;
			this.b1 = -(1 + cos) / a0;
			this.b2 = (1 + cos) / 2 / a0;
		} else {
			this.b0 = alpha / a0;
			this.b1 = 0;
			this.b2 = -alpha / a0;
		}
		this.a1 = (-2 * cos) / a0;
		this.a2 = (1 - alpha) / a0;
	}
	process(x: number) {
		const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
		this.x2 = this.x1;
		this.x1 = x;
		this.y2 = this.y1;
		this.y1 = y;
		return y;
	}
}

/** Small stereo Schroeder reverb: 4 combs + 2 allpasses per channel, decorrelated. */
export const reverb = (L: Float32Array, R: Float32Array, wet: number, size = 1) => {
	const make = (delays: number[], fb: number) => delays.map((d) => ({ buf: new Float32Array(Math.round(d * size)), i: 0, fb, lp: 0 }));
	const run = (input: Float32Array, combs: ReturnType<typeof make>, aps: ReturnType<typeof make>) => {
		const out = new Float32Array(input.length);
		for (let n = 0; n < input.length; n++) {
			let s = 0;
			for (const c of combs) {
				const y = c.buf[c.i];
				c.lp = y * 0.7 + c.lp * 0.3; // damping
				c.buf[c.i] = input[n] + c.lp * c.fb;
				c.i = (c.i + 1) % c.buf.length;
				s += y;
			}
			s *= 0.25;
			for (const a of aps) {
				// Freeverb-style allpass diffuser.
				const y = a.buf[a.i];
				a.buf[a.i] = s + y * a.fb;
				a.i = (a.i + 1) % a.buf.length;
				s = y - s;
			}
			out[n] = s;
		}
		return out;
	};
	const wl = run(L, make([1557, 1617, 1491, 1422], 0.82), make([225, 556], 0.5));
	const wr = run(R, make([1580, 1640, 1514, 1445], 0.82), make([248, 579], 0.5));
	for (let n = 0; n < L.length; n++) {
		L[n] = L[n] * (1 - wet * 0.4) + wl[n] * wet;
		R[n] = R[n] * (1 - wet * 0.4) + wr[n] * wet;
	}
};

const smooth = (t: number) => t * t * (3 - 2 * t);

export const normalize = (L: Float32Array, R: Float32Array, peakDb: number) => {
	let peak = 0;
	for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
	const g = peak > 0 ? Math.pow(10, peakDb / 20) / peak : 0;
	for (let i = 0; i < L.length; i++) {
		L[i] *= g;
		R[i] *= g;
	}
};

/** Fade the last `ms` to silence to avoid clicks. */
const tailFade = (L: Float32Array, R: Float32Array, ms: number) => {
	const n = Math.min(L.length, Math.round((ms / 1000) * SR));
	for (let i = 0; i < n; i++) {
		const g = i / n;
		L[L.length - 1 - i] *= g;
		R[R.length - 1 - i] *= g;
	}
};

export const writeWav = (file: string, L: Float32Array, R: Float32Array) => {
	const n = L.length;
	const buf = Buffer.alloc(44 + n * 4);
	buf.write('RIFF', 0);
	buf.writeUInt32LE(36 + n * 4, 4);
	buf.write('WAVE', 8);
	buf.write('fmt ', 12);
	buf.writeUInt32LE(16, 16);
	buf.writeUInt16LE(1, 20);
	buf.writeUInt16LE(2, 22);
	buf.writeUInt32LE(SR, 24);
	buf.writeUInt32LE(SR * 4, 28);
	buf.writeUInt16LE(4, 32);
	buf.writeUInt16LE(16, 34);
	buf.write('data', 36);
	buf.writeUInt32LE(n * 4, 40);
	for (let i = 0; i < n; i++) {
		const l = Math.max(-1, Math.min(1, L[i]));
		const r = Math.max(-1, Math.min(1, R[i]));
		buf.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
		buf.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
	}
	fs.writeFileSync(file, buf);
};

type Stereo = { L: Float32Array; R: Float32Array };
const alloc = (seconds: number): Stereo => ({ L: new Float32Array(Math.round(seconds * SR)), R: new Float32Array(Math.round(seconds * SR)) });

/** Air movement past the camera: band-passed noise swelling to `peak`, panning across. */
const whoosh = (seconds: number, peak: number, lo: number, hi: number, seed: number, wet: number): Stereo => {
	const out = alloc(seconds);
	const rl = mulberry32(seed);
	const rr = mulberry32(seed + 7);
	const layers = [
		{ f: new Biquad('bp'), g: new Biquad('bp'), mul: 1, q: 0.8 },
		{ f: new Biquad('bp'), g: new Biquad('bp'), mul: 2.6, q: 1.4 },
	];
	let pinkL = 0;
	let pinkR = 0;
	for (let i = 0; i < out.L.length; i++) {
		const t = i / SR;
		const rise = t < peak ? smooth(t / peak) : Math.exp(-(t - peak) / ((seconds - peak) * 0.32));
		const env = Math.pow(rise, 1.6);
		const sweep = t < peak ? lo + (hi - lo) * smooth(t / peak) : hi - (hi - lo) * 0.6 * smooth(Math.min(1, (t - peak) / (seconds - peak)));
		pinkL = 0.97 * pinkL + 0.03 * (rl() * 2 - 1) * 6;
		pinkR = 0.97 * pinkR + 0.03 * (rr() * 2 - 1) * 6;
		const nl = (rl() * 2 - 1) * 0.5 + pinkL;
		const nr = (rr() * 2 - 1) * 0.5 + pinkR;
		let sl = 0;
		let sr = 0;
		for (const ly of layers) {
			if (i % 32 === 0) {
				ly.f.set(sweep * ly.mul, ly.q);
				ly.g.set(sweep * ly.mul * 1.04, ly.q);
			}
			sl += ly.f.process(nl) / ly.mul;
			sr += ly.g.process(nr) / ly.mul;
		}
		const pan = -0.5 + Math.min(1, t / seconds) * 1.0;
		out.L[i] = sl * env * (1 - pan * 0.5);
		out.R[i] = sr * env * (1 + pan * 0.5);
	}
	reverb(out.L, out.R, wet, 1.1);
	tailFade(out.L, out.R, 60);
	return out;
};

/** Soft, low impact: a sub thump with a short body, no trailer clang. */
const impact = (seconds: number, seed: number): Stereo => {
	const out = alloc(seconds);
	const rnd = mulberry32(seed);
	const lp = new Biquad('lp');
	lp.set(700, 0.7);
	let phase = 0;
	for (let i = 0; i < out.L.length; i++) {
		const t = i / SR;
		const f = 40 + 26 * Math.exp(-t / 0.07);
		phase += (2 * Math.PI * f) / SR;
		const attack = Math.min(1, t / 0.004);
		const sub = Math.sin(phase) * attack * Math.exp(-t / 0.32);
		const body = lp.process(rnd() * 2 - 1) * Math.exp(-t / 0.045) * 0.9;
		const s = Math.tanh((sub * 0.95 + body) * 1.3);
		out.L[i] = s;
		out.R[i] = s;
	}
	reverb(out.L, out.R, 0.32, 1.4);
	tailFade(out.L, out.R, 200);
	return out;
};

/** Tension build: noise and a gliding tone rising into the downbeat. */
const riser = (seconds: number, seed: number): Stereo => {
	const out = alloc(seconds);
	const rl = mulberry32(seed);
	const rr = mulberry32(seed + 3);
	const bl = new Biquad('bp');
	const br = new Biquad('bp');
	let phase = 0;
	const endT = seconds - 0.06;
	for (let i = 0; i < out.L.length; i++) {
		const t = i / SR;
		const p = Math.min(1, t / endT);
		const env = Math.pow(p, 2.4) * (t > endT ? Math.max(0, 1 - (t - endT) / 0.05) : 1);
		const fc = 260 * Math.pow(5200 / 260, p);
		if (i % 32 === 0) {
			bl.set(fc, 2.2);
			br.set(fc * 1.03, 2.2);
		}
		const f = 150 * Math.pow(4, p);
		phase += (2 * Math.PI * f * (1 + 0.004 * Math.sin(2 * Math.PI * 5 * t))) / SR;
		const tone = Math.sin(phase) * 0.12 + Math.sin(phase * 2.01) * 0.05;
		out.L[i] = (bl.process(rl() * 2 - 1) * 1.4 + tone) * env;
		out.R[i] = (br.process(rr() * 2 - 1) * 1.4 + tone) * env;
	}
	reverb(out.L, out.R, 0.18, 1);
	return out;
};

/** Gentle signature tone: a soft glassy bell (fifth above) with a long tail. */
const chime = (seconds: number): Stereo => {
	const out = alloc(seconds);
	const notes = [
		{ f: 523.25, at: 0, amp: 1 },
		{ f: 783.99, at: 0.055, amp: 0.55 },
	];
	const partials = [
		{ r: 1, a: 1, tau: 1.15 },
		{ r: 2.0, a: 0.22, tau: 0.6 },
		{ r: 2.76, a: 0.12, tau: 0.38 },
		{ r: 5.4, a: 0.03, tau: 0.16 },
	];
	for (let i = 0; i < out.L.length; i++) {
		const t = i / SR;
		let s = 0;
		for (const n of notes) {
			const tt = t - n.at;
			if (tt < 0) continue;
			const att = Math.min(1, tt / 0.008);
			for (const p of partials) s += Math.sin(2 * Math.PI * n.f * p.r * tt) * p.a * n.amp * att * Math.exp(-tt / p.tau);
		}
		out.L[i] = s * 0.9;
		out.R[i] = s * 0.9;
	}
	const lp = [new Biquad('lp'), new Biquad('lp')];
	lp.forEach((f) => f.set(3800, 0.7));
	for (let i = 0; i < out.L.length; i++) {
		out.L[i] = lp[0].process(out.L[i]);
		out.R[i] = lp[1].process(out.R[i]);
	}
	reverb(out.L, out.R, 0.5, 1.6);
	tailFade(out.L, out.R, 400);
	return out;
};

/** Mouse click: press + release transients, plastic not synthetic. */
const click = (seed: number): Stereo => {
	const out = alloc(0.25);
	const rnd = mulberry32(seed);
	const hp = new Biquad('hp');
	hp.set(1800, 0.8);
	const bp = new Biquad('bp');
	bp.set(3400, 4);
	for (let i = 0; i < out.L.length; i++) {
		const t = i / SR;
		let s = 0;
		for (const [at, g] of [
			[0, 1],
			[0.075, 0.55],
		]) {
			const tt = t - at;
			if (tt < 0) continue;
			const n = rnd() * 2 - 1;
			s += (hp.process(n) * Math.exp(-tt / 0.0035) + bp.process(n) * Math.exp(-tt / 0.008) * 0.8) * g;
		}
		out.L[i] = s;
		out.R[i] = s;
	}
	reverb(out.L, out.R, 0.08, 0.6);
	tailFade(out.L, out.R, 40);
	return out;
};

/** Touch tap: a soft, muted tick. */
const tap = (seed: number): Stereo => {
	const out = alloc(0.3);
	const rnd = mulberry32(seed);
	const lp = new Biquad('lp');
	lp.set(2600, 0.9);
	for (let i = 0; i < out.L.length; i++) {
		const t = i / SR;
		const s = lp.process(rnd() * 2 - 1) * Math.exp(-t / 0.006) + Math.sin(2 * Math.PI * 1150 * t) * Math.exp(-t / 0.014) * 0.35;
		out.L[i] = s;
		out.R[i] = s;
	}
	reverb(out.L, out.R, 0.1, 0.6);
	tailFade(out.L, out.R, 50);
	return out;
};

/** Slow evolving pad (A major add9), seamless loop. Off by default. */
const ambientBed = (): Stereo => {
	const loop = 16;
	const xf = 2;
	const out = alloc(loop + xf);
	const freqs = [110, 164.81, 220, 277.18, 329.63, 493.88];
	const rnd = mulberry32(99);
	const air = [new Biquad('bp'), new Biquad('bp')];
	air.forEach((f) => f.set(2400, 0.6));
	for (let i = 0; i < out.L.length; i++) {
		const t = i / SR;
		let l = 0;
		let r = 0;
		freqs.forEach((f, k) => {
			const lfo = 0.55 + 0.45 * Math.sin((2 * Math.PI * t) / (loop / (k % 3 === 0 ? 1 : 2)) + k);
			const a = (k < 2 ? 0.5 : 0.28) * lfo;
			l += Math.sin(2 * Math.PI * f * 0.9985 * t + k) * a;
			r += Math.sin(2 * Math.PI * f * 1.0015 * t + k * 1.3) * a;
		});
		out.L[i] = l * 0.2 + air[0].process(rnd() * 2 - 1) * 0.04;
		out.R[i] = r * 0.2 + air[1].process(rnd() * 2 - 1) * 0.04;
	}
	reverb(out.L, out.R, 0.45, 1.8);
	// Crossfade tail into head for a seamless loop.
	const n = Math.round(loop * SR);
	const x = Math.round(xf * SR);
	const L = out.L.slice(0, n);
	const R = out.R.slice(0, n);
	for (let i = 0; i < x; i++) {
		const g = i / x;
		L[i] = L[i] * g + out.L[n + i] * (1 - g);
		R[i] = R[i] * g + out.R[n + i] * (1 - g);
	}
	return { L, R };
};

export const SFX_DIR = path.join(ENGINE_ROOT, 'public', 'engine', 'sfx');

export const generateSfx = () => {
	ensureDir(SFX_DIR);
	const sounds: Record<string, { s: Stereo; peak: number; desc: string }> = {
		'whoosh-soft': { s: whoosh(0.9, 0.45, 300, 2300, 11, 0.22), peak: -7, desc: 'short air pass for text reveals and soft cuts' },
		'whoosh-long': { s: whoosh(1.5, 0.85, 180, 1900, 23, 0.28), peak: -5, desc: 'longer pass for device entrances' },
		'impact-soft': { s: impact(1.6, 5), peak: -4, desc: 'low, soft landing thump for objects settling' },
		riser: { s: riser(1.8, 41), peak: -8, desc: 'filtered build into the wordmark' },
		chime: { s: chime(2.6), peak: -9, desc: 'gentle glass bell for the agency signature' },
		click: { s: click(17), peak: -10, desc: 'mouse click (press and release)' },
		tap: { s: tap(29), peak: -12, desc: 'muted touch tick' },
		swipe: { s: whoosh(0.6, 0.22, 1500, 5200, 61, 0.12), peak: -14, desc: 'light airy scroll gesture' },
		'ambient-bed': { s: ambientBed(), peak: -16, desc: 'optional evolving pad, loops every 16 s' },
	};
	const manifest: Record<string, unknown> = {};
	for (const [name, { s, peak, desc }] of Object.entries(sounds)) {
		normalize(s.L, s.R, peak);
		writeWav(path.join(SFX_DIR, `${name}.wav`), s.L, s.R);
		manifest[name] = { file: `${name}.wav`, seconds: Math.round((s.L.length / SR) * 100) / 100, peakDbfs: peak, description: desc };
		log.info(`sfx ${name}.wav`);
	}
	fs.writeFileSync(
		path.join(SFX_DIR, 'LICENSE.md'),
		`# Engine sound effects\n\nAll files in this folder are synthesised from scratch by \`engine/audio/synth-sfx.ts\`\n(oscillators, filtered noise and an algorithmic reverb). They contain no samples or\nrecordings from third parties, so no external licence applies. They may be used in\nclient work, organic posts and paid advertising. Regenerate with \`npm run showcase -- sfx\`.\n\n${Object.entries(
			manifest,
		)
			.map(([k, v]) => `- \`${k}.wav\`: ${(v as { description: string }).description}`)
			.join('\n')}\n`,
	);
	fs.writeFileSync(path.join(SFX_DIR, 'sfx.json'), JSON.stringify({ generator: 'engine/audio/synth-sfx.ts', sampleRate: SR, sounds: manifest }, null, 2) + '\n');
	log.ok(`Generated ${Object.keys(sounds).length} sounds in public/engine/sfx`);
};
