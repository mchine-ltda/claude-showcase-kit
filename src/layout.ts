import type { ShowcaseProps } from './schema';

export type Format = ShowcaseProps['format'];

export type SafeArea = { top: number; right: number; bottom: number; left: number };

export type FormatSpec = {
	width: number;
	height: number;
	/** Region kept clear of platform UI (Reels caption, buttons, header). */
	safe: SafeArea;
	label: string;
};

// Reels overlays: header/profile at the top, caption + audio row at the bottom,
// like/comment/share column on the right. Text stays inside these margins.
export const FORMATS: Record<Format, FormatSpec> = {
	reel: { width: 1080, height: 1920, safe: { top: 250, right: 130, bottom: 420, left: 90 }, label: 'Instagram Reel 9:16' },
	portrait: { width: 1080, height: 1350, safe: { top: 90, right: 90, bottom: 110, left: 90 }, label: 'Feed portrait 4:5' },
	square: { width: 1080, height: 1080, safe: { top: 80, right: 80, bottom: 80, left: 80 }, label: 'Square 1:1' },
	landscape: { width: 1920, height: 1080, safe: { top: 80, right: 120, bottom: 90, left: 120 }, label: 'Landscape 16:9' },
};

export const FPS = 30;

/**
 * Vertical band for the device (browser/phone) and, below it, the subtitle band.
 * The device is shown at one stable scale that fits this band: no zooms.
 */
export const stageBands = (format: Format, subtitles: boolean) => {
	const f = FORMATS[format];
	const top = f.safe.top + Math.round(f.height * 0.006);
	const subtitleHeight = subtitles ? Math.round(Math.min(f.width, f.height) * 0.14) : 0;
	const bottom = f.height - f.safe.bottom - subtitleHeight - Math.round(f.height * 0.008);
	return {
		deviceTop: top,
		deviceBottom: bottom,
		deviceCenterY: (top + bottom) / 2,
		subtitleTop: bottom + Math.round(f.height * 0.012),
		subtitleBottom: f.height - f.safe.bottom,
	};
};

export const safeBox = (format: Format) => {
	const f = FORMATS[format];
	return {
		x: f.safe.left,
		y: f.safe.top,
		width: f.width - f.safe.left - f.safe.right,
		height: f.height - f.safe.top - f.safe.bottom,
		/** Horizontal centre of the safe box (Reels' right rail makes it slightly left of frame centre). */
		cx: f.safe.left + (f.width - f.safe.left - f.safe.right) / 2,
		cy: f.safe.top + (f.height - f.safe.top - f.safe.bottom) / 2,
	};
};
