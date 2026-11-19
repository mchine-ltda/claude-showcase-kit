import React from 'react';
import { Video } from '@remotion/media';
import { AbsoluteFill, Freeze, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { stageBands } from '../layout';
import { progress } from '../lib/anim';
import type { ShowcaseProps } from '../schema';
import { EASE, SHADOW } from '../theme/tokens';
import { PRESENTER_FADE, presenterWindow, type Timeline } from '../timeline';

type Presenter = NonNullable<ShowcaseProps['presenter']>;
type Card = NonNullable<ReturnType<typeof presenterWindow>>;

export const PresenterLayer: React.FC<{ props: ShowcaseProps; timeline: Timeline }> = ({ props, timeline }) => {
	const presenter = props.presenter;
	if (!presenter) return null;
	return (
		<>
			{(['intro', 'outro'] as const).map((segment) => {
				const card = presenterWindow(timeline, segment);
				return card ? (
					<Sequence key={segment} name={`Presenter · ${segment}`} from={card.from} durationInFrames={card.to - card.from} layout="none">
						<PresenterCard presenter={presenter} props={props} card={card} />
					</Sequence>
				) : null;
			})}
		</>
	);
};

const PresenterCard: React.FC<{ presenter: Presenter; props: ShowcaseProps; card: Card }> = ({ presenter, props, card }) => {
	const frame = useCurrentFrame();
	const { width, height, fps } = useVideoConfig();
	const duration = card.to - card.from;
	const shown = progress(frame, 0, PRESENTER_FADE, EASE.glide) * (1 - progress(frame, duration - PRESENTER_FADE, duration, EASE.soft));
	const { inset } = presenter;
	const croppedWidth = presenter.width * (1 - inset.left - inset.right);
	const croppedHeight = presenter.height * (1 - inset.top - inset.bottom);
	const bands = stageBands(props.format, props.subtitles.enabled);
	const unit = Math.min(width, height) / 1080;
	const scale = Math.min((width * 0.72) / croppedWidth, (bands.deviceBottom - bands.deviceTop - 34 * unit) / croppedHeight);
	const cardWidth = croppedWidth * scale;
	const cardHeight = croppedHeight * scale;
	const videoStyle: React.CSSProperties = {
		position: 'absolute',
		left: -presenter.width * inset.left * scale,
		top: -presenter.height * inset.top * scale,
		width: presenter.width * scale,
		height: presenter.height * scale,
	};
	const src = staticFile(presenter.src);
	return (
		<AbsoluteFill style={{ opacity: shown, pointerEvents: 'none' }}>
			<AbsoluteFill style={{ background: 'rgba(7,7,8,0.94)' }} />
			<div
				style={{
					position: 'absolute',
					left: (width - cardWidth) / 2,
					top: bands.deviceCenterY - cardHeight / 2,
					width: cardWidth,
					height: cardHeight,
					overflow: 'hidden',
					borderRadius: 38 * unit,
					boxShadow: SHADOW.device,
					background: '#151515',
					translate: `0 ${(1 - shown) * 22 * unit}px`,
				}}
			>
				{card.lines.map((plan, i) => {
					const start = i === 0 ? card.from : plan.from;
					const sourceStart = Math.round((plan.line.sourceStart ?? 0) * fps);
					const speechEnd = plan.from + plan.duration;
					const next = card.lines[i + 1]?.from ?? card.to;
					return (
						<React.Fragment key={i}>
							<Sequence from={start - card.from} durationInFrames={speechEnd - start} layout="none">
								<Video src={src} trimBefore={Math.max(0, sourceStart - (plan.from - start))} muted objectFit="cover" style={videoStyle} />
							</Sequence>
							{next > speechEnd ? (
								<Sequence from={speechEnd - card.from} durationInFrames={next - speechEnd} layout="none">
									<Freeze frame={sourceStart + Math.max(0, Math.floor(plan.line.seconds * fps) - 1)}>
										<Video src={src} muted objectFit="cover" style={videoStyle} />
									</Freeze>
								</Sequence>
							) : null}
						</React.Fragment>
					);
				})}
			</div>
		</AbsoluteFill>
	);
};
