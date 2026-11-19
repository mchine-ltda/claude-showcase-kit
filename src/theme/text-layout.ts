import { measureText } from '@remotion/layout-utils';
import { FONTS } from './fonts';

// Measured, balanced line-breaking for statement typography. Runs in
// calculateMetadata after the fonts have loaded so lines never clip and every
// line can be revealed individually.

export type Word = { text: string; emphasis: boolean };
export type TextLines = { fontSize: number; lines: Word[][]; lineWidths: number[] };

const SANS_WEIGHT = '600';
export const SERIF_SCALE = 1.1;

/** Split "Your business deserves *better*." into words, flagging *emphasis*. */
export const parseEmphasis = (input: string): Word[] => {
	const words: Word[] = [];
	const re = /\*([^*]+)\*|(\S+)/g;
	let m: RegExpExecArray | null;
	const text = input.replace(/\s+/g, ' ').trim();
	while ((m = re.exec(text))) {
		if (m[1] !== undefined) {
			for (const w of m[1].split(' ')) if (w) words.push({ text: w, emphasis: true });
		} else {
			// Punctuation glued to an emphasised word stays in the sans face.
			const raw = m[2];
			const glued = /^\*([^*]+)\*([^*]*)$/.exec(raw);
			if (glued) {
				words.push({ text: glued[1], emphasis: true });
				if (glued[2]) words.push({ text: glued[2], emphasis: false });
			} else {
				words.push({ text: raw, emphasis: false });
			}
		}
	}
	return words;
};

const wordWidth = (w: Word, fontSize: number, tracking: string, family: string) =>
	measureText({
		text: w.text,
		fontFamily: w.emphasis ? FONTS.serif : family,
		fontSize: w.emphasis ? fontSize * SERIF_SCALE : fontSize,
		fontWeight: w.emphasis ? '400' : SANS_WEIGHT,
		letterSpacing: w.emphasis ? '-0.01em' : tracking,
		validateFontIsLoaded: false,
	}).width;

/** Punctuation-only tokens attach to the previous word without a space. */
const isGlue = (w: Word) => /^[.,!?;:…)]+$/.test(w.text);

export const layoutStatement = (
	input: string,
	opts: { maxWidth: number; baseSize: number; maxLines: number; tracking: string; minScale?: number; fontFamily?: string },
): TextLines => {
	const words = parseEmphasis(input);
	if (words.length === 0) return { fontSize: opts.baseSize, lines: [], lineWidths: [] };
	const minSize = opts.baseSize * (opts.minScale ?? 0.55);

	for (let size = opts.baseSize; size >= minSize; size -= 2) {
		const space = size * 0.26;
		const widths = words.map((w) => wordWidth(w, size, opts.tracking, opts.fontFamily ?? FONTS.sans));
		const lineWidth = (a: number, b: number) => {
			let total = 0;
			for (let i = a; i < b; i++) total += widths[i] + (i > a && !isGlue(words[i]) ? space : 0);
			return total;
		};
		if (Math.max(...widths) > opts.maxWidth) continue;

		// Smallest number of lines that fits, then the most balanced split.
		for (let k = 1; k <= Math.min(opts.maxLines, words.length); k++) {
			const best = bestSplit(words.length, k, lineWidth, opts.maxWidth, words);
			if (best) {
				const lines: Word[][] = [];
				const lineWidths: number[] = [];
				let start = 0;
				for (const end of [...best, words.length]) {
					lines.push(words.slice(start, end));
					lineWidths.push(lineWidth(start, end));
					start = end;
				}
				return { fontSize: size, lines, lineWidths };
			}
		}
	}
	// Fallback: one word per line at the minimum size.
	return { fontSize: minSize, lines: words.map((w) => [w]), lineWidths: words.map(() => opts.maxWidth) };
};

// Exhaustive search is fine: statements are short (< 12 words, <= 4 lines).
const bestSplit = (
	n: number,
	k: number,
	lineWidth: (a: number, b: number) => number,
	maxWidth: number,
	words: Word[],
): number[] | null => {
	let best: number[] | null = null;
	let bestScore = Infinity;
	const rec = (start: number, linesLeft: number, breaks: number[], worst: number, widths: number[]) => {
		if (linesLeft === 1) {
			const w = lineWidth(start, n);
			if (w > maxWidth) return;
			const all = [...widths, w];
			// Prefer balanced lines, and a last line that is not a lonely orphan.
			const spread = Math.max(...all) - Math.min(...all);
			const orphan = n - start === 1 && k > 1 ? maxWidth * 0.25 : 0;
			const score = Math.max(worst, w) + spread * 0.6 + orphan;
			if (score < bestScore) {
				bestScore = score;
				best = breaks;
			}
			return;
		}
		for (let end = start + 1; end <= n - (linesLeft - 1); end++) {
			if (isGlue(words[end])) continue;
			const w = lineWidth(start, end);
			if (w > maxWidth) break;
			rec(end, linesLeft - 1, [...breaks, end], Math.max(worst, w), [...widths, w]);
		}
	};
	rec(0, k, [], 0, []);
	return best;
};
