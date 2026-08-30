/**
 * The write paths, driven against a real database.
 *
 * These are unit tests in the sense the rest of this repo uses the word — no HTTP, no auth — but
 * they need Mongo, because every property worth pinning here is one an in-memory fake would
 * satisfy by construction: the revision counter moving in the same call as the write, a cascade
 * that spans two collections, and an import whose whole point is what it does to rows it was not
 * given.
 */

import { BACKEND, FRONTEND } from '../unit/tenants.fixture';
import { setupTestDb } from '@tests/setup-test-db';
import { makeLocale, makeLocaleEntry } from '@modules/locales/fixtures';
import { localeMessageRepository, localeRepository } from '@modules/locales/repository';
import type { LocaleDocument } from '@modules/locales/model';
import { localeService } from '@modules/locales/services';

setupTestDb();

/** A language and, optionally, some of its strings — the setup every case below starts from. */
const givenLanguage = async (
    tag: string,
    entries: Record<string, string> = {},
    overrides: { active?: boolean } = {}
) => {
    const language = await localeRepository.create(
        makeLocale({ tag, name: tag, nativeName: tag, ...overrides })
    );

    for (const [key, value] of Object.entries(entries))
        await localeMessageRepository.create(
            makeLocaleEntry({ locale: tag, tenant: FRONTEND, key, value })
        );

    return language;
};

/** One row in one tenant, written past the service so the tenant is exactly what a test says. */
const givenEntry = (locale: string, tenant: string, key: string, value: string) =>
    localeMessageRepository.create(makeLocaleEntry({ locale, tenant, key, value }));

/** The language's revision as stored right now. */
const revisionOf = async (tag: string): Promise<number> => {
    const language = await localeRepository.findByTag(tag);
    return language?.revision ?? -1;
};

describe('the revision counter', () => {
    /*
     * The counter is a client's only signal that a dictionary it holds is stale. A write path that
     * forgot to move it would leave every client serving yesterday's translation forever, and
     * nothing else in this repo would notice — so each of the five write paths is asserted
     * separately rather than as "writing bumps it".
     */
    it('moves when a key is added', async () => {
        await givenLanguage('es');

        await localeMessageRepository.createEntry('es', FRONTEND, {
            key: 'cart.title',
            value: 'Carrito'
        });

        expect(await revisionOf('es')).toBe(1);
    });

    it('moves when a value is edited', async () => {
        await givenLanguage('es', { 'cart.title': 'Carrito' });
        const entry = await localeMessageRepository.findOne({ locale: 'es' });

        await localeMessageRepository.saveEntryValue(entry!, 'Tu carrito');

        expect(await revisionOf('es')).toBe(1);
    });

    it('moves when a key is removed', async () => {
        await givenLanguage('es', { 'cart.title': 'Carrito' });
        const entry = await localeMessageRepository.findOne({ locale: 'es' });

        await localeMessageRepository.removeEntry(entry!);

        expect(await revisionOf('es')).toBe(1);
    });

    it('moves once for a whole import, not once per row', async () => {
        await givenLanguage('es');

        await localeMessageRepository.importEntries(
            'es',
            FRONTEND,
            [
                { key: 'a', value: '1' },
                { key: 'b', value: '2' },
                { key: 'c', value: '3' }
            ],
            { replace: false }
        );

        expect(await revisionOf('es')).toBe(1);
    });

    it('does NOT move on a read', async () => {
        await givenLanguage('es', { 'cart.title': 'Carrito' });

        await localeService.readMessages('es');
        await localeService.searchEntries('es');

        expect(await revisionOf('es')).toBe(0);
    });

    it('leaves the other languages alone', async () => {
        await givenLanguage('es');
        await givenLanguage('it');

        await localeMessageRepository.createEntry('es', FRONTEND, {
            key: 'cart.title',
            value: 'Carrito'
        });

        expect(await revisionOf('it')).toBe(0);
    });
});

describe('importEntries', () => {
    it('counts what it created and what it overwrote', async () => {
        await givenLanguage('es', { 'cart.title': 'Carrito' });

        const { counts } = await localeMessageRepository.importEntries(
            'es',
            FRONTEND,
            [
                { key: 'cart.title', value: 'Tu carrito' },
                { key: 'cart.empty', value: 'Vacío' }
            ],
            { replace: false }
        );

        expect(counts).toEqual({ created: 1, updated: 1, removed: 0 });
    });

    /*
     * The pair this whole feature is most likely to get backwards, asserted as a pair on purpose:
     * either assertion alone passes against an implementation that ignores the flag.
     */
    it('deletes what the body did not name, when replacing', async () => {
        await givenLanguage('es', { 'cart.title': 'Carrito', 'cart.empty': 'Vacío' });

        const { counts } = await localeMessageRepository.importEntries(
            'es',
            FRONTEND,
            [{ key: 'cart.title', value: 'Tu carrito' }],
            { replace: true }
        );

        expect(counts.removed).toBe(1);
        expect(await localeMessageRepository.listKeys('es', FRONTEND)).toEqual(['cart.title']);
    });

    it('leaves what the body did not name, when merging', async () => {
        await givenLanguage('es', { 'cart.title': 'Carrito', 'cart.empty': 'Vacío' });

        const { counts } = await localeMessageRepository.importEntries(
            'es',
            FRONTEND,
            [{ key: 'cart.title', value: 'Tu carrito' }],
            { replace: false }
        );

        const remaining = await localeMessageRepository.listKeys('es', FRONTEND);

        expect(counts.removed).toBe(0);
        expect(remaining.toSorted()).toEqual(['cart.empty', 'cart.title']);
    });

    it('empties a language when a replace sends nothing', async () => {
        // The honest reading of "the whole set becomes what the body carries". It is also why the
        // route sits behind an admin token and an audit record rather than behind a confirmation.
        await givenLanguage('es', { 'cart.title': 'Carrito' });

        const { counts } = await localeMessageRepository.importEntries('es', FRONTEND, [], {
            replace: true
        });

        expect(counts.removed).toBe(1);
        expect(await localeMessageRepository.listKeys('es', FRONTEND)).toEqual([]);
    });

    it('touches only the language it was given', async () => {
        await givenLanguage('es', { 'cart.title': 'Carrito' });
        await givenLanguage('it', { 'cart.title': 'Carrello' });

        await localeMessageRepository.importEntries('es', FRONTEND, [], { replace: true });

        expect(await localeMessageRepository.listKeys('it', FRONTEND)).toEqual(['cart.title']);
    });
});

describe('deleting a language', () => {
    it('refuses while it is still active', async () => {
        await givenLanguage('es', { 'cart.title': 'Carrito' });

        const result = await localeService.deleteLanguage('es');

        expect(result.success).toBe(false);
        expect(result.status).toBe(409);
        // Nothing was destroyed on the way to the refusal.
        expect(await localeMessageRepository.listKeys('es', FRONTEND)).toEqual(['cart.title']);
    });

    it('cascades its entries once it is inactive', async () => {
        await givenLanguage(
            'es',
            { 'cart.title': 'Carrito', 'cart.empty': 'Vacío' },
            {
                active: false
            }
        );

        const result = await localeService.deleteLanguage('es');

        expect(result.success).toBe(true);
        expect(result.data).toEqual({ removedEntries: 2 });
        expect(await localeRepository.findByTag('es')).toBeNull();
        expect(await localeMessageRepository.listKeys('es', FRONTEND)).toEqual([]);
    });

    it('leaves another language’s strings standing', async () => {
        await givenLanguage('es', { 'cart.title': 'Carrito' }, { active: false });
        await givenLanguage('it', { 'cart.title': 'Carrello' });

        await localeService.deleteLanguage('es');

        expect(await localeMessageRepository.listKeys('it', FRONTEND)).toEqual(['cart.title']);
    });

    it('404s for a language that was never registered', async () => {
        const result = await localeService.deleteLanguage('zz');

        expect(result.status).toBe(404);
    });
});

describe('readMessages', () => {
    it('builds the tree a client downloads, and states the revision it belongs to', async () => {
        await givenLanguage('es', {
            'products.list.title': 'Catálogo',
            'products.list.empty': 'Sin resultados'
        });

        const result = await localeService.readMessages('es');

        expect(result.data).toEqual({
            locale: 'es',
            revision: 0,
            messages: { products: { list: { title: 'Catálogo', empty: 'Sin resultados' } } }
        });
    });

    /*
     * An inactive language answers exactly as an unknown one. A 403, or a 200 with nothing in it,
     * would both tell an anonymous caller that the language exists — which is the one thing a
     * draft translation is being kept from doing.
     */
    it('404s for an inactive language, indistinguishably from an unknown one', async () => {
        await givenLanguage('fr', { 'cart.title': 'Panier' }, { active: false });

        const hidden = await localeService.readMessages('fr');
        const unknown = await localeService.readMessages('zz');

        expect(hidden.status).toBe(404);
        expect(unknown.status).toBe(404);
    });
});

describe('createEntry', () => {
    it('refuses a key the language already has', async () => {
        await givenLanguage('es', { 'cart.title': 'Carrito' });

        const result = await localeService.createEntry('es', {
            tenant: FRONTEND,
            key: 'cart.title',
            value: 'Otro'
        });

        expect(result.status).toBe(409);
    });

    it('refuses a key that collides with one already stored', async () => {
        await givenLanguage('es', { 'products.list.title': 'Catálogo' });

        const result = await localeService.createEntry('es', {
            tenant: FRONTEND,
            key: 'products.list',
            value: 'Lista'
        });

        expect(result.status).toBe(409);
    });

    it('refuses an unusable key with a 422 rather than a 409', async () => {
        // A different answer on purpose: a collision is a statement about what is already there,
        // an unsafe key is a statement about the key itself, and a client can only fix one of them
        // by looking at the other rows.
        await givenLanguage('es');

        const result = await localeService.createEntry('es', {
            tenant: FRONTEND,
            key: '__proto__.title',
            value: 'x'
        });

        expect(result.status).toBe(422);
    });

    it('accepts a key that merely shares a prefix without being an ancestor', async () => {
        await givenLanguage('es', { 'cart.title': 'Carrito' });

        const result = await localeService.createEntry('es', {
            tenant: FRONTEND,
            key: 'cart.titlebar',
            value: 'Barra'
        });

        expect(result.success).toBe(true);
    });
});

describe('importEntries, through the service', () => {
    it('refuses a batch that collides with itself, before writing any of it', async () => {
        await givenLanguage('es');

        const result = await localeService.importEntries(
            'es',
            FRONTEND,
            [
                { key: 'products.list', value: 'Lista' },
                { key: 'products.list.title', value: 'Catálogo' }
            ],
            'merge'
        );

        expect(result.status).toBe(409);
        expect(await localeMessageRepository.listKeys('es', FRONTEND)).toEqual([]);
    });

    it('refuses a merge that would collide with a key it is leaving standing', async () => {
        await givenLanguage('es', { 'products.list.title': 'Catálogo' });

        const result = await localeService.importEntries(
            'es',
            FRONTEND,
            [{ key: 'products.list', value: 'Lista' }],
            'merge'
        );

        expect(result.status).toBe(409);
    });

    /*
     * The same batch is fine as a REPLACE, and that is not an inconsistency: a replace deletes
     * `products.list.title` on its way in, so there is nothing left for `products.list` to collide
     * with. Checking a batch against rows it is about to delete would refuse imports that are
     * perfectly consistent with themselves.
     */
    it('accepts as a replace what it refused as a merge, because the collision is deleted', async () => {
        await givenLanguage('es', { 'products.list.title': 'Catálogo' });

        const result = await localeService.importEntries(
            'es',
            FRONTEND,
            [{ key: 'products.list', value: 'Lista' }],
            'replace'
        );

        expect(result.success).toBe(true);
        expect(await localeMessageRepository.listKeys('es', FRONTEND)).toEqual(['products.list']);
    });

    it('refuses a batch naming one key twice', async () => {
        await givenLanguage('es');

        const result = await localeService.importEntries(
            'es',
            FRONTEND,
            [
                { key: 'cart.title', value: 'Carrito' },
                { key: 'cart.title', value: 'Tu carrito' }
            ],
            'merge'
        );

        expect(result.status).toBe(409);
    });

    it('reports the revision the import produced, so a client need not re-read the manifest', async () => {
        await givenLanguage('es');

        const result = await localeService.importEntries(
            'es',
            FRONTEND,
            [{ key: 'cart.title', value: 'Carrito' }],
            'merge'
        );

        expect(result.data).toEqual({ created: 1, updated: 0, removed: 0, revision: 1 });
    });
});

describe('searchEntries', () => {
    it('returns only the language asked for', async () => {
        await givenLanguage('es', { 'cart.title': 'Carrito' });
        await givenLanguage('it', { 'cart.title': 'Carrello' });

        const result = await localeService.searchEntries('es');

        expect(result.data?.items).toHaveLength(1);
        expect(result.data?.items[0]?.value).toBe('Carrito');
    });

    it('searches keys and values together, which is one search box to a translator', async () => {
        await givenLanguage('es', { 'cart.title': 'Carrito', 'products.list.title': 'Catálogo' });

        const byValue = await localeService.searchEntries('es', { text: 'Catálogo' });
        const byKey = await localeService.searchEntries('es', { text: 'cart.' });

        expect(byValue.data?.items.map(({ key }) => key)).toEqual(['products.list.title']);
        expect(byKey.data?.items.map(({ key }) => key)).toEqual(['cart.title']);
    });

    it('orders by key, which is how an alphabetical list is read', async () => {
        await givenLanguage('es', { 'b.key': '2', 'a.key': '1', 'c.key': '3' });

        const result = await localeService.searchEntries('es');

        expect(result.data?.items.map(({ key }) => key)).toEqual(['a.key', 'b.key', 'c.key']);
    });

    it('404s for a language that does not exist', async () => {
        const result = await localeService.searchEntries('zz');

        expect(result.status).toBe(404);
    });
});

describe('updateEntry and deleteEntry', () => {
    it('refuses to reach a row through another language’s path', async () => {
        // Two routes addressing one row is the shape this API uses everywhere; the path segment
        // being decorative is not. Without the check, `PUT /locales/it/entries/<spanish row>`
        // would silently edit Spanish.
        await givenLanguage('es', { 'cart.title': 'Carrito' });
        await givenLanguage('it');
        const entry = await localeMessageRepository.findOne({ locale: 'es' });

        const updated = await localeService.updateEntry('it', String(entry!._id), {
            value: 'Carrello'
        });
        const deleted = await localeService.deleteEntry('it', String(entry!._id));

        expect(updated.status).toBe(404);
        expect(deleted.status).toBe(404);
        expect(await localeMessageRepository.listKeys('es', FRONTEND)).toEqual(['cart.title']);
    });

    it('edits the value and leaves the key alone', async () => {
        await givenLanguage('es', { 'cart.title': 'Carrito' });
        const entry = await localeMessageRepository.findOne({ locale: 'es' });

        const result = await localeService.updateEntry('es', String(entry!._id), {
            value: 'Tu carrito'
        });

        expect(result.data?.value).toBe('Tu carrito');
        expect(result.data?.key).toBe('cart.title');
    });
});

describe('createLanguage and updateLanguage', () => {
    it('stores a tag lowercased, so one language cannot become two rows', async () => {
        const result = await localeService.createLanguage({
            tag: 'PT-BR',
            name: 'Portuguese (Brazil)',
            nativeName: 'Português (Brasil)'
        });

        expect(result.data?.tag).toBe('pt-br');
        expect(await localeRepository.findByTag('pt-br')).not.toBeNull();
    });

    it('refuses a tag that already exists', async () => {
        await givenLanguage('es');

        const result = await localeService.createLanguage({
            tag: 'es',
            name: 'Spanish',
            nativeName: 'Español'
        });

        expect(result.status).toBe(409);
    });

    it('leaves alone every field an update does not mention', async () => {
        await givenLanguage('es');

        const result = await localeService.updateLanguage('es', { active: false });

        expect(result.data?.active).toBe(false);
        expect(result.data?.name).toBe('es');
        expect(result.data?.nativeName).toBe('es');
    });
});

describe('countEntriesByLocale', () => {
    it('counts every language in one query, for the manifest', async () => {
        await givenLanguage('es', { a: '1', b: '2' });
        await givenLanguage('it', { a: '1' });

        const counts = await localeMessageRepository.countEntriesByLocale();

        expect([...counts].toSorted()).toEqual([
            ['es', 2],
            ['it', 1]
        ]);
    });
});

describe('list', () => {
    it('is not truncated by the shared list default, which would silently cap a manifest', async () => {
        // `findAll` defaults to ten rows. A deployment that grew past ten languages would have lost
        // the rest from its manifest with nothing to indicate it.
        for (let index = 0; index < 12; index++)
            await givenLanguage(`l${index}`.padEnd(2, 'x').slice(0, 2) + String(index));

        expect(await localeRepository.list(localeRepository.publicScope())).toHaveLength(12);
    });

    it('omits the inactive ones under the public scope, which keeps a draft out of the manifest', async () => {
        await givenLanguage('es');
        await givenLanguage('fr', {}, { active: false });

        const active = await localeRepository.list(localeRepository.publicScope());

        expect(active.map(({ tag }: LocaleDocument) => tag)).toEqual(['es']);
    });

    it('returns the inactive ones too when no scope narrows it — the admin read', async () => {
        await givenLanguage('es');
        await givenLanguage('fr', {}, { active: false });

        const all = await localeRepository.list();

        expect(all.map(({ tag }: LocaleDocument) => tag)).toEqual(['es', 'fr']);
    });
});

/**
 * The provider `@infrastructure/i18n` rebuilds its overlay from.
 *
 * Driven against the database because the property that matters is the SPLIT: the same key exists
 * on both sides of this collection, and a query that forgot the tenant would hand the API's overlay
 * the frontend's words. An in-memory fake would be built from the same assumption the code is.
 */
describe('readApiOverrides', () => {
    it('returns only the API’s half, nested', async () => {
        await givenLanguage('es');
        await givenEntry('es', BACKEND, 'generic.error-internal', 'Fallo interno');
        await givenEntry('es', FRONTEND, 'cart.title', 'Tu carrito');

        expect(await localeService.readApiOverrides()).toEqual({
            es: { generic: { ['error-internal']: 'Fallo interno' } }
        });
    });

    /**
     * The sharpest case the tenant column exists for: one key, two dictionaries, two different
     * strings. Without the split one would answer for both.
     */
    it('keeps the two sides apart when they share a key', async () => {
        await givenLanguage('es');
        await givenEntry('es', BACKEND, 'generic.title', 'del backend');
        await givenEntry('es', FRONTEND, 'generic.title', 'del frontend');

        expect(await localeService.readApiOverrides()).toEqual({
            es: { generic: { title: 'del backend' } }
        });
    });

    it('groups by language', async () => {
        await givenLanguage('es');
        await givenLanguage('it');
        await givenEntry('es', BACKEND, 'generic.error-internal', 'Fallo interno');
        await givenEntry('it', BACKEND, 'generic.error-internal', 'Errore interno');

        expect(await localeService.readApiOverrides()).toEqual({
            es: { generic: { ['error-internal']: 'Fallo interno' } },
            it: { generic: { ['error-internal']: 'Errore interno' } }
        });
    });

    /**
     * `active` hides a language from the PUBLIC — the manifest and the downloadable dictionary.
     * An override is neither, and deactivating a language mid-translation must not silently
     * revert backend copy that was already approved for it.
     */
    it('includes an inactive language', async () => {
        await givenLanguage('fr', {}, { active: false });
        await givenEntry('fr', BACKEND, 'generic.error-internal', 'Erreur interne');

        expect(await localeService.readApiOverrides()).toEqual({
            fr: { generic: { ['error-internal']: 'Erreur interne' } }
        });
    });

    it('returns nothing when only the client’s half has rows', async () => {
        await givenLanguage('es', { 'cart.title': 'Tu carrito' });

        expect(await localeService.readApiOverrides()).toEqual({});
    });

    /**
     * A key that is both a string and a group cannot form a tree, and the builder throws. One
     * malformed language must not take the whole overlay down with it — every other language's
     * overrides still have to be applied.
     */
    it('skips a language whose keys cannot form a tree, and keeps the others', async () => {
        await givenLanguage('es');
        await givenLanguage('it');
        await givenEntry('es', BACKEND, 'generic', 'a string');
        await givenEntry('es', BACKEND, 'generic.error-internal', 'and a group');
        await givenEntry('it', BACKEND, 'generic.error-internal', 'Errore interno');

        expect(await localeService.readApiOverrides()).toEqual({
            it: { generic: { ['error-internal']: 'Errore interno' } }
        });
    });
});
