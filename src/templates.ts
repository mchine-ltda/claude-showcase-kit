import type { SegmentKey } from './schema';
import type { SfxName } from './timeline';

// Templates share every component; they differ only in pacing and editing rhythm.
// A template is a frozen table of numbers: the scenes, timeline, mix and QA read
// it instead of hard-coded constants. Never change the values of a published
// template. Add a new one instead, so earlier videos stay reproducible.

export const TEMPLATE_IDS = ['v2-stable', 'v3-dynamic'] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

/**
 * The approved production standard, used by new projects. A newer template becomes the default
 * only after explicit sign-off (V3 was approved on 2026-11-02).
 */
export const DEFAULT_TEMPLATE: TemplateId = 'v3-dynamic';

/** What props and configs written before templates existed render with. Never change. */
export const LEGACY_TEMPLATE: TemplateId = 'v2-stable';

type PerSegment = Record<SegmentKey, number>;

export type TemplateSpec = {
	id: TemplateId;
	name: string;
	summary: string;
	/** Used when the project config does not set them. */
	defaults: { timing: PerSegment; gapSeconds: number };
	pacing: {
		/** Transition length (frames @30 fps) into each segment. */
		transitionIn: Record<Exclude<SegmentKey, 'intro'>, number>;
		/** Where narration starts inside each segment (s), and the breathing room it needs after. */
		lead: PerSegment;
		tail: PerSegment;
		/** Seconds a segment's last line may keep playing over the next segment's opening (an L-cut). */
		overhang: PerSegment;
		/** Budget each segment from where the previous narration really ends (false = V2's independent budgets). */
		chained: boolean;
		/** Beat rounding: a part this many beats over a whole beat is rounded down. */
		beatTolerance: number;
		introMinSeconds: number;
	};
	steps: {
		/** "weighted" = V2's proportional split; "paced" = per-step minimums, water-filled, cuts snapped to beats. */
		planner: 'weighted' | 'paced';
		minSeconds: number;
		/** A step tied to a narration line starts this many frames before the line. */
		anchorLeadFrames: number;
		weights: {
			scrollBase: number;
			scrollPerScreen: number;
			scrollMaxScreens: number;
			cut: number;
			hover: number;
			tap: number;
			tapNav: number;
			click: number;
			clickNav: number;
		};
		/** Paced planner: move a step's visible event (click, cut, scroll start) onto a beat if it is this close. */
		beatSnapFrames: number;
	};
	scroll: { easeInFrames: number; easeOutFrames: number };
	action: {
		preScrollMax: number;
		preScrollShare: number;
		travelMin: number;
		travelMax: number;
		travelShare: number;
		clickDelay: number;
		tapMax: number;
		tapShare: number;
		flipMin: number;
		flipPad: number;
	};
	/** In-page cuts: a short dissolve, then the page keeps drifting into its resting position. */
	cut: { dissolveFrames: number; driftScreens: number };
	device: { arriveExtraFrames: number; rise: number; tilt: number; floatPx: number; floatSpeed: number };
	transitions: { blur: number; recede: number; pushDistance: number };
	intro: { eyebrowFrames: number; titleStart: number; lineDuration: number; lineStagger: number; drift: number };
	outro: {
		markDelay: number;
		ruleLead: number;
		subtitleDelay: number;
		contactDelay: number;
		fadeOutFrames: number;
		ctaDuration: number;
		ctaStagger: number;
		wordmarkFrames: number;
		ruleFrames: number;
		textFrames: number;
		drift: number;
	};
	mix: { fadeInSeconds: number; fadeOutSeconds: number; attackSeconds: number; releaseSeconds: number };
	sfx: { cut: { name: SfxName; volume: number } | null };
	qa: { maxStillSeconds: number };
};

const V2: TemplateSpec = {
	id: 'v2-stable',
	name: 'Cinematic Premium V2 (Stable)',
	summary: 'The first approved edit (kept frozen): ~28-29 s, 1.5 s title, ~12.5 s desktop, ~12.5 s mobile, short outro.',
	defaults: { timing: { intro: 1.5, desktop: 12.5, mobile: 12.5, outro: 1.5 }, gapSeconds: 0.35 },
	pacing: {
		transitionIn: { desktop: 12, mobile: 18, outro: 12 },
		lead: { intro: 0.08, desktop: 0.35, mobile: 0.4, outro: -0.35 },
		tail: { intro: 0.12, desktop: 0.45, mobile: 0.45, outro: 0.5 },
		overhang: { intro: 0, desktop: 0, mobile: 0, outro: 0 },
		chained: false,
		beatTolerance: 0.15,
		introMinSeconds: 0.8,
	},
	steps: {
		planner: 'weighted',
		minSeconds: 0.75,
		anchorLeadFrames: 4,
		weights: { scrollBase: 1, scrollPerScreen: 0.45, scrollMaxScreens: 1.5, cut: 0.8, hover: 0.8, tap: 0.95, tapNav: 1.2, click: 1.05, clickNav: 1.35 },
		beatSnapFrames: 0,
	},
	scroll: { easeInFrames: 3, easeOutFrames: 5 },
	action: { preScrollMax: 18, preScrollShare: 0.25, travelMin: 10, travelMax: 20, travelShare: 0.32, clickDelay: 5, tapMax: 12, tapShare: 0.22, flipMin: 6, flipPad: 2 },
	cut: { dissolveFrames: 0, driftScreens: 0 },
	device: { arriveExtraFrames: 8, rise: 70, tilt: 5, floatPx: 2.5, floatSpeed: 0.9 },
	transitions: { blur: 10, recede: 0.03, pushDistance: 170 },
	intro: { eyebrowFrames: 16, titleStart: 3, lineDuration: 16, lineStagger: 4, drift: 1.03 },
	outro: {
		markDelay: 12,
		ruleLead: 4,
		subtitleDelay: 6,
		contactDelay: 10,
		fadeOutFrames: 8,
		ctaDuration: 18,
		ctaStagger: 5,
		wordmarkFrames: 20,
		ruleFrames: 16,
		textFrames: 18,
		drift: 1.025,
	},
	mix: { fadeInSeconds: 0.6, fadeOutSeconds: 1.2, attackSeconds: 0.25, releaseSeconds: 0.45 },
	sfx: { cut: null },
	qa: { maxStillSeconds: 2.5 },
};

/**
 * Same look, tighter edit: a 1.2 s title whose narration carries over the
 * browser's arrival, shorter transitions and gaps, steps that never wait longer
 * than they must (but always let the site's own animations finish), in-page cuts
 * that dissolve and keep drifting, and cuts and clicks landing on the beat.
 */
const V3: TemplateSpec = {
	id: 'v3-dynamic',
	name: 'Cinematic Premium V3 (Dynamic Reels)',
	summary: 'The approved production standard: ~24-26 s, 1.2 s title, ~11.4 s desktop, ~11.4 s mobile, ~1.8 s outro, dense real interactions.',
	defaults: { timing: { intro: 1, desktop: 11, mobile: 11, outro: 1.5 }, gapSeconds: 0.25 },
	pacing: {
		transitionIn: { desktop: 10, mobile: 14, outro: 10 },
		lead: { intro: 0.05, desktop: 0.2, mobile: 0.25, outro: -0.75 },
		tail: { intro: 0.1, desktop: 0.3, mobile: 0.3, outro: 0.3 },
		overhang: { intro: 0.45, desktop: 0, mobile: 0, outro: 0 },
		chained: true,
		beatTolerance: 0.15,
		introMinSeconds: 0.8,
	},
	steps: {
		planner: 'paced',
		minSeconds: 0.6,
		anchorLeadFrames: 4,
		weights: { scrollBase: 1, scrollPerScreen: 0.5, scrollMaxScreens: 1.5, cut: 0.75, hover: 0.6, tap: 0.75, tapNav: 0.95, click: 0.85, clickNav: 1.05 },
		beatSnapFrames: 4,
	},
	scroll: { easeInFrames: 2, easeOutFrames: 4 },
	action: { preScrollMax: 14, preScrollShare: 0.22, travelMin: 9, travelMax: 15, travelShare: 0.28, clickDelay: 4, tapMax: 9, tapShare: 0.2, flipMin: 6, flipPad: 2 },
	cut: { dissolveFrames: 6, driftScreens: 0.12 },
	device: { arriveExtraFrames: 5, rise: 50, tilt: 4, floatPx: 2.5, floatSpeed: 0.9 },
	transitions: { blur: 9, recede: 0.03, pushDistance: 150 },
	intro: { eyebrowFrames: 12, titleStart: 2, lineDuration: 13, lineStagger: 3, drift: 1.03 },
	outro: {
		markDelay: 9,
		ruleLead: 4,
		subtitleDelay: 5,
		contactDelay: 8,
		fadeOutFrames: 7,
		ctaDuration: 15,
		ctaStagger: 4,
		wordmarkFrames: 16,
		ruleFrames: 14,
		textFrames: 15,
		drift: 1.025,
	},
	mix: { fadeInSeconds: 0.4, fadeOutSeconds: 1, attackSeconds: 0.2, releaseSeconds: 0.4 },
	sfx: { cut: { name: 'whoosh-soft', volume: 0.1 } },
	qa: { maxStillSeconds: 1.8 },
};

export const TEMPLATES: Record<TemplateId, TemplateSpec> = { 'v2-stable': V2, 'v3-dynamic': V3 };

export const isTemplateId = (id: unknown): id is TemplateId => typeof id === 'string' && (TEMPLATE_IDS as readonly string[]).includes(id);

/** The spec a set of props renders with. Props without a template (pre-V3 renders) are V2. */
export const templateOf = (props: { template?: string | null }): TemplateSpec => (isTemplateId(props.template) ? TEMPLATES[props.template] : TEMPLATES[LEGACY_TEMPLATE]);
