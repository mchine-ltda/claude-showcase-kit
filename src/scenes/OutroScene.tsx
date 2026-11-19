import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { RevealLines } from '../components/RevealLines';
import { Wordmark } from '../components/Wordmark';
import { progress, tween } from '../lib/anim';
import { useType } from '../theme/identity';
import { COLORS, EASE, lighten, TYPE } from '../theme/tokens';
import type { TextLines } from '../theme/text-layout';
import { templateOf } from '../templates';
import { outroBeats } from '../timeline';
import type { SceneProps } from './scene-props';

/**
 * Part 4: back to the agency's dark identity, fast. The CTA mirrors the opening
 * typography (bookend), a hairline draws, the signature resolves and holds,
 * then everything dims to black so the Reel loops cleanly into the hook.
 */
export const OutroScene: React.FC<SceneProps & { cta: TextLines }> = ({ props, plan, cta }) => {
	const frame = useCurrentFrame();
	const { width, height } = useVideoConfig();
	const u = Math.min(width, height) / 1080;
	const o = templateOf(props).outro;
	const t = useType();
	const b = outroBeats(plan.duration, plan.enter, templateOf(props));
	const rule = progress(frame, b.ruleIn, b.ruleIn + o.ruleFrames, EASE.glide);
	const sub = progress(frame, b.subtitleIn, b.subtitleIn + o.textFrames, EASE.glide);
	const contact = progress(frame, b.contactIn, b.contactIn + o.textFrames, EASE.glide);
	const out = 1 - progress(frame, b.fadeOutStart, plan.duration - 1, EASE.soft);
	const drift = tween(frame, 0, plan.duration, 1, o.drift, EASE.soft);
	return (
		<AbsoluteFill style={{ opacity: out }}>
			<div
				style={{
					position: 'absolute',
					left: 0,
					right: 0,
					top: height * 0.455,
					translate: '0 -50%',
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					scale: `${drift}`,
				}}
			>
				<RevealLines text={cta} start={b.ctaStart} duration={o.ctaDuration} stagger={o.ctaStagger} emphasisColor={lighten(props.agency.accent, 0.3)} />
				<div
					style={{
						width: 96 * u,
						height: 2 * u,
						marginTop: 64 * u,
						marginBottom: 54 * u,
						background: props.agency.accent,
						scale: `${rule} 1`,
						opacity: rule,
					}}
				/>
				<Wordmark
					name={props.agency.name}
					logo={props.agency.logo}
					logoHeight={props.agency.logoHeight * u}
					accent={props.agency.accent}
					start={b.markIn}
					duration={o.wordmarkFrames}
					fontSize={66 * u}
				/>
				{props.agency.subtitle ? (
					<div
						style={{
							marginTop: 26 * u,
							fontFamily: t.body,
							fontWeight: 400,
							fontSize: TYPE.subtitle * u,
							letterSpacing: '-0.005em',
							color: COLORS.textSoft,
							opacity: sub,
							translate: `0 ${(1 - sub) * 14 * u}px`,
							whiteSpace: 'nowrap',
						}}
					>
						{props.agency.subtitle}
					</div>
				) : null}
				{props.agency.contact ? (
					<div
						style={{
							marginTop: 40 * u,
							fontFamily: t.body,
							fontWeight: 500,
							fontSize: TYPE.contact * u,
							letterSpacing: '0.04em',
							color: COLORS.textMuted,
							opacity: contact,
							translate: `0 ${(1 - contact) * 10 * u}px`,
							whiteSpace: 'nowrap',
						}}
					>
						{props.agency.contact}
					</div>
				) : null}
			</div>
		</AbsoluteFill>
	);
};
