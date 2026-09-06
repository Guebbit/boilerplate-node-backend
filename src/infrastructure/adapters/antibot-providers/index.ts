/**
 * @module
 * Rung 4 of the anti-automation ladder: the human-challenge port. Which implementation answers is
 * a deployment decision (`NODE_ANTIBOT_PROVIDER`), not a code path — the boilerplate ships `none`
 * and a live project adds one file plus one line to the registry below. The vendor shortlist and
 * what each costs a deployment live in `docs/modules/antibot.md`.
 */

import { noneProvider } from './none';
import { turnstileProvider } from './turnstile';
import { altchaProvider } from './altcha';
import type { AntibotChallenge } from '@types';

/** What a verification can come back as. Everything else an implementation can say is a throw. */
export type HumanVerdict = 'human' | 'refused';

/**
 * What an implementation must provide — and, for a REAL one, what it must additionally defend.
 *
 * `none` never leaves the process, which is the only reason token forgery and token replay read
 * as "no surface" here. A live vendor answers over the network: an implementation must verify the
 * token against the vendor's own endpoint (never by decoding it locally), send the secret from
 * the environment rather than from the request, and treat a network failure as `refused` rather
 * than as a pass.
 *
 * See: docs/modules/antibot.md
 */
export interface HumanChallengeProvider {
    /** The name `NODE_ANTIBOT_PROVIDER` selects, and the one `GET /antibot/config` publishes. */
    name: string;

    /**
     * What the frontend needs to render this provider's widget — a site key, a script URL. Public
     * by definition: everything here reaches the browser.
     *
     * @returns a flat string map, empty when there is nothing to render
     */
    publicParameters(): Record<string, string>;

    /**
     * Hand the client something to work on, for a provider this deployment hosts itself. A
     * vendor-hosted provider omits this: its widget fetches a challenge from the vendor, so there
     * is nothing for this server to issue.
     *
     * @returns the provider's own challenge, sent to the client verbatim
     */
    issueChallenge?(): Promise<AntibotChallenge>;

    /**
     * Decide whether the token a client returned proves a person solved the challenge.
     *
     * @param token - the vendor token, taken verbatim from the request header
     * @param remoteAddress - the caller's address, which some vendors score against
     * @returns the verdict; a refusal is an answer, not an error — only transport failures throw
     */
    verify(token: string, remoteAddress?: string): Promise<HumanVerdict>;
}

/**
 * Every implementation this build knows. A real deployment adds one file and one line here.
 * Values are optional because most keys are absent — that is what makes the miss below a real
 * check rather than dead code.
 */
const PROVIDERS: Record<string, HumanChallengeProvider | undefined> = {
    none: noneProvider,
    turnstile: turnstileProvider,
    altcha: altchaProvider
};

/**
 * The configured provider, read fresh per call rather than memoised like `PaymentProvider`'s —
 * the ladder's other two rungs read their own env fresh too, and a registry lookup costs less
 * than the branch that would cache it.
 *
 * @returns the implementation `NODE_ANTIBOT_PROVIDER` names (default `none`)
 * @throws {Error} when the variable names an implementation this build does not have; falling
 *   back to `none` would turn a deployment's typo into an unnoticed loss of protection, exactly
 *   as it would for `NODE_ANTIBOT_EMAIL_POLICY`
 */
export const resolveHumanChallengeProvider = (): HumanChallengeProvider => {
    const name = process.env.NODE_ANTIBOT_PROVIDER ?? 'none';
    const provider = PROVIDERS[name];
    if (!provider) throw new Error(`Unknown NODE_ANTIBOT_PROVIDER: "${name}"`);
    return provider;
};

/** Whether this deployment has switched rung 4 on — i.e. picked anything but the no-op. */
export const isHumanChallengeEnabled = (): boolean =>
    resolveHumanChallengeProvider().name !== 'none';
