/**
 * @module
 * The demo profile's email sink. Under `npm run demo` there is no SMTP server or broker, but the
 * e2e suite still needs to read the emails the app "sent" — a password-reset spec is the token in
 * the email, or it is nothing. So in demo mode the mailer records every send here instead of
 * talking to nodemailer, and the demo router (`src/app/demo.ts`) serves it at `GET
 * /__test/emails`. Infrastructure-tier on purpose: the mailer may not reach up into `app`, so the
 * sink lives beside it. Inert unless {@link enableDemoProfile} was called.
 *
 * Gated on an in-process call, never on an env var: switching this on diverts mail, opens an
 * unauthenticated database wipe and skips the boot secrets gate, so no copied `.env` may be able
 * to do it. Nothing but `scenarios/run-server.ts` calls {@link enableDemoProfile}.
 */

import type { SendMailOptions } from 'nodemailer';
import type { Data } from 'ejs';
import { logger } from './logger';

/** One recorded send, shaped for the e2e suite's outbox reader. */
export interface DemoOutboxEmail {
    /** The recipient, as a plain string — a non-string `to` is stringified before recording. */
    to: string;
    /** The subject line, already translated. */
    subject: string;
    /** The outbox name that rendered this send — see {@link EmailContent.template} in `mailer.ts`. */
    template: string;
    /** The template's `token` variable when it carries one — the reset/verify flows' payload. */
    token?: string;
    /** Every primitive template variable, for specs that assert on rendered content. */
    lines: string[];
}

/** Set only by {@link enableDemoProfile}. Module-level: a restart clears it, same as the outbox. */
let demoProfileEnabled = false;

/**
 * Mark this process as the demo profile — the only way {@link isDemoMode} can return `true`.
 * Called once, in-process, by `scenarios/run-server.ts`, before `src/app.ts` (and
 * everything it wires) is even imported. A handful of tests call it directly to exercise the
 * demo surface without booting through that script; pass `false` to turn it back off, which
 * every such test must do in its own cleanup so the flag cannot leak into the next one.
 *
 * @param enabled - defaults to `true`; pass `false` to disable.
 */
export const enableDemoProfile = (enabled = true): void => {
    demoProfileEnabled = enabled;
};

/**
 * `NODE_ENV !== 'production'` stays a second gate even though nothing but
 * {@link enableDemoProfile} can request the demo profile now: `run-server.ts` only DEFAULTS
 * `NODE_ENV` to `development`, it does not override a shell's own `NODE_ENV=production`, so this
 * is what refuses that case rather than mounting anyway. Logs at `error` when it does — a fact
 * whoever owns that deployment needs to hear, not swallow.
 */
export const isDemoMode = (): boolean => {
    const isProduction = process.env.NODE_ENV === 'production';

    if (demoProfileEnabled && isProduction)
        logger.error({
            message:
                'enableDemoProfile() was called in a production environment. Refusing to mount the demo profile.'
        });

    return demoProfileEnabled && !isProduction;
};

/** Every send recorded this process. Module-level, not persisted: a restart clears it. */
const outbox: DemoOutboxEmail[] = [];

/** Records a send the mailer skipped. Newest first, matching an inbox's reading order. */
export const recordDemoEmail = (
    request: SendMailOptions,
    templateName: string,
    data: Data
): void => {
    const variables = data as Record<string, unknown>;
    // The reset/verify templates carry their token inside a link URL rather than as a bare
    // variable; the suite wants the token itself, so it is lifted out of the last path segment.
    const linkUrl = typeof variables.linkUrl === 'string' ? variables.linkUrl : undefined;
    const linkToken = /\/([\da-f]{16,})$/.exec(linkUrl ?? '')?.[1];
    outbox.unshift({
        to: typeof request.to === 'string' ? request.to : JSON.stringify(request.to ?? ''),
        subject: typeof request.subject === 'string' ? request.subject : '',
        template: templateName,
        token: typeof variables.token === 'string' ? variables.token : linkToken,
        lines: Object.entries(variables)
            .filter(([, value]) => typeof value === 'string' || typeof value === 'number')
            .map(([key, value]) => `${key}: ${String(value)}`)
    });
};

/** A snapshot of every recorded send — a copy, so a caller cannot mutate the live outbox. */
export const readDemoOutbox = (): DemoOutboxEmail[] => [...outbox];

/** Empty the outbox. Called between e2e specs so one test's emails do not leak into the next. */
export const clearDemoOutbox = (): void => {
    outbox.length = 0;
};
