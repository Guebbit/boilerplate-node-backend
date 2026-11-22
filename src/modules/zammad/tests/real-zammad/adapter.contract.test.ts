/**
 * The adapter against a REAL Zammad.
 *
 * `../integration/*` run the adapter against a stub that models what we believe Zammad does. Each
 * case here is one only a booted Zammad can answer: does it keep our custom fields, does the
 * `condition` search on `request_ref` find the ticket (public docs do not describe it), does
 * `customer_id: "guess:<email>"` make and then reuse a customer, and does it refuse a customer
 * update to another customer's address.
 *
 * Needs `NODE_TEST_ZAMMAD_URL`, `NODE_TEST_ZAMMAD_TOKEN` (the integration user's token, with
 * `ticket.agent`) and `NODE_TEST_ZAMMAD_ADMIN_TOKEN` (an Admin's, for the field setup and for
 * creating the two throwaway customers). An unset variable FAILS the run: a skipped contract suite
 * is not a green one. `npm run test:zammad`.
 *
 * @see docs/modules/zammad.md#setup
 */

import { randomUUID } from 'node:crypto';
import { setEnvironment } from '@tests/environment';
import { createTicket, findTicketByRef, updateCustomer } from '../../client';
import { ensureTicketFields } from '../../services/setup';

/**
 * Read a required variable, failing loudly when it is not there.
 *
 * @param name - the variable
 * @throws {Error} when it is unset
 */
const required = (name: string): string => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is not set: this suite needs a booted Zammad.`);
    return value;
};

/** Make a Zammad customer through the admin token; returns its id. */
const makeCustomer = (adminToken: string, url: string, email: string): Promise<number> =>
    fetch(`${url}/api/v1/users`, {
        method: 'POST',
        headers: {
            Authorization: `Token token=${adminToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            email,
            firstname: 'Contract',
            lastname: 'Test',
            roles: ['Customer']
        })
    })
        .then((response) => response.json() as Promise<{ id: number }>)
        .then(({ id }) => id);

describe('the Zammad adapter against a real Zammad', () => {
    const url = required('NODE_TEST_ZAMMAD_URL');
    const token = required('NODE_TEST_ZAMMAD_TOKEN');
    const adminToken = required('NODE_TEST_ZAMMAD_ADMIN_TOKEN');
    const group = process.env.NODE_TEST_ZAMMAD_GROUP ?? 'Users';
    const run = randomUUID().slice(0, 8);

    beforeAll(async () => {
        await ensureTicketFields({ url, token: adminToken, group });
    });

    beforeEach(() => {
        setEnvironment({
            NODE_ZAMMAD_URL: url,
            NODE_ZAMMAD_API_TOKEN: token,
            NODE_ZAMMAD_GROUP: group
        });
    });

    it('keeps request_ref on a created ticket, and finds the ticket by it', async () => {
        const requestRef = `ref-${run}-a`;

        const created = await createTicket({
            customer: { email: `contract-${run}-a@example.com` },
            subject: 'Contract: create',
            message: 'Line one\n<b>not bold</b>',
            category: 'other',
            orderNumber: 'ORD-1',
            senderVerified: false,
            requestRef
        });
        const found = await findTicketByRef(requestRef);

        expect(created.refKept).toBe(true);
        expect(found).toMatchObject({ id: created.id, customerId: created.customerId });
    });

    it('finds nothing for a reference that was never used', async () => {
        await expect(findTicketByRef(`ref-${run}-never`)).resolves.toBeUndefined();
    });

    it('reuses the customer of an address it already made', async () => {
        const email = `contract-${run}-b@example.com`;

        const first = await createTicket({
            customer: { email },
            subject: 'Contract: first',
            message: 'One',
            senderVerified: false,
            requestRef: `ref-${run}-b1`
        });
        const second = await createTicket({
            customer: { email },
            subject: 'Contract: second',
            message: 'Two',
            senderVerified: false,
            requestRef: `ref-${run}-b2`
        });

        expect(second.customerId).toBe(first.customerId);
    });

    it('takes a mapped customer by id', async () => {
        const created = await createTicket({
            customer: { email: `contract-${run}-c@example.com` },
            subject: 'Contract: by email',
            message: 'One',
            senderVerified: false,
            requestRef: `ref-${run}-c1`
        });

        const again = await createTicket({
            customer: { id: created.customerId },
            subject: 'Contract: by id',
            message: 'Two',
            senderVerified: true,
            requestRef: `ref-${run}-c2`
        });

        expect(again.customerId).toBe(created.customerId);
    });

    it('updates a customer, and refuses an address another customer holds', async () => {
        const mine = await makeCustomer(adminToken, url, `contract-${run}-d@example.com`);
        await makeCustomer(adminToken, url, `contract-${run}-e@example.com`);

        await expect(
            updateCustomer(mine, `contract-${run}-d2@example.com`)
        ).resolves.toBeUndefined();
        await expect(updateCustomer(mine, `contract-${run}-e@example.com`)).rejects.toMatchObject({
            status: 422,
            unclear: false
        });
    });
});
