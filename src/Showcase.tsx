import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { linearTiming, TransitionSeries } from '@remotion/transitions';
import { Soundtrack } from './audio/Soundtrack';
import { Backdrop } from './components/Backdrop';
import { SafeAreaGuide } from './components/SafeAreaGuide';
import { Subtitles } from './components/Subtitles';
import type { SegmentKey, ShowcaseProps } from './schema';
import { CoverIntro } from './scenes/CoverIntro';
import { IntroScene } from './scenes/IntroScene';
import { OutroScene } from './scenes/OutroScene';
import { WalkthroughScene } from './scenes/WalkthroughScene';
import { TypeProvider } from './theme/identity';
import type { TextLines } from './theme/text-layout';
import { buildTimeline, type ScenePlan, type Timeline } from './timeline';
import { depthDissolve } from './transitions/depthDissolve';
import { pushSlide } from './transitions/pushSlide';

export type ComputedLayout = { title: TextLines; cta: TextLines; coverTitle?: TextLines };
export type ShowcaseRenderProps = ShowcaseProps & { layout?: ComputedLayout };

const EMPTY: TextLines = { fontSize: 100, lines: [], lineWidths: [] };

const SCENE_NAMES: Record<SegmentKey, string> = {
	intro: '1 · Intro',
	desktop: '2 · Desktop walkthrough',
	mobile: '3 · Mobile walkthrough',
	outro: '4 · Outro',
};

export const Showcase: React.FC<ShowcaseRenderProps> = (props) => {
	const { fps } = useVideoConfig();
	const timeline = buildTimeline(props, fps);
	const tr = timeline.spec.transitions;
	const layout = props.layout ?? { title: EMPTY, cta: EMPTY };
	return (
		<TypeProvider identity={props.identity}>
			<AbsoluteFill style={{ backgroundColor: '#070708' }}>
				<StageLight props={props} timeline={timeline} />
				<TransitionSeries name="Scenes">
					{timeline.scenes.flatMap((s, i) => {
						const nodes: React.ReactNode[] = [];
						if (i > 0) {
							const timing = linearTiming({ durationInFrames: s.enter });
							nodes.push(
								s.key === 'mobile' ? (
									<TransitionSeries.Transition key={`t-${s.key}`} presentation={pushSlide({ distance: tr.pushDistance })} timing={timing} />
								) : (
									<TransitionSeries.Transition key={`t-${s.key}`} presentation={depthDissolve({ blur: tr.blur, recede: tr.recede })} timing={timing} />
								),
							);
						}
						nodes.push(
							<TransitionSeries.Sequence key={s.key} durationInFrames={s.duration} name={SCENE_NAMES[s.key]}>
								<SceneSwitch plan={s} props={props} layout={layout} timeline={timeline} />
							</TransitionSeries.Sequence>,
						);
						return nodes;
					})}
				</TransitionSeries>
				{props.subtitles.enabled ? (
					// With a cover lockup the title is already on screen, and the cover frame stays clean.
					<Subtitles lines={props.cover?.enabled ? timeline.lines.filter((l) => l.line.segment !== 'intro') : timeline.lines} format={props.format} />
				) : null}
				<Soundtrack props={props} timeline={timeline} />
				{props.debug.safeArea ? <SafeAreaGuide format={props.format} /> : null}
			</AbsoluteFill>
		</TypeProvider>
	);
};

const SceneSwitch: React.FC<{
	plan: ScenePlan;
	props: ShowcaseProps;
	layout: ComputedLayout;
	timeline: Timeline;
}> = ({ plan, props, layout, timeline }) => {
	switch (plan.key) {
		case 'intro':
			return props.cover?.enabled ? (
				<CoverIntro plan={plan} props={props} title={layout.coverTitle ?? layout.title} />
			) : (
				<IntroScene plan={plan} props={props} title={layout.title} />
			);
		case 'desktop':
			return <WalkthroughScene plan={plan} props={props} device="desktop" steps={timeline.steps.desktop} />;
		case 'mobile':
			return <WalkthroughScene plan={plan} props={props} device="mobile" steps={timeline.steps.mobile} />;
		case 'outro':
			return <OutroScene plan={plan} props={props} cta={layout.cta} />;
	}
};

/**
 * One persistent stage behind every scene, so lighting never pumps during
 * transitions. Its tint hands over from the website's accent to the agency's
 * accent as the outro arrives.
 */
const StageLight: React.FC<{ props: ShowcaseProps; timeline: Timeline }> = ({ props, timeline }) => {
	const frame = useCurrentFrame();
	const outro = timeline.scenes.find((s) => s.key === 'outro');
	const handover = outro
		? interpolate(frame, [outro.from, outro.from + outro.enter + 10], [0, 1], {
				extrapolateLeft: 'clamp',
				extrapolateRight: 'clamp',
			})
		: 0;
	return (
		<AbsoluteFill>
			<AbsoluteFill style={{ opacity: 1 - handover }}>
				<Backdrop accent={props.project.accent} tint={0.9} />
			</AbsoluteFill>
			{handover > 0 ? (
				<AbsoluteFill style={{ opacity: handover }}>
					<Backdrop accent={props.agency.accent} tint={0.7} keyY={0.46} />
				</AbsoluteFill>
			) : null}
		</AbsoluteFill>
	);
};
