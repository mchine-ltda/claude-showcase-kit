import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

const TYPES: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
	'.gif': 'image/gif',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.txt': 'text/plain; charset=utf-8',
	'.xml': 'application/xml',
	'.webmanifest': 'application/manifest+json',
};

/**
 * Minimal static server for capturing a built site (dist/, out/, a plain HTML
 * folder) without touching the website repository. Unknown routes fall back to
 * index.html so client-side routers work. Bound to 127.0.0.1 only.
 */
export const serveStatic = async (root: string) => {
	const base = path.resolve(root);
	if (!fs.existsSync(path.join(base, 'index.html'))) throw new Error(`No index.html in ${base}`);
	const server = http.createServer((req, res) => {
		const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
		let file = path.normalize(path.join(base, urlPath));
		if (!file.startsWith(base)) {
			res.writeHead(403).end();
			return;
		}
		if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
		if (!fs.existsSync(file)) {
			const html = path.join(file + '.html');
			file = fs.existsSync(html) ? html : path.join(base, 'index.html');
		}
		res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
		fs.createReadStream(file).pipe(res);
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as AddressInfo;
	return { url: `http://127.0.0.1:${port}/`, close: () => new Promise<void>((r) => server.close(() => r())) };
};
