import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import type { ShowcaseProps } from '../src/schema';
import { analyzeBeats } from './audio/analyze-beats';
import { generateMusic } from './audio/synth-music';
import { generateSfx } from './audio/synth-sfx';
import { launchBrowser } from './capture/browser';
import { captureProject } from './capture/capture';
import { importManual } from './capture/import-manual';
import { CONFIG_NAME, listProjects, loadProject } from './config/load';
import { projectSchema } from './config/schema';
import { providerStatus } from './narration/tts';
import { compareVideos } from './qa/compare';
import { measureStems } from './qa/stems';
import { keyFrames, runQa } from './qa/qa';
import { DEFAULT_TEMPLATE, isTemplateId, TEMPLATE_IDS, TEMPLATES, type TemplateId } from '../src/templates';
import { KIND_IDS, KINDS, type KindId } from './config/kinds';
import { buildTimeline } from '../src/timeline';
import { openStudio, renderStills, renderVideo } from './render/remotion';
import { markPublished, readPortfolio, recordRender, removePost, renderGrid, type Post } from './portfolio';
import { exportCover } from './render/cover';
import { stageProject } from './render/stage';
import { ENGINE_ROOT, PROJECTS_DIR, ensureDir, ffprobe, log, projectDir, slugify, writeJson } from './lib/util';

const HELP = `
Claude Showcase Kit

Usage: npm run showcase -- <command> [project] [options]

Templates
  v3-dynamic   Cinematic Premium V3 (Dynamic Reels), the approved production standard and default (~24-26 s)
  v2-stable    Cinematic Premium V2 (Stable), the earlier, slower edit (~28-29 s)
  Set "template" in the project config, or pass --template <id> to preview/still/narrate/render/qa.

Instagram cover
  New projects open on a cover lockup (video.cover.enabled). render exports out/instagram-cover.png
  (the exact cover frame of the video) and out/instagram-cover-preview.png (profile grid crops).

Project workflow
  init <project> --url <url>        Create projects/<project>/showcase.config.json
       [--kind website|web-app|app|automation|branding] [--template v3-dynamic|v2-stable] [--serve <dir>] [--name "Name"] [--category "Hospitality"] [--title "..."] [--start-path /en]
       [--display-url example.ie] [--start "npm run dev" --start-url http://localhost:5173 --cwd <repo>]
  login <project> [--url <url>]     Open Chrome to sign in with a DEMO account (web apps, automations); saves the
                                    session to the project (capture.auth). You type the password; never commit it
  capture <project>                 Record the desktop + mobile walkthroughs (real scrolls, clicks, taps, pages)
       [--only desktop|mobile]
  import <project> --desktop full.png [--mobile full.png] [--desktop-width 1440] [--mobile-width 390]
       [--desktop-recording a.mp4] [--mobile-recording b.mp4]   Manual screenshots/recordings fallback
  preview <project> [--port 3000] [--safe-area]   Open Remotion Studio with the project loaded
  narrate <project>                 Voice the narration script (cached per line) and print timings
  still <project> [--frames 45,150,300] [--safe-area]   Render PNG stills for review (default: one per step)
  render <project> [--no-music] [--format reel|portrait|square|landscape] [--out file.mp4] [--skip-qa]
  cover <project> [--frame 22 | --time 0.7] [--preview]   Export the Instagram cover PNG without re-rendering;
                                    --preview shows the cover lockup on a project that has it off (writes out/cover-preview/)
  qa <project> [--file out.mp4] [--no-stems]   Probe codec/duration, detect black/frozen/abrupt frames, voice/music balance, review frames
  compare <a.mp4> <b.mp4>           Compare two renders by content (frames, picture difference, audio samples)

Portfolio (the Instagram profile)
  grid [<project>] [--count 12]     Preview the profile grid with <project> as the next post, and check the mix
  portfolio                         List rendered and published posts
  portfolio publish <project> [--url <post url>] [--date YYYY-MM-DD]   Mark a post as published (bookkeeping only)
  portfolio remove <project>        Forget a post
  mix <project>                     Measure voice vs music+SFX per narration line on rendered stems
  make <project> --url <url> ...    init (if needed) + capture + render + qa in one go

Utilities
  list                              List projects
  templates                         List the video templates
  audio <file.mp3>                  Estimate BPM and first-beat offset of a music track
  sfx                               Regenerate the engine's synthesised sound effects
  music                             Regenerate the engine's synthesised music bed
  voices                            Show which narration providers are configured
  schema                            Write schemas/showcase.config.schema.json
  skill:install [--dir <path>]      Install the /showcase Claude Code skill (default ~/.claude/skills)
  doctor                            Check browsers, ffmpeg and engine assets

Projects live in ${PROJECTS_DIR}
`;

type Args = { _: string[]; flags: Record<string, string | boolean> };

const parseArgs = (argv: string[]): Args => {
	const out: Args = { _: [], flags: {} };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a.startsWith('--')) {
			const [k, v] = a.slice(2).split('=');
			if (v !== undefined) out.flags[k] = v;
			else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) out.flags[k] = argv[++i];
			else out.flags[k] = true;
		} else out._.push(a);
	}
	return out;
};

/** Paths typed by the user resolve against the directory they ran npm from (npm --prefix changes cwd). */
const userPath = (p: string) => path.resolve(process.env.INIT_CWD || process.cwd(), p);

const str = (a: Args, k: string) => (typeof a.flags[k] === 'string' ? (a.flags[k] as string) : undefined);
const need = (v: string | undefined, msg: string) => {
	if (!v) throw new Error(msg);
	return v;
};

/** --template override, validated. */
const templateFlag = (a: Args): TemplateId | undefined => {
	const t = str(a, 'template');
	if (t === undefined) return undefined;
	if (!isTemplateId(t)) throw new Error(`Unknown template "${t}". Use one of: ${TEMPLATE_IDS.join(', ')}`);
	return t;
};

/** A project as a portfolio post. */
const postOf = (slug: string, props: ShowcaseProps, coverFile: string | null): Omit<Post, 'status' | 'renderedAt'> => {
	const p = loadProject(slug);
	return {
		slug,
		title: props.intro.title.replace(/\*/g, ''),
		kind: p.config.project.kind,
		category: p.config.project.category,
		accent: props.project.accent,
		cover: coverFile ? path.relative(PROJECTS_DIR, coverFile).replace(/\\/g, '/') : null,
	};
};

/** Voice/music stems for QA, when there is both narration and music to balance. */
const stemsFor = async (s: Awaited<ReturnType<typeof stageProject>>) =>
	s.props.narration.lines.length && s.props.audio.music ? measureStems(s.props, s.stageDir, s.publicDir) : null;

const outputFile = (slug: string, override?: string, suffix = '') => {
	const p = loadProject(slug);
	const base = override ?? (p.config.video.output || `${slug}-showcase.mp4`);
	const file = path.isAbsolute(base) ? base : path.join(p.dir, 'out', base);
	return suffix ? file.replace(/\.mp4$/i, `${suffix}.mp4`) : file;
};

const commands: Record<string, (a: Args) => Promise<void>> = {
	async init(a) {
		const slug = slugify(need(a._[1], 'Usage: init <project> --url <url>'));
		const dir = projectDir(slug);
		const file = path.join(dir, CONFIG_NAME);
		if (fs.existsSync(file) && !a.flags.force) throw new Error(`${file} already exists (use --force to overwrite)`);
		const url = str(a, 'url') ?? '';
		const serve = str(a, 'serve');
		const start = str(a, 'start');
		if (!url && !serve && !start) throw new Error('Give --url <url>, --serve <static dir> or --start "<command>" --start-url <url>');
		const template = templateFlag(a) ?? DEFAULT_TEMPLATE;
		const kindId = (str(a, 'kind') ?? 'website') as KindId;
		if (!KIND_IDS.includes(kindId)) throw new Error(`Unknown kind "${kindId}". Use one of: ${KIND_IDS.join(', ')}`);
		const config = {
			$schema: path.relative(dir, path.join(ENGINE_ROOT, 'schemas', 'showcase.config.schema.json')).replace(/\\/g, '/'),
			template,
			project: {
				name: str(a, 'name') ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
				url,
				displayUrl: str(a, 'display-url') ?? null,
				category: str(a, 'category') ?? 'Web design',
				kind: kindId,
				accent: str(a, 'accent') ?? 'auto',
			},
			source: {
				serve: serve ? path.relative(dir, userPath(serve)).replace(/\\/g, '/') : null,
				start: start
					? { command: start, cwd: path.relative(dir, userPath(str(a, 'cwd') ?? '.')).replace(/\\/g, '/') || '.', url: need(str(a, 'start-url'), '--start needs --start-url'), timeoutSeconds: 120 }
					: null,
			},
			capture: { startPath: str(a, 'start-path') ?? '', journeys: 'auto', sections: [], hide: [], blur: [] },
			video: {
				format: 'reel',
				eyebrow: 'auto',
				title: str(a, 'title') ?? null,
				timing: { ...TEMPLATES[template].defaults.timing, ...KINDS[kindId].timing },
				balance: true,
				subtitles: true,
				cover: { enabled: true, frame: null, time: null, showAgency: true },
				output: `${slug}-showcase.mp4`,
			},
			narration: { enabled: true, voice: { provider: 'kokoro', voice: 'bf_emma', speed: 1 }, lines: 'auto' },
			audio: { music: null, builtinMusic: true, sfx: true },
			agency: {},
		};
		projectSchema.parse(config);
		writeJson(file, config);
		log.ok(`Created ${file}`);
		log.info(`Next: npm run showcase -- capture ${slug}`);
	},

	async login(a) {
		const slug = need(a._[1], 'Usage: login <project> [--url <url>]');
		const p = loadProject(slug);
		const url = str(a, 'url') ?? p.config.project.url;
		if (!url) throw new Error('Give --url <url> (the app or tool to sign in to)');
		const file = path.join(p.dir, p.config.capture.auth ?? 'auth/session.json');
		ensureDir(path.dirname(file));
		const browser = await launchBrowser({ headless: false });
		const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'en-IE', timezoneId: 'Europe/Dublin' });
		const page = await context.newPage();
		await page.goto(url).catch(() => undefined);
		log.step('Sign in with a DEMO account in the Chrome window (open more tabs for other tools if needed), then close the window.');
		// Save the session every 2 s while the window is open, so closing it keeps the latest state.
		let saved = false;
		while (browser.isConnected() && context.pages().length > 0) {
			await context.storageState({ path: file }).then(() => (saved = true)).catch(() => undefined);
			await new Promise((r) => setTimeout(r, 2000));
		}
		await browser.close().catch(() => undefined);
		if (!saved) throw new Error('No session was saved');
		log.ok(`Session saved to ${file} (keep it private; projects/ is never committed)`);
		if (!p.config.capture.auth) log.info(`Add to ${CONFIG_NAME}: "capture": { "auth": "${path.relative(p.dir, file).replace(/\\/g, '/')}" }`);
	},

	async capture(a) {
		const slug = need(a._[1], 'Usage: capture <project>');
		const p = loadProject(slug);
		const only = str(a, 'only') as 'desktop' | 'mobile' | undefined;
		await captureProject({ dir: p.dir, config: p.config, only });
		log.info(`Review: ${path.join(p.dir, 'capture', 'report.md')}`);
		log.info(`Next: npm run showcase -- preview ${slug}   (or render ${slug})`);
	},

	async import(a) {
		const slug = need(a._[1], 'Usage: import <project> --desktop full.png [--mobile full.png]');
		const p = loadProject(slug);
		await importManual({
			dir: p.dir,
			url: p.config.project.url,
			desktop: str(a, 'desktop') && userPath(str(a, 'desktop')!),
			desktopWidth: Number(str(a, 'desktop-width') ?? 1440),
			desktopViewportHeight: Number(str(a, 'desktop-height') ?? 900),
			mobile: str(a, 'mobile') && userPath(str(a, 'mobile')!),
			mobileWidth: Number(str(a, 'mobile-width') ?? 390),
			mobileViewportHeight: Number(str(a, 'mobile-height') ?? 844),
			desktopRecording: str(a, 'desktop-recording') && userPath(str(a, 'desktop-recording')!),
			mobileRecording: str(a, 'mobile-recording') && userPath(str(a, 'mobile-recording')!),
		});
		log.ok('Manual capture imported');
	},

	async preview(a) {
		const slug = need(a._[1], 'Usage: preview <project>');
		const s = await stageProject(slug, { safeArea: Boolean(a.flags['safe-area']), format: str(a, 'format') as ShowcaseProps['format'], template: templateFlag(a) });
		const port = str(a, 'port');
		await openStudio(s.propsFile, s.publicDir, port ? Number(port) : undefined);
	},

	async still(a) {
		const slug = need(a._[1], 'Usage: still <project> [--frames 45,150]');
		const s = await stageProject(slug, { safeArea: Boolean(a.flags['safe-area']), format: str(a, 'format') as ShowcaseProps['format'], template: templateFlag(a) });
		const frames = str(a, 'frames') ? str(a, 'frames')!.split(',').map(Number) : keyFrames(s.props).map((k) => k.frame);
		const outDir = path.join(s.project.dir, 'out', 'stills');
		await renderStills(s.propsFile, s.publicDir, outDir, frames);
		log.ok(`Stills in ${outDir}`);
	},

	async render(a) {
		const slug = need(a._[1], 'Usage: render <project>');
		const format = str(a, 'format') as ShowcaseProps['format'] | undefined;
		const p = loadProject(slug);
		const template = templateFlag(a);
		const hasMusic = Boolean(p.config.audio.music) && !a.flags['no-music'];
		const suffix = `${template && template !== p.config.template ? `-${template}` : ''}${format && format !== p.config.video.format ? `-${format}` : ''}`;
		const out = outputFile(slug, str(a, 'out') && userPath(str(a, 'out')!), suffix);
		const s = await stageProject(slug, { noMusic: Boolean(a.flags['no-music']), format, template });
		await renderVideo(s.propsFile, s.publicDir, out, { concurrency: str(a, 'concurrency'), frames: str(a, 'frames') });
		log.ok(`Video: ${out}`);
		if (s.props.cover.enabled && !str(a, 'frames')) {
			const cover = await exportCover(s, path.dirname(out));
			recordRender(postOf(slug, s.props, cover.file));
			log.info(`portfolio: "${slug}" recorded as a draft (check the grid: showcase grid ${slug})`);
		}
		if (hasMusic && !a.flags['single']) {
			// Second deliverable without music (SFX kept) so licensed audio can be added in-app.
			const silent = out.replace(/\.mp4$/i, '-no-music.mp4');
			const s2 = await stageProject(slug, { noMusic: true, format, template });
			await renderVideo(s2.propsFile, s2.publicDir, silent, { concurrency: str(a, 'concurrency') });
			log.ok(`Video without music: ${silent}`);
		}
		if (!a.flags['skip-qa'] && !str(a, 'frames')) await runQa(out, s.props, path.join(path.dirname(out), 'qa'), { stems: await stemsFor(s) });
	},

	async qa(a) {
		const slug = need(a._[1], 'Usage: qa <project>');
		const file = str(a, 'file') ? userPath(str(a, 'file')!) : outputFile(slug);
		const s = await stageProject(slug, { template: templateFlag(a) });
		const res = await runQa(path.resolve(file), s.props, path.join(path.dirname(path.resolve(file)), 'qa'), { stems: a.flags['no-stems'] ? null : await stemsFor(s) });
		if (!res.ok) process.exitCode = 1;
	},

	async cover(a) {
		const slug = need(a._[1], 'Usage: cover <project> [--frame N | --time S] [--preview]');
		const p = loadProject(slug);
		const preview = Boolean(a.flags.preview);
		const frame = str(a, 'frame') !== undefined ? Number(str(a, 'frame')) : str(a, 'time') !== undefined ? Math.round(Number(str(a, 'time')) * 30) : undefined;
		if (!preview && !p.config.video.cover.enabled) log.warn('video.cover.enabled is off: this exports a plain frame of the current opening. Use --preview to see the cover lockup.');
		const s = await stageProject(slug, { template: templateFlag(a), cover: { enabled: preview ? true : undefined, frame } });
		await exportCover(s, path.join(p.dir, 'out', preview ? 'cover-preview' : ''));
	},

	async make(a) {
		const slug = slugify(need(a._[1], 'Usage: make <project> --url <url>'));
		if (!fs.existsSync(path.join(projectDir(slug), CONFIG_NAME))) await commands.init({ ...a, _: ['init', slug] });
		await commands.capture({ ...a, _: ['capture', slug] });
		await commands.render({ ...a, _: ['render', slug] });
	},

	async list() {
		const names = listProjects(PROJECTS_DIR);
		if (!names.length) log.info('No projects yet. Create one with: npm run showcase -- init <name> --url <url>');
		for (const n of names) {
			const p = loadProject(n);
			const captured = p.manifest ? `captured ${p.manifest.capturedAt.slice(0, 10)}` : 'not captured';
			console.log(`  ${n.padEnd(28)} ${p.config.project.name.padEnd(28)} ${p.config.template.padEnd(12)} ${captured}`);
		}
	},

	async templates() {
		for (const id of TEMPLATE_IDS) {
			const t = TEMPLATES[id];
			console.log(`  ${id.padEnd(12)} ${t.name}${id === DEFAULT_TEMPLATE ? '  [default]' : ''}`);
			console.log(`  ${''.padEnd(12)} ${t.summary}`);
		}
	},

	async audio(a) {
		const file = need(a._[1], 'Usage: audio <file>');
		const r = await analyzeBeats(userPath(file));
		log.ok(`${r.bpm} BPM, first beat at ${r.offsetSeconds}s (confidence ${r.confidence})`);
		log.info(`Use in config: "audio": { "music": { "file": "...", "bpm": ${r.bpm}, "offset": ${r.offsetSeconds} } }`);
	},

	async narrate(a) {
		const slug = need(a._[1], 'Usage: narrate <project>');
		const s = await stageProject(slug, { template: templateFlag(a) });
		const tl = buildTimeline(s.props, 30);
		for (const l of tl.lines) console.log(`  ${(l.from / 30).toFixed(2).padStart(6)}s  ${l.line.segment.padEnd(8)} ${l.line.seconds.toFixed(2)}s  ${l.line.text}`);
		log.ok(`Total ${(tl.total / 30).toFixed(2)} s · ${tl.scenes.map((x) => `${x.key} ${(x.slotFrames / 30).toFixed(2)}s`).join(' · ')}`);
	},

	async mix(a) {
		const slug = need(a._[1], 'Usage: mix <project>');
		const s = await stageProject(slug, { template: templateFlag(a) });
		const r = await measureStems(s.props, s.stageDir, s.publicDir);
		writeJson(path.join(s.project.dir, 'out', 'qa', 'mix.json'), r);
		if (r.worstSeparationDb < 8) process.exitCode = 1;
	},

	async grid(a) {
		const slug = a._[1];
		const posts = readPortfolio();
		const published = posts.filter((p) => p.status === 'published').sort((x, y) => (y.publishedAt ?? '').localeCompare(x.publishedAt ?? ''));
		let candidate: Post | null = null;
		if (slug) {
			candidate = posts.find((p) => p.slug === slug) ?? null;
			if (!candidate) {
				// Not rendered yet: use its staged props and whatever cover exists.
				const s = await stageProject(slug);
				const file = path.join(s.project.dir, 'out', 'instagram-cover.png');
				candidate = { ...postOf(slug, s.props, fs.existsSync(file) ? file : null), status: 'draft', renderedAt: '' };
			}
		}
		await renderGrid(candidate, published.filter((p) => p.slug !== slug), path.join(PROJECTS_DIR, 'portfolio-grid.png'), Number(str(a, 'count') ?? 12));
	},

	async portfolio(a) {
		const sub = a._[1];
		if (sub === 'publish') {
			const post = markPublished(need(a._[2], 'Usage: portfolio publish <project>'), { url: str(a, 'url'), date: str(a, 'date') });
			log.ok(`"${post.title}" marked as published on ${post.publishedAt}`);
			return;
		}
		if (sub === 'remove') {
			removePost(need(a._[2], 'Usage: portfolio remove <project>'));
			log.ok('removed');
			return;
		}
		const posts = readPortfolio();
		if (!posts.length) log.info('No posts yet: every render with a cover is recorded here as a draft.');
		for (const p of posts) console.log(`  ${p.status.padEnd(10)} ${(p.publishedAt ?? '').padEnd(11)} ${KINDS[p.kind].label.padEnd(11)} ${p.title.padEnd(26)} ${p.accent}  ${p.slug}`);
	},

	async compare(a) {
		const x = need(a._[1], 'Usage: compare <a.mp4> <b.mp4>');
		const y = need(a._[2], 'Usage: compare <a.mp4> <b.mp4>');
		const r = await compareVideos(userPath(x), userPath(y));
		if (!r.sameFrames || !r.visuallySame) process.exitCode = 1;
	},

	async music() {
		generateMusic();
	},

	async voices() {
		for (const p of ['kokoro', 'elevenlabs', 'openai', 'azure'] as const) {
			const st = providerStatus(p);
			(st.ok ? log.ok : log.warn)(`${p.padEnd(11)} ${st.ok ? 'ready' : 'not configured'} (${st.detail})`);
		}
	},

	async sfx() {
		generateSfx();
	},

	async schema() {
		const file = path.join(ENGINE_ROOT, 'schemas', 'showcase.config.schema.json');
		const schema = z.toJSONSchema(projectSchema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
		(schema.properties as Record<string, unknown>).$schema = { type: 'string' };
		writeJson(file, schema);
		log.ok(`Wrote ${file}`);
	},

	async 'skill:install'(a) {
		const skillsDir = path.resolve(str(a, 'dir') ? userPath(str(a, 'dir')!) : path.join(os.homedir(), '.claude', 'skills'));
		const target = path.join(skillsDir, 'showcase');
		const source = path.join(ENGINE_ROOT, 'skills', 'showcase');
		// Backups go next to the skills folder, not inside it, so Claude doesn't load them twice.
		const backup = path.join(path.dirname(skillsDir), 'skills-backup', new Date().toISOString().replace(/[:.]/g, '-'));
		const moveAside = (dir: string, why: string) => {
			ensureDir(backup);
			fs.renameSync(dir, path.join(backup, path.basename(dir)));
			log.info(`${why}: moved ${dir} to ${backup}`);
		};
		// The skill used to be called website-showcase: retire it so there is one /showcase.
		const legacy = path.join(skillsDir, 'website-showcase');
		if (fs.existsSync(path.join(legacy, 'engine.json'))) moveAside(legacy, 'replaced the old website-showcase skill');
		// A "showcase" skill that is not this kit's (no engine.json) is kept safe, never overwritten.
		if (fs.existsSync(target) && !fs.existsSync(path.join(target, 'engine.json'))) moveAside(target, 'kept your existing showcase skill');
		// The kit's skills/ folder is the source of truth; the installed copy is overwritten.
		ensureDir(target);
		fs.cpSync(source, target, { recursive: true, force: true });
		fs.copyFileSync(path.join(ENGINE_ROOT, 'docs', 'CONFIGURATION.md'), path.join(target, 'reference.md'));
		fs.copyFileSync(path.join(ENGINE_ROOT, 'docs', 'TEMPLATES.md'), path.join(target, 'templates.md'));
		const pkg = JSON.parse(fs.readFileSync(path.join(ENGINE_ROOT, 'package.json'), 'utf8')) as { version: string };
		writeJson(path.join(target, 'engine.json'), {
			engineDir: ENGINE_ROOT,
			projectsDir: PROJECTS_DIR,
			engineVersion: pkg.version,
			defaultTemplate: DEFAULT_TEMPLATE,
			installedAt: new Date().toISOString(),
		});
		log.ok(`Installed skill to ${target}`);
		log.info(`It points at this engine: ${ENGINE_ROOT}`);
		log.info(`Launcher: node "${path.join(target, 'scripts', 'showcase.mjs')}" <command>`);
	},

	async doctor() {
		log.step('Node ' + process.version);
		try {
			const b = await launchBrowser();
			await b.close();
			log.ok('capture browser available');
		} catch (e) {
			log.error((e as Error).message);
		}
		const ff = await ffprobe(['-version']);
		if (ff.code === 0) log.ok(`ffprobe: ${ff.stdout.toString().split('\n')[0]}`);
		else log.error('ffprobe via Remotion failed');
		const sfx = path.join(ENGINE_ROOT, 'public', 'engine', 'sfx', 'whoosh-soft.wav');
		if (fs.existsSync(sfx)) log.ok('sound effects present');
		else log.warn('sound effects missing: run npm run showcase -- sfx');
		log.ok(`projects: ${listProjects(PROJECTS_DIR).length} in ${PROJECTS_DIR}`);
	},
};

const main = async () => {
	const args = parseArgs(process.argv.slice(2));
	const cmd = args._[0];
	if (!cmd || cmd === 'help' || args.flags.help) {
		console.log(HELP);
		return;
	}
	const fn = commands[cmd];
	if (!fn) throw new Error(`Unknown command "${cmd}". Run: npm run showcase -- help`);
	await fn(args);
};

main().catch((e: Error) => {
	log.error(e.message);
	if (process.env.SHOWCASE_DEBUG) console.error(e.stack);
	process.exit(1);
});
