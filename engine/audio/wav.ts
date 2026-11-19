import fs from 'node:fs';
import { ffmpeg } from '../lib/util';

// Minimal PCM WAV helpers. Remotion's bundled ffmpeg has no raw (f32le) muxer,
// so anything decoded goes through a 16-bit WAV pipe and is parsed here.

export type Pcm = { sampleRate: number; channels: Float32Array[] };

export const parseWav = (buf: Buffer): Pcm => {
	if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Not a WAV file');
	let off = 12;
	let fmt: { format: number; channels: number; sampleRate: number; bits: number } | null = null;
	while (off + 8 <= buf.length) {
		const id = buf.toString('ascii', off, off + 4);
		let size = buf.readUInt32LE(off + 4);
		const body = off + 8;
		if (id === 'fmt ') {
			fmt = { format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
		} else if (id === 'data' && fmt) {
			// ffmpeg writes 0xFFFFFFFF sizes when streaming to a pipe.
			if (size === 0xffffffff || body + size > buf.length) size = buf.length - body;
			const bytes = fmt.bits / 8;
			const frames = Math.floor(size / (bytes * fmt.channels));
			const channels = Array.from({ length: fmt.channels }, () => new Float32Array(frames));
			for (let i = 0; i < frames; i++) {
				for (let c = 0; c < fmt.channels; c++) {
					const p = body + (i * fmt.channels + c) * bytes;
					channels[c][i] =
						fmt.format === 3 && fmt.bits === 32 ? buf.readFloatLE(p) : fmt.bits === 16 ? buf.readInt16LE(p) / 32768 : fmt.bits === 24 ? buf.readIntLE(p, 3) / 8388608 : buf.readInt32LE(p) / 2147483648;
				}
			}
			return { sampleRate: fmt.sampleRate, channels };
		}
		off = body + size + (size % 2);
	}
	throw new Error('WAV has no data chunk');
};

export const encodeWav = (pcm: Pcm): Buffer => {
	const ch = pcm.channels.length;
	const n = pcm.channels[0].length;
	const buf = Buffer.alloc(44 + n * ch * 2);
	buf.write('RIFF', 0);
	buf.writeUInt32LE(36 + n * ch * 2, 4);
	buf.write('WAVE', 8);
	buf.write('fmt ', 12);
	buf.writeUInt32LE(16, 16);
	buf.writeUInt16LE(1, 20);
	buf.writeUInt16LE(ch, 22);
	buf.writeUInt32LE(pcm.sampleRate, 24);
	buf.writeUInt32LE(pcm.sampleRate * ch * 2, 28);
	buf.writeUInt16LE(ch * 2, 32);
	buf.writeUInt16LE(16, 34);
	buf.write('data', 36);
	buf.writeUInt32LE(n * ch * 2, 40);
	for (let i = 0; i < n; i++) {
		for (let c = 0; c < ch; c++) {
			const v = Math.max(-1, Math.min(1, pcm.channels[c][i]));
			buf.writeInt16LE(Math.round(v * 32767), 44 + (i * ch + c) * 2);
		}
	}
	return buf;
};

/** Decode any audio file ffmpeg understands (mp3, wav, m4a, ogg...) to PCM. */
export const decodeAudio = async (file: string, opts: { mono?: boolean; sampleRate?: number; maxSeconds?: number } = {}): Promise<Pcm> => {
	if (!fs.existsSync(file)) throw new Error(`No such file: ${file}`);
	const args = ['-v', 'error', '-i', file];
	if (opts.maxSeconds) args.push('-t', String(opts.maxSeconds));
	if (opts.mono) args.push('-ac', '1');
	if (opts.sampleRate) args.push('-ar', String(opts.sampleRate));
	args.push('-c:a', 'pcm_s16le', '-f', 'wav', '-');
	const res = await ffmpeg(args);
	if (res.code !== 0) throw new Error(`ffmpeg could not decode ${file}: ${res.stderr.slice(0, 300)}`);
	return parseWav(res.stdout);
};

export const durationOf = (pcm: Pcm) => pcm.channels[0].length / pcm.sampleRate;
