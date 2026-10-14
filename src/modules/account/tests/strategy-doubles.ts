/**
 * @module
 * Request and response doubles shared by the two session-strategy unit suites.
 */

import type { Request, Response } from 'express';
import { asStub } from '@tests/stub';
import type { SessionRequest } from '@modules/account/session/strategy';

/** The arguments of one `response.cookie(name, value, options)` call. */
export type SetCookieCall = [name: string, value: string, options: { maxAge?: number }];

/**
 * A request carrying some of: a session cookie, an `Authorization` header, a User-Agent.
 * @param parts - what the request carries; `via` is the transport the guard resolved
 * @returns a request double shaped as the strategies read it
 */
export const requestWith = ({
    cookie,
    authorization,
    via,
    userAgent
}: {
    cookie?: string;
    authorization?: string;
    via?: 'cookie' | 'bearer';
    userAgent?: string;
} = {}) =>
    asStub<SessionRequest & Pick<Request, 'get'>>({
        cookies: cookie === undefined ? {} : { '__Host-session': cookie },
        headers: authorization === undefined ? {} : { authorization },
        sessionVia: via,
        get: (name: string) => (name.toLowerCase() === 'user-agent' ? userAgent : undefined)
    });

/**
 * A response whose `cookie` calls are recorded.
 * @returns the recording mock and the response double that owns it
 */
export const recordingResponse = () => {
    const cookie = jest.fn<unknown, SetCookieCall>();
    return { cookie, response: asStub<Response>({ cookie, clearCookie: jest.fn() }) };
};

/**
 * The call a named cookie was set with.
 * @param cookie - the recording mock from `recordingResponse`
 * @param name - the cookie name
 * @returns the call, or `undefined` when the cookie was not set
 */
export const cookieSet = (cookie: jest.Mock<unknown, SetCookieCall>, name: string) =>
    cookie.mock.calls.find((call) => call[0] === name);
