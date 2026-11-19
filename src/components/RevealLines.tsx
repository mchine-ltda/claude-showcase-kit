import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { EASE, COLORS } from '../theme/tokens';
import { FONTS } from '../theme/fonts';
import { useType } from '../theme/identity';
import { SERIF_SCALE, type TextLines } from '../theme/text-layout';

/**
 * Statement typography revealed line by line: each line rises out of its own
 * mask while de-blurring and tightening its tracking a touch. Lines were
 * measured and balanced beforehand, so nothing clips at any frame.
 */
export const RevealLines: React.FC<{
	text: TextLines;
	start: number;
	duration?: number;
	stagger?: number;
	color?: string;
	emphasisColor: string;
	lineHeight?: number;
	align?: 'center' | 'left';
}> = ({ text, start, duration = 26, stagger = 7, color = COLORS.text, emphasisColor, lineHeight = 1.04, align = 'center' }) => {
	const frame = useCurrentFrame();
	const t = useType();
	const { fontSize } = text;
	const space = fontSize * 0.26;
	return (
		<div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'center' ? 'center' : 'flex-start' }}>
			{text.lines.map((line, i) => {
				const s = start + i * stagger;
				const p = interpolate(frame, [s, s + duration], [0, 1], {
					extrapolateLeft: 'clamp',
					extrapolateRight: 'clamp',
					easing: EASE.glide,
				});
				return (
					<div
						key={i}
						style={{
							overflow: 'hidden',
							// Room for descenders and the italic overhang inside the mask.
							padding: `${fontSize * 0.06}px ${fontSize * 0.12}px ${fontSize * 0.16}px`,
							margin: `${-fontSize * 0.06}px ${-fontSize * 0.12}px ${-fontSize * 0.16}px`,
							lineHeight,
						}}
					>
						<div
							style={{
								display: 'flex',
								alignItems: 'baseline',
								whiteSpace: 'nowrap',
								translate: `0 ${(1 - p) * 112}%`,
								filter: `blur(${(1 - p) * 10}px)`,
								opacity: interpolate(p, [0, 0.35, 1], [0, 0.85, 1]),
								letterSpacing: `${parseFloat(t.tracking) + (1 - p) * 0.02}em`,
							}}
						>
							{line.map((w, j) => {
								const glue = /^[.,!?;:…)]+$/.test(w.text);
								return (
									<span
										key={j}
										style={{
											marginLeft: j === 0 || glue ? 0 : space,
											fontFamily: w.emphasis ? FONTS.serif : t.display,
											fontStyle: w.emphasis ? 'italic' : 'normal',
											fontWeight: w.emphasis ? 400 : 600,
											fontSize: w.emphasis ? fontSize * SERIF_SCALE : fontSize,
											letterSpacing: w.emphasis ? '-0.01em' : t.tracking,
											color: w.emphasis ? emphasisColor : color,
										}}
									>
										{w.text}
									</span>
								);
							})}
						</div>
					</div>
				);
			})}
		</div>
	);
};
