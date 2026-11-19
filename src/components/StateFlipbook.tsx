import React from 'react';
import { Img, staticFile } from 'remotion';
import type { InteractionFrame } from '../types';

/** Progress for a captured interaction, played linearly at the site's real speed (its easing is in the frames). */
export const flipbookProgress = (frame: number, start: number, durationMs: number | undefined, fps: number) => {
	const length = Math.max(6, Math.round(((durationMs ?? 450) / 1000) * fps));
	return Math.min(1, Math.max(0, (frame - start) / length));
};

/**
 * Plays real captured interaction states (before → intermediate → after) by
 * cross-fading neighbouring frames according to `progress` (0..1).
 * The intermediate frames come from slowing the site's own CSS animations
 * during capture, so the motion shown is the website's actual behaviour.
 */
export const StateFlipbook: React.FC<{ frames: InteractionFrame[]; progress: number; width: number; height: number }> = ({
	frames,
	progress,
	width,
	height,
}) => {
	if (frames.length === 0) return null;
	const sorted = [...frames].sort((a, b) => a.t - b.t);
	const p = Math.min(1, Math.max(0, progress));
	let i = 0;
	while (i < sorted.length - 2 && sorted[i + 1].t <= p) i++;
	const a = sorted[i];
	const b = sorted[Math.min(i + 1, sorted.length - 1)];
	const local = b.t === a.t ? 1 : Math.min(1, Math.max(0, (p - a.t) / (b.t - a.t)));
	// Keep every frame mounted so images are decoded before they are needed.
	return (
		<div style={{ position: 'absolute', left: 0, top: 0, width, height }}>
			{sorted.map((f) => {
				const opacity = f === a ? 1 : f === b ? local : 0;
				return (
					<Img
						key={f.src}
						src={staticFile(f.src)}
						style={{ position: 'absolute', left: 0, top: 0, width, height, opacity, display: 'block' }}
					/>
				);
			})}
		</div>
	);
};
