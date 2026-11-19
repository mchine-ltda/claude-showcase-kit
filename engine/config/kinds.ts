// Project kinds. Every kind is the same idea, a real recorded session of real work in the
// same cinematic frame. The kind only picks the devices shown, the default part lengths,
// the label on the cover and the wording of the automatic script.

export const KIND_IDS = ['website', 'web-app', 'app', 'automation', 'branding'] as const;
export type KindId = (typeof KIND_IDS)[number];

export type KindSpec = {
	/** Cover eyebrow: "<label> · <category>". */
	label: string;
	/** What the narration calls it: "a modern website", "this automation". */
	noun: string;
	devices: ('desktop' | 'mobile')[];
	/** Minimum seconds per part on top of the template's defaults (single-device kinds get one longer part). */
	timing: Partial<Record<'intro' | 'desktop' | 'mobile' | 'outro', number>>;
	/** What a typical walkthrough shows, for the skill's interview and the docs. */
	shows: string;
};

export const KINDS: Record<KindId, KindSpec> = {
	website: {
		label: 'Website',
		noun: 'website',
		devices: ['desktop', 'mobile'],
		timing: {},
		shows: 'Home page, a strong section, the menu, a service or product page, projects, the mobile menu and the contact form',
	},
	'web-app': {
		label: 'Web app',
		noun: 'web app',
		devices: ['desktop', 'mobile'],
		timing: {},
		shows: 'The dashboard, opening a record, a real action (create, filter, update) and its result, and the responsive view',
	},
	app: {
		label: 'App',
		noun: 'app',
		devices: ['mobile'],
		timing: { mobile: 20 },
		shows: 'The app on a phone: onboarding or home, the main flow, a real action and its result',
	},
	automation: {
		label: 'Automation',
		noun: 'automation',
		devices: ['desktop'],
		timing: { desktop: 20 },
		shows: 'The trigger (a form, an email, a new row), the workflow running, and the result in each app it touches, joined by cuts',
	},
	branding: {
		label: 'Branding',
		noun: 'brand identity',
		devices: ['desktop'],
		timing: { desktop: 20 },
		shows: 'The brand guidelines or brand site: logo, palette, typography and applications, with cuts between sections',
	},
};

export const kindOf = (id: string | undefined | null): KindSpec => KINDS[(id as KindId) ?? 'website'] ?? KINDS.website;
