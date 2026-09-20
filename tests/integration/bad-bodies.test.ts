/**
 * What a request with a BAD BODY gets — the status, and that it is never a 500.
 *
 * Three causes reached the same generic 500 before this suite existed, and the shared cost was
 * that a client error was indistinguishable from a server fault in metrics and alerting: anyone
 * could drive the 5xx rate with one malformed request.
 *
 * | Send | Was | Is |
 * | --- | --- | --- |
 * | Body over `NODE_JSON_BODY_LIMIT` | 500 | 413 |
 * | Malformed JSON | 500 | 400 |
 * | Wrong or absent content-type | 500, via a `TypeError` | the route's own answer |
 *
 * The third is the one that is easy to get wrong twice. Express 5 leaves `request.body`
 * UNDEFINED when no parser matched — not `{}`, the way express 4 did — so every unguarded
 * destructure threw synchronously, before any promise chain's `.catch` could see it. The fix is a
 * guard at each read, NOT a 400: the request reaches its route and gets whatever that route says
 * about a request missing every field, which for login is the same 401 a wrong password gets.
 *
 * Also holds the hostile-CONTENT cases (depth, `__proto__`), which are a different question —
 * well-formed bodies carrying something nasty — but need this exact harness.
 *
 * See: docs/theory/request-flow.md
 */
import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';

setupTestDb();

/** Comfortably past `JSON_BODY_LIMIT` (`src/app/security.ts`, 100kb by default). */
const OVERSIZED_BODY = JSON.stringify({ email: 'a'.repeat(200_000) });

/**
 * Every route that reads `request.body` without parsing it through Zod first — the six sites the
 * guard had to be applied at, reachable without a session. Each one used to throw a `TypeError`
 * on a body express never parsed.
 *
 * `POST /account/signup` and `PUT /account` are multipart routes and are here deliberately:
 * multer is no protection, it calls `next()` untouched when the content-type is not multipart.
 */
const BODY_READING_ROUTES = [
    { method: 'post' as const, path: '/account/login' },
    { method: 'post' as const, path: '/account/signup' },
    { method: 'put' as const, path: '/account' },
    { method: 'post' as const, path: '/users' }
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
    it.each(BODY_READING_ROUTES)(
        '$method $path does not fail on a text/plain body',
        async ({ method, path }) => {
            const response = await api()
                [method](path)
                .set('Content-Type', 'text/plain')
                .send('not json at all');

            expect(response.status).toBeLessThan(500);
        }
    );

    it.each(BODY_READING_ROUTES)(
        '$method $path does not fail with no content-type at all',
        async ({ method, path }) => {
            const response = await api()[method](path).send();

            expect(response.status).toBeLessThan(500);
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
     * parses `LoginBody` itself. That is a pre-existing split between the service and the comment
     * on `postLogin`'s own read-don't-parse decision, not something this guard introduced: an
     * absent body now answers exactly as an empty one always has.
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
     * `express.json` has no depth option — `JSON_BODY_LIMIT` is a BYTE cap, so depth is bounded
     * only by size. That is the honest answer, and it is what this pins: a deeply nested but
     * small body is accepted and handled, rather than crashing the parser. Asserting an invented
     * depth limit would be worse than asserting nothing.
     */
    it('handles a deeply nested body without a server error', async () => {
        let nested = '{"email":"a@b.test"}';
        for (let depth = 0; depth < 200; depth += 1) nested = `{"a":${nested}}`;

        const response = await api()
            .post('/account/login')
            .set('Content-Type', 'application/json')
            .send(nested);

        expect(response.status).toBeLessThan(500);
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
