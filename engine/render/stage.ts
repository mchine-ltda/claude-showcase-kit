import fs from 'node:fs';
import path from 'node:path';
import type { ShowcaseProps } from '../../src/schema';
import type { TemplateId } from '../../src/templates';
import { analyzeBeats } from '../audio/analyze-beats';
import { BUILTIN_MUSIC, generateMusic, MUSIC_DIR } from '../audio/synth-music';
import { SFX_DIR, generateSfx } from '../audio/synth-sfx';
import { loadAgency, loadProject } from '../config/load';
import type { AgencyConfig } from '../config/schema';
import { defaultScript, resolveProps, stageFile, type StagedFiles } from '../config/resolve';
import { buildNarration, type ScriptLine } from '../narration/narrate';
import { buildPresenterNarration } from '../narration/presenter';
import { ENGINE_ROOT, STAGE_DIR, ensureDir, ffprobe, log, readJson, syncDir, writeJson } from '../lib/util';

/**
 * Build a self-contained public dir for one project: engine assets + the
 * project's captures + its narration + logo/music, plus a resolved props.json.
 * Remotion is pointed at it with --public-dir, so the template never changes.
 */
export const stageProject = async (
	slug: string,
	opts: { noMusic?: boolean; safeArea?: boolean; format?: ShowcaseProps['format']; template?: TemplateId; cover?: Partial<ShowcaseProps['cover']> } = {},
) => {
	const project = loadProject(slug);
	const cfg = project.config;
	const presenterVideo = cfg.presenter && (await probePresenter(path.resolve(project.dir, cfg.presenter.video)));
	const agency = loadAgency();
	const stageDir = ensureDir(path.join(STAGE_DIR, slug));
	const publicDir = path.join(stageDir, 'public');
	fs.rmSync(path.join(publicDir, 'project'), { recursive: true, force: true });

	if (!fs.existsSync(path.join(SFX_DIR, 'whoosh-soft.wav'))) generateSfx();
	if (!fs.existsSync(path.join(MUSIC_DIR, BUILTIN_MUSIC.file))) generateMusic();
	syncDir(path.join(ENGINE_ROOT, 'public'), publicDir);
	syncDir(path.join(project.dir, 'capture'), path.join(publicDir, 'project', 'capture'));

	// Narration: voice the script (cached per line), then stage the takes.
	let narration: Awaited<ReturnType<typeof buildNarration>> = [];
	if (cfg.narration.enabled) {
		const script: ScriptLine[] =
			cfg.narration.lines === 'auto'
				? defaultScript(cfg, project.manifest)
				: cfg.narration.lines.map((l, i) => ({ id: l.id ?? `${l.segment}-${i + 1}`, segment: l.segment, text: l.text, step: l.step ?? null }));
		if (cfg.narration.lines === 'auto') log.info(`narration: auto script (${script.length} lines); write narration.lines to customise`);
		if (cfg.presenter && presenterVideo) {
			const missing = script.find(({ segment }) => (segment === 'desktop' || segment === 'mobile') && !project.manifest?.journeys?.[segment]);
			if (missing) throw new Error(`Capture the ${missing.segment} walkthrough before preparing presenter narration for "${missing.id}".`);
			narration = await buildPresenterNarration({
				dir: project.dir,
				video: presenterVideo.file,
				lines: script,
				minPause: cfg.presenter.minPause,
				takes: cfg.presenter.takes,
				videoSeconds: presenterVideo.seconds,
			});
		} else {
			narration = await buildNarration({ dir: project.dir, voice: cfg.narration.voice, lines: script });
		}
		syncDir(path.join(project.dir, 'narration'), path.join(publicDir, 'project', 'narration'));
	}

	const logoSource = cfg.agency.logo !== undefined ? cfg.agency.logo : agency.config.logo;
	const logoBase = cfg.agency.logo !== undefined ? project.dir : agency.baseDir;
	const logo = stageFile(logoSource ?? null, logoBase, publicDir, 'logo');
	const presenterSrc = presenterVideo && stageFile(presenterVideo.file, project.dir, publicDir, 'presenter');
	if (presenterVideo && !presenterSrc) throw new Error(`Could not stage presenter video: ${presenterVideo.file}`);
	const presenter = cfg.presenter && presenterVideo && presenterSrc
		? { src: presenterSrc, width: presenterVideo.width, height: presenterVideo.height, inset: cfg.presenter.inset }
		: null;

	// Brand typography: the project's override if it sets one (null = engine default), else the agency's.
	const identityCfg = cfg.agency.identity !== undefined ? cfg.agency.identity : agency.config.identity;
	const identityBase = cfg.agency.identity !== undefined ? project.dir : agency.baseDir;
	const identity = identityCfg ? stageIdentity(identityCfg, identityBase, publicDir) : null;

	// Music: a licensed track from the config, else the engine's own synthesised bed.
	let music: StagedFiles['music'] = null;
	const musicCfg = cfg.audio.music;
	if (musicCfg && !opts.noMusic) {
		const src = stageFile(musicCfg.file, project.dir, publicDir, 'music');
		if (src) {
			checkLicence(musicCfg.licence);
			let bpm: number | null = typeof musicCfg.bpm === 'number' ? musicCfg.bpm : null;
			let offset = musicCfg.offset;
			if (musicCfg.bpm === 'auto') {
				const cacheFile = path.join(stageDir, 'beats.json');
				const abs = path.join(publicDir, src);
				const stamp = `${fs.statSync(abs).size}`;
				const cached = fs.existsSync(cacheFile) ? readJson<{ stamp: string; bpm: number; offsetSeconds: number; confidence: number }>(cacheFile) : null;
				const result = cached?.stamp === stamp ? cached : { stamp, ...(await analyzeBeats(abs)) };
				writeJson(cacheFile, result);
				log.info(`music: ${result.bpm} BPM, first beat ${result.offsetSeconds}s (confidence ${result.confidence})`);
				if (result.confidence >= 0.15) {
					bpm = result.bpm;
					offset = result.offsetSeconds;
				} else log.warn('beat detection is unsure; boundaries are not beat-synced (set audio.music.bpm to force)');
			}
			music = { src, bpm, offset, builtin: false };
		}
	} else if (cfg.audio.builtinMusic && !opts.noMusic) {
		music = { src: `engine/music/${BUILTIN_MUSIC.file}`, bpm: BUILTIN_MUSIC.bpm, offset: 0, builtin: true };
		log.info(`music: engine bed "${BUILTIN_MUSIC.title}" (${BUILTIN_MUSIC.bpm} BPM, original, cleared for commercial use)`);
	}

	const { props, notes } = resolveProps({
		config: cfg,
		agency: agency.config,
		manifest: project.manifest,
		files: { logo, music, identity, presenter },
		narration,
		noMusic: opts.noMusic,
		debugSafeArea: opts.safeArea,
		formatOverride: opts.format,
		templateOverride: opts.template,
	});
	log.info(`template: ${props.template}${opts.template && opts.template !== cfg.template ? ' (--template override)' : ''}`);
	if (!project.manifest?.journeys) log.warn(`"${slug}" has no walkthrough capture yet; run: showcase capture ${slug}`);
	for (const n of notes) log.info(n);
	// One-off cover overrides (cover --preview / --frame) never touch the project config.
	if (opts.cover) props.cover = { ...props.cover, ...Object.fromEntries(Object.entries(opts.cover).filter(([, v]) => v !== undefined)) };
	const propsFile = path.join(stageDir, 'props.json');
	writeJson(propsFile, props);
	return { project, props, propsFile, publicDir, stageDir };
};

const probePresenter = async (file: string) => {
	if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) throw new Error(`Presenter recording not found: ${file}`);
	const probe = await ffprobe(['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,duration:stream_side_data=rotation', '-of', 'json', file]);
	if (probe.code !== 0) throw new Error(`Could not read presenter video: ${probe.stderr.trim() || `ffprobe exited with code ${probe.code}`}`);
	const { streams } = JSON.parse(probe.stdout.toString()) as {
		streams?: { width?: number; height?: number; duration?: string; side_data_list?: { rotation?: number }[] }[];
	};
	const video = streams?.[0];
	if (!video?.width || !video?.height) throw new Error(`Presenter recording has no video stream: ${file}`);
	const rotated = (video.side_data_list?.[0]?.rotation ?? 0) % 180 !== 0;
	const [width, height] = rotated ? [video.height, video.width] : [video.width, video.height];
	const duration = Number(video.duration);
	return { file, width, height, seconds: duration > 0 ? duration : undefined };
};

/** Copy an identity's local font files into the public dir; returns the render-time identity. */
const stageIdentity = (id: NonNullable<AgencyConfig['identity']>, baseDir: string, publicDir: string): ShowcaseProps['identity'] => {
	const face = (f: NonNullable<AgencyConfig['identity']>['display']) => ({
		family: f.family,
		files: f.files.flatMap((file, i) => {
			const src = stageFile(file.path, baseDir, publicDir, `font-${f.family.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${file.weight}-${i}`);
			return src ? [{ src, weight: file.weight }] : [];
		}),
	});
	return { display: face(id.display), body: face(id.body), mono: face(id.mono), eyebrow: id.eyebrow, tracking: id.tracking };
};

const checkLicence = (l: { licence: string; source: string; proof: string; clearedForAds: boolean }) => {
	if (!l.licence || !l.source) {
		log.warn('music has no licence/source recorded in audio.music.licence. Record it before publishing.');
	} else if (!l.clearedForAds) {
		log.info(`music licence: ${l.licence} (not marked as cleared for paid ads)`);
	}
};
