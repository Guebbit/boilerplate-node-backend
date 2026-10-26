/**
 * @module
 * Contract tests for /tickets: the only resource with a genuinely public write endpoint
 * (`POST /tickets`, `security: []`) next to two admin-only ones. Guards that the public
 * response carries no admin fields, and the admin routes 401/403 rather than leak a list. Records
 * are created through the public endpoint (no fixture builder exists) so the payload under
 * assertion is what the app actually produces.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { MISSING_ID } from '@tests/ids';

setupTestDb();

const CONTACT_PAYLOAD = {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    subject: 'Broken checkout',
    message: 'The checkout button does nothing on mobile.'
};

/** Creates a ticket through the public endpoint and returns its id. */
const createContactTicket = async () => {
    const response = await api().post('/tickets').send(CONTACT_PAYLOAD);

    if (response.status !== 201)
        throw new Error(
            `tickets setup failed: POST /tickets returned ${response.status} — ` +
                JSON.stringify(response.body)
        );

    return response.body.id as string;
};

describe('POST /tickets', () => {
    it('matches the contract for a valid submission', async () => {
        const response = await api().post('/tickets').send(CONTACT_PAYLOAD);

        expect(response.status).toBe(201);
    });

    it('starts a new request in the `new` status', async () => {
        const response = await api().post('/tickets').send(CONTACT_PAYLOAD);

        expect(response.body.status).toBe('new');
    });

    it('keeps the category and order number a visitor chose, and echoes them back', async () => {
        const response = await api()
            .post('/tickets')
            .send({ ...CONTACT_PAYLOAD, category: 'privacy', orderNumber: 'ORD-9' });

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({ category: 'privacy', orderNumber: 'ORD-9' });
    });

    it('422s a category outside the list', async () => {
        const response = await api()
            .post('/tickets')
            .send({ ...CONTACT_PAYLOAD, category: 'refunds-please' });

        expect(response.status).toBe(422);
    });

    it('matches the contract without the optional name', async () => {
        const { name: _name, ...withoutName } = CONTACT_PAYLOAD;
        const response = await api().post('/tickets').send(withoutName);

        expect(response.status).toBe(201);
    });

    it('matches the error contract for a malformed email', async () => {
        const response = await api()
            .post('/tickets')
            .send({ ...CONTACT_PAYLOAD, email: 'not-an-email' });

        expect(response.status).toBe(422);
    });

    it('matches the error contract for a missing message', async () => {
        const { message: _message, ...withoutMessage } = CONTACT_PAYLOAD;
        const response = await api().post('/tickets').send(withoutMessage);

        expect(response.status).toBe(422);
    });

    // `maxLength` lives in openapi.yaml itself, so the generated schema is what enforces it —
    // this pins the limit end to end.
    it('matches the error contract for a message past the 5000-character limit', async () => {
        const response = await api()
            .post('/tickets')
            .send({ ...CONTACT_PAYLOAD, message: 'a'.repeat(5001) });

        expect(response.status).toBe(422);
    });
});

describe('POST /tickets — the contract bounds the form restates nothing of', () => {
    // The controller trims, then pipes into the generated field: its ceilings must survive that.
    it('refuses an email past the contract ceiling of 254 characters', async () => {
        const response = await api()
            .post('/tickets')
            .send({ ...CONTACT_PAYLOAD, email: `${'a'.repeat(250)}@example.com` });

        expect(response.status).toBe(422);
    });

    it.each(['subject', 'message'])('refuses a whitespace-only %s as empty', async (field) => {
        const response = await api()
            .post('/tickets')
            .send({ ...CONTACT_PAYLOAD, [field]: '   ' });

        expect(response.status).toBe(422);
        expect(response.body.errors[0].details).toEqual({ field });
    });

    it('trims the text it keeps', async () => {
        const response = await api()
            .post('/tickets')
            .send({ ...CONTACT_PAYLOAD, subject: '  Broken checkout  ' });

        expect(response.status).toBe(201);
        expect(response.body.subject).toBe('Broken checkout');
    });
});

describe('GET /tickets', () => {
    it('matches the contract for an admin caller', async () => {
        const { bearer } = await authenticateAs('admin');
        await createContactTicket();
        const response = await api().get('/tickets').set('Authorization', bearer);

        expect(response.status).toBe(200);
    });

    it('matches the contract when the list is empty', async () => {
        const { bearer } = await authenticateAs('admin');
        const response = await api().get('/tickets').set('Authorization', bearer);

        expect(response.body.items).toHaveLength(0);
    });

    // Without its own pagination validation this endpoint would silently clamp `?pageSize=500`
    // to 100 while the other three search endpoints answer 422 for the very same request.
    it.each(['pageSize=500', 'page=0'])(
        'rejects out-of-range pagination like every other search endpoint (%s)',
        async (queryString) => {
            const { bearer } = await authenticateAs('admin');
            const response = await api()
                .get(`/tickets?${queryString}`)
                .set('Authorization', bearer);

            expect(response.status).toBe(422);
            expect(response.type).toBe('application/problem+json');
        }
    );

    it('filters by category', async () => {
        const { bearer } = await authenticateAs('admin');
        await api()
            .post('/tickets')
            .send({ ...CONTACT_PAYLOAD, category: 'privacy', email: 'one@example.com' });
        await api()
            .post('/tickets')
            .send({ ...CONTACT_PAYLOAD, category: 'order', email: 'two@example.com' });

        const response = await api().get('/tickets?category=privacy').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.items).toHaveLength(1);
        expect(response.body.items[0].category).toBe('privacy');
    });

    it('422s a status outside the enum instead of matching every row', async () => {
        const { bearer } = await authenticateAs('admin');
        await createContactTicket();

        const response = await api().get('/tickets?status=archived').set('Authorization', bearer);

        expect(response.status).toBe(422);
    });
});

/*
 * The DTO form of the list above. `GET /tickets` cannot read filters from a body — no browser
 * sends one on a GET. `POST /tickets/search` is the sibling that carries what a body would;
 * these assert it does.
 */
describe('POST /tickets/search', () => {
    it('matches the contract', async () => {
        const { bearer } = await authenticateAs('admin');
        await createContactTicket();
        const response = await api()
            .post('/tickets/search')
            .set('Authorization', bearer)
            .send({ page: 1, pageSize: 10 });

        expect(response.status).toBe(200);
    });

    it('filters on a body field, which is the whole point of the route', async () => {
        const { bearer } = await authenticateAs('admin');
        await createContactTicket();
        const response = await api()
            .post('/tickets/search')
            .set('Authorization', bearer)
            .send({ status: 'resolved' });

        expect(response.status).toBe(200);
        expect(response.body.items).toHaveLength(0);
    });

    // The same bounds as the query form, from the same shared schema — the two spellings of one
    // search cannot disagree about what a legal page size is.
    it.each([{ pageSize: 500 }, { page: 0 }])(
        'rejects out-of-range pagination exactly as the query form does (%p)',
        async (body) => {
            const { bearer } = await authenticateAs('admin');
            const response = await api()
                .post('/tickets/search')
                .set('Authorization', bearer)
                .send(body);

            expect(response.status).toBe(422);
            expect(response.type).toBe('application/problem+json');
        }
    );

    it('422s a status outside the enum, exactly as the query form does', async () => {
        const { bearer } = await authenticateAs('admin');
        await createContactTicket();

        const response = await api()
            .post('/tickets/search')
            .set('Authorization', bearer)
            .send({ status: 'archived' });

        expect(response.status).toBe(422);
    });
});

describe('GET /tickets/{id}', () => {
    it('matches the contract for the admin who may read the list', async () => {
        const { bearer } = await authenticateAs('admin');
        const id = await createContactTicket();

        const response = await api().get(`/tickets/${id}`).set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ id, subject: CONTACT_PAYLOAD.subject });
    });

    it('answers 404 for a request that does not exist and for a malformed id', async () => {
        const { bearer } = await authenticateAs('admin');

        const missing = await api().get(`/tickets/${MISSING_ID}`).set('Authorization', bearer);
        const malformed = await api().get('/tickets/not-an-id').set('Authorization', bearer);

        expect([missing.status, malformed.status]).toEqual([404, 404]);
    });

    it('refuses a caller without read:Ticket with 403, and a guest with 401', async () => {
        const id = await createContactTicket();
        const { bearer } = await authenticateAs('user');

        const shopper = await api().get(`/tickets/${id}`).set('Authorization', bearer);
        const guest = await api().get(`/tickets/${id}`);

        expect([shopper.status, guest.status]).toEqual([403, 401]);
    });
});

describe('PATCH /tickets/{id}', () => {
    // A triage state is two fields of a bigger record, so no PUT is offered (RFC 9110 §15.5.6).
    it('answers a PUT 405 with the methods it does allow', async () => {
        const { bearer } = await authenticateAs('admin');
        const id = await createContactTicket();
        const response = await api()
            .put(`/tickets/${id}`)
            .set('Authorization', bearer)
            .send({ status: 'resolved' });

        expect(response.status).toBe(405);
        expect(response.headers.allow).toBe('DELETE, GET, HEAD, PATCH');
    });

    it('matches the contract when changing status and notes together', async () => {
        const { bearer } = await authenticateAs('admin');
        const id = await createContactTicket();
        const response = await api()
            .patch(`/tickets/${id}`)
            .set('Authorization', bearer)
            .send({ status: 'resolved', adminNotes: 'Fixed in 2.1.1' });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('resolved');
        expect(response.body.adminNotes).toBe('Fixed in 2.1.1');
    });

    it('matches the error contract for a status outside the enum', async () => {
        const { bearer } = await authenticateAs('admin');
        const id = await createContactTicket();
        const response = await api()
            .patch(`/tickets/${id}`)
            .set('Authorization', bearer)
            .send({ status: 'archived' });

        expect(response.status).toBe(422);
    });

    it('leaves adminNotes unchanged when the PATCH body omits it', async () => {
        const { bearer } = await authenticateAs('admin');
        const id = await createContactTicket();
        await api()
            .patch(`/tickets/${id}`)
            .set('Authorization', bearer)
            .send({ adminNotes: 'first pass' });

        const response = await api()
            .patch(`/tickets/${id}`)
            .set('Authorization', bearer)
            .send({ status: 'resolved' });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('resolved');
        expect(response.body.adminNotes).toBe('first pass');
    });

    it('clears adminNotes on an explicit null', async () => {
        const { bearer } = await authenticateAs('admin');
        const id = await createContactTicket();
        await api()
            .patch(`/tickets/${id}`)
            .set('Authorization', bearer)
            .send({ adminNotes: 'to be cleared' });

        const response = await api()
            .patch(`/tickets/${id}`)
            .set('Authorization', bearer)
            .send({ adminNotes: null });

        expect(response.status).toBe(200);
        expect(response.body.adminNotes).toBeUndefined();
    });

    it('refuses "" for adminNotes, never a synonym for null', async () => {
        const { bearer } = await authenticateAs('admin');
        const id = await createContactTicket();
        const response = await api()
            .patch(`/tickets/${id}`)
            .set('Authorization', bearer)
            .send({ adminNotes: '' });

        expect(response.status).toBe(422);
    });

    it('matches the error contract for a request that does not exist', async () => {
        const { bearer } = await authenticateAs('admin');
        const response = await api()
            .patch(`/tickets/${MISSING_ID}`)
            .set('Authorization', bearer)
            .send({ status: 'spam' });

        expect(response.status).toBe(404);
    });
});

describe('POST /tickets — honeypot', () => {
    it('writes suspected spam as status "spam", answers 201 either way, and drops the field', async () => {
        const { bearer } = await authenticateAs('admin');
        const response = await api()
            .post('/tickets')
            .send({ ...CONTACT_PAYLOAD, website: 'https://spammer.example' });

        // The bot must learn nothing from the response — same 201 a real submission gets.
        expect(response.status).toBe(201);
        expect(response.body).not.toHaveProperty('website');

        const listed = await api().get('/tickets').set('Authorization', bearer);
        expect(listed.body.items[0].status).toBe('spam');
    });
});

describe('DELETE /tickets/{id}', () => {
    it('matches the contract for an admin caller', async () => {
        const { bearer } = await authenticateAs('admin');
        const id = await createContactTicket();

        const response = await api().delete(`/tickets/${id}`).set('Authorization', bearer);

        expect(response.status).toBe(204);

        const listed = await api().get('/tickets').set('Authorization', bearer);
        expect(listed.body.items).toHaveLength(0);
    });

    it('matches the error contract for a request that does not exist', async () => {
        const { bearer } = await authenticateAs('admin');
        const response = await api().delete(`/tickets/${MISSING_ID}`).set('Authorization', bearer);

        expect(response.status).toBe(404);
    });

    it('answers 404, not 500, for a malformed id', async () => {
        const { bearer } = await authenticateAs('admin');
        const response = await api()
            .delete('/tickets/not-an-object-id')
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });
});

describe('GET /tickets — sort', () => {
    it('orders by email, and answers 422 for a field outside the whitelist', async () => {
        for (const email of ['zed@example.com', 'amy@example.com'])
            await api()
                .post('/tickets')
                .send({ ...CONTACT_PAYLOAD, email });
        const { bearer } = await authenticateAs('admin');

        const up = await api().get('/tickets?sort=email').set('Authorization', bearer);
        const refused = await api().get('/tickets?sort=message').set('Authorization', bearer);

        expect(up.body.items.map((item: { email: string }) => item.email)).toEqual([
            'amy@example.com',
            'zed@example.com'
        ]);
        expect(refused.status).toBe(422);
    });
});
