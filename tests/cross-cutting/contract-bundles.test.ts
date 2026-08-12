/**
 * Every committed document is exactly what its fragments say it is.
 *
 * Seven documents in this repo list every domain the app has and are ALSO byte-identical with the
 * paired frontend: the two specs, the demo dataset's identities, the analytics event names and the
 * three API client collections. Each is split per module — a domain owns its endpoints, its events,
 * its records and its requests — while the assembled document stays COMMITTED, because it is what
 * spectral, orval, Prism, `jest-openapi`, the seed runner, Bruno, Insomnia and Mockoon all read.
 *
 * Two sources for one document is a fork waiting to happen, and this is the assertion that stops
 * it: edit a fragment without re-bundling, or hand-edit a bundle, and this fails.
 *
 * It also pins the property that made fragmentation possible at all. Every YAML bundler parses and
 * re-serialises, which drops `openapi.yaml`'s 149 comment lines and reflows ~390 more. The bundler
 * here never parses — a fragment is a verbatim slice and bundling is concatenation — so identity is
 * structural. If someone swaps in a "real" bundler, this is what reports the lost explanations.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
    assembleBundle,
    bundleFragments,
    CONTRACT_BUNDLES,
    readCommittedBundle,
    REPO_ROOT,
    type IContractBundle
} from '../../scripts/contracts';
import { SECTION_ORDER, sectionFragment } from '../../scripts/contracts/openapi';
import {
    ANALYTICS_SECTION_ORDER,
    analyticsFragment
} from '../../scripts/contracts/analyticsEvents';
import { allProbes, staleCollectionFragments } from '../../scripts/contracts/generateCollections';
import { SHARED_FILES } from '../../scripts/specIdentity';
import { analyticsEvents } from '../../src/infrastructure/observability/analytics-events';

/** How many requests a collection's folders hold, whichever key that tool nests them under. */
const counted = (groups: { items?: unknown[]; children?: unknown[] }[]): number =>
    groups.reduce((total, group) => total + (group.items ?? group.children ?? []).length, 0);

const bundleByName = (name: string): IContractBundle => {
    const bundle = CONTRACT_BUNDLES.find((candidate) => candidate.name === name);
    if (!bundle) throw new Error(`no bundle named ${name}`);
    return bundle;
};

describe('every contract bundle', () => {
    it.each(CONTRACT_BUNDLES.map((bundle) => [bundle.name, bundle] as const))(
        '%s reproduces its committed file byte for byte',
        (_name, bundle) => {
            expect(assembleBundle(bundle)).toBe(readCommittedBundle(bundle));
        }
    );

    it.each(CONTRACT_BUNDLES.map((bundle) => [bundle.name, bundle] as const))(
        '%s is built from fragments that all carry content',
        (_name, bundle) => {
            // A canary: a fragment silently resolving to an empty file would still bundle, just
            // without that domain's half of the document.
            for (const fragment of bundleFragments(bundle))
                expect(readFileSync(fragment, 'utf8').trim().length).toBeGreaterThan(0);
        }
    );

    it('produces exactly the shared files that are domain-shaped', () => {
        // The bundles are a subset of the cross-repo guard: everything assembled here is also
        // compared against the frontend's copy. A bundle missing from that list would be rebuilt
        // on one side and never checked against the other.
        const guarded = new Set(SHARED_FILES.map(({ backend }) => backend));

        for (const bundle of CONTRACT_BUNDLES)
            expect(guarded).toContain(path.relative(REPO_ROOT, bundle.output));
    });
});

describe('the OpenAPI bundle', () => {
    const openapi = bundleByName('openapi');

    it('keeps every comment the document explains itself with', () => {
        // The count is a floor, not a fixture: comments get added. A bundler that silently started
        // parsing would take this to zero, which is the failure worth naming.
        const comments = readCommittedBundle(openapi)
            .split('\n')
            .filter((line) => line.trim().startsWith('#'));

        expect(comments.length).toBeGreaterThanOrEqual(149);
    });

    it('gives every section a paths and a schemas fragment, neither of them empty', () => {
        for (const section of SECTION_ORDER) {
            const paths = readFileSync(sectionFragment(section, 'paths'), 'utf8');
            expect(paths).toMatch(/^ {4}\//m);

            const schemas = readFileSync(sectionFragment(section, 'schemas'), 'utf8');
            expect(schemas).toMatch(/^ {8}[A-Za-z]/m);
        }
    });

    it('files every documented path under exactly one fragment', () => {
        const documented = readCommittedBundle(openapi)
            .split('\n')
            .filter((line) => /^ {4}\/[^\s:]*:\s*$/.test(line))
            .map((line) => line.trim());

        const fromFragments = SECTION_ORDER.flatMap((section) =>
            readFileSync(sectionFragment(section, 'paths'), 'utf8')
                .split('\n')
                .filter((line) => /^ {4}\/[^\s:]*:\s*$/.test(line))
                .map((line) => line.trim())
        );

        expect(fromFragments.toSorted()).toEqual(documented.toSorted());
        expect(new Set(fromFragments).size).toBe(fromFragments.length);
    });
});

describe('the AsyncAPI bundle', () => {
    it('parses, and declares a message for every channel operation', () => {
        // The generated realtime types are themselves a guarded shared file, so a bundle that
        // parses but has lost a channel forks `src/types/asyncapi.ts` one `genasyncapi` later.
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
        // `CHECKOUT_COMPLETED` produce a duplicate object key the bundle would silently swallow,
        // and two that spell one event differently split every funnel built on it.
        const entries = ANALYTICS_SECTION_ORDER.flatMap((section) =>
            readFileSync(analyticsFragment(section), 'utf8')
                .split('\n')
                .map((line) => /^\s{4}([A-Z_]+):\s*'([_a-z]+)'/.exec(line))
                .filter((match): match is RegExpExecArray => match !== null)
                .map(([, key, value]) => ({ key, value }))
        );

        expect(entries.length).toBeGreaterThan(0);
        expect(new Set(entries.map(({ key }) => key)).size).toBe(entries.length);
        expect(new Set(entries.map(({ value }) => value)).size).toBe(entries.length);
    });

    it('exports exactly the names its fragments declare', () => {
        const declared = ANALYTICS_SECTION_ORDER.flatMap((section) =>
            [
                ...readFileSync(analyticsFragment(section), 'utf8').matchAll(/^\s{4}([A-Z_]+):/gm)
            ].map(([, key]) => key)
        );

        expect(Object.keys(analyticsEvents).toSorted()).toEqual(declared.toSorted());
    });
});

describe('the API client collections', () => {
    it('all parse, so a mis-sliced fragment cannot reach a developer as a broken import', () => {
        for (const name of ['bruno', 'insomnia', 'mockoon'])
            expect(() => parseYaml(readCommittedBundle(bundleByName(name)))).not.toThrow();
    });

    it('leaves Mockoon with one tree entry per route, in the same order', () => {
        // Mockoon lists every route twice — once in `routes`, once as a `rootChildren` reference
        // that fixes the order its UI shows them in — and a module owns both slices. Slicing one
        // and forgetting the other produces a collection Mockoon loads with routes it never shows.
        const mockoon = JSON.parse(readCommittedBundle(bundleByName('mockoon'))) as {
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
        for (const name of ['bruno', 'insomnia'])
            expect(readCommittedBundle(bundleByName(name))).not.toContain('{{seed');
    });

    it('gives every probe a reason, and no two the same name', () => {
        // The name is what someone reads in a folder of 70 requests, and the reason is the only
        // thing that says why sending a deliberately broken request is worth doing.
        const probes = allProbes();

        for (const probe of probes) expect(probe.description.length).toBeGreaterThan(20);
        expect(new Set(probes.map(({ name }) => name)).size).toBe(probes.length);
    });

    it('are exactly what the contract generates', () => {
        // The collections are derived, so the question is not "do they agree with each other" but
        // "is the committed output a fresh run". A generator whose output nobody verifies is a
        // second source of truth that agrees with the first only by habit.
        expect(staleCollectionFragments().map((file) => path.relative(REPO_ROOT, file))).toEqual(
            []
        );
    });

    it('carry one request per operation the contract declares, in all three', () => {
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

        const bruno = parseYaml(readCommittedBundle(bundleByName('bruno'))) as {
            items: { items?: unknown[] }[];
        };
        const insomnia = parseYaml(readCommittedBundle(bundleByName('insomnia'))) as {
            collection: { children?: unknown[] }[];
        };
        const mockoon = JSON.parse(readCommittedBundle(bundleByName('mockoon'))) as {
            routes: { method: string; endpoint: string }[];
        };

        // Bruno and Insomnia also carry the probes — the requests the contract cannot describe, so
        // that they are the only difference between what those two hold and what the API declares.
        const probes = allProbes().length;
        expect(probes).toBeGreaterThan(0);

        expect(counted(bruno.items)).toBe(operations.length + probes);
        expect(counted(insomnia.collection)).toBe(operations.length + probes);

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
