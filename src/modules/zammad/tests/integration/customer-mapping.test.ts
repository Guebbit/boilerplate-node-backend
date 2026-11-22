/**
 * @module
 * Which customer a ticket belongs to: the address alone for a guest, and the account only under
 * the signed-in-sender rule (signed in, and the typed address is the account's verified one).
 */

import { setupTestDb } from '@tests/setup-test-db';
import { taskService } from '@modules/tasks';
import { createUser } from '@modules/users/tests/factories';
import { zammadService } from '../../services';
import { zammadCustomerModel } from '../../model';
import { upsertCustomer } from '../../repository';
import { useZammad } from '../harness';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn().mockResolvedValue(undefined)
}));

setupTestDb();

/** The stub of the case that is running. */
const zammad = useZammad();

/** Send one message as `subjectId` (or a guest) and let it land. */
const send = (email: string, subjectId?: string) =>
    taskService
        .submit({ email, subject: 'Hello', message: 'Anyone there?' }, subjectId)
        .then(() => zammadService.settleHandovers());

describe('the signed-in-sender rule', () => {
    it('links a verified account whose own address was typed, and maps its customer', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });

        await send('ada@example.com', user.id);

        const [ticket] = zammad().tickets;
        expect(ticket.body).toMatchObject({
            customer_id: 'guess:ada@example.com',
            shop_sender_verified: true,
            shop_account: expect.stringContaining(user.id)
        });
        expect(await zammadCustomerModel.find().lean()).toMatchObject([
            { userId: user._id, zammadUserId: ticket.customer_id }
        ]);
    });

    it('sends the verified address on every message, never the stored id, and keeps the mapping on the customer used', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        await send('ada@example.com', user.id);
        const [first] = zammad().tickets;

        await send('ada@example.com', user.id);

        const second = zammad().tickets[1];
        expect(second.body).toMatchObject({ customer_id: 'guess:ada@example.com' });
        expect(second.body).not.toHaveProperty('customer');
        expect(second.customer_id).toBe(first.customer_id);
        expect(await zammadCustomerModel.countDocuments()).toBe(1);
    });

    it('lands on the customer matching the verified address when the stored id is dead or a stranger’s', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        const stranger = zammad().addUser({ id: 777, email: 'stranger@example.com' });
        // A restore left the mapping pointing at an id that now belongs to somebody else.
        await upsertCustomer(user.id, stranger.id);

        await send('ada@example.com', user.id);

        const [ticket] = zammad().tickets;
        expect(ticket.customer_id).not.toBe(stranger.id);
        expect(zammad().users.get(stranger.id)?.email).toBe('stranger@example.com');
        // The mapping is rewritten to the customer Zammad actually used.
        expect(await zammadCustomerModel.find().lean()).toMatchObject([
            { userId: user._id, zammadUserId: ticket.customer_id }
        ]);
    });

    it('links nothing for an account that never proved its address', async () => {
        const user = await createUser({ email: 'ada@example.com' });

        await send('ada@example.com', user.id);

        expect(zammad().tickets[0].body).toMatchObject({ shop_sender_verified: false });
        expect(zammad().tickets[0].body).not.toHaveProperty('shop_account');
        expect(await zammadCustomerModel.countDocuments()).toBe(0);
    });

    it('links nothing when a signed-in sender typed some other address', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });

        await send('someone-else@example.com', user.id);

        expect(zammad().tickets[0].body).toMatchObject({
            customer_id: 'guess:someone-else@example.com',
            shop_sender_verified: false
        });
        expect(await zammadCustomerModel.countDocuments()).toBe(0);
    });

    it('keys a guest by the address alone', async () => {
        await send('guest@example.com');

        expect(zammad().tickets[0].body).toMatchObject({
            customer_id: 'guess:guest@example.com',
            shop_sender_verified: false
        });
        expect(await zammadCustomerModel.countDocuments()).toBe(0);
    });
});
