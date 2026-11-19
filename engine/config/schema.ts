import { z } from 'zod';
import { DEFAULT_TEMPLATE, TEMPLATE_IDS } from '../../src/templates';
import { KIND_IDS } from './kinds';

// Authoring schema for projects/<slug>/showcase.config.json and agency.config.json.
// Everything has a default, so a config can be as small as { project: { name, url } }.

const hex = z.string().regex(/^#([0-9a-fA-F]{6})$/, 'Use a 6-digit hex colour like #c2603a');

const fontSpec = z.object({
	family: z.string().describe('Font family. Bundled with the engine (Google Fonts, OFL): Inter Tight, Geist, Geist Mono, Instrument Serif'),
	files: z
		.array(z.object({ path: z.string().describe('Font file (woff2/ttf/otf), relative to this config file'), weight: z.number().default(400) }))
		.default([])
		.describe('Local files for a font that is not bundled. Keep licensed files out of public repositories'),
});

/** Brand typography: which faces the video uses for titles, subtitles and labels. */
export const identitySchema = z.object({
	display: fontSpec.describe('Titles and the outro call to action'),
	body: fontSpec.describe('Subtitles and small text'),
	mono: fontSpec.describe('Labels (eyebrow) when eyebrow is "mono"'),
	eyebrow: z.enum(['spaced', 'mono']).default('spaced').describe('"spaced" = wide-tracked caps in the body face · "mono" = monospaced caps'),
	tracking: z.string().default('-0.035em').describe('Title letter-spacing'),
});

export const agencySchema = z.object({
	name: z.string().default('Your Studio').describe('Agency name, used as the text wordmark when there is no logo'),
	logo: z.string().nullable().default(null).describe('Path to an SVG/PNG logo (relative to this config file). Light artwork on transparent background.'),
	logoHeight: z.number().default(72).describe('Logo height in px at 1080 px frame width'),
	subtitle: z.string().default('Web Design for Irish Businesses'),
	cta: z.string().default("Let's build *yours.*").describe('Outro call to action. *word* = italic accent face'),
	contact: z.string().default('').describe('Short handle or domain shown under the subtitle, e.g. @studio or studio.ie'),
	accent: hex.default('#d9a273'),
	identity: identitySchema
		.nullable()
		.default(null)
		.describe("Brand typography for titles, labels and subtitles; null = the engine's default (Inter Tight)"),
});

export type AgencyConfig = z.infer<typeof agencySchema>;

// Overrides carry no defaults, so unset keys fall through to agency.config.json.
const agencyOverrideSchema = z.object({
	name: z.string().optional(),
	logo: z.string().nullable().optional(),
	logoHeight: z.number().optional(),
	subtitle: z.string().optional(),
	cta: z.string().optional(),
	contact: z.string().optional(),
	accent: hex.optional(),
	identity: identitySchema.nullable().optional(),
});

const sectionOverride = z.object({
	selector: z.string().describe('CSS selector of the section element'),
	kind: z
		.enum(['hero', 'products', 'features', 'gallery', 'testimonial', 'process', 'cta', 'contact', 'content', 'footer'])
		.optional(),
	label: z.string().optional(),
	focus: z.string().optional().describe('Selector of the block to frame inside the section (e.g. the cards grid)'),
});

const scrollTarget = z
	.union([z.string(), z.number()])
	.describe(
		'"best" (strongest section ahead), "far" (strongest section further down), "heading:<text>", "section:<kind|id>", a section selector, "bottom", "60%", "+800" (px), 0.5 (fraction) or 2400 (px)',
	);

const stepMeta = { id: z.string().optional(), label: z.string().optional() };

/** One step of a scripted browsing session. */
export const journeyStepSchema = z.discriminatedUnion('do', [
	z.object({ do: z.literal('scroll'), to: scrollTarget, ...stepMeta }),
	z.object({ do: z.literal('cut'), to: scrollTarget.default('far'), ...stepMeta }).describe('Edit cut to another part of the current page (no scrolling shown)'),
	z.object({
		do: z.literal('link'),
		text: z.string().optional().describe('Visible link text (or path) to click/tap'),
		prefer: z.enum(['services', 'projects', 'about', 'contact']).optional().describe('Pick the best matching link automatically'),
		depth: z.enum(['overview', 'detail']).default('overview').describe('With prefer: the overview page (/services) or a specific page under it (/services/welders)'),
		via: z.string().optional().describe('Open this header dropdown first (its visible label, e.g. "Services")'),
		scope: z.enum(['header', 'menu', 'page']).default('header'),
		waitMs: z.number().optional(),
		...stepMeta,
	}),
	z.object({ do: z.literal('menu'), waitMs: z.number().optional(), ...stepMeta }).describe('Mobile: open the menu (toggle found automatically)'),
	z.object({ do: z.literal('click'), selector: z.string(), waitMs: z.number().optional(), ...stepMeta }),
	z.object({ do: z.literal('tap'), selector: z.string(), waitMs: z.number().optional(), ...stepMeta }),
	z.object({ do: z.literal('hover'), selector: z.string(), waitMs: z.number().optional(), ...stepMeta }),
	z.object({ do: z.literal('goto'), path: z.string(), ...stepMeta }).describe('Cut to another page, or another site with a full URL (automations), without showing navigation'),
	z
		.object({ do: z.literal('type'), selector: z.string(), text: z.string(), waitMs: z.number().optional(), ...stepMeta })
		.describe('Type into a real field (recorded keystroke by keystroke). Use demo data only'),
	z.object({ do: z.literal('wait'), ms: z.number(), ...stepMeta }).describe('Capture only: wait, e.g. for an automation run to finish (nothing is shown)'),
]);

export type JourneyStepConfig = z.input<typeof journeyStepSchema> & { id?: string; label?: string; waitMs?: number };

const narrationLine = z.object({
	id: z.string().optional(),
	segment: z.enum(['intro', 'desktop', 'mobile', 'outro']),
	text: z.string(),
	step: z.string().optional().describe('Journey step id this line should start with'),
});

const licence = z.object({
	title: z.string().default(''),
	artist: z.string().default(''),
	source: z.string().default('').describe('Where it was obtained (store/library URL)'),
	licence: z.string().default('').describe('Licence name, e.g. "Artlist Pro", "Epidemic Sound Commercial", "CC0"'),
	licenceUrl: z.string().default(''),
	proof: z.string().default('').describe('Path or URL of the licence certificate / receipt'),
	clearedForAds: z.boolean().default(false).describe('True only if the licence explicitly allows paid advertising use'),
});

export const projectSchema = z.object({
	template: z
		.enum(TEMPLATE_IDS)
		.default(DEFAULT_TEMPLATE)
		.describe('"v3-dynamic" = Cinematic Premium V3, the approved production standard (default) · "v2-stable" = Cinematic Premium V2, the earlier, slower edit'),
	project: z.object({
		name: z.string(),
		url: z.string().default('').describe('Public or local URL to capture'),
		displayUrl: z.string().nullable().default(null).describe('What the browser address bar shows. Default: hostname of a public URL'),
		category: z.string().default('Web design'),
		accent: z.union([hex, z.literal('auto')]).default('auto').describe('"auto" = detected from the site'),
		demo: z.boolean().default(false),
		kind: z
			.enum(KIND_IDS)
			.default('website')
			.describe('What is shown: website, web-app, app (phone only), automation or branding (desktop only by default)'),
	}),
	source: z
		.object({
			serve: z.string().nullable().default(null).describe('Static folder to serve locally for capture (e.g. a built dist/)'),
			start: z
				.object({
					command: z.string(),
					cwd: z.string().default('.'),
					url: z.string(),
					timeoutSeconds: z.number().default(120),
				})
				.nullable()
				.default(null)
				.describe('Command that starts the site locally, run only for the capture'),
		})
		.default({ serve: null, start: null }),
	capture: z
		.object({
			desktop: z
				.object({ width: z.number().default(1280), height: z.number().default(1320), deviceScaleFactor: z.number().default(2) })
				.default({ width: 1280, height: 1320, deviceScaleFactor: 2 })
				.describe('Desktop browser size. The tall default fills a vertical Reel without zooming'),
			mobile: z
				.object({ width: z.number().default(390), height: z.number().default(844), deviceScaleFactor: z.number().default(3) })
				.default({ width: 390, height: 844, deviceScaleFactor: 3 }),
			maxPageHeight: z.number().default(14000),
			waitForSelector: z.string().nullable().default(null),
			extraWaitMs: z.number().default(600),
			hide: z.array(z.string()).default([]).describe('Extra selectors to hide (banners, chat widgets, staging badges)'),
			blur: z.array(z.string()).default([]).describe('Selectors to blur for privacy (emails, phone numbers, client data)'),
			reducedMotion: z.boolean().default(false),
			sections: z.array(sectionOverride).default([]).describe('Manual sections; empty = automatic detection'),
			startPath: z.string().default('').describe('Path to start the walkthrough from, e.g. "/en" for an English version'),
			devices: z
				.array(z.enum(['desktop', 'mobile']))
				.min(1)
				.optional()
				.describe("Devices to record and show; default from project.kind (website/web-app: both, app: mobile, automation/branding: desktop)"),
			auth: z
				.string()
				.nullable()
				.default(null)
				.describe('Saved demo-account session (from `showcase login`), relative to this config. Never commit it'),
			hostLabels: z
				.record(z.string(), z.string())
				.default({})
				.describe('Address-bar text for other sites in an automation, e.g. { "app.n8n.cloud": "n8n" }'),
			journeys: z
				.union([
					z.literal('auto'),
					z.object({ desktop: z.union([z.literal('auto'), z.array(journeyStepSchema)]).default('auto'), mobile: z.union([z.literal('auto'), z.array(journeyStepSchema)]).default('auto') }),
				])
				.default('auto')
				.describe('Browsing sessions to record. "auto" = scroll, click real nav links, open the mobile menu, reach the contact page'),
		})
		.prefault({}),
	video: z
		.object({
			format: z.enum(['reel', 'portrait', 'square', 'landscape']).default('reel'),
			eyebrow: z.string().default('auto').describe('"auto" = "Website · <category>"'),
			title: z.string().nullable().default(null).describe('Intro title; default: project name'),
			cta: z.string().nullable().default(null).describe('Override the agency CTA for this video'),
			timing: z
				.object({
					intro: z.number().min(0.8).optional(),
					desktop: z.number().min(4).optional(),
					mobile: z.number().min(4).optional(),
					outro: z.number().min(1).optional(),
				})
				.prefault({})
				.describe("Minimum seconds per part; narration can lengthen them. Unset parts use the template's defaults"),
			balance: z.boolean().default(true).describe('Give desktop and mobile the same length'),
			cover: z
				.object({
					enabled: z.boolean().default(false).describe('Open on the cover lockup and export out/instagram-cover.png (init turns this on for new projects)'),
					frame: z.number().int().min(0).nullable().default(null).describe('Exact video frame to use as the cover; null = the lockup\'s settled frame'),
					time: z.number().min(0).nullable().default(null).describe('Cover time in seconds (used when frame is null)'),
					showAgency: z.boolean().default(true).describe('Small agency signature under the devices'),
				})
				.prefault({})
				.describe('Instagram cover: a designed opening frame of the video, exported as PNG'),
			subtitles: z.boolean().default(true),
			output: z.string().default(''),
		})
		.prefault({}),
	narration: z
		.object({
			enabled: z.boolean().default(true),
			voice: z
				.object({
					provider: z.enum(['kokoro', 'elevenlabs', 'openai', 'azure']).default('kokoro'),
					voice: z.string().default('').describe('kokoro: bf_emma, bm_george, bm_fable, bf_isabella… · elevenlabs: voice id · openai: sage, ballad… · azure: en-IE-EmilyNeural, en-IE-ConnorNeural, en-GB-…'),
					speed: z.number().min(0.7).max(1.3).default(1),
					model: z.string().optional(),
					instructions: z.string().optional().describe('OpenAI only: delivery/accent guidance'),
				})
				.prefault({}),
			lines: z.union([z.literal('auto'), z.array(narrationLine)]).default('auto'),
			gapSeconds: z.number().optional().describe("Pause between narration lines; default from the template (V2 0.35, V3 0.25)"),
			volume: z.number().default(1),
		})
		.prefault({}),
	audio: z
		.object({
			music: z
				.object({
					file: z.string().describe('Path to a licensed track (relative to this config)'),
					volume: z.number().default(0.8),
					startAt: z.number().default(0),
					bpm: z.union([z.number(), z.literal('auto')]).nullable().default('auto'),
					offset: z.number().default(0),
					beatSync: z.boolean().default(true),
					licence: licence.prefault({}),
				})
				.nullable()
				.default(null),
			builtinMusic: z.boolean().default(true).describe("Use the engine's own synthesised music bed when no licensed track is set"),
			musicVolume: z.number().default(0.32).describe('Music level between narration lines'),
			duckTo: z.number().default(0.12).describe('Music level while the narrator speaks'),
			sfx: z.boolean().default(true),
			sfxVolume: z.number().default(0.7),
			ambientBed: z.boolean().default(false),
		})
		.prefault({}),
	agency: agencyOverrideSchema.default({}).describe('Per-video overrides of agency.config.json (only the keys you set)'),
	brief: z
		.object({
			goal: z.string().optional(),
			audience: z.string().optional(),
			highlights: z.array(z.string()).optional(),
			tone: z.string().optional(),
			notes: z.string().optional(),
		})
		.passthrough()
		.default({})
		.describe('Answers from the /showcase interview, kept so the video can be remade the same way'),
});

export type ProjectConfig = z.infer<typeof projectSchema>;
