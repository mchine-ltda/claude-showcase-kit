import React from 'react';
import { interpolate } from 'remotion';
import { EASE } from '../theme/tokens';

/** Desktop arrow cursor, slightly oversized so it reads on a phone screen. */
export const Cursor: React.FC<{ x: number; y: number; size?: number; pressed?: number; opacity?: number }> = ({
	x,
	y,
	size = 40,
	pressed = 0,
	opacity = 1,
}) => (
	<div
		style={{
			position: 'absolute',
			left: x,
			top: y,
			width: size,
			height: size,
			opacity,
			scale: `${1 - pressed * 0.12}`,
			transformOrigin: '6% 4%',
			filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.35))',
			pointerEvents: 'none',
		}}
	>
		<svg viewBox="0 0 28 28" width={size} height={size}>
			<path
				d="M5 3.2v19.1c0 .7.8 1 1.3.6l4.4-4.1 3.2 7.2c.2.5.8.7 1.3.5l2.6-1.1c.5-.2.7-.8.5-1.3l-3.2-7.1 6-.4c.7 0 1-.9.5-1.4L6.4 2.6C5.9 2.2 5 2.5 5 3.2Z"
				fill="#fff"
				stroke="#111"
				strokeWidth={1.4}
				strokeLinejoin="round"
			/>
		</svg>
	</div>
);

/** Soft touch indicator: a ring that presses in and fades, like a recorded tap. */
export const TapRing: React.FC<{ x: number; y: number; frame: number; at: number; size?: number }> = ({ x, y, frame, at, size = 62 }) => {
	const t = frame - at;
	if (t < -8 || t > 22) return null;
	const appear = interpolate(t, [-8, 0], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.glide });
	const release = interpolate(t, [2, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.soft });
	const scale = t < 0 ? 1.25 - appear * 0.25 : 1 - Math.min(1, t / 3) * 0.12 + release * 0.5;
	return (
		<div
			style={{
				position: 'absolute',
				left: x - size / 2,
				top: y - size / 2,
				width: size,
				height: size,
				borderRadius: '50%',
				background: 'rgba(255,255,255,0.2)',
				boxShadow: '0 0 0 1.5px rgba(255,255,255,0.8), 0 3px 14px rgba(0,0,0,0.22)',
				opacity: appear * (1 - release),
				scale: `${scale}`,
				pointerEvents: 'none',
			}}
		/>
	);
};
