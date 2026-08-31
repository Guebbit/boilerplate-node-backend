/**
 * @module
 * Contract tests for /feedback: the only resource with a genuinely public write endpoint
 * (`POST /feedback/contact`, `security: []`) next to two admin-only ones. Guards that the public
 * response carries no admin fields, and the admin routes 401/403 rather than leak a list. Records
 * are created through the public endpoint (no fixture builder exists) so the payload under
 * assertion is what the app actually produces.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';

setupTestDb();

/** A valid ObjectId that is guaranteed not to exist — the 404 branch, not the 422 one. */
const MISSING_ID = '65dc8a99604c307b702b5ccc';

const CONTACT_PAYLOAD = {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    subject: 'Broken checkout',
    message: 'The checkout button does nothing on mobile.'
};

/** Creates a feedback request through the public endpoint and returns its id. */
const createFeedbackRequest = async () => {
    const response = await api().post('/feedback/contact').send(CONTACT_PAYLOAD);

    if (response.status !== 201)
        throw new Error(
            `feedback setup failed: POST /feedback/contact returned ${response.status} — ` +
                JSON.stringify(response.body)
        );

    return response.body.data.id as string;
};

describe('POST /feedback/contact', () => {
    it('matches the contract for a valid submission', async () => {
        const response = await api().post('/feedback/contact').send(CONTACT_PAYLOAD);

        expect(response.status).toBe(201);
        expect(response).toSatisfyApiSpec();
    });

    it('starts a new request in the `new` status', async () => {
        const response = await api().post('/feedback/contact').send(CONTACT_PAYLOAD);

        expect(response.body.data.status).toBe('new');
    });

    it('matches the contract without the optional name', async () => {
        const { name: _name, ...withoutName } = CONTACT_PAYLOAD;
        const response = await api().post('/feedback/contact').send(withoutName);

        expect(response.status).toBe(201);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a malformed email', async () => {
        const response = await api()
            .post('/feedback/contact')
            .send({ ...CONTACT_PAYLOAD, email: 'not-an-email' });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a missing message', async () => {
        const { message: _message, ...withoutMessage } = CONTACT_PAYLOAD;
        const response = await api().post('/feedback/contact').send(withoutMessage);

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });
});

describe('GET /feedback', () => {
    it('matches the contract for an admin caller', async () => {
        const { bearer } = await authenticateAs('admin');
        await createFeedbackRequest();
        const response = await api().get('/feedback').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the contract when the list is empty', async () => {
        const { bearer } = await authenticateAs('admin');
        const response = await api().get('/feedback').set('Authorization', bearer);

        expect(response.body.data.items).toHaveLength(0);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().get('/feedback');

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });

    // Without its own pagination validation this endpoint would silently clamp `?pageSize=500`
    // to 100 while the other three search endpoints answer 422 for the very same request.
    it.each(['pageSize=500', 'page=0'])(
        'rejects out-of-range pagination like every other search endpoint (%s)',
        async (queryString) => {
            const { bearer } = await authenticateAs('admin');
            const response = await api()
                .get(`/feedback?${queryString}`)
                .set('Authorization', bearer);

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
            expect(response).toSatisfyApiSpec();
        }
    );

    it('matches the error contract for a non-admin caller', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api().get('/feedback').set('Authorization', bearer);

        expect(response.status).toBe(403);
        expect(response).toSatisfyApiSpec();
    });
});

/*
 * The DTO form of the list above. It exists because `GET /feedback` used to declare a JSON body
 * and read filters from it — a body no browser will send, and one `setCache` cannot key on, so
 * two different searches shared a cached page. These assert the sibling carries what the body was
 * claiming to.
 */
describe('POST /feedback/search', () => {
    it('matches the contract', async () => {
        const { bearer } = await authenticateAs('admin');
        await createFeedbackRequest();
        const response = await api()
            .post('/feedback/search')
            .set('Authorization', bearer)
            .send({ page: 1, pageSize: 10 });

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });

    it('filters on a body field, which is the whole point of the route', async () => {
        const { bearer } = await authenticateAs('admin');
        await createFeedbackRequest();
        const response = await api()
            .post('/feedback/search')
            .set('Authorization', bearer)
            .send({ status: 'resolved' });

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(0);
        expect(response).toSatisfyApiSpec();
    });

    // The same bounds as the query form, from the same shared schema — the two spellings of one
    // search cannot disagree about what a legal page size is.
    it.each([{ pageSize: 500 }, { page: 0 }])(
        'rejects out-of-range pagination exactly as the query form does (%p)',
        async (body) => {
            const { bearer } = await authenticateAs('admin');
            const response = await api()
                .post('/feedback/search')
                .set('Authorization', bearer)
                .send(body);

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
            expect(response).toSatisfyApiSpec();
        }
    );

    it('matches the error contract for a non-admin caller', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api().post('/feedback/search').set('Authorization', bearer).send({});

        expect(response.status).toBe(403);
        expect(response).toSatisfyApiSpec();
    });
});

describe('PUT /feedback/{id}', () => {
    it('matches the contract when updating status and notes', async () => {
        const { bearer } = await authenticateAs('admin');
        const id = await createFeedbackRequest();
        const response = await api()
            .put(`/feedback/${id}`)
            .set('Authorization', bearer)
            .send({ status: 'resolved', adminNotes: 'Fixed in 2.1.1' });

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('resolved');
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a status outside the enum', async () => {
        const { bearer } = await authenticateAs('admin');
        const id = await createFeedbackRequest();
        const response = await api()
            .put(`/feedback/${id}`)
            .set('Authorization', bearer)
            .send({ status: 'archived' });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a request that does not exist', async () => {
        const { bearer } = await authenticateAs('admin');
        const response = await api()
            .put(`/feedback/${MISSING_ID}`)
            .set('Authorization', bearer)
            .send({ status: 'spam' });

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().put(`/feedback/${MISSING_ID}`).send({ status: 'spam' });

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a non-admin caller', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api()
            .put(`/feedback/${MISSING_ID}`)
            .set('Authorization', bearer)
            .send({ status: 'spam' });

        expect(response.status).toBe(403);
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /feedback/contact — honeypot', () => {
    it('writes suspected spam as status "spam", answers 201 either way, and drops the field', async () => {
        const { bearer } = await authenticateAs('admin');
        const response = await api()
            .post('/feedback/contact')
            .send({ ...CONTACT_PAYLOAD, website: 'https://spammer.example' });

        // The bot must learn nothing from the response — same 201 a real submission gets.
        expect(response.status).toBe(201);
        expect(response).toSatisfyApiSpec();
        expect(response.body.data).not.toHaveProperty('website');

        const listed = await api().get('/feedback').set('Authorization', bearer);
        expect(listed.body.data.items[0].status).toBe('spam');
    });
});

describe('DELETE /feedback/{id}', () => {
    it('matches the contract for an admin caller', async () => {
        const { bearer } = await authenticateAs('admin');
        const id = await createFeedbackRequest();

        const response = await api().delete(`/feedback/${id}`).set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();

        const listed = await api().get('/feedback').set('Authorization', bearer);
        expect(listed.body.data.items).toHaveLength(0);
    });

    it('matches the error contract for a request that does not exist', async () => {
        const { bearer } = await authenticateAs('admin');
        const response = await api().delete(`/feedback/${MISSING_ID}`).set('Authorization', bearer);

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });

    it('answers 404, not 500, for a malformed id', async () => {
        const { bearer } = await authenticateAs('admin');
        const response = await api()
            .delete('/feedback/not-an-object-id')
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().delete(`/feedback/${MISSING_ID}`);

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a non-admin caller', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api().delete(`/feedback/${MISSING_ID}`).set('Authorization', bearer);

        expect(response.status).toBe(403);
        expect(response).toSatisfyApiSpec();
    });
});
