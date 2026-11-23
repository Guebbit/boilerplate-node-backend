/**
 * A language-neutral read answers every caller the same, and says so.
 *
 * Risk:    `attachLocale` runs before routing, so which paths skip `Vary: Accept-Language` and
 *          `Content-Language` is a LIST there, apart from the routes that declare `languageNeutral`.
 *          A route on one list and not the other either splits its cache by a language its body
 *          never uses, or shares an answer whose words differ.
 * Asserts: the two lists are equal; on every listed route two languages get one body, one cache
 *          entry and no language headers (the dictionary reads name their path's language); a
 *          refusal there is still labelled with the visitor's language.
 * Double:  the cache adapter, as `locale-cache-invalidation.test.ts` does — a Map that keeps the
 *          key-per-response contract, because with no Redis every request misses.
 * Real:    the app, the routers and the middleware chain.
 */

jest.mock('@infrastructure/adapters/cache', () => {
    const actual = jest.requireActual('@infrastructure/adapters/cache');
    const responses = new Map<string, string>();

    return {
        ...actual,
        getCacheValue: (key: string) => Promise.resolve(responses.get(key)),
        setCacheValue: (key: string, value: string, ttlSeconds: number) => {
            if (ttlSeconds > 0) responses.set(key, value);
            return Promise.resolve();
        },
        // So each case starts from an empty store and its first read is a miss.
        clearResponses: () => responses.clear()
    };
});

import { setupTestDb } from '@tests/setup-test-db';
import * as cacheAdapter from '@infrastructure/adapters/cache';
import { api } from '@tests/http';
import { asStub } from '@tests/stub';
import { languageNeutralReads } from '@tests/cached-routes';
import { enabledModules } from '../../src/modules';
import { givenLocale } from '@modules/locales/tests/factories';
import { resolveLanguageNeutralReads } from '@kernel/registry';
import { router as configRoutes } from '../../src/app/config-routes';

setupTestDb();

/** What `attachLocale` treats as language-neutral: what the installed modules declare, plus `/config`. */
const LANGUAGE_NEUTRAL_READS = ['/config', ...resolveLanguageNeutralReads(enabledModules)];

/**
 * The path each template is asked at, and the language the answer names itself. `pt` has rows
 * only (the messages read); `it` has a deployed dictionary file.
 */
const asked = (template: string): { path: string; labelled?: string } => {
    if (template.endsWith('/messages')) return { path: '/locales/pt/messages', labelled: 'pt' };
    if (template.endsWith('/dictionary')) return { path: '/locales/it/dictionary', labelled: 'it' };
    return { path: template.replace('{locale}', 'it') };
};

/** The two caches that matter here: Redis stores one entry per key, so a second language must HIT the first's. */
const HIT = /; hit; ttl=\d+/;

describe('the registry and the routes agree', () => {
    it('lists, per module, exactly the routes that declare languageNeutral', () => {
        const disagreeing = enabledModules.filter(
            ({ mounts = [], languageNeutralReads: listed = [] }) =>
                JSON.stringify(languageNeutralReads(mounts)) !== JSON.stringify(listed.toSorted())
        );

        expect(disagreeing.map(({ name }) => name)).toEqual([]);
        // The canary: with no module declaring anything, the loops below would check only `/config`.
        expect(LANGUAGE_NEUTRAL_READS.length).toBeGreaterThan(1);
    });

    it('serves `/config`, the one read no module owns, from the app’s own router', () => {
        // Express keeps a route's path and methods on its layer (undocumented, pinned by `router-internals.test.ts`).
        const layers = asStub<{ route?: { path: string; methods: Record<string, boolean> } }[]>(
            configRoutes.stack
        );

        expect(layers.some(({ route }) => route?.path === '/config' && route.methods.get)).toBe(
            true
        );
    });
});

describe.each(LANGUAGE_NEUTRAL_READS)('GET %s', (template) => {
    const { path, labelled } = asked(template);

    beforeEach(async () => {
        await givenLocale('pt');
    });

    it('answers two languages with one body and no language header', async () => {
        const english = await api().get(path).set('Accept-Language', 'en');
        const italian = await api().get(path).set('Accept-Language', 'it');

        expect(english.status).toBe(200);
        expect(italian.body).toEqual(english.body);
        expect(english.headers['content-language']).toBe(labelled);
        expect(italian.headers['content-language']).toBe(labelled);
        expect(english.headers.vary ?? '').not.toMatch(/accept-language/i);
    });
});

/** `/config` answers from the process, not from Redis: it has no entry to share. */
describe.each(LANGUAGE_NEUTRAL_READS.filter((template) => template !== '/config'))(
    'GET %s through the cache',
    (template) => {
        const { path, labelled } = asked(template);

        beforeEach(async () => {
            // `clearResponses` exists only on the double declared above.
            asStub<{ clearResponses: () => void }>(cacheAdapter).clearResponses();
            await givenLocale('pt');
        });

        it('keeps one entry for both languages', async () => {
            const first = await api().get(path).set('Accept-Language', 'en');
            const second = await api().get(path).set('Accept-Language', 'it');

            expect(first.headers['cache-status']).toContain('fwd=miss');
            expect(second.headers['cache-status']).toMatch(HIT);
            expect(second.headers['content-language']).toBe(labelled);
        });
    }
);

describe('a refusal on a language-neutral read', () => {
    it('is still labelled with the visitor’s language, and says it varies', async () => {
        const refused = await api().get('/locales/zz/dictionary').set('Accept-Language', 'it');

        expect(refused.status).toBe(404);
        expect(refused.headers['content-language']).toBe('it');
        expect(refused.headers.vary).toMatch(/accept-language/i);
        expect(refused.headers['cache-control']).toBe('no-store');
    });
});
