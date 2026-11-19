import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { RevealLines } from '../components/RevealLines';
import { progress, tween } from '../lib/anim';
import { eyebrowText, useType } from '../theme/identity';
import { COLORS, EASE, lighten } from '../theme/tokens';
import type { TextLines } from '../theme/text-layout';
import { templateOf } from '../templates';
import { introBeats } from '../timeline';
import type { SceneProps } from './scene-props';

/**
 * Part 1: a fast, elegant project title. The narrator starts straight away, so
 * the title lands within half a second and the website follows immediately.
 */
export const IntroScene: React.FC<SceneProps & { title: TextLines }> = ({ props, plan, title }) => {
	const frame = useCurrentFrame();
	const { width, height } = useVideoConfig();
	const u = Math.min(width, height) / 1080;
	const spec = templateOf(props);
	const b = introBeats(spec);
	const t = useType();
	const eyebrowP = progress(frame, b.eyebrowIn, b.eyebrowIn + b.eyebrowFrames, EASE.glide);
	const drift = tween(frame, 0, plan.duration, 1, spec.intro.drift, EASE.soft);
	return (
		<AbsoluteFill>
			<div
				style={{
					position: 'absolute',
					left: 0,
					right: 0,
					top: height * 0.45,
					translate: '0 -50%',
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					scale: `${drift}`,
				}}
			>
				{props.intro.eyebrow ? (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 16 * u,
							marginBottom: 40 * u,
							...eyebrowText(t, eyebrowP, u),
							color: COLORS.textMuted,
							opacity: eyebrowP,
							translate: `0 ${(1 - eyebrowP) * 12 * u}px`,
						}}
					>
						<span style={{ width: 9 * u, height: 9 * u, borderRadius: '50%', background: props.project.accent, display: 'inline-block' }} />
						<span>{props.intro.eyebrow}</span>
					</div>
				) : null}
				<RevealLines text={title} start={b.titleStart} duration={b.lineDuration} stagger={b.lineStagger} emphasisColor={lighten(props.project.accent, 0.35)} />
			</div>
		</AbsoluteFill>
	);
};
