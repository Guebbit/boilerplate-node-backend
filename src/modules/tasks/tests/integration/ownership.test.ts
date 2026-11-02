/**
 * @module
 * A visitor's messages follow their account: the form records the signed-in sender, and the
 * erasure removes exactly the set the export lists (`src/modules/tasks/domain/ownership.ts`).
 */

import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { Types } from 'mongoose';
import { withTransaction } from '@infrastructure/runtime/database';
import { taskService } from '@modules/tasks/service';
import { taskRepository } from '@modules/tasks/repository';
import tasksModule from '@modules/tasks/module';
import type { PersonalDataEraser } from '@kernel/registry';
import { TaskKind, TaskLinkType, TaskSource } from '@types';

setupTestDb();

/** The tasks section, off the manifest — the way `account` and `users` reach it. */
const [{ collect }] = tasksModule.personalData;

/** The erase hook, off the manifest — the way `users` reaches it. */
const erase = (
    subject: Parameters<PersonalDataEraser>[0],
    session: Parameters<PersonalDataEraser>[1]
): Promise<void> => {
    const hook = tasksModule.personalData[0].erase;
    if (!hook) throw new Error('the tasks section declares no erase hook');
    return Promise.resolve(hook(subject, session)).then(() => undefined);
};

/** The account under test. */
const ACCOUNT_ID = '65dc8a99604c307b702b5ccc';

/** Another account, whose tasks must survive. */
const OTHER_ACCOUNT_ID = '65dc8a99604c307b702b5ddd';

/** A subject for the account under test. */
const subject = (emailVerified: boolean) => ({
    userId: ACCOUNT_ID,
    email: 'victim@example.com',
    emailVerified
});

/** Files one task, optionally as a signed-in account. */
const fileTask = (email: string, message: string, subjectId?: string) =>
    taskService.create({ email, subject: 'Hello', message }, subjectId);

/** Every message still stored, sorted. */
const storedMessages = (): Promise<string[]> =>
    taskRepository.findAll({}).then((rows) => rows.map((row) => row.message).toSorted());

/** The valid-looking body of a contact submission. */
const FORM = {
    name: 'Ada',
    email: 'ada@example.com',
    subject: 'A question',
    message: 'Does it come in blue?'
};

describe('POST /tasks records who sent it', () => {
    it('records the signed-in sender’s account as subjectId', async () => {
        const { bearer, user } = await authenticateAs('user');

        const response = await api().post('/tasks').set('Authorization', bearer).send(FORM);

        expect(response.status).toBe(201);
        expect(response.body.subjectId).toBe(String(user._id));
    });

    it('records no account for an anonymous sender', async () => {
        const response = await api().post('/tasks').send(FORM);

        expect(response.status).toBe(201);
        expect(response.body).not.toHaveProperty('subjectId');
    });

    it('files a post with a bad token as anonymous, not a refusal', async () => {
        const response = await api()
            .post('/tasks')
            .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.not-a-valid-signature')
            .send(FORM);

        expect(response.status).toBe(201);
        expect(response.body).not.toHaveProperty('subjectId');
    });
});

/** A system task about a record, optionally about the account under test. */
const systemTask = (link: { type: TaskLinkType; id: string }, extra: object = {}) =>
    taskRepository.create({
        source: TaskSource.system,
        kind: TaskKind.account_review,
        routeSet: 'UserBanning',
        subject: 'Review',
        message: 'A person must look.',
        link,
        subjectId: new Types.ObjectId(ACCOUNT_ID),
        ...extra
    });

describe('erasing the system tasks about a person', () => {
    it('deletes a task that IS the person’s (its record is the account) and detaches one that outlives them', async () => {
        const about = await systemTask({ type: TaskLinkType.user, id: ACCOUNT_ID });
        const order = await systemTask({ type: TaskLinkType.order, id: 'order-1' });

        await withTransaction((session) => erase(subject(true), session));

        expect(await taskRepository.findById(String(about._id))).toBeNull();
        const kept = await taskRepository.findById(String(order._id));
        expect(kept?.subjectId).toBeUndefined();
    });

    it('forgets an erased member of staff as assignee and as the author of notes', async () => {
        const staffId = new Types.ObjectId();
        const worked = await systemTask(
            { type: TaskLinkType.order, id: 'order-2' },
            {
                subjectId: new Types.ObjectId(OTHER_ACCOUNT_ID),
                assigneeId: staffId,
                notes: [{ authorId: staffId, body: 'looked into it', at: new Date() }]
            }
        );

        await withTransaction((session) =>
            erase({ ...subject(true), userId: String(staffId) }, session)
        );

        const after = await taskRepository.findById(String(worked._id));
        expect(after?.assigneeId).toBeUndefined();
        expect(after?.notes[0].authorId).toBeUndefined();
        expect(after?.notes[0].body).toBe('looked into it');
    });
});

describe('erasing a person’s tasks', () => {
    it('deletes what was sent signed in, even under another address and with an unproven account', async () => {
        await fileTask('typed-elsewhere@example.com', 'by id', ACCOUNT_ID);

        await withTransaction((session) => erase(subject(false), session));

        expect(await storedMessages()).toEqual([]);
    });

    it('deletes what was sent under a verified address, including before the account existed', async () => {
        await fileTask('victim@example.com', 'before the account');

        await withTransaction((session) => erase(subject(true), session));

        expect(await storedMessages()).toEqual([]);
    });

    it('keeps another address, another account, and the address match of an unproven account', async () => {
        await fileTask('stranger@example.com', 'a stranger');
        await fileTask('other@example.com', 'another account', OTHER_ACCOUNT_ID);
        await fileTask('victim@example.com', 'the unproven address');

        await withTransaction((session) => erase(subject(false), session));

        expect(await storedMessages()).toEqual([
            'a stranger',
            'another account',
            'the unproven address'
        ]);
    });

    it('deletes an open task and a spam one alike', async () => {
        const open = await fileTask('victim@example.com', 'still open');
        const spam = await taskService.create(
            {
                email: 'victim@example.com',
                subject: 'x',
                message: 'looks like spam',
                website: 'bot'
            },
            ACCOUNT_ID
        );

        await withTransaction((session) => erase(subject(true), session));

        expect(await taskRepository.findById(String(open._id))).toBeNull();
        expect(await taskRepository.findById(String(spam._id))).toBeNull();
    });

    it('rolls back with the transaction', async () => {
        await fileTask('victim@example.com', 'must survive a rollback', ACCOUNT_ID);

        await expect(
            withTransaction((session) =>
                erase(subject(true), session).then(() => {
                    throw new Error('a later hook failed');
                })
            )
        ).rejects.toThrow('a later hook failed');

        expect(await storedMessages()).toEqual(['must survive a rollback']);
    });

    it('removes exactly the set the export lists', async () => {
        await fileTask('victim@example.com', 'by address');
        await fileTask('typed-elsewhere@example.com', 'by id', ACCOUNT_ID);
        await fileTask('stranger@example.com', 'not theirs');
        const before = await storedMessages();

        const exported = ((await collect(subject(true))) as { message: string }[]).map(
            (task) => task.message
        );
        await withTransaction((session) => erase(subject(true), session));

        const after = new Set(await storedMessages());
        const removed = before.filter((message) => !after.has(message));
        expect(removed.toSorted()).toEqual(exported.toSorted());
    });
});
