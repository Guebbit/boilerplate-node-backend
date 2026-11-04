/**
 * @module
 * The doors that move a task — resolve, mark as spam, reopen, assign, unassign, note — and the
 * staff badge. Pins the stamps each move owes (`closedAt`, `resolution`, `respondedAt`, the dedup
 * key), the 409 on every repeat, the reopen collision, the jurisdiction (an out-of-set task is a
 * 404), and the audit row each move writes.
 */

import { Types } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { observePort } from '@tests/ports';
import { callerContextAs } from '@tests/callers';
import { asReject, asSuccess } from '@tests/response';
import { createUser } from '@modules/users/tests/factories';
import { taskService } from '@modules/tasks/service';
import { taskRepository } from '@modules/tasks/repository';
import { tasksAuditActions } from '@modules/tasks/audit';
import * as auditPort from '@infrastructure/observability/audit';
import type { TaskDocument } from '@modules/tasks/model';
import { TaskKind, TaskLinkType, TaskSource, TaskStatus } from '@types';

/* The audit port is replaced, not spied on — see `tests/support/ports.ts`. */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

setupTestDb();

afterEach(() => jest.restoreAllMocks());

/** A member of staff holding every set. */
const admin = callerContextAs('admin', new Types.ObjectId().toString());

/** Support: reads and works contact messages, but is not in the account-review jurisdiction. */
const support = callerContextAs('support', new Types.ObjectId().toString());

/** A contact message, filed through the form. */
const fileContact = () =>
    taskService.create({
        name: 'Ada',
        email: 'ada@example.com',
        subject: 'Broken checkout',
        message: 'The cart total is wrong.'
    });

/** An open system task about an account, as the system opens one. */
const openReviewTask = (link = 'user-1') =>
    taskRepository.create({
        source: TaskSource.system,
        kind: TaskKind.account_review,
        routeSet: 'UserBanning',
        subject: 'Account flagged for review',
        message: 'Account user-1 needs a person.',
        link: { type: TaskLinkType.user, id: link },
        openKey: `account_review:user:${link}`,
        dueAt: new Date('2030-01-01T00:00:00Z')
    });

/** The task as storage holds it now. */
const stored = (id: unknown) => taskRepository.findById(String(id)).then((found) => found!);

/** One field of the stored task. */
const storedField = <TKey extends keyof TaskDocument>(id: unknown, key: TKey) =>
    stored(id).then((row) => row[key]);

describe('resolve', () => {
    it('closes a new task as resolved by staff, stamping closedAt and respondedAt', async () => {
        const task = await fileContact();

        const result = await taskService.resolve(String(task._id), admin);

        expect(asSuccess(result).data).toMatchObject({
            status: TaskStatus.resolved,
            resolution: 'staff'
        });
        const row = await stored(task._id);
        expect(row.closedAt).toBeInstanceOf(Date);
        expect(row.respondedAt).toBeInstanceOf(Date);
    });

    it('releases the dedup key of a linked task', async () => {
        const task = await openReviewTask();

        await taskService.resolve(String(task._id), admin);

        expect(await storedField(task._id, 'openKey')).toBeUndefined();
    });

    it('answers 409 TASK_ALREADY_RESOLVED on a repeat and changes nothing', async () => {
        const task = await fileContact();
        await taskService.resolve(String(task._id), admin);
        const { closedAt } = await stored(task._id);

        const again = asReject(await taskService.resolve(String(task._id), admin));

        expect(again.status).toBe(409);
        expect(again.errors[0].code).toBe('TASK_ALREADY_RESOLVED');
        expect(await storedField(task._id, 'closedAt')).toEqual(closedAt);
    });

    it('lets spam be resolved, keeping the time it was first closed', async () => {
        const task = await fileContact();
        await taskService.markSpam(String(task._id), admin);
        const { closedAt } = await stored(task._id);

        const result = await taskService.resolve(String(task._id), admin);

        expect(asSuccess(result).data.status).toBe(TaskStatus.resolved);
        expect(await storedField(task._id, 'closedAt')).toEqual(closedAt);
    });

    it('lets exactly one of two simultaneous clicks win', async () => {
        const task = await fileContact();

        const results = await Promise.all([
            taskService.resolve(String(task._id), admin),
            taskService.resolve(String(task._id), admin)
        ]);

        expect(results.filter((result) => result.success)).toHaveLength(1);
        const refused = asReject(results.find((result) => !result.success)!);
        expect(refused.status).toBe(409);
    });

    it('answers 404 for an id that does not exist', async () => {
        const result = await taskService.resolve('000000000000000000000000', admin);

        expect(asReject(result).status).toBe(404);
    });
});

describe('markSpam', () => {
    it('turns a resolved task into spam without touching respondedAt', async () => {
        const task = await fileContact();
        await taskService.resolve(String(task._id), admin);
        const { respondedAt } = await stored(task._id);

        const result = await taskService.markSpam(String(task._id), admin);

        expect(asSuccess(result).data).toMatchObject({
            status: TaskStatus.spam,
            resolution: 'spam'
        });
        expect(await storedField(task._id, 'respondedAt')).toEqual(respondedAt);
    });

    it('answers 409 TASK_ALREADY_SPAM on a repeat', async () => {
        const task = await fileContact();
        await taskService.markSpam(String(task._id), admin);

        const again = asReject(await taskService.markSpam(String(task._id), admin));

        expect(again.status).toBe(409);
        expect(again.errors[0].code).toBe('TASK_ALREADY_SPAM');
    });
});

describe('reopen', () => {
    it('reopens an unassigned closed task as new, clearing the retention clock', async () => {
        const task = await fileContact();
        await taskService.resolve(String(task._id), admin);

        const result = await taskService.reopen(String(task._id), admin);

        expect(asSuccess(result).data.status).toBe(TaskStatus.new);
        const row = await stored(task._id);
        expect(row.closedAt).toBeUndefined();
        expect(row.resolution).toBeUndefined();
    });

    it('reopens an assigned task as in progress', async () => {
        const worker = await createUser({}, 'support');
        const task = await fileContact();
        await taskService.assign(String(task._id), worker.id, admin);
        await taskService.resolve(String(task._id), admin);

        const result = await taskService.reopen(String(task._id), admin);

        expect(asSuccess(result).data.status).toBe(TaskStatus.in_progress);
    });

    it('restores the dedup key and keeps the deadline', async () => {
        const task = await openReviewTask();
        const { dueAt } = task;
        await taskService.resolve(String(task._id), admin);

        await taskService.reopen(String(task._id), admin);

        const row = await stored(task._id);
        expect(row.openKey).toBe('account_review:user:user-1');
        expect(row.dueAt).toEqual(dueAt);
    });

    it('answers 409 TASK_ALREADY_OPEN for an open task', async () => {
        const task = await fileContact();

        const result = asReject(await taskService.reopen(String(task._id), admin));

        expect(result.status).toBe(409);
        expect(result.errors[0].code).toBe('TASK_ALREADY_OPEN');
    });

    it('answers 409 TASK_SUPERSEDED, naming the newer task, when one holds the key', async () => {
        const older = await openReviewTask();
        await taskService.resolve(String(older._id), admin);
        const newer = await openReviewTask();

        const result = asReject(await taskService.reopen(String(older._id), admin));

        expect(result.status).toBe(409);
        expect(result.errors[0]).toMatchObject({
            code: 'TASK_SUPERSEDED',
            details: { taskId: String(newer._id) }
        });
        expect(await storedField(older._id, 'status')).toBe(TaskStatus.resolved);
    });
});

describe('jurisdiction', () => {
    it('hides a system task from a caller who does not hold its set', async () => {
        const task = await openReviewTask();

        const read = await taskService.getById(String(task._id), support);
        const move = await taskService.resolve(String(task._id), support);

        expect(asReject(read).status).toBe(404);
        expect(asReject(move).status).toBe(404);
        expect(await storedField(task._id, 'status')).toBe(TaskStatus.new);
    });

    it('keeps system tasks out of the list of a caller outside the set, and shows them to an administrator', async () => {
        await openReviewTask();
        await fileContact();

        const seenBySupport = await taskService.search({}, support);
        const seenByAdmin = await taskService.search({}, admin);

        expect(seenBySupport.items.map((row) => row.source)).toEqual(['visitor']);
        expect(seenByAdmin.items).toHaveLength(2);
    });

    it('lets support work a contact message', async () => {
        const task = await fileContact();

        const result = await taskService.resolve(String(task._id), support);

        expect(result.success).toBe(true);
    });
});

describe('assign and unassign', () => {
    it('takes a new task into progress and names the assignee', async () => {
        const worker = await createUser({ username: 'sam' }, 'support');
        const task = await fileContact();

        const result = await taskService.assign(String(task._id), worker.id, admin);

        expect(asSuccess(result).data).toMatchObject({
            status: TaskStatus.in_progress,
            assigneeId: worker.id
        });
        const read = asSuccess(await taskService.getById(String(task._id), admin));
        expect(read.data.assigneeName).toBe('sam');
    });

    it('refuses a person who does not hold the task’s set with 422', async () => {
        const outsider = await createUser({}, 'support');
        const task = await openReviewTask();

        const result = asReject(await taskService.assign(String(task._id), outsider.id, admin));

        expect(result.status).toBe(422);
        expect(result.errors[0].code).toBe('TASK_ASSIGNEE_INVALID');
    });

    it('refuses a person who holds the set but may not work tasks: a moderator cannot be given an account review', async () => {
        const moderator = await createUser({}, 'moderator');
        const task = await openReviewTask();

        const result = asReject(await taskService.assign(String(task._id), moderator.id, admin));

        expect(result.status).toBe(422);
        expect(result.errors[0].code).toBe('TASK_ASSIGNEE_INVALID');
    });

    it('refuses a person who may read a contact message but not work it: a manager', async () => {
        const manager = await createUser({}, 'manager');
        const task = await fileContact();

        const result = asReject(await taskService.assign(String(task._id), manager.id, admin));

        expect(result.status).toBe(422);
        expect(result.errors[0].code).toBe('TASK_ASSIGNEE_INVALID');
    });

    it('gives an administrator any task', async () => {
        const other = await createUser({}, 'admin');
        const task = await openReviewTask();

        const result = await taskService.assign(String(task._id), other.id, admin);

        expect(asSuccess(result).data.assigneeId).toBe(other.id);
    });

    it('refuses a person who does not exist with 422', async () => {
        const task = await fileContact();

        const result = asReject(
            await taskService.assign(String(task._id), '000000000000000000000000', admin)
        );

        expect(result.status).toBe(422);
    });

    it('refuses to assign a closed task with 409 TASK_NOT_OPEN', async () => {
        const worker = await createUser({}, 'support');
        const task = await fileContact();
        await taskService.resolve(String(task._id), admin);

        const result = asReject(await taskService.assign(String(task._id), worker.id, admin));

        expect(result.status).toBe(409);
        expect(result.errors[0].code).toBe('TASK_NOT_OPEN');
    });

    it('gives a task back: the assignee goes and an in-progress task is new again', async () => {
        const worker = await createUser({}, 'support');
        const task = await fileContact();
        await taskService.assign(String(task._id), worker.id, admin);

        const result = await taskService.unassign(String(task._id), admin);

        const wire = asSuccess(result).data;
        expect(wire.status).toBe(TaskStatus.new);
        expect(wire.assigneeId).toBeUndefined();
    });
});

describe('notes', () => {
    it('appends a note with its author and time, even to a closed task', async () => {
        const task = await fileContact();
        await taskService.resolve(String(task._id), admin);

        const result = await taskService.addNote(String(task._id), '  Called back.  ', admin);

        const { notes } = asSuccess(result).data;
        expect(notes).toHaveLength(1);
        expect(notes[0]).toMatchObject({ body: 'Called back.', authorId: admin.caller.id });
        expect(Date.parse(notes[0].at)).not.toBeNaN();
    });

    it('keeps the thread append-only: a second note does not replace the first', async () => {
        const task = await fileContact();
        await taskService.addNote(String(task._id), 'one', admin);

        const result = await taskService.addNote(String(task._id), 'two', admin);

        expect(asSuccess(result).data.notes.map((note) => note.body)).toEqual(['one', 'two']);
    });
});

describe('summary', () => {
    it('counts open, mine, overdue and unassigned inside the caller’s jurisdiction', async () => {
        const worker = await createUser({}, 'support');
        const taken = await fileContact();
        await taskService.assign(String(taken._id), worker.id, admin);
        await fileContact();
        const done = await fileContact();
        await taskService.resolve(String(done._id), admin);
        await openReviewTask();

        const adminView = await taskService.summary(admin);
        const supportView = await taskService.summary(support);

        expect(adminView).toEqual({ open: 3, mine: 0, overdue: 0, unassigned: 2 });
        expect(supportView).toEqual({ open: 2, mine: 0, overdue: 0, unassigned: 1 });
    });

    it('counts a task past its due date as overdue', async () => {
        const task = await fileContact();
        await taskRepository.save(Object.assign(task, { dueAt: new Date(Date.now() - 1000) }));

        const view = await taskService.summary(admin);

        expect(view.overdue).toBe(1);
    });
});

describe('the audit trail', () => {
    it('records the move by value: from and to', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const task = await fileContact();

        await taskService.resolve(String(task._id), admin);

        const row = auditSpy.mock.calls
            .map(([entry]) => entry)
            .find((entry) => entry.action === tasksAuditActions.ADMIN_TASK_RESOLVED);
        expect(row).toMatchObject({
            targetType: 'task',
            targetId: String(task._id),
            metadata: { from: TaskStatus.new, to: TaskStatus.resolved }
        });
    });

    it('writes no row for a refused move', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const task = await fileContact();

        await taskService.reopen(String(task._id), admin);

        expect(auditSpy).not.toHaveBeenCalled();
    });
});
