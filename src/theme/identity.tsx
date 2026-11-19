import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { loadFont as loadGeist } from '@remotion/google-fonts/Geist';
import { loadFont as loadGeistMono } from '@remotion/google-fonts/GeistMono';
import { loadFont as loadInterTight } from '@remotion/google-fonts/InterTight';
import { loadFont as loadInstrumentSerif } from '@remotion/google-fonts/InstrumentSerif';
import { continueRender, delayRender, staticFile } from 'remotion';
import type { ShowcaseProps } from '../schema';
import { FONTS } from './fonts';
import { TYPE } from './tokens';

// Brand typography. A video without an identity renders exactly as every video made
// before identities existed (Inter Tight, spaced caps). An identity swaps the faces for
// titles, subtitles and labels to the agency's own, from Google Fonts bundled with the
// engine or from local font files staged with the project.

type Identity = NonNullable<ShowcaseProps['identity']>;
type Face = Identity['display'];

export type TypeSet = {
	display: string;
	body: string;
	mono: string;
	serif: string;
	eyebrow: 'spaced' | 'mono';
	tracking: string;
};

export const LEGACY_TYPE: TypeSet = { display: FONTS.sans, body: FONTS.sans, mono: FONTS.sans, serif: FONTS.serif, eyebrow: 'spaced', tracking: TYPE.tracking.headline };

const GOOGLE: Record<string, () => { fontFamily: string; waitUntilDone: () => Promise<unknown> }> = {
	'Inter Tight': () => loadInterTight('normal', { weights: ['400', '500', '600'], subsets: ['latin', 'latin-ext'] }),
	'Instrument Serif': () => loadInstrumentSerif('italic', { weights: ['400'], subsets: ['latin', 'latin-ext'] }),
	Geist: () => loadGeist('normal', { weights: ['400', '500', '600'], subsets: ['latin', 'latin-ext'] }),
	'Geist Mono': () => loadGeistMono('normal', { weights: ['400', '500'], subsets: ['latin', 'latin-ext'] }),
};

const cssFamily = (f: Face) => `"${f.family}", ${FONTS.sans}`;

const loading = new Map<string, Promise<void>>();

/** Load one face: its staged files, else the bundled Google font, else trust the system. */
const loadFace = (f: Face): Promise<void> => {
	const key = `${f.family}|${f.files.map((x) => x.src).join(',')}`;
	const cached = loading.get(key);
	if (cached) return cached;
	let p: Promise<void>;
	if (f.files.length) {
		p = Promise.all(
			f.files.map(async (file) => {
				const face = new FontFace(f.family, `url("${staticFile(file.src)}")`, { weight: String(file.weight) });
				document.fonts.add(face);
				await face.load();
			}),
		).then(() => undefined);
	} else if (GOOGLE[f.family]) {
		p = GOOGLE[f.family]()
			.waitUntilDone()
			.then(() => undefined);
	} else p = Promise.resolve();
	loading.set(key, p);
	return p;
};

export const loadIdentityFonts = async (identity: ShowcaseProps['identity'] | undefined) => {
	if (!identity) return;
	await Promise.all([loadFace(identity.display), loadFace(identity.body), loadFace(identity.mono)]);
};

export const typeSetOf = (identity: ShowcaseProps['identity'] | undefined): TypeSet =>
	identity
		? {
				display: cssFamily(identity.display),
				body: cssFamily(identity.body),
				mono: cssFamily(identity.mono),
				serif: FONTS.serif,
				eyebrow: identity.eyebrow,
				tracking: identity.tracking,
			}
		: LEGACY_TYPE;

const TypeContext = createContext<TypeSet>(LEGACY_TYPE);

/** Provides the brand faces to every scene, holding the render until they are loaded. */
export const TypeProvider: React.FC<{ identity: ShowcaseProps['identity'] | undefined; children: React.ReactNode }> = ({ identity, children }) => {
	const [handle] = useState(() => (identity ? delayRender('Loading brand fonts') : null));
	useEffect(() => {
		if (handle === null) return;
		loadIdentityFonts(identity)
			.catch((e) => console.error('brand fonts failed to load', e))
			.finally(() => continueRender(handle));
	}, [handle, identity]);
	const value = useMemo(() => typeSetOf(identity), [identity]);
	return <TypeContext.Provider value={value}>{children}</TypeContext.Provider>;
};

export const useType = () => useContext(TypeContext);

/** Eyebrow label text: wide-tracked caps (the original look) or monospaced caps. */
export const eyebrowText = (t: TypeSet, p: number, u: number): React.CSSProperties =>
	t.eyebrow === 'mono'
		? { fontFamily: t.mono, fontWeight: 500, fontSize: TYPE.eyebrow * 0.88 * u, textTransform: 'uppercase', letterSpacing: `${0.14 + (1 - p) * 0.1}em` }
		: { fontFamily: t.body, fontWeight: 500, fontSize: TYPE.eyebrow * u, textTransform: 'uppercase', letterSpacing: `${0.32 + (1 - p) * 0.16}em` };
