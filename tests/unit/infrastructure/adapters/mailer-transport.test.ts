/**
 * The SMTP transport configuration in `src/infrastructure/adapters/smtp-transport.ts`, and which
 * transport `NODE_MAIL_TRANSPORT` selects (`src/infrastructure/adapters/mail-transports.ts`).
 *
 * The suite runs on the `log` double, so the production `smtp` branch is reached only by naming it
 * here — with `nodemailer` mocked, so nothing opens a socket.
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

import { sendTemplatedEmail } from '@infrastructure/adapters/mailer';
import { resetTransporter } from '@infrastructure/adapters/smtp-transport';
import { mailDeliversIn, resolveMailTransport } from '@infrastructure/adapters/mail-transports';
import { logMailTransport } from '@scenarios/support/doubles/mail-log';
import { outboxMailTransport } from '@scenarios/support/doubles/mail-outbox';
import { currentEnvironment } from '@infrastructure/config/store';
import { withoutEnvironmentInThisFile, setEnvironment } from '@tests/environment';

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

    setEnvironment(environment);

    // Any send builds the transport; the envelope itself is irrelevant here.
    await sendTemplatedEmail({ to: 'ada@example.com' }, 'account.reset-confirm', {
        locale: 'en',
        pageMetaTitle: '',
        pageMetaLinks: [],
        greeting: '',
        body: '',
        providers: '',
        lines: [],
        total: '',
        linkLabel: '',
        linkUrl: '',
        footer: ''
    }).catch(() => {});

    return createTransportMock.mock.calls[0][0] as Record<string, unknown>;
};

const SMTP_ENVIRONMENT = {
    NODE_MAIL_TRANSPORT: 'smtp',
    NODE_SMTP_HOST: 'smtp.example.com'
};

describe('the test environment uses a transport that sends nothing', () => {
    it('renders through nodemailer’s jsonTransport on the log double', async () => {
        // The guarantee that a stray test cannot email a real person: the suite's default
        // (`tests/support/setup-environment.ts`) is the log double, which opens no socket.
        const options = await transportOptions({ NODE_MAIL_TRANSPORT: 'log' });

        expect(options).toEqual({
            jsonTransport: true,
            disableFileAccess: true,
            disableUrlAccess: true
        });
    });
});

describe('message data can never read a file or fetch a URL', () => {
    it('turns file and URL access off at the transport, where a message cannot turn it on', async () => {
        const options = await transportOptions(SMTP_ENVIRONMENT);

        expect(options.disableFileAccess).toBe(true);
        expect(options.disableUrlAccess).toBe(true);
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

    it('refuses to send on 587 unless the connection upgrades to TLS', async () => {
        // Without it, an attacker who strips the server's STARTTLS advertisement receives the
        // AUTH credentials in cleartext.
        const options = await transportOptions({ ...SMTP_ENVIRONMENT, NODE_SMTP_PORT: '587' });

        expect(options.requireTLS).toBe(true);
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

/**
 * Which transport a process uses, as `NODE_MAIL_TRANSPORT` decides — and what each one claims about
 * reaching a person. Production registers `smtp` alone; the other two are the doubles the jest
 * setup registers.
 */
describe('resolveMailTransport', () => {
    /** Every variable these cases drive, so each starts from "this deployment said nothing". */
    withoutEnvironmentInThisFile(['NODE_MAIL_TRANSPORT', 'NODE_SMTP_HOST']);

    it('sends over SMTP when the deployment names nothing', () => {
        expect(resolveMailTransport().delivers({ NODE_SMTP_HOST: 'smtp.example.com' })).toBe(true);
        expect(resolveMailTransport().delivers({})).toBe(false);
    });

    it.each([
        ['log', logMailTransport],
        ['outbox', outboxMailTransport]
    ])('honours a named %s transport', (named, expected) => {
        setEnvironment({ NODE_MAIL_TRANSPORT: named });

        expect(resolveMailTransport()).toBe(expected);
    });

    it('refuses an unrecognised value instead of silently falling back to SMTP', () => {
        setEnvironment({ NODE_MAIL_TRANSPORT: 'carrier-pigeon' });

        expect(() => resolveMailTransport()).toThrow(
            /Unknown NODE_MAIL_TRANSPORT: "carrier-pigeon". Allowed: smtp, /
        );
    });
});

/** Whether a transport reaches a person — what a second factor and a boot check ask. */
describe('mailDeliversIn', () => {
    withoutEnvironmentInThisFile(['NODE_MAIL_TRANSPORT', 'NODE_SMTP_HOST']);

    it.each([
        [
            'smtp with a host',
            { NODE_MAIL_TRANSPORT: 'smtp', NODE_SMTP_HOST: 'mail.example.com' },
            true
        ],
        ['smtp with no host', { NODE_MAIL_TRANSPORT: 'smtp' }, false],
        ['an unset transport (smtp) with a host', { NODE_SMTP_HOST: 'mail.example.com' }, true],
        [
            'the log, which drops everything',
            { NODE_MAIL_TRANSPORT: 'log', NODE_SMTP_HOST: 'x' },
            false
        ],
        [
            'the outbox, which keeps it where it can be read',
            { NODE_MAIL_TRANSPORT: 'outbox' },
            true
        ],
        ['a name nobody registered', { NODE_MAIL_TRANSPORT: 'carrier-pigeon' }, false]
    ])('%s', (_case, environment, expected) => {
        expect(mailDeliversIn(environment)).toBe(expected);
    });

    it('reads the live environment when asked of it', () => {
        setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' });

        expect(mailDeliversIn(currentEnvironment())).toBe(true);
    });
});
