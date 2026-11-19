import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { TransitionPresentation, TransitionPresentationComponentProps } from '@remotion/transitions';
import { EASE } from '../theme/tokens';

type Props = { distance: number };

/**
 * Subtle directional hand-over: the outgoing device drifts left and fades while
 * the incoming one drifts in from the right. Short travel, no wipe edges.
 */
const PushSlide: React.FC<TransitionPresentationComponentProps<Props>> = ({ children, presentationDirection, presentationProgress, passedProps }) => {
	const p = EASE.camera(presentationProgress);
	if (presentationDirection === 'exiting') {
		return (
			<AbsoluteFill style={{ opacity: 1 - EASE.exit(Math.min(1, presentationProgress * 1.15)), translate: `${-passedProps.distance * p}px 0`, filter: `blur(${p * 6}px)` }}>
				{children}
			</AbsoluteFill>
		);
	}
	return <AbsoluteFill style={{ opacity: EASE.soft(presentationProgress), translate: `${passedProps.distance * (1 - p)}px 0` }}>{children}</AbsoluteFill>;
};

export const pushSlide = (props: Partial<Props> = {}): TransitionPresentation<Props> => ({
	component: PushSlide,
	props: { distance: props.distance ?? 160 },
});
