/**
 * @module
 * The demo profile's email sink. Under `npm run demo` there is no SMTP server or broker, but the
 * e2e suite still needs to read the emails the app "sent" — a password-reset spec is the token in
 * the email, or it is nothing. So in demo mode the mailer records every send here instead of
 * talking to nodemailer, and the demo router (`src/app/demo.ts`) serves it at `GET
 * /__test/emails`. Infrastructure-tier on purpose: the mailer may not reach up into `app`, so the
 * sink lives beside it. Inert unless `enableDemoProfile` (`runtime/demo-profile.ts`) was called —
 * this file only records; deciding whether the process is a demo lives there, since the boot
 * gate, the mailer, `app.ts` and `scenarios/run-server.ts` all need that answer too and none of
 * them are about an email sink.
 */

import type { Data } from 'ejs';
import type { EmailJobPayload } from '@types';

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
    /**
     * Filenames of any attachments this send carried — never the bytes. `nodemailer()` discards
     * the spooled files immediately after recording, same as a real send, so this is the only
     * trace of them a demo-mode spec can read back.
     */
    attachments?: string[];
}

/** Every send recorded this process. Module-level, not persisted: a restart clears it. */
const outbox: DemoOutboxEmail[] = [];

/** Records a send the mailer skipped. Newest first, matching an inbox's reading order. */
export const recordDemoEmail = (
    request: EmailJobPayload['request'],
    templateName: string,
    data: Data
): void => {
    const variables = data as Record<string, unknown>;
    // The reset/verify templates carry their token inside a link URL rather than as a bare
    // variable; the suite wants the token itself, so it is lifted out of the last path segment.
    const linkUrl = typeof variables.linkUrl === 'string' ? variables.linkUrl : undefined;
    const linkToken = /\/([\da-f]{16,})$/.exec(linkUrl ?? '')?.[1];
    outbox.unshift({
        to: request.to,
        subject: request.subject ?? '',
        template: templateName,
        token: typeof variables.token === 'string' ? variables.token : linkToken,
        lines: Object.entries(variables)
            .filter(([, value]) => typeof value === 'string' || typeof value === 'number')
            .map(([key, value]) => `${key}: ${String(value)}`),
        attachments: request.attachments?.length
            ? request.attachments.map((attachment) => attachment.filename)
            : undefined
    });
};

/** A snapshot of every recorded send — a copy, so a caller cannot mutate the live outbox. */
export const readDemoOutbox = (): DemoOutboxEmail[] => [...outbox];

/** Empty the outbox. Called between e2e specs so one test's emails do not leak into the next. */
export const clearDemoOutbox = (): void => {
    outbox.length = 0;
};
