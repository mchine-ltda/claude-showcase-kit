#!/usr/bin/env node
// Website Showcase launcher: runs the shared engine's CLI from any directory.
//
//   node "<skill dir>/scripts/showcase.mjs" <command> [args]   e.g. init, capture, render, cover
//   node "<skill dir>/scripts/showcase.mjs" where              show which engine is used
//
// The engine is found in this order: $SHOWCASE_ENGINE_DIR, engine.json next to the skill
// (written by `showcase skill:install`), then the engine this script ships inside.
// Relative paths in arguments resolve against the directory you run it from.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(here, '..');

const isEngine = (dir) => {
	try {
		return ['claude-showcase-kit', 'website-showcase-engine'].includes(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name);
	} catch {
		return false;
	}
};

const candidates = () => {
	const out = [];
	if (process.env.SHOWCASE_ENGINE_DIR) out.push(['SHOWCASE_ENGINE_DIR', process.env.SHOWCASE_ENGINE_DIR]);
	try {
		const cfg = JSON.parse(fs.readFileSync(path.join(skillDir, 'engine.json'), 'utf8'));
		if (cfg.engineDir) out.push(['engine.json', cfg.engineDir]);
	} catch {
		// not installed yet
	}
	out.push(['bundled', path.resolve(skillDir, '..', '..')]);
	return out;
};

const found = candidates().find(([, dir]) => isEngine(dir));
if (!found) {
	console.error('Website Showcase Engine not found. Tried:');
	for (const [from, dir] of candidates()) console.error(`  ${from}: ${dir}`);
	console.error('Set SHOWCASE_ENGINE_DIR to the engine folder, or run "npm run showcase -- skill:install" inside it.');
	process.exit(2);
}
const [source, engineDir] = found;
if (process.env.SHOWCASE_ENGINE_DIR && source !== 'SHOWCASE_ENGINE_DIR')
	console.error(`warning: SHOWCASE_ENGINE_DIR=${process.env.SHOWCASE_ENGINE_DIR} is not the engine; using ${engineDir} (${source})`);
const tsx = path.join(engineDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
if (!fs.existsSync(tsx)) {
	console.error(`The engine at ${engineDir} has no dependencies installed. Run once:\n  npm --prefix "${engineDir}" install`);
	process.exit(3);
}

const args = process.argv.slice(2);
if (args[0] === 'where') {
	const pkg = JSON.parse(fs.readFileSync(path.join(engineDir, 'package.json'), 'utf8'));
	const git = spawnSync('git', ['-C', engineDir, 'describe', '--tags', '--always', '--dirty'], { encoding: 'utf8' });
	console.log(`engine:  ${engineDir} (from ${source})`);
	console.log(`version: ${pkg.version}${git.status === 0 ? ` (${git.stdout.trim()})` : ''}`);
	console.log(`skill:   ${skillDir}`);
	console.log(`node:    ${process.version}`);
	process.exit(0);
}

const run = spawnSync(process.execPath, [tsx, path.join(engineDir, 'engine', 'cli.ts'), ...args], {
	cwd: engineDir,
	stdio: 'inherit',
	// The CLI resolves user-typed paths against INIT_CWD (the caller's directory).
	env: { ...process.env, INIT_CWD: process.cwd() },
});
process.exit(run.status ?? 1);
