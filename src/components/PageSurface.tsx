import React from 'react';
import { Video } from '@remotion/media';
import { Img, staticFile } from 'remotion';
import type { PageCapture } from '../types';
import { PlaceholderPage } from './PlaceholderPage';

/**
 * A real page rendered from its full-page capture tiles, scrolled to `scrollY`.
 * Only tiles near the visible window are mounted, so very long pages stay
 * cheap. A sticky header captured on its own stays pinned while content moves,
 * exactly like scrolling in a browser.
 */
export const PageSurface: React.FC<{
	page: PageCapture | null;
	scrollY: number;
	viewportHeight: number;
	/** Extra rows rendered above/below the window (e.g. for camera overscan). */
	overscan?: number;
	showHeader?: boolean;
}> = ({ page, scrollY, viewportHeight, overscan = 0, showHeader = true }) => {
	if (!page) return <PlaceholderPage height={viewportHeight} />;
	const width = page.viewport.width;
	if (page.recording && page.tiles.length === 0) {
		// Manual screen recording: plays as-is inside the device, scroll comes from the footage.
		return (
			<div style={{ position: 'relative', width, height: viewportHeight, overflow: 'hidden', backgroundColor: page.background }}>
				<Video src={staticFile(page.recording.src)} muted style={{ width, display: 'block' }} />
			</div>
		);
	}
	const maxScroll = Math.max(0, page.pageHeight - viewportHeight);
	const y = Math.min(Math.max(0, scrollY), maxScroll);
	const margin = viewportHeight * 0.75 + overscan;
	const visible = page.tiles.filter((t) => t.y + t.height >= y - margin && t.y <= y + viewportHeight + margin);
	return (
		<div style={{ position: 'relative', width, height: viewportHeight, overflow: 'hidden', backgroundColor: page.background }}>
			<div style={{ position: 'absolute', left: 0, top: 0, width, transform: `translateY(${-y}px)` }}>
				{visible.map((t) => (
					<Img
						key={t.src}
						src={staticFile(t.src)}
						style={{ position: 'absolute', left: 0, top: t.y, width, height: t.height, display: 'block' }}
					/>
				))}
			</div>
			{showHeader && page.header ? (
				<Img
					src={staticFile(page.header.src)}
					style={{ position: 'absolute', left: 0, top: 0, width, height: page.header.height, display: 'block' }}
				/>
			) : null}
		</div>
	);
};

/** Resolve a section reference (id, kind or "top") to a page-space scroll target. */
export const resolveSection = (page: PageCapture | null, ref: string | null | undefined) => {
	if (!page || !ref) return null;
	if (ref === 'top') return { top: 0, height: page.viewport.height, heading: page.heroHeadline, focus: null, kind: 'hero' as const, id: 'top', label: 'Top' };
	return page.sections.find((s) => s.id === ref) ?? page.sections.find((s) => s.kind === ref) ?? null;
};

/** Scroll position that frames a section nicely under a pinned header. */
export const scrollForSection = (page: PageCapture, top: number, viewportHeight: number) => {
	const headerH = page.header?.height ?? 0;
	const target = top - headerH - Math.min(48, viewportHeight * 0.05);
	return Math.min(Math.max(0, target), Math.max(0, page.pageHeight - viewportHeight));
};
