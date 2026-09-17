/**
 * @module
 * Reading `Set-Cookie` off a supertest response. Superagent types the header bag as a flat
 * `Record<string, string>`, but `set-cookie` is the one header Node hands back as an ARRAY — and
 * as a bare string when exactly one was set. Both shapes are normalised here so no test has to
 * cast its way past the difference.
 */

/**
 * One named cookie's full `Set-Cookie` value.
 *
 * @param response - any supertest response
 * @param name - the cookie name, without the `=`
 * @returns the whole directive string, or `undefined` when the response set none by that name
 */
export const setCookie = (
    response: { headers: Record<string, unknown> },
    name: string
): string | undefined => {
    const raw = response.headers['set-cookie'];
    const cookies = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
    return cookies.find((cookie: string) => cookie.startsWith(`${name}=`));
};

/**
 * The named cookies rewritten as one `Cookie` request header, so a follow-up call carries them.
 * Each directive is cut at the first `;` — the flags are the browser's business, not the server's.
 *
 * @param response - the response that set them
 * @param names - which cookies to carry forward; one missing is a caller bug and throws
 * @throws {Error} when the response set no cookie by one of these names
 */
export const cookieHeader = (
    response: { headers: Record<string, unknown> },
    ...names: string[]
): string =>
    names
        .map((name) => {
            const cookie = setCookie(response, name);
            if (!cookie) throw new Error(`Response set no "${name}" cookie`);
            return cookie.split(';')[0];
        })
        .join('; ');
