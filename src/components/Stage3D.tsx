import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';

/**
 * Places a design-size object in 2.5D space.
 *
 * Magnification uses the CSS `zoom` property instead of `transform: scale()`.
 * Chromium rasterises 3D-transformed layers at their layout size; with `zoom`
 * the layout box itself is enlarged, so page screenshots are sampled down from
 * their 2x/3x sources and text stays crisp even during close push-ins.
 * (Technique adapted from video-shotcraft's PageCam, Apache-2.0.)
 *
 * Coordinates: the design-space pivot (originX, originY) lands at screen (x, y).
 * With zoom z, a local translate T renders as T*z device px, so
 * (origin + T) * z = screen  =>  T = screen / z - origin.
 */
export const Stage3D: React.FC<{
	width: number;
	height: number;
	x: number;
	y: number;
	scale: number;
	rotateX?: number;
	rotateY?: number;
	rotateZ?: number;
	/** Translation along the viewing axis in screen px (negative = farther). */
	translateZ?: number;
	perspective?: number;
	originX?: number;
	originY?: number;
	opacity?: number;
	style?: React.CSSProperties;
	children: React.ReactNode;
}> = ({
	width,
	height,
	x,
	y,
	scale,
	rotateX = 0,
	rotateY = 0,
	rotateZ = 0,
	translateZ = 0,
	perspective = 2600,
	originX = width / 2,
	originY = height / 2,
	opacity = 1,
	style,
	children,
}) => {
	const { width: W, height: H } = useVideoConfig();
	const z = Math.max(0.01, scale);
	const tx = x / z - originX;
	const ty = y / z - originY;
	return (
		<AbsoluteFill style={{ perspective: `${perspective}px`, perspectiveOrigin: `${W / 2}px ${H / 2}px`, opacity }}>
			<div
				style={{
					position: 'absolute',
					left: 0,
					top: 0,
					width,
					height,
					zoom: z,
					transform: `translate3d(${tx}px, ${ty}px, ${translateZ / z}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg)`,
					transformOrigin: `${originX}px ${originY}px`,
					transformStyle: 'preserve-3d',
					...style,
				}}
			>
				{children}
			</div>
		</AbsoluteFill>
	);
};
