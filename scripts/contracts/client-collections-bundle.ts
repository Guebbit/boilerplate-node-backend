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
 *   2. Where the values come from — `scenarios/subjects.ts` for the credentials and each module's
 *      `scenarios/values/<module>.ts` for its own rows, so a generated request asks for a
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

import { SECTION_ORDER, sectionPaths } from './openapi-bundle';
import { SUBJECTS } from '../../scenarios/subjects';
import type { CollectionValues } from '../../scenarios/collection-values';
import { REPO_ROOT, MODULES_ROOT, modulesWith } from '../modules-on-disk';

/** The four tools, and the order this file names them in. */
const COLLECTION_TOOLS = ['bruno', 'insomnia', 'mockoon', 'postman'] as const;

/** The name every collection carries, in the tools that show one. */
const COLLECTION_NAME = 'Boilerplate API';

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * 1. Which module owns which path — read from the OpenAPI fragments, never restated
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The folders of a collection, in order: one per module, with the paths it owns. A components-only
 * module (`access`) owns none, and an empty folder is noise in a request client.
 */
const sections = (): Section[] =>
    SECTION_ORDER.map((name) => ({ name, paths: sectionPaths(name) })).filter(
        ({ paths }) => paths.length > 0
    );

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * 2. Where the values come from — the shapes are the contract's, the data is the seed's
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The foundation's own value table (`ValueSources` from `@guebbit/openapi-runnable-collections`):
 * what goes into a request body or path where the contract only gives a shape, for what every
 * deployment has. A module adds its own through `scenarios/values/<module>.ts`
 * ({@link loadValues}).
 */
const baseValues: ValueSources = {
    /*
     * By property name, because that is what makes a generated body USABLE: a request that posts
     * `{"userId": ""}` is a request whoever opens the collection has to fix before it does
     * anything. Everything else — title, price, description and the like — falls through to a
     * type- and format-shaped default; only ids and credentials are real, see the file header.
     */
    byProperty: {
        email: SUBJECTS.user.email,
        password: SUBJECTS.user.password,
        newPassword: SUBJECTS.user.password,
        username: 'new-shopper',
        userId: SUBJECTS.user.id,
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
        if (name === 'locale') return 'en';
        if (name !== 'id') return undefined;

        if (template.startsWith('/users')) return SUBJECTS.user.id;
        return SUBJECTS.admin.id;
    },

    /*
     * The seed facts a probe may refer to, as `{{token}}`. A probe that pasted an id into its URL
     * would be a copy of the fixture, and copies drift — the whole reason these are read from the
     * fixtures rather than retyped.
     */
    tokens: {
        seedAdminEmail: SUBJECTS.admin.email,
        seedAdminPassword: SUBJECTS.admin.password,
        seedAdminId: SUBJECTS.admin.id,
        seedUserEmail: SUBJECTS.user.email,
        seedUserPassword: SUBJECTS.user.password,
        seedUserId: SUBJECTS.user.id
    }
};

/**
 * Narrows a loaded `scenarios/values/<module>.ts` to the one export the bundler reads.
 * @param loaded - the imported module namespace
 * @throws {Error} when it exports no `collectionValues`
 */
const readCollectionValues = (loaded: unknown): CollectionValues => {
    if (typeof loaded === 'object' && loaded !== null && 'collectionValues' in loaded)
        // The file's own type annotation (`CollectionValues`) is what makes this the right shape.
        return loaded.collectionValues as CollectionValues;
    throw new Error('[collections] a scenarios/values file exports no `collectionValues`.');
};

/**
 * Every `scenarios/values/<module>.ts` that exists, loaded by directory scan: a module's example
 * values are in the collections with no edit here, and a deleted module's file leaves with it.
 *
 * Memoised: the values are source, so they cannot change mid-run.
 */
const loadModuleValues = (() => {
    let loaded: Promise<CollectionValues[]> | undefined;

    return (): Promise<CollectionValues[]> => {
        const folder = path.join(REPO_ROOT, 'scenarios', 'values');
        loaded ??= Promise.all(
            (existsSync(folder) ? readdirSync(folder) : [])
                .filter((file) => file.endsWith('.ts'))
                .toSorted()
                // Dynamic `import()` of a computed path, for the same reason as the probes below.
                .map((file) => import(path.join(folder, file)).then(readCollectionValues))
        );
        return loaded;
    };
})();

/**
 * The foundation's table with every module's example values merged in. A module's `pathParam` is
 * asked first and the foundation's answers what none of them claims.
 */
const loadValues = (): Promise<ValueSources> =>
    loadModuleValues().then((modules) => ({
        ...baseValues,
        byProperty: {
            ...Object.fromEntries(
                modules.flatMap((entry) => Object.entries(entry.byProperty ?? {}))
            ),
            ...baseValues.byProperty
        },
        tokens: {
            ...Object.fromEntries(modules.flatMap((entry) => Object.entries(entry.tokens ?? {}))),
            ...baseValues.tokens
        },
        pathParam: (name, template) => {
            for (const entry of modules) {
                const found = entry.pathParam?.(name, template);
                if (found !== undefined) return found;
            }
            return baseValues.pathParam?.(name, template);
        }
    }));

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * 3. What the contract cannot describe — each module's authored probes
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Every module folder that has written a `probes.ts`, discovered rather than listed.
 * @param modulesRoot - the `src/modules` directory (the real one, or a scratch tree)
 */
export const modulesDeclaringProbes = (modulesRoot: string = MODULES_ROOT): string[] =>
    modulesWith(modulesRoot, 'probes.ts');

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
    Promise.all([loadProbes(), loadValues()]).then(([probes, values]) =>
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

/**
 * What a tool's generated document contains.
 *
 * The registry reaches this through a dynamic `import()` (see `bundle-registry.ts`), so loading
 * the registry never loads the seed values above.
 *
 * @param tool - which tool's format to render
 * @returns the document text
 */
export const collectionContent = (tool: CollectionTool): Promise<string> =>
    generate().then((result) => {
        const document = result.bundles[tool];
        if (document === undefined)
            throw new Error(`[collections] the generator emitted no ${tool} document.`);
        return document;
    });
