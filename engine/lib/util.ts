import { spawn, type SpawnOptions } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** Package names the engine has had (the kit was "website-showcase-engine" before 4.0). */
const ENGINE_NAMES = ['claude-showcase-kit', 'website-showcase-engine'];

/** Engine root = nearest folder above this file whose package.json is the engine's. */
const findEngineRoot = () => {
	const starts = [process.argv[1] ? path.dirname(path.resolve(process.argv[1])) : '', process.cwd()];
	for (const start of starts) {
		let dir = start;
		while (dir && dir !== path.dirname(dir)) {
			const pkg = path.join(dir, 'package.json');
			if (fs.existsSync(pkg)) {
				try {
					if (ENGINE_NAMES.includes(JSON.parse(fs.readFileSync(pkg, 'utf8')).name)) return dir;
				} catch {
					// keep walking
				}
			}
			dir = path.dirname(dir);
		}
	}
	throw new Error('Could not locate the claude-showcase-kit folder. Run the CLI from inside the kit.');
};

export const ENGINE_ROOT = findEngineRoot();
export const PROJECTS_DIR = path.resolve(process.env.SHOWCASE_PROJECTS_DIR || path.join(ENGINE_ROOT, 'projects'));
export const STAGE_DIR = path.join(ENGINE_ROOT, '.stage');
/** Remotion's CLI entry, run with this Node binary (no shell, so no quoting issues on Windows). */
export const REMOTION_CLI = path.join(ENGINE_ROOT, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');

export const projectDir = (slug: string) => path.join(PROJECTS_DIR, slug);

export const slugify = (s: string) =>
	s
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48) || 'project';

const C = { dim: '\x1b[2m', cyan: '\x1b[36m', yellow: '\x1b[33m', red: '\x1b[31m', green: '\x1b[32m', reset: '\x1b[0m' };
export const log = {
	step: (msg: string) => console.log(`${C.cyan}›${C.reset} ${msg}`),
	info: (msg: string) => console.log(`  ${C.dim}${msg}${C.reset}`),
	ok: (msg: string) => console.log(`${C.green}✓${C.reset} ${msg}`),
	warn: (msg: string) => console.log(`${C.yellow}!${C.reset} ${msg}`),
	error: (msg: string) => console.error(`${C.red}✗${C.reset} ${msg}`),
};

export const ensureDir = (dir: string) => {
	fs.mkdirSync(dir, { recursive: true });
	return dir;
};

export const writeJson = (file: string, data: unknown) => {
	ensureDir(path.dirname(file));
	fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
};

export const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;

/** Copy a directory tree, skipping files whose size and mtime already match. */
export const syncDir = (from: string, to: string) => {
	if (!fs.existsSync(from)) return;
	ensureDir(to);
	for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
		const a = path.join(from, entry.name);
		const b = path.join(to, entry.name);
		if (entry.isDirectory()) syncDir(a, b);
		else {
			const sa = fs.statSync(a);
			const sb = fs.existsSync(b) ? fs.statSync(b) : null;
			if (!sb || sb.size !== sa.size || sb.mtimeMs < sa.mtimeMs) fs.copyFileSync(a, b);
		}
	}
};

/** Run a command, streaming output; resolves with the exit code. */
export const run = (cmd: string, args: string[], opts: SpawnOptions & { quiet?: boolean } = {}) =>
	new Promise<number>((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: opts.quiet ? 'ignore' : 'inherit', ...opts });
		child.on('error', reject);
		child.on('exit', (code) => resolve(code ?? 1));
	});

/** Run a command and capture stdout/stderr as buffers. */
export const capture = (cmd: string, args: string[], opts: SpawnOptions = {}) =>
	new Promise<{ code: number; stdout: Buffer; stderr: string }>((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
		const out: Buffer[] = [];
		let err = '';
		child.stdout!.on('data', (d: Buffer) => out.push(d));
		child.stderr!.on('data', (d: Buffer) => (err += d.toString()));
		child.on('error', reject);
		child.on('exit', (code) => resolve({ code: code ?? 1, stdout: Buffer.concat(out), stderr: err }));
	});

/** Run the Remotion CLI (studio, render, still, ffmpeg, ffprobe...). */
export const remotion = (args: string[], opts: SpawnOptions & { quiet?: boolean } = {}) =>
	run(process.execPath, [REMOTION_CLI, ...args], { cwd: ENGINE_ROOT, ...opts });

// Remotion bundles a minimal ffmpeg/ffprobe build; no system install needed.
export const ffmpeg = (args: string[]) => capture(process.execPath, [REMOTION_CLI, 'ffmpeg', ...args], { cwd: ENGINE_ROOT });
export const ffprobe = (args: string[]) => capture(process.execPath, [REMOTION_CLI, 'ffprobe', ...args], { cwd: ENGINE_ROOT });

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Read pixel size from PNG or JPEG headers (no image library needed). */
export const imageSize = (file: string): { width: number; height: number } => {
	const buf = fs.readFileSync(file);
	if (buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
	if (buf[0] === 0xff && buf[1] === 0xd8) {
		let i = 2;
		while (i < buf.length) {
			if (buf[i] !== 0xff) {
				i++;
				continue;
			}
			const marker = buf[i + 1];
			const len = buf.readUInt16BE(i + 2);
			if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
				return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
			}
			i += 2 + len;
		}
	}
	throw new Error(`Unsupported image (PNG or JPEG expected): ${file}`);
};
