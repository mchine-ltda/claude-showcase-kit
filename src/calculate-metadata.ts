import type { CalculateMetadataFunction } from 'remotion';
import { FORMATS, FPS } from './layout';
import type { ShowcaseRenderProps } from './Showcase';
import { fontsReady } from './theme/fonts';
import { loadIdentityFonts, typeSetOf } from './theme/identity';
import { layoutStatement } from './theme/text-layout';
import { TYPE } from './theme/tokens';
import { buildTimeline } from './timeline';

/**
 * Derives duration (from narration + timing) and dimensions (from the format),
 * and pre-computes the statement typography once the fonts are loaded, so text
 * is measured with the real glyphs and always fits the safe area.
 */
export const calculateShowcaseMetadata: CalculateMetadataFunction<ShowcaseRenderProps> = async ({ props }) => {
	await fontsReady();
	await loadIdentityFonts(props.identity);
	const t = typeSetOf(props.identity);
	const f = FORMATS[props.format];
	const u = Math.min(f.width, f.height) / 1080;
	const cx = f.width / 2;
	// Centred text must clear both side margins (Reels' right rail is the wider one).
	const maxWidth = 2 * Math.min(cx - f.safe.left, f.width - f.safe.right - cx);
	const timeline = buildTimeline(props, FPS);
	const title = layoutStatement(props.intro.title, { maxWidth, baseSize: TYPE.headline * 1.05 * u, maxLines: 3, tracking: t.tracking, fontFamily: t.display });
	const cta = layoutStatement(props.agency.cta, { maxWidth, baseSize: TYPE.cta * u, maxLines: 3, tracking: t.tracking, fontFamily: t.display });
	// The cover lockup shares the frame with the devices: a slightly smaller title, two lines at most.
	const coverTitle = props.cover?.enabled ? layoutStatement(props.intro.title, { maxWidth, baseSize: TYPE.headline * 1.05 * u, maxLines: 2, tracking: t.tracking, fontFamily: t.display }) : undefined;
	return {
		durationInFrames: timeline.total,
		fps: FPS,
		width: f.width,
		height: f.height,
		props: { ...props, layout: { title, cta, coverTitle } },
	};
};
