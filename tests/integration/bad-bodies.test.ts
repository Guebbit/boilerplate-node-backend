/**
 * What a request with a BAD BODY gets — the status, and that it is never a 500.
 *
 * A client error must be distinguishable from a server fault in metrics and alerting: nobody
 * should be able to drive the 5xx rate with one malformed request.
 *
 * | Send | Answer |
 * | --- | --- |
 * | Body over `NODE_JSON_BODY_LIMIT` | 413 |
 * | Malformed JSON | 400 |
 * | A charset or content-encoding the parser cannot read | 415 |
 * | A content-type the operation does not declare | 415 |
 * | No content-type at all | the route's own answer |
 *
 * The last row is the one easy to get wrong twice. Express 5 leaves `request.body` UNDEFINED
 * when no parser matched — not `{}`, the way express 4 did — so an unguarded destructure throws
 * synchronously, before any promise chain's `.catch` can see it. The fix is a guard at each read,
 * NOT a 400: the request reaches its route and gets whatever that route says about a request
 * missing every field, which for login is a 422 — see the enumeration test below for why that is
 * NOT the same answer a wrong password gets, and is not meant to be.
 *
 * Also holds the hostile-CONTENT cases (depth, `__proto__`), which are a different question —
 * well-formed bodies carrying something nasty — but need this exact harness.
 *
 * See: docs/theory/request-flow.md
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { api, authenticateAs } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';

setupTestDb();

/** Comfortably past `JSON_BODY_LIMIT` (`src/app/security.ts`, 100kb by default). */
const OVERSIZED_BODY = JSON.stringify({ email: 'a'.repeat(200_000) });

/**
 * Every route that reads `request.body` without parsing it through Zod first — the four sites a
 * guard is required at, or an unguarded destructure throws a `TypeError` on a body express never
 * parsed.
 *
 * `POST /account/signup` and `PUT /account` are multipart routes and are here deliberately:
 * multer is no protection, it calls `next()` untouched when the content-type is not multipart.
 * `PUT /account` and `POST /users` sit behind an auth guard, so `authorize` gets a session onto
 * the request before the guard can turn a body-parsing question into a 401 one.
 */
const BODY_READING_ROUTES = [
    { method: 'post' as const, path: '/account/login', authorize: undefined },
    { method: 'post' as const, path: '/account/signup', authorize: undefined },
    {
        method: 'put' as const,
        path: '/account',
        authorize: async () => {
            const { bearer } = await authenticateAs('user');
            return bearer;
        }
    },
    {
        method: 'post' as const,
        path: '/users',
        authorize: async () => {
            const { bearer } = await authenticateAs('admin');
            return bearer;
        }
    }
];

describe('a body the parser refused', () => {
    it('answers 413 when the body is over the size limit', async () => {
        const response = await api()
            .post('/account/login')
            .set('Content-Type', 'application/json')
            .send(OVERSIZED_BODY);

        expect(response.status).toBe(413);
        expect(response.body.errors[0].code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('answers 400 when the JSON is malformed', async () => {
        const response = await api()
            .post('/account/login')
            .set('Content-Type', 'application/json')
            .send('{"email":');

        expect(response.status).toBe(400);
        expect(response.body.errors[0].code).toBe('BAD_REQUEST');
    });

    /**
     * 415, and BOTH ways body-parser reaches it — `charset.unsupported` and
     * `encoding.unsupported` are separate throw sites and only one of them would catch a
     * regression in the other.
     *
     * Not a hand-set `.status` on an `Error`: that would assert the handler reads the fields the
     * test wrote, which is the one thing not in question. These are headers a client can really
     * send, refused by the real parser in front of the real app.
     *
     * The statuses body-parser does NOT reach this way are worth knowing while reading the
     * cases: `charset=utf-7` is accepted outright, and `charset=utf-32` decodes to nonsense and
     * comes back 400 `entity.parse.failed`, not 415.
     */
    it.each([
        ['an unreadable charset', { 'Content-Type': 'application/json; charset=iso-8859-1' }],
        [
            'an unreadable content-encoding',
            { 'Content-Type': 'application/json', 'Content-Encoding': 'nonsense' }
        ]
    ])('answers 415 on %s', async (_label, headers) => {
        const response = await api().post('/account/login').set(headers).send('{"email":"a@b.c"}');

        expect(response.status).toBe(415);
        expect(response.body.errors[0].code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    /**
     * The contract half of the same change. 415 is an APP-level response — nothing in
     * `account`'s fragment declares it — so it reaches the spec only through
     * `x-app-level-responses`, and an operation that accepts a body must carry it. Asserted here
     * rather than in a contract test because the status and its declaration were added together
     * and are worth failing together.
     *
     * Under the operation's OWN `responses`, not just present somewhere in the file: the
     * component the ref points at is declared once regardless of whether the merge that attaches
     * it to `POST /account/login` ran at all.
     */
    it('is a status the contract declares for the operation that answered it', () => {
        const bundled = parseYaml(
            readFileSync(path.join(__dirname, '..', '..', 'openapi.yaml'), 'utf8')
        ) as { paths: Record<string, { post?: { responses?: Record<string, unknown> } }> };

        const responses = bundled.paths['/account/login']?.post?.responses;

        expect(responses).toHaveProperty('415');
        expect(JSON.stringify(responses?.['415'])).toContain('UnsupportedMediaType');
    });

    /**
     * The generic branch reads the `http-errors` contract rather than a list of `.type` strings,
     * so the message must stay a constant of ours. body-parser's own text is short and harmless
     * today; forwarding it is the habit that eventually forwards a driver error naming a host.
     */
    it('says nothing about what the parser actually objected to', async () => {
        const response = await api()
            .post('/account/login')
            .set('Content-Type', 'application/json')
            .send('{"email":');

        expect(JSON.stringify(response.body)).not.toContain('JSON');
        expect(JSON.stringify(response.body)).not.toContain('position');
    });
});

describe('a body express never parsed', () => {
    /**
     * `< 500` alone is true for a 401 too, which every guarded route answers on ANY unauthorized
     * request — a body-parsing bug behind the guard would still pass. A real session (or, for
     * `/users`, a caller with `users.any.create`) proves the request actually reached the
     * controller's own guard, not the auth middleware in front of it.
     */
    it.each(BODY_READING_ROUTES)(
        '$method $path answers 415 to a text/plain body',
        async ({ method, path, authorize }) => {
            const response = await api()
                [method](path)
                .set('Content-Type', 'text/plain')
                .set(authorize ? { Authorization: await authorize() } : {})
                .send('not json at all');

            expect(response.status).toBe(415);
        }
    );

    it.each(BODY_READING_ROUTES)(
        '$method $path does not fail with no content-type at all',
        async ({ method, path, authorize }) => {
            const response = await api()
                [method](path)
                .set(authorize ? { Authorization: await authorize() } : {})
                .send();

            expect(response.status).toBeLessThan(500);
            expect(response.status).not.toBe(401);
        }
    );

    /**
     * The enumeration property, which is the one that actually matters here: a malformed login
     * must answer the same whether or not the address exists. The 500 broke this by construction
     * — a server fault is not an answer about credentials at all — and a fix that answered 400
     * for one shape and 422 for another would only be safe as long as neither depended on the
     * account.
     *
     * Deliberately NOT asserted: that a bodyless login matches a WRONG-PASSWORD login. It does
     * not — an unparsable body is 422 and a wrong password is 401, because `accountService.login`
     * parses `LoginBody` itself. That split is intended, and `postLogin`'s own comment says why:
     * the shape of a guess is not a secret, only whether the account exists is.
     */
    it('answers a malformed login the same for a real address as for an unknown one', async () => {
        const user = await createUser({ verifiedAt: new Date() }, 'customer');

        const known = await api()
            .post('/account/login')
            .set('Content-Type', 'text/plain')
            .send(user.email);

        const unknown = await api()
            .post('/account/login')
            .set('Content-Type', 'text/plain')
            .send('nobody@example.com');

        expect(known.status).toBe(unknown.status);
        expect(known.status).toBeLessThan(500);
        expect(JSON.stringify(known.body)).toBe(JSON.stringify(unknown.body));
    });

    /** And the same shape still logs in, so the guard did not quietly break the happy path. */
    it('still logs in a correct credential', async () => {
        const user = await createUser({ verifiedAt: new Date() }, 'customer');

        const response = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });

        expect(response.status).toBe(200);
    });
});

describe('hostile content in a well-formed body', () => {
    /**
     * `express.json`'s limit is a BYTE cap, so depth was bounded only by size, and a 100 kB body
     * of `[[[…]]]` made every recursive walker behind it throw `RangeError` (a repeatable 500).
     * `limitJsonDepth` refuses past 32 levels, right after the parser, with a 400.
     */
    it('refuses a body nested past the depth limit with a 400, not a 500', async () => {
        let nested = '{"email":"a@b.test"}';
        for (let depth = 0; depth < 200; depth += 1) nested = `{"a":${nested}}`;

        const response = await api()
            .post('/account/login')
            .set('Content-Type', 'application/json')
            .send(nested);

        expect(response.status).toBe(400);
        expect(response.body.errors[0]).toMatchObject({
            code: 'BAD_REQUEST',
            details: { reason: 'body-too-deep', maxDepth: 32 }
        });
    });

    it('refuses the 100 kB `[[[…]]]` body that overflowed every recursive walker', async () => {
        const hostile = `{"title":${'['.repeat(49_990)}${']'.repeat(49_990)}}`;

        for (const route of ['/products/search', '/account/login']) {
            const response = await api()
                .post(route)
                .set('Content-Type', 'application/json')
                .send(hostile);

            expect(response.status).toBe(400);
        }
    });

    it('still accepts a body nested within the limit', async () => {
        let nested = '{"email":"a@b.test","password":"whatever12"}';
        for (let depth = 0; depth < 20; depth += 1) nested = `{"a":${nested}}`;

        const response = await api()
            .post('/account/login')
            .set('Content-Type', 'application/json')
            .send(nested);

        expect(response.status).not.toBe(400);
        expect(response.status).toBeLessThan(500);
    });

    it('also guards an Idempotency-Key request, whose fingerprint walks the body', async () => {
        const hostile = `{"email":${'['.repeat(49_990)}${']'.repeat(49_990)}}`;

        const response = await api()
            .post('/account/signup')
            .set('Content-Type', 'application/json')
            .set('Idempotency-Key', 'deep-body-1')
            .send(hostile);

        expect(response.status).toBe(400);
    });

    /**
     * One end-to-end statement that an ordinary route does not pollute the prototype. The ledger
     * path and the serializer are covered elsewhere; what was missing is the plain case, and it
     * is expected green — Zod strips unknown keys on every schema-validated route.
     */
    it('does not let a __proto__ key in a body reach Object.prototype', async () => {
        const response = await api()
            .post('/account/login')
            .set('Content-Type', 'application/json')
            .send('{"email":"a@b.test","password":"whatever12","__proto__":{"polluted":true}}');

        expect(response.status).toBeLessThan(500);
        expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
    });
});
