/**
 * @module
 * The `/.well-known/security.txt` body (RFC 9116). A pure function over parsed settings, so the
 * route and the tests share one source.
 *
 * Off by default: a fork must never publish the boilerplate author's contact.
 * Off again once `Expires` passes: RFC 9116 §2.5.5 says an expired file must not be trusted.
 *
 * See: docs/tools/security.md#reporting-a-vulnerability
 */

/** The variables these functions read, already parsed (`app/config.ts#securityTxtSettings`). */
export interface SecurityTxtSettings {
    /** Where a researcher reports to. */
    NODE_SECURITY_CONTACT?: string | undefined;
    /** When the file expires, an ISO date. */
    NODE_SECURITY_EXPIRES?: string | undefined;
    /** A link to the disclosure policy. */
    NODE_SECURITY_POLICY_URL?: string | undefined;
    /** This API's own origin, for the `Canonical` line. */
    NODE_URL?: string | undefined;
}

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
 * when both are usable and `Expires` is still ahead; otherwise the route answers 404 and nothing is
 * published. Judged on every call, not at boot: a server runs for months.
 *
 * @param environment - the parsed settings
 * @param now - the clock, injected so a test does not wait for a date
 * @returns the text, or `undefined` when the deployment has not opted in or the file has expired
 */
export const buildSecurityTxt = (
    environment: SecurityTxtSettings,
    now: Date = new Date()
): string | undefined => {
    const contact = environment.NODE_SECURITY_CONTACT?.trim();
    const expires = parseExpires(environment.NODE_SECURITY_EXPIRES);
    if (!contact || !expires || expires.getTime() <= now.getTime()) return undefined;

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
