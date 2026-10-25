/**
 * @module
 * Staff cancelling a deletion its owner asked for, `POST /users/{id}/restore`: `users` clears the
 * schedule and announces it, `account` drops the restore link and tells the owner. Over HTTP, with
 * the outbox relayed, since the event is what joins the two modules.
 */

import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { resetDomainEvents } from '@kernel/events';
import { settleOutboxNudges } from '@kernel/outbox';
import { createUser, userRepository } from '@modules/users/tests/factories';
import { plantToken, tokenTypesOf } from '../factories';

/** Every mail the app queued, newest last. */
const mockOutbox: { to?: string; template: string; data: Record<string, unknown> }[] = [];

jest.mock('@infrastructure/adapters/mailer', () => ({
    ...jest.requireActual<typeof import('@infrastructure/adapters/mailer')>(
        '@infrastructure/adapters/mailer'
    ),
    enqueueEmail: jest.fn(
        (envelope: { to?: string }, template: string, data: Record<string, unknown>) => {
            mockOutbox.push({ to: envelope.to, template, data });
            return Promise.resolve();
        }
    )
}));

setupTestDb();

beforeEach(() => {
    registerCheckoutModules();
    mockOutbox.length = 0;
});

afterEach(() => resetDomainEvents());

/** An account its owner scheduled for erasure, with a live restore link. */
const scheduled = async (purgeAt: Date, email = 'tess@example.com') => {
    const user = await createUser({
        email,
        verifiedAt: new Date(),
        deletedAt: new Date(Date.now() - 86_400_000),
        deletedBy: 'owner',
        purgeAt
    });
    await plantToken(user.id, 'account-restore', `restore-${email}`);
    return user;
};

describe('POST /users/{id}/restore on an owner-scheduled account', () => {
    it('restores it, drops the restore link and tells the owner staff did it', async () => {
        const { bearer } = await authenticateAs('admin');
        const user = await scheduled(new Date(Date.now() + 5 * 86_400_000));

        const response = await api().post(`/users/${user.id}/restore`).set('Authorization', bearer);
        await settleOutboxNudges();

        expect(response.status).toBe(200);
        const stored = await userRepository.findById(user.id);
        expect(stored?.deletedAt).toBeUndefined();
        expect(stored?.purgeAt).toBeUndefined();
        expect(await tokenTypesOf(user.id)).toEqual([]);
        const mail = mockOutbox.find(({ template }) => template === 'account.restored');
        expect(mail?.to).toBe('tess@example.com');
        expect(mail?.data.staffNote).not.toBe('');
    });

    it('shows the schedule to staff, and offers restore only inside the grace', async () => {
        const { bearer } = await authenticateAs('admin');
        const inside = await scheduled(new Date(Date.now() + 5 * 86_400_000), 'inside@example.com');
        const past = await scheduled(new Date(Date.now() - 1000), 'past@example.com');

        const rows = await api().get('/users?pageSize=50').set('Authorization', bearer);

        const { items } = rows.body as {
            items: { email: string; purgeAt?: string; actions: { restore: boolean } }[];
        };
        const byEmail = new Map(items.map((row) => [row.email, row]));
        expect(byEmail.get(inside.email)?.purgeAt).toBe(inside.purgeAt?.toISOString());
        expect(byEmail.get(inside.email)?.actions.restore).toBe(true);
        expect(byEmail.get(past.email)?.actions.restore).toBe(false);
    });

    it('answers 403 to a caller without delete:User, leaving the schedule alone', async () => {
        const { bearer } = await authenticateAsRole('support');
        const user = await scheduled(new Date(Date.now() + 5 * 86_400_000));

        const response = await api().post(`/users/${user.id}/restore`).set('Authorization', bearer);

        expect(response.status).toBe(403);
        const stored = await userRepository.findById(user.id);
        expect(stored?.deletedBy).toBe('owner');
    });
});
