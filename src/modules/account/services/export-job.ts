/**
 * @module
 * The export worker: builds one account's data export, writes it to the private export store, and
 * mails the link. Runs from the `worker.account.export` queue, or inline after the response when
 * there is no broker (`./export.ts`).
 *
 * Every registered {@link PersonalDataSection} is collected ONE AT A TIME and appended to the file
 * as it arrives, so peak memory is the largest single section, not the whole export. That is the
 * point of the job: the request used to hold all fifteen sections in one object, per call.
 *
 * Failure is a state, not an exception to hide: a build that throws marks its row `failed` and logs
 * the error, and asking again replaces it. No mail goes out for a failure.
 *
 * See: docs/modules/account.md#data-export
 */

import { logger } from '@infrastructure/adapters/logger';
import {
    removeExport,
    writeExport,
    type AppendExport
} from '@infrastructure/adapters/export-store';
import { userService } from '@modules/users';
import type { AccountExportJobPayload } from '@types';
import type { PersonalDataSection, PersonalDataSubject } from '@kernel/registry';
import { exportRetentionMs } from '../config';
import { exportReadyEmail, greetableName } from '../emails';
import { accountExportRepository, type AccountExportRow } from '../repository';
import { personalDataSections } from './personal-data-registry';
import { sendAccountMail } from './mail';

/** The section every export must hold: an export with no profile is not an answer to anyone. */
const PROFILE_SECTION = 'profile';

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
 * Mail the link for a row that has just become `ready`. The greeting names the account only when
 * the mail goes to its verified address (`greetableName`).
 *
 * @param job - the job, for the address and the language
 * @param row - the settled row
 */
const mailLink = (job: AccountExportJobPayload, row: AccountExportRow): Promise<void> =>
    userService.getById(job.userId).then((user) => {
        // The account was erased between the build and the mail: nobody is left to tell.
        if (!user) return;

        const days = Math.round(exportRetentionMs() / 86_400_000);
        const name = job.emailVerified ? greetableName(user, job.email) : '';
        return sendAccountMail(
            job.email,
            exportReadyEmail(job.locale, name, String(row._id), days),
            'high'
        );
    });

/**
 * Build the file, then move the row to `ready`.
 *
 * @param job - the queue message
 * @param row - the `building` row this job fills in
 * @returns the settled row, or `null` when the row was replaced or erased while this ran
 */
const buildAndSettle = (
    job: AccountExportJobPayload,
    row: AccountExportRow
): Promise<AccountExportRow | null> => {
    const subject: PersonalDataSubject = {
        userId: job.userId,
        email: job.email,
        emailVerified: job.emailVerified
    };

    return writeExport(row.file, (append) =>
        appendSections(personalDataSections(), subject, append)
    ).then(() =>
        accountExportRepository.settleBuilding(
            String(row._id),
            'ready',
            new Date(Date.now() + exportRetentionMs())
        )
    );
};

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
 * Mark the row `failed` and take the half-built file away. The error is logged here, so the
 * failure is never swallowed: the row says WHAT happened, the log says why.
 *
 * @param row - the row the failed job was filling in
 * @param error - what the build threw
 */
const fail = (row: AccountExportRow, error: unknown): Promise<void> => {
    logger.error({ message: 'account export failed', exportId: String(row._id), error });

    return accountExportRepository
        .settleBuilding(String(row._id), 'failed', new Date(Date.now() + exportRetentionMs()))
        .then((settled) =>
            // This run's own failure: its half-built file goes. Otherwise a sibling settled the
            // row (its file is good) or the row is gone (its file is nobody's).
            settled ? removeExport(row.file).then(() => undefined) : removeFileIfRowGone(row)
        );
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

        // Two-argument `then`, not `then().catch()`: a failure AFTER the row is ready (the mail)
        // must not reach `fail`, which would delete a good file.
        return buildAndSettle(job, row)
            .then(
                (settled) => afterBuild(job, row, settled),
                (error: unknown) => fail(row, error)
            )
            .then(() => true);
    });
