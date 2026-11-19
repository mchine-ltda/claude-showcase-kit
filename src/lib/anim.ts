import { interpolate } from 'remotion';

type Ease = (t: number) => number;

/** Clamped tween between two frames. */
export const tween = (frame: number, f0: number, f1: number, a: number, b: number, easing?: Ease) =>
	f1 <= f0
		? frame >= f1
			? b
			: a
		: interpolate(frame, [f0, f1], [a, b], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing });

/** Clamped 0..1 progress between two frames. */
export const progress = (frame: number, f0: number, f1: number, easing?: Ease) => tween(frame, f0, f1, 0, 1, easing);

/** Scale tween in log space, so zooms feel uniform in speed (perceptual scale). */
export const zoomTween = (frame: number, f0: number, f1: number, a: number, b: number, easing?: Ease) =>
	Math.exp(tween(frame, f0, f1, Math.log(a), Math.log(b), easing));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Point on a quadratic bezier, used for natural curved cursor paths. */
export const quadPoint = (p0: [number, number], c: [number, number], p1: [number, number], t: number): [number, number] => {
	const u = 1 - t;
	return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
};
