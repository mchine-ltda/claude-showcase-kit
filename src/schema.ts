import { z } from 'zod';
import { zColor } from '@remotion/zod-types';
import { LEGACY_TEMPLATE, TEMPLATE_IDS } from './templates';
import type { CaptureManifest, NarrationLine } from './types';

// Render-time props for the Showcase composition (narrated walkthrough).
// The CLI resolves them from agency.config.json + projects/<slug>/showcase.config.json
// + the capture manifest + the voiced narration; Studio can edit them live.

const fontFace = z.object({ family: z.string(), files: z.array(z.object({ src: z.string(), weight: z.number() })) });

const narrationLineSchema = z.object({
	id: z.string(),
	segment: z.enum(['intro', 'desktop', 'mobile', 'outro']),
	text: z.string(),
	step: z.string().nullable(),
	src: z.string(),
	seconds: z.number(),
});

export const showcaseSchema = z.object({
	template: z.enum(TEMPLATE_IDS).default(LEGACY_TEMPLATE).describe('Pacing/editing template (src/templates.ts); props without one are V2'),
	format: z.enum(['reel', 'portrait', 'square', 'landscape']),
	project: z.object({
		name: z.string(),
		category: z.string(),
		displayUrl: z.string(),
		accent: zColor(),
	}),
	agency: z.object({
		name: z.string(),
		logo: z.string().nullable().describe('staticFile path of the agency logo (SVG/PNG) or null for a text wordmark'),
		logoHeight: z.number().min(20).max(400),
		subtitle: z.string(),
		cta: z.string(),
		contact: z.string(),
		accent: zColor(),
	}),
	intro: z.object({
		eyebrow: z.string(),
		title: z.string().describe('Wrap a word in *asterisks* for the italic accent face'),
	}),
	timing: z.object({
		intro: z.number().min(0.8).max(6),
		desktop: z.number().min(4).max(30),
		mobile: z.number().min(4).max(30),
		outro: z.number().min(1).max(6),
	}),
	balance: z.boolean().describe('Desktop and mobile get the same length'),
	narration: z.object({
		lines: z.array(narrationLineSchema),
		gapSeconds: z.number().min(0).max(2),
		volume: z.number().min(0).max(2),
	}),
	subtitles: z.object({ enabled: z.boolean() }),
	identity: z
		.object({
			display: fontFace,
			body: fontFace,
			mono: fontFace,
			eyebrow: z.enum(['spaced', 'mono']),
			tracking: z.string(),
		})
		.nullable()
		.default(null)
		.describe('Brand typography; null = the engine default (Inter Tight), as in every video made before identities'),
	cover: z
		.object({
			enabled: z.boolean().describe('Open on the cover lockup (website hero in browser + phone, title, agency) used as the Instagram cover'),
			frame: z.number().int().min(0).nullable().describe('Cover frame; null = the lockup\'s settled frame'),
			showAgency: z.boolean(),
		})
		.default({ enabled: false, frame: null, showAgency: true }),
	audio: z.object({
		music: z
			.object({
				src: z.string(),
				volume: z.number().min(0).max(1),
				duckTo: z.number().min(0).max(1),
				startAtSeconds: z.number().min(0),
				bpm: z.number().nullable(),
				offsetSeconds: z.number(),
			})
			.nullable(),
		sfx: z.object({ enabled: z.boolean(), volume: z.number().min(0).max(1.5) }),
		/** Shift every SFX earlier to compensate AAC encoder priming (~1.3 frames at 48 kHz). */
		syncOffsetFrames: z.number().int().min(0).max(4),
	}),
	capture: z.any().describe('Capture manifest written by `showcase capture`'),
	debug: z.object({ safeArea: z.boolean() }),
});

export type ShowcaseProps = Omit<z.infer<typeof showcaseSchema>, 'capture' | 'narration'> & {
	capture: CaptureManifest | null;
	narration: { lines: NarrationLine[]; gapSeconds: number; volume: number };
};

export type SegmentKey = 'intro' | 'desktop' | 'mobile' | 'outro';
export const SEGMENTS: SegmentKey[] = ['intro', 'desktop', 'mobile', 'outro'];
