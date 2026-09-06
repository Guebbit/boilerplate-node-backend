/**
 * @module
 * The no-op human-challenge provider: the one that ships in the box and always passes. Every test
 * and the demo run through it, so a boilerplate checkout never renders a third-party widget or
 * sends a visitor's traffic anywhere.
 */

import type { HumanChallengeProvider } from './index';

/** Passes every caller and publishes no parameters — there is no widget to render. */
export const noneProvider: HumanChallengeProvider = {
    name: 'none',
    publicParameters: () => ({}),
    verify: () => Promise.resolve('ok')
};
