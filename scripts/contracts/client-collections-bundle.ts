/**
 * The four API client collections — `contract.{bruno,insomnia,mockoon,postman}.*` at the repo root.
 *
 * GENERATED ON DEMAND, NOT COMMITTED (all four are `.gitignore`d): their only reader is a human
 * about to open one, and committing them put ~1.9 MB of derived text in every contract diff.
 *
 *   npm run contracts:bundle -- bruno insomnia mockoon postman
 *
 * This file is CONFIGURATION, not machinery — the traversal, example synthesis and emitters live
 * in `@guebbit/openapi-runnable-collections`. What stays here is the three things only this repo
 * can answer:
 *
 *   1. Which module owns which path — read from the module contracts, never restated.
 *   2. Where the values come from — `scenarios/subjects.ts`, so a generated request asks for a
 *      product that exists and sends credentials that work. Only ids and credentials: nothing
 *      here can import a module's own fixtures (`scenarios/products.ts` and friends), because
 *      those pull in `@modules/*` code, which imports the generated `@api/` client — the same
 *      cycle `scripts/contracts/openapi-bundle.ts` had to stop importing `enabledModules` to
 *      avoid. A realistic title, price or description is out of reach here; `npm run demo` plus
 *      the API is how you see the whole shop.
 *   3. What the contract cannot describe — each module's `probes.ts`, the requests that prove the
 *      API REJECTS things. A spec declares valid calls, so no generator can derive a bogus token.
 *
 * Postman is its own emitter rather than a renamed Insomnia: Collection Format v2.1 splits a URL
 * into parts and reads those rather than the string, and the compatibility runs one way only.
 *
 * See: docs/api/contract-fragmentation.md#the-client-collections-generated
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
    generateCollections,
    loadSpec,
    type CollectionRequest,
    type CollectionTool,
    type GenerateResult,
    type Probe,
    type Section,
    type ValueSources
} from '@guebbit/openapi-runnable-collections';
import { REPO_ROOT, type ContractBundle } from './bundle-kinds';
import { SECTION_ORDER, sectionPaths } from './openapi-bundle';
import { SEED_PRODUCT_IDS, SUBJECTS } from '../../scenarios/subjects';

/**
 * What a generated request puts where an ORDER id belongs.
 *
 * Not a literal, and it cannot be one: the demo shop's orders are produced by driving
 * real checkouts (`scenarios/flows/`), so their ids are minted when the shop is built and differ
 * every time. Bruno, Insomnia and Postman all read `{{name}}` as a collection variable at send
 * time, so this hands the reader a slot to fill instead of an id that 404s. The orders section's
 * own first probe is the request that fills it.
 */
const ORDER_ID_VARIABLE = '{{orderId}}';

/** The four tools, and the order this file names them in. */
const COLLECTION_TOOLS = ['bruno', 'insomnia', 'mockoon', 'postman'] as const;

/** The name every collection carries, in the tools that show one. */
const COLLECTION_NAME = 'Ecommerce Demo API';

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * 1. Which module owns which path — read from the OpenAPI fragments, never restated
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

const sections = (): Section[] =>
    SECTION_ORDER.map((name) => ({ name, paths: sectionPaths(name) }));

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * 2. Where the values come from — the shapes are the contract's, the data is the seed's
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

const values: ValueSources = {
    /*
     * By property name, because that is what makes a generated body USABLE: a request that posts
     * `{"productId": ""}` is a request whoever opens the collection has to fix before it does
     * anything. Everything else — title, price, description and the like — falls through to a
     * type- and format-shaped default; only ids and credentials are real, see the file header.
     */
    byProperty: {
        id: SUBJECTS.product.id,
        email: SUBJECTS.user.email,
        password: SUBJECTS.user.password,
        newPassword: SUBJECTS.user.password,
        username: 'new-shopper',
        productId: SUBJECTS.product.id,
        userId: SUBJECTS.user.id,
        orderId: ORDER_ID_VARIABLE,
        quantity: 2,
        admin: false,
        active: true,
        locale: 'en',
        page: 1,
        pageSize: 20
    },

    /*
     * Bodies a schema cannot produce correctly on its own. Only two, and both for the same reason:
     * the credentials have to be the ADMIN's. A login that returns a narrower token makes every
     * admin-only request in the collection fail with a 403, and the first thing anyone would do
     * with the collection is log in.
     */
    byOperation: {
        'POST /account/login': {
            email: SUBJECTS.admin.email,
            password: SUBJECTS.admin.password
        },
        'POST /account/signup': {
            username: 'new-shopper',
            email: SUBJECTS.user.email,
            password: SUBJECTS.user.password
        }
    },

    /** A credential is a real seeded one, never invented: an invented one produces a login that
     * fails. */
    byFormat: { email: SUBJECTS.user.email, password: SUBJECTS.user.password },

    /** A path parameter's value: the seeded record of whichever domain the path belongs to. */
    pathParam: (name, template) => {
        if (name === 'productId') return SUBJECTS.product.id;
        if (name === 'locale') return 'en';
        if (name !== 'id') return undefined;

        if (template.startsWith('/products')) return SUBJECTS.product.id;
        if (template.startsWith('/orders')) return ORDER_ID_VARIABLE;
        if (template.startsWith('/users')) return SUBJECTS.user.id;
        return SUBJECTS.admin.id;
    },

    /*
     * The seed facts a probe may refer to, as `{{token}}`. A probe that pasted
     * `65dc8ad8604c307b702b5cd4` into its URL would be a copy of `scenarios/subjects.ts`, and
     * copies drift — the whole reason these are read from there rather than retyped.
     */
    tokens: {
        seedAdminEmail: SUBJECTS.admin.email,
        seedAdminPassword: SUBJECTS.admin.password,
        seedAdminId: SUBJECTS.admin.id,
        seedUserEmail: SUBJECTS.user.email,
        seedUserPassword: SUBJECTS.user.password,
        seedUserId: SUBJECTS.user.id,
        seedProductId: SUBJECTS.product.id,
        seedSoftDeletedProductId: SEED_PRODUCT_IDS.heaterSoftDeleted,
        seedInactiveProductId: SEED_PRODUCT_IDS.bundleInactive,
        // Both resolve to a collection variable rather than an id — see ORDER_ID_VARIABLE.
        seedOrderId: ORDER_ID_VARIABLE,
        seedDeletedOrderId: '{{deletedOrderId}}'
    }
};

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * 3. What the contract cannot describe — each module's authored probes
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Every module folder that has written a `probes.ts`, discovered rather than listed.
 * @param modulesRoot - the `src/modules` directory (the real one, or a scratch tree)
 */
export const modulesDeclaringProbes = (
    modulesRoot: string = path.join(REPO_ROOT, 'src', 'modules')
): string[] =>
    readdirSync(modulesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => existsSync(path.join(modulesRoot, name, 'probes.ts')))
        .toSorted();

/** Narrows a loaded `probes.ts` to the one export the generator reads. */
const hasProbes = (loaded: unknown): loaded is { probes: Probe[] } =>
    typeof loaded === 'object' &&
    loaded !== null &&
    'probes' in loaded &&
    Array.isArray(loaded.probes);

/**
 * Every module's `probes.ts`, loaded by directory scan: a module that writes one is in the
 * collections with no edit here, and a deleted module simply has none. A module with no probes is
 * not a finding — a probe exists where a rejection is interesting, and most read endpoints have
 * none.
 *
 * Memoised: the probes are source, so they cannot change mid-run (unlike the contract, see
 * {@link generate}).
 */
const loadProbes = (() => {
    let loaded: Promise<Record<string, Probe[]>> | undefined;

    return (): Promise<Record<string, Probe[]>> => {
        loaded ??= Promise.all(
            modulesDeclaringProbes().map((name) =>
                // Dynamic `import()` of a computed path: which modules have probes is only known
                // after the scan. tsx and ts-jest both resolve a bare `.ts` path.
                import(path.join(REPO_ROOT, 'src', 'modules', name, 'probes')).then(
                    (module_: unknown) => {
                        if (!hasProbes(module_))
                            throw new Error(
                                `[collections] ${name}/probes.ts exports no \`probes\` array.`
                            );
                        return [name, module_.probes] as const;
                    }
                )
            )
        ).then((entries) => Object.fromEntries(entries));
        return loaded;
    };
})();

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * 4. The four documents
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * One run of the generator.
 *
 * Deliberately not memoised: `scripts/contracts/build-bundles.ts` writes `openapi.yaml` in phase 1 and generates
 * from it in phase 2, so a cached result would be one taken before the contract it claims to derive
 * from existed.
 */
const generate = (): Promise<GenerateResult> =>
    loadProbes().then((probes) =>
        generateCollections({
            spec: loadSpec(path.join(REPO_ROOT, 'openapi.yaml')),
            sections: sections(),
            probes,
            values,
            collection: { name: COLLECTION_NAME },
            targets: COLLECTION_TOOLS
        })
    );

/** Every module's probes, flattened — what a coverage check has to account for. */
export const allProbes = (): Promise<CollectionRequest[]> =>
    generate().then((result) => result.requests.filter((request) => request.probe));

/** What a tool's committed document should contain. */
const contentFor = (tool: CollectionTool) => (): Promise<string> =>
    generate().then((result) => {
        const document = result.bundles[tool];
        if (document === undefined)
            throw new Error(`[collections] the generator emitted no ${tool} document.`);
        return document;
    });

/*
 * Written to the repo root as `contract.<tool>.<ext>`, next to `openapi.yaml` — deliberately not
 * in a dotfolder. They are the contract rendered for each tool, so they land beside the document
 * they are derived from, where whoever asked for one will look. `.gitignore` keeps them out of the
 * repo; the path is about where a generated file is easiest to find, not about tracking it.
 */

const collectionBundle = (tool: CollectionTool, file: string): ContractBundle => ({
    name: tool,
    generated: true,
    label: file,
    output: path.join(REPO_ROOT, file),
    content: contentFor(tool)
});

export const brunoBundle = collectionBundle('bruno', 'contract.bruno.yml');

// Named `.json` after the tool's own export convention, and YAML inside — Insomnia's importer
// accepts either and keys on the content, not the extension.
export const insomniaBundle = collectionBundle('insomnia', 'contract.insomnia.json');

export const mockoonBundle = collectionBundle('mockoon', 'contract.mockoon.json');

export const postmanBundle = collectionBundle('postman', 'contract.postman.json');
