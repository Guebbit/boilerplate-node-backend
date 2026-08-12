/**
 * The SMTP transport configuration in `src/infrastructure/adapters/mailer.ts`.
 *
 * This is module-scope config, built once at import time from the environment, and the whole
 * production branch was unreachable from the test suite: `NODE_ENV === 'test'` selects the
 * `jsonTransport` branch, so nothing ever looked at the other one.
 *
 * It is worth looking at, because one line of it is a security decision rather than a setting:
 *
 *     secure: process.env.NODE_SMTP_PORT === '465'
 *
 * `secure: true` means TLS from the first byte, which is only correct on 465. On 587 the
 * connection MUST start plaintext and upgrade via STARTTLS, so `secure` has to be false there.
 * Get it backwards and you either cannot connect at all (true on 587) or you hand SMTP AUTH
 * credentials to a server over a channel you assumed was encrypted and is not (false on 465).
 *
 * `createTransport` is mocked so the options object can be inspected without opening a socket.
 */
const createTransportMock = jest.fn((_options?: unknown) => ({ sendMail: jest.fn() }));
jest.mock('nodemailer', () => ({
    createTransport: (options: unknown) => createTransportMock(options)
}));

import { nodemailer, resetTransporter } from '@infrastructure/adapters/mailer';

/**
 * The options the module handed to `createTransport` for a given environment.
 *
 * The transport is built on first use and memoised, so varying its configuration is `reset` plus
 * a send — not `jest.resetModules()` and a dynamic `import()`. That dance was only ever a way to
 * re-run module-scope code, and there is no module-scope code left to re-run.
 */
const transportOptions = async (
    environment: Record<string, string | undefined>
): Promise<Record<string, unknown>> => {
    createTransportMock.mockClear();
    resetTransporter();

    const previous: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(environment)) {
        previous[key] = process.env[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }

    // Any send builds the transport; the envelope itself is irrelevant here.
    await nodemailer({ to: 'ada@example.com' }, 'email-order-confirm.ejs', {
        locale: 'en',
        pageMetaTitle: '',
        pageMetaLinks: [],
        greeting: '',
        body: '',
        footer: ''
    }).catch(() => {});

    for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }

    return createTransportMock.mock.calls[0]![0] as Record<string, unknown>;
};

const SMTP_ENVIRONMENT = {
    NODE_ENV: 'production',
    NODE_SMTP_HOST: 'smtp.example.com'
};

describe('the test environment uses a transport that sends nothing', () => {
    it('selects jsonTransport under NODE_ENV=test', async () => {
        // The guarantee that a stray test cannot email a real person. Losing this is not a
        // failing test, it is mail leaving the building.
        const options = await transportOptions({ NODE_ENV: 'test' });

        expect(options).toEqual({ jsonTransport: true });
    });
});

describe('TLS mode follows the port, which is a security decision', () => {
    it('uses implicit TLS on 465', async () => {
        const options = await transportOptions({
            ...SMTP_ENVIRONMENT,
            NODE_SMTP_PORT: '465'
        });

        expect(options.port).toBe(465);
        expect(options.secure).toBe(true);
    });

    it('does NOT use implicit TLS on 587, where the connection is upgraded instead', async () => {
        // `secure: true` here means the client speaks TLS to a server expecting plaintext, and
        // the connection simply fails. The inverse mistake is the dangerous one — see below.
        const options = await transportOptions({
            ...SMTP_ENVIRONMENT,
            NODE_SMTP_PORT: '587'
        });

        expect(options.port).toBe(587);
        expect(options.secure).toBe(false);
    });

    it('does not use implicit TLS on any other port', async () => {
        const options = await transportOptions({
            ...SMTP_ENVIRONMENT,
            NODE_SMTP_PORT: '25'
        });

        expect(options.secure).toBe(false);
    });

    it('defaults to 587 with implicit TLS off when no port is configured', async () => {
        // The safe default: submission with STARTTLS is the modern convention, and defaulting to
        // 465 instead would silently break every deployment that did not set the variable.
        const options = await transportOptions({
            ...SMTP_ENVIRONMENT,
            NODE_SMTP_PORT: undefined
        });

        expect(options.port).toBe(587);
        expect(options.secure).toBe(false);
    });
});

describe('credentials and identity', () => {
    it('passes the configured SMTP credentials through', async () => {
        const options = await transportOptions({
            ...SMTP_ENVIRONMENT,
            NODE_SMTP_USER: 'mailer',
            NODE_SMTP_PASS: 'hunter2'
        });

        expect(options.auth).toEqual({ user: 'mailer', pass: 'hunter2' });
    });

    it('falls back to empty credentials rather than undefined', async () => {
        // Deliberate: email is not a hard startup dependency, so an unconfigured mailer must not
        // stop the process from booting. The failure surfaces at send time instead, which is
        // where someone can act on it.
        const options = await transportOptions({
            ...SMTP_ENVIRONMENT,
            NODE_SMTP_USER: undefined,
            NODE_SMTP_PASS: undefined
        });

        expect(options.auth).toEqual({ user: '', pass: '' });
    });

    it('announces the configured EHLO name, empty when unset', async () => {
        // Some strict servers check it; an undefined here would be sent as the string
        // "undefined" rather than omitted.
        const options = await transportOptions({
            ...SMTP_ENVIRONMENT,
            NODE_SMTP_NAME: undefined
        });

        expect(options.name).toBe('');
    });
});
