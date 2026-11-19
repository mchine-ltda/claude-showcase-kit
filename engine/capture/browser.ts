import { chromium, type Browser } from 'playwright';
import { log } from '../lib/util';

/**
 * Launch Chromium for capture. Prefers Playwright's own build, then falls back
 * to an installed Chrome or Edge so a fresh machine can capture without an
 * extra browser download.
 */
export const launchBrowser = async (opts: { headless?: boolean } = {}): Promise<Browser> => {
	const headless = opts.headless ?? true;
	const attempts: { label: string; launch: () => Promise<Browser> }[] = [
		{ label: 'Playwright Chromium', launch: () => chromium.launch({ headless }) },
		{ label: 'Google Chrome', launch: () => chromium.launch({ headless, channel: 'chrome' }) },
		{ label: 'Microsoft Edge', launch: () => chromium.launch({ headless, channel: 'msedge' }) },
	];
	const errors: string[] = [];
	for (const a of attempts) {
		try {
			const browser = await a.launch();
			log.info(`browser: ${a.label} ${browser.version()}`);
			return browser;
		} catch (e) {
			errors.push(`${a.label}: ${(e as Error).message.split('\n')[0]}`);
		}
	}
	throw new Error(`No Chromium browser available.\n${errors.join('\n')}\nRun: npx playwright install chromium`);
};

export const MOBILE_UA =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
