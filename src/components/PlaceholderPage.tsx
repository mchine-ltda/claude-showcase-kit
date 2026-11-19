import React from 'react';
import { FONTS } from '../theme/fonts';

/** Neutral skeleton shown when a project has no capture yet, so the template always renders. */
export const PlaceholderPage: React.FC<{ height: number; width?: number }> = ({ height, width = 1440 }) => {
	const bar = (w: number, h: number, o = 0.1): React.CSSProperties => ({ width: w, height: h, borderRadius: h / 2, background: `rgba(20,20,24,${o})` });
	return (
		<div style={{ width, height, background: '#f2f1ed', position: 'relative', overflow: 'hidden', fontFamily: FONTS.sans }}>
			<div style={{ position: 'absolute', left: width * 0.07, top: 40, display: 'flex', gap: 24, alignItems: 'center' }}>
				<div style={bar(120, 22, 0.5)} />
				<div style={bar(70, 14)} />
				<div style={bar(70, 14)} />
				<div style={bar(70, 14)} />
			</div>
			<div style={{ position: 'absolute', left: width * 0.07, top: height * 0.25, display: 'grid', gap: 22 }}>
				<div style={bar(width * 0.5, 64, 0.75)} />
				<div style={bar(width * 0.36, 64, 0.75)} />
				<div style={bar(width * 0.3, 18, 0.18)} />
				<div style={{ fontSize: 22, color: 'rgba(20,20,24,0.45)', marginTop: 20 }}>No capture yet. Run: npm run showcase -- capture &lt;project&gt;</div>
			</div>
		</div>
	);
};
