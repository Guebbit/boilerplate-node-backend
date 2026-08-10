/**
 * Contract tests for /feedback.
 *
 * The only resource with a genuinely public write endpoint (`POST /feedback/contact`, `security: []`)
 * sitting next to two admin-only ones. That mix is what this suite is really guarding: the public
 * response must not carry admin fields it was never meant to expose, and the admin routes must
 * answer 401/403 rather than leaking a list.
 *
 * Records are created through the public endpoint rather than a factory — there is no feedback
 * factory, and going through the route means the payload under assertion is the one the
 * application actually produces.
 */
import '../helpers/contract';
import { setupTestDb } from '../helpers/setup-test-db';
import { api, authenticateAs } from '../helpers/http';

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
        const { name, ...withoutName } = CONTACT_PAYLOAD;
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
        const { message, ...withoutMessage } = CONTACT_PAYLOAD;
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
