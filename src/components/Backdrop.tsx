import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, withAlpha } from '../theme/tokens';

// Static grain tile. Besides texture it dithers the dark gradients, which keeps
// H.264 / Instagram re-encodes from banding.
const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent(
	`<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`,
)}")`;

export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.05 }) => (
	<AbsoluteFill style={{ backgroundImage: GRAIN, backgroundSize: '240px 240px', opacity, mixBlendMode: 'overlay', pointerEvents: 'none' }} />
);

/**
 * Charcoal stage: a soft key light above centre, a faint accent-tinted fill
 * light that drifts slowly, and a vignette. Never a glow show: the light pools
 * only separate foreground objects from black.
 */
export const Backdrop: React.FC<{
	accent: string;
	/** 0..1 strength of the accent fill light. */
	tint?: number;
	/** Vertical position of the key light, as a fraction of frame height. */
	keyY?: number;
	children?: React.ReactNode;
}> = ({ accent, tint = 0.5, keyY = 0.42, children }) => {
	const frame = useCurrentFrame();
	const { width, height, durationInFrames } = useVideoConfig();
	const drift = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1]);
	const fx = 28 + drift * 10;
	const fy = 22 + drift * 6;
	const big = Math.max(width, height);
	return (
		<AbsoluteFill style={{ backgroundColor: COLORS.charcoal, overflow: 'hidden' }}>
			<AbsoluteFill
				style={{
					background: `radial-gradient(${big * 0.7}px ${big * 0.55}px at 50% ${keyY * 100}%, ${COLORS.graphite} 0%, ${COLORS.charcoal} 55%, ${COLORS.void} 100%)`,
				}}
			/>
			<AbsoluteFill
				style={{
					background: `radial-gradient(${big * 0.55}px ${big * 0.45}px at ${fx}% ${fy}%, ${withAlpha(accent, 0.1 * tint)} 0%, transparent 70%)`,
				}}
			/>
			<AbsoluteFill
				style={{
					background: `radial-gradient(${big * 0.5}px ${big * 0.4}px at ${78 - drift * 8}% ${84 - drift * 4}%, ${withAlpha(accent, 0.05 * tint)} 0%, transparent 70%)`,
				}}
			/>
			{children}
			<AbsoluteFill
				style={{
					background: `radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)`,
					pointerEvents: 'none',
				}}
			/>
			<Grain />
		</AbsoluteFill>
	);
};
