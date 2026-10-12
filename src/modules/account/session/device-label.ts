/**
 * @module
 * A coarse, human label for where a sign-in came from — "Firefox on Linux" — parsed once at login
 * from the User-Agent and stored on the session, so the owner can tell their own devices apart in
 * the list. Browser and system only: no version, no model, no IP, so it names a kind of device and
 * nothing that could single one out beyond what the owner already knows.
 *
 * The audit log already keeps the raw User-Agent for 90 days; this is one shorter, friendlier copy,
 * shown back to the person it describes. See docs/theory/data-protection.md.
 */

import Bowser from 'bowser';

/**
 * The longest User-Agent read. Real ones are a few hundred bytes; the cap bounds the parser's work
 * on a header an attacker controls entirely.
 */
const MAX_USER_AGENT_LENGTH = 512;

/**
 * Name the browser and system a User-Agent describes.
 *
 * @param userAgent - the request's `User-Agent` header, if it carried one
 * @returns `"<browser> on <system>"`, just one of the two when only one is known, or `undefined`
 *   for a client that names neither (a script, `curl`, an API tester) — no label beats a wrong one
 */
export const describeDevice = (userAgent: string | undefined): string | undefined => {
    const text = userAgent?.slice(0, MAX_USER_AGENT_LENGTH).trim();
    if (!text) return undefined;

    // Bowser: a regex-table parser for the two names. `getParser` is lazy and throws on an empty
    // string, hence the guard above; an agent it cannot place answers `''` for each name.
    // https://github.com/bowser-js/bowser#readme
    const parser = Bowser.getParser(text);
    const browser = parser.getBrowserName();
    const system = parser.getOSName();

    if (browser && system) return `${browser} on ${system}`;
    return browser || system || undefined;
};
