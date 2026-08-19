/**
 * Neither collection may leak `_id`/`__v`, on either response path — a hydrated document
 * (`toJSON`) or a `.lean()` list result mapped through the exported transform.
 *
 * Worth asserting per model rather than trusting `applySerialization`: 95 schemas in
 * `openapi.yaml` are `additionalProperties: false`, so a stray `_id` is a contract violation the
 * suite in `tests/contract/` fails on, and the lean path is the one that bypasses `toJSON`
 * entirely.
 *
 * The schema defaults are asserted here too. `db/demo/demo-data.json` is a record of what the
 * schema does rather than of what a fixture claimed, so a default that stopped applying would
 * quietly rewrite the file the paired frontend mocks from.
 */

import { asStub } from '@tests/stub';
import { setupTestDb } from '@tests/setup-test-db';
import { LocaleDirection } from '@types';
import { localeRepository, localeMessageRepository } from '@modules/locales/repository';
import { localeService } from '@modules/locales/service';
import { makeLocale } from '@modules/locales/factory';

setupTestDb();

describe('language serialization', () => {
    it('normalizes a hydrated document via toJSON', async () => {
        const language = await localeRepository.create({
            tag: 'es',
            name: 'Spanish',
            nativeName: 'Español'
        });
        const json = language.toJSON() as Record<string, unknown>;

        expect(json.id).toBe(language._id.toString());
        expect(JSON.stringify(json)).not.toContain('_id');
        expect(JSON.stringify(json)).not.toContain('__v');
    });

    it('fills the three fields a caller may omit', async () => {
        const language = await localeRepository.create({
            tag: 'es',
            name: 'Spanish',
            nativeName: 'Español'
        });

        expect(language.direction).toBe(LocaleDirection.ltr);
        expect(language.active).toBe(true);
        expect(language.revision).toBe(0);
    });

    it('lowercases the tag on write, so one language cannot become two rows', async () => {
        const language = await localeRepository.create({
            tag: '  PT-BR ',
            name: 'Portuguese',
            nativeName: 'Português'
        });

        expect(language.tag).toBe('pt-br');
    });
});

describe('entry serialization', () => {
    it('normalizes a lean list via the search path', async () => {
        await localeRepository.create({ tag: 'es', name: 'Spanish', nativeName: 'Español' });
        await localeMessageRepository.create({
            locale: 'es',
            key: 'cart.title',
            value: 'Carrito'
        });

        const result = await localeService.searchEntries('es');
        const item = asStub<Record<string, unknown>>(result.data?.items[0]);

        expect(item.id).toMatch(/^[\da-f]{24}$/);
        expect(item._id).toBeUndefined();
        expect(item.__v).toBeUndefined();
    });

    it('stores an empty translation, which `required: true` on a String would have refused', async () => {
        // An untranslated row is a legitimate state — an import that supplied keys and no text —
        // and the contract still requires the field on the wire, which the default guarantees.
        const entry = await localeMessageRepository.create({ locale: 'es', key: 'cart.title' });

        expect(entry.value).toBe('');
    });
});

/**
 * `baseLanguage` — the ISO 639-1 code at the front of the tag.
 *
 * Derived by a schema hook rather than by the one service that creates languages, because
 * "derived" has to hold for every write path: the seeds and the migration write documents
 * directly, and neither knows it owes the column a value. These pin that it is the SCHEMA doing
 * it, which is the only version of the guarantee that survives a new caller.
 */
describe('baseLanguage', () => {
    it.each([
        ['a bare language', 'es', 'es'],
        ['a regional variant', 'pt-BR', 'pt'],
        ['a script subtag', 'zh-Hant', 'zh'],
        ['both', 'zh-Hant-HK', 'zh']
    ])('derives %s: %s → %s', async (_label, tag, expected) => {
        const language = await localeRepository.create(
            makeLocale({ tag, name: tag, nativeName: tag })
        );

        expect(language.baseLanguage).toBe(expected);
    });

    /**
     * A caller cannot pin it to something the tag contradicts. The field is in no request schema,
     * so the only way to attempt this is in code — and the hook overwrites it anyway, which is
     * what keeps the column and the tag from ever disagreeing.
     */
    it('overrides whatever a caller supplied', async () => {
        const language = await localeRepository.create({
            tag: 'pt-BR',
            baseLanguage: 'es',
            name: 'Portuguese',
            nativeName: 'Português'
        } as Parameters<typeof localeRepository.create>[0]);

        expect(language.baseLanguage).toBe('pt');
    });
});
