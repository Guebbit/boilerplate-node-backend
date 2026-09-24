import express from 'express';
import supertest from 'supertest';
import { handleUncaughtError } from '@app/error-handling';

/**
 * The global error handler is the one hardening property here that is genuinely system-wide:
 * every module's uncaught throw and every body-parser rejection unwinds through it, so it stays
 * a root-level suite rather than moving into any one module.
 *
 * `src/modules/account/tests/integration/auth-hardening.test.ts` covers the other hardening
 * property this file used to carry — the credential-endpoint rate limiter and the antibot
 * challenge gate — which genuinely belongs to the account module instead.
 */

/**
 * What the global error handler answers for a thrown value, over real HTTP.
 *
 * Mounted behind a route that throws rather than called directly: `handleUncaughtError` is an
 * express error handler, and half of what is under test is that express routes a synchronous
 * throw to it at all.
 *
 * @param thrown - what the route throws
 * @returns the supertest response
 */
const answerFor = (thrown: unknown) => {
    const throwing = express();
    throwing.get('/boom', () => {
        throw thrown;
    });
    throwing.use(handleUncaughtError);
    return supertest(throwing).get('/boom');
};

describe('the 500 handler', () => {
    /**
     * An unexpected error is precisely the case where nobody chose the wording: a driver error
     * naming hosts and ports, an ENOENT naming a filesystem layout, a client quoting a URL with a
     * key in it. None of it may reach an unauthenticated caller.
     */
    it('tells the client nothing about what actually threw', async () => {
        const secret = 'mongodb://admin:hunter2@internal-db:27017';

        const response = await answerFor(new Error(`connection failed to ${secret}`));

        expect(response.status).toBe(500);
        expect(JSON.stringify(response.body)).not.toContain('hunter2');
        expect(JSON.stringify(response.body)).not.toContain('internal-db');
        // A chosen, translated message still reaches the user, and the stable code still reaches
        // the client's error handling.
        expect(response.body.errors[0].code).toBe('INTERNAL_ERROR');
        expect(response.body.errors[0].message).toBeTruthy();
    });

    /**
     * A REAL body-parser rejection, produced by driving the parser rather than hand-setting
     * `.status` on an `Error`. A faked shape would assert that the handler reads the fields the
     * test wrote, which is the one thing not in question — what matters is that the fields
     * body-parser actually sets are the fields it reads.
     */
    it('answers a genuine oversized-body rejection with its own status', async () => {
        const parsing = express();
        parsing.use(express.json({ limit: '100b' }));
        parsing.post('/echo', (_request, response) => response.json({ ok: true }));
        parsing.use(handleUncaughtError);

        const response = await supertest(parsing)
            .post('/echo')
            .set('Content-Type', 'application/json')
            .send(JSON.stringify({ padding: 'x'.repeat(500) }));

        expect(response.status).toBe(413);
        expect(response.body.errors[0].code).toBe('PAYLOAD_TOO_LARGE');
    });

    /**
     * `expose` is half the contract, and the half a test has to state: a 4xx on an error the
     * thrower still considers internal is NOT the client's business. Drop the `expose` check and
     * every library that annotates an internal failure with a 4xx starts leaking its own status.
     */
    it('ignores a client status on an error that does not expose itself', async () => {
        const response = await answerFor(
            Object.assign(new Error('internal detail'), { status: 400, expose: false })
        );

        expect(response.status).toBe(500);
        expect(response.body.errors[0].code).toBe('INTERNAL_ERROR');
    });

    /** And the range is the other half — an exposed 5xx is still a server fault. */
    it('does not hand a 5xx back to the client just because it is exposed', async () => {
        const response = await answerFor(
            Object.assign(new Error('upstream is down'), { status: 503, expose: true })
        );

        expect(response.status).toBe(500);
        expect(JSON.stringify(response.body)).not.toContain('upstream');
    });

    /**
     * The other side of the rule: an error whose text was CHOSEN is still returned. Losing that
     * would turn every deliberate rejection into a blank 500. `MulterError` is the one throw
     * shape this handler still translates by hand — everything else answers `rejectResponse`
     * directly instead of unwinding through here.
     */
    it('still returns the copy a deliberate error carries', async () => {
        const multer = await import('multer');

        const response = await answerFor(new multer.MulterError('LIMIT_FILE_SIZE', 'avatar'));

        expect(response.status).toBe(400);
        expect(response.body.errors).toContainEqual(
            expect.objectContaining({ message: 'File too large' })
        );
    });
});
