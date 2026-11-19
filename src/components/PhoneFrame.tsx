import React from 'react';
import { FONTS } from '../theme/fonts';
import type { PageCapture } from '../types';
import { PageSurface } from './PageSurface';

export const PHONE = {
	bezel: 15,
	edge: 4,
	radius: 74,
	statusBar: 54,
};

export const phoneSize = (page: PageCapture | null) => {
	const sw = page?.viewport.width ?? 390;
	const sh = page?.viewport.height ?? 844;
	const pad = PHONE.bezel + PHONE.edge;
	return { width: sw + pad * 2, height: sh + pad * 2, screenWidth: sw, screenHeight: sh };
};

const isDark = (color: string) => {
	const m = /^#?([0-9a-f]{6})/i.exec(color.trim());
	if (!m) return false;
	const n = parseInt(m[1], 16);
	const l = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
	return l < 0.5;
};

/**
 * A modern, unbranded flagship phone: graphite edge with a fine metallic rim,
 * thin black bezel, island cut-out, side keys and a faint glass sheen. The
 * status bar takes the page colour like mobile Safari, and the page sits below.
 */
export const PhoneFrame: React.FC<{
	page: PageCapture | null;
	scrollY: number;
	/** -1..1, slides the glass sheen for a parallax highlight as the phone turns. */
	sheen?: number;
	overlay?: React.ReactNode;
	content?: React.ReactNode;
}> = ({ page, scrollY, sheen = 0, overlay, content }) => {
	const { width, height, screenWidth, screenHeight } = phoneSize(page);
	const pad = PHONE.bezel + PHONE.edge;
	// Like mobile Safari, the status bar takes the colour at the very top of the page.
	const bg = page?.topColor ?? page?.background ?? '#ffffff';
	const fg = isDark(bg) ? '#ffffff' : '#0b0b0c';
	const viewportHeight = screenHeight - PHONE.statusBar;
	const key = (style: React.CSSProperties) => (
		<div style={{ position: 'absolute', width: 5, borderRadius: 3, background: 'linear-gradient(90deg,#2a2a2e,#4a4a50 50%,#1c1c1f)', ...style }} />
	);
	return (
		<div style={{ position: 'relative', width, height }}>
			{key({ left: -4, top: 190, height: 44 })}
			{key({ left: -4, top: 262, height: 78 })}
			{key({ left: -4, top: 356, height: 78 })}
			{key({ right: -4, top: 290, height: 118 })}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					borderRadius: PHONE.radius,
					background: 'linear-gradient(145deg, #4a4a50 0%, #1e1e21 22%, #111113 55%, #2c2c31 85%, #55555c 100%)',
					boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.22), inset 0 0 0 4px #09090a, 0 0 0 1px rgba(0,0,0,0.6)',
				}}
			/>
			<div
				style={{
					position: 'absolute',
					left: pad,
					top: pad,
					width: screenWidth,
					height: screenHeight,
					borderRadius: PHONE.radius - pad + 2,
					overflow: 'hidden',
					background: bg,
				}}
			>
				<StatusBar color={fg} background={bg} />
				<div style={{ position: 'absolute', left: 0, top: PHONE.statusBar, width: screenWidth, height: viewportHeight, overflow: 'hidden' }}>
					{content ?? <PageSurface page={page} scrollY={scrollY} viewportHeight={viewportHeight} />}
					{overlay}
				</div>
				<div
					style={{
						position: 'absolute',
						left: '50%',
						bottom: 9,
						width: 136,
						height: 5,
						marginLeft: -68,
						borderRadius: 3,
						background: fg,
						opacity: 0.55,
					}}
				/>
				<div
					style={{
						position: 'absolute',
						inset: 0,
						background: `linear-gradient(118deg, rgba(255,255,255,0) ${18 + sheen * 14}%, rgba(255,255,255,0.09) ${30 + sheen * 14}%, rgba(255,255,255,0) ${46 + sheen * 14}%)`,
						pointerEvents: 'none',
					}}
				/>
			</div>
			<div
				style={{
					position: 'absolute',
					left: '50%',
					top: pad + 11,
					width: 124,
					height: 36,
					marginLeft: -62,
					borderRadius: 18,
					background: '#000',
					boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
				}}
			/>
		</div>
	);
};

const StatusBar: React.FC<{ color: string; background: string }> = ({ color, background }) => (
	<div
		style={{
			position: 'absolute',
			left: 0,
			top: 0,
			right: 0,
			height: PHONE.statusBar,
			background,
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'space-between',
			padding: '6px 34px 0 44px',
			fontFamily: FONTS.sans,
			fontWeight: 600,
			fontSize: 17,
			color,
			letterSpacing: '-0.01em',
		}}
	>
		<span>9:41</span>
		<svg width={78} height={14} viewBox="0 0 78 14" fill={color}>
			<rect x={0} y={9} width={3.4} height={5} rx={1} />
			<rect x={5} y={6.5} width={3.4} height={7.5} rx={1} />
			<rect x={10} y={4} width={3.4} height={10} rx={1} />
			<rect x={15} y={1.5} width={3.4} height={12.5} rx={1} />
			<path d="M33 4.2a9 9 0 0 1 12 0l-1.4 1.5a7 7 0 0 0-9.2 0Z M35.6 7.1a5.2 5.2 0 0 1 6.8 0L41 8.6a3.2 3.2 0 0 0-4 0Z M39 12.6l-1.9-2a2.6 2.6 0 0 1 3.8 0Z" />
			<rect x={52} y={1.5} width={22} height={11} rx={3.2} fill="none" stroke={color} strokeOpacity={0.45} strokeWidth={1.1} />
			<rect x={54} y={3.5} width={16} height={7} rx={1.8} />
			<rect x={75.2} y={5} width={1.6} height={4} rx={0.8} opacity={0.5} />
		</svg>
	</div>
);
