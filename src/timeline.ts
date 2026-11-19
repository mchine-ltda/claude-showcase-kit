import type { SegmentKey, ShowcaseProps } from './schema';
import { SEGMENTS } from './schema';
import { templateOf, type TemplateSpec } from './templates';
import type { Journey, JourneyStep, NarrationLine } from './types';

// Single source of truth for when things happen. Scenes, narration, subtitles
// and sound effects all read these numbers, so picture and sound move together.
// Every pacing constant comes from the template (src/templates.ts).

export type ScenePlan = {
	key: SegmentKey;
	/** Global start frame of the scene's sequence (includes its incoming overlap). */
	from: number;
	/** Sequence length including overlaps. */
	duration: number;
	/** Overlap with the previous scene at the start (0 for the first). */
	enter: number;
	/** Overlap with the next scene at the end (0 for the last). */
	exit: number;
	/** Start of this segment's own slot (between transition midpoints), global frames. */
	slotFrom: number;
	slotFrames: number;
};

export type StepPlan = { step: JourneyStep; from: number; duration: number };
export type LinePlan = { line: NarrationLine; from: number; duration: number };

export type Timeline = {
	scenes: ScenePlan[];
	total: number;
	fps: number;
	/** Transition length into each scene (frames). */
	transitions: Partial<Record<SegmentKey, number>>;
	lines: LinePlan[];
	/** Journey step plans, in scene-local frames. */
	steps: { desktop: StepPlan[]; mobile: StepPlan[] };
	/** The template these numbers were planned with. */
	spec: TemplateSpec;
};

type TimingProps = Pick<ShowcaseProps, 'timing' | 'narration' | 'balance' | 'audio' | 'capture'> &
	Partial<Pick<ShowcaseProps, 'presenter' | 'cover'>> & { template?: string | null };

const linesOf = (props: Pick<ShowcaseProps, 'narration'>, seg: SegmentKey) => props.narration.lines.filter((l) => l.segment === seg);

const pacingOf = (props: TimingProps, spec: TemplateSpec): TemplateSpec['pacing'] => {
	const pacing = spec.pacing;
	if (!props.presenter) return pacing;
	return {
		...pacing,
		lead: { ...pacing.lead, intro: props.cover?.enabled ? 1.2 : 0.3, outro: 0.28 },
		tail: { ...pacing.tail, intro: 0.32, outro: 1.95 },
		overhang: { ...pacing.overhang, intro: 0, outro: 0 },
	};
};

/** The music's beat grid in video time, or null without a beat-synced track. */
const beatGrid = (props: TimingProps, spec: TemplateSpec) => {
	const music = props.audio.music;
	if (!music?.bpm) return null;
	const beat = 60 / music.bpm;
	const ceilBeats = (s: number) => Math.max(1, Math.ceil(s / beat - spec.pacing.beatTolerance)) * beat;
	const phase = (((music.offsetSeconds - music.startAtSeconds) % beat) + beat) % beat;
	return {
		beat,
		phase,
		ceilBeats,
		intro: (s: number) => Math.max(spec.pacing.introMinSeconds, ceilBeats(Math.max(0, s - phase)) + phase),
	};
};

/** Seconds each segment needs: the configured minimum, stretched to fit its narration. */
export const segmentSeconds = (props: TimingProps) => {
	const spec = templateOf(props);
	return spec.pacing.chained ? chainedSegmentSeconds(props, spec) : independentSegmentSeconds(props, spec);
};

/** V2: each segment is budgeted on its own (lead + speech + tail), then balanced and beat-snapped. */
const independentSegmentSeconds = (props: TimingProps, spec: TemplateSpec) => {
	const { lead, tail } = pacingOf(props, spec);
	const out = {} as Record<SegmentKey, number>;
	for (const seg of SEGMENTS) {
		const ls = linesOf(props, seg);
		const speech = ls.reduce((s, l) => s + l.seconds, 0) + Math.max(0, ls.length - 1) * props.narration.gapSeconds;
		out[seg] = Math.max(props.timing[seg], ls.length ? lead[seg] + speech + tail[seg] : 0);
	}
	if (!props.capture?.journeys?.desktop) out.desktop = 0;
	if (!props.capture?.journeys?.mobile) out.mobile = 0;
	if (props.balance && out.desktop && out.mobile) out.desktop = out.mobile = Math.max(out.desktop, out.mobile);
	// With music, land every boundary on a beat (desktop and mobile get the same number of beats).
	const grid = beatGrid(props, spec);
	if (grid) {
		out.intro = grid.intro(out.intro);
		out.desktop = out.desktop ? grid.ceilBeats(out.desktop) : 0;
		out.mobile = out.mobile ? (props.balance && out.desktop ? out.desktop : grid.ceilBeats(out.mobile)) : 0;
		out.outro = grid.ceilBeats(out.outro);
	}
	return out;
};

/**
 * V3: segments are budgeted in order, from where the previous narration really
 * ends. A segment may hand its last words over the next one's opening (overhang),
 * and the closing question may start before the outro (negative lead), so no
 * part is stretched just to hold a sentence.
 */
const chainedSegmentSeconds = (props: TimingProps, spec: TemplateSpec) => {
	const { lead, tail, overhang } = pacingOf(props, spec);
	const gap = props.narration.gapSeconds;
	const grid = beatGrid(props, spec);
	const ceil = (s: number) => (grid ? grid.ceilBeats(s) : s);
	// Narration span inside a segment (s from its slot start), given where the narration so far ends (same reference).
	const place = (seg: SegmentKey, prevEnd: number | null) => {
		const ls = linesOf(props, seg);
		if (!ls.length) return null;
		const speech = ls.reduce((s, l) => s + l.seconds, 0) + Math.max(0, ls.length - 1) * gap;
		const start = prevEnd === null ? lead[seg] : Math.max(lead[seg], prevEnd + gap);
		return { start, end: start + speech };
	};
	const need = (seg: SegmentKey, p: ReturnType<typeof place>) => Math.max(props.timing[seg], p ? p.end + tail[seg] - overhang[seg] : 0);
	// Re-express "where the narration ends" relative to the next slot.
	const carry = (prevEnd: number | null, p: ReturnType<typeof place>, len: number) => (p ? p.end - len : prevEnd === null ? null : prevEnd - len);

	const hasDesktop = Boolean(props.capture?.journeys?.desktop);
	const hasMobile = Boolean(props.capture?.journeys?.mobile);
	const out: Record<SegmentKey, number> = { intro: 0, desktop: 0, mobile: 0, outro: 0 };

	const pi = place('intro', null);
	out.intro = need('intro', pi);
	if (grid) out.intro = grid.intro(out.intro);
	const afterIntro = carry(null, pi, out.intro);

	const pd = hasDesktop ? place('desktop', afterIntro) : null;
	let dLen = hasDesktop ? need('desktop', pd) : 0;
	const pm = hasMobile ? place('mobile', hasDesktop ? carry(afterIntro, pd, dLen) : afterIntro) : null;
	let mLen = hasMobile ? need('mobile', pm) : 0;
	if (props.balance && dLen && mLen) dLen = mLen = ceil(Math.max(dLen, mLen));
	else {
		dLen = dLen ? ceil(dLen) : 0;
		mLen = mLen ? ceil(mLen) : 0;
	}
	out.desktop = dLen;
	out.mobile = mLen;

	// Final lengths only grew, so re-running the chain can only give narration more room.
	let end = afterIntro;
	if (hasDesktop) end = carry(end, place('desktop', end), dLen);
	if (hasMobile) end = carry(end, place('mobile', end), mLen);
	out.outro = ceil(need('outro', place('outro', end)));
	return out;
};

export const buildTimeline = (props: ShowcaseProps, fps: number): Timeline => {
	const spec = templateOf(props);
	const secs = segmentSeconds(props);
	const keys = SEGMENTS.filter((k) => secs[k] > 0);
	const transitions: Timeline['transitions'] = {};
	const scenes: ScenePlan[] = [];
	let slotStart = 0;
	keys.forEach((key, i) => {
		const slot = Math.round(secs[key] * fps);
		const enter = i > 0 ? spec.pacing.transitionIn[key as Exclude<SegmentKey, 'intro'>] : 0;
		const next = keys[i + 1] as Exclude<SegmentKey, 'intro'> | undefined;
		const exit = next ? spec.pacing.transitionIn[next] : 0;
		if (i > 0) transitions[key] = enter;
		scenes.push({ key, from: slotStart - enter / 2, duration: slot + enter / 2 + exit / 2, enter, exit, slotFrom: slotStart, slotFrames: slot });
		slotStart += slot;
	});

	// Narration first: sequential within each segment, never overlapping.
	const lines: LinePlan[] = [];
	const gap = Math.round(props.narration.gapSeconds * fps);
	const { lead } = pacingOf(props, spec);
	let prevEnd = 0;
	for (const s of scenes) {
		let cursor = Math.max(s.slotFrom + Math.round(lead[s.key] * fps), prevEnd + (prevEnd ? gap : 0));
		for (const line of linesOf(props, s.key)) {
			const duration = Math.ceil(line.seconds * fps);
			lines.push({ line, from: cursor, duration });
			prevEnd = cursor + duration;
			cursor = prevEnd + gap;
		}
	}

	// Then the edit follows the narration: a step a line is tied to starts with that line.
	const anchorsFor = (key: 'desktop' | 'mobile') => {
		const s = scenes.find((x) => x.key === key);
		const out = new Map<string, number>();
		if (!s) return out;
		for (const l of lines) if (l.line.segment === key && l.line.step) out.set(l.line.step, l.from - s.from - spec.steps.anchorLeadFrames);
		return out;
	};
	const grid = beatGrid(props, spec);
	const beatsIn = (s: ScenePlan | undefined) => {
		if (!grid || !s) return [];
		const out: number[] = [];
		for (let t = grid.phase; t * fps < s.from + s.duration; t += grid.beat) out.push(Math.round(t * fps) - s.from);
		return out;
	};
	const plan = (key: 'desktop' | 'mobile') => {
		const journey = props.capture?.journeys?.[key] ?? null;
		const scene = scenes.find((s) => s.key === key);
		return spec.steps.planner === 'paced'
			? planStepsPaced(journey, scene, fps, anchorsFor(key), spec, beatsIn(scene))
			: planSteps(journey, scene, fps, anchorsFor(key), spec);
	};
	return { scenes, total: Math.max(1, slotStart), fps, transitions, lines, steps: { desktop: plan('desktop'), mobile: plan('mobile') }, spec };
};

// ---------------------------------------------------------------------------
// Journey steps: weights by kind, scaled to fill the visible part of the scene.

const stepWeight = (step: JourneyStep, vh: number, w: TemplateSpec['steps']['weights']) => {
	if (step.kind === 'scroll') return w.scrollBase + w.scrollPerScreen * Math.min(w.scrollMaxScreens, Math.abs(step.to - step.from) / vh);
	if (step.kind === 'cut') return w.cut;
	const nav = Boolean(step.result && step.result.page !== step.page);
	if (step.action === 'hover') return w.hover;
	if (step.action === 'tap') return nav ? w.tapNav : w.tap;
	return nav ? w.clickNav : w.click;
};

/**
 * V2 planner. Share the visible part of a scene between its steps by weight. Steps a narration line is
 * anchored to start with that line; the steps between anchors share the time in between.
 * An anchor is dropped if honouring it would squeeze any step below a readable minimum.
 */
const planSteps = (journey: Journey | null, scene: ScenePlan | undefined, fps: number, anchors: Map<string, number>, spec: TemplateSpec): StepPlan[] => {
	if (!journey || !scene || journey.steps.length === 0) return [];
	const vh = journey.pages[0]?.viewport.height ?? 900;
	const n = journey.steps.length;
	// Steps play once the device has arrived and finish as the next transition starts.
	const start = Math.round(scene.enter * 0.75) + 2;
	const end = Math.max(start + n * 20, scene.duration - Math.round(scene.exit * 0.5));
	const weights = journey.steps.map((s) => stepWeight(s, vh, spec.steps.weights));
	const minFrames = Math.round(spec.steps.minSeconds * fps);

	// Boundaries: [stepIndex, frame], validated greedily left to right.
	const bounds: [number, number][] = [[0, start]];
	journey.steps.forEach((s, i) => {
		const f = anchors.get(s.id);
		if (f === undefined || i === 0) return;
		const [pi, pf] = bounds[bounds.length - 1];
		const roomBefore = f - pf >= (i - pi) * minFrames;
		const roomAfter = end - f >= (n - i) * minFrames;
		if (roomBefore && roomAfter) bounds.push([i, f]);
	});
	bounds.push([n, end]);

	const plans: StepPlan[] = [];
	for (let b = 0; b < bounds.length - 1; b++) {
		const [i0, f0] = bounds[b];
		const [i1, f1] = bounds[b + 1];
		const total = weights.slice(i0, i1).reduce((a, c) => a + c, 0);
		let cursor = f0;
		for (let i = i0; i < i1; i++) {
			const duration = i === i1 - 1 ? f1 - cursor : Math.max(minFrames, Math.round(((f1 - f0) * weights[i]) / total));
			plans.push({ step: journey.steps[i], from: cursor, duration: Math.max(12, duration) });
			cursor += duration;
		}
	}
	return plans;
};

/** Shortest a step can be: an action always lets the site's own response finish, plus a short beat to read it. */
const minStepFrames = (st: JourneyStep, ctx: StepContext, desktop: boolean, fps: number, spec: TemplateSpec, base: number) => {
	if (st.kind !== 'action') return base;
	const pre = needsPreScroll(st, ctx);
	for (let d = base; d < base + fps * 4; d++) if (actionTiming(st, d, pre, desktop, fps, spec).flipEnd + 4 <= d) return d;
	return base + fps * 4;
};

/** Frame inside a step where its visible event happens (cut, scroll start, click/tap). */
const eventOffset = (p: StepPlan, ctx: StepContext, desktop: boolean, fps: number, spec: TemplateSpec) => {
	const st = p.step;
	if (st.kind === 'cut') return 0;
	if (st.kind === 'scroll') return spec.scroll.easeInFrames;
	return actionTiming(st, p.duration, needsPreScroll(st, ctx), desktop, fps, spec).press;
};

/**
 * V3 planner. Like V2, steps tied to narration start with their line, but each step
 * gets at least what it needs (an action's real animation plus a beat), the spare
 * time is shared by weight, and every untied cut, click or scroll start that falls
 * within a few frames of a music beat is moved onto it.
 */
const planStepsPaced = (
	journey: Journey | null,
	scene: ScenePlan | undefined,
	fps: number,
	anchors: Map<string, number>,
	spec: TemplateSpec,
	beats: number[],
): StepPlan[] => {
	if (!journey || !scene || journey.steps.length === 0) return [];
	const steps = journey.steps;
	const vh = journey.pages[0]?.viewport.height ?? 900;
	const desktop = journey.viewport === 'desktop';
	const n = steps.length;
	const start = Math.round(scene.enter * 0.75) + 2;
	const end = Math.max(start + n * 20, scene.duration - Math.round(scene.exit * 0.5));
	const weights = steps.map((s) => stepWeight(s, vh, spec.steps.weights));
	const ctxs = stepContexts(steps.map((step) => ({ step, from: 0, duration: 0 })));
	const base = Math.round(spec.steps.minSeconds * fps);
	const mins = steps.map((s, i) => minStepFrames(s, ctxs[i], desktop, fps, spec, base));
	const sumMins = (a: number, b: number) => mins.slice(a, b).reduce((x, y) => x + y, 0);

	const bounds: [number, number][] = [[0, start]];
	steps.forEach((s, i) => {
		const f = anchors.get(s.id);
		if (f === undefined || i === 0) return;
		const [pi, pf] = bounds[bounds.length - 1];
		if (f - pf >= sumMins(pi, i) && end - f >= sumMins(i, n)) bounds.push([i, f]);
	});
	bounds.push([n, end]);

	// Water-fill: steps whose weighted share is under their minimum get the minimum, the rest share what is left.
	const fill = (idx: number[], total: number) => {
		const dur = new Map<number, number>();
		let free = [...idx];
		let left = total;
		for (;;) {
			const w = free.reduce((a, i) => a + weights[i], 0);
			const low = free.filter((i) => (left * weights[i]) / w < mins[i]);
			if (!low.length || low.length === free.length) break;
			for (const i of low) {
				dur.set(i, mins[i]);
				left -= mins[i];
			}
			free = free.filter((i) => !low.includes(i));
		}
		const w = free.reduce((a, i) => a + weights[i], 0);
		let acc = 0;
		free.forEach((i, k) => {
			const d = k === free.length - 1 ? left - acc : Math.round((left * weights[i]) / w);
			dur.set(i, d);
			acc += d;
		});
		return idx.map((i) => dur.get(i) ?? 0);
	};

	const plans: StepPlan[] = [];
	for (let b = 0; b < bounds.length - 1; b++) {
		const [i0, f0] = bounds[b];
		const [i1, f1] = bounds[b + 1];
		const idx = Array.from({ length: i1 - i0 }, (_, k) => i0 + k);
		let cursor = f0;
		fill(idx, f1 - f0).forEach((d, k) => {
			plans.push({ step: steps[idx[k]], from: cursor, duration: d });
			cursor += d;
		});
	}

	// Land untied events on the beat when it costs only a few frames.
	const tied = new Set(bounds.map(([i]) => i));
	const reach = spec.steps.beatSnapFrames;
	if (reach > 0 && beats.length) {
		for (let k = 1; k < n; k++) {
			if (tied.has(k)) continue;
			const prev = plans[k - 1];
			const cur = plans[k];
			const ev = cur.from + eventOffset(cur, ctxs[k], desktop, fps, spec);
			let best: number | null = null;
			for (const bf of beats) if (best === null || Math.abs(bf - ev) < Math.abs(best - ev)) best = bf;
			if (best === null) continue;
			const shift = best - ev;
			if (shift === 0 || Math.abs(shift) > reach) continue;
			if (prev.duration + shift < mins[k - 1] || cur.duration - shift < mins[k]) continue;
			prev.duration += shift;
			cur.from += shift;
			cur.duration -= shift;
		}
	}
	return plans;
};

/** Frame offsets inside an action step: pre-scroll, cursor arrival, click/tap, end of the site's response. */
export const actionTiming = (step: Extract<JourneyStep, { kind: 'action' }>, duration: number, preScroll: boolean, desktop: boolean, fps: number, spec: TemplateSpec) => {
	const a = spec.action;
	const pre = preScroll ? Math.min(a.preScrollMax, Math.round(duration * a.preScrollShare)) : 0;
	const travel = desktop ? Math.min(a.travelMax, Math.max(a.travelMin, Math.round(duration * a.travelShare))) : 0;
	const arrive = pre + travel;
	const press = step.action === 'hover' ? arrive : desktop ? arrive + a.clickDelay : pre + Math.min(a.tapMax, Math.round(duration * a.tapShare));
	const flip = Math.max(a.flipMin, Math.round(((step.durationMs ?? 300) / 1000) * fps)) + a.flipPad;
	return { pre, arrive, press, flipEnd: press + flip };
};

type StepContext = { fromY: number; fromPage: number; overlay: boolean };

/** Walk a journey's steps and report, for each, whether the action needs a pre-scroll. */
export const stepContexts = (plans: StepPlan[]): StepContext[] => {
	let y = 0;
	let page = 0;
	let overlay = false;
	return plans.map((p) => {
		const st = p.step;
		const ctx = { fromY: y, fromPage: page, overlay };
		if (st.kind === 'scroll') {
			y = st.to;
			page = st.page;
			overlay = false;
		} else if (st.kind === 'cut') {
			y = st.scrollY;
			page = st.page;
			overlay = false;
		} else if (st.result) {
			y = st.result.scrollY;
			page = st.result.page;
			overlay = false;
		} else {
			y = st.scrollY;
			overlay = true;
		}
		return ctx;
	});
};

export const needsPreScroll = (st: Extract<JourneyStep, { kind: 'action' }>, ctx: { fromY: number; overlay: boolean }) =>
	!ctx.overlay && Math.abs(st.scrollY - ctx.fromY) > 4;

// ---------------------------------------------------------------------------
// Choreography of the bookends (scene-local frames).

/**
 * Cover lockup choreography (intro-local frames). Everything has landed by `settled`,
 * the default Instagram cover frame: no blur, nothing in flight.
 */
export const COVER_BEATS = { devicesIn: 14, phoneDelay: 3, eyebrowIn: 12, titleStart: 2, titleDuration: 13, titleStagger: 3, agencyIn: 8, settled: 22 };

/**
 * The video frame used as the Instagram cover: the configured one, or the moment the
 * cover lockup has settled (always before the transition out of the intro starts).
 */
export const coverFrameOf = (props: Pick<ShowcaseProps, 'cover'>, tl: Timeline) => {
	const intro = tl.scenes.find((s) => s.key === 'intro');
	const explicit = props.cover?.frame;
	if (explicit !== null && explicit !== undefined) return Math.max(0, Math.min(tl.total - 1, Math.round(explicit)));
	if (!intro) return 0;
	const transitionOut = intro.slotFrom + intro.slotFrames - Math.round(intro.exit / 2);
	return Math.max(0, Math.min(COVER_BEATS.settled, transitionOut - 3));
};

export const introBeats = (spec: TemplateSpec) => ({
	eyebrowIn: 0,
	eyebrowFrames: spec.intro.eyebrowFrames,
	titleStart: spec.intro.titleStart,
	lineDuration: spec.intro.lineDuration,
	lineStagger: spec.intro.lineStagger,
});

export const PRESENTER_FADE = 8;

export const presenterWindow = (tl: Timeline, segment: 'intro' | 'outro') => {
	const scene = tl.scenes.find((s) => s.key === segment);
	const lines = tl.lines.filter(({ line }) => line.segment === segment && line.sourceStart !== undefined);
	if (!scene || !lines.length) return null;
	const first = lines[0];
	const last = lines[lines.length - 1];
	const preRoll = Math.min(PRESENTER_FADE, Math.floor((first.line.sourceStart ?? 0) * tl.fps));
	const from = Math.max(0, first.from - preRoll);
	const speechEnd = last.from + last.duration;
	const fadeEnd = speechEnd + PRESENTER_FADE;
	const to = Math.min(tl.total, segment === 'intro' ? Math.max(scene.from + scene.duration, fadeEnd) : fadeEnd);
	return { from, to, lines };
};

export const outroSignatureDelay = (tl: Timeline, scene: ScenePlan) => {
	const window = presenterWindow(tl, 'outro');
	return window ? Math.max(0, window.to - scene.slotFrom - 3) : 0;
};

export const outroBeats = (d: number, enter: number, spec: TemplateSpec, delay = 0) => {
	const o = spec.outro;
	const ctaStart = Math.round(enter / 2) + delay;
	const markIn = ctaStart + o.markDelay;
	return { ctaStart, ruleIn: markIn - o.ruleLead, markIn, subtitleIn: markIn + o.subtitleDelay, contactIn: markIn + o.contactDelay, fadeOutStart: d - o.fadeOutFrames };
};

// ---------------------------------------------------------------------------
// Sound cue table: frame-accurate, declarative, each cue tied to a visual beat.

export type SfxName = 'whoosh-soft' | 'whoosh-long' | 'impact-soft' | 'riser' | 'chime' | 'click' | 'tap' | 'swipe';

export type SfxCue = { name: SfxName; frame: number; volume: number; note: string };

export const SFX_LENGTH_SECONDS: Record<SfxName, number> = {
	'whoosh-soft': 0.9,
	'whoosh-long': 1.5,
	'impact-soft': 1.6,
	riser: 1.8,
	chime: 2.6,
	click: 0.25,
	tap: 0.3,
	swipe: 0.6,
};

/** Point inside each file where the sound "lands" (peak), so cues are aimed at that frame. */
export const SFX_PEAK_SECONDS: Record<SfxName, number> = {
	'whoosh-soft': 0.45,
	'whoosh-long': 0.85,
	'impact-soft': 0,
	riser: 1.75,
	chime: 0,
	click: 0,
	tap: 0,
	swipe: 0.22,
};

export const buildSfxCues = (props: ShowcaseProps, tl: Timeline): SfxCue[] => {
	const spec = tl.spec;
	const cues: SfxCue[] = [];
	const at = (name: SfxName, peakFrame: number, volume: number, note: string) => {
		cues.push({ name, frame: Math.max(0, Math.round(peakFrame - SFX_PEAK_SECONDS[name] * tl.fps)), volume, note });
	};
	for (const s of tl.scenes) {
		if (s.key === 'intro') at('whoosh-soft', s.from + 10, 0.2, 'title rises');
		if (s.key === 'desktop') at('whoosh-soft', s.from + s.enter, 0.18, 'browser arrives');
		if (s.key === 'mobile') at('whoosh-long', s.from + s.enter / 2, 0.22, 'desktop hands over to mobile');
		if (s.key === 'desktop' || s.key === 'mobile') {
			const desktop = s.key === 'desktop';
			const plans = tl.steps[s.key];
			const ctxs = stepContexts(plans);
			plans.forEach((p, i) => {
				const st = p.step;
				if (st.kind === 'cut' && spec.sfx.cut) at(spec.sfx.cut.name, s.from + p.from, spec.sfx.cut.volume, `cut ${st.label}`);
				if (st.kind !== 'action' || st.action === 'hover') return;
				const t = actionTiming(st, p.duration, needsPreScroll(st, ctxs[i]), desktop, tl.fps, spec);
				at(desktop ? 'click' : 'tap', s.from + p.from + t.press, desktop ? 0.3 : 0.34, `${st.action} ${st.label}`);
			});
		}
		if (s.key === 'outro') {
			const b = outroBeats(s.duration, s.enter, spec, props.presenter ? outroSignatureDelay(tl, s) : 0);
			at('chime', s.from + b.markIn + 2, 0.24, 'signature resolves');
			at('impact-soft', s.from + b.markIn + 2, 0.16, 'signature weight');
		}
	}
	const offset = props.audio.syncOffsetFrames;
	return cues.map((c) => ({ ...c, frame: Math.max(0, c.frame - offset) })).sort((a, b) => a.frame - b.frame);
};
