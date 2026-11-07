/**
 * @module
 * An erasure that deletes contact messages tells the support mailbox, once, by `[#ref]` alone:
 * the mailbox copies are not the shop's to delete. Driven through the real erasure doors of
 * `users`, so the notice is proven to survive the transaction and the deferred step.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { callerContextAs } from '@tests/callers';
import { systemCallerContext } from '@kernel/permissions';
import type { UserDocument } from '@modules/users';
import { createUser, eraseAsInactive, eraseAsScheduled } from '@modules/users/tests/factories';
import { userService } from '@modules/users';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { resetDomainEvents } from '@kernel/events';
import { registerModules } from '@kernel/registry';
import { enabledModules } from '../../../../modules';
import { taskService } from '../../service';
import { taskRef } from '../../emails';
import { findAllTasks } from '../factories';

// The queue, not the copy.
jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

beforeEach(() => {
    mockEnqueueEmail.mockReset();
    mockEnqueueEmail.mockResolvedValue(undefined);
    setEnvironment({ NODE_SUPPORT_EMAIL: 'desk@example.com' });
    resetDomainEvents();
    registerModules(enabledModules);
});

afterEach(() => resetDomainEvents());

/** A message from the account, attached to it. */
const messageFrom = (userId: string, email: string, subject: string) =>
    taskService.create({ email, subject, message: 'Private words about my health.' }, userId);

/** The erasure notices queued so far. */
const notices = () =>
    mockEnqueueEmail.mock.calls.filter(([, template]) => template === 'tasks.erasure-notice');

/** The four ways an account is erased, each through its own door. */
const doors: [string, (user: UserDocument) => Promise<unknown>][] = [
    [
        'an administrator hard-deleting it',
        (user) => userService.removeById(user.id, true, callerContextAs('admin'))
    ],
    ['the scheduled purge after the owner asked', (user) => eraseAsScheduled(user)],
    ['the inactivity reaper hard-deleting it', (user) => eraseAsInactive(user)],
    [
        'the erasure ledger replayed on a restored database',
        (user) => userService.eraseAgain(user.id, new Date(), systemCallerContext('User'))
    ]
];

describe.each(doors)('erased by %s', (_name, erase) => {
    it('mails the support mailbox the refs of the deleted messages and nothing else', async () => {
        const user = await createUser({ email: 'victim@example.com' });
        const first = await messageFrom(user.id, 'victim@example.com', 'Secret subject one');
        const second = await messageFrom(user.id, 'victim@example.com', 'Secret subject two');

        await erase(user);

        expect(await findAllTasks()).toEqual([]);
        expect(notices()).toHaveLength(1);
        const [envelope, , data] = notices()[0];
        const refs = [first, second].map(({ _id }) => `[#${taskRef(String(_id))}]`);
        for (const ref of refs) expect(envelope.subject).toContain(ref);
        const everything = JSON.stringify([envelope, data]);
        for (const secret of ['victim@example.com', 'Secret subject', 'health', user.username])
            expect(everything).not.toContain(secret);
        expect(envelope.to).toBe('desk@example.com');
    });

    it('sends nothing when the account had no messages', async () => {
        const user = await createUser({ email: 'quiet@example.com' });

        await erase(user);

        expect(notices()).toEqual([]);
    });
});
