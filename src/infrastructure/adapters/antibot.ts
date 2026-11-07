/**
 * @module
 * Rung 2 of the anti-automation ladder: refusing an email whose domain is a known disposable
 * inbox, or (optionally) unregistered outright. Off by default (`NODE_ANTIBOT_EMAIL_POLICY`) — a
 * blocklist is maintenance, and an aggressive one refuses real people who use legitimate
 * forwarding services. Each caller decides what a `refused` verdict means for its own endpoint;
 * this module only answers the yes/no question.
 */

import { Resolver } from 'node:dns/promises';
import { isDisposableEmailDomain } from 'disposable-email-domains-js';
import type { RungVerdict } from './antibot-verdict';
import { antibotConfig } from '@infrastructure/adapters/config';
import { logger } from '@infrastructure/adapters/logger';

/** The three postures a deployment can pick via `NODE_ANTIBOT_EMAIL_POLICY`. */
export type EmailPolicy = 'off' | 'disposable' | 'mx';

/**
 * The active policy, read fresh per call — same arrangement as `orders/config.ts`'s
 * `shopCurrency`. Exported so `antibot` on `GET /config` can publish it alongside rung 3's provider.
 *
 * @throws {Error} when the variable names something outside the closed set; silently falling
 *   back to `off` would turn a deployment's typo into an unnoticed loss of protection.
 */
export const resolveEmailPolicy = (): EmailPolicy => antibotConfig().NODE_ANTIBOT_EMAIL_POLICY;

/**
 * The resolver the MX rung asks: one try, two seconds. The default (`resolveMx` on its own)
 * retries for up to tens of seconds against a slow nameserver, all of it inside a signup request.
 * https://nodejs.org/api/dns.html#class-dnspromisesresolver
 */
const mxResolver = new Resolver({ timeout: 2000, tries: 1 });

/**
 * Whether a DNS error says "this name has no such data" (NXDOMAIN or an empty answer), as opposed
 * to "the lookup itself failed" (timeout, SERVFAIL, refused). Only the first is evidence.
 */
const isNoDataError = (error: unknown): boolean =>
    error instanceof Error &&
    'code' in error &&
    (error.code === 'ENOTFOUND' || error.code === 'ENODATA');

/**
 * An address lookup that settles: the addresses found, `[]` for "no such data", or a rejection
 * only for a failed lookup.
 */
const addressesOf = (lookup: Promise<string[]>): Promise<string[]> =>
    lookup.catch((error: unknown) => {
        if (isNoDataError(error)) return [];
        throw error;
    });

/**
 * RFC 5321 §5.1 fallback: a domain with no MX is still a mail target when it has an A or AAAA.
 * Resolves `false` only when both answer "no data"; a failed lookup with no address found is
 * unknown, so it passes.
 * https://www.rfc-editor.org/rfc/rfc5321#section-5.1
 */
const hasAddressRecord = (domain: string): Promise<boolean> =>
    Promise.all([
        addressesOf(mxResolver.resolve4(domain)).then((found) => found.length > 0),
        addressesOf(mxResolver.resolve6(domain)).then((found) => found.length > 0)
    ]).then(
        ([v4, v6]) => v4 || v6,
        (error: unknown) => {
            logger.warn({ message: 'MX fallback address lookup failed; allowing.', domain, error });
            return true;
        }
    );

/**
 * Node: mail-target check, used only by the `mx` policy. Resolves `false` — never rejects — only
 * on evidence of "no mail": NXDOMAIN, a null MX (RFC 7505, `0 .`), or no MX and no A/AAAA.
 * A timeout, SERVFAIL or any other failed lookup is unknown, not refusal: it resolves `true`
 * and logs a warning.
 * https://nodejs.org/api/dns.html#dnspromisesresolvemxhostname
 * https://www.rfc-editor.org/rfc/rfc7505
 */
const hasMxRecord = (domain: string): Promise<boolean> =>
    mxResolver
        .resolveMx(domain)
        .then((records) => {
            if (records.length === 0) return hasAddressRecord(domain);
            // Null MX: the domain states it accepts no mail. Node reports the root as '' or '.'.
            return records.some(({ exchange }) => exchange !== '' && exchange !== '.');
        })
        .catch((error: unknown) => {
            // NXDOMAIN: the domain does not exist. ENODATA: it exists but has no MX.
            if (error instanceof Error && 'code' in error && error.code === 'ENODATA')
                return hasAddressRecord(domain);
            if (isNoDataError(error)) return false;
            logger.warn({ message: 'MX lookup failed; allowing.', domain, error });
            return true;
        });

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

        // The domain half of the address, lower-cased for case-insensitive list membership.
        const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
        // Domains this deployment exempts even when they would otherwise be refused — a
        // forwarding or aliasing service the upstream list is too broad about, or a customer's
        // own domain flagged by mistake.
        if (antibotConfig().NODE_ANTIBOT_EMAIL_ALLOWLIST.includes(domain)) return 'ok';

        /*
         * disposable-email-domains-js: wraps the community-maintained `disposable-email-domains`
         * list (~3,500 domains; every addition requires a merged PR proving it generates throwaway
         * inboxes). Freshness is upstream's job, not this deployment's. `NODE_..._DENYLIST_EXTRA`
         * is this deployment's own additions — abuse it is already seeing, not yet upstream.
         *
         * A commercial verification API (Kickbox, ZeroBounce, ...) catches a brand-new disposable
         * service faster, via a live per-signup lookup against a continuously-crawled database —
         * at the cost of a paid third-party call this rung deliberately does not make.
         * https://github.com/disposable-email-domains/disposable-email-domains
         */
        if (
            antibotConfig().NODE_ANTIBOT_EMAIL_DENYLIST_EXTRA.includes(domain) ||
            isDisposableEmailDomain(domain)
        )
            return 'refused';
        if (policy === 'disposable') return 'ok';

        return hasMxRecord(domain).then((found) => (found ? 'ok' : 'refused'));
    });
