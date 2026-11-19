import React from 'react';
import { AbsoluteFill } from 'remotion';
import { FORMATS, type Format } from '../layout';

/** Debug overlay: platform UI zones that must stay free of important text. */
export const SafeAreaGuide: React.FC<{ format: Format }> = ({ format }) => {
	const f = FORMATS[format];
	const zone = (style: React.CSSProperties) => (
		<div style={{ position: 'absolute', background: 'rgba(255,40,80,0.18)', ...style }} />
	);
	return (
		<AbsoluteFill style={{ pointerEvents: 'none' }}>
			{zone({ left: 0, right: 0, top: 0, height: f.safe.top })}
			{zone({ left: 0, right: 0, bottom: 0, height: f.safe.bottom })}
			{zone({ left: 0, width: f.safe.left, top: f.safe.top, bottom: f.safe.bottom })}
			{zone({ right: 0, width: f.safe.right, top: f.safe.top, bottom: f.safe.bottom })}
			<div
				style={{
					position: 'absolute',
					left: f.safe.left,
					top: f.safe.top,
					right: f.safe.right,
					bottom: f.safe.bottom,
					border: '2px dashed rgba(255,60,100,0.9)',
				}}
			/>
		</AbsoluteFill>
	);
};
