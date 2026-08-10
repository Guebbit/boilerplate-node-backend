/**
 * Integration tests for per-request locale negotiation.
 *
 * `POST /account/signup` is the subject because its validation rejects before any repository call,
 * so these drive the real middleware stack — `attachLocale`, the routes, the Zod thunks and the
 * error shaping in `rejectResponse` — with no database, Redis or queue.
 *
 * The concurrency case is the one that matters most: it is what stops `@core/i18n` being
 * "simplified" into an `i18next.changeLanguage()` call, which mutates one global and is async, so
 * two overlapping requests in different languages would answer each other's.
 */
import { api } from '../helpers/http';
import enTranslation from '../../src/locales/en.json';
import itTranslation from '../../src/locales/it.json';

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
        expect(messagesOf(response.body)).toContain(
            itTranslation.signup['user-field-email-invalid']
        );
    });

    it('answers in English when the client asks for nothing', async () => {
        const response = await signupWith().send(INVALID_SIGNUP);

        expect(response.headers['content-language']).toBe('en');
        expect(messagesOf(response.body)).toContain(
            enTranslation.signup['user-field-email-invalid']
        );
    });

    it('falls back when the requested language is not supported', async () => {
        const response = await signupWith('de').send(INVALID_SIGNUP);

        expect(response.headers['content-language']).toBe('en');
        expect(messagesOf(response.body)).toContain(
            enTranslation.signup['user-field-email-invalid']
        );
    });

    it('honours q-weights rather than header order', async () => {
        const response = await signupWith('en;q=0.8,it;q=0.9').send(INVALID_SIGNUP);

        expect(response.headers['content-language']).toBe('it');
        expect(messagesOf(response.body)).toContain(
            itTranslation.signup['user-field-email-invalid']
        );
    });

    it('matches a region tag against its base language', async () => {
        const response = await signupWith('it-CH').send(INVALID_SIGNUP);

        expect(response.headers['content-language']).toBe('it');
    });

    it('declares Accept-Language in Vary, so a shared cache cannot mix languages', async () => {
        const response = await signupWith('it').send(INVALID_SIGNUP);

        expect(String(response.headers.vary).toLowerCase()).toContain('accept-language');
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
     * `src/core/adapters/storage.ts` re-enters the store after multer; this is the guard.
     */
    it('keeps the locale across a multipart upload', async () => {
        const response = await signupWith('it')
            .field('email', INVALID_SIGNUP.email)
            .field('username', INVALID_SIGNUP.username)
            .field('password', INVALID_SIGNUP.password)
            .field('passwordConfirm', INVALID_SIGNUP.passwordConfirm);

        expect(response.status).toBe(422);
        expect(response.headers['content-language']).toBe('it');
        expect(messagesOf(response.body)).toContain(
            itTranslation.signup['user-field-email-invalid']
        );
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
            const dictionary = language === 'it' ? itTranslation : enTranslation;

            expect(response.headers['content-language']).toBe(language);
            expect(messagesOf(response.body)).toContain(
                dictionary.signup['user-field-email-invalid']
            );
        }
    });
});
