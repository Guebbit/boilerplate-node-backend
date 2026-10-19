/**
 * Integration tests for per-request locale negotiation.
 *
 * `POST /account/signup` is the subject because its validation rejects before any repository call,
 * so these drive the real middleware stack — `attachLocale`, the routes, the Zod thunks and the
 * error shaping in `rejectResponse` — with no Redis or queue. The one multipart case needs a
 * database to sign a caller in.
 *
 * The concurrency case is the one that matters most: it is what stops `@infrastructure/i18n` being
 * "simplified" into an `i18next.changeLanguage()` call, which mutates one global and is async, so
 * two overlapping requests in different languages would answer each other's.
 */
import { api, authenticateAs } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { translator } from '@infrastructure/i18n';

/** The "not an email" sentence for the email field, in one language, rendered by the same `t`. */
const emailRefusal = (locale: 'en' | 'it'): string => {
    const t = translator(locale);
    return t('validation.format-email', { attribute: t('validation.attributes.email') });
};

// Only the multipart case signs a user in; every other case rejects before any repository call.
setupTestDb();

const INVALID_SIGNUP = {
    email: 'not-an-email',
    username: 'ab',
    password: 'x',
    passwordConfirm: 'x'
};

const signupWith = (acceptLanguage?: string) => {
    const pending = api().post('/account/signup');
    return acceptLanguage ? pending.set('Accept-Language', acceptLanguage) : pending;
};

const messagesOf = (body: { errors?: { message?: string }[] }) =>
    (body.errors ?? []).map(({ message }) => message);

describe('Accept-Language negotiation', () => {
    it('answers in Italian when the client asks for it', async () => {
        const response = await signupWith('it').send(INVALID_SIGNUP);

        expect(response.status).toBe(422);
        expect(response.headers['content-language']).toBe('it');
        expect(messagesOf(response.body)).toContain(emailRefusal('it'));
    });

    it('answers in English when the client asks for nothing', async () => {
        const response = await signupWith().send(INVALID_SIGNUP);

        expect(response.headers['content-language']).toBe('en');
        expect(messagesOf(response.body)).toContain(emailRefusal('en'));
    });

    it('falls back when the requested language is not supported', async () => {
        const response = await signupWith('de').send(INVALID_SIGNUP);

        expect(response.headers['content-language']).toBe('en');
        expect(messagesOf(response.body)).toContain(emailRefusal('en'));
    });

    it('honours q-weights rather than header order', async () => {
        const response = await signupWith('en;q=0.8,it;q=0.9').send(INVALID_SIGNUP);

        expect(response.headers['content-language']).toBe('it');
        expect(messagesOf(response.body)).toContain(emailRefusal('it'));
    });

    it('matches a region tag against its base language', async () => {
        const response = await signupWith('it-CH').send(INVALID_SIGNUP);

        expect(response.headers['content-language']).toBe('it');
    });

    it('declares Accept-Language in Vary, so a shared cache cannot mix languages', async () => {
        const response = await signupWith('it').send(INVALID_SIGNUP);

        expect(response.headers.vary.toLowerCase()).toContain('accept-language');
    });

    /**
     * The multipart path, which lost the locale entirely and said nothing about it.
     *
     * `upload.image()` consumes the request stream, so the rest of the chain resumes from a
     * socket read callback whose async context predates `attachLocale` — the ALS store is gone
     * and the Zod thunks silently resolve against the boot language. The response still carried
     * `Content-Language: it`, because the header is set by the middleware, which does run. The
     * cases above all post JSON, where `express.json()` has already buffered the body before
     * `attachLocale`, so nothing awaits the stream afterwards and none of them could see it.
     *
     * `src/infrastructure/http/middlewares/upload.ts` re-enters the store after multer; this is the guard.
     */
    // Signup takes no image any more (and so declares no multipart body); `PATCH /account` is a
    // multipart door a signed-in caller can reach, and rejects an invalid email the same way.
    it('keeps the locale across a multipart upload', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .patch('/account')
            .set('Authorization', bearer)
            .set('Accept-Language', 'it')
            .field('email', INVALID_SIGNUP.email);

        expect(response.status).toBe(422);
        expect(response.headers['content-language']).toBe('it');
        expect(messagesOf(response.body)).toContain(emailRefusal('it'));
    });

    /**
     * The whole reason for AsyncLocalStorage. Twenty interleaved requests, alternating languages,
     * all in flight at once: every one must be answered in the language IT asked for.
     */
    it('never answers one request in another request’s language', async () => {
        const languages = Array.from({ length: 20 }, (_, index) => (index % 2 ? 'it' : 'en'));

        const responses = await Promise.all(
            languages.map((language) => signupWith(language).send(INVALID_SIGNUP))
        );

        for (const [index, response] of responses.entries()) {
            const language = languages[index];
            expect(response.headers['content-language']).toBe(language);
            expect(messagesOf(response.body)).toContain(
                emailRefusal(language === 'it' ? 'it' : 'en')
            );
        }
    });
});

/**
 * The controller-parsed path, in the same language.
 *
 * `POST /feedback/contact` validates in the controller against the orval-generated schema, which
 * declares no messages at all. `@infrastructure/http/validation-messages` translates Zod's refusals
 * globally, without touching the codegen, so it answers in the negotiated language like signup.
 * Public and rejected before any repository call, so these need no database.
 */
const INVALID_CONTACT = { email: 'not-an-email', subject: '', message: '' };

const contactWith = (acceptLanguage?: string) => {
    const pending = api().post('/feedback/contact');
    return acceptLanguage ? pending.set('Accept-Language', acceptLanguage) : pending;
};

describe('generated-schema validation answers in the negotiated language', () => {
    it('answers in Italian when the client asks for it', async () => {
        const response = await contactWith('it').send(INVALID_CONTACT);

        expect(response.status).toBe(422);
        expect(response.headers['content-language']).toBe('it');
        expect(messagesOf(response.body)).toContain(emailRefusal('it'));
    });

    it('answers in English when the client asks for nothing', async () => {
        const response = await contactWith().send(INVALID_CONTACT);

        expect(response.status).toBe(422);
        expect(messagesOf(response.body)).toContain(emailRefusal('en'));
    });

    it('never leaves a Zod default on the wire', async () => {
        const [italian, english] = await Promise.all([
            contactWith('it').send(INVALID_CONTACT),
            contactWith('en').send(INVALID_CONTACT)
        ]);

        const italianMessages = messagesOf(italian.body);
        const englishMessages = messagesOf(english.body);

        expect(italianMessages).toHaveLength(3);
        expect(englishMessages).toHaveLength(3);

        /*
         * Every message differs between the two languages — asserted without naming any copy, so
         * it holds for whatever the dictionary says today. An untranslated Zod default is
         * identical in both responses, which is exactly what this catches: before the shared map
         * all three of these were the same English string on both sides.
         */
        for (const [index, message] of italianMessages.entries())
            expect(message).not.toBe(englishMessages[index]);

        // And nothing resolved to a raw dictionary key, the other way copy goes missing.
        for (const message of italianMessages) expect(message).not.toMatch(/^\w+(?:\.[\w-]+)+$/);
    });
});

/**
 * A body the parser refused.
 *
 * The parser's 400 / 413 are answered BEFORE the routes, so they only speak the caller's language
 * if `attachLocale` is mounted ahead of request parsing in `createApp`. The global limiter's 429 sits
 * in that same group, so the order covers it too; a test cannot build a second app with a small
 * budget without re-loading the i18n module, which the reload leaves unbooted. These drive the real
 * app, in Italian, and expect the status's own `generic.*` text and the header.
 */
describe('a body the parser refused', () => {
    const italian = translator('it');

    it('answers a malformed JSON body in the caller’s language', async () => {
        const response = await api()
            .post('/account/login')
            .set('Accept-Language', 'it')
            .set('Content-Type', 'application/json')
            .send('{"email":');

        expect(response.status).toBe(400);
        expect(response.headers['content-language']).toBe('it');
        expect(messagesOf(response.body)).toEqual([italian('generic.error-bad-request')]);
    });

    it('answers an oversized body in the caller’s language', async () => {
        const response = await api()
            .post('/account/login')
            .set('Accept-Language', 'it')
            .set('Content-Type', 'application/json')
            .send(JSON.stringify({ email: 'a'.repeat(200_000) }));

        expect(response.status).toBe(413);
        expect(response.headers['content-language']).toBe('it');
        expect(messagesOf(response.body)).toEqual([italian('generic.error-payload-too-large')]);
    });
});
