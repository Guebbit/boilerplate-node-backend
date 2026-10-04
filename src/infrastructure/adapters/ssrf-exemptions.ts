/**
 * @module
 * The origins the SSRF guard (`./ssrf-guard`) lets resolve to a private address. EMPTY in
 * production: nothing in `src/` registers one. A development or demo process registers its own
 * sink before the application loads (`scenarios/support/doubles/webhook-sink.ts`).
 *
 * Its own file, with no imports, so the dev preload and the jest setup can register one without
 * loading the guard (and its DNS imports) before a test's own DNS mock is in place.
 */

/**
 * Origins (`https://host:port`) exempt from the address check. The origin, not the host: the
 * exemption covers one host AND one port, so a sink on `:3070` does not open every port of the
 * machine it runs on.
 */
const exemptOrigins = new Set<string>();

/**
 * Let one origin resolve to a private address. Only the address check is relaxed for it — the
 * `https:` rule, credentials, parsing and DNS resolution still run in full.
 *
 * @param origin - an origin as `URL.origin` writes it (`https://127.0.0.1:3070`)
 */
export const registerSsrfExemptOrigin = (origin: string): void => {
    exemptOrigins.add(origin);
};

/** Forget every registered exemption. Test seam: a suite that registers one puts it back. */
export const clearSsrfExemptOrigins = (): void => {
    exemptOrigins.clear();
};

/**
 * Whether an origin was registered as exempt.
 *
 * @param origin - an origin as `URL.origin` writes it
 */
export const isSsrfExemptOrigin = (origin: string): boolean => exemptOrigins.has(origin);
