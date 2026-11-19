// Shared data types: produced by the capture pipeline (Node) and consumed by the
// Remotion template (browser). Coordinates are CSS pixels of the captured page.

export type Rect = { x: number; y: number; width: number; height: number };

/** One horizontal slice of a full-page capture. `src` is relative to the staged public dir. */
export type PageTile = { src: string; y: number; height: number };

export type SectionKind =
	| 'hero'
	| 'products'
	| 'features'
	| 'gallery'
	| 'testimonial'
	| 'process'
	| 'cta'
	| 'contact'
	| 'content'
	| 'footer';

export type PageSection = {
	id: string;
	kind: SectionKind;
	label: string;
	/** Page-space top/height in CSS px. */
	top: number;
	height: number;
	/** 0..1 visual interest score from the analyser (manual sections get 1). */
	score: number;
	selector: string | null;
	/** Page-space rect of the most important heading in the section, if any. */
	heading: Rect | null;
	/** Page-space rect of the section's main content block (cards grid, gallery...). */
	focus: Rect | null;
};

export type PageCapture = {
	viewport: { width: number; height: number; deviceScaleFactor: number };
	/** Total captured page height (CSS px), possibly capped. */
	pageHeight: number;
	tiles: PageTile[];
	/** Sticky/fixed header captured separately so it can stay pinned while the page scrolls. */
	header: { src: string; height: number } | null;
	/** Page background colour, used to fill status bars and overscroll. */
	background: string;
	/** Colour at the very top of the page (header), used for the phone status bar. */
	topColor?: string;
	sections: PageSection[];
	/** Page-space rect of the hero H1, used to aim the push-in. */
	heroHeadline: Rect | null;
	/** Optional manual screen recording used instead of tiles (fallback input). */
	recording: { src: string; durationSeconds: number } | null;
};

export type InteractionFrame = { src: string; t: number };

export type InteractionCapture = {
	id: string;
	viewport: 'desktop' | 'mobile';
	kind: 'hover' | 'click' | 'tap';
	label: string;
	/** Scroll position (CSS px) at which the interaction was captured. */
	scrollY: number;
	/** Target element rect in viewport coordinates (CSS px). */
	target: Rect;
	/** Viewport screenshots: t=0 before the action, t=1 settled after it (t = real-time fraction). */
	frames: InteractionFrame[];
	/** Length of the site's own animation in ms; the flipbook plays over this real duration. */
	durationMs?: number;
};

/** A page visited during a journey: a full capture plus where it lives on the site. */
/** `host` is set only for pages on another site than the one the session started on (automations). */
export type JourneyPage = PageCapture & { path: string; title: string; host?: string | null };

/**
 * One recorded step of a real browsing session.
 *  - scroll: the page scrolls from one position to another (rendered from the page tiles)
 *  - action: a real click/tap/hover; frames are viewport screenshots taken while the site's own
 *    animation ran (slowed during capture); `result` is set when it navigated or jumped
 *  - cut: an edit point to another page/position without showing how we got there
 */
export type JourneyStep =
	| { id: string; kind: 'scroll'; label: string; page: number; from: number; to: number }
	| {
			id: string;
			kind: 'action';
			action: 'click' | 'tap' | 'hover' | 'type';
			label: string;
			page: number;
			/** Scroll position when acting (the player scrolls there first if needed). */
			scrollY: number;
			/** Target rect in viewport coordinates at that scroll position. */
			target: Rect;
			/** State before the cursor arrives (no hover) and, on desktop, the hovered state. */
			before: string;
			hover: string | null;
			/** Frames from the moment of the click/tap to the settled result (t = real-time fraction). */
			frames: InteractionFrame[];
			durationMs: number;
			/** Where the session ended up: a new/same page and scroll, or null if an overlay opened. */
			result: { page: number; scrollY: number } | null;
	  }
	| { id: string; kind: 'cut'; label: string; page: number; scrollY: number };

export type Journey = { viewport: 'desktop' | 'mobile'; pages: JourneyPage[]; steps: JourneyStep[] };

/** One voiced narration line, produced by the narration builder. */
export type NarrationLine = {
	id: string;
	segment: 'intro' | 'desktop' | 'mobile' | 'outro';
	text: string;
	/** Optional journey step id this line should start with. */
	step: string | null;
	/** staticFile path of the voiced take. */
	src: string;
	seconds: number;
	/** Start in seconds of the matching take in the presenter recording. */
	sourceStart?: number;
};

export type CaptureManifest = {
	version: 1;
	source: 'playwright' | 'manual';
	url: string;
	capturedAt: string;
	title: string;
	description: string;
	brand: {
		accent: string | null;
		background: string | null;
		text: string | null;
		headingFont: string | null;
		themeColor: string | null;
	};
	desktop: PageCapture | null;
	mobile: PageCapture | null;
	interactions: InteractionCapture[];
	/** Recorded browsing sessions (V2 walkthrough). */
	journeys?: { desktop: Journey | null; mobile: Journey | null };
	/** Canonical host declared by the site (used for the address bar when capturing locally). */
	canonicalHost?: string | null;
	warnings: string[];
};
