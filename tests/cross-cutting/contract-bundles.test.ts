/**
 * Every document is exactly what it says it is built from.
 *
 * The documents come in two kinds, and what each kind can be asked differs.
 *
 * COMPILED — built from authored sources in this repo. `openapi.yaml` from standalone OpenAPI
 * documents, one per module plus the root, joined by `redocly bundle` resolving `$ref` the way the
 * rest of the ecosystem does; the two AsyncAPI bundles merged through the YAML AST from one
 * document per section.
 *
 * These are COMMITTED, so they can be asked the strongest question: does the file on disk equal a
 * fresh build. Two sources for one document is a fork waiting to happen — that is what
 * `check:contracts-bundle --check` asserts, in `complete` on every run, so it is not repeated here
 * as a second Jest case over the same two function calls.
 *
 * GENERATED — the four API client collections, produced whole from `openapi.yaml` and the demo
 * dataset. They have no fragments: nothing on disk stands between the contract and the document.
 * They are also `.gitignore`d, so there is no committed copy to compare against and the
 * byte-for-byte question does not apply. What is asserted instead is the GENERATOR: every case
 * below builds a collection in memory and checks the document it produced. That is the property
 * that mattered anyway — a stale committed copy was only ever a proxy for a generator that had
 * stopped covering the contract.
 *
 * WHERE THE COMMENTS LIVE. A parse drops them, and every compiled bundle here is parsed — so none
 * of them carries one. The REST contract stopped needing that guarantee once its sources became
 * whole documents: the explanations now sit in the module files where the thing they explain is
 * written, and nobody reads the bundle by hand. That placement is a design choice rather than a
 * property this file checks — a comment count is a floor nothing can tell apart from noise, so
 * unlike everything else below it was never a guard against a real fork.
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
} from '../../scripts/contracts/bundle-registry';
import { MODULE_SECTIONS, moduleSpec } from '../../scripts/contracts/openapi-bundle';
import { allProbes } from '../../scripts/contracts/client-collections-bundle';
import { SHARED_FILES } from '../../scripts/spec-identity';

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
         * The AUTHORED bundles the frontend receives are a subset of the cross-repo guard:
         * everything built here and copied over is also compared against that copy, because a fork
         * in one of those is a fork in what the two sides believe they share.
         *
         * Two kinds are exempt, and each exemption is itself the invariant.
         *
         * The client collections, because their fragments are GENERATED from `openapi.yaml` (which
         * is guarded) and the committed bundles are pinned to a fresh generation by the
         * byte-for-byte case above — so a frontend copy could never disagree without `openapi.yaml`
         * disagreeing first, which is why the frontend holds none.
         *
         * `asyncapi.yaml`, because the frontend holds `asyncapi.public.yaml` instead. That one MUST
         * be absent from the list rather than merely allowed to be: an entry for it would demand
         * the frontend carry the queue channels, which is the thing the split removed.
         *
         * Which bundles those are is read from `generated` and `shared` rather than listed here: a
         * list of names is a copy that goes stale the first time a bundle is added — silently, by
         * exempting nothing and demanding the new bundle be shared.
         */
        const guarded = new Set(SHARED_FILES.map(({ backend }) => backend));

        for (const bundle of CONTRACT_BUNDLES.filter((candidate) => !isGenerated(candidate))) {
            const file = path.relative(REPO_ROOT, bundle.output);
            if (bundle.shared === false) expect(guarded).not.toContain(file);
            else expect(guarded).toContain(file);
        }
    });
});

describe('the OpenAPI bundle', () => {
    const openapi = bundleByName('openapi');

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

/** One committed AsyncAPI bundle, parsed. */
const asyncDocument = (
    name: string
): {
    servers: Record<string, { protocol: string }>;
    channels: Record<string, Record<string, { message?: { $ref?: string } }>>;
    components: { messages: Record<string, unknown>; schemas: Record<string, unknown> };
} => parseYaml(readCommittedBundle(bundleByName(name)));

describe.each([['asyncapi'], ['asyncapi-public']])('the %s bundle', (name) => {
    it('parses, and declares a message for every channel operation', () => {
        // The generated realtime types are an output of these documents, so a bundle that parses
        // but has lost a channel forks `src/types/asyncapi.generated.ts` one `gen:asyncapi` later.
        const document = asyncDocument(name);

        const channels = Object.entries(document.channels);
        expect(channels.length).toBeGreaterThan(0);

        for (const [channelName, channel] of channels)
            for (const operation of ['publish', 'subscribe'] as const) {
                const reference = channel[operation]?.message?.$ref;
                if (!reference) continue;

                const message = reference.replace('#/components/messages/', '');
                expect({
                    channel: channelName,
                    message,
                    known: message in document.components.messages
                }).toEqual({ channel: channelName, message, known: true });
            }
    });

    it('declares a server for every channel, and no server without one', () => {
        // A server travels with the section whose channels bind to it, which is what lets the
        // public bundle drop the broker. The failure that makes cheap: a section moved between
        // scopes and left its server behind, so one document advertises a transport nothing on it
        // can reach and the other names a transport it never declared.
        const document = asyncDocument(name);
        const declared = Object.keys(document.servers);

        expect(declared.length).toBeGreaterThan(0);

        const bound = new Set(
            Object.values(document.channels).flatMap(
                (channel) => (channel as { servers?: string[] }).servers ?? declared
            )
        );

        expect([...bound].toSorted()).toEqual(declared.toSorted());
    });
});

describe('the public AsyncAPI bundle', () => {
    it('carries the SSE channels and none of the backend-only ones', () => {
        // What the split is for. The frontend holds this file as its `asyncapi.yaml` and generates
        // its types from it, so a queue that leaked in would hand a browser the payload shape of a
        // message it can neither publish nor consume — and, worse, would read as a contract it is
        // expected to honour.
        const full = Object.keys(asyncDocument('asyncapi').channels);
        const shared = Object.keys(asyncDocument('asyncapi-public').channels);

        expect(shared).toEqual(full.filter((channel) => !channel.startsWith('worker.')));
        expect(full.some((channel) => channel.startsWith('worker.'))).toBe(true);
    });

    it('is a strict subset of the full contract, preamble included', () => {
        // Two bundles from one set of sections: anything the shared half says, the full one says
        // identically. A drift here means the merge stopped being the same merge.
        const full = asyncDocument('asyncapi');
        const shared = asyncDocument('asyncapi-public');

        for (const [channel, definition] of Object.entries(shared.channels))
            expect(full.channels[channel]).toEqual(definition);
        for (const [server, definition] of Object.entries(shared.servers))
            expect(full.servers[server]).toEqual(definition);
        for (const [message, definition] of Object.entries(shared.components.messages))
            expect(full.components.messages[message]).toEqual(definition);
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
