/**
 * @module
 * Contract tests for /locales — both tiers, and the boundary between them. The manifest's SHAPE
 * is the only thing `openapi.yaml` can pin, since which languages are deployed is runtime state;
 * the property really being guarded is that a language existing in the database never implies the
 * API can answer in it, and the assertions below are written so a change collapsing the two tiers
 * fails here rather than in a client.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { listSupportedLocales, getDefaultLocale, getFallbackLocale } from '@infrastructure/i18n';
import { readLocaleDictionary } from '@infrastructure/i18n';
import { MISSING_ID } from '@tests/ids';
import { createLanguage, PORTUGUESE } from './support';
import itTranslation from '../../../../locales/it.json';

setupTestDb();

/** Adds one key through the real route and returns its id. Client-side unless told otherwise. */
const createEntry = async (
    bearer: string,
    tag: string,
    key: string,
    value: string,
    tenant = 'demo-fe'
) => {
    const response = await api()
        .post(`/locales/${tag}/tenants/${tenant}/entries`)
        .set('Authorization', bearer)
        .send({ key, value });

    if (response.status !== 201)
        throw new Error(
            `entry setup failed: POST /locales/${tag}/tenants/${tenant}/entries returned ${response.status} — ` +
                JSON.stringify(response.body)
        );

    return response.body.data.id as string;
};

describe('GET /locales', () => {
    it('matches the contract', async () => {
        const response = await api().get('/locales');

        expect(response.status).toBe(200);
    });

    it('reports every deployed language as one the API can answer in', async () => {
        const response = await api().get('/locales');

        expect(response.body.data.locales.map(({ tag }: { tag: string }) => tag)).toEqual(
            listSupportedLocales()
        );
        for (const row of response.body.data.locales) expect(row.tenants).toContain('demo-be');

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

        expect(portuguese.tenants).toEqual(['demo-fe']);
        expect(portuguese.source).toBe('dynamic');
    });

    it('merges a language present in both tiers into one row with both tenants', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer, { tag: 'it', name: 'Italian', nativeName: 'Italiano' });

        const response = await api().get('/locales');
        const italian = response.body.data.locales.filter(
            ({ tag }: { tag: string }) => tag === 'it'
        );

        expect(italian).toHaveLength(1);
        expect(italian[0].tenants).toEqual(['demo-be', 'demo-fe']);
        expect(italian[0].source).toBe('both');
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
        await api().patch('/locales/pt').set('Authorization', bearer).send({ active: false });

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
    });

    it('serves the API’s own dictionary, shared keys and module keys together', async () => {
        const response = await api().get('/locales/it');

        expect(response.body.data.locale).toBe('it');
        // The shared half — `generic.*` in particular, which the paired frontend reads by name.
        expect(response.body.data.messages).toMatchObject(itTranslation);
        // The module half: a client rendering API copy needs domain messages on the wire too, not
        // just i18next's in-memory resources. Asserted as "extra namespaces" rather than by name,
        // since this test doesn't know which modules exist.
        const shared = new Set(Object.keys(itTranslation));
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
        await api().patch('/locales/pt').set('Authorization', bearer).send({ active: false });

        const hidden = await api().get('/locales/pt/messages');
        const unknown = await api().get('/locales/zz/messages');

        expect(hidden.status).toBe(404);
        expect(unknown.status).toBe(404);
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
    });

    it('409s on a duplicate tag', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .post('/locales')
            .set('Authorization', bearer)
            .send({ tag: 'pt', name: 'Portuguese', nativeName: 'Português' });

        expect(response.status).toBe(409);
    });

    it('422s on a tag that is not a language tag', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post('/locales')
            .set('Authorization', bearer)
            .send({ tag: 'Portuguese!', name: 'Portuguese', nativeName: 'Português' });

        expect(response.status).toBe(422);
    });

    /*
     * Found by the fuzz suite: a single space satisfies `minLength: 1`, then trims to empty at a
     * column declared `required`, and Mongoose's ValidationError answered 500 for a stray space.
     * JSON Schema can't express "non-empty after trim", so the check lives in the controller.
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
    });

    it('403s for a non-admin caller', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .post('/locales')
            .set('Authorization', bearer)
            .send({ tag: 'pt', name: 'Portuguese', nativeName: 'Português' });

        expect(response.status).toBe(403);
    });
});

describe('PUT /locales/:locale', () => {
    it('matches the contract when replacing every writable field', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api().put('/locales/pt').set('Authorization', bearer).send({
            name: 'Portuguese',
            nativeName: 'Português (Brasil)',
            direction: 'ltr',
            active: false
        });

        expect(response.status).toBe(200);
        expect(response.body.data.nativeName).toBe('Português (Brasil)');
        expect(response.body.data.active).toBe(false);
    });

    // A PUT body IS the new resource (RFC 9110 §9.3.4) — none of this resource's four fields has
    // a legal "cleared" state, so all four are required.
    it('refuses a PUT body missing a required field', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .put('/locales/pt')
            .set('Authorization', bearer)
            .send({ nativeName: 'Português (Brasil)', active: false });

        expect(response.status).toBe(422);
    });

    it('404s for a language that does not exist', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .put('/locales/zz')
            .set('Authorization', bearer)
            .send({ name: 'X', nativeName: 'X', direction: 'ltr', active: false });

        expect(response.status).toBe(404);
    });

    it('422s on a whitespace-only name, the same as the create route', async () => {
        // Asserted on both routes because they parse separately: fixing one and not the other is
        // the shape this defect had in the first place.
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .put('/locales/pt')
            .set('Authorization', bearer)
            .send({ name: '   ', nativeName: 'Português', direction: 'ltr', active: true });

        expect(response.status).toBe(422);
    });

    it('403s for a non-admin caller', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .put('/locales/pt')
            .set('Authorization', bearer)
            .send({ name: 'X', nativeName: 'X', direction: 'ltr', active: false });

        expect(response.status).toBe(403);
    });
});

describe('PATCH /locales/:locale', () => {
    it('matches the contract, leaving omitted fields unchanged', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .patch('/locales/pt')
            .set('Authorization', bearer)
            .send({ nativeName: 'Português (Brasil)', active: false });

        expect(response.status).toBe(200);
        expect(response.body.data.nativeName).toBe('Português (Brasil)');
        expect(response.body.data.active).toBe(false);
        expect(response.body.data.name).toBe('Portuguese');
    });

    it('404s for a language that does not exist', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .patch('/locales/zz')
            .set('Authorization', bearer)
            .send({ active: false });

        expect(response.status).toBe(404);
    });

    it('422s on a whitespace-only name, the same as the create route', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .patch('/locales/pt')
            .set('Authorization', bearer)
            .send({ name: '   ' });

        expect(response.status).toBe(422);
    });

    it('403s for a non-admin caller', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .patch('/locales/pt')
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
    });

    it('matches the contract once the language is inactive, and takes its entries', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);
        await createEntry(bearer, 'pt', 'cart.title', 'Carrinho');
        await api().patch('/locales/pt').set('Authorization', bearer).send({ active: false });

        const response = await api().delete('/locales/pt').set('Authorization', bearer);

        expect(response.status).toBe(200);

        const gone = await api().get('/locales/pt/messages');
        expect(gone.status).toBe(404);
    });

    it('404s for a language that does not exist', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api().delete('/locales/zz').set('Authorization', bearer);

        expect(response.status).toBe(404);
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
    });

    it('matches the contract when the language has no entries yet', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api().get('/locales/pt/entries').set('Authorization', bearer);

        expect(response.body.data.items).toHaveLength(0);
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
        }
    );

    it('401s unauthenticated — the rows are an admin screen, unlike the dictionary', async () => {
        const response = await api().get('/locales/pt/entries');

        expect(response.status).toBe(401);
    });

    it('403s for a non-admin caller', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().get('/locales/pt/entries').set('Authorization', bearer);

        expect(response.status).toBe(403);
    });

    it('answers an empty page for a tenant nobody configured, rather than every tenant', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);
        await createEntry(bearer, 'pt', 'cart.title', 'Carrinho');

        const response = await api()
            .get('/locales/pt/entries?tenant=nobody')
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toEqual([]);
    });

    it('422s a tenant outside the id pattern, instead of dropping the filter', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .get('/locales/pt/entries?tenant=Not Valid')
            .set('Authorization', bearer);

        expect(response.status).toBe(422);
    });
});

describe('POST /locales/:locale/tenants/:tenant/entries', () => {
    it('matches the contract', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .post('/locales/pt/tenants/demo-fe/entries')
            .set('Authorization', bearer)
            .send({ key: 'cart.title', value: 'Carrinho' });

        expect(response.status).toBe(201);
    });

    it('409s on a duplicate key', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);
        await createEntry(bearer, 'pt', 'cart.title', 'Carrinho');

        const response = await api()
            .post('/locales/pt/tenants/demo-fe/entries')
            .set('Authorization', bearer)
            .send({ key: 'cart.title', value: 'Outro' });

        expect(response.status).toBe(409);
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
            .post('/locales/pt/tenants/demo-fe/entries')
            .set('Authorization', bearer)
            .send({ key: 'products.list', value: 'Lista' });

        expect(response.status).toBe(409);
    });

    it('409s in the other direction too', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);
        await createEntry(bearer, 'pt', 'products.list', 'Lista');

        const response = await api()
            .post('/locales/pt/tenants/demo-fe/entries')
            .set('Authorization', bearer)
            .send({ key: 'products.list.title', value: 'Catálogo' });

        expect(response.status).toBe(409);
    });

    it('422s on an empty key', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .post('/locales/pt/tenants/demo-fe/entries')
            .set('Authorization', bearer)
            .send({ key: '', value: 'x' });

        expect(response.status).toBe(422);
    });

    it('404s for a language that does not exist', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post('/locales/zz/tenants/demo-fe/entries')
            .set('Authorization', bearer)
            .send({ key: 'cart.title', value: 'x' });

        expect(response.status).toBe(404);
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
    });

    it('matches the contract when removing one key', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);
        const entryId = await createEntry(bearer, 'pt', 'cart.title', 'Carrinho');

        const response = await api()
            .delete(`/locales/pt/entries/${entryId}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);

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
    });

    it('422s on a malformed entry id rather than answering 500', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .put('/locales/pt/entries/not-an-id')
            .set('Authorization', bearer)
            .send({ value: 'x' });

        expect(response.status).toBe(422);
    });

    it('422s on a malformed entry id for the delete route too', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .delete('/locales/pt/entries/not-an-id')
            .set('Authorization', bearer);

        expect(response.status).toBe(422);
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
 * The two bulk routes, asserted AS A PAIR: "does an import delete keys it didn't mention" is the
 * semantic most likely implemented backwards, and either half alone passes against a build that
 * ignores the distinction. Together they cannot.
 */
describe('the tenant is the path (WM-D11)', () => {
    it('sends the created entry Location, addressed by its id', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .post('/locales/pt/tenants/demo-fe/entries')
            .set('Authorization', bearer)
            .send({ key: 'cart.title', value: 'Carrinho' });

        expect(response.headers.location).toBe(
            `/locales/pt/entries/${String(response.body.data.id)}`
        );
    });

    // A PUT replaces exactly what the GET on the same URI lists — the point of the path segment.
    it('lists at the same address it replaces, and leaves the other tenants alone', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);
        await createEntry(bearer, 'pt', 'cart.title', 'Carrinho');
        await createEntry(bearer, 'pt', 'cart.title', 'Carrinho (be)', 'demo-be');

        const replaced = await api()
            .put('/locales/pt/tenants/demo-fe/entries')
            .set('Authorization', bearer)
            .send({ entries: [{ key: 'cart.empty', value: 'Vazio' }] });
        const slice = await api()
            .get('/locales/pt/tenants/demo-fe/entries')
            .set('Authorization', bearer);
        const everything = await api().get('/locales/pt/entries').set('Authorization', bearer);

        expect(replaced.status).toBe(200);
        expect(slice.body.data.items.map(({ key }: { key: string }) => key)).toEqual([
            'cart.empty'
        ]);
        expect(everything.body.data.items).toHaveLength(2);
    });

    it('422s a tenant the deployment does not configure', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .put('/locales/pt/tenants/nobody/entries')
            .set('Authorization', bearer)
            .send({ entries: [] });

        expect(response.status).toBe(422);
    });

    it('refuses a tenant in the body — it is no longer a field', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .post('/locales/pt/tenants/demo-fe/entries')
            .set('Authorization', bearer)
            .send({ tenant: 'demo-fe', key: 'cart.title', value: 'x' });

        expect(response.status).toBe(422);
    });
});

describe('PUT vs PATCH /locales/:locale/tenants/:tenant/entries', () => {
    it('PUT removes what was not sent', async () => {
        const { bearer } = await authenticateAs('admin');
        await seedTwoKeys(bearer);

        const response = await api()
            .put('/locales/pt/tenants/demo-fe/entries')
            .set('Authorization', bearer)
            .send({ entries: [{ key: 'cart.title', value: 'O seu carrinho' }] });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ created: 0, updated: 1, removed: 1 });

        const dictionary = await api().get('/locales/pt/messages');
        expect(dictionary.body.data.messages).toEqual({ cart: { title: 'O seu carrinho' } });
    });

    it('PATCH does not', async () => {
        const { bearer } = await authenticateAs('admin');
        await seedTwoKeys(bearer);

        const response = await api()
            .patch('/locales/pt/tenants/demo-fe/entries')
            .set('Authorization', bearer)
            .send({ entries: [{ key: 'cart.title', value: 'O seu carrinho' }] });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ created: 0, updated: 1, removed: 0 });

        const dictionary = await api().get('/locales/pt/messages');
        expect(dictionary.body.data.messages).toEqual({
            cart: { title: 'O seu carrinho', empty: 'Vazio' }
        });
    });

    it('reports the revision the import produced, so a client need not re-read the manifest', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .patch('/locales/pt/tenants/demo-fe/entries')
            .set('Authorization', bearer)
            .send({ entries: [{ key: 'cart.title', value: 'Carrinho' }] });

        expect(response.body.data.revision).toBe(1);
    });

    it('409s on a batch that collides with itself', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .patch('/locales/pt/tenants/demo-fe/entries')
            .set('Authorization', bearer)
            .send({
                entries: [
                    { key: 'products.list', value: 'Lista' },
                    { key: 'products.list.title', value: 'Catálogo' }
                ]
            });

        expect(response.status).toBe(409);
    });

    it('422s on a body that is not an entry list', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .put('/locales/pt/tenants/demo-fe/entries')
            .set('Authorization', bearer)
            .send({ entries: [{ key: 'cart.title' }] });

        expect(response.status).toBe(422);
    });

    it('401s unauthenticated', async () => {
        const response = await api()
            .put('/locales/pt/tenants/demo-fe/entries')
            .send({ entries: [] });

        expect(response.status).toBe(401);
    });
});

/**
 * The independence rule, from the API's side: a language works end to end with no client
 * involvement — no route change, no list to update, no row in any collection. Uses Italian rather
 * than Spanish deliberately: Spanish is now the OPPOSITE case, existing only as database rows
 * (see `scenarios/locales.ts`).
 */
describe('a locale only the API has', () => {
    it('answers validation errors in Italian for Accept-Language: it', async () => {
        const response = await api().post('/account/signup').set('Accept-Language', 'it').send({
            email: 'not-an-email',
            username: 'ab',
            password: 'x',
            passwordConfirm: 'x'
        });

        expect(response.status).toBe(422);
        expect(response.headers['content-language']).toBe('it');
        // The expected copy is read from the MERGED dictionary rather than imported from the
        // module that ships it: this spec is about locale negotiation, and it should not be the
        // thing that breaks when a domain it merely borrows an endpoint from is deleted.
        const italian = readLocaleDictionary('it') as { users: Record<string, string> };

        expect(response.body.errors.map(({ message }: { message: string }) => message)).toContain(
            italian.users['field-email-invalid']
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

describe('GET /locales/tenants', () => {
    it('matches the contract and lists the demo pair, the backend first', async () => {
        const response = await api().get('/locales/tenants');

        expect(response.status).toBe(200);
        expect(response.body.data.tenants).toEqual([
            { id: 'demo-be', label: 'API', kind: 'backend' },
            { id: 'demo-fe', label: 'Frontend', kind: 'frontend' }
        ]);
    });

    it('is not a language called "tenants" — the static route wins over the parameter', async () => {
        // The one ordering mistake the router comment warns about.
        const response = await api().get('/locales/tenants');

        expect(response.body.data.messages).toBeUndefined();
    });
});

describe('tenants on the write routes', () => {
    it('refuses an entry for a tenant nobody configured, with a 422', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .post('/locales/pt/tenants/nobody/entries')
            .set('Authorization', bearer)
            .send({ key: 'cart.title', value: 'Carrinho' });

        expect(response.status).toBe(422);
    });

    it('refuses a bulk import for a tenant nobody configured, before writing anything', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);

        const response = await api()
            .patch('/locales/pt/tenants/nobody/entries')
            .set('Authorization', bearer)
            .send({ entries: [{ key: 'cart.title', value: 'Carrinho' }] });

        expect(response.status).toBe(422);

        const listed = await api().get('/locales/pt/entries').set('Authorization', bearer);
        expect(listed.body.data.items).toEqual([]);
    });

    it('keeps the same key apart across two tenants', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);
        await createEntry(bearer, 'pt', 'generic.title', 'do frontend', 'demo-fe');
        await createEntry(bearer, 'pt', 'generic.title', 'do backend', 'demo-be');

        const listed = await api()
            .get('/locales/pt/entries?tenant=demo-be')
            .set('Authorization', bearer);

        expect(listed.body.data.items.map(({ value }: { value: string }) => value)).toEqual([
            'do backend'
        ]);
    });
});

describe('GET /locales/:locale/messages?tenant=', () => {
    it('serves the named frontend tenant and never the backend one', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);
        await createEntry(bearer, 'pt', 'cart.title', 'Carrinho', 'demo-fe');
        await createEntry(bearer, 'pt', 'generic.error-internal', 'Falha', 'demo-be');

        const named = await api().get('/locales/pt/messages?tenant=demo-fe');
        expect(named.status).toBe(200);
        expect(named.body.data.messages).toEqual({ cart: { title: 'Carrinho' } });

        // The backend's rows are layered internally; asking for them is asking for nothing.
        const backend = await api().get('/locales/pt/messages?tenant=demo-be');
        expect(backend.status).toBe(404);

        const stranger = await api().get('/locales/pt/messages?tenant=nobody');
        expect(stranger.status).toBe(404);
    });
});
