/**
 * Every document is exactly what it says it is built from.
 *
 * The documents come in three kinds, and what each kind can be asked differs.
 *
 * COMPILED — `openapi.yaml`. Its sources are standalone OpenAPI documents, one per module plus the
 * root, joined by `redocly bundle` resolving `$ref` the way the rest of the ecosystem does.
 *
 * ASSEMBLED — `asyncapi.yaml` and the analytics event names, still concatenated from verbatim line
 * slices. These carry comments the bundle itself has to keep, and no parser preserves those.
 *
 * Both are COMMITTED, so both can be asked the strongest question: does the file on disk equal a
 * fresh assembly. Two sources for one document is a fork waiting to happen, and that is the
 * assertion that stops it — edit a source without re-bundling, or hand-edit a bundle, and it fails.
 *
 * GENERATED — the four API client collections, produced whole from `openapi.yaml` and the demo
 * dataset. They have no fragments: nothing on disk stands between the contract and the document.
 * They are also `.gitignore`d, so there is no committed copy to compare against and the
 * byte-for-byte question does not apply. What is asserted instead is the GENERATOR: every case
 * below builds a collection in memory and checks the document it produced. That is the property
 * that mattered anyway — a stale committed copy was only ever a proxy for a generator that had
 * stopped covering the contract.
 *
 * WHERE THE COMMENTS LIVE differs between the first two kinds, and that is the interesting part. A
 * parse drops them, so an assembled bundle cannot use one. The REST contract stopped needing that
 * guarantee once its sources became whole documents: the explanations now sit in the module files
 * where the thing they explain is written, and nobody reads the bundle by hand. `the OpenAPI bundle`
 * below asserts they are still there — in the sources rather than in the output.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
    assembleBundle,
    bundleFragments,
    CONTRACT_BUNDLES,
    isGenerated,
    readCommittedBundle,
    REPO_ROOT,
    type ContractBundle
} from '../../scripts/contracts';
import { MODULE_SECTIONS, moduleSpec, ROOT_SPEC } from '../../scripts/contracts/openapi';
import { ANALYTICS_SECTIONS } from '../../scripts/contracts/analyticsEvents';
import { allProbes } from '../../scripts/contracts/generateCollections';
import { SHARED_FILES } from '../../scripts/specIdentity';
import { analyticsEvents } from '../../src/infrastructure/observability/analytics-events';
import type { SharedAnalyticsEventName } from '../../src/infrastructure/observability/analytics';

/** How many requests a collection's folders hold, whichever key that tool nests them under. */
const counted = (groups: { items?: unknown[]; children?: unknown[] }[]): number =>
    groups.reduce((total, group) => total + (group.items ?? group.children ?? []).length, 0);

const bundleByName = (name: string): ContractBundle => {
    const bundle = CONTRACT_BUNDLES.find((candidate) => candidate.name === name);
    if (!bundle) throw new Error(`no bundle named ${name}`);
    return bundle;
};

/** The bundles with a committed file on disk — everything but the client collections. */
const AUTHORED_BUNDLES = CONTRACT_BUNDLES.filter((bundle) => !isGenerated(bundle));

describe('every contract bundle', () => {
    it.each(AUTHORED_BUNDLES.map((bundle) => [bundle.name, bundle] as const))(
        '%s reproduces its committed file byte for byte',
        (_name, bundle) => {
            expect(assembleBundle(bundle)).toBe(readCommittedBundle(bundle));
        }
    );

    it.each(AUTHORED_BUNDLES.map((bundle) => [bundle.name, bundle] as const))(
        '%s is built from fragments that all carry content',
        (_name, bundle) => {
            // A canary: a fragment silently resolving to an empty file would still bundle, just
            // without that domain's half of the document.
            for (const fragment of bundleFragments(bundle))
                expect(readFileSync(fragment, 'utf8').trim().length).toBeGreaterThan(0);
        }
    );

    it('produces exactly the shared files that are domain-shaped', () => {
        /*
         * The AUTHORED bundles are a subset of the cross-repo guard: everything assembled from
         * hand-written fragments is also compared against the frontend's copy, because a fork in
         * one of those is a fork in what the two sides believe they share.
         *
         * The client collections are exempt, and the exemption is the invariant: their fragments
         * are GENERATED from `openapi.yaml` (which is guarded) and the committed bundles are
         * pinned to a fresh generation by the byte-for-byte case above, so a frontend copy could
         * never disagree without `openapi.yaml` disagreeing first — which is why the frontend
         * holds none. A new authored bundle must land in `SHARED_FILES`.
         *
         * Which bundles those are is read from `generated` rather than listed here: a list of tool
         * names is a copy of `COLLECTION_TOOLS`, and the copy goes stale the first time a fourth
         * tool is added — silently, by exempting nothing and demanding the new bundle be shared.
         */
        const guarded = new Set(SHARED_FILES.map(({ backend }) => backend));

        for (const bundle of CONTRACT_BUNDLES)
            if (!isGenerated(bundle))
                expect(guarded).toContain(path.relative(REPO_ROOT, bundle.output));
    });
});

describe('the OpenAPI bundle', () => {
    const openapi = bundleByName('openapi');

    it('keeps every comment, in the files that are actually read by hand', () => {
        /*
         * `redocly bundle` parses, so the BUNDLE carries no comments and cannot — that is the trade
         * this layout made deliberately. What had to survive is the explanations, and they live in
         * the module documents where the thing they explain is written. The count is a floor, not a
         * fixture: it goes up as modules gain notes, and a collapse to near zero means someone
         * flattened the sources back into one generated file.
         */
        const sources = [ROOT_SPEC, ...MODULE_SECTIONS.map((section) => moduleSpec(section))];
        const comments = sources.flatMap((file) =>
            readFileSync(file, 'utf8')
                .split('\n')
                .filter((line) => line.trim().startsWith('#'))
        );

        expect(comments.length).toBeGreaterThanOrEqual(200);
    });

    it('gives every module a standalone document with both paths and schemas', () => {
        for (const section of MODULE_SECTIONS) {
            const document_ = parseYaml(readFileSync(moduleSpec(section), 'utf8')) as {
                openapi?: string;
                paths?: Record<string, unknown>;
                components?: { schemas?: Record<string, unknown> };
            };

            // Standalone means standalone: a module document is valid OpenAPI on its own, which is
            // what lets it be linted and opened in an editor without the rest of the contract.
            expect(document_.openapi).toBeDefined();
            expect(Object.keys(document_.paths ?? {}).length).toBeGreaterThan(0);
            expect(Object.keys(document_.components?.schemas ?? {}).length).toBeGreaterThan(0);
        }
    });

    it('files every documented path under exactly one module, or the root', () => {
        const documented = Object.keys(
            (parseYaml(readCommittedBundle(openapi)) as { paths: Record<string, unknown> }).paths
        );

        const fromModules = MODULE_SECTIONS.flatMap((section) =>
            Object.keys(
                (
                    parseYaml(readFileSync(moduleSpec(section), 'utf8')) as {
                        paths?: Record<string, unknown>;
                    }
                ).paths ?? {}
            )
        );

        // Whatever the bundle documents and no module claims belongs to the root — `GET /`, the
        // application shell answering for itself.
        const fromRoot = documented.filter((url) => !fromModules.includes(url));

        expect([...fromModules, ...fromRoot].toSorted()).toEqual(documented.toSorted());
        expect(new Set(fromModules).size).toBe(fromModules.length);
        expect(fromRoot).toEqual(['/']);
    });
});

describe('the AsyncAPI bundle', () => {
    it('parses, and declares a message for every channel operation', () => {
        // The generated realtime types are themselves a guarded shared file, so a bundle that
        // parses but has lost a channel forks `src/types/asyncapi.ts` one `gen:asyncapi` later.
        const document = parseYaml(readCommittedBundle(bundleByName('asyncapi'))) as {
            channels: Record<string, Record<string, { message?: { $ref?: string } }>>;
            components: { messages: Record<string, unknown>; schemas: Record<string, unknown> };
        };

        const channels = Object.entries(document.channels);
        expect(channels.length).toBeGreaterThan(0);

        for (const [name, channel] of channels)
            for (const operation of ['publish', 'subscribe'] as const) {
                const reference = channel[operation]?.message?.$ref;
                if (!reference) continue;

                const message = reference.replace('#/components/messages/', '');
                expect({
                    channel: name,
                    message,
                    known: message in document.components.messages
                }).toEqual({ channel: name, message, known: true });
            }
    });
});

describe('the analytics event bundle', () => {
    it('lets no two modules declare the same name or the same value', () => {
        // The failure this file exists to prevent, one level down: two modules that both claim
        // `CHECKOUT_COMPLETED` produce a duplicate object key the published file would silently
        // swallow, and two that spell one event differently split every funnel built on it.
        //
        // Read from the module's exported VALUE rather than from its text: the names are ordinary
        // TypeScript now, so the check can be on what the app actually emits.
        const entries = ANALYTICS_SECTIONS.flatMap(({ events }) =>
            Object.entries(events).map(([key, value]) => ({ key, value }))
        );

        expect(entries.length).toBeGreaterThan(0);
        expect(new Set(entries.map(({ key }) => key)).size).toBe(entries.length);
        expect(new Set(entries.map(({ value }) => value)).size).toBe(entries.length);
    });

    it('publishes exactly the names the modules declare', () => {
        // `analytics-events.ts` is an artefact nothing here imports — this is what keeps it honest
        // against the six modules it is sliced out of, and therefore against the frontend's copy.
        const declared = ANALYTICS_SECTIONS.flatMap(({ events }) => Object.keys(events));

        expect(Object.keys(analyticsEvents).toSorted()).toEqual(declared.toSorted());
    });

    it('declares every name in the union the port exposes', () => {
        // The augmentation is what makes `emitAnalyticsEvent` reject an unknown name. A module that
        // exported its constant but forgot the `declare module` block would compile, emit fine, and
        // silently widen nothing — so the type has to be checked against the values.
        const published: Record<string, string> = analyticsEvents;
        for (const value of Object.values(published)) {
            const name: SharedAnalyticsEventName = value as SharedAnalyticsEventName;
            expect(typeof name).toBe('string');
        }
    });
});

describe('the API client collections', () => {
    /*
     * Built here rather than read off disk: they are `.gitignore`d, so on a clean checkout there is
     * nothing to read. Generated once for the whole block — the generator walks every module
     * contract and synthesises an example per operation, which is not work worth repeating per
     * case.
     */
    const generated = new Map(
        CONTRACT_BUNDLES.filter((bundle) => isGenerated(bundle)).map((bundle) => [
            bundle.name,
            assembleBundle(bundle)
        ])
    );

    const collection = (name: string): string => {
        const document = generated.get(name);
        if (document === undefined) throw new Error(`no generated bundle named ${name}`);
        return document;
    };

    it('all parse, so a mis-sliced fragment cannot reach a developer as a broken import', () => {
        for (const name of ['bruno', 'insomnia', 'mockoon', 'postman'])
            expect(() => parseYaml(collection(name))).not.toThrow();
    });

    it('leaves Mockoon with one tree entry per route, in the same order', () => {
        // Mockoon lists every route twice — once in `routes`, once as a `rootChildren` reference
        // that fixes the order its UI shows them in — and a module owns both slices. Slicing one
        // and forgetting the other produces a collection Mockoon loads with routes it never shows.
        const mockoon = JSON.parse(collection('mockoon')) as {
            routes: { uuid: string }[];
            rootChildren: { type: string; uuid: string }[];
        };

        expect(mockoon.rootChildren.map(({ uuid }) => uuid)).toEqual(
            mockoon.routes.map(({ uuid }) => uuid)
        );
        expect(mockoon.routes.length).toBeGreaterThan(0);
    });

    it('leaves no probe token unresolved', () => {
        // A probe writes `{{seedSoftDeletedProductId}}` rather than pasting an id, and the
        // generator throws on a token it does not know — but a token that never reached the
        // generator (a typo in a key it does not scan, a probe field added later) would ship as a
        // literal. Mockoon is excluded: it has no probes, and `{{...}}` is its own templating.
        for (const name of ['bruno', 'insomnia']) expect(collection(name)).not.toContain('{{seed');
    });

    it('gives every probe a reason, and no two the same name', () => {
        // The name is what someone reads in a folder of 70 requests, and the reason is the only
        // thing that says why sending a deliberately broken request is worth doing.
        const probes = allProbes();

        for (const probe of probes) expect(probe.description.length).toBeGreaterThan(20);
        expect(new Set(probes.map(({ name }) => name)).size).toBe(probes.length);
    });

    it('are generated whole, with nothing on disk in between', () => {
        /*
         * The property that makes every other case here trustworthy: there is no intermediate. A
         * per-module slice of a collection would be a second place the output lives, editable by
         * hand, and a generator whose output nobody verifies is a second source of truth that
         * agrees with the first only by habit.
         */
        const collections = CONTRACT_BUNDLES.filter((item) => isGenerated(item));

        expect(collections.length).toBeGreaterThan(0);
        for (const bundle of collections) expect(bundleFragments(bundle)).toEqual([]);
    });

    it('carry one request per operation the contract declares, in all four', () => {
        // This is the assertion that would have caught the rot they were generated to end: before
        // it, Bruno and Mockoon covered 37 of 56 operations and named no feedback, locales or
        // observability endpoint, while 30 of Insomnia's 39 requests pointed at URLs the app had
        // stopped serving.
        const contract = parseYaml(readCommittedBundle(bundleByName('openapi'))) as {
            paths: Record<string, Record<string, unknown>>;
        };
        const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
        const operations = Object.entries(contract.paths).flatMap(([template, item]) =>
            Object.keys(item)
                .filter((key) => methods.has(key))
                .map((method) => `${method} ${template}`)
        );

        const bruno = parseYaml(collection('bruno')) as {
            items: { items?: unknown[] }[];
        };
        const insomnia = parseYaml(collection('insomnia')) as {
            collection: { children?: unknown[] }[];
        };
        const postman = JSON.parse(collection('postman')) as {
            item: { item?: unknown[] }[];
        };
        const mockoon = JSON.parse(collection('mockoon')) as {
            routes: { method: string; endpoint: string }[];
        };

        // The three request collections also carry the probes — the requests the contract cannot
        // describe, so that they are the only difference between what one holds and what the API
        // declares. Mockoon has none: a mock server answers requests, it does not send them.
        const probes = allProbes().length;
        expect(probes).toBeGreaterThan(0);

        expect(counted(bruno.items)).toBe(operations.length + probes);
        expect(counted(insomnia.collection)).toBe(operations.length + probes);
        expect(counted(postman.item.map((group) => ({ items: group.item })))).toBe(
            operations.length + probes
        );

        // Mockoon keeps the contract's parameter NAMES (`:productId`), so its routes can be
        // compared as a set rather than only counted.
        expect(
            mockoon.routes
                .map(({ method, endpoint }) =>
                    `${method} /${endpoint}`.replaceAll(/:(\w+)/g, '{$1}')
                )
                .toSorted()
        ).toEqual(operations.toSorted());
    });
});
