import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ENGINE_ROOT, ensureDir, log } from '../lib/util';
import { decodeAudio, type Pcm } from '../audio/wav';

// Text-to-speech providers behind one interface. Each returns mono PCM.
//  - kokoro:     local neural TTS (Kokoro-82M, Apache-2.0), no API key, British voices
//  - elevenlabs: ELEVENLABS_API_KEY
//  - openai:     OPENAI_API_KEY (gpt-4o-mini-tts, accent steered with instructions)
//  - azure:      AZURE_SPEECH_KEY + AZURE_SPEECH_REGION (en-IE / en-GB neural voices via SSML)

export type VoiceConfig = {
	provider: 'kokoro' | 'elevenlabs' | 'openai' | 'azure';
	voice: string;
	speed: number;
	model?: string;
	instructions?: string;
	stability?: number;
	style?: number;
};

export const DEFAULT_VOICES: Record<VoiceConfig['provider'], string> = {
	kokoro: 'bf_emma',
	elevenlabs: '',
	openai: 'sage',
	azure: 'en-IE-EmilyNeural',
};

export const providerStatus = (provider: VoiceConfig['provider']) => {
	if (provider === 'kokoro') return { ok: true, detail: 'local model (downloads ~330 MB on first use)' };
	if (provider === 'elevenlabs') return { ok: Boolean(process.env.ELEVENLABS_API_KEY), detail: 'needs ELEVENLABS_API_KEY' };
	if (provider === 'openai') return { ok: Boolean(process.env.OPENAI_API_KEY), detail: 'needs OPENAI_API_KEY' };
	return { ok: Boolean(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION), detail: 'needs AZURE_SPEECH_KEY and AZURE_SPEECH_REGION' };
};

let kokoro: Promise<{ generate: (text: string, o: { voice: string; speed: number }) => Promise<{ audio: Float32Array; sampling_rate: number }> }> | null = null;

const loadKokoro = () => {
	if (!kokoro) {
		kokoro = (async () => {
			const transformers = await import('@huggingface/transformers');
			transformers.env.cacheDir = ensureDir(path.join(ENGINE_ROOT, '.cache', 'models'));
			const { KokoroTTS } = await import('kokoro-js');
			log.info('loading Kokoro-82M (fp32)…');
			const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32', device: 'cpu' });
			return tts as unknown as Awaited<NonNullable<typeof kokoro>>;
		})();
	}
	return kokoro;
};

const fromMp3 = async (bytes: ArrayBuffer): Promise<Pcm> => {
	const tmp = path.join(os.tmpdir(), `wse-tts-${process.pid}-${Date.now()}.mp3`);
	fs.writeFileSync(tmp, Buffer.from(bytes));
	try {
		return await decodeAudio(tmp, { mono: true, sampleRate: 48000 });
	} finally {
		fs.rmSync(tmp, { force: true });
	}
};

const expectOk = async (res: Response, provider: string) => {
	if (!res.ok) throw new Error(`${provider} TTS failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
	return res.arrayBuffer();
};

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const synthesize = async (text: string, v: VoiceConfig): Promise<Pcm> => {
	const status = providerStatus(v.provider);
	if (!status.ok) throw new Error(`Voice provider "${v.provider}" is not configured: ${status.detail}`);
	const voice = v.voice || DEFAULT_VOICES[v.provider];
	if (v.provider === 'kokoro') {
		const tts = await loadKokoro();
		const out = await tts.generate(text, { voice, speed: v.speed });
		return { sampleRate: out.sampling_rate, channels: [out.audio] };
	}
	if (v.provider === 'elevenlabs') {
		if (!voice) throw new Error('ElevenLabs needs narration.voice.voice set to a voice ID');
		const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_192`, {
			method: 'POST',
			headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY!, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
			body: JSON.stringify({
				text,
				model_id: v.model ?? 'eleven_multilingual_v2',
				voice_settings: { stability: v.stability ?? 0.5, similarity_boost: 0.75, style: v.style ?? 0.2, speed: v.speed },
			}),
		});
		return fromMp3(await expectOk(res, 'ElevenLabs'));
	}
	if (v.provider === 'openai') {
		const res = await fetch('https://api.openai.com/v1/audio/speech', {
			method: 'POST',
			headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: v.model ?? 'gpt-4o-mini-tts',
				voice,
				input: text,
				speed: v.speed,
				response_format: 'mp3',
				instructions:
					v.instructions ??
					'Neutral Irish or British English accent. Warm, confident and friendly, conversational, natural pauses. Not an advertising voice.',
			}),
		});
		return fromMp3(await expectOk(res, 'OpenAI'));
	}
	const region = process.env.AZURE_SPEECH_REGION!;
	const lang = /^[a-z]{2}-[A-Z]{2}/.exec(voice)?.[0] ?? 'en-IE';
	const rate = `${Math.round((v.speed - 1) * 100)}%`;
	const ssml = `<speak version="1.0" xml:lang="${lang}"><voice name="${voice}"><prosody rate="${rate}">${xmlEscape(text)}</prosody></voice></speak>`;
	const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
		method: 'POST',
		headers: {
			'Ocp-Apim-Subscription-Key': process.env.AZURE_SPEECH_KEY!,
			'Content-Type': 'application/ssml+xml',
			'X-Microsoft-OutputFormat': 'audio-48khz-192kbitrate-mono-mp3',
			'User-Agent': 'claude-showcase-kit',
		},
		body: ssml,
	});
	return fromMp3(await expectOk(res, 'Azure'));
};
