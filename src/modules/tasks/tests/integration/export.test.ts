/**
 * @module
 * The tasks section of a data export. A person owns the tasks sent while signed in as their
 * account (by id, whatever address was typed) and the tasks sent under their address, but only
 * once the account PROVED the address: anyone can sign up with a stranger's address, and without
 * the proof "export my data" would hand them every message that stranger ever sent (GDPR
 * Art. 12(6): verify identity before disclosing).
 */

import { setupTestDb } from '@tests/setup-test-db';
import { taskService } from '@modules/tasks/service';
import tasksModule from '@modules/tasks/module';
import { taskRepository } from '@modules/tasks/repository';
import { callerContextAs } from '@tests/callers';
import { Types } from 'mongoose';
import { TaskKind, TaskLinkType, TaskSource } from '@types';

setupTestDb();

/** The tasks section's own `collect`, off the manifest — the way `account` reaches it. */
const [{ collect }] = tasksModule.personalData;

/** A member of staff, who resolves and annotates. */
const admin = callerContextAs('admin');

/** The account under test. */
const ACCOUNT_ID = '65dc8a99604c307b702b5ccc';

/** Another account, to prove the id match is exact. */
const OTHER_ACCOUNT_ID = '65dc8a99604c307b702b5ddd';

/** A subject with the address a task was filed under. */
const subject = (emailVerified: boolean) => ({
    userId: ACCOUNT_ID,
    email: 'victim@example.com',
    emailVerified
});

/** Files one task under an address, optionally as a signed-in account. */
const fileTask = (email = 'victim@example.com', subjectId?: string, message = 'my complaint') =>
    taskService.create({ email, subject: 'A complaint', message, name: 'Victim' }, subjectId);

/** The messages an export carries for a subject. */
const exportedMessages = (emailVerified: boolean): Promise<string[]> =>
    collect(subject(emailVerified)).then((section) =>
        (section as { message: string }[]).map((task) => task.message).toSorted()
    );

describe('the tasks section of an export', () => {
    it('includes the tasks filed under the address of an account that proved it', async () => {
        await fileTask();

        expect(await exportedMessages(true)).toEqual(['my complaint']);
    });

    it('includes a task sent before the account existed, as long as the address is proven', async () => {
        // Filed anonymously (no subjectId) — the account was created afterwards.
        await fileTask('victim@example.com', undefined, 'sent before signing up');

        expect(await exportedMessages(true)).toEqual(['sent before signing up']);
    });

    it('includes a task sent signed in with ANOTHER typed address, even when the account is unproven', async () => {
        await fileTask('typed-elsewhere@example.com', ACCOUNT_ID, 'sent while signed in');

        expect(await exportedMessages(false)).toEqual(['sent while signed in']);
        expect(await exportedMessages(true)).toEqual(['sent while signed in']);
    });

    it('leaves out the address match while the account is unproven', async () => {
        await fileTask('victim@example.com', undefined, 'under the address');
        await fileTask('typed-elsewhere@example.com', ACCOUNT_ID, 'by id');

        expect(await exportedMessages(false)).toEqual(['by id']);
    });

    it('never includes another account or another address', async () => {
        await fileTask('stranger@example.com', undefined, 'a stranger');
        await fileTask('other@example.com', OTHER_ACCOUNT_ID, 'another account');

        expect(await exportedMessages(true)).toEqual([]);
    });

    it('answers an empty array, never nothing: the section is always present', async () => {
        expect(await collect(subject(true))).toEqual([]);
        expect(await collect(subject(false))).toEqual([]);
    });

    it('exports the category and order number the filer gave: their own words', async () => {
        await taskService.create({
            email: 'victim@example.com',
            subject: 'About my order',
            message: 'where is it',
            category: 'other',
            orderNumber: 'ORD-7'
        });

        const section = (await collect(subject(true))) as object[];

        expect(section[0]).toMatchObject({ category: 'other', orderNumber: 'ORD-7' });
    });

    it('exports status, respondedAt and the note’s words and time, but never who wrote it', async () => {
        const task = await fileTask();
        await taskService.resolve(String(task._id), admin);
        await taskService.addNote(String(task._id), 'internal assessment', admin);

        const section = (await collect(subject(true))) as object[];

        expect(section[0]).toMatchObject({ status: 'resolved' });
        expect(section[0]).toHaveProperty('respondedAt');
        const [note] = (section[0] as { notes: object[] }).notes;
        expect(note).toMatchObject({ body: 'internal assessment' });
        expect(note).toHaveProperty('at');
        expect(note).not.toHaveProperty('authorId');
    });
});

/** A system task about the account, worked by a member of staff. */
const aboutAccount = () =>
    taskRepository.create({
        source: TaskSource.system,
        kind: TaskKind.export_failed,
        routeSet: 'UserErasure',
        subject: 'A data export failed',
        message: 'Export e1',
        link: { type: TaskLinkType.export, id: 'e1' },
        openKey: 'export_failed:export:e1',
        subjectId: new Types.ObjectId(ACCOUNT_ID),
        assigneeId: new Types.ObjectId(),
        notes: [{ authorId: new Types.ObjectId(), body: 'asked the bank', at: new Date() }]
    });

describe('the systemTasks section of an export', () => {
    const [, { collect: collectSystem }] = tasksModule.personalData;

    it('carries the task and its notes, but never the staff ids or the dedup key', async () => {
        await aboutAccount();

        const [exported] = (await collectSystem(subject(true))) as object[];

        expect(exported).toMatchObject({
            kind: 'export_failed',
            link: { type: 'export', id: 'e1' },
            notes: [{ body: 'asked the bank' }]
        });
        expect(exported).not.toHaveProperty('assigneeId');
        expect(exported).not.toHaveProperty('openKey');
        expect(JSON.stringify(exported)).not.toContain('authorId');
    });

    it('is empty, never absent, and leaves another account’s tasks out', async () => {
        await taskRepository.create({
            source: TaskSource.system,
            kind: TaskKind.account_review,
            routeSet: 'UserBanning',
            subject: 'x',
            message: 'y',
            subjectId: new Types.ObjectId(OTHER_ACCOUNT_ID)
        });

        expect(await collectSystem(subject(true))).toEqual([]);
    });
});
