import React from 'react';
import { COLORS } from '../theme/tokens';
import { FONTS } from '../theme/fonts';
import type { PageCapture } from '../types';
import { PageSurface } from './PageSurface';

export const BROWSER_TOOLBAR = 76;
export const BROWSER_RADIUS = 22;

/**
 * Minimal dark desktop browser: muted traffic lights, back/forward glyphs and a
 * centred address pill. Designed at the page's CSS width so 1 design px = 1
 * page px; Stage3D sizes it on screen.
 */
export const BrowserFrame: React.FC<{
	page: PageCapture | null;
	displayUrl: string;
	scrollY: number;
	viewportHeight: number;
	/** Rendered on top of the page viewport (cursor, interaction states). */
	overlay?: React.ReactNode;
	/** Replace the page surface entirely (e.g. an interaction flipbook). */
	content?: React.ReactNode;
	/** 0..1 page-load progress shown as a fine line under the toolbar. */
	loading?: number | null;
	accent?: string;
}> = ({ page, displayUrl, scrollY, viewportHeight, overlay, content, loading = null, accent = '#ffffff' }) => {
	const width = page?.viewport.width ?? 1440;
	return (
		<div
			style={{
				width,
				height: viewportHeight + BROWSER_TOOLBAR,
				borderRadius: BROWSER_RADIUS,
				overflow: 'hidden',
				background: '#141416',
				boxShadow: `0 0 0 1px rgba(255,255,255,0.10), inset 0 1px 0 rgba(255,255,255,0.14)`,
				position: 'relative',
			}}
		>
			<Toolbar width={width} displayUrl={displayUrl} />
			{loading !== null ? (
				<div
					style={{
						position: 'absolute',
						left: 0,
						top: BROWSER_TOOLBAR - 3,
						height: 3,
						width: width * Math.min(1, 0.15 + loading * 0.85),
						background: accent,
						opacity: loading < 0.85 ? 0.9 : 0.9 * (1 - (loading - 0.85) / 0.15),
						zIndex: 2,
					}}
				/>
			) : null}
			<div style={{ position: 'absolute', left: 0, top: BROWSER_TOOLBAR, width, height: viewportHeight, overflow: 'hidden' }}>
				{content ?? <PageSurface page={page} scrollY={scrollY} viewportHeight={viewportHeight} />}
				{overlay}
			</div>
		</div>
	);
};

const Toolbar: React.FC<{ width: number; displayUrl: string }> = ({ width, displayUrl }) => {
	const dot = (c: string): React.CSSProperties => ({ width: 15, height: 15, borderRadius: 8, background: c, boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.25)' });
	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				height: BROWSER_TOOLBAR,
				background: 'linear-gradient(180deg, #232327 0%, #1b1b1f 100%)',
				borderBottom: '1px solid rgba(255,255,255,0.06)',
				display: 'flex',
				alignItems: 'center',
				padding: '0 26px',
				fontFamily: FONTS.sans,
			}}
		>
			<div style={{ display: 'flex', gap: 10 }}>
				<div style={dot('#ec6a5e')} />
				<div style={dot('#f4bf4f')} />
				<div style={dot('#61c554')} />
			</div>
			<svg width={58} height={20} viewBox="0 0 58 20" style={{ marginLeft: 34, opacity: 0.5 }}>
				<path d="M12 4 6 10l6 6" fill="none" stroke={COLORS.textSoft} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
				<path d="M40 4l6 6-6 6" fill="none" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
			</svg>
			<div
				style={{
					position: 'absolute',
					left: '50%',
					transform: 'translateX(-50%)',
					width: Math.min(620, width * 0.44),
					height: 42,
					borderRadius: 12,
					background: 'rgba(255,255,255,0.06)',
					boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					gap: 10,
					color: COLORS.textSoft,
					fontSize: 19,
					fontWeight: 500,
					letterSpacing: '-0.005em',
				}}
			>
				{displayUrl ? (
					<>
						<svg width={14} height={16} viewBox="0 0 14 16">
							<rect x={1.5} y={7} width={11} height={8} rx={2} fill={COLORS.textMuted} />
							<path d="M4 7V5a3 3 0 0 1 6 0v2" fill="none" stroke={COLORS.textMuted} strokeWidth={1.6} />
						</svg>
						<span>{displayUrl}</span>
					</>
				) : null}
			</div>
			<div style={{ marginLeft: 'auto', display: 'flex', gap: 18, opacity: 0.45 }}>
				<div style={{ width: 18, height: 14, borderRadius: 3, border: `1.6px solid ${COLORS.textSoft}` }} />
				<div style={{ width: 16, height: 16, position: 'relative' }}>
					<div style={{ position: 'absolute', left: 7, top: 0, width: 1.8, height: 16, background: COLORS.textSoft }} />
					<div style={{ position: 'absolute', left: 0, top: 7, width: 16, height: 1.8, background: COLORS.textSoft }} />
				</div>
			</div>
		</div>
	);
};
