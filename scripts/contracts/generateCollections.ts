/**
 * The four API client collections at the repo root — `contract.{bruno,insomnia,mockoon,postman}.*`.
 *
 * They restate the REST contract one request at a time, with auth, bodies and example responses.
 * Being developer tooling, nothing reads them closely enough to notice a gap, so a missing endpoint
 * is invisible until someone opens the collection and finds it useless — which is why they are
 * DERIVED rather than written by hand, and pinned to a fresh generation by
 * `tests/cross-cutting/contract-bundles.test.ts`.
 *
 * WHY. They were hand-written restatements of `openapi.yaml`, and they rotted exactly as a copy
 * does. Measured before this existed: Bruno and Mockoon each covered 37 of the contract's 56
 * operations and named no `feedback`, `locales` or `observability` endpoint at all; Insomnia had 30
 * requests pointing at URLs (`POST /products/add`, `GET /products/details/{id}`, `GET /heavy`) that
 * the application stopped serving. Mockoon was worse than incomplete — its bodies predated the
 * response envelope, so `GET /account` mocked a bare user where the API returns `UserEnvelope`, and
 * every error body was the old `{ success, error, traceId }` shape. A mock server serving shapes the
 * frontend cannot parse is worse than no mock server.
 *
 * WHAT THIS FILE IS. Configuration, not machinery. The traversal, the example synthesis and the
 * four emitters live in `@guebbit/openapi-runnable-collections`, which knows nothing about this
 * repo. What stays here is the three things only this repo can answer:
 *
 *   1. WHICH MODULE OWNS WHICH PATH — read from the OpenAPI fragments, never restated. A path in
 *      `src/modules/orders/openapi/paths.yaml` is the orders module's, so a path that moves between
 *      modules moves in all four collections with it.
 *   2. WHERE THE VALUES COME FROM — `db/seeds/seed-identities.ts`, the dataset the backend actually
 *      seeds. That is why a generated request is not a schema-shaped placeholder with empty
 *      strings: `GET /products/{id}` asks for a product that exists, and `POST /account/login`
 *      sends credentials that work against a seeded database.
 *   3. WHAT THE CONTRACT CANNOT DESCRIBE — each module's `probes.ts`, the requests that prove the
 *      API REJECTS things. A spec declares valid calls and their declared answers, so no generator
 *      can derive an invalid body or a bogus token.
 *
 * ONE STEP, ONE COMMITTED FILE PER TOOL. The generator returns whole documents, so there is no
 * intermediate on disk: no per-module slice to hand-edit, no header to keep in step with a footer,
 * and nothing under `src/` that must never be opened. Deleting `src/modules/products` removes its
 * paths, its probes and therefore its folder in all four collections — because the collections are
 * a function of the modules rather than a copy of them.
 *
 * TWO SERIALISATIONS. Bruno and Insomnia are YAML; Mockoon and Postman are JSON. Mockoon needs one
 * thing the others do not — every route appears twice, once in `routes` and once as a
 * `rootChildren` reference fixing the order its UI shows them in — and the generator handles that
 * inside its own document.
 *
 * WHY POSTMAN IS ITS OWN EMITTER AND NOT A RENAMED INSOMNIA. Insomnia exports
 * `collection.insomnia.rest/5.0` YAML; Postman reads Collection Format v2.1 JSON, which splits a URL
 * into `raw`/`host`/`path`/`query` and reads the parts rather than the string. The compatibility
 * runs one way only: Insomnia imports Postman, Postman does not import Insomnia.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    generateCollections,
    loadSpec,
    type CollectionRequest,
    type CollectionTool,
    type GenerateResult,
    type Json,
    type Probe,
    type Section,
    type ValueSources
} from '@guebbit/openapi-runnable-collections';
import { REPO_ROOT, type ContractBundle } from './fragments';
import { SECTION_ORDER, sectionFragment, type SectionName } from './openapi';
import { probes as accountProbes } from '../../src/modules/account/probes';
import { probes as cartProbes } from '../../src/modules/cart/probes';
import { probes as ordersProbes } from '../../src/modules/orders/probes';
import { probes as productsProbes } from '../../src/modules/products/probes';
import {
    SEED_ADMIN_EMAIL,
    SEED_ADMIN_PASSWORD,
    SEED_USER_EMAIL,
    SEED_USER_PASSWORD,
    seedOrders,
    seedProducts,
    seedUsers
} from '../../db/seeds/seed-identities';

/** The four tools, and the order this file names them in. */
export const COLLECTION_TOOLS = ['bruno', 'insomnia', 'mockoon', 'postman'] as const;

/** The name every collection carries, in the tools that show one. */
const COLLECTION_NAME = 'Ecommerce Demo API';

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * 1. Which module owns which path — read from the OpenAPI fragments, never restated
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** A path key as it appears in a `paths.yaml` fragment: four spaces, then the path. */
const PATH_LINE = /^ {4}(\/\S*):\s*$/;

/** Every path filed under a section, in the order its fragment declares them. */
const sectionPaths = (section: SectionName): string[] =>
    readFileSync(sectionFragment(section, 'paths'), 'utf8')
        .split('\n')
        .map((line) => PATH_LINE.exec(line)?.[1])
        .filter((match): match is string => match !== undefined);

const sections = (): Section[] =>
    SECTION_ORDER.map((name) => ({ name, paths: sectionPaths(name) }));

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * 2. Where the values come from — the shapes are the contract's, the data is the seed's
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

const [seedAdmin, seedUser] = seedUsers;
const [seedProduct] = seedProducts;
const [seedOrder] = seedOrders;

const values: ValueSources = {
    /*
     * By property name, because that is what makes a generated body USABLE: a request that posts
     * `{"productId": ""}` is a request whoever opens the collection has to fix before it does
     * anything. Anything not named here falls through to a type- and format-shaped default.
     */
    byProperty: {
        id: seedProduct.id,
        email: SEED_USER_EMAIL,
        password: SEED_USER_PASSWORD,
        newPassword: SEED_USER_PASSWORD,
        username: seedUser.username,
        productId: seedProduct.id,
        userId: seedUser.id,
        orderId: seedOrder.id,
        title: seedProduct.title,
        description: seedProduct.description,
        price: seedProduct.price,
        imageUrl: seedProduct.imageUrl,
        quantity: 2,
        admin: false,
        active: true,
        locale: 'en',
        text: seedProduct.title,
        page: 1,
        pageSize: 20
    },

    /*
     * Whole records for the entities the contract names, rather than field-by-field guesses. A
     * `$ref` to `Product` should produce the product the database actually holds, so a
     * `GET /products/{id}` example and the row that answers it are the same record. Only the
     * properties the schema declares survive, so a field the contract drops stops appearing here
     * on the next run.
     */
    byEntity: {
        User: {
            id: seedUser.id,
            username: seedUser.username,
            email: seedUser.email,
            admin: seedUser.admin,
            active: true,
            imageUrl: seedUser.imageUrl
        },
        Product: {
            id: seedProduct.id,
            title: seedProduct.title,
            description: seedProduct.description,
            price: seedProduct.price,
            active: seedProduct.active,
            imageUrl: seedProduct.imageUrl
        },
        Order: {
            id: seedOrder.id,
            userId: seedOrder.userId,
            email: seedOrder.email,
            total: seedProduct.price * seedOrder.items[0].quantity
        },
        OrderItem: {
            productId: seedOrder.items[0].productId,
            quantity: seedOrder.items[0].quantity,
            price: seedProduct.price
        },
        CartItem: {
            productId: seedAdmin.cart[0].productId,
            quantity: seedAdmin.cart[0].quantity
        }
    } as Record<string, Record<string, Json>>,

    /*
     * Bodies a schema cannot produce correctly on its own. Only two, and both for the same reason:
     * the credentials have to be the ADMIN's. A login that returns a non-admin token makes every
     * admin-only request in the collection fail with a 403, and the first thing anyone would do
     * with the collection is log in.
     */
    byOperation: {
        'POST /account/login': { email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD },
        'POST /account/signup': {
            username: seedUser.username,
            email: SEED_USER_EMAIL,
            password: SEED_USER_PASSWORD
        }
    },

    /** A credential is the dataset's, never invented: an invented one produces a login that fails. */
    byFormat: { email: SEED_USER_EMAIL, password: SEED_USER_PASSWORD },

    /** A path parameter's value: the seeded record of whichever domain the path belongs to. */
    pathParam: (name, template) => {
        if (name === 'productId') return seedProduct.id;
        if (name === 'locale') return 'en';
        if (name !== 'id') return undefined;

        if (template.startsWith('/products')) return seedProduct.id;
        if (template.startsWith('/orders')) return seedOrder.id;
        if (template.startsWith('/users')) return seedUser.id;
        if (template.startsWith('/feedback')) return seedOrder.id;
        return seedAdmin.id;
    },

    /*
     * The seed facts a probe may refer to, as `{{token}}`. A probe that pasted
     * `65dc8ad8604c307b702b5cd4` into its URL would be a copy of the seed dataset, and copies drift
     * — the whole reason `seed-identities.ts` exists. Every one of these is DERIVED from the
     * records rather than restated, so a fixture that stops being soft-deleted takes its probe with
     * it instead of leaving one that quietly tests nothing.
     */
    tokens: {
        seedAdminEmail: SEED_ADMIN_EMAIL,
        seedAdminPassword: SEED_ADMIN_PASSWORD,
        seedAdminId: seedAdmin.id,
        seedUserEmail: SEED_USER_EMAIL,
        seedUserPassword: SEED_USER_PASSWORD,
        seedUserId: seedUser.id,
        seedProductId: seedProduct.id,
        seedOrderId: seedOrder.id,
        /* The dataset carries exactly one of each on purpose — see the comments in
         * `seed-identities.ts`: without them the soft-delete and role-scoping branches have no
         * fixture behind them, and a branch with no fixture is a branch nothing exercises. */
        seedSoftDeletedProductId: (seedProducts.find((product) => product.deletedAt) ?? seedProduct)
            .id,
        seedInactiveProductId: (seedProducts.find((product) => !product.active) ?? seedProduct).id,
        seedDeletedOrderId: (seedOrders.find((order) => order.deletedAt) ?? seedOrder).id
    }
};

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * 3. What the contract cannot describe — each module's authored probes
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The modules that declare probes, imported by name rather than discovered on disk.
 *
 * A static import is the point: deleting `src/modules/orders` stops this file compiling, which is
 * the failure `docs/theory/module-lifecycle.md` asks for. A directory scan would instead drop that
 * module's probes silently and leave a collection that still looks complete.
 *
 * Eight modules and the `system` section declare none. That is deliberate rather than a backlog —
 * a probe exists where a rejection is interesting, and most read endpoints have none.
 */
const PROBES: Partial<Record<SectionName, Probe[]>> = {
    account: accountProbes,
    cart: cartProbes,
    orders: ordersProbes,
    products: productsProbes
};

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * 4. The four documents
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * One run of the generator.
 *
 * Deliberately not memoised: `bundle-contracts.ts` writes `openapi.yaml` in phase 1 and generates
 * from it in phase 2, so a cached result would be one taken before the contract it claims to derive
 * from existed.
 */
const generate = (): GenerateResult =>
    generateCollections({
        spec: loadSpec(path.join(REPO_ROOT, 'openapi.yaml')),
        sections: sections(),
        probes: PROBES as Record<string, Probe[]>,
        values,
        collection: { name: COLLECTION_NAME },
        targets: COLLECTION_TOOLS
    });

/** Every module's probes, flattened — what a coverage check has to account for. */
export const allProbes = (): CollectionRequest[] =>
    generate().requests.filter((request) => request.probe);

/** What a tool's committed document should contain. */
const contentFor = (tool: CollectionTool) => (): string => {
    const document = generate().bundles[tool];
    if (document === undefined)
        throw new Error(`[collections] the generator emitted no ${tool} document.`);
    return document;
};

/*
 * At the repo root as `contract.<tool>.<ext>`, next to `openapi.yaml` — deliberately not in a
 * dotfolder. They are the contract rendered for each tool, they sit beside the document they are
 * derived from, and a dotfolder is where things go to be forgotten: `.dev/` was exactly where the
 * hand-written versions rotted unnoticed for months.
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
