/**
 * @module
 * The erasure cascade's `jobs` step: a job held while the broker was down carries an address, never
 * an id, so erasing an account must find it by address — in any status, anywhere in the payload —
 * and take the spooled attachment with it, without touching anyone else's job.
 */

import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { callerContextAs } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { userService } from '@modules/users/services';
import { jobModel, holdJob, parkJob } from '@infrastructure/persistence/job-store';
import { spoolAttachment } from '@infrastructure/adapters/mail-spool';
import { userRepository } from '../../repository';
import { userModel } from '../../model';

setupTestDb();

/** Temp directory the mail spool writes to; removed after each case. */
let spoolRoot: string;

beforeEach(async () => {
    spoolRoot = await mkdtemp(path.join(tmpdir(), 'erasure-held-jobs-'));
    setEnvironment({ NODE_MAIL_SPOOL_PATH: spoolRoot });
});

afterEach(async () => {
    await rm(spoolRoot, { recursive: true, force: true });
});

/** The mail job a producer holds for `to`. */
const mailTo = (to: string, extra: Record<string, unknown> = {}) => ({
    request: { to, subject: 'Hello' },
    templateName: 'welcome',
    data: {},
    ...extra
});

/** Every held job's payload, plain. */
const heldPayloads = () =>
    jobModel
        .find()
        .lean()
        .exec()
        .then((rows) => rows.map(({ payload }) => payload));

/** The hard delete an administrator runs. */
const hardDelete = (id: string) => userService.removeById(id, true, callerContextAs('admin'));

describe('erasing an account removes the jobs held for it', () => {
    it('removes a pending and a dead job, whatever the casing of the address', async () => {
        const user = await createUser({ email: 'victim@example.com' });
        await holdJob('worker.email.send', mailTo('Victim@Example.com'));
        await holdJob('worker.email.send', mailTo('victim@example.com'));
        await jobModel.updateOne({}, { $set: { status: 'dead' } }).exec();

        await hardDelete(user.id);

        expect(await heldPayloads()).toEqual([]);
    });

    it('finds the address in replyTo and in the template data, not only in to', async () => {
        const user = await createUser({ email: 'victim@example.com' });
        await holdJob('worker.email.send', {
            request: { to: 'support@shop.test', replyTo: 'victim@example.com' },
            templateName: 'contact',
            data: {}
        });
        await holdJob('worker.email.send', {
            request: { to: 'support@shop.test' },
            templateName: 'notice',
            data: { body: 'Write back to <victim@example.com>.' }
        });

        await hardDelete(user.id);

        expect(await heldPayloads()).toEqual([]);
    });

    it('also finds the address a change was waiting on and the one it replaced', async () => {
        const user = await createUser({
            email: 'current@example.com',
            pendingEmail: 'next@example.com'
        });
        // Not an override: the undo link's address is written only by a completed email change.
        await userModel.updateOne({ _id: user._id }, { previousEmail: 'old@example.com' }).exec();
        await holdJob('worker.email.send', mailTo('next@example.com'));
        await holdJob('worker.email.send', mailTo('old@example.com'));

        await hardDelete(user.id);

        expect(await heldPayloads()).toEqual([]);
    });

    it('leaves another person’s job, including an address that only contains the erased one', async () => {
        const user = await createUser({ email: 'bob@example.com' });
        const others = [
            mailTo('abob@example.com'),
            mailTo('bob@example.com.au'),
            mailTo('bob@example.company'),
            mailTo('someone@example.com')
        ];
        for (const payload of others) await holdJob('worker.email.send', payload);

        await hardDelete(user.id);

        const held = await heldPayloads();
        const recipients = held.map((payload) => (payload as ReturnType<typeof mailTo>).request.to);
        expect(recipients.toSorted()).toEqual(others.map(({ request }) => request.to).toSorted());
    });

    it('removes the job’s spooled attachment once the erasure has committed', async () => {
        const user = await createUser({ email: 'victim@example.com' });
        const key = await spoolAttachment(Buffer.from('invoice'), 'pdf');
        const keep = await spoolAttachment(Buffer.from('other'), 'pdf');
        await holdJob(
            'worker.email.send',
            mailTo('victim@example.com', {
                request: {
                    to: 'victim@example.com',
                    attachments: [{ filename: 'invoice.pdf', key }]
                }
            })
        );

        await hardDelete(user.id);

        expect(await readdir(spoolRoot)).toEqual([keep]);
    });

    it('keeps the jobs and the attachment when the delete fails after the jobs step', async () => {
        const user = await createUser({ email: 'victim@example.com' });
        const key = await spoolAttachment(Buffer.from('invoice'), 'pdf');
        await holdJob(
            'worker.email.send',
            mailTo('victim@example.com', {
                request: { to: 'victim@example.com', attachments: [{ filename: 'a.pdf', key }] }
            })
        );
        // The real erasers run; the document delete, which comes after the jobs step, fails.
        jest.spyOn(userRepository, 'deleteOne').mockRejectedValueOnce(
            new Error('the delete failed')
        );

        await expect(hardDelete(user.id)).rejects.toThrow('the delete failed');

        expect(await heldPayloads()).toHaveLength(1);
        expect(await readdir(spoolRoot)).toEqual([key]);
        expect(await userRepository.findById(user.id)).not.toBeNull();
    });

    it.each([
        ['a newline', 'Write back to:\nvictim@example.com'],
        ['a tab', 'Write back to:\tvictim@example.com']
    ])('finds the address in free text after %s', async (_name, body) => {
        const user = await createUser({ email: 'victim@example.com' });
        await holdJob('worker.email.send', {
            request: { to: 'support@shop.test' },
            templateName: 'contact',
            data: { body }
        });

        await hardDelete(user.id);

        expect(await heldPayloads()).toEqual([]);
    });

    it('removes a job parked dead by a worker, not only one built by hand', async () => {
        const user = await createUser({ email: 'victim@example.com' });
        await holdJob('worker.email.send', mailTo('victim@example.com'));
        const row = await jobModel.findOne().exec();
        if (!row) throw new Error('the job was not held');
        await parkJob(row, 'refused');

        await hardDelete(user.id);

        expect(await heldPayloads()).toEqual([]);
    });
});
