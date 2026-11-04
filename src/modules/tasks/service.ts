/**
 * @module
 * Task service — the contact form's creation (announced on the bus), the staff reads
 * and delete, and the module's two `personalData` halves (export, erasure). The doors that move a
 * task (resolve, assign, note…) are in `./workflow`; the rules they apply are in `./domain`.
 *
 * See: docs/modules/tasks.md
 */

import type { ClientSession } from 'mongoose';
import { Types } from 'mongoose';
import { TaskKind, TaskResolution, TaskSource } from '@types';
import type {
    CallerContext,
    CreateContactTaskRequest,
    ExportSystemTask,
    ExportTask,
    SearchTasksRequest,
    Task
} from '@types';
import type { PersonalDataSubject } from '@kernel/registry';
import type { TaskDocument } from './model';
import { taskRepository } from './repository';
import {
    generateReject,
    generateSuccess,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { getDefaultLocale, t } from '@infrastructure/i18n';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { emitDomainEvent } from '@kernel/events';
import { logger } from '@infrastructure/adapters/logger';
import { checkEmailPolicy } from '@infrastructure/adapters/antibot';
import { contactRequestEmail } from './emails';
import {
    readAll,
    MAX_CONFIGURED_PAGE_SIZE,
    type PaginatedMeta
} from '@infrastructure/persistence/search';
import { toObjectId, type Lean } from '@infrastructure/persistence/create-repository';
import { recordAudit } from '@infrastructure/observability/audit';
import { normalizeEmail } from '@infrastructure/persistence/normalize-email';
import { OPEN_STATUSES, initialTaskStatus, ownTasksFilter, CONTACT_ROUTE_SET } from './domain';
import { tasksConfig } from './config';
import { tasksAuditActions } from './audit';
import { TASK_OPENED } from './events';
import { inJurisdiction, jurisdictionScope, mayDelete } from './access';
import { presentTask, withView } from './presenter';
import { assigneeNamesOf, viewerOf } from './views';
import { workflow } from './services/workflow';
import { remindOverdue } from './services/overdue';
import { clearSystemTasks, openSystemTask } from './services/system';

/** How long a contact message may wait before it is overdue, in milliseconds. */
const contactSlaMs = (): number => tasksConfig().NODE_TASKS_CONTACT_SLA_HOURS * 3_600_000;

/**
 * Record a contact request and announce it as `task.opened` — unless the honeypot caught it.
 *
 * Both halves live here because "a customer asked us something" is one event, not a write plus a
 * thing the HTTP layer remembers to do afterwards. Who is told, and how, is `notifications`'
 * business: it hears the event.
 *
 * Honeypot:   `payload.website` is a field a real browser always submits empty and a bot reliably
 *             fills, declared in the contract but never persisted (see `TaskDocument`)
 *             or read back. A non-empty value writes the row as `spam` and announces nothing
 *             — the bot still gets its `201`, so it learns nothing, but nobody's inbox hears
 *             about it.
 * Account:    `subjectId` is the signed-in sender's account, so the export and the erasure follow the
 *             task to the person; absent for an anonymous sender.
 * Disposable: a disposable-inbox domain (`checkEmailPolicy`, off by default) is treated the same
 *             way — filed as `spam`, not announced, still a `201`. A visible refusal would
 *             tell a spam script exactly which signal caught it.
 */
const create = (payload: CreateContactTaskRequest, subjectId?: string): Promise<TaskDocument> => {
    const email = normalizeEmail(payload.email);
    const now = new Date();
    const honeypotFilled = Boolean(payload.website?.trim());

    return checkEmailPolicy(email).then((verdict) => {
        const suspectedSpam = honeypotFilled || verdict === 'refused';

        return taskRepository
            .create({
                name: payload.name?.trim() || undefined,
                ...(subjectId ? { subjectId: toObjectId(subjectId) } : {}),
                email,
                subject: payload.subject.trim(),
                message: payload.message.trim(),
                ...(payload.category ? { category: payload.category } : {}),
                ...(payload.orderNumber?.trim() ? { orderNumber: payload.orderNumber.trim() } : {}),
                source: TaskSource.visitor,
                kind: TaskKind.contact,
                routeSet: CONTACT_ROUTE_SET,
                status: initialTaskStatus(suspectedSpam),
                // Spam is closed at birth: it ages from now and never owes work.
                ...(suspectedSpam
                    ? { closedAt: now, resolution: TaskResolution.spam }
                    : { dueAt: new Date(now.getTime() + contactSlaMs()) })
            })
            .then((created) =>
                suspectedSpam
                    ? created
                    : emitDomainEvent(TASK_OPENED, {
                          tenantId: DEPLOYMENT_TENANT_ID,
                          taskId: String(created._id),
                          kind: created.kind,
                          routeSet: created.routeSet,
                          ...(created.category ? { category: created.category } : {})
                      }).then(() => created)
            );
    });
};

/**
 * Mail the contact message to the fallback mailbox, `NODE_CONTACT_NOTIFY_EMAIL`, when nobody who
 * could work it has an address to be told at. The one mail that carries the visitor's own words,
 * because that mailbox is then the whole inbox, and it carries `Reply-To: <the visitor>` so
 * answering it reaches them. A no-op without the mailbox, or for a task that is gone or not a
 * contact message.
 *
 * It goes to the operator, not to the sender, so it renders in `NODE_DEFAULT_LOCALE` and takes no
 * `CallerContext`. A failed queue is logged, never raised: the task is already stored.
 *
 * @param taskId - the contact task that found nobody to tell
 * @param overdue - word it as the reminder that the message is late, not as a new one
 */
const mailFallbackMailbox = (taskId: string, overdue = false): Promise<void> => {
    const mailbox = tasksConfig().NODE_CONTACT_NOTIFY_EMAIL;
    if (!mailbox) return Promise.resolve();

    return taskRepository.findById(taskId).then((task) => {
        if (!task?.email || task.kind !== TaskKind.contact) return;

        const mail = contactRequestEmail(getDefaultLocale(), {
            name: task.name,
            email: task.email,
            subject: task.subject,
            message: task.message,
            category: task.category,
            createdAt: task.createdAt?.toISOString(),
            overdue
        });

        return enqueueEmail(
            // `replyTo`: the bare address only (already normalised on create), never a display
            // name: the visitor's free-text name must not reach a header.
            { to: mailbox, subject: mail.subject, replyTo: task.email },
            mail.template,
            mail.data
        )
            .then(() => undefined)
            .catch((error: unknown) => {
                // Stryker disable all
                logger.error({ message: 'task fallback mailbox email failed', error });
                // Stryker restore all
            });
    });
};

/** What a search may filter on, past the repository's own text and address matching. */
type TaskFilters = Omit<SearchTasksRequest, 'page' | 'pageSize'> & {
    page?: string | number;
    pageSize?: string | number;
};

/**
 * The part of a search that is a closed enum or a relation, declared as scope rather than on the
 * repository's spec: each has its own collection-wide meaning, not a per-field text match.
 *
 * @param filters - the validated filters
 * @param context - the caller, whose jurisdiction bounds the search and whose id `assignee=me` reads
 * @param now - the clock, for `overdue`
 */
const scopeOf = (
    filters: TaskFilters,
    context: CallerContext,
    now: Date
): Record<string, unknown> => {
    const { caller } = context;
    const clauses: Record<string, unknown>[] = [jurisdictionScope(caller)];

    if (filters.overdue === true)
        clauses.push({ status: { $in: OPEN_STATUSES }, dueAt: { $lt: now } });

    if (filters.assignee === 'none') clauses.push({ assigneeId: { $exists: false } });
    else if (filters.assignee !== undefined) {
        const who = filters.assignee === 'me' ? caller.id : filters.assignee;
        // `me` for a caller with no account (an API key), or an id that is not one, matches nothing.
        clauses.push(
            who !== null && who !== undefined && Types.ObjectId.isValid(who)
                ? { assigneeId: toObjectId(who) }
                : { _id: { $in: [] } }
        );
    }

    return {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.source ? { source: filters.source } : {}),
        ...(filters.kind ? { kind: filters.kind } : {}),
        $and: clauses
    };
};

/**
 * Search tasks by status, kind, source, assignee, overdue, email fragment or free text,
 * paginated — inside the caller's jurisdiction.
 *
 * Emits `tasksAuditActions.ADMIN_TASK_VIEWED` when a `context` is given.
 *
 * @param filters - the validated filters; `page`/`pageSize` may be strings, which
 *   `normalizePagination` coerces and bounds
 * @param context - the caller. Required: the jurisdiction is theirs.
 */
const search = (
    filters: TaskFilters,
    context: CallerContext
): Promise<{ items: Task[]; meta: PaginatedMeta }> => {
    const now = new Date();

    return taskRepository.search(filters, scopeOf(filters, context, now)).then(({ items, meta }) =>
        assigneeNamesOf(items.map((row) => row.assigneeId)).then((names) => {
            const viewer = viewerOf(context.caller, names);
            recordAudit(context, {
                action: tasksAuditActions.ADMIN_TASK_VIEWED,
                outcome: 'success'
            });
            return { items: items.map((row) => withView(row, viewer.of(row), now)), meta };
        })
    );
};

/**
 * One task by id, inside the caller's jurisdiction, with its notes, its assignee's name and the
 * earlier tasks about the same record. A task outside the jurisdiction is a 404, not a 403: it
 * does not admit to existing.
 *
 * @param id - the task
 * @param context - the caller
 * @returns the task, or the 404 a missing or out-of-jurisdiction one earns
 */
const getById = (
    id: string,
    context: CallerContext
): Promise<ResponseSuccess<Task> | ResponseReject> =>
    taskRepository.findById(id).then((task) => {
        if (!task || !inJurisdiction(context.caller, task))
            return generateReject(404, [t('generic.error-item-gone')]);

        return Promise.all([
            assigneeNamesOf([task.assigneeId?.toString()]),
            task.link ? earlierThan(task, context) : Promise.resolve([])
        ]).then(([names, earlierTasks]) =>
            generateSuccess(
                presentTask(task, {
                    ...viewerOf(context.caller, names).of(task),
                    earlierTasks
                })
            )
        );
    });

/**
 * The tasks about the same record that came before this one, newest first, inside the caller's
 * jurisdiction.
 *
 * @param task - the task being read
 * @param context - the caller
 */
const earlierThan = (task: TaskDocument, context: CallerContext) =>
    taskRepository
        .findAll(
            {
                'link.type': task.link?.type,
                'link.id': task.link?.id,
                _id: { $ne: task._id },
                createdAt: { $lte: task.createdAt },
                ...jurisdictionScope(context.caller)
            },
            { sort: { createdAt: -1 }, limit: 20 }
        )
        .then((rows) =>
            rows.map((row) => ({
                id: String(row._id),
                kind: row.kind,
                status: row.status,
                createdAt: (row.createdAt ?? new Date(0)).toISOString()
            }))
        );

/**
 * Loads a task by id and permanently removes it, then — on success — emits
 * `tasksAuditActions.ADMIN_TASK_DELETED`. Needs `delete:Task` and, for a system task,
 * its route set.
 *
 * No soft-delete tier: this module has none, so unlike `orders`' `removeById` there is no
 * `hardDelete` flag to thread through.
 *
 * @returns A 404 when the id names no task in the caller's jurisdiction, a 403 when the caller
 *   may see but not delete it, otherwise the removal result.
 */
const removeById = (
    id: string,
    context: CallerContext
): Promise<ResponseSuccess<undefined> | ResponseReject> =>
    taskRepository.findById(id).then((task) => {
        if (!task || !inJurisdiction(context.caller, task))
            return generateReject(404, [t('generic.error-item-gone')]);
        if (!mayDelete(context.caller, task))
            return generateReject(403, [t('generic.error-forbidden')]);

        return taskRepository.deleteOne(task).then(() => {
            recordAudit(context, {
                action: tasksAuditActions.ADMIN_TASK_DELETED,
                outcome: 'success',
                targetType: 'task',
                targetId: id
            });
            return generateSuccess(undefined);
        });
    });

/**
 * A person's own visitor tasks — what they sent signed in, plus what was sent under their
 * verified address (`ownTasksFilter`). Deliberately `findAll` with a raw filter, not `search`'s
 * `email` spec: that spec is a REGEX for staff free-text search, and a substring match here would
 * hand one person another's task whose address happens to contain theirs.
 *
 * @param subject - who the export is about
 */
const findOwnTasks = (subject: PersonalDataSubject): Promise<Lean<TaskDocument>[]> =>
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
const findOwnTasksForExport = (subject: PersonalDataSubject): Promise<ExportTask[]> =>
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
const findSystemTasksForExport = (subject: PersonalDataSubject): Promise<ExportSystemTask[]> =>
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
 */
const eraseOwnTasks = async (
    subject: PersonalDataSubject,
    session: ClientSession
): Promise<void> => {
    // Sequential: a `ClientSession` runs ONE operation at a time.
    await taskRepository.deleteOwned(ownTasksFilter(subject), session);
    await taskRepository.deleteSystemAbout(subject.userId, session);
    await taskRepository.detachSubject(subject.userId, session);
    await taskRepository.forgetStaff(subject.userId, session);
};

/** The module's barrel export — used by the controllers in `./controllers`. */
export const taskService = {
    create,
    mailFallbackMailbox,
    remindOverdue,
    openSystemTask,
    clearSystemTasks,
    search,
    getById,
    removeById,
    ...workflow,
    findOwnTasks,
    findOwnTasksForExport,
    findSystemTasksForExport,
    eraseOwnTasks
};
