/**
 * @module
 * The `/.well-known/security.txt` body (RFC 9116) and the boot warning that guards its `Expires`
 * field. Pure functions over an environment record, so the route and the tests share one source.
 *
 * Off by default: a fork must never publish the boilerplate author's contact.
 *
 * See: docs/tools/security.md#reporting-a-vulnerability
 */

/** The subset of `process.env` these functions read. */
export type SecurityTxtEnvironment = Readonly<Record<string, string | undefined>>;

/** How close to `Expires` the boot warning starts, in milliseconds (30 days). */
const RENEWAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Parses `NODE_SECURITY_EXPIRES`.
 *
 * @param raw - the raw variable
 * @returns the date, or `undefined` when unset or not a parseable date
 */
const parseExpires = (raw: string | undefined): Date | undefined => {
    if (!raw?.trim()) return undefined;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

/**
 * Builds the file body.
 *
 * `Contact` and `Expires` are the only fields RFC 9116 requires, so the file is published only
 * when both are usable; otherwise the route answers 404 and nothing is published.
 *
 * @param environment - the variables to read, normally `process.env`
 * @returns the text, or `undefined` when the deployment has not opted in
 */
export const buildSecurityTxt = (environment: SecurityTxtEnvironment): string | undefined => {
    const contact = environment.NODE_SECURITY_CONTACT?.trim();
    const expires = parseExpires(environment.NODE_SECURITY_EXPIRES);
    if (!contact || !expires) return undefined;

    const policy = environment.NODE_SECURITY_POLICY_URL?.trim();
    // `new URL` tolerates a `NODE_URL` with or without a trailing slash.
    const canonical = environment.NODE_URL
        ? new URL('/.well-known/security.txt', environment.NODE_URL).href
        : undefined;

    return (
        [
            `Contact: ${contact}`,
            // RFC 9116 wants an ISO 8601 date-time; re-serialising accepts a bare date too.
            `Expires: ${expires.toISOString()}`,
            policy ? `Policy: ${policy}` : undefined,
            'Preferred-Languages: en',
            canonical ? `Canonical: ${canonical}` : undefined
        ]
            .filter((line): line is string => line !== undefined)
            .join('\n') + '\n'
    );
};

/**
 * What is wrong with an opted-in deployment's `Expires`, if anything.
 *
 * @param environment - the variables to read, normally `process.env`
 * @param now - the clock, injected so a test does not wait for a date
 * @returns a warning sentence, or `undefined` when unconfigured or healthy
 */
export const securityTxtWarning = (
    environment: SecurityTxtEnvironment,
    now: Date = new Date()
): string | undefined => {
    if (!environment.NODE_SECURITY_CONTACT?.trim()) return undefined;

    const expires = parseExpires(environment.NODE_SECURITY_EXPIRES);
    if (!expires)
        return 'NODE_SECURITY_CONTACT is set but NODE_SECURITY_EXPIRES is missing or not a date: /.well-known/security.txt is NOT published.';
    if (expires.getTime() <= now.getTime())
        return 'NODE_SECURITY_EXPIRES is in the past: /.well-known/security.txt is stale. Renew it.';
    if (expires.getTime() - now.getTime() < RENEWAL_WINDOW_MS)
        return 'NODE_SECURITY_EXPIRES is within 30 days: renew /.well-known/security.txt soon.';
    return undefined;
};
