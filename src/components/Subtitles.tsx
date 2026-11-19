import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { FORMATS, stageBands, type Format } from '../layout';
import { progress } from '../lib/anim';
import { useType } from '../theme/identity';
import { EASE } from '../theme/tokens';
import type { LinePlan } from '../timeline';

/** Split a narration line into short, readable caption chunks (breaks at punctuation first). */
export const chunkLine = (text: string, maxWords = 8, maxChars = 40) => {
	const words = text.split(/\s+/).filter(Boolean);
	const chunks: string[] = [];
	let cur: string[] = [];
	for (const w of words) {
		const next = [...cur, w].join(' ');
		// A word that ends the sentence may run a little long rather than be left on its own.
		const fits = next.length <= maxChars || (/[.?!]$/.test(w) && next.length <= maxChars + 6);
		if (cur.length && (cur.length >= maxWords || !fits)) {
			chunks.push(cur.join(' '));
			cur = [];
		}
		cur.push(w);
		if (/[,.;:?!—]$/.test(w) && cur.length >= 3) {
			chunks.push(cur.join(' '));
			cur = [];
		}
	}
	if (cur.length) chunks.push(cur.join(' '));
	// Avoid orphan fragments ("easy to use."): fold short pieces into their neighbour.
	for (let i = chunks.length - 1; i > 0; i--) {
		const words = chunks[i].split(' ').length;
		if (words <= 3 && (chunks[i - 1] + ' ' + chunks[i]).length <= maxChars + 14) {
			chunks[i - 1] = `${chunks[i - 1]} ${chunks[i]}`;
			chunks.splice(i, 1);
		}
	}
	return chunks;
};

/** Chunk timings inside a line, proportional to their length. */
export const chunkTimings = (plan: LinePlan) => {
	const chunks = chunkLine(plan.line.text);
	const weights = chunks.map((c) => c.length + 6);
	const total = weights.reduce((a, b) => a + b, 0);
	let cursor = plan.from;
	return chunks.map((text, i) => {
		const duration = i === chunks.length - 1 ? plan.from + plan.duration - cursor : Math.round((plan.duration * weights[i]) / total);
		const c = { text, from: cursor, duration };
		cursor += duration;
		return c;
	});
};

/**
 * Minimal captions for sound-off viewing: one short phrase at a time, in the
 * band under the device, always inside the Reels safe area.
 */
export const Subtitles: React.FC<{ lines: LinePlan[]; format: Format }> = ({ lines, format }) => {
	const frame = useCurrentFrame();
	const { width } = useVideoConfig();
	const t = useType();
	const f = FORMATS[format];
	const u = Math.min(f.width, f.height) / 1080;
	const bands = stageBands(format, true);
	const cx = width / 2;
	const maxWidth = 2 * Math.min(cx - f.safe.left, width - f.safe.right - cx);
	const active = lines.flatMap(chunkTimings).find((c) => frame >= c.from - 2 && frame < c.from + c.duration + 2);
	if (!active) return null;
	const inP = progress(frame, active.from - 2, active.from + 4, EASE.glide);
	const outP = 1 - progress(frame, active.from + active.duration - 2, active.from + active.duration + 2, EASE.soft);
	return (
		<AbsoluteFill style={{ pointerEvents: 'none' }}>
			<div
				style={{
					position: 'absolute',
					left: cx - maxWidth / 2,
					width: maxWidth,
					top: bands.subtitleTop,
					height: bands.subtitleBottom - bands.subtitleTop,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
				}}
			>
				<div
					style={{
						fontFamily: t.body,
						fontWeight: 500,
						fontSize: 44 * u,
						lineHeight: 1.22,
						letterSpacing: '-0.012em',
						color: '#f6f5f2',
						textAlign: 'center',
						textWrap: 'balance',
						textShadow: '0 2px 14px rgba(0,0,0,0.55)',
						opacity: Math.min(inP, outP),
						translate: `0 ${(1 - inP) * 8 * u}px`,
					}}
				>
					{active.text}
				</div>
			</div>
		</AbsoluteFill>
	);
};
