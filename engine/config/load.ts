import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { CaptureManifest } from '../../src/types';
import { ENGINE_ROOT, projectDir, readJson } from '../lib/util';
import { agencySchema, projectSchema, type AgencyConfig, type ProjectConfig } from './schema';

export const AGENCY_FILE = path.join(ENGINE_ROOT, 'agency.config.json');
export const CONFIG_NAME = 'showcase.config.json';

const formatIssues = (e: z.ZodError) => e.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');

export const loadAgency = (): { config: AgencyConfig; baseDir: string } => {
	const raw = fs.existsSync(AGENCY_FILE) ? readJson<unknown>(AGENCY_FILE) : {};
	const parsed = agencySchema.safeParse(raw);
	if (!parsed.success) throw new Error(`agency.config.json is invalid:\n${formatIssues(parsed.error)}`);
	return { config: parsed.data, baseDir: ENGINE_ROOT };
};

export type LoadedProject = {
	slug: string;
	dir: string;
	configFile: string;
	config: ProjectConfig;
	manifest: CaptureManifest | null;
};

export const loadProject = (slug: string): LoadedProject => {
	const dir = projectDir(slug);
	const configFile = path.join(dir, CONFIG_NAME);
	if (!fs.existsSync(configFile)) throw new Error(`No project "${slug}" (expected ${configFile}). Create one with: showcase init ${slug} --url <url>`);
	const raw = readJson<Record<string, unknown>>(configFile);
	delete raw.$schema;
	const parsed = projectSchema.safeParse(raw);
	if (!parsed.success) throw new Error(`${configFile} is invalid:\n${formatIssues(parsed.error)}`);
	const manifestFile = path.join(dir, 'capture', 'manifest.json');
	const manifest = fs.existsSync(manifestFile) ? readJson<CaptureManifest>(manifestFile) : null;
	return { slug, dir, configFile, config: parsed.data, manifest };
};

export const listProjects = (root: string) =>
	fs.existsSync(root)
		? fs
				.readdirSync(root, { withFileTypes: true })
				.filter((d) => d.isDirectory() && fs.existsSync(path.join(root, d.name, CONFIG_NAME)))
				.map((d) => d.name)
		: [];
