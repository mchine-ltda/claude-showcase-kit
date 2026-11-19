import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { BROWSER_RADIUS, BROWSER_TOOLBAR, BrowserFrame } from '../components/BrowserFrame';
import { PageSurface } from '../components/PageSurface';
import { PHONE, PhoneFrame, phoneSize } from '../components/PhoneFrame';
import { RevealLines } from '../components/RevealLines';
import { Stage3D } from '../components/Stage3D';
import { progress, tween } from '../lib/anim';
import { eyebrowText, useType } from '../theme/identity';
import { COLORS, EASE, lighten, SHADOW, withAlpha } from '../theme/tokens';
import type { TextLines } from '../theme/text-layout';
import { COVER_BEATS } from '../timeline';
import type { SceneProps } from './scene-props';

/** Browser viewport height shown in the lockup: the site's hero, in a desktop proportion. */
const COVER_VIEWPORT = 800;

/**
 * Part 1 with a cover: the real website's hero in the browser, the real mobile hero
 * in the phone in front, the project title above and the agency signature below,
 * composed so the settled frame works as the Instagram cover and keeps everything
 * important inside the profile grid's 3:4 and 1:1 centre crops. The devices keep
 * drifting gently, so the opening is never a static slide.
 */
export const CoverIntro: React.FC<SceneProps & { title: TextLines }> = ({ props, plan, title }) => {
	const frame = useCurrentFrame();
	const { width: W, height: H } = useVideoConfig();
	const u = Math.min(W, H) / 1080;
	const b = COVER_BEATS;
	const t = useType();
	const desktop = props.capture?.journeys?.desktop?.pages[0] ?? props.capture?.desktop ?? null;
	const mobile = props.capture?.journeys?.mobile?.pages[0] ?? props.capture?.mobile ?? null;
	const accent = props.project.accent;

	const devIn = progress(frame, 0, b.devicesIn, EASE.glide);
	const phoneIn = progress(frame, b.phoneDelay, b.phoneDelay + b.devicesIn, EASE.glide);
	const eyebrowP = progress(frame, 0, b.eyebrowIn, EASE.glide);
	const agencyP = progress(frame, b.agencyIn, b.agencyIn + 12, EASE.glide);
	// A slow upward drift with a touch of parallax between the devices.
	const drift = tween(frame, 0, plan.duration, 0, -10 * u, EASE.soft);

	// Lockup geometry (designed at 1080×1920, scaled for other formats).
	const browserW = (desktop && mobile ? 800 : 820) * u;
	const browserScale = browserW / (desktop?.viewport.width ?? 1280);
	const both = Boolean(desktop && mobile);
	const browserX = both ? W * 0.45 : W / 2;
	const browserY = H * 0.555;
	const size = phoneSize(mobile);
	const phoneScale = ((both ? 560 : 690) * u) / size.height;
	const phoneX = both ? W * 0.75 : W / 2;
	const phoneY = both ? H * 0.6 : H * 0.553;
	const titleY = H * 0.305;

	return (
		<AbsoluteFill>
			<AbsoluteFill style={{ background: `radial-gradient(64% 36% at 50% 57%, ${withAlpha(accent, 0.24)} 0%, ${withAlpha(accent, 0.07)} 45%, rgba(0,0,0,0) 74%)` }} />
			{desktop ? (
				<Stage3D
					width={desktop.viewport.width}
					height={COVER_VIEWPORT + BROWSER_TOOLBAR}
					x={browserX}
					y={browserY + drift + (1 - devIn) * 40 * u}
					scale={browserScale}
					opacity={devIn}
					perspective={2800}
				>
					<div style={{ position: 'absolute', inset: 0, borderRadius: BROWSER_RADIUS, boxShadow: SHADOW.window }} />
					<BrowserFrame
						page={desktop}
						displayUrl={props.project.displayUrl}
						scrollY={0}
						viewportHeight={COVER_VIEWPORT}
						content={<PageSurface page={desktop} scrollY={0} viewportHeight={COVER_VIEWPORT} />}
					/>
				</Stage3D>
			) : null}
			{mobile ? (
				<Stage3D width={size.width} height={size.height} x={phoneX} y={phoneY + drift * 1.4 + (1 - phoneIn) * 60 * u} scale={phoneScale} opacity={phoneIn} perspective={2600}>
					<div style={{ position: 'absolute', inset: 0, borderRadius: PHONE.radius, boxShadow: SHADOW.device }} />
					<PhoneFrame page={mobile} scrollY={0} sheen={-0.2} />
				</Stage3D>
			) : null}
			<div
				style={{
					position: 'absolute',
					left: 0,
					right: 0,
					top: titleY,
					translate: '0 -50%',
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
				}}
			>
				{props.intro.eyebrow ? (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 14 * u,
							marginBottom: 26 * u,
							...eyebrowText(t, eyebrowP, u),
							color: COLORS.textMuted,
							opacity: eyebrowP,
							translate: `0 ${(1 - eyebrowP) * 12 * u}px`,
						}}
					>
						<span style={{ width: 9 * u, height: 9 * u, borderRadius: '50%', background: accent, display: 'inline-block' }} />
						<span>{props.intro.eyebrow}</span>
					</div>
				) : null}
				<RevealLines text={title} start={b.titleStart} duration={b.titleDuration} stagger={b.titleStagger} emphasisColor={lighten(accent, 0.35)} />
			</div>
			{props.cover.showAgency ? (
				<div
					style={{
						position: 'absolute',
						left: 0,
						right: 0,
						top: H * 0.765,
						translate: `0 ${-50 + (1 - agencyP) * 30}%`,
						display: 'flex',
						justifyContent: 'center',
						alignItems: 'center',
						gap: 14 * u,
						opacity: agencyP * 0.9,
					}}
				>
					{props.agency.logo ? (
						<Img src={staticFile(props.agency.logo)} style={{ height: 42 * u, width: 'auto', display: 'block' }} />
					) : (
						<>
							<span style={{ width: 7 * u, height: 7 * u, borderRadius: '50%', background: props.agency.accent, display: 'inline-block' }} />
							<span
								style={{
									fontFamily: t.body,
									fontWeight: 500,
									fontSize: 23 * u,
									letterSpacing: '0.28em',
									textTransform: 'uppercase',
									color: COLORS.textSoft,
								}}
							>
								{props.agency.name}
							</span>
						</>
					)}
				</div>
			) : null}
		</AbsoluteFill>
	);
};
