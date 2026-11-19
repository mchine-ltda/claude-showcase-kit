import React from 'react';
import { Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { COLORS, EASE } from '../theme/tokens';
import { useType } from '../theme/identity';

/**
 * Agency signature. Uses the supplied logo file when there is one; otherwise a
 * typographic wordmark with a small accent full stop. Resolves from a soft blur
 * with tracking that closes in, then holds perfectly still.
 */
export const Wordmark: React.FC<{
	name: string;
	logo: string | null;
	logoHeight: number;
	accent: string;
	start: number;
	fontSize: number;
	duration?: number;
}> = ({ name, logo, logoHeight, accent, start, fontSize, duration = 34 }) => {
	const frame = useCurrentFrame();
	const t = useType();
	const p = interpolate(frame, [start, start + duration], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.glide });
	const common: React.CSSProperties = {
		opacity: interpolate(p, [0, 0.4, 1], [0, 0.8, 1]),
		filter: `blur(${(1 - p) * 12}px)`,
		translate: `0 ${(1 - p) * 26}px`,
	};
	if (logo) {
		return (
			<div style={{ ...common, display: 'flex', justifyContent: 'center' }}>
				<Img src={staticFile(logo)} style={{ height: logoHeight, width: 'auto', display: 'block' }} />
			</div>
		);
	}
	return (
		<div
			style={{
				...common,
				fontFamily: t.display,
				fontWeight: 600,
				fontSize,
				color: COLORS.text,
				letterSpacing: `${-0.02 + (1 - p) * 0.14}em`,
				whiteSpace: 'nowrap',
				display: 'flex',
				alignItems: 'baseline',
			}}
		>
			<span>{name}</span>
			<span style={{ color: accent, marginLeft: fontSize * 0.04 }}>.</span>
		</div>
	);
};
