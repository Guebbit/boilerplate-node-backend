/**
 * @module
 * Rung 2 of the anti-automation ladder: refusing an email whose domain is a known disposable
 * inbox, or (optionally) unregistered outright. Off by default (`NODE_ANTIBOT_EMAIL_POLICY`) — a
 * blocklist is maintenance, and an aggressive one refuses real people who use legitimate
 * forwarding services. Each caller decides what a `refused` verdict means for its own endpoint;
 * this module only answers the yes/no question.
 */

import { resolveMx } from 'node:dns/promises';
import { isDisposableEmailDomain } from 'disposable-email-domains-js';
import type { RungVerdict } from './antibot-verdict';

/** The three postures a deployment can pick via `NODE_ANTIBOT_EMAIL_POLICY`. */
export type EmailPolicy = 'off' | 'disposable' | 'mx';

/**
 * Narrows a raw env string onto {@link EmailPolicy}, so `resolveEmailPolicy` needs no cast.
 * Exported so `kernel/required-config.ts` can refuse an unrecognized value at boot without
 * needing `resolveEmailPolicy`'s throw.
 */
export const isEmailPolicy = (value: string): value is EmailPolicy =>
    value === 'off' || value === 'disposable' || value === 'mx';

/**
 * The active policy, read fresh per call — same arrangement as `payments/config.ts`'s
 * `defaultCurrency`. Exported so `GET /antibot/config` can publish it alongside rung 3's provider.
 *
 * @throws {Error} when the variable names something outside the closed set; silently falling
 *   back to `off` would turn a deployment's typo into an unnoticed loss of protection.
 */
export const resolveEmailPolicy = (): EmailPolicy => {
    const raw = process.env.NODE_ANTIBOT_EMAIL_POLICY ?? 'off';
    if (!isEmailPolicy(raw)) throw new Error(`Unknown NODE_ANTIBOT_EMAIL_POLICY: "${raw}"`);
    return raw;
};

/**
 * A comma-separated domain list from the environment, lower-cased and trimmed — the same parsing
 * `app/security.ts` uses for `NODE_CORS_ORIGIN`.
 */
const domainSetFrom = (value: string | undefined): Set<string> =>
    new Set(
        (value ?? '')
            .split(',')
            .map((domain) => domain.trim().toLowerCase())
            .filter(Boolean)
    );

/**
 * Domains this deployment exempts even when they would otherwise be refused — a forwarding or
 * aliasing service the upstream list is too broad about, or a customer's own domain flagged by
 * mistake.
 */
const allowlist = (): Set<string> => domainSetFrom(process.env.NODE_ANTIBOT_EMAIL_ALLOWLIST);

/**
 * Domains this deployment refuses in addition to the upstream list — one it is already seeing
 * abuse from that has not been added there yet.
 */
const extraDenylist = (): Set<string> =>
    domainSetFrom(process.env.NODE_ANTIBOT_EMAIL_DENYLIST_EXTRA);

/** The domain half of an address, lower-cased for case-insensitive list membership. */
const domainOf = (email: string): string => email.slice(email.lastIndexOf('@') + 1).toLowerCase();

/**
 * disposable-email-domains-js: wraps the community-maintained `disposable-email-domains` list
 * (~3,500 domains; every addition requires a merged PR proving it generates throwaway inboxes).
 * Freshness is upstream's job, not this deployment's.
 *
 * A commercial verification API (Kickbox, ZeroBounce, ...) catches a brand-new disposable service
 * faster, via a live per-signup lookup against a continuously-crawled database — at the cost of a
 * paid third-party call this rung deliberately does not make.
 * https://github.com/disposable-email-domains/disposable-email-domains
 */
const isKnownDisposable = (domain: string): boolean =>
    extraDenylist().has(domain) || isDisposableEmailDomain(domain);

/**
 * Node: MX lookup, used only by the `mx` policy. Resolves `false` — never rejects — for NXDOMAIN,
 * a timeout, or a domain with no mail exchanger: all three mean "refuse", not "unknown".
 * https://nodejs.org/api/dns.html#dnspromisesresolvemxhostname
 */
const hasMxRecord = (domain: string): Promise<boolean> =>
    resolveMx(domain)
        .then((records) => records.length > 0)
        .catch(() => false);

/**
 * Whether a caller may proceed with `email`, under the active `NODE_ANTIBOT_EMAIL_POLICY`.
 *
 * `resolveEmailPolicy`'s throw runs inside the `.then` below, not before it, so an invalid env
 * value surfaces as a rejected promise — matching the declared return type — rather than escaping
 * as a synchronous exception a `.then`-chained caller like `signup` would not catch.
 *
 * @param email - the submitted address; any shape validation already happened upstream
 * @returns `ok` (always, when the policy is `off`) or `refused`
 */
export const checkEmailPolicy = (email: string): Promise<RungVerdict> =>
    Promise.resolve().then(() => {
        const policy = resolveEmailPolicy();
        if (policy === 'off') return 'ok';

        const domain = domainOf(email);
        if (allowlist().has(domain)) return 'ok';
        if (isKnownDisposable(domain)) return 'refused';
        if (policy === 'disposable') return 'ok';

        return hasMxRecord(domain).then((found) => (found ? 'ok' : 'refused'));
    });
