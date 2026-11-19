import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from './capture/browser';
import { KINDS, type KindId } from './config/kinds';
import { log, PROJECTS_DIR, readJson, writeJson } from './lib/util';

// The Instagram profile is the portfolio. This registry remembers what was rendered and what
// was published, so a new post can be checked against the grid it will join: variety of kinds,
// no near-identical colours side by side, the same identity throughout. Bookkeeping only:
// nothing here posts anything anywhere.

export type Post = {
	slug: string;
	title: string;
	kind: KindId;
	category: string;
	accent: string;
	/** Cover PNG, relative to the projects folder. */
	cover: string | null;
	status: 'draft' | 'published';
	renderedAt: string;
	publishedAt?: string;
	url?: string;
};

const FILE = () => path.join(PROJECTS_DIR, 'portfolio.json');

export const readPortfolio = (): Post[] => (fs.existsSync(FILE()) ? readJson<{ posts: Post[] }>(FILE()).posts : []);
const writePortfolio = (posts: Post[]) => writeJson(FILE(), { posts });

/** Record (or refresh) a rendered video as a draft post. A published post keeps its status. */
export const recordRender = (p: Omit<Post, 'status' | 'renderedAt'>) => {
	const posts = readPortfolio();
	const old = posts.find((x) => x.slug === p.slug);
	const next: Post = { ...old, ...p, status: old?.status ?? 'draft', renderedAt: new Date().toISOString() };
	writePortfolio([...posts.filter((x) => x.slug !== p.slug), next]);
	return next;
};

export const markPublished = (slug: string, opts: { url?: string; date?: string }) => {
	const posts = readPortfolio();
	const post = posts.find((x) => x.slug === slug);
	if (!post) throw new Error(`"${slug}" is not in the portfolio yet: render it first`);
	post.status = 'published';
	post.publishedAt = opts.date ?? new Date().toISOString().slice(0, 10);
	if (opts.url) post.url = opts.url;
	writePortfolio(posts);
	return post;
};

export const removePost = (slug: string) => writePortfolio(readPortfolio().filter((x) => x.slug !== slug));

const rgb = (hex: string) => {
	const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Perceptual-ish colour distance ("redmean"), 0 to ~765. Under ~90 reads as the same colour. */
const colourDistance = (a: string, b: string) => {
	const [r1, g1, b1] = rgb(a);
	const [r2, g2, b2] = rgb(b);
	const rm = (r1 + r2) / 2;
	return Math.sqrt((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2);
};

export type GridCheck = { level: 'ok' | 'warn'; message: string };

/**
 * The profile grid as a visitor sees it: newest first, three columns. With a candidate, it
 * takes the first tile and is checked against its neighbours and the recent mix of kinds.
 */
export const checkGrid = (candidate: Post | null, published: Post[]): GridCheck[] => {
	const grid = [...(candidate ? [candidate] : []), ...published];
	const out: GridCheck[] = [];
	if (!candidate) return out;
	const recent = published.slice(0, 2);
	if (recent.length === 2 && recent.every((p) => p.kind === candidate.kind))
		out.push({ level: 'warn', message: `three ${KINDS[candidate.kind].label} posts in a row: alternate with another kind if you can` });
	// Neighbours in the grid: right (index 1) and below (index 3).
	for (const i of [1, 3]) {
		const n = grid[i];
		if (n && colourDistance(candidate.accent, n.accent) < 90)
			out.push({ level: 'warn', message: `accent ${candidate.accent} is very close to "${n.title}" (${n.accent}) ${i === 1 ? 'next to it' : 'under it'}` });
	}
	if (candidate.title.length > 22) out.push({ level: 'warn', message: `title "${candidate.title}" is long for a grid thumbnail (keep it to the name, 2–3 words)` });
	if (!candidate.cover) out.push({ level: 'warn', message: 'no instagram-cover.png yet: render the video (or run cover) first' });
	const last9 = grid.slice(0, 9);
	const missing = (Object.keys(KINDS) as KindId[]).filter((k) => !last9.some((p) => p.kind === k));
	if (missing.length && last9.length >= 3)
		out.push({ level: 'ok', message: `not in the last ${last9.length} posts: ${missing.map((k) => KINDS[k].label).join(', ')}` });
	if (!out.some((c) => c.level === 'warn')) out.unshift({ level: 'ok', message: 'fits the grid: kind and colour vary from its neighbours' });
	return out;
};

/** Render the profile grid preview (phone width, 3:4 tiles) to a PNG. */
export const renderGrid = async (candidate: Post | null, published: Post[], out: string, count = 12) => {
	const posts = [...(candidate ? [candidate] : []), ...published].slice(0, count);
	const tile = (p: Post, i: number) => {
		const file = p.cover ? path.join(PROJECTS_DIR, p.cover) : null;
		const img = file && fs.existsSync(file) ? `data:image/png;base64,${fs.readFileSync(file).toString('base64')}` : null;
		const badge = i === 0 && candidate ? '<span class="next">NEXT</span>' : '';
		return `<div class="t">${img ? `<div class="img" style="background-image:url('${img}')"></div>` : `<div class="img empty">${p.title}</div>`}${badge}<div class="meta">${KINDS[p.kind].label} · ${p.title}</div></div>`;
	};
	const checks = checkGrid(candidate, published);
	const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#000;color:#f2f2f2;font:13px system-ui,sans-serif;padding:20px;width:400px}
.g{display:grid;grid-template-columns:repeat(3,1fr);gap:2px}
.t{position:relative}.img{aspect-ratio:3/4;background-size:cover;background-position:center;background-color:#111}
.empty{display:flex;align-items:center;justify-content:center;color:#666;font-size:11px;text-align:center}
.meta{font-size:9px;color:#8a8a8a;padding:3px 2px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.next{position:absolute;top:6px;left:6px;background:#fff;color:#000;font-size:9px;font-weight:700;padding:2px 5px;border-radius:3px}
h1{font-size:15px;margin:0 0 12px}ul{padding-left:18px;margin:14px 0 0;color:#cfcfcf}li.warn{color:#ffcf5a}
</style><h1>Profile grid preview</h1><div class="g">${posts.map(tile).join('')}</div>
<ul>${checks.map((c) => `<li class="${c.level}">${c.message}</li>`).join('')}</ul>`;
	const browser = await launchBrowser();
	try {
		const page = await browser.newPage({ viewport: { width: 440, height: 200 }, deviceScaleFactor: 2 });
		await page.setContent(html);
		await page.waitForLoadState('load');
		await page.screenshot({ path: out, fullPage: true });
	} finally {
		await browser.close();
	}
	for (const c of checks) (c.level === 'warn' ? log.warn : log.info)(c.message);
	log.ok(`grid preview: ${out}`);
	return { out, checks };
};
