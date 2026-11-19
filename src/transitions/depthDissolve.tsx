import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { TransitionPresentation, TransitionPresentationComponentProps } from '@remotion/transitions';
import { EASE } from '../theme/tokens';

type Props = { blur: number; recede: number };

/**
 * The house transition: the outgoing shot recedes (slight scale-down, defocus,
 * fade) while the incoming scene fades up and performs its own entrance. Reads
 * like a rack-focus between two objects rather than a slide or wipe.
 */
const DepthDissolve: React.FC<TransitionPresentationComponentProps<Props>> = ({
	children,
	presentationDirection,
	presentationProgress,
	passedProps,
}) => {
	const p = presentationProgress;
	if (presentationDirection === 'exiting') {
		const e = EASE.soft(p);
		return (
			<AbsoluteFill
				style={{
					opacity: 1 - EASE.exit(Math.min(1, p * 1.1)),
					scale: `${1 - passedProps.recede * e}`,
					filter: `blur(${passedProps.blur * e}px)`,
				}}
			>
				{children}
			</AbsoluteFill>
		);
	}
	return <AbsoluteFill style={{ opacity: EASE.soft(p) }}>{children}</AbsoluteFill>;
};

export const depthDissolve = (props: Partial<Props> = {}): TransitionPresentation<Props> => ({
	component: DepthDissolve,
	props: { blur: props.blur ?? 12, recede: props.recede ?? 0.04 },
});
