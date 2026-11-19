import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { BROWSER_RADIUS, BROWSER_TOOLBAR, BrowserFrame } from '../components/BrowserFrame';
import { CutDissolve, JourneyContent, JourneyPointer, journeyStateAt } from '../components/JourneyPlayer';
import { PHONE, PhoneFrame, phoneSize } from '../components/PhoneFrame';
import { Stage3D } from '../components/Stage3D';
import { PageSurface } from '../components/PageSurface';
import { StateFlipbook } from '../components/StateFlipbook';
import { stageBands } from '../layout';
import { progress } from '../lib/anim';
import { templateOf } from '../templates';
import { EASE, SHADOW } from '../theme/tokens';
import type { StepPlan } from '../timeline';
import type { Journey } from '../types';
import type { SceneProps } from './scene-props';

/**
 * Parts 2 and 3: the recorded walkthrough, played inside a browser (desktop)
 * or a phone (mobile). The device sits at one stable, well-composed scale; the
 * movement on screen is the website itself: real scrolling, real hover states,
 * real menus and real page changes.
 */
export const WalkthroughScene: React.FC<SceneProps & { device: 'desktop' | 'mobile'; steps: StepPlan[] }> = ({ props, plan, device, steps }) => {
	const frame = useCurrentFrame();
	const { width: W, fps } = useVideoConfig();
	const journey = props.capture?.journeys?.[device] ?? null;
	if (!journey || journey.pages.length === 0) return null;
	const u = W / 1080;
	const spec = templateOf(props);
	const desktop = device === 'desktop';
	const bands = stageBands(props.format, props.subtitles.enabled);
	const state = journeyStateAt(journey, steps, frame, fps, desktop, spec);
	const page = journey.pages[state.page];
	const viewport = journey.pages[0].viewport;
	// Barely-there float so the device feels placed, not pasted. Never a camera move.
	const float = Math.sin((frame / fps) * spec.device.floatSpeed) * spec.device.floatPx * u;
	const arrive = progress(frame, 0, plan.enter + spec.device.arriveExtraFrames, EASE.glide);

	if (desktop) {
		const designW = viewport.width;
		const designH = viewport.height + BROWSER_TOOLBAR;
		const scale = Math.min((W * 0.93) / designW, (bands.deviceBottom - bands.deviceTop) / designH);
		// Another site in an automation shows its own host; the project's pages show its domain.
		const url = state.path.startsWith('//') ? state.path.slice(2) : props.project.displayUrl ? `${props.project.displayUrl}${state.path === '/' ? '' : state.path}` : '';
		return (
			<AbsoluteFill>
				<Stage3D
					width={designW}
					height={designH}
					x={W / 2}
					y={bands.deviceCenterY + float + (1 - arrive) * spec.device.rise * u}
					scale={scale}
					rotateX={(1 - arrive) * spec.device.tilt}
					opacity={arrive}
					perspective={2800}
				>
					<div style={{ position: 'absolute', inset: 0, borderRadius: BROWSER_RADIUS, boxShadow: SHADOW.window }} />
					<BrowserFrame
						page={page}
						displayUrl={url}
						scrollY={state.scrollY}
						viewportHeight={viewport.height}
						loading={state.loading}
						accent={props.project.accent}
						content={<JourneyContent journey={journey} state={state} width={designW} height={viewport.height} />}
						overlay={<JourneyPointer state={state} frame={frame} />}
					/>
				</Stage3D>
			</AbsoluteFill>
		);
	}

	const size = phoneSize(journey.pages[0]);
	const scale = Math.min((bands.deviceBottom - bands.deviceTop) / size.height, (W * 0.62) / size.width);
	return (
		<AbsoluteFill>
			<Stage3D width={size.width} height={size.height} x={W / 2} y={bands.deviceCenterY + float} scale={scale} perspective={2600}>
				<div style={{ position: 'absolute', inset: 0, borderRadius: PHONE.radius, boxShadow: SHADOW.device }} />
				<PhoneFrame
					page={page}
					scrollY={state.scrollY}
					sheen={-0.2}
					content={mobileContent(journey, state, size)}
					overlay={<JourneyPointer state={state} frame={frame} />}
				/>
			</Stage3D>
		</AbsoluteFill>
	);
};

type PlayerState = ReturnType<typeof journeyStateAt>;

/** Phone screen content when it is not the plain page: an interaction flipbook and/or an in-page cut dissolving. */
const mobileContent = (journey: Journey, state: PlayerState, size: ReturnType<typeof phoneSize>) => {
	const flip = state.flip ? <StateFlipbook frames={state.flip.frames} progress={state.flip.progress} width={size.screenWidth} height={size.screenHeight} /> : null;
	if (!state.under) return flip ?? undefined;
	const viewport = size.screenHeight - PHONE.statusBar;
	return (
		<CutDissolve journey={journey} under={state.under} height={viewport}>
			{flip ?? <PageSurface page={journey.pages[state.page]} scrollY={state.scrollY} viewportHeight={viewport} />}
		</CutDissolve>
	);
};
