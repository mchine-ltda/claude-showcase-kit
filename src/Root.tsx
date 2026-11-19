import { Composition, Folder } from 'remotion';
import { calculateShowcaseMetadata } from './calculate-metadata';
import { showcaseSchema } from './schema';
import { Showcase } from './Showcase';

// The template is never edited per project. The CLI passes each project's
// resolved props with --props and serves its captures with --public-dir.
// These defaults only render the template's skeleton when no project is loaded.
export const RemotionRoot: React.FC = () => {
	return (
		<Folder name="Website-Showcase">
			<Composition
				id="Showcase"
				component={Showcase}
				schema={showcaseSchema}
				calculateMetadata={calculateShowcaseMetadata}
				durationInFrames={840}
				fps={30}
				width={1080}
				height={1920}
				defaultProps={{
					template: 'v2-stable' as const,
					format: 'reel' as const,
					project: { name: 'Untitled project', category: 'Web design', displayUrl: 'example.ie', accent: '#c2603a' },
					agency: {
						name: 'Your Studio',
						logo: null,
						logoHeight: 72,
						subtitle: 'Web Design for Irish Businesses',
						cta: "Let's build *yours.*",
						contact: 'yourstudio.ie',
						accent: '#d9a273',
					},
					intro: { eyebrow: 'Website · Web design', title: 'Untitled project' },
					timing: { intro: 1.5, desktop: 12.5, mobile: 12.5, outro: 1.5 },
					balance: true,
					narration: { lines: [], gapSeconds: 0.35, volume: 1 },
					subtitles: { enabled: true },
					cover: { enabled: false, frame: null, showAgency: true },
					identity: null,
					presenter: null,
					audio: {
						music: null,
						sfx: { enabled: true, volume: 0.7 },
						syncOffsetFrames: 1,
					},
					capture: null,
					debug: { safeArea: false },
				}}
			/>
		</Folder>
	);
};
