import crypto from 'node:crypto';
import { ffmpeg, ffprobe, log } from '../lib/util';

/**
 * Compare two renders by what they contain, not by container bytes (the MP4 header
 * and Chrome's raster noise differ between runs): frame count, per-frame picture
 * difference and audio samples. Used to check that an old template still renders
 * the same video, e.g. a re-render against releases/<version>/<project>.mp4.
 */
export const compareVideos = async (a: string, b: string) => {
	const probe = async (file: string) => {
		const p = await ffprobe(['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]);
		const [w, h] = p.stdout.toString().trim().split(',').map(Number);
		if (!w || !h) throw new Error(`No video stream in ${file}`);
		return { w, h };
	};
	const da = await probe(a);
	const db = await probe(b);
	if (da.w !== db.w || da.h !== db.h) throw new Error(`Different sizes: ${da.w}×${da.h} vs ${db.w}×${db.h}`);
	const size = da.w * da.h;
	const gray = async (file: string) => (await ffmpeg(['-v', 'error', '-i', file, '-vf', 'format=gray', '-c:v', 'rawvideo', '-f', 'image2pipe', '-'])).stdout;
	const pcm = async (file: string) => (await ffmpeg(['-v', 'error', '-i', file, '-vn', '-c:a', 'pcm_s16le', '-f', 'wav', '-'])).stdout.subarray(44);

	const va = await gray(a);
	const vb = await gray(b);
	const na = Math.floor(va.length / size);
	const nb = Math.floor(vb.length / size);
	let identical = 0;
	let worstMean = 0;
	let worstFrame = -1;
	let worstPixel = 0;
	for (let f = 0; f < Math.min(na, nb); f++) {
		const fa = va.subarray(f * size, (f + 1) * size);
		const fb = vb.subarray(f * size, (f + 1) * size);
		if (crypto.createHash('sha1').update(fa).digest('hex') === crypto.createHash('sha1').update(fb).digest('hex')) {
			identical++;
			continue;
		}
		let s = 0;
		for (let i = 0; i < size; i++) {
			const d = Math.abs(fa[i] - fb[i]);
			s += d;
			if (d > worstPixel) worstPixel = d;
		}
		if (s / size > worstMean) {
			worstMean = s / size;
			worstFrame = f;
		}
	}
	const aa = await pcm(a);
	const ab = await pcm(b);
	let audioMax = 0;
	for (let i = 0; i + 1 < Math.min(aa.length, ab.length); i += 2) audioMax = Math.max(audioMax, Math.abs(aa.readInt16LE(i) - ab.readInt16LE(i)));
	const audioIdentical = aa.length === ab.length && aa.equals(ab);

	const sameFrames = na === nb;
	// Below 1/255 mean per frame the difference is encoder/raster noise, invisible on any screen.
	const visuallySame = sameFrames && worstMean < 1;
	(sameFrames ? log.ok : log.error)(`frames: ${na} vs ${nb}`);
	(visuallySame ? log.ok : log.warn)(
		`picture: ${identical}/${Math.min(na, nb)} frames bit-identical; largest difference ${worstMean.toFixed(3)}/255 mean${worstFrame >= 0 ? ` (frame ${worstFrame}, max pixel ${worstPixel})` : ''}`,
	);
	(audioIdentical ? log.ok : audioMax <= 2 ? log.ok : log.warn)(`audio: ${audioIdentical ? 'bit-identical' : `max sample difference ${audioMax} (of 32768)`}`);
	return { sameFrames, visuallySame, audioIdentical, identicalFrames: identical, frames: [na, nb] as const, worstMean, audioMax };
};
