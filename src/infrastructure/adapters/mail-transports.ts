/**
 * @module
 * The mail transport registry: how an email leaves the process, named by `NODE_MAIL_TRANSPORT`.
 *
 * Production registers `smtp` and nothing else. A transport that only pretends — the `log` that
 * renders and drops, the `outbox` that keeps mail in memory — is a test double: it lives in
 * `scenarios/support/doubles/` and is registered by the dev preload and by jest.
 *
 * Each transport answers one question production code needs without naming it: does mail sent
 * through you reach a person's inbox? (`delivers`.) A second factor that mails a code, and a
 * boot check for accounts with no password, ask that instead of comparing to a name.
 *
 * Light on purpose: no `nodemailer` and no `ejs` here. The jest setup and the dev preload load
 * this file before the application, and `smtp` loads its sender on first use for that reason.
 */

import type { Data } from 'ejs';
import type { SendMailOptions, SentMessageInfo } from 'nodemailer';
import type { EmailJobPayload } from '@types';
import {
    createSharedProviderRegistry,
    requireProvider
} from '@infrastructure/runtime/provider-registry';
import { defineConfig, probe } from '@infrastructure/config/define';
import type { Environment } from '@infrastructure/config/store';
import { mailConfig } from './config';

/** One message on its way out: what a transport is handed. */
export interface OutgoingMail {
    /** The envelope as the caller wrote it — recipient, subject, attachment names. */
    request: EmailJobPayload['request'];
    /** The template's outbox name (`orders.order-confirm`), which a recording transport keeps. */
    templateName: string;
    /** The variables the template prints, already translated. */
    data: Data;
    /**
     * Renders the template into the complete envelope nodemailer takes. A transport that keeps the
     * name and the data instead of the HTML never calls it, and the render never happens.
     */
    render: () => Promise<SendMailOptions>;
}

/** How one named transport sends, and whether that reaches anybody. */
export interface MailTransportAdapter {
    /**
     * Whether mail sent through this transport reaches a person's inbox. `smtp` does once a host
     * is set; a transport that renders and drops, or keeps mail in memory for a test to read,
     * says what it is.
     *
     * Takes the raw environment because a boot check runs against it, not against the memo.
     *
     * @param environment - the environment to judge
     */
    delivers: (environment: Environment) => boolean;
    /**
     * Hand one message off.
     *
     * @param mail - the message and the means to render it
     * @returns the transport's own receipt, when it has one worth logging
     */
    send: (mail: OutgoingMail) => Promise<SentMessageInfo | undefined>;
}

/**
 * SMTP, the one transport production has. Its sender (and nodemailer) loads on the first send.
 */
const smtpTransport: MailTransportAdapter = {
    delivers: (environment) => Boolean((environment.NODE_SMTP_HOST ?? '').trim()),
    send: (mail) => import('./smtp-transport').then(({ sendBySmtp }) => sendBySmtp(mail))
};

/**
 * Every transport this process knows, shared across module instances (see
 * `createSharedProviderRegistry`) so a double registered at preload survives a module reset.
 */
export const mailTransportRegistry = createSharedProviderRegistry<MailTransportAdapter>(
    'mail-transports',
    { smtp: smtpTransport }
);

/**
 * Add (or, in a test, override) one transport without editing this file.
 *
 * @param name - the value `NODE_MAIL_TRANSPORT` selects it by
 * @param transport - the transport
 */
export const registerMailTransport = (name: string, transport: MailTransportAdapter): void =>
    mailTransportRegistry.register(name, transport);

/**
 * The transport `NODE_MAIL_TRANSPORT` names (`smtp` when unset), resolved per send.
 *
 * @throws {Error} when the variable names a transport this process does not have; falling back to
 *   `smtp` would turn a typo into mail sent for real
 */
export const resolveMailTransport = (): MailTransportAdapter =>
    requireProvider(mailTransportRegistry, 'NODE_MAIL_TRANSPORT', mailConfig().NODE_MAIL_TRANSPORT);

/**
 * Whether this environment sends mail to a real inbox: the named transport's own answer. The
 * boot checks that depend on a person receiving mail (an account with no password passing step-up)
 * ask this, and an unknown name answers no — the boot probe refuses it separately.
 *
 * @param environment - the environment a slice check was handed
 */
export const mailDeliversIn = (environment: Environment): boolean =>
    mailTransportRegistry
        .resolve((environment.NODE_MAIL_TRANSPORT ?? '').trim().toLowerCase() || 'smtp')
        ?.delivers(environment) ?? false;

/**
 * Boot probe for `NODE_MAIL_TRANSPORT`: a typo would otherwise throw on the first email, in the
 * middle of a request. A shape-less slice, because the resolver imports the config and the config
 * therefore cannot import the resolver.
 */
export const mailTransportProbe = defineConfig({
    name: 'mail-transport',
    shape: {},
    check: () => probe(resolveMailTransport)
});
