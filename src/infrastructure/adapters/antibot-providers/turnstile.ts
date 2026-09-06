/**
 * @module
 * The worked example behind the human-challenge port: Cloudflare Turnstile. Shipped as a
 * reference implementation, not a recommendation — a deployment that selects it accepts a
 * third-party script in its pages and the data-protection question that comes with it. See
 * `docs/modules/antibot.md` for the alternatives and what each costs.
 */

import type { HumanChallengeProvider } from './index';
import type { RungVerdict } from '../antibot-verdict';

/** Where a token is exchanged for a verdict. */
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** How long to wait on Cloudflare before treating the answer as a refusal. */
const VERIFY_TIMEOUT_MS = 5000;

/**
 * The secret half of the Turnstile key pair, read fresh so a rotation needs no restart.
 *
 * @throws {Error} when the provider is selected without one — verifying against an absent secret
 *   would pass every caller, which is worse than refusing every caller.
 */
const secretKey = (): string => {
    const secret = process.env.NODE_ANTIBOT_TURNSTILE_SECRET ?? '';
    if (!secret) throw new Error('NODE_ANTIBOT_PROVIDER is turnstile but its secret is unset.');
    return secret;
};

/**
 * Cloudflare Turnstile: exchange the client's token for a pass/fail, server side. `secret` and
 * `response` are the two required fields; `remoteip` is optional and only sharpens their scoring.
 * A non-200, a timeout or a malformed body all read as `refused` — never as a pass.
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
const siteverify = (token: string, remoteAddress?: string): Promise<RungVerdict> =>
    fetch(VERIFY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            secret: secretKey(),
            response: token,
            ...(remoteAddress ? { remoteip: remoteAddress } : {})
        }),
        // Node: abort the request rather than hold a signup open on a slow dependency.
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS)
    })
        .then((response) => (response.ok ? response.json() : undefined))
        .then((body) =>
            (body as { success?: boolean } | undefined)?.success === true ? 'ok' : 'refused'
        );

/** Turnstile behind the port: public site key out, token verified against Cloudflare. */
export const turnstileProvider: HumanChallengeProvider = {
    name: 'turnstile',
    publicParameters: () => ({
        siteKey: process.env.NODE_ANTIBOT_TURNSTILE_SITE_KEY ?? '',
        scriptUrl: 'https://challenges.cloudflare.com/turnstile/v0/api.js'
    }),
    verify: (token, remoteAddress) =>
        siteverify(token, remoteAddress).catch(() => 'refused' as RungVerdict)
};
