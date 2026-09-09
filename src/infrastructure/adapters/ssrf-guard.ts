/**
 * @module
 * SSRF guard for outbound webhook delivery: resolve, THEN validate, THEN pin — never validate a
 * hostname and let the HTTP client resolve it a second time, because the second lookup is free to
 * answer differently (DNS rebinding, the classic SSRF TOCTOU).
 *
 * Infrastructure, not `domain/`, on purpose: this module does DNS I/O, and `domain/` is
 * lint-guaranteed free of it.
 *
 * IP-range checks use `ip-address` (already a repo dependency, MIT, typed) rather than hand-rolled
 * CIDR math — its `Address4`/`Address6` classes cover every range this guard cares about,
 * including the one a naive check misses: an IPv4-mapped IPv6 literal (`::ffff:127.0.0.1`).
 * `Address6`'s `isPrivate`/`isLoopback`/`isLinkLocal`/`isCGNAT`/`isBroadcast`/`isUnspecified` all
 * unwrap the embedded IPv4 before classifying (`ip-address`'s own `embeddedIPv4()` doc), so the
 * mapped form is judged by what it actually reaches, not by its IPv6 wrapper.
 *
 * Ranges refused, and why: RFC 1918 private space, RFC 1122 loopback, RFC 3927 / RFC 4291
 * link-local (this is what blocks the cloud metadata endpoint `169.254.169.254`), RFC 4193 IPv6
 * unique-local, RFC 6598 carrier-grade NAT, RFC 919 broadcast, and both families' unspecified
 * (`0.0.0.0`, `::`) and multicast ranges.
 *
 * What this module does NOT do:
 *  - No redirect handling. A 3xx must not be followed without re-running this same check on the
 *    `Location` header, and the simplest correct answer — refuse every redirect outright — is
 *    `./webhook-delivery.ts`'s job, not this file's.
 *  - No timeout math. `./webhook-delivery.ts` wraps the *whole* delivery attempt — this resolution
 *    included — in one `AbortSignal.timeout`, rather than this module owning a second timer that
 *    would need to stay in sync with the first.
 */

import { resolve4, resolve6 } from 'node:dns/promises';
import net, { type LookupFunction } from 'node:net';
import { Address4, Address6 } from 'ip-address';

/** Why {@link resolveSafeWebhookTarget} refused a URL — so a caller and a test can branch on why. */
export type SsrfRefusalReason =
    | 'invalid-url'
    | 'insecure-scheme'
    | 'credentials-in-url'
    | 'dns-resolution-failed'
    | 'unsafe-address';

/** A webhook URL this guard will not open a connection to, and the specific reason it refused. */
export class SsrfRefusedError extends Error {
    readonly reason: SsrfRefusalReason;

    constructor(reason: SsrfRefusalReason, message: string) {
        super(message);
        this.name = 'SsrfRefusedError';
        this.reason = reason;
    }
}

/**
 * A webhook URL that passed every check, with the connection pinned to the address that was
 * actually validated.
 */
export interface SafeWebhookTarget {
    /** The URL's hostname (brackets stripped for a literal IPv6 host), for logging. */
    hostname: string;
    /** The single resolved address every check ran against, and the one the connection must use. */
    resolvedAddress: string;
    /**
     * Pass as `https.request`'s `lookup` option to pin the TCP connection to
     * {@link resolvedAddress} instead of letting Node re-resolve the hostname at connect time —
     * that second resolution is exactly the TOCTOU window this module exists to close.
     * https://nodejs.org/api/http.html#httprequestoptions-callback (`lookup` option, same shape
     * as `dns.lookup`) — https://nodejs.org/api/net.html#socketconnectoptions-connectlistener
     */
    lookup: LookupFunction;
}

/** An IPv6 hostname from `URL.hostname` is bracketed (`[::1]`); every other check needs it bare. */
const stripBrackets = (hostname: string): string =>
    hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;

/**
 * Parse and gate a webhook URL on scheme and embedded credentials — the checks that need no I/O,
 * so they run before any DNS query is spent on a URL that was always going to be refused.
 *
 * `new URL()` itself does useful work here beyond parsing: the WHATWG host-parsing algorithm
 * normalizes an IPv4 literal written as decimal (`2130706433`), octal (`0177.0.0.1`) or hex
 * (`0x7f000001`) to canonical dotted-decimal *before* `.hostname` is read, so those encodings
 * reach {@link isAddressUnsafe} as `127.0.0.1` rather than slipping past it as an opaque hostname.
 * https://url.spec.whatwg.org/#concept-ipv4-parser
 *
 * @throws {SsrfRefusedError} `invalid-url` | `insecure-scheme` | `credentials-in-url`
 */
const parseWebhookUrl = (rawUrl: string): URL => {
    let parsed: URL;
    // eslint-disable-next-line no-restricted-syntax -- URL's constructor has no non-throwing form; an unparseable webhook URL is a refusal, not a crash
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new SsrfRefusedError('invalid-url', `Not a valid URL: ${rawUrl}`);
    }

    if (parsed.protocol !== 'https:')
        throw new SsrfRefusedError(
            'insecure-scheme',
            `Webhook URL must use https:, got ${parsed.protocol}`
        );

    // Rejected outright rather than stripped: a subscription that embeds credentials is already
    // misconfigured, and silently dropping them would deliver to a URL the owner didn't intend.
    if (parsed.username || parsed.password)
        throw new SsrfRefusedError('credentials-in-url', 'Webhook URL must not embed credentials');

    return parsed;
};

/**
 * Whether a single resolved address falls in any range this guard refuses. See the module
 * docblock for the exact range list and the RFCs behind it.
 *
 * @param address - one resolved (or literal) IPv4 or IPv6 address, dotted/colon form
 */
const isAddressUnsafe = (address: string): boolean => {
    const family = net.isIP(address);
    // Neither 4 nor 6: not a real address at all. Refusing rather than ignoring keeps the
    // "fail closed" rule from the module docblock intact even for a malformed DNS answer.
    if (family === 0) return true;

    const ip = family === 4 ? new Address4(address) : new Address6(address);
    return (
        ip.isPrivate() ||
        ip.isLoopback() ||
        ip.isLinkLocal() ||
        ip.isUnspecified() ||
        ip.isMulticast() ||
        ip.isCGNAT() ||
        ip.isBroadcast()
    );
};

/**
 * Every address a hostname resolves to — a literal IP resolves to itself, a name is looked up on
 * both record types.
 *
 * `resolve4`/`resolve6` are queried separately and settled independently: a v4-only host rejects
 * `resolve6` with `ENODATA`, which is ordinary and must not hide the v4 answer (and vice versa).
 * Every fulfilled address is validated later — an attacker only needs ONE of several answers to be
 * private, so returning "the first address" here would be the naive check this module exists to
 * avoid.
 * https://nodejs.org/api/dns.html#dnspromisesresolve4hostname-options
 *
 * @throws {SsrfRefusedError} `dns-resolution-failed` when neither record type resolves
 */
const resolveAllAddresses = (hostname: string): Promise<string[]> => {
    const literalFamily = net.isIP(hostname);
    if (literalFamily !== 0) return Promise.resolve([hostname]);

    return Promise.allSettled([resolve4(hostname), resolve6(hostname)]).then((results) => {
        const addresses = results.flatMap((result) =>
            result.status === 'fulfilled' ? result.value : []
        );
        if (addresses.length === 0)
            throw new SsrfRefusedError(
                'dns-resolution-failed',
                `Could not resolve any address for ${hostname}`
            );
        return addresses;
    });
};

/**
 * A `lookup` override that ignores whatever hostname it is called with and always answers with the
 * one address this guard already validated — the pin described on {@link SafeWebhookTarget.lookup}.
 *
 * Node calls a custom `lookup` with `{ all: true }` when the caller asked for every address and
 * omits it (or sets it false) for the single-address form; both are handled since `https.request`
 * itself decides which it wants, not this function.
 * https://nodejs.org/api/dns.html#dnslookuphostname-options-callback (the callback shapes this mirrors)
 *
 * @param address - the pre-validated address to pin to
 */
const buildPinnedLookup = (address: string): LookupFunction => {
    const family = net.isIP(address);
    return (_hostname, options, callback) => {
        // `options` is always an object here (the `net.LookupFunction` contract, not the plain
        // `dns.lookup` one) — only its `all` flag decides the callback shape.
        if (options.all) {
            callback(null, [{ address, family }]);
            return;
        }
        callback(null, address, family);
    };
};

/**
 * Resolve a webhook subscription's URL, validate every resolved address, and hand back a target
 * pinned to the one address that was checked.
 *
 * Fails closed: ANY unsafe resolved address refuses the whole hostname, even when other addresses
 * in the same answer are fine — a multi-answer DNS response is exactly the shape an attacker who
 * controls one but not all of the returned addresses would rely on.
 *
 * Rejects rather than throws for EVERY refusal, `parseWebhookUrl`'s included — the whole point of
 * returning a `Promise` is that a caller chains `.catch()` on it once; a synchronous throw from the
 * first line would skip that catch entirely and take the caller down instead. Starting the chain
 * with `Promise.resolve().then(...)` is what turns "throws sometimes, rejects sometimes" into
 * "always rejects".
 *
 * @throws {SsrfRefusedError} see {@link SsrfRefusalReason} for every reason this can refuse
 */
export const resolveSafeWebhookTarget = (rawUrl: string): Promise<SafeWebhookTarget> =>
    Promise.resolve()
        .then(() => stripBrackets(parseWebhookUrl(rawUrl).hostname))
        .then((hostname) =>
            resolveAllAddresses(hostname).then((addresses) => {
                // Wrapped rather than passed by reference: `Array.prototype.find` calls its
                // callback with (element, index, array), and a direct reference would silently
                // feed the index in as a second, unused argument to `isAddressUnsafe`.
                const unsafe = addresses.find((address) => isAddressUnsafe(address));
                if (unsafe)
                    throw new SsrfRefusedError(
                        'unsafe-address',
                        `Resolved address ${unsafe} for ${hostname} is not a publicly routable address`
                    );

                // `addresses` is non-empty here — `resolveAllAddresses` already refused the empty
                // case — so pinning to the first is picking an already-validated answer, not guessing.
                const [resolvedAddress] = addresses as [string, ...string[]];

                return { hostname, resolvedAddress, lookup: buildPinnedLookup(resolvedAddress) };
            })
        );
