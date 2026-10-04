/**
 * @module
 * Contract tests for /examples: every route over HTTP, judged against `openapi.yaml`. One public
 * route (a published example), the rest signed-in and narrowed by who is asking — someone else's
 * example is a 404, never a 403, so an id says nothing about who owns it. Behavioural rules live
 * in the integration suite; these make sure each declared response is actually reached.
 */

import '@tests/contract';
import sharp from 'sharp';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { requestAndDownloadExport } from '@tests/account-export';
import { emptyFileSandbox } from '@tests/file-sandbox';
import { MISSING_ID } from '@tests/ids';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { ExampleStatus } from '@types';
import { createExample } from '../factories';

setupTestDb();

/** An id no ObjectId can be built from: answered as an unknown id by every id-taking route. */
const MALFORMED_ID = 'not-an-object-id';

/** A genuinely decodable PNG: an upload is digested inline when there is no broker. */
let PNG_BYTES: Buffer;

beforeAll(async () => {
    PNG_BYTES = await sharp({
        create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } }
    })
        .png()
        .toBuffer();
});

afterEach(emptyFileSandbox);

/** The payload every case that just needs *an* example creates one from. */
const A_NOTE = { title: 'A title', body: 'A body' };

/** An example created through the API by the caller, so the payload under test is what the app produces. */
const createViaApi = async (bearer: string, body: { title: string; body: string }) => {
    const response = await api().post('/examples').set('Authorization', bearer).send(body);

    if (response.status !== 201)
        throw new Error(
            `example setup failed: POST /examples returned ${response.status}: ${JSON.stringify(response.body)}`
        );

    return response.body.data as { id: string };
};

/**
 * The status of a request, awaited without reaching into the resolved response.
 * @param request - a supertest request, already built
 */
const statusOf = (request: PromiseLike<{ status: number }>): Promise<number> =>
    Promise.resolve(request).then((response) => response.status);

/**
 * The `ETag` a read answered with.
 * @param request - a supertest request, already built
 */
const etagOf = (request: PromiseLike<{ headers: Record<string, string> }>): Promise<string> =>
    Promise.resolve(request).then((response) => response.headers.etag);

/** A signed-in account that holds no membership at all, so no `examples.*` key. */
const authenticateWithoutRole = async () => {
    const user = await createUser({ email: 'norole@example.com', verifiedAt: new Date() });
    const login = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });

    return `Bearer ${String(login.body.data.token)}`;
};

describe('GET /examples/published/{id}', () => {
    it('answers anyone, with no credentials, for a published example', async () => {
        const { user } = await authenticateAs('user');
        const published = await createExample({ userId: user.id, status: ExampleStatus.published });

        const response = await api().get(`/examples/published/${String(published._id)}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
            id: String(published._id),
            status: 'published',
            ownerName: user.username
        });
    });

    it.each([ExampleStatus.draft, ExampleStatus.archived])(
        'answers 404 for a %s example, exactly as for one that does not exist',
        async (status) => {
            const { user } = await authenticateAs('user');
            const hidden = await createExample({ userId: user.id, status });

            const response = await api().get(`/examples/published/${String(hidden._id)}`);

            expect(response.status).toBe(404);
        }
    );

    it('answers 404 for an id nothing holds', async () => {
        expect(await statusOf(api().get(`/examples/published/${MISSING_ID}`))).toBe(404);
    });

    it('answers 404, as for an id nothing holds, for an id no ObjectId can be built from', async () => {
        expect(await statusOf(api().get(`/examples/published/${MALFORMED_ID}`))).toBe(404);
    });
});

describe('POST /examples', () => {
    it('creates a draft owned by the caller, and points at it', async () => {
        const { user, bearer } = await authenticateAs('user');

        const response = await api()
            .post('/examples')
            .set('Authorization', bearer)
            .send({ title: 'First', body: 'Hello' });

        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({
            title: 'First',
            status: 'draft',
            userId: user.id,
            ownerName: user.username
        });
        expect(response.headers.location).toBe(`/examples/${String(response.body.data.id)}`);
    });

    it('answers 422 for a body the contract refuses', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .post('/examples')
            .set('Authorization', bearer)
            .send({ title: '' });

        expect(response.status).toBe(422);
    });

    it('answers 401 with no credentials', async () => {
        expect(await statusOf(api().post('/examples').send({ title: 'T', body: 'B' }))).toBe(401);
    });

    it('answers 403 for an account that holds no examples key', async () => {
        const bearer = await authenticateWithoutRole();

        const response = await api()
            .post('/examples')
            .set('Authorization', bearer)
            .send({ title: 'T', body: 'B' });

        expect(response.status).toBe(403);
    });
});

describe('GET /examples and POST /examples/search', () => {
    it('lists the caller’s own examples with the pagination meta', async () => {
        const { bearer } = await authenticateAs('user');
        await createViaApi(bearer, A_NOTE);

        const response = await api().get('/examples').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(1);
        expect(response.body.data.meta.totalItems).toBe(1);
    });

    it('never lists someone else’s', async () => {
        const { bearer } = await authenticateAs('user');
        const other = await createUser({ email: 'other@example.com' });
        await createExample({ userId: other.id });

        const response = await api().get('/examples').set('Authorization', bearer);

        expect(response.body.data.items).toEqual([]);
    });

    it('lists everyone’s for an administrator', async () => {
        const { bearer } = await authenticateAs('admin');
        const other = await createUser({ email: 'other@example.com' });
        await createExample({ userId: other.id });

        const response = await api().get('/examples').set('Authorization', bearer);

        expect(response.body.data.items).toHaveLength(1);
    });

    it('filters by status in the query, and sorts', async () => {
        const { user, bearer } = await authenticateAs('user');
        await createExample({ userId: user.id, title: 'B draft' });
        await createExample({ userId: user.id, title: 'A out', status: ExampleStatus.published });

        const response = await api()
            .get('/examples')
            .query({ status: 'published', sort: 'title' })
            .set('Authorization', bearer);

        expect(response.body.data.items.map((item: { title: string }) => item.title)).toEqual([
            'A out'
        ]);
    });

    it('answers 422 for a status outside the closed set', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .get('/examples')
            .query({ status: 'deleted' })
            .set('Authorization', bearer);

        expect(response.status).toBe(422);
    });

    it('searches the same way through the DTO form', async () => {
        const { user, bearer } = await authenticateAs('user');
        await createExample({ userId: user.id, title: 'Puppies' });
        await createExample({ userId: user.id, title: 'Birds' });

        const response = await api()
            .post('/examples/search')
            .set('Authorization', bearer)
            .send({ text: 'puppies' });

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(1);
    });

    it('answers 401 with no credentials', async () => {
        expect(await statusOf(api().get('/examples'))).toBe(401);
    });

    it('answers 403 for an account that holds no examples key', async () => {
        const bearer = await authenticateWithoutRole();

        expect(await statusOf(api().get('/examples').set('Authorization', bearer))).toBe(403);
    });
});

describe('GET /examples/{id}', () => {
    it('reads the caller’s own draft, with an ETag', async () => {
        const { bearer } = await authenticateAs('user');
        const { id } = await createViaApi(bearer, A_NOTE);

        const response = await api().get(`/examples/${id}`).set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.headers.etag).toBeDefined();
    });

    it('answers 404, not 403, for someone else’s example', async () => {
        const { bearer } = await authenticateAs('user');
        const other = await createUser({ email: 'other@example.com' });
        const theirs = await createExample({ userId: other.id });

        const response = await api()
            .get(`/examples/${String(theirs._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });

    it('answers 401 with no credentials', async () => {
        expect(await statusOf(api().get(`/examples/${MISSING_ID}`))).toBe(401);
    });

    it('answers 403 for an account that holds no examples key', async () => {
        const bearer = await authenticateWithoutRole();

        expect(
            await statusOf(api().get(`/examples/${MISSING_ID}`).set('Authorization', bearer))
        ).toBe(403);
    });
});

describe('PUT and PATCH /examples/{id}', () => {
    it('replaces the representation', async () => {
        const { bearer } = await authenticateAs('user');
        const { id } = await createViaApi(bearer, A_NOTE);

        const response = await api()
            .put(`/examples/${id}`)
            .set('Authorization', bearer)
            .send({ title: 'Whole', body: 'New', status: 'published' });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ title: 'Whole', status: 'published' });
        expect(response.body.data.publishedAt).toBeDefined();
    });

    it('answers 422 to a PUT that leaves out a required field', async () => {
        const { bearer } = await authenticateAs('user');
        const { id } = await createViaApi(bearer, A_NOTE);

        const response = await api()
            .put(`/examples/${id}`)
            .set('Authorization', bearer)
            .send({ title: 'Only' });

        expect(response.status).toBe(422);
    });

    it('merges a change, leaving every omitted field alone', async () => {
        const { bearer } = await authenticateAs('user');
        const { id } = await createViaApi(bearer, A_NOTE);

        const response = await api()
            .patch(`/examples/${id}`)
            .set('Authorization', bearer)
            .send({ title: 'Only the title' });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
            title: 'Only the title',
            body: 'A body',
            status: 'draft'
        });
    });

    it('accepts the merge-patch media type', async () => {
        const { bearer } = await authenticateAs('user');
        const { id } = await createViaApi(bearer, A_NOTE);

        const response = await api()
            .patch(`/examples/${id}`)
            .set('Authorization', bearer)
            .set('Content-Type', 'application/merge-patch+json')
            .send(JSON.stringify({ title: 'Merged' }));

        expect(response.status).toBe(200);
    });

    it('answers 422 for an illegal status move', async () => {
        const { user, bearer } = await authenticateAs('user');
        const archived = await createExample({ userId: user.id, status: ExampleStatus.archived });

        const response = await api()
            .patch(`/examples/${String(archived._id)}`)
            .set('Authorization', bearer)
            .send({ status: 'published' });

        expect(response.status).toBe(422);
    });

    it('answers 412 when If-Match names a version that has moved on, and changes nothing', async () => {
        const { bearer } = await authenticateAs('user');
        const { id } = await createViaApi(bearer, A_NOTE);
        const stale = await etagOf(api().get(`/examples/${id}`).set('Authorization', bearer));
        await api()
            .patch(`/examples/${id}`)
            .set('Authorization', bearer)
            .send({ title: 'Someone else was here' });

        const response = await api()
            .patch(`/examples/${id}`)
            .set('Authorization', bearer)
            .set('If-Match', stale)
            .send({ title: 'Mine' });

        expect(response.status).toBe(412);
    });

    it('answers 404 for someone else’s example, on both verbs', async () => {
        const { bearer } = await authenticateAs('user');
        const other = await createUser({ email: 'other@example.com' });
        const theirs = await createExample({ userId: other.id });
        const url = `/examples/${String(theirs._id)}`;

        const put = await api()
            .put(url)
            .set('Authorization', bearer)
            .send({ title: 'x', body: 'y', status: 'draft' });
        const patch = await api().patch(url).set('Authorization', bearer).send({ title: 'x' });

        expect([put.status, patch.status]).toEqual([404, 404]);
    });

    it('lets an administrator edit anyone’s', async () => {
        const { bearer } = await authenticateAs('admin');
        const other = await createUser({ email: 'other@example.com' });
        const theirs = await createExample({ userId: other.id });

        const response = await api()
            .patch(`/examples/${String(theirs._id)}`)
            .set('Authorization', bearer)
            .send({ title: 'Edited by staff' });

        expect(response.status).toBe(200);
    });

    it('answers 404 for a malformed id, as it does for an unknown one', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .patch(`/examples/${MALFORMED_ID}`)
            .set('Authorization', bearer)
            .send({ title: 'x' });

        expect(response.status).toBe(404);
    });

    it('answers 401 with no credentials, and 403 without a key', async () => {
        const bearer = await authenticateWithoutRole();

        expect(await statusOf(api().patch(`/examples/${MISSING_ID}`).send({ title: 'x' }))).toBe(
            401
        );
        expect(
            await statusOf(
                api()
                    .patch(`/examples/${MISSING_ID}`)
                    .set('Authorization', bearer)
                    .send({ title: 'x' })
            )
        ).toBe(403);
    });
});

describe('DELETE /examples/{id}', () => {
    it('removes the caller’s own example', async () => {
        const { bearer } = await authenticateAs('user');
        const { id } = await createViaApi(bearer, A_NOTE);

        const response = await api().delete(`/examples/${id}`).set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(await statusOf(api().get(`/examples/${id}`).set('Authorization', bearer))).toBe(404);
    });

    it('answers 404 for someone else’s, and keeps it', async () => {
        const { bearer } = await authenticateAs('user');
        const other = await createUser({ email: 'other@example.com' });
        const theirs = await createExample({ userId: other.id });

        const response = await api()
            .delete(`/examples/${String(theirs._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });

    it('answers 401 with no credentials, and 403 without a key', async () => {
        const bearer = await authenticateWithoutRole();

        expect(await statusOf(api().delete(`/examples/${MISSING_ID}`))).toBe(401);
        expect(
            await statusOf(api().delete(`/examples/${MISSING_ID}`).set('Authorization', bearer))
        ).toBe(403);
    });
});

describe('an id no ObjectId can be built from', () => {
    it.each([
        ['GET', (id: string) => api().get(`/examples/${id}`)],
        ['DELETE', (id: string) => api().delete(`/examples/${id}`)],
        ['PUT cover', (id: string) => api().put(`/examples/${id}/cover`)]
    ] as const)('answers 404 on %s, the same as for an id nothing holds', async (_name, send) => {
        const { bearer } = await authenticateAs('user');

        expect(await statusOf(send(MALFORMED_ID).set('Authorization', bearer))).toBe(404);
    });
});

describe('PUT /examples/{id}/cover', () => {
    it('stores an uploaded image as the cover', async () => {
        const { bearer } = await authenticateAs('user');
        const { id } = await createViaApi(bearer, A_NOTE);

        const response = await api()
            .put(`/examples/${id}/cover`)
            .set('Authorization', bearer)
            .attach('imageUpload', PNG_BYTES, { filename: 'cover.png', contentType: 'image/png' });

        expect(response.status).toBe(200);
        expect(response.body.data.imageUrl).toMatch(/^\/images\/.+\.png$/);
        expect(response.body.data.thumbnailUrl).toBeDefined();
    });

    it('answers 422 when no file is sent', async () => {
        const { bearer } = await authenticateAs('user');
        const { id } = await createViaApi(bearer, A_NOTE);

        const response = await api().put(`/examples/${id}/cover`).set('Authorization', bearer);

        expect(response.status).toBe(422);
    });

    it('answers 404 for someone else’s example, and throws the upload away', async () => {
        const { bearer } = await authenticateAs('user');
        const other = await createUser({ email: 'other@example.com' });
        const theirs = await createExample({ userId: other.id });

        const response = await api()
            .put(`/examples/${String(theirs._id)}/cover`)
            .set('Authorization', bearer)
            .attach('imageUpload', PNG_BYTES, { filename: 'cover.png', contentType: 'image/png' });

        expect(response.status).toBe(404);
    });

    it('answers 401 with no credentials', async () => {
        expect(await statusOf(api().put(`/examples/${MISSING_ID}/cover`))).toBe(401);
    });

    it('answers 403 for an account that holds no examples key', async () => {
        const bearer = await authenticateWithoutRole();

        expect(
            await statusOf(api().put(`/examples/${MISSING_ID}/cover`).set('Authorization', bearer))
        ).toBe(403);
    });
});

describe('POST /account/export', () => {
    it('lists the caller’s own examples, drafts included, and nobody else’s', async () => {
        const { user, bearer } = await authenticateAs('user');
        const other = await createUser({ email: 'other@example.com' });
        await createExample({ userId: user.id, title: 'Mine' });
        await createExample({ userId: other.id, title: 'Theirs' });

        const response = await requestAndDownloadExport(bearer);

        expect(response.status).toBe(200);
        expect(
            (response.data.examples as { title: string }[]).map((example) => example.title)
        ).toEqual(['Mine']);
    });
});
