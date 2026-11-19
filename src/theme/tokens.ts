import { Easing } from 'remotion';

// Agency-wide motion identity. Every scene pulls timing, easing and colour from
// here so all showcase films share one recognisable feel. Change these only to
// evolve the identity for every future video at once.

export const COLORS = {
	void: '#070708',
	charcoal: '#0d0d0f',
	graphite: '#17171a',
	surface: '#1d1d21',
	hairline: 'rgba(255,255,255,0.09)',
	text: '#f3f2ee',
	textSoft: 'rgba(243,242,238,0.72)',
	textMuted: 'rgba(243,242,238,0.46)',
};

export const EASE = {
	/** Long expo-out: entrances, reveals. Fast start, very soft landing. */
	glide: Easing.bezier(0.16, 1, 0.3, 1),
	/** Symmetric camera move: pans, push-ins, orbits. */
	camera: Easing.bezier(0.65, 0, 0.35, 1),
	/** Camera move with a gentle start and long settle (PageCam-style). */
	settle: Easing.bezier(0.33, 0, 0.15, 1),
	/** Exits: accelerate away. */
	exit: Easing.bezier(0.55, 0, 0.75, 0.2),
	/** Natural scroll: accelerate, cruise, long deceleration like a trackpad flick. */
	scroll: Easing.bezier(0.45, 0.05, 0.15, 1),
	soft: Easing.bezier(0.4, 0, 0.2, 1),
};

export const TIMING = {
	/** Line-by-line text reveal. */
	lineReveal: 26,
	lineStagger: 7,
	/** Minimum hold after key text lands (frames @30fps). */
	hold: 30,
	/** Internal cross-dissolve between explore shots. */
	shotDissolve: 10,
};

export const TYPE = {
	/** Headline size at 1080px frame width; scaled with frame width. */
	headline: 104,
	cta: 112,
	eyebrow: 25,
	subtitle: 38,
	contact: 30,
	tracking: { headline: '-0.035em', eyebrow: '0.32em' },
};

export const SHADOW = {
	window:
		'0 2px 0 rgba(255,255,255,0.04) inset, 0 50px 90px -30px rgba(0,0,0,0.85), 0 120px 220px -40px rgba(0,0,0,0.7)',
	device: '0 60px 120px -30px rgba(0,0,0,0.9), 0 140px 260px -60px rgba(0,0,0,0.75)',
};

/** Mix a hex colour toward white (amount 0..1). */
export const lighten = (hex: string, amount: number) => mix(hex, '#ffffff', amount);
/** Mix a hex colour toward black (amount 0..1). */
export const darken = (hex: string, amount: number) => mix(hex, '#000000', amount);

export const mix = (a: string, b: string, t: number) => {
	const pa = parseHex(a);
	const pb = parseHex(b);
	const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
	return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

export const withAlpha = (hex: string, alpha: number) => {
	const [r, g, b] = parseHex(hex);
	return `rgba(${r},${g},${b},${alpha})`;
};

const parseHex = (hex: string): [number, number, number] => {
	let h = hex.replace('#', '').trim();
	if (h.length === 3) h = h.split('').map((c) => c + c).join('');
	const n = parseInt(h.slice(0, 6), 16);
	if (Number.isNaN(n)) return [200, 200, 200];
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
