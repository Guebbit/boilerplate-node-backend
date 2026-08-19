/**
 * Contract tests for /locales — both tiers, and the boundary between them.
 *
 * The manifest exists so a client can ask what a DEPLOYMENT offers, which is runtime state and
 * cannot be an enum in `openapi.yaml`: the answer depends on which dictionary files were deployed
 * and which languages have been registered since. That makes the response SHAPE the only thing the
 * contract can pin, and pinning it is what lets a client rely on the endpoint at all.
 *
 * The property this suite is really guarding is the one §2 of the design rests on: a language
 * existing in the database never implies the API can answer in it. Two endpoints one segment apart
 * serve two different keyspaces from two different stores, and the assertions below are written so
 * that a change collapsing them fails here rather than in a client.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { listSupportedLocales, getDefaultLocale, getFallbackLocale } from '@infrastructure/i18n';
import { readLocaleDictionary } from '@infrastructure/i18n';
import esTranslation from '../../../../locales/es.json';

setupTestDb();

/** A valid ObjectId that is guaranteed not to exist — the 404 branch, not the 422 one. */
const MISSING_ID = '65dc8a99604c307b702b5ccc';

/** The language every case below registers, unless it says otherwise. */
const PORTUGUESE = { tag: 'pt', name: 'Portuguese', nativeName: 'Português' };

/** Registers a language through the real route and returns its tag. */
const createLanguage = async (bearer: string, body: Record<string, unknown> = PORTUGUESE) => {
    const response = await api().post('/locales').set('Authorization', bearer).send(body);

    if (response.status !== 201)
        throw new Error(
            `locale setup failed: POST /locales returned ${response.status} — ` +
                JSON.stringify(response.body)
        );

    return response.body.data.tag as string;
};

/** Adds one key through the real route and returns its id. Client-side unless told otherwise. */
const createEntry = async (
    bearer: string,
    tag: string,
    key: string,
    value: string,
    scope: 'api' | 'app' = 'app'
) => {
    const response = await api()
        .post(`/locales/${tag}/entries`)
        .set('Authorization', bearer)
        .send({ scope, key, value });

    if (response.status !== 201)
        throw new Error(
            `entry setup failed: POST /locales/${tag}/entries returned ${response.status} — ` +
                JSON.stringify(response.body)
        );

    return response.body.data.id as string;
};

describe('GET /locales', () => {
    it('matches the contract', async () => {
        const response = await api().get('/locales');

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });

    it('reports every deployed language as one the API can answer in', async () => {
        const response = await api().get('/locales');

        expect(response.body.data.locales.map(({ tag }: { tag: string }) => tag)).toEqual(
            listSupportedLocales()
        );
        for (const row of response.body.data.locales) expect(row.scopes).toContain('api');

        expect(response.body.data.default).toBe(getDefaultLocale());
        expect(response.body.data.fallback).toBe(getFallbackLocale());
    });

    /*
     * The distinction the whole manifest exists to express. A client seeing `pt` must be able to
     * tell that it may DOWNLOAD a Portuguese dictionary and may NOT expect Portuguese error
     * messages — those are different questions, and a flat list of tags answers neither.
     */
    it('reports a database-only language as downloadable but not answerable', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api().get('/locales');
        const portuguese = response.body.data.locales.find(
            ({ tag }: { tag: string }) => tag === 'pt'
        );

        expect(portuguese.scopes).toEqual(['app']);
        expect(portuguese.source).toBe('dynamic');
        expect(response).toSatisfyApiSpec();
    });

    it('merges a language present in both tiers into one row with both scopes', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer, { tag: 'es', name: 'Spanish', nativeName: 'Español' });

        const response = await api().get('/locales');
        const spanish = response.body.data.locales.filter(
            ({ tag }: { tag: string }) => tag === 'es'
        );

        expect(spanish).toHaveLength(1);
        expect(spanish[0].scopes).toEqual(['api', 'app']);
        expect(spanish[0].source).toBe('both');
    });

    it('counts a language’s entries, so a half-translated one is visible at a glance', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);
        await createEntry(bearer, 'pt', 'cart.title', 'O seu carrinho');

        const response = await api().get('/locales');
        const portuguese = response.body.data.locales.find(
            ({ tag }: { tag: string }) => tag === 'pt'
        );

        expect(portuguese.entryCount).toBe(1);
        expect(portuguese.revision).toBe(1);
    });

    it('hides an inactive language entirely', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);
        await api().put('/locales/pt').set('Authorization', bearer).send({ active: false });

        const response = await api().get('/locales');

        expect(response.body.data.locales.some(({ tag }: { tag: string }) => tag === 'pt')).toBe(
            false
        );
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

    /*
     * Registering a language in the database must NOT make this endpoint answer for it. This is
     * the tier boundary stated as a test: the API's own copy comes from deployed files, and the
     * day it starts coming from a store is the day it stops being available in the outage it
     * exists for.
     */
    it('still 404s for a language that exists only in the database', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api().get('/locales/pt');

        expect(response.status).toBe(404);
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

describe('GET /locales/:locale/messages', () => {
    it('matches the contract and serves the tree a client merges', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);
        await createEntry(bearer, 'pt', 'products.list.title', 'Catálogo');
        await createEntry(bearer, 'pt', 'products.list.empty', 'Sem resultados');

        const response = await api().get('/locales/pt/messages');

        expect(response.status).toBe(200);
        expect(response.body.data.messages).toEqual({
            products: { list: { title: 'Catálogo', empty: 'Sem resultados' } }
        });
        expect(response).toSatisfyApiSpec();
    });

    it('states the revision the dictionary belongs to', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);
        await createEntry(bearer, 'pt', 'cart.title', 'Carrinho');

        const response = await api().get('/locales/pt/messages');

        expect(response.body.data.revision).toBe(1);
    });

    it('answers an empty dictionary for a language with no entries yet', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api().get('/locales/pt/messages');

        expect(response.status).toBe(200);
        expect(response.body.data.messages).toEqual({});
        expect(response).toSatisfyApiSpec();
    });

    it('is public, like every other locale read', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api().get('/locales/pt/messages');

        expect(response.status).toBe(200);
    });

    it('404s for an inactive language, exactly as for an unknown one', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);
        await api().put('/locales/pt').set('Authorization', bearer).send({ active: false });

        const hidden = await api().get('/locales/pt/messages');
        const unknown = await api().get('/locales/zz/messages');

        expect(hidden.status).toBe(404);
        expect(unknown.status).toBe(404);
        expect(hidden).toSatisfyApiSpec();
    });
});

describe('POST /locales', () => {
    it('matches the contract', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post('/locales')
            .set('Authorization', bearer)
            .send({ tag: 'pt', name: 'Portuguese', nativeName: 'Português' });

        expect(response.status).toBe(201);
        expect(response).toSatisfyApiSpec();
    });

    it('409s on a duplicate tag', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .post('/locales')
            .set('Authorization', bearer)
            .send({ tag: 'pt', name: 'Portuguese', nativeName: 'Português' });

        expect(response.status).toBe(409);
        expect(response).toSatisfyApiSpec();
    });

    it('422s on a tag that is not a language tag', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post('/locales')
            .set('Authorization', bearer)
            .send({ tag: 'Portuguese!', name: 'Portuguese', nativeName: 'Português' });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    /*
     * Found by `tests/fuzz/endpoints.fuzz.test.ts`, which is the only suite that would have: a
     * single space satisfies the contract's `minLength: 1`, then trims to the empty string at a
     * column declared `required`, and the resulting Mongoose ValidationError answered 500 — a
     * server fault reported for a stray space. JSON Schema cannot say "non-empty after trimming",
     * so the constraint lives in the controller and this is what holds it there.
     */
    it.each(['name', 'nativeName'])(
        '422s on a whitespace-only %s rather than 500',
        async (field) => {
            const { bearer } = await authenticateAs('admin');

            const response = await api()
                .post('/locales')
                .set('Authorization', bearer)
                .send({ ...PORTUGUESE, [field]: '   ' });

            expect(response.status).toBe(422);
            expect(response).toSatisfyApiSpec();
        }
    );

    it('trims the display names it does store', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post('/locales')
            .set('Authorization', bearer)
            .send({ ...PORTUGUESE, nativeName: '  Português  ' });

        expect(response.body.data.nativeName).toBe('Português');
    });

    it('401s unauthenticated', async () => {
        const response = await api()
            .post('/locales')
            .send({ tag: 'pt', name: 'Portuguese', nativeName: 'Português' });

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });

    it('403s for a non-admin caller', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .post('/locales')
            .set('Authorization', bearer)
            .send({ tag: 'pt', name: 'Portuguese', nativeName: 'Português' });

        expect(response.status).toBe(403);
        expect(response).toSatisfyApiSpec();
    });
});

describe('PUT /locales/:locale', () => {
    it('matches the contract', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .put('/locales/pt')
            .set('Authorization', bearer)
            .send({ nativeName: 'Português (Brasil)', active: false });

        expect(response.status).toBe(200);
        expect(response.body.data.nativeName).toBe('Português (Brasil)');
        expect(response.body.data.active).toBe(false);
        expect(response).toSatisfyApiSpec();
    });

    it('404s for a language that does not exist', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .put('/locales/zz')
            .set('Authorization', bearer)
            .send({ active: false });

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });

    it('422s on a whitespace-only name, the same as the create route', async () => {
        // Asserted on both routes because they parse separately: fixing one and not the other is
        // the shape this defect had in the first place.
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .put('/locales/pt')
            .set('Authorization', bearer)
            .send({ name: '   ' });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('403s for a non-admin caller', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .put('/locales/pt')
            .set('Authorization', bearer)
            .send({ active: false });

        expect(response.status).toBe(403);
    });
});

describe('DELETE /locales/:locale', () => {
    it('refuses while the language is still active', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api().delete('/locales/pt').set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the contract once the language is inactive, and takes its entries', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);
        await createEntry(bearer, 'pt', 'cart.title', 'Carrinho');
        await api().put('/locales/pt').set('Authorization', bearer).send({ active: false });

        const response = await api().delete('/locales/pt').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();

        const gone = await api().get('/locales/pt/messages');
        expect(gone.status).toBe(404);
    });

    it('404s for a language that does not exist', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api().delete('/locales/zz').set('Authorization', bearer);

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });

    it('401s unauthenticated', async () => {
        const response = await api().delete('/locales/pt');

        expect(response.status).toBe(401);
    });
});

describe('GET /locales/:locale/entries', () => {
    it('matches the contract', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);
        await createEntry(bearer, 'pt', 'cart.title', 'Carrinho');

        const response = await api().get('/locales/pt/entries').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(1);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the contract when the language has no entries yet', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api().get('/locales/pt/entries').set('Authorization', bearer);

        expect(response.body.data.items).toHaveLength(0);
        expect(response).toSatisfyApiSpec();
    });

    // Without its own pagination validation this endpoint would silently clamp `?pageSize=500`
    // while every other search endpoint answers 422 for the very same request.
    it.each(['pageSize=500', 'page=0'])(
        'rejects out-of-range pagination like every other search endpoint (%s)',
        async (queryString) => {
            const { bearer } = await authenticateAs('admin');
            await createLanguage(bearer);

            const response = await api()
                .get(`/locales/pt/entries?${queryString}`)
                .set('Authorization', bearer);

            expect(response.status).toBe(422);
            expect(response).toSatisfyApiSpec();
        }
    );

    it('401s unauthenticated — the rows are an admin screen, unlike the dictionary', async () => {
        const response = await api().get('/locales/pt/entries');

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });

    it('403s for a non-admin caller', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().get('/locales/pt/entries').set('Authorization', bearer);

        expect(response.status).toBe(403);
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /locales/:locale/entries', () => {
    it('matches the contract', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .post('/locales/pt/entries')
            .set('Authorization', bearer)
            .send({ scope: 'app', key: 'cart.title', value: 'Carrinho' });

        expect(response.status).toBe(201);
        expect(response).toSatisfyApiSpec();
    });

    it('409s on a duplicate key', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);
        await createEntry(bearer, 'pt', 'cart.title', 'Carrinho');

        const response = await api()
            .post('/locales/pt/entries')
            .set('Authorization', bearer)
            .send({ scope: 'app', key: 'cart.title', value: 'Outro' });

        expect(response.status).toBe(409);
        expect(response).toSatisfyApiSpec();
    });

    /*
     * The collision, refused at write time. Left to the read, this pair produces a dictionary
     * silently missing one of the two strings — and which one depends on insertion order.
     */
    it('409s on a key that collides with an existing one', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);
        await createEntry(bearer, 'pt', 'products.list.title', 'Catálogo');

        const response = await api()
            .post('/locales/pt/entries')
            .set('Authorization', bearer)
            .send({ scope: 'app', key: 'products.list', value: 'Lista' });

        expect(response.status).toBe(409);
        expect(response).toSatisfyApiSpec();
    });

    it('409s in the other direction too', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);
        await createEntry(bearer, 'pt', 'products.list', 'Lista');

        const response = await api()
            .post('/locales/pt/entries')
            .set('Authorization', bearer)
            .send({ scope: 'app', key: 'products.list.title', value: 'Catálogo' });

        expect(response.status).toBe(409);
    });

    it('422s on an empty key', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .post('/locales/pt/entries')
            .set('Authorization', bearer)
            .send({ scope: 'app', key: '', value: 'x' });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('404s for a language that does not exist', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post('/locales/zz/entries')
            .set('Authorization', bearer)
            .send({ scope: 'app', key: 'cart.title', value: 'x' });

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });
});

describe('PUT and DELETE /locales/:locale/entries/:entryId', () => {
    it('matches the contract when editing a value', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);
        const entryId = await createEntry(bearer, 'pt', 'cart.title', 'Carrinho');

        const response = await api()
            .put(`/locales/pt/entries/${entryId}`)
            .set('Authorization', bearer)
            .send({ value: 'O seu carrinho' });

        expect(response.status).toBe(200);
        expect(response.body.data.value).toBe('O seu carrinho');
        expect(response).toSatisfyApiSpec();
    });

    it('matches the contract when removing one key', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);
        const entryId = await createEntry(bearer, 'pt', 'cart.title', 'Carrinho');

        const response = await api()
            .delete(`/locales/pt/entries/${entryId}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();

        const dictionary = await api().get('/locales/pt/messages');
        expect(dictionary.body.data.messages).toEqual({});
    });

    it('404s for an entry that does not exist', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .put(`/locales/pt/entries/${MISSING_ID}`)
            .set('Authorization', bearer)
            .send({ value: 'x' });

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });

    it('422s on a malformed entry id rather than answering 500', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .put('/locales/pt/entries/not-an-id')
            .set('Authorization', bearer)
            .send({ value: 'x' });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('422s on a malformed entry id for the delete route too', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .delete('/locales/pt/entries/not-an-id')
            .set('Authorization', bearer);

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('403s for a non-admin caller', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .delete(`/locales/pt/entries/${MISSING_ID}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(403);
    });
});

/** A language with two keys — the starting state both bulk routes are asserted against. */
const seedTwoKeys = async (bearer: string) => {
    await createLanguage(bearer);
    await createEntry(bearer, 'pt', 'cart.title', 'Carrinho');
    await createEntry(bearer, 'pt', 'cart.empty', 'Vazio');
};

/**
 * The two bulk routes, asserted AS A PAIR.
 *
 * "Does an import delete the keys it did not mention" is the semantic most likely to be
 * implemented backwards, and either half of this pair passes on its own against a build that
 * ignores the distinction entirely. Together they cannot.
 */
describe('PUT vs PATCH /locales/:locale/entries', () => {
    it('PUT removes what was not sent', async () => {
        const { bearer } = await authenticateAs('admin');
        await seedTwoKeys(bearer);

        const response = await api()
            .put('/locales/pt/entries')
            .set('Authorization', bearer)
            .send({ scope: 'app', entries: [{ key: 'cart.title', value: 'O seu carrinho' }] });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ created: 0, updated: 1, removed: 1 });
        expect(response).toSatisfyApiSpec();

        const dictionary = await api().get('/locales/pt/messages');
        expect(dictionary.body.data.messages).toEqual({ cart: { title: 'O seu carrinho' } });
    });

    it('PATCH does not', async () => {
        const { bearer } = await authenticateAs('admin');
        await seedTwoKeys(bearer);

        const response = await api()
            .patch('/locales/pt/entries')
            .set('Authorization', bearer)
            .send({ scope: 'app', entries: [{ key: 'cart.title', value: 'O seu carrinho' }] });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ created: 0, updated: 1, removed: 0 });
        expect(response).toSatisfyApiSpec();

        const dictionary = await api().get('/locales/pt/messages');
        expect(dictionary.body.data.messages).toEqual({
            cart: { title: 'O seu carrinho', empty: 'Vazio' }
        });
    });

    it('reports the revision the import produced, so a client need not re-read the manifest', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .patch('/locales/pt/entries')
            .set('Authorization', bearer)
            .send({ scope: 'app', entries: [{ key: 'cart.title', value: 'Carrinho' }] });

        expect(response.body.data.revision).toBe(1);
    });

    it('409s on a batch that collides with itself', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .patch('/locales/pt/entries')
            .set('Authorization', bearer)
            .send({
                scope: 'app',
                entries: [
                    { key: 'products.list', value: 'Lista' },
                    { key: 'products.list.title', value: 'Catálogo' }
                ]
            });

        expect(response.status).toBe(409);
        expect(response).toSatisfyApiSpec();
    });

    it('422s on a body that is not an entry list', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .put('/locales/pt/entries')
            .set('Authorization', bearer)
            .send({ scope: 'app', entries: [{ key: 'cart.title' }] });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('401s unauthenticated', async () => {
        const response = await api().put('/locales/pt/entries').send({ scope: 'app', entries: [] });

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
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

    /*
     * And the converse, which is the guarantee the tier split is FOR: a language that exists only
     * in the database must never change what `Content-Language` says. i18next has no resource for
     * it and never will until a file is deployed, so negotiating it would be a header that lies.
     */
    it('does not start answering in a language that exists only in the database', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api().get('/locales').set('Accept-Language', 'pt');

        expect(response.headers['content-language']).toBe(getFallbackLocale());
    });
});
