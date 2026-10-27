/**
 * @module
 * Contract tests for /examples: every route over HTTP, judged against `openapi.yaml`. One open
 * read (a published example is anyone's), the rest signed-in and narrowed by who is asking — someone else's
 * example is a 404, never a 403, so an id says nothing about who owns it. Behavioural rules live
 * in the integration suite; these make sure each declared response is actually reached.
 *
 * No bare 401 or 403 case here: the authorization sweep (`tests/contract/authorization-contract.test.ts`)
 * asks every guarded route for both, as every role, and a case that checks more than the status
 * (an error `code`, a row left untouched) is the only one a contract file adds. A module copied
 * from this one should not add them back.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { requestAndDownloadExport } from '@tests/account-export';
import { emptyFileSandbox } from '@tests/file-sandbox';
import { MISSING_ID } from '@tests/ids';
import { createUser } from '@modules/users/tests/factories';
import { ExampleStatus } from '@types';
import { createExample } from '../factories';
import { decodablePng } from '@tests/images';

setupTestDb();

/** An id no ObjectId can be built from: answered as an unknown id by every id-taking route. */
const MALFORMED_ID = 'not-an-object-id';

/** A genuinely decodable PNG: an upload is digested inline when there is no broker. */
let PNG_BYTES: Buffer;

beforeAll(async () => {
    PNG_BYTES = await decodablePng();
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

    return response.body as { id: string };
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

/** What a caller who may do nothing to an example is told. */
const NO_ACTIONS = {
    publish: false,
    archive: false,
    unarchive: false,
    update: false,
    delete: false
};

describe('POST /examples', () => {
    it('creates a draft owned by the caller, and points at it', async () => {
        const { user, bearer } = await authenticateAsRole('editor');

        const response = await api()
            .post('/examples')
            .set('Authorization', bearer)
            .send({ title: 'First', body: 'Hello' });

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
            title: 'First',
            status: 'draft',
            userId: user.id,
            ownerName: user.username
        });
        expect(response.headers.location).toBe(`/examples/${String(response.body.id)}`);
    });

    it.each(['user', 'unverified'] as const)(
        'refuses a shopper (%s) with 403: authoring is staff-only',
        async (persona) => {
            const { bearer } =
                persona === 'user'
                    ? await authenticateAs('user')
                    : await authenticateAsRole('unverified');

            const response = await api()
                .post('/examples')
                .set('Authorization', bearer)
                .send({ title: 'First', body: 'Hello' });

            expect(response.status).toBe(403);
        }
    );

    it('lets a staff role other than the editor create one too', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api()
            .post('/examples')
            .set('Authorization', bearer)
            .send({ title: 'First', body: 'Hello' });

        expect(response.status).toBe(201);
    });

    it('answers 422 for a body the contract refuses', async () => {
        const { bearer } = await authenticateAsRole('editor');

        const response = await api()
            .post('/examples')
            .set('Authorization', bearer)
            .send({ title: '' });

        expect(response.status).toBe(422);
    });
});

describe('GET /examples and POST /examples/search', () => {
    it('lists the caller’s own examples with the pagination meta', async () => {
        const { bearer } = await authenticateAsRole('editor');
        await createViaApi(bearer, A_NOTE);

        const response = await api().get('/examples').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.items).toHaveLength(1);
        expect(response.body.meta.totalItems).toBe(1);
    });

    it('never lists someone else’s', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const other = await createUser({ email: 'other@example.com' });
        await createExample({ userId: other.id });

        const response = await api().get('/examples').set('Authorization', bearer);

        expect(response.body.items).toEqual([]);
    });

    it('lists everyone’s for an administrator', async () => {
        const { bearer } = await authenticateAs('admin');
        const other = await createUser({ email: 'other@example.com' });
        await createExample({ userId: other.id });

        const response = await api().get('/examples').set('Authorization', bearer);

        expect(response.body.items).toHaveLength(1);
    });

    it('filters by status in the query, and sorts', async () => {
        const { user, bearer } = await authenticateAsRole('editor');
        await createExample({ userId: user.id, title: 'B draft' });
        await createExample({ userId: user.id, title: 'A out', status: ExampleStatus.published });

        const response = await api()
            .get('/examples')
            .query({ status: 'published', sort: 'title' })
            .set('Authorization', bearer);

        expect(response.body.items.map((item: { title: string }) => item.title)).toEqual(['A out']);
    });

    it('answers 422 for a status outside the closed set', async () => {
        const { bearer } = await authenticateAsRole('editor');

        const response = await api()
            .get('/examples')
            .query({ status: 'deleted' })
            .set('Authorization', bearer);

        expect(response.status).toBe(422);
    });

    it('searches the same way through the DTO form', async () => {
        const { user, bearer } = await authenticateAsRole('editor');
        await createExample({ userId: user.id, title: 'Puppies' });
        await createExample({ userId: user.id, title: 'Birds' });

        const response = await api()
            .post('/examples/search')
            .set('Authorization', bearer)
            .send({ text: 'puppies' });

        expect(response.status).toBe(200);
        expect(response.body.items).toHaveLength(1);
    });
});

describe('GET /examples/{id}', () => {
    it('reads the caller’s own draft, with an ETag', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const { id } = await createViaApi(bearer, A_NOTE);

        const response = await api().get(`/examples/${id}`).set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.headers.etag).toBeDefined();
    });

    it('answers 404, not 403, for someone else’s example', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const other = await createUser({ email: 'other@example.com' });
        const theirs = await createExample({ userId: other.id });

        const response = await api()
            .get(`/examples/${String(theirs._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });

    it('answers anyone, with no credentials, for a published example', async () => {
        const { user } = await authenticateAsRole('editor');
        const published = await createExample({ userId: user.id, status: ExampleStatus.published });

        const response = await api().get(`/examples/${String(published._id)}`);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            id: String(published._id),
            status: 'published',
            ownerName: user.username
        });
    });

    it('shows a signed-in stranger a published example, without actions', async () => {
        const owner = await createUser({ email: 'owner@example.com' });
        const published = await createExample({
            userId: owner.id,
            status: ExampleStatus.published
        });
        const { bearer } = await authenticateAsRole('editor');

        const response = await api()
            .get(`/examples/${String(published._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.actions).toEqual(NO_ACTIONS);
    });

    it.each([ExampleStatus.draft, ExampleStatus.archived])(
        'answers an anonymous caller 404 for a %s example, exactly as for one that does not exist',
        async (status) => {
            const { user } = await authenticateAsRole('editor');
            const hidden = await createExample({ userId: user.id, status });

            const response = await api().get(`/examples/${String(hidden._id)}`);

            expect(response.status).toBe(404);
        }
    );

    it('lets the owner read their own archived example', async () => {
        const { user, bearer } = await authenticateAsRole('editor');
        const archived = await createExample({ userId: user.id, status: ExampleStatus.archived });

        const response = await api()
            .get(`/examples/${String(archived._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
    });

    it('lets a caller holding display:Example read anyone’s draft', async () => {
        const owner = await createUser({ email: 'owner@example.com' });
        const draft = await createExample({ userId: owner.id });
        const { bearer } = await authenticateAsRole('admin');

        const response = await api()
            .get(`/examples/${String(draft._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
    });

    it('answers 404 for an id nothing holds', async () => {
        expect(await statusOf(api().get(`/examples/${MISSING_ID}`))).toBe(404);
    });

    it('answers 404, as for an id nothing holds, for an id no ObjectId can be built from', async () => {
        expect(await statusOf(api().get(`/examples/${MALFORMED_ID}`))).toBe(404);
    });
});

describe('PUT and PATCH /examples/{id}', () => {
    it('replaces the representation', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const { id } = await createViaApi(bearer, A_NOTE);

        const response = await api()
            .put(`/examples/${id}`)
            .set('Authorization', bearer)
            .send({ title: 'Whole', body: 'New' });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ title: 'Whole', status: 'draft' });
    });

    it('answers 422 to a PUT that leaves out a required field', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const { id } = await createViaApi(bearer, A_NOTE);

        const response = await api()
            .put(`/examples/${id}`)
            .set('Authorization', bearer)
            .send({ title: 'Only' });

        expect(response.status).toBe(422);
    });

    it('merges a change, leaving every omitted field alone', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const { id } = await createViaApi(bearer, A_NOTE);

        const response = await api()
            .patch(`/examples/${id}`)
            .set('Authorization', bearer)
            .send({ title: 'Only the title' });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            title: 'Only the title',
            body: 'A body',
            status: 'draft'
        });
    });

    it('accepts the merge-patch media type', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const { id } = await createViaApi(bearer, A_NOTE);

        const response = await api()
            .patch(`/examples/${id}`)
            .set('Authorization', bearer)
            .set('Content-Type', 'application/merge-patch+json')
            .send(JSON.stringify({ title: 'Merged' }));

        expect(response.status).toBe(200);
    });

    it('answers 412 when If-Match names a version that has moved on, and changes nothing', async () => {
        const { bearer } = await authenticateAsRole('editor');
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
        const { bearer } = await authenticateAsRole('editor');
        const other = await createUser({ email: 'other@example.com' });
        const theirs = await createExample({ userId: other.id });
        const url = `/examples/${String(theirs._id)}`;

        const put = await api()
            .put(url)
            .set('Authorization', bearer)
            .send({ title: 'x', body: 'y' });
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
        const { bearer } = await authenticateAsRole('editor');

        const response = await api()
            .patch(`/examples/${MALFORMED_ID}`)
            .set('Authorization', bearer)
            .send({ title: 'x' });

        expect(response.status).toBe(404);
    });
});

describe('DELETE /examples/{id}', () => {
    it('removes the caller’s own example', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const { id } = await createViaApi(bearer, A_NOTE);

        const response = await api().delete(`/examples/${id}`).set('Authorization', bearer);

        expect(response.status).toBe(204);
        expect(await statusOf(api().get(`/examples/${id}`).set('Authorization', bearer))).toBe(404);
    });

    it('answers 404 for someone else’s, and keeps it', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const other = await createUser({ email: 'other@example.com' });
        const theirs = await createExample({ userId: other.id });

        const response = await api()
            .delete(`/examples/${String(theirs._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });
});

describe('an id no ObjectId can be built from', () => {
    it.each([
        ['GET', (id: string) => api().get(`/examples/${id}`)],
        ['DELETE', (id: string) => api().delete(`/examples/${id}`)],
        ['PUT cover', (id: string) => api().put(`/examples/${id}/cover`)]
    ] as const)('answers 404 on %s, the same as for an id nothing holds', async (_name, send) => {
        const { bearer } = await authenticateAsRole('editor');

        expect(await statusOf(send(MALFORMED_ID).set('Authorization', bearer))).toBe(404);
    });
});

describe('PUT /examples/{id}/cover', () => {
    it('stores an uploaded image as the cover', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const { id } = await createViaApi(bearer, A_NOTE);

        const response = await api()
            .put(`/examples/${id}/cover`)
            .set('Authorization', bearer)
            .attach('imageUpload', PNG_BYTES, { filename: 'cover.png', contentType: 'image/png' });

        expect(response.status).toBe(200);
        expect(response.body.imageUrl).toMatch(/^\/images\/.+\.png$/);
        expect(response.body.thumbnailUrl).toBeDefined();
    });

    it('answers 422 when no file is sent', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const { id } = await createViaApi(bearer, A_NOTE);

        const response = await api().put(`/examples/${id}/cover`).set('Authorization', bearer);

        expect(response.status).toBe(422);
    });

    it('answers 404 for someone else’s example, and throws the upload away', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const other = await createUser({ email: 'other@example.com' });
        const theirs = await createExample({ userId: other.id });

        const response = await api()
            .put(`/examples/${String(theirs._id)}/cover`)
            .set('Authorization', bearer)
            .attach('imageUpload', PNG_BYTES, { filename: 'cover.png', contentType: 'image/png' });

        expect(response.status).toBe(404);
    });
});

describe('POST /account/export', () => {
    it('lists the caller’s own examples, drafts included, and nobody else’s', async () => {
        const { user, bearer } = await authenticateAsRole('editor');
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

describe('POST /examples/{id}/publish', () => {
    it('publishes the draft, answers with its actions, and stamps publishedAt', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const { id } = await createViaApi(bearer, A_NOTE);

        const response = await api().post(`/examples/${id}/publish`).set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            status: 'published',
            actions: {
                publish: false,
                archive: true,
                unarchive: false,
                update: true,
                delete: true
            }
        });
        expect(response.body.publishedAt).toBeDefined();
    });

    it('answers 409 with the code and details for an event not on the table', async () => {
        const { user, bearer } = await authenticateAsRole('editor');
        const archived = await createExample({ userId: user.id, status: ExampleStatus.archived });

        const response = await api()
            .post(`/examples/${String(archived._id)}/publish`)
            .set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response.body.errors[0]).toMatchObject({
            code: 'EXAMPLE_NOT_PUBLISHABLE',
            details: { status: 'archived' }
        });
    });

    it.each(['publish', 'archive', 'unarchive'])(
        'answers 404 on %s for someone else’s example and for a malformed id',
        async (door) => {
            const { bearer } = await authenticateAsRole('editor');
            const other = await createUser({ email: 'other@example.com' });
            const theirs = await createExample({ userId: other.id });

            expect(
                await statusOf(
                    api()
                        .post(`/examples/${String(theirs._id)}/${door}`)
                        .set('Authorization', bearer)
                )
            ).toBe(404);
            expect(
                await statusOf(
                    api().post(`/examples/${MALFORMED_ID}/${door}`).set('Authorization', bearer)
                )
            ).toBe(404);
        }
    );
});

describe('POST /examples/{id}/archive and /unarchive', () => {
    it('archives a draft and brings it back to draft', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const { id } = await createViaApi(bearer, A_NOTE);

        const archived = await api().post(`/examples/${id}/archive`).set('Authorization', bearer);
        const restored = await api().post(`/examples/${id}/unarchive`).set('Authorization', bearer);

        expect(archived.body).toMatchObject({
            status: 'archived',
            actions: { publish: false, archive: false, unarchive: true }
        });
        expect(restored.body).toMatchObject({ status: 'draft', actions: { publish: true } });
    });

    it.each([
        ['archive', ExampleStatus.archived, 'EXAMPLE_NOT_ARCHIVABLE'],
        ['unarchive', ExampleStatus.draft, 'EXAMPLE_NOT_UNARCHIVABLE']
    ])('answers 409 on %s from %s, with the per-verb code', async (door, status, code) => {
        const { user, bearer } = await authenticateAsRole('editor');
        const example = await createExample({ userId: user.id, status });

        const response = await api()
            .post(`/examples/${String(example._id)}/${door}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response.body.errors[0]).toMatchObject({ code, details: { status } });
    });

    it('makes the ETag a read gave answer 412 on the next edit', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const { id } = await createViaApi(bearer, A_NOTE);
        const stale = await etagOf(api().get(`/examples/${id}`).set('Authorization', bearer));

        await api().post(`/examples/${id}/archive`).set('Authorization', bearer);
        const response = await api()
            .patch(`/examples/${id}`)
            .set('Authorization', bearer)
            .set('If-Match', stale)
            .send({ title: 'Late' });

        expect(response.status).toBe(412);
    });
});

describe('Example.actions', () => {
    it('gives an administrator the moves and the edits on anyone’s example', async () => {
        const { bearer } = await authenticateAs('admin');
        const other = await createUser({ email: 'other@example.com' });
        const theirs = await createExample({ userId: other.id });

        const response = await api()
            .get(`/examples/${String(theirs._id)}`)
            .set('Authorization', bearer);

        expect(response.body.actions).toEqual({
            publish: true,
            archive: true,
            unarchive: false,
            update: true,
            delete: true
        });
    });

    it('gives a moderator nothing on another person’s example: they may read it, not edit it', async () => {
        const { bearer } = await authenticateAsRole('moderator');
        const other = await createUser({ email: 'other@example.com' });
        const theirs = await createExample({ userId: other.id });

        const response = await api()
            .get(`/examples/${String(theirs._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.actions).toEqual(NO_ACTIONS);
    });

    it('is all false on the public read: a stranger may do nothing', async () => {
        const { user } = await authenticateAsRole('editor');
        const published = await createExample({ userId: user.id, status: ExampleStatus.published });

        const response = await api().get(`/examples/${String(published._id)}`);

        expect(response.body.actions).toEqual(NO_ACTIONS);
    });
});

describe('POST /examples with an Idempotency-Key', () => {
    it('replays the first answer for the same key and body, and refuses a different body', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const send = (body: { title: string; body: string }) =>
            api()
                .post('/examples')
                .set('Authorization', bearer)
                .set('Idempotency-Key', 'create-example-1')
                .send(body);

        const first = await send(A_NOTE);
        const replay = await send(A_NOTE);
        const changed = await send({ title: 'Other', body: 'Other' });

        expect(first.status).toBe(201);
        expect(replay.status).toBe(201);
        expect(replay.body.id).toBe(first.body.id);
        expect(replay.headers['idempotent-replay']).toBe('true');
        expect(changed.status).toBe(422);
    });
});
