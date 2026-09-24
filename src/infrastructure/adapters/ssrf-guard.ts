/**
 * @module
 * SSRF guard for an outbound request this server initiates on someone else's behalf: resolve,
 * THEN validate, THEN pin, so a second DNS lookup can never answer differently once a target is
 * decided — the DNS-rebinding TOCTOU. Generic — no caller named; `webhooks` is the only one today.
 *
 * Infrastructure, not `domain/`: this module does DNS I/O.
 *
 * Ranges refused and why, `ipaddr.js`'s role, and what this guard deliberately leaves to its
 * caller (redirects, timeouts) — see docs/theory/defences/ssrf.md.
 */

import { resolve4, resolve6 } from 'node:dns/promises';
import net, { type LookupFunction } from 'node:net';
import ipaddr from 'ipaddr.js';

/** Why {@link resolveSafeOutboundTarget} refused a URL — so a caller and a test can branch on why. */
export type SsrfRefusalReason =
    | 'invalid-url'
    | 'insecure-scheme'
    | 'credentials-in-url'
    | 'dns-resolution-failed'
    | 'unsafe-address';

/** A URL this guard will not open a connection to, and the specific reason it refused. */
export class SsrfRefusedError extends Error {
    readonly reason: SsrfRefusalReason;

    constructor(reason: SsrfRefusalReason, message: string) {
        super(message);
        this.name = 'SsrfRefusedError';
        this.reason = reason;
    }
}

/**
 * A URL that passed every check, with the connection pinned to the address that was
 * actually validated.
 */
export interface SafeOutboundTarget {
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
 * Parse and gate a URL on scheme and embedded credentials — the checks that need no I/O,
 * so they run before any DNS query is spent on a URL that was always going to be refused.
 *
 * `new URL()` itself does useful work here beyond parsing: the WHATWG host-parsing algorithm
 * normalizes an IPv4 literal written as decimal (`2130706433`), octal (`0177.0.0.1`) or hex
 * (`0x7f000001`) to canonical dotted-decimal *before* `.hostname` is read, so those encodings
 * reach {@link isAddressUnsafe} as `127.0.0.1` rather than slipping past it as an opaque hostname.
 * https://url.spec.whatwg.org/#concept-ipv4-parser
 *
 * @param exemptHostname - see {@link resolveSafeOutboundTarget}'s own parameter
 * @throws {SsrfRefusedError} `invalid-url` | `insecure-scheme` | `credentials-in-url`
 */
const parseOutboundUrl = (rawUrl: string, exemptHostname?: string): URL => {
    let parsed: URL;
    // eslint-disable-next-line no-restricted-syntax -- URL's constructor has no non-throwing form; an unparseable URL is a refusal, not a crash
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new SsrfRefusedError('invalid-url', `Not a valid URL: ${rawUrl}`);
    }

    const isExempt =
        exemptHostname !== undefined && stripBrackets(parsed.hostname) === exemptHostname;

    if (parsed.protocol !== 'https:' && !isExempt)
        throw new SsrfRefusedError(
            'insecure-scheme',
            `URL must use https:, got ${parsed.protocol}`
        );

    // Rejected outright rather than stripped: a subscription that embeds credentials is already
    // misconfigured, and silently dropping them would deliver to a URL the owner didn't intend.
    // Never exempted, even for the demo host — a URL with embedded credentials is malformed input,
    // not an insecure-transport choice, and the exemption only ever covers the latter.
    if (parsed.username || parsed.password)
        throw new SsrfRefusedError('credentials-in-url', 'URL must not embed credentials');

    return parsed;
};

/**
 * Whether a single resolved address is anything but a public, globally routable one — an
 * allowlist, not a list of known-bad ranges, so a range nobody thought to list (benchmarking,
 * reserved, NAT64, 6to4, Teredo, the deprecated site-local block) is refused by default.
 *
 * `ipaddr.js`'s `range()` classifies against the IANA special-purpose registries; only `unicast`
 * is ordinary public space. An IPv4-mapped IPv6 literal (`::ffff:127.0.0.1`) is unwrapped first,
 * so it is judged as the IPv4 address it really is.
 * https://github.com/whitequark/ipaddr.js#readme
 *
 * @param address - one resolved (or literal) IPv4 or IPv6 address, dotted/colon form
 */
const isAddressUnsafe = (address: string): boolean => {
    // Neither 4 nor 6: not a real address at all. Refusing rather than ignoring keeps the
    // "fail closed" rule from the module docblock intact even for a malformed DNS answer.
    if (net.isIP(address) === 0) return true;

    const parsed = ipaddr.process(address);
    return parsed.range() !== 'unicast';
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
 * @param signal - aborts the lookup once the caller's total budget runs out; see
 *   {@link resolveSafeOutboundTarget}'s own `signal` parameter
 * @throws {SsrfRefusedError} `dns-resolution-failed` when neither record type resolves
 */
const resolveAllAddresses = (hostname: string, signal?: AbortSignal): Promise<string[]> => {
    const literalFamily = net.isIP(hostname);
    if (literalFamily !== 0) return Promise.resolve([hostname]);

    const lookup = Promise.allSettled([resolve4(hostname), resolve6(hostname)]).then((results) => {
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

    return signal ? Promise.race([lookup, rejectOnAbort<string[]>(signal)]) : lookup;
};

/**
 * `AbortSignal.reason` is typed `any` (the DOM lib's own doing) — in practice always the
 * `DOMException` `AbortSignal.timeout` mints, but never guaranteed for a signal built some other
 * way, so this is what lets {@link rejectOnAbort} reject with a real `Error` either way.
 *
 * Duck-typed on `.name`/`.message` rather than `reason instanceof Error`: under Jest's VM
 * sandboxing, the `DOMException` `AbortSignal.timeout` mints is NOT an instance of the test
 * file's own `Error` (a cross-realm mismatch) despite genuinely being one — `error.name` survives
 * the boundary; `instanceof` does not.
 */
const abortReason = (signal: AbortSignal): Error => {
    const reason: unknown = signal.reason;
    return typeof reason === 'object' &&
        reason !== null &&
        'name' in reason &&
        'message' in reason &&
        typeof reason.name === 'string' &&
        typeof reason.message === 'string'
        ? (reason as Error)
        : new Error(String(reason));
};

/**
 * Races a promise against a signal instead of passing it in directly: `node:dns/promises`'
 * `resolve4`/`resolve6` take no `signal` option, so this is what makes a slow resolver honour the
 * caller's total budget instead of running to its own OS-level DNS timeout regardless.
 *
 * @param signal - rejects with {@link abortReason} once it fires; already-aborted rejects immediately
 */
const rejectOnAbort = <T>(signal: AbortSignal): Promise<T> =>
    new Promise((_resolve, reject) => {
        if (signal.aborted) {
            reject(abortReason(signal));
            return;
        }
        signal.addEventListener('abort', () => reject(abortReason(signal)), { once: true });
    });

/**
 * A `lookup` override that ignores whatever hostname it is called with and always answers with the
 * one address this guard already validated — the pin described on {@link SafeOutboundTarget.lookup}.
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
 * Resolve an outbound target's URL, validate every resolved address, and hand back a target
 * pinned to the one address that was checked.
 *
 * Fails closed: ANY unsafe resolved address refuses the whole hostname, even when other addresses
 * in the same answer are fine — a multi-answer DNS response is exactly the shape an attacker who
 * controls one but not all of the returned addresses would rely on.
 *
 * Rejects rather than throws for EVERY refusal, `parseOutboundUrl`'s included — the whole point of
 * returning a `Promise` is that a caller chains `.catch()` on it once; a synchronous throw from the
 * first line would skip that catch entirely and take the caller down instead. Starting the chain
 * with `Promise.resolve().then(...)` is what turns "throws sometimes, rejects sometimes" into
 * "always rejects".
 *
 * @param exemptHostname - an exact hostname (case-sensitive; callers pass an already-lowercased
 *   host) to exempt from the `https:` and private/unsafe-address checks, and ONLY those two —
 *   parsing, credentials and DNS resolution still run in full. For a caller's own
 *   development/test-only exemption; absent for every other caller and every other call.
 * @param signal - the caller's total-attempt-budget abort, so a slow resolver can't add its own
 *   time on top of whatever the caller times the rest of the attempt at. This module owns no
 *   second timer of its own — one `AbortSignal.timeout` covers the whole outbound attempt.
 * @throws {SsrfRefusedError} see {@link SsrfRefusalReason} for every reason this can refuse
 */
export const resolveSafeOutboundTarget = (
    rawUrl: string,
    exemptHostname?: string,
    signal?: AbortSignal
): Promise<SafeOutboundTarget> =>
    Promise.resolve()
        .then(() => stripBrackets(parseOutboundUrl(rawUrl, exemptHostname).hostname))
        .then((hostname) =>
            resolveAllAddresses(hostname, signal).then((addresses) => {
                const isExempt = hostname === exemptHostname;
                // Wrapped rather than passed by reference: `Array.prototype.find` calls its
                // callback with (element, index, array), and a direct reference would silently
                // feed the index in as a second, unused argument to `isAddressUnsafe`.
                const unsafe = isExempt
                    ? undefined
                    : addresses.find((address) => isAddressUnsafe(address));
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
