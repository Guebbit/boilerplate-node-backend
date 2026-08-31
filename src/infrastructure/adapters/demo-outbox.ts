/**
 * @module
 * The demo profile's email sink.
 *
 * Under `npm run demo` there is no SMTP server and no broker — but the e2e suite still needs to
 * READ the emails the app "sent": a password-reset spec is the reset token in the email, or it is
 * nothing. So in demo mode the mailer records every send here instead of talking to nodemailer,
 * and the demo router (`src/app/demo.ts`) serves the recording at `GET /__demo/emails`.
 *
 * Infrastructure-tier on purpose: the mailer is an adapter and may not reach up into `app`, so
 * the sink lives beside it and the router reads from it. Inert unless `NODE_DEMO=true` — nothing
 * in a real deployment ever writes or serves it.
 */

import type { SendMailOptions } from 'nodemailer';
import type { Data } from 'ejs';
import { environmentFlag } from '@infrastructure/runtime/environment';

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

/** `npm run demo` sets this; nothing else does. */
export const isDemoMode = (): boolean => environmentFlag('NODE_DEMO', false);

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
