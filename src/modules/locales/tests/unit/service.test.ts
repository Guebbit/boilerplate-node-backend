/**
 * The pure half of `localeService`: the tree builder, the collision rules and the manifest merge.
 *
 * All three are decisions rather than plumbing, and all three fail SILENTLY when they are wrong —
 * a dropped key, a language that claims a capability it does not have. None of them touches the
 * database, so they are asserted directly here; the write paths that call them are driven through
 * Mongo in `repository.test.ts` and over HTTP in the contract suite.
 */

import { LocaleDirection, LocaleSource } from '@types';
import { BACKEND, FRONTEND } from './tenants.fixture';
import { localeService } from '../../services';
import type { LocaleDocument } from '../../model';

/** A language row as `mergeCapabilities` reads it — the five fields it actually touches. */
const language = (overrides: Partial<LocaleDocument> & { tag: string }): LocaleDocument =>
    ({
        name: overrides.tag,
        nativeName: overrides.tag,
        direction: LocaleDirection.ltr,
        revision: 0,
        active: true,
        ...overrides
    }) as LocaleDocument;

describe('buildMessageTree', () => {
    it('expands flat dotted keys into the nested shape a client merges', () => {
        const tree = localeService.buildMessageTree([
            { key: 'products.list.title', value: 'Catálogo' },
            { key: 'products.list.empty', value: 'Sin resultados' }
        ]);

        expect(tree).toEqual({
            products: { list: { title: 'Catálogo', empty: 'Sin resultados' } }
        });
    });

    it('answers an empty object for a language with no entries yet', () => {
        // A legitimate state — a language registered this morning — and deliberately not a 404.
        expect(localeService.buildMessageTree([])).toEqual({});
    });

    it('keeps a single undotted key at the root', () => {
        expect(localeService.buildMessageTree([{ key: 'title', value: 'Tienda' }])).toEqual({
            title: 'Tienda'
        });
    });

    it('nests as deep as the key asks', () => {
        expect(localeService.buildMessageTree([{ key: 'a.b.c.d.e', value: 'deep' }])).toEqual({
            a: { b: { c: { d: { e: 'deep' } } } }
        });
    });

    /*
     * The two throws are the point of this builder. A version that dropped a key instead would
     * produce a dictionary missing a string, with WHICH string decided by insertion order — so the
     * bug appears on one deployment and not another, and never in a test.
     *
     * Both directions are asserted because they are separate branches: reaching a leaf where a
     * group already stands, and reaching a group where a leaf already stands.
     */
    it('throws when a key would have to be a string and a group at once', () => {
        expect(() =>
            localeService.buildMessageTree([
                { key: 'products.list.title', value: 'Catálogo' },
                { key: 'products.list', value: 'Lista' }
            ])
        ).toThrow(/products\.list/);
    });

    it('throws in the other order too, so the outcome does not depend on insertion order', () => {
        expect(() =>
            localeService.buildMessageTree([
                { key: 'products.list', value: 'Lista' },
                { key: 'products.list.title', value: 'Catálogo' }
            ])
        ).toThrow(/products\.list/);
    });

    /*
     * A stored `__proto__` segment must become an ordinary property rather than reassign a
     * prototype. Write-time validation refuses such keys (see `findUnsafeKeySegment`), and this is
     * the second half: a row that reached the collection some other way — a migration, a mongosh
     * session, an import written before the check existed — still cannot pollute anything.
     */
    it('cannot be made to pollute a prototype by a stored key', () => {
        const tree = localeService.buildMessageTree([{ key: '__proto__.polluted', value: 'yes' }]);

        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        expect(tree.__proto__).toEqual({ polluted: 'yes' });
    });
});

describe('findKeyCollision', () => {
    it('finds the ancestor of a key that is already a leaf', () => {
        expect(localeService.findKeyCollision('a.b.c', ['a.b'])).toBe('a.b');
    });

    it('finds the descendant of a key that is about to become a leaf', () => {
        expect(localeService.findKeyCollision('a.b', ['a.b.c'])).toBe('a.b.c');
    });

    it('is not fooled by a shared prefix that is not a dotted ancestor', () => {
        // `a.bc` is not below `a.b` — only a segment boundary makes an ancestor, which is why the
        // comparison appends the dot rather than calling `startsWith` on the bare key.
        expect(localeService.findKeyCollision('a.b', ['a.bc'])).toBeUndefined();
    });

    it('does not report an identical key, which is a duplicate and a different answer', () => {
        expect(localeService.findKeyCollision('a.b', ['a.b'])).toBeUndefined();
    });

    it('says nothing about unrelated keys', () => {
        expect(
            localeService.findKeyCollision('cart.title', ['products.list.title'])
        ).toBeUndefined();
    });
});

describe('findBatchCollision', () => {
    it('catches a pair that only collides with each other, before either is written', () => {
        expect(localeService.findBatchCollision(['a.b.c', 'x.y', 'a.b'])).toEqual(['a.b', 'a.b.c']);
    });

    it('passes a batch that is internally consistent', () => {
        expect(localeService.findBatchCollision(['a.b.c', 'a.b.d', 'x.y'])).toBeUndefined();
    });
});

describe('findDuplicateKey', () => {
    it('names the key a batch repeats', () => {
        expect(localeService.findDuplicateKey(['a', 'b', 'a'])).toBe('a');
    });

    it('says nothing about a batch of distinct keys', () => {
        expect(localeService.findDuplicateKey(['a', 'b'])).toBeUndefined();
    });
});

describe('findUnsafeKeySegment', () => {
    it.each(['__proto__', 'constructor', 'prototype'])(
        'refuses %s, which names a node no tree should have',
        (segment) => {
            expect(localeService.findUnsafeKeySegment(`products.${segment}.title`)).toBe(segment);
        }
    );

    it.each(['a..b', 'a.', '.a'])('refuses %s, which has an unaddressable empty segment', (key) => {
        expect(localeService.findUnsafeKeySegment(key)).toBe('');
    });

    it('accepts an ordinary dotted key', () => {
        expect(localeService.findUnsafeKeySegment('products.list.title')).toBeUndefined();
    });
});

describe('mergeCapabilities', () => {
    it('reports a deployed-file language as backend-only, with no dictionary to download', () => {
        const [row] = localeService.mergeCapabilities(['en'], [], new Map());

        expect(row).toMatchObject({
            tag: 'en',
            tenants: [BACKEND],
            source: LocaleSource.static,
            entryCount: 0,
            revision: 0
        });
    });

    it('names a static language from its tag, since it carries no row to name it', () => {
        const [row] = localeService.mergeCapabilities(['es'], [], new Map());

        expect(row?.name).toBe('Spanish');
    });

    it('reports a database-only language as frontend-only — the API cannot answer in it', () => {
        const rows = localeService.mergeCapabilities(
            [],
            [language({ tag: 'pt', name: 'Portuguese', nativeName: 'Português', revision: 3 })],
            new Map([['pt', 12]])
        );

        expect(rows).toEqual([
            {
                tag: 'pt',
                name: 'Portuguese',
                nativeName: 'Português',
                direction: LocaleDirection.ltr,
                active: true,
                tenants: [FRONTEND],
                source: LocaleSource.dynamic,
                entryCount: 12,
                revision: 3
            }
        ]);
    });

    /*
     * The flag rides the row into the manifest so the ADMIN — the only caller whose manifest
     * includes inactive languages — can tell them apart. For everyone else the repository never
     * hands an inactive row to this merge, so their manifests only ever say `true`.
     */
    it('carries the active flag through, so an admin manifest can name the hidden rows', () => {
        const rows = localeService.mergeCapabilities(
            [],
            [language({ tag: 'fr', name: 'French', nativeName: 'Français', active: false })],
            new Map()
        );

        expect(rows[0]).toMatchObject({ tag: 'fr', active: false });
    });

    /*
     * The row this whole feature is arranged around. `es` is a deployed file AND a set of rows, so
     * it is one language with both capabilities — not two entries, and not one entry claiming the
     * union of two things a client cannot tell apart.
     */
    it('merges a language present in both tiers into one row carrying both tenants', () => {
        const rows = localeService.mergeCapabilities(
            ['en', 'es'],
            [language({ tag: 'es', name: 'Spanish', nativeName: 'Español', revision: 7 })],
            new Map([['es', 214]])
        );

        expect(rows).toHaveLength(2);
        expect(rows[1]).toMatchObject({
            tag: 'es',
            tenants: [BACKEND, FRONTEND],
            source: LocaleSource.both,
            entryCount: 214,
            revision: 7
        });
    });

    it('lets the stored row supply the display fields a static tag can only guess at', () => {
        const rows = localeService.mergeCapabilities(
            ['es'],
            [language({ tag: 'es', name: 'Spanish (Latin America)', nativeName: 'Español' })],
            new Map()
        );

        expect(rows[0]?.name).toBe('Spanish (Latin America)');
    });

    it('orders by tag, so two manifests differ only where something actually changed', () => {
        const rows = localeService.mergeCapabilities(
            ['it', 'en'],
            [language({ tag: 'de' })],
            new Map()
        );

        expect(rows.map(({ tag }) => tag)).toEqual(['de', 'en', 'it']);
    });

    it('counts zero entries for a language the count map does not mention', () => {
        const rows = localeService.mergeCapabilities([], [language({ tag: 'de' })], new Map());

        expect(rows[0]?.entryCount).toBe(0);
    });
});

describe('isRightToLeft', () => {
    it.each(['ar', 'he', 'fa'])('knows %s runs right to left', (tag) => {
        expect(localeService.isRightToLeft(tag)).toBe(true);
    });

    it('judges a region tag on its base language', () => {
        expect(localeService.isRightToLeft('ar-EG')).toBe(true);
    });

    it.each(['en', 'es', 'pt-br'])('leaves %s left to right', (tag) => {
        expect(localeService.isRightToLeft(tag)).toBe(false);
    });
});

describe('describeLanguage', () => {
    it('names a language in English for the admin list', () => {
        expect(localeService.describeLanguage('es', 'en')).toBe('Spanish');
    });

    it('names it in itself for a language picker', () => {
        expect(localeService.describeLanguage('it', 'it')).toBe('italiano');
    });

    it('falls back to the tag rather than throwing on something it cannot name', () => {
        // A manifest row reading `zz` is worse than one reading a real name and far better than a
        // 500 — and an ICU build without the data is a deployment fact this code cannot fix.
        expect(localeService.describeLanguage('zz', 'en')).toBe('zz');
    });
});
