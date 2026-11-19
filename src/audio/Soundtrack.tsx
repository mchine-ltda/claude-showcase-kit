import React from 'react';
import { Audio } from '@remotion/media';
import { interpolate, Sequence, staticFile, useVideoConfig } from 'remotion';
import type { ShowcaseProps } from '../schema';
import { buildSfxCues, SFX_LENGTH_SECONDS, type Timeline } from '../timeline';

/**
 * Narration + music bed with automatic ducking + frame-pinned sound effects.
 * The music dips smoothly whenever the narrator speaks and recovers between
 * lines; SFX sit quietly underneath. Music is either the engine's own
 * synthesised bed or a licensed track recorded in the project config.
 */
export const Soundtrack: React.FC<{ props: ShowcaseProps; timeline: Timeline }> = ({ props, timeline }) => {
	const { fps, durationInFrames } = useVideoConfig();
	const { music, sfx } = props.audio;
	const cues = sfx.enabled ? buildSfxCues(props, timeline) : [];
	const mix = timeline.spec.mix;
	const attack = Math.round(fps * mix.attackSeconds);
	const release = Math.round(fps * mix.releaseSeconds);
	// Duck amount at a frame: 1 while speaking, easing in before each line and out after it.
	const duckAt = (f: number) => {
		let d = 0;
		for (const l of timeline.lines) {
			const a = l.from - attack;
			const b = l.from + l.duration + release;
			if (f < a || f > b) continue;
			const v = f < l.from ? (f - a) / attack : f > l.from + l.duration ? 1 - (f - l.from - l.duration) / release : 1;
			d = Math.max(d, v);
		}
		return d;
	};
	return (
		<>
			{timeline.lines.map((l) => (
				<Sequence key={l.line.id} from={l.from} durationInFrames={l.duration + 6} name={`Narration: ${l.line.text.slice(0, 40)}`} layout="none">
					<Audio src={staticFile(l.line.src)} volume={props.narration.volume} />
				</Sequence>
			))}
			{music ? (
				<Audio
					name="Music"
					src={staticFile(music.src)}
					trimBefore={Math.round(music.startAtSeconds * fps)}
					loop
					volume={(f) => {
						const fade = interpolate(f, [0, fps * mix.fadeInSeconds, durationInFrames - fps * mix.fadeOutSeconds, durationInFrames - 1], [0, 1, 1, 0], {
							extrapolateLeft: 'clamp',
							extrapolateRight: 'clamp',
						});
						const d = duckAt(f);
						return fade * (music.volume * (1 - d) + music.duckTo * d);
					}}
				/>
			) : null}
			{cues.map((c, i) => (
				<Sequence key={`${c.name}-${i}`} from={c.frame} durationInFrames={Math.ceil(SFX_LENGTH_SECONDS[c.name] * fps) + 2} name={`SFX ${c.name} (${c.note})`} layout="none">
					<Audio src={staticFile(`engine/sfx/${c.name}.wav`)} volume={Math.min(1, c.volume * sfx.volume)} />
				</Sequence>
			))}
		</>
	);
};
