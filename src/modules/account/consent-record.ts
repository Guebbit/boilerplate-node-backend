/**
 * @module
 * What an account's own record says about the terms and the analytics choice: the fields a
 * signup stamps so the controller can later show who agreed to what, and when.
 *
 * See: docs/theory/data-protection.md
 */

import { accountConfig } from './config';

/**
 * Which text of the Terms is in force (`NODE_TERMS_VERSION`, `1` by default). Published so `GET
 * /shop` can print it: the shop group reaches the foundation, never the other way round.
 *
 * @returns the configured label
 */
export const termsVersion = (): string => accountConfig().NODE_TERMS_VERSION;

/**
 * The record of accepting the terms now: the moment and the text in force (`NODE_TERMS_VERSION`).
 * Every path that shows the terms before it creates the account stamps this.
 */
export const termsAcceptance = (): { termsAcceptedAt: Date; termsVersion: string } => ({
    termsAcceptedAt: new Date(),
    termsVersion: termsVersion()
});

/**
 * The analytics choice a signup carried, with the moment it was made. Absent means nobody was
 * asked, so nothing is recorded and a banner choice may still apply.
 *
 * @param analyticsConsent - the signup's optional checkbox
 */
export const analyticsAnswer = (
    analyticsConsent: boolean | undefined
): { analyticsConsent?: boolean; analyticsConsentAt?: Date } =>
    analyticsConsent === undefined ? {} : { analyticsConsent, analyticsConsentAt: new Date() };
