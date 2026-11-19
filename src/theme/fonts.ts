import { loadFont as loadInterTight } from '@remotion/google-fonts/InterTight';
import { loadFont as loadInstrumentSerif } from '@remotion/google-fonts/InstrumentSerif';

// Agency typography: a tight grotesk for statements, an italic serif for the
// single emphasised word. Both are SIL OFL licensed Google Fonts.

const sans = loadInterTight('normal', {
	weights: ['400', '500', '600'],
	subsets: ['latin', 'latin-ext'],
});

const serif = loadInstrumentSerif('italic', {
	weights: ['400'],
	subsets: ['latin', 'latin-ext'],
});

export const FONTS = {
	sans: sans.fontFamily,
	serif: serif.fontFamily,
};

export const fontsReady = () => Promise.all([sans.waitUntilDone(), serif.waitUntilDone()]);
