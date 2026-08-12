/**
 * Contract tests for the locale discovery endpoints.
 *
 * These exist so a client can ask what a DEPLOYMENT supports, which is runtime state and cannot
 * be an enum in `openapi.yaml` — the answer depends on which dictionary files were deployed. That
 * makes the response shape the only thing the contract can pin, and pinning it is what lets a
 * client rely on the endpoint at all.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
import { listSupportedLocales, getDefaultLocale, getFallbackLocale } from '@infrastructure/i18n';
import esTranslation from '../../../../locales/es.json';
import { readLocaleDictionary } from '@infrastructure/i18n';

setupTestDb();

describe('GET /locales', () => {
    it('matches the contract', async () => {
        const response = await api().get('/locales');

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });

    it('reports the locales the deployment actually has', async () => {
        const response = await api().get('/locales');

        expect(response.body.data.locales).toEqual(listSupportedLocales());
        expect(response.body.data.default).toBe(getDefaultLocale());
        expect(response.body.data.fallback).toBe(getFallbackLocale());
    });

    it('is public — the client that needs it most is the one that just failed to authenticate', async () => {
        const response = await api().get('/locales');

        expect(response.status).toBe(200);
    });
});

describe('GET /locales/:locale', () => {
    it('matches the contract', async () => {
        const response = await api().get('/locales/en');

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });

    it('serves the API’s own dictionary, shared keys and module keys together', async () => {
        const response = await api().get('/locales/es');

        expect(response.body.data.locale).toBe('es');
        // The shared half — `generic.*` in particular, which the paired frontend reads by name.
        expect(response.body.data.messages).toMatchObject(esTranslation);
        // And the module half. A client rendering API copy itself needs the domain messages too,
        // so the merge has to reach the wire and not just `i18next`'s in-memory resources.
        //
        // Asserted as "namespaces the shared file does not have" rather than by naming a domain:
        // this module knows that modules contribute copy, not which modules exist.
        const shared = new Set(Object.keys(esTranslation));
        const contributed = Object.keys(
            response.body.data.messages as Record<string, unknown>
        ).filter((namespace) => !shared.has(namespace));

        expect(contributed.length).toBeGreaterThan(0);
    });

    it('404s for a locale this deployment does not have', async () => {
        const response = await api().get('/locales/kl');

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
    });

    /**
     * The locale goes into a filename, so the supported-list check is the traversal guard too.
     * Express normalises `..` out of a path before routing, so the realistic attempt is an
     * encoded one — either way it must not reach the filesystem.
     */
    it.each(['..%2F..%2Fpackage', '%2Fetc%2Fpasswd', 'en.json'])(
        'refuses %s rather than reading a file',
        async (attempt) => {
            const response = await api().get(`/locales/${attempt}`);

            expect(response.status).toBe(404);
        }
    );
});

/**
 * The independence rule, asserted from the API's side: Spanish works end to end with no client
 * involvement whatsoever. `es.json` was dropped into `src/locales/` and nothing else was
 * configured — no route change, no list to update.
 */
describe('a locale only the API has', () => {
    it('answers validation errors in Spanish for Accept-Language: es', async () => {
        const response = await api().post('/account/signup').set('Accept-Language', 'es').send({
            email: 'not-an-email',
            username: 'ab',
            password: 'x',
            passwordConfirm: 'x'
        });

        expect(response.status).toBe(422);
        expect(response.headers['content-language']).toBe('es');
        // The expected copy is read from the MERGED dictionary rather than imported from the
        // module that ships it: this spec is about locale negotiation, and it should not be the
        // thing that breaks when a domain it merely borrows an endpoint from is deleted.
        const spanish = readLocaleDictionary('es') as { users: Record<string, string> };

        expect(response.body.errors.map(({ message }: { message: string }) => message)).toContain(
            spanish.users['field-email-invalid']
        );
    });
});
