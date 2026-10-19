/**
 * @module
 * The export worker: builds one account's data export, writes it to the private export store, and
 * mails the link. Runs from the `worker.account.export` queue, or inline after the response when
 * there is no broker (`./export.ts`).
 *
 * Every registered {@link PersonalDataSection} is collected ONE AT A TIME and appended to the file
 * as it arrives, so peak memory is the largest single section, not the whole export. That is the
 * point of the job: holding every section in one object would cost the whole export's memory per call.
 *
 * Failure is a state, not an exception to hide: a build that throws marks its row `failed`, logs the
 * error, counts it, and mails the requester a short notice (no link); asking again replaces it.
 *
 * See: docs/modules/account.md#data-export
 */

import { DAY_MS } from '@domain-primitives/time';
import { logger } from '@infrastructure/adapters/logger';
import {
    removeExport,
    writeExport,
    type AppendExport
} from '@infrastructure/adapters/export-store';
import { userService, type UserDocument } from '@modules/users';
import type { AccountExportJobPayload } from '@types';
import type { PersonalDataSection, PersonalDataSubject } from '@kernel/registry';
import { exportRetentionMs } from '../config';
import { exportFailedEmail, exportReadyEmail, greetableName } from '../emails';
import { accountExportFailedTotal } from '../metrics';
import { accountExportRepository, type AccountExportRow } from '../repository';
import { personalDataSections } from './personal-data-registry';
import { sendAccountMail } from './mail';

/** The section every export must hold: an export with no profile is not an answer to anyone. */
const PROFILE_SECTION = 'profile';

/**
 * Who an export is about, read off the stored account.
 *
 * @param user - the account being exported
 */
const subjectOf = (user: UserDocument): PersonalDataSubject => ({
    userId: String(user._id),
    email: user.email,
    emailVerified: Boolean(user.verifiedAt)
});

/**
 * Collect every section in turn and append it to the file as one `"name": value` member of a JSON
 * object, then close the object with `exportedAt`.
 *
 * A section resolving `undefined` is omitted (the shape `feedback`'s opt-out uses); one that
 * REJECTS fails the whole build — an incomplete Art. 15 answer must never look like a complete one.
 *
 * @param sections - the registered sections, in declaration order
 * @param subject - who the export is about
 * @param append - writes the next piece of the file
 * @throws {Error} when a section rejects, or when no `profile` section answered
 */
const appendSections = async (
    sections: readonly PersonalDataSection[],
    subject: PersonalDataSubject,
    append: AppendExport
): Promise<void> => {
    let written = 0;
    let hasProfile = false;

    await append('{');
    for (const section of sections) {
        const value = await section.collect(subject);
        if (value === undefined) continue;

        await append(
            `${written > 0 ? ',' : ''}${JSON.stringify(section.section)}:${JSON.stringify(value)}`
        );
        written += 1;
        hasProfile ||= section.section === PROFILE_SECTION;
    }
    if (!hasProfile) throw new Error('No profile section answered: the account is gone.');

    await append(`,"exportedAt":${JSON.stringify(new Date().toISOString())}}`);
};

/**
 * Mail the requester about their export, when there is still someone to mail: the account may have
 * been erased between the request and now. The address is the account's own, read here: a queue
 * message names an account, never the mailbox a person's data is sent to. The greeting names the
 * account only when the mail goes to its verified address (`greetableName`).
 *
 * @param job - the job, for the account and the language
 * @param build - the mail's copy for the greeting name
 */
const mailRequester = (
    job: AccountExportJobPayload,
    build: (name: string) => ReturnType<typeof exportReadyEmail>
): Promise<void> =>
    userService.getById(job.userId).then((user) => {
        // Erased in the meantime: nobody is left to tell.
        if (!user) return;

        return sendAccountMail(user.email, build(greetableName(user, user.email)), 'high');
    });

/**
 * Mail the link for a row that has just become `ready`.
 *
 * @param job - the job, for the address and the language
 * @param row - the settled row
 */
const mailLink = (job: AccountExportJobPayload, row: AccountExportRow): Promise<void> => {
    const days = Math.round(exportRetentionMs() / DAY_MS);
    return mailRequester(job, (name) => exportReadyEmail(job.locale, name, String(row._id), days));
};

/**
 * Build the file, then move the row to `ready`.
 *
 * @param subject - who the export is about, taken from the stored account and not from the queue
 *   message: the `feedback` section matches by this address, so it must be the account's own
 * @param row - the `building` row this job fills in
 * @returns the settled row, or `null` when the row was replaced or erased while this ran
 */
const buildAndSettle = (
    subject: PersonalDataSubject,
    row: AccountExportRow
): Promise<AccountExportRow | null> =>
    writeExport(row.file, (append) => appendSections(personalDataSections(), subject, append)).then(
        () =>
            accountExportRepository.settleBuilding(
                String(row._id),
                'ready',
                new Date(Date.now() + exportRetentionMs())
            )
    );

/**
 * Delete a run's file only when its row no longer exists. A row that is gone was replaced or
 * erased while the run was building, so the file belongs to nobody. A row that still exists was
 * settled by a sibling run of the same job, and its file is that run's good copy.
 *
 * @param row - the row the run was filling in
 */
const removeFileIfRowGone = (row: AccountExportRow): Promise<void> =>
    accountExportRepository
        .findById(String(row._id))
        .then((current) => (current ? undefined : removeExport(row.file).then(() => undefined)));

/**
 * What follows a build: mail the link when this run settled the row, or tidy up when another did.
 *
 * A mail that cannot be queued is logged, not escalated: the file is built and downloadable, and
 * undoing it would only hide that the account was never told. Asking again replaces it and mails
 * a fresh link.
 *
 * @param job - the queue message
 * @param row - the row this job was filling in
 * @param settled - what {@link buildAndSettle} resolved to
 */
const afterBuild = (
    job: AccountExportJobPayload,
    row: AccountExportRow,
    settled: AccountExportRow | null
): Promise<void> => {
    if (!settled) return removeFileIfRowGone(row);

    return mailLink(job, settled).catch((error: unknown) => {
        logger.error({
            message: 'account export mail not queued',
            exportId: String(row._id),
            error
        });
    });
};

/**
 * Tell the requester a build failed. Skipped when the account is gone; a mail that cannot be queued
 * is logged and the row stays `failed`.
 *
 * @param job - the job, for the address and the language
 */
const mailFailure = (job: AccountExportJobPayload): Promise<void> =>
    mailRequester(job, (name) => exportFailedEmail(job.locale, name)).catch((error: unknown) => {
        logger.error({ message: 'account export failure mail not queued', error });
    });

/**
 * Mark the row `failed`, take the half-built file away and tell the requester. The error is logged here, so the
 * failure is never swallowed: the row says WHAT happened, the log says why.
 *
 * @param job - the queue message, for the notice to the requester
 * @param row - the row the failed job was filling in
 * @param error - what the build threw
 */
const fail = (
    job: AccountExportJobPayload,
    row: AccountExportRow,
    error: unknown
): Promise<void> => {
    logger.error({ message: 'account export failed', exportId: String(row._id), error });

    return accountExportRepository
        .settleBuilding(String(row._id), 'failed', new Date(Date.now() + exportRetentionMs()))
        .then((settled) => {
            // Otherwise a sibling settled the row (its file is good) or the row is gone (its file
            // is nobody's).
            if (!settled) return removeFileIfRowGone(row);

            // This run's own failure: its half-built file goes, and only this run tells the person.
            accountExportFailedTotal.inc();
            return removeExport(row.file).then(() => mailFailure(job));
        });
};

/**
 * Run one export job. Safe to run twice: only a row still `building` is built, and only the run
 * that settles it mails the link.
 *
 * @param job - the queue message: the row to fill in and the subject the request saw
 * @returns `true` (ack) once the job is settled either way: a failed build is a `failed` row, not
 *   a rejection, so the queue does not redeliver a job that will fail the same way. A thrown
 *   database error is left to reject, which requeues it as a transient failure.
 */
export const runExportJob = (job: AccountExportJobPayload): Promise<boolean> =>
    accountExportRepository.findById(job.exportId).then((row) => {
        // Replaced, erased or already settled: nothing to build.
        if (row?.status !== 'building') return true;

        return userService.getById(job.userId).then((user) => {
            // Erased since the request: there is no account to export, and the job's own address
            // is not trusted to stand in for one.
            if (!user) return fail(job, row, new Error('The account is gone.')).then(() => true);

            // Two-argument `then`, not `then().catch()`: a failure AFTER the row is ready (the mail)
            // must not reach `fail`, which would delete a good file.
            return buildAndSettle(subjectOf(user), row)
                .then(
                    (settled) => afterBuild(job, row, settled),
                    (error: unknown) => fail(job, row, error)
                )
                .then(() => true);
        });
    });
