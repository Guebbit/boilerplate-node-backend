/**
 * Integration tests for per-request locale negotiation.
 *
 * `POST /account/signup` is the subject because its validation rejects before any repository call,
 * so these drive the real middleware stack — `attachLocale`, the routes, the Zod thunks and the
 * error shaping in `rejectResponse` — with no database, Redis or queue.
 *
 * The concurrency case is the one that matters most: it is what stops `@infrastructure/i18n` being
 * "simplified" into an `i18next.changeLanguage()` call, which mutates one global and is async, so
 * two overlapping requests in different languages would answer each other's.
 */
import { api } from '@tests/http';
import enUsers from '@modules/users/locales/en.json';
import itUsers from '@modules/users/locales/it.json';
import enShared from '../../src/locales/en.json';
import itShared from '../../src/locales/it.json';

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
        expect(messagesOf(response.body)).toContain(itUsers.users['field-email-invalid']);
    });

    it('answers in English when the client asks for nothing', async () => {
        const response = await signupWith().send(INVALID_SIGNUP);

        expect(response.headers['content-language']).toBe('en');
        expect(messagesOf(response.body)).toContain(enUsers.users['field-email-invalid']);
    });

    it('falls back when the requested language is not supported', async () => {
        const response = await signupWith('de').send(INVALID_SIGNUP);

        expect(response.headers['content-language']).toBe('en');
        expect(messagesOf(response.body)).toContain(enUsers.users['field-email-invalid']);
    });

    it('honours q-weights rather than header order', async () => {
        const response = await signupWith('en;q=0.8,it;q=0.9').send(INVALID_SIGNUP);

        expect(response.headers['content-language']).toBe('it');
        expect(messagesOf(response.body)).toContain(itUsers.users['field-email-invalid']);
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
     * `upload.single()` consumes the request stream, so the rest of the chain resumes from a
     * socket read callback whose async context predates `attachLocale` — the ALS store is gone
     * and the Zod thunks silently resolve against the boot language. The response still carried
     * `Content-Language: it`, because the header is set by the middleware, which does run. The
     * cases above all post JSON, where `express.json()` has already buffered the body before
     * `attachLocale`, so nothing awaits the stream afterwards and none of them could see it.
     *
     * `src/infrastructure/adapters/storage.ts` re-enters the store after multer; this is the guard.
     */
    it('keeps the locale across a multipart upload', async () => {
        const response = await signupWith('it')
            .field('email', INVALID_SIGNUP.email)
            .field('username', INVALID_SIGNUP.username)
            .field('password', INVALID_SIGNUP.password)
            .field('passwordConfirm', INVALID_SIGNUP.passwordConfirm);

        expect(response.status).toBe(422);
        expect(response.headers['content-language']).toBe('it');
        expect(messagesOf(response.body)).toContain(itUsers.users['field-email-invalid']);
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
            const dictionaryUsers = language === 'it' ? itUsers.users : enUsers.users;

            expect(response.headers['content-language']).toBe(language);
            expect(messagesOf(response.body)).toContain(dictionaryUsers['field-email-invalid']);
        }
    });
});

/**
 * The OTHER validation path, in the same language.
 *
 * `POST /account/signup` validates in the service against `zodUserSchema`, whose messages are
 * `t(...)` per field. `POST /feedback/contact` validates in the controller against the
 * orval-generated schema, which declares no messages at all — so it answered in Zod's own English
 * whatever the client asked for, while signup answered in Italian. Same 422, same client, two
 * languages, and which one you got depended on the endpoint.
 *
 * `@infrastructure/http/validation-messages` closes it by translating Zod's built-in refusals
 * globally, without touching the codegen. Public and rejected before any repository call, so like
 * the signup cases above these need no database.
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
        expect(messagesOf(response.body)).toContain(itShared.validation['format-email']);
    });

    it('answers in English when the client asks for nothing', async () => {
        const response = await contactWith().send(INVALID_CONTACT);

        expect(response.status).toBe(422);
        expect(messagesOf(response.body)).toContain(enShared.validation['format-email']);
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

    it('still lets a field with its own copy win over the shared map', async () => {
        // Precedence, asserted rather than assumed: `zodUserSchema` declares `t(...)` per field,
        // and the global map must not overwrite the specific sentence with a generic one.
        const response = await signupWith('it').send(INVALID_SIGNUP);

        expect(messagesOf(response.body)).toContain(itUsers.users['field-email-invalid']);
        expect(messagesOf(response.body)).not.toContain(itShared.validation['format-email']);
    });
});
