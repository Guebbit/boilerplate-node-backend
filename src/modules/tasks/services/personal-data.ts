/**
 * @module
 * The module's two `personalData` halves, the export and the erasure. They share
 * `ownTasksFilter` and cover exactly the same set, so they stay together.
 *
 * @see docs/modules/tasks.md#personal-data
 */

import type { ClientSession } from 'mongoose';
import { TaskSource } from '@types';
import type { ExportSystemTask, ExportTask } from '@types';
import type { AfterErase, PersonalDataSubject } from '@kernel/registry';
import { getDefaultLocale } from '@infrastructure/i18n';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { supportEmail } from '@infrastructure/adapters/config';
import { readAll, MAX_CONFIGURED_PAGE_SIZE } from '@infrastructure/persistence/search';
import { toObjectId, type Lean } from '@infrastructure/persistence/create-repository';
import type { TaskDocument } from '../model';
import { taskRepository } from '../repository';
import { erasureNoticeEmail } from '../emails';
import { ownTasksFilter } from '../domain';

/**
 * Tell the support mailbox which messages an erasure deleted, by `[#ref]` alone, so staff can
 * delete the mailbox copies. Runs after the erasure's commit and rejects if the queue fails: the
 * caller logs it and the erasure stands.
 *
 * @param ids - the deleted tasks' ids
 */
const mailErasureNotice = (ids: readonly string[]): Promise<void> => {
    const mail = erasureNoticeEmail(getDefaultLocale(), ids);
    return enqueueEmail(
        { to: supportEmail(), subject: mail.subject },
        mail.template,
        mail.data
    ).then(() => undefined);
};

/**
 * A person's own visitor tasks — what they sent signed in, plus what was sent under their
 * verified address (`ownTasksFilter`). Deliberately `findAll` with a raw filter, not `search`'s
 * `email` spec: that spec is a REGEX for staff free-text search, and a substring match here would
 * hand one person another's task whose address happens to contain theirs.
 *
 * @param subject - who the export is about
 */
export const findOwnTasks = (subject: PersonalDataSubject): Promise<Lean<TaskDocument>[]> =>
    readAll(
        (page) =>
            taskRepository.findAll(ownTasksFilter(subject), {
                skip: (page - 1) * MAX_CONFIGURED_PAGE_SIZE,
                limit: MAX_CONFIGURED_PAGE_SIZE
            }),
        MAX_CONFIGURED_PAGE_SIZE
    );

/**
 * The staff notes as the data subject sees them: the words and the time, never the author (the
 * author is a colleague's data, and who wrote it is not the subject's to know).
 *
 * @param task - the stored task
 */
const exportNotesOf = (task: Lean<TaskDocument>) =>
    task.notes.map((note) => ({ body: note.body, at: note.at.toISOString() }));

/**
 * {@link ExportTask}, built from the real document. A REAL plain object, not a type-level `Omit`
 * on the Mongoose document: the document's own `toJSON()` carries no such omission, so returning
 * the document itself would still serialize every staff field.
 */
const toExportTask = (task: Lean<TaskDocument>): ExportTask => ({
    id: String(task._id),
    ...(task.name === undefined ? {} : { name: task.name }),
    email: task.email ?? '',
    subject: task.subject,
    message: task.message,
    ...(task.category ? { category: task.category } : {}),
    ...(task.orderNumber ? { orderNumber: task.orderNumber } : {}),
    status: task.status,
    notes: exportNotesOf(task),
    ...(task.respondedAt ? { respondedAt: task.respondedAt.toISOString() } : {}),
    ...(task.createdAt ? { createdAt: task.createdAt.toISOString() } : {})
});

/**
 * {@link findOwnTasks}, shaped for the account data export: exactly the set
 * {@link eraseOwnTasks} removes.
 *
 * @param subject - who the export is about
 */
export const findOwnTasksForExport = (subject: PersonalDataSubject): Promise<ExportTask[]> =>
    findOwnTasks(subject).then((tasks) => tasks.map((task) => toExportTask(task)));

/**
 * {@link ExportSystemTask}: every field the system holds about the situation except the staff
 * behind it (`assigneeId`, the notes' authors) and the dedup key. A task is itself an assessment
 * of the person, so it is the person's to read (CJEU C-434/16, EDPB 01/2022).
 */
const toExportSystemTask = (task: Lean<TaskDocument>): ExportSystemTask => ({
    id: String(task._id),
    kind: task.kind,
    subject: task.subject,
    message: task.message,
    ...(task.link ? { link: { type: task.link.type, id: task.link.id } } : {}),
    routeSet: task.routeSet,
    status: task.status,
    ...(task.resolution ? { resolution: task.resolution } : {}),
    notes: exportNotesOf(task),
    ...(task.dueAt ? { dueAt: task.dueAt.toISOString() } : {}),
    ...(task.lastSeenAt ? { lastSeenAt: task.lastSeenAt.toISOString() } : {}),
    ...(task.seenCount ? { seenCount: task.seenCount } : {}),
    ...(task.respondedAt ? { respondedAt: task.respondedAt.toISOString() } : {}),
    ...(task.closedAt ? { closedAt: task.closedAt.toISOString() } : {}),
    ...(task.createdAt ? { createdAt: task.createdAt.toISOString() } : {})
});

/**
 * The tasks the system opened about this person, shaped for the export. Matched by `subjectId`
 * alone: a system task is about an account, never about an address.
 *
 * @param subject - who the export is about
 */
export const findSystemTasksForExport = (
    subject: PersonalDataSubject
): Promise<ExportSystemTask[]> =>
    readAll(
        (page) =>
            taskRepository.findAll(
                { source: TaskSource.system, subjectId: toObjectId(subject.userId) },
                {
                    skip: (page - 1) * MAX_CONFIGURED_PAGE_SIZE,
                    limit: MAX_CONFIGURED_PAGE_SIZE
                }
            ),
        MAX_CONFIGURED_PAGE_SIZE
    ).then((tasks) => tasks.map((task) => toExportSystemTask(task)));

/**
 * Erase what the person owns — the `personalData.erase` hook, run only inside a hard delete's
 * transaction (never at the reversible lock, so a restore finds every message):
 *   - their visitor tasks, open and spam included;
 *   - system tasks that ARE the person's (the record is the account or its export), deleted;
 *   - system tasks about an order, payment… that outlive them, detached from the account;
 *   - their name as assignee and as the author of notes, wherever they worked.
 *
 * @param subject - the erased account
 * @param session - the erasure's transaction
 * @returns once the erasure commits, a notice to the support mailbox naming the deleted messages
 * by `[#ref]`, because their mailbox copies are not ours to delete; nothing when there were none
 */
export const eraseOwnTasks = async (
    subject: PersonalDataSubject,
    session: ClientSession
): Promise<AfterErase | undefined> => {
    // Sequential: a `ClientSession` runs ONE operation at a time.
    const deletedIds = await taskRepository.deleteOwned(ownTasksFilter(subject), session);
    await taskRepository.deleteSystemAbout(subject.userId, session);
    await taskRepository.detachSubject(subject.userId, session);
    await taskRepository.forgetStaff(subject.userId, session);
    return deletedIds.length > 0 ? () => mailErasureNotice(deletedIds) : undefined;
};
