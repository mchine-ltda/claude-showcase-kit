import fs from 'node:fs';
import path from 'node:path';
import type { ShowcaseProps } from '../../src/schema';
import { TEMPLATES, type TemplateId } from '../../src/templates';
import type { CaptureManifest, Journey, NarrationLine } from '../../src/types';
import type { ScriptLine } from '../narration/narrate';
import { log } from '../lib/util';
import { kindOf } from './kinds';
import type { AgencyConfig, ProjectConfig } from './schema';

export type StagedFiles = {
	logo: string | null;
	music: { src: string; bpm: number | null; offset: number; builtin: boolean } | null;
	identity: ShowcaseProps['identity'];
};

/**
 * Turn authoring config + capture manifest + voiced narration into the exact
 * props the template renders. All "auto" decisions (accent, eyebrow, domain,
 * script) are made here, deterministically, and logged so they can be overridden.
 */
export const resolveProps = (opts: {
	config: ProjectConfig;
	agency: AgencyConfig;
	manifest: CaptureManifest | null;
	files: StagedFiles;
	narration: NarrationLine[];
	noMusic?: boolean;
	debugSafeArea?: boolean;
	formatOverride?: ShowcaseProps['format'];
	templateOverride?: TemplateId;
}): { props: ShowcaseProps; notes: string[] } => {
	const { config, manifest } = opts;
	const template = opts.templateOverride ?? config.template;
	const spec = TEMPLATES[template];
	const agency = { ...opts.agency, ...stripUndefined(config.agency) };
	const notes: string[] = [];

	const accent = config.project.accent !== 'auto' ? config.project.accent : pickAccent(manifest, notes);
	const displayUrl = config.project.displayUrl ?? (defaultDisplayUrl(config.project.url || manifest?.url || '') || manifest?.canonicalHost || '');
	if (!config.project.displayUrl && displayUrl) notes.push(`address bar: ${displayUrl}`);
	const kind = kindOf(config.project.kind);
	const eyebrow = config.video.eyebrow === 'auto' ? `${kind.label} · ${config.project.category}` : config.video.eyebrow;

	const music =
		opts.files.music && !opts.noMusic
			? {
					src: opts.files.music.src,
					volume: config.audio.music?.volume ?? config.audio.musicVolume,
					duckTo: config.audio.duckTo,
					startAtSeconds: config.audio.music?.startAt ?? 0,
					bpm: config.audio.music && !config.audio.music.beatSync ? null : opts.files.music.bpm,
					offsetSeconds: opts.files.music.offset,
				}
			: null;

	const props: ShowcaseProps = {
		template,
		format: opts.formatOverride ?? config.video.format,
		project: { name: config.project.name, category: config.project.category, displayUrl, accent },
		agency: {
			name: agency.name,
			logo: opts.files.logo,
			logoHeight: agency.logoHeight,
			subtitle: agency.subtitle,
			cta: config.video.cta ?? agency.cta,
			contact: agency.contact,
			accent: agency.accent,
		},
		intro: { eyebrow, title: config.video.title ?? config.project.name },
		timing: { ...spec.defaults.timing, ...kind.timing, ...stripUndefined(config.video.timing) },
		balance: config.video.balance,
		narration: { lines: config.narration.enabled ? opts.narration : [], gapSeconds: config.narration.gapSeconds ?? spec.defaults.gapSeconds, volume: config.narration.volume },
		subtitles: { enabled: config.video.subtitles && config.narration.enabled && opts.narration.length > 0 },
		cover: {
			enabled: config.video.cover.enabled,
			frame: config.video.cover.frame ?? (config.video.cover.time !== null ? Math.round(config.video.cover.time * 30) : null),
			showAgency: config.video.cover.showAgency,
		},
		audio: {
			music,
			sfx: { enabled: config.audio.sfx, volume: config.audio.sfxVolume },
			syncOffsetFrames: 1,
		},
		identity: opts.files.identity,
		capture: manifest,
		debug: { safeArea: Boolean(opts.debugSafeArea) },
	};
	return { props, notes };
};

/**
 * A truthful default script built only from what the recorded journeys show:
 * the pages actually visited and whether the mobile walkthrough reaches contact.
 */
export const defaultScript = (config: ProjectConfig, manifest: CaptureManifest | null): ScriptLine[] => {
	const name = config.project.name;
	const desktopPages = visitedPhrases(manifest?.journeys?.desktop ?? null);
	const mobileReachesContact = (manifest?.journeys?.mobile?.pages ?? []).some((p) => /contact|contacto|get-in-touch|enquir/i.test(p.path));
	const kindId = config.project.kind;
	const noun = kindOf(kindId).noun;
	const an = /^[aeiou]/i.test(noun) ? 'an' : 'a';
	const hasDesktop = Boolean(manifest?.journeys?.desktop);
	const hasMobile = Boolean(manifest?.journeys?.mobile);
	const lines: ScriptLine[] = [{ id: 'intro', segment: 'intro', text: `Meet ${name}.`, step: null }];
	if (kindId === 'website' || kindId === 'web-app') {
		lines.push({ id: 'desktop-1', segment: 'desktop', text: `A modern ${noun} for ${name}, designed to make a strong first impression.`, step: null });
		lines.push({
			id: 'desktop-2',
			segment: 'desktop',
			text: desktopPages.length ? `On desktop, visitors can explore ${joinList(desktopPages)} in just a few clicks.` : 'On desktop, every section is clear, fast and easy to explore.',
			step: null,
		});
		lines.push({
			id: 'mobile-1',
			segment: 'mobile',
			text: mobileReachesContact ? 'On mobile, the layout adapts, with simple navigation and an easy way to get in touch.' : 'On mobile, the layout adapts, with simple navigation that is easy to use.',
			step: null,
		});
		lines.push({ id: 'mobile-2', segment: 'mobile', text: 'A professional experience on every screen.', step: null });
	} else {
		// Single-device kinds: describe the work in general terms; the interview should replace these.
		const seg = hasDesktop || !hasMobile ? 'desktop' : 'mobile';
		const opening: Record<string, string> = {
			app: `${an[0].toUpperCase()}${an.slice(1)} ${noun} for ${name}, designed to be simple from the first tap.`,
			automation: `${an[0].toUpperCase()}${an.slice(1)} ${noun} for ${name} that handles the busywork on its own.`,
			branding: `A complete ${noun} for ${name}, from the logo to every detail.`,
		};
		lines.push({ id: `${seg}-1`, segment: seg, text: opening[kindId] ?? `A modern ${noun} for ${name}.`, step: null });
		lines.push({ id: `${seg}-2`, segment: seg, text: kindId === 'automation' ? "Here's how it works, step by step." : 'Every detail is built to work together.', step: null });
	}
	lines.push({ id: 'outro', segment: 'outro', text: `Want ${an} ${noun === 'brand identity' ? 'brand' : noun} like this for your business?`, step: null });
	return lines;
};

const visitedPhrases = (journey: Journey | null) => {
	if (!journey) return [];
	const out: string[] = [];
	for (const p of journey.pages.slice(1)) {
		const s = `${p.path} ${p.title}`.toLowerCase();
		const phrase = /servic/.test(s)
			? 'the services'
			: /project|portfolio|work|case|obras/.test(s)
				? 'recent projects'
				: /menu/.test(s)
					? 'the menu'
					: /product|shop|store/.test(s)
						? 'the products'
						: /about|story|team/.test(s)
							? 'the story behind the business'
							: /contact/.test(s)
								? 'the contact details'
								: null;
		if (phrase && !out.includes(phrase)) out.push(phrase);
	}
	return out;
};

const joinList = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

const stripUndefined = <T extends object>(o: T): Partial<T> =>
	Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

const defaultDisplayUrl = (url: string) => {
	try {
		const u = new URL(url);
		if (['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(u.hostname)) return '';
		return u.hostname.replace(/^www\./, '');
	} catch {
		return '';
	}
};

const luminance = (hex: string) => {
	const n = parseInt(hex.slice(1, 7), 16);
	return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};

/** The site's accent, lifted if needed so it still reads as light on charcoal. */
const pickAccent = (manifest: CaptureManifest | null, notes: string[]) => {
	const raw = manifest?.brand.accent ?? null;
	if (!raw || !/^#[0-9a-f]{6}$/i.test(raw)) {
		notes.push('accent: not detected, using neutral warm default');
		return '#c9a27e';
	}
	let c = raw;
	for (let i = 0; i < 6 && luminance(c) < 0.32; i++) c = mixHex(c, '#ffffff', 0.18);
	notes.push(`accent: ${raw} from the site${c !== raw ? ` (lifted to ${c} for dark background)` : ''}`);
	return c;
};

const mixHex = (a: string, b: string, t: number) => {
	const pa = parseInt(a.slice(1), 16);
	const pb = parseInt(b.slice(1), 16);
	const ch = (n: number, s: number) => (n >> s) & 255;
	const m = [16, 8, 0].map((s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t));
	return `#${m.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

/** Copy a project-relative asset into the staged public dir; returns its staticFile path. */
export const stageFile = (from: string | null, baseDir: string, publicDir: string, name: string): string | null => {
	if (!from) return null;
	const abs = path.resolve(baseDir, from);
	if (!fs.existsSync(abs)) {
		log.warn(`missing file ${abs}`);
		return null;
	}
	const rel = `project/files/${name}${path.extname(abs).toLowerCase()}`;
	const dest = path.join(publicDir, rel);
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.copyFileSync(abs, dest);
	return rel;
};
