import React from 'react';
import { lerp, progress, quadPoint } from '../lib/anim';
import type { TemplateSpec } from '../templates';
import { EASE } from '../theme/tokens';
import { actionTiming, needsPreScroll, stepContexts, type StepPlan } from '../timeline';
import type { InteractionFrame, Journey } from '../types';
import { PageSurface } from './PageSurface';
import { Cursor, TapRing } from './Pointer';
import { StateFlipbook } from './StateFlipbook';

export type PlayerState = {
	page: number;
	scrollY: number;
	/** Captured frames to show instead of the page surface (hover, menu, page transition). */
	flip: { frames: InteractionFrame[]; progress: number } | null;
	cursor: { x: number; y: number; pressed: number; opacity: number } | null;
	tap: { x: number; y: number; at: number } | null;
	path: string;
	/** 0..1 while a navigation is loading (drives the address-bar progress line), else null. */
	loading: number | null;
	/** During an in-page cut's dissolve: the view being left, fading out on top. */
	under?: { page: number; scrollY: number; opacity: number } | null;
};

/** Address-bar path of a page: its path, or "//host/path" for a page on another site. */
const pathOf = (p: Journey['pages'][number] | undefined) => (p ? (p.host ? `//${p.host}${p.path === '/' ? '' : p.path}` : p.path) : '/');

const targetPoint = (t: { x: number; y: number; width: number; height: number }) => ({
	x: t.x + t.width * 0.5,
	y: t.y + Math.min(t.height * 0.5, 36),
});

/**
 * The state of a recorded browsing session at a scene-local frame. Pure: every
 * frame is computed from scratch, so rendering is deterministic and seekable.
 */
export const journeyStateAt = (journey: Journey, plans: StepPlan[], frame: number, fps: number, desktop: boolean, spec: TemplateSpec): PlayerState => {
	const vw = journey.pages[0]?.viewport.width ?? 1280;
	const vh = journey.pages[0]?.viewport.height ?? 900;
	const ctxs = stepContexts(plans);
	let state: PlayerState = { page: 0, scrollY: 0, flip: null, cursor: null, tap: null, path: pathOf(journey.pages[0]), loading: null };
	let overlayFrame: InteractionFrame | null = null;
	let cursorPos = { x: vw * 0.8, y: vh * 0.82 };
	let cursorShown = false;
	let under: PlayerState['under'] = null;

	for (let i = 0; i < plans.length; i++) {
		const p = plans[i];
		const st = p.step;
		const local = frame - p.from;
		if (local < 0) break;
		const done = local >= p.duration;
		const keepCursor = cursorShown ? { ...cursorPos, pressed: 0, opacity: 1 } : null;
		under = null;

		if (st.kind === 'scroll') {
			const t = progress(local, spec.scroll.easeInFrames, p.duration - spec.scroll.easeOutFrames, EASE.scroll);
			state = { ...state, page: st.page, scrollY: lerp(st.from, st.to, done ? 1 : t), flip: null, cursor: keepCursor, tap: null, path: pathOf(journey.pages[st.page]), loading: null };
			overlayFrame = null;
			continue;
		}
		if (st.kind === 'cut') {
			// The new view dissolves in slightly above its resting place and keeps drifting into it,
			// so the step ends exactly where the next recorded action was captured.
			const drift = Math.round(vh * spec.cut.driftScreens);
			const fromY = Math.max(0, st.scrollY - drift);
			const y = done || !drift ? st.scrollY : lerp(fromY, st.scrollY, progress(local, 0, p.duration - 2, EASE.settle));
			const dissolve = spec.cut.dissolveFrames;
			if (!done && dissolve > 0 && local < dissolve) under = { page: state.page, scrollY: state.scrollY, opacity: 1 - progress(local, 0, dissolve, EASE.soft) };
			state = { ...state, page: st.page, scrollY: y, flip: null, cursor: keepCursor, tap: null, path: pathOf(journey.pages[st.page]), loading: null };
			overlayFrame = null;
			continue;
		}

		// Action step.
		const pre = needsPreScroll(st, ctxs[i]);
		const tm = actionTiming(st, p.duration, pre, desktop, fps, spec);
		const target = targetPoint(st.target);
		const navigates = Boolean(st.result && st.result.page !== st.page);
		const basePage = journey.pages[st.page];

		if (done) {
			cursorPos = target;
			cursorShown = desktop;
			if (st.result) {
				state = {
					...state,
					page: st.result.page,
					scrollY: st.result.scrollY,
					flip: null,
					cursor: desktop ? { ...target, pressed: 0, opacity: 1 } : null,
					tap: null,
					path: pathOf(journey.pages[st.result.page]),
					loading: null,
				};
				overlayFrame = null;
			} else {
				overlayFrame = st.frames[st.frames.length - 1];
				state = { ...state, flip: { frames: [overlayFrame], progress: 1 }, cursor: desktop ? { ...target, pressed: 0, opacity: 1 } : null, tap: null };
			}
			continue;
		}

		// In progress: pre-scroll → cursor travels/finger lands → the site's response plays.
		let flip: PlayerState['flip'];
		let page = state.page;
		let scrollY = state.scrollY;
		if (pre && local < tm.pre) {
			scrollY = lerp(ctxs[i].fromY, st.scrollY, progress(local, 0, tm.pre, EASE.scroll));
			page = st.page;
			flip = overlayFrame ? { frames: [overlayFrame], progress: 1 } : null;
		} else if (local < tm.press) {
			const hoverP = st.hover ? progress(local, tm.arrive - 3, tm.arrive + 3) : 0;
			const frames: InteractionFrame[] = st.hover ? [{ src: st.before, t: 0 }, { src: st.hover, t: 1 }] : [{ src: st.before, t: 0 }];
			flip = { frames, progress: hoverP };
		} else {
			const p2 = Math.min(1, (local - tm.press) / Math.max(1, tm.flipEnd - tm.press));
			flip = { frames: st.frames, progress: p2 };
		}

		let cursor: PlayerState['cursor'] = null;
		if (desktop) {
			const travel = progress(local, tm.pre, tm.arrive, EASE.settle);
			const ctrl: [number, number] = [lerp(cursorPos.x, target.x, 0.5) + vw * 0.06, lerp(cursorPos.y, target.y, 0.5) + vh * 0.05];
			const [x, y] = quadPoint([cursorPos.x, cursorPos.y], ctrl, [target.x, target.y], travel);
			const pressed = st.action === 'click' || st.action === 'type' ? progress(local, tm.press - 3, tm.press) * (1 - progress(local, tm.press + 2, tm.press + 7)) : 0;
			cursor = { x, y, pressed, opacity: cursorShown ? 1 : progress(local, tm.pre, tm.pre + 6) };
		}
		const afterPress = local >= tm.press + 3;
		state = {
			page,
			scrollY,
			flip,
			cursor,
			tap: desktop ? null : { x: target.x, y: target.y, at: p.from + tm.press },
			path: navigates && afterPress ? pathOf(journey.pages[st.result!.page]) : pathOf(basePage),
			loading: navigates && afterPress ? progress(local, tm.press + 2, Math.max(tm.flipEnd, tm.press + 16)) : null,
		};
	}
	return under ? { ...state, under } : state;
};

/** Renders the viewport content for a player state (page tiles or captured frames). */
export const JourneyContent: React.FC<{ journey: Journey; state: PlayerState; width: number; height: number }> = ({ journey, state, width, height }) => {
	const main = state.flip ? (
		<StateFlipbook frames={state.flip.frames} progress={state.flip.progress} width={width} height={journey.pages[0].viewport.height} />
	) : (
		<PageSurface page={journey.pages[state.page]} scrollY={state.scrollY} viewportHeight={height} />
	);
	return state.under ? <CutDissolve journey={journey} under={state.under} height={height}>{main}</CutDissolve> : main;
};

/** An in-page cut: the view being left fades out over the new one. */
export const CutDissolve: React.FC<{ journey: Journey; under: NonNullable<PlayerState['under']>; height: number; children: React.ReactNode }> = ({
	journey,
	under,
	height,
	children,
}) => (
	<div style={{ position: 'relative', width: '100%', height }}>
		<div style={{ position: 'absolute', inset: 0 }}>{children}</div>
		<div style={{ position: 'absolute', inset: 0, opacity: under.opacity }}>
			<PageSurface page={journey.pages[under.page]} scrollY={under.scrollY} viewportHeight={height} />
		</div>
	</div>
);

/** Cursor or touch indicator over the viewport. */
export const JourneyPointer: React.FC<{ state: PlayerState; frame: number }> = ({ state, frame }) => (
	<>
		{state.cursor && state.cursor.opacity > 0.01 ? (
			<Cursor x={state.cursor.x - 6} y={state.cursor.y - 4} size={46} pressed={state.cursor.pressed} opacity={state.cursor.opacity} />
		) : null}
		{state.tap ? <TapRing x={state.tap.x} y={state.tap.y} frame={frame} at={state.tap.at} size={54} /> : null}
	</>
);
