/**
 * @module
 * The familiar-device cookie's own rules: what a token vouches for, how several accounts share one
 * cookie, and that nothing verifies without the secret.
 */

import type { Request, Response } from 'express';
import { asStub } from '@tests/stub';
import { setEnvironment } from '@tests/environment';
import {
    DEVICE_COOKIE,
    holdsDeviceCookie,
    presentsFailingDeviceCookie,
    rememberDevice
} from '../../session/device-cookie';

beforeEach(() => {
    setEnvironment({ NODE_DEVICE_COOKIE_SECRET: 'a-device-cookie-secret-for-tests' });
});

/** A request carrying `cookie` (or none) and naming `email` in its body. */
const requestFor = (email: string | undefined, cookie?: string): Request =>
    asStub<Request>({
        cookies: cookie === undefined ? {} : { [DEVICE_COOKIE]: cookie },
        body: email === undefined ? {} : { email }
    });

/** Marks a browser familiar and returns the cookie value the response set. */
const remembered = (email: string, held?: string): string => {
    const cookie = jest.fn();
    rememberDevice(requestFor(undefined, held), asStub<Response>({ cookie }), email);
    return (cookie.mock.calls[0] as [string, string])[1];
};

describe('a device cookie', () => {
    it('vouches for the account it was set for, whatever the case of the address', () => {
        const value = remembered('Ada@Example.com');

        expect(holdsDeviceCookie(requestFor('ada@example.com', value))).toBe(true);
    });

    it('vouches for nobody else', () => {
        const value = remembered('ada@example.com');

        expect(holdsDeviceCookie(requestFor('grace@example.com', value))).toBe(false);
    });

    it('is httpOnly and persistent, and names no account in the clear', () => {
        const cookie = jest.fn();
        rememberDevice(requestFor(undefined), asStub<Response>({ cookie }), 'ada@example.com');

        const [name, value, options] = cookie.mock.calls[0] as [
            string,
            string,
            { httpOnly: boolean; maxAge: number }
        ];
        expect(name).toBe(DEVICE_COOKIE);
        expect(value).not.toContain('ada');
        expect(options.httpOnly).toBe(true);
        expect(options.maxAge).toBeGreaterThan(0);
    });

    it('keeps the accounts a browser already knew, newest first, and no more than five', () => {
        let value = remembered('one@example.com');
        for (const name of ['two', 'three', 'four', 'five', 'six'])
            value = remembered(`${name}@example.com`, value);

        expect(holdsDeviceCookie(requestFor('six@example.com', value))).toBe(true);
        expect(holdsDeviceCookie(requestFor('two@example.com', value))).toBe(true);
        // The sixth account pushed the first one out.
        expect(holdsDeviceCookie(requestFor('one@example.com', value))).toBe(false);
    });

    it('does not duplicate an account on a repeat login', () => {
        const once = remembered('ada@example.com');
        const twice = remembered('ada@example.com', once);

        expect(twice).toBe(once);
    });

    it('is refused when forged, and counted as a failing cookie', () => {
        const forged = requestFor('ada@example.com', 'not-a-token');

        expect(holdsDeviceCookie(forged)).toBe(false);
        expect(presentsFailingDeviceCookie(forged)).toBe(true);
    });

    it('is not a failing cookie when there is none at all', () => {
        expect(presentsFailingDeviceCookie(requestFor('ada@example.com'))).toBe(false);
    });

    it('verifies nothing, and sets nothing, without the secret', () => {
        const value = remembered('ada@example.com');
        setEnvironment({ NODE_DEVICE_COOKIE_SECRET: undefined });

        expect(holdsDeviceCookie(requestFor('ada@example.com', value))).toBe(false);
        const cookie = jest.fn();
        rememberDevice(requestFor(undefined), asStub<Response>({ cookie }), 'ada@example.com');
        expect(cookie).not.toHaveBeenCalled();
    });

    it('reads a request whose cookies were never parsed as carrying none, without throwing', () => {
        const unparsed = asStub<Request>({ body: { email: 'ada@example.com' } });

        expect(holdsDeviceCookie(unparsed)).toBe(false);
        expect(presentsFailingDeviceCookie(unparsed)).toBe(false);
    });

    it('does not vouch for a request that names no account', () => {
        const value = remembered('ada@example.com');

        expect(holdsDeviceCookie(requestFor(undefined, value))).toBe(false);
    });
});
