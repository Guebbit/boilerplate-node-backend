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
 *   2. Where the values come from — `db/demo/demo-data.json`, so a generated request asks for a
 *      product that exists and sends credentials that work.
 *   3. What the contract cannot describe — each module's `probes.ts`, the requests that prove the
 *      API REJECTS things. A spec declares valid calls, so no generator can derive a bogus token.
 *
 * Postman is its own emitter rather than a renamed Insomnia: Collection Format v2.1 splits a URL
 * into parts and reads those rather than the string, and the compatibility runs one way only.
 *
 * See: docs/api/contract-fragmentation.md#the-client-collections-generated
 */

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
import { REPO_ROOT, type ContractBundle } from './bundle-kinds';
import { SECTION_ORDER, sectionPaths, type SectionName } from './openapi-bundle';
import { probes as accountProbes } from '../../src/modules/account/probes';
import { probes as cartProbes } from '../../src/modules/cart/probes';
import { probes as ordersProbes } from '../../src/modules/orders/probes';
import { probes as productsProbes } from '../../src/modules/products/probes';
import { probes as wishlistProbes } from '../../src/modules/wishlist/probes';
import dataset from '../../db/demo/demo-data.json';

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

/*
 * Positional, and safe to be: every collection in `demo-data.json` is sorted by `_id`, so these
 * indices are stable across exports. The admin sorts before the ordinary user because their
 * ObjectIds encode the order the two accounts were created in.
 */
const { credentials, collections } = dataset;
const [seedAdmin, seedUser] = collections.users;
const [seedProduct] = collections.products;
const [seedOrder] = collections.orders;
const [seedCart] = collections.carts;
const seedProducts = collections.products;
const seedOrders = collections.orders;

const values: ValueSources = {
    /*
     * By property name, because that is what makes a generated body USABLE: a request that posts
     * `{"productId": ""}` is a request whoever opens the collection has to fix before it does
     * anything. Anything not named here falls through to a type- and format-shaped default.
     */
    byProperty: {
        id: seedProduct.id,
        email: credentials.user.email,
        password: credentials.user.password,
        newPassword: credentials.user.password,
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
            active: seedUser.active,
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
            /* The serializer's own total, not this file multiplying a price by a quantity and
             * hoping it matches what `applyOrderTransform` derives. */
            total: seedOrder.totalPrice
        },
        OrderItem: {
            productId: seedOrder.items[0].product.id,
            quantity: seedOrder.items[0].quantity,
            price: seedOrder.items[0].product.price
        },
        CartItem: {
            productId: seedCart.items[0].productId,
            quantity: seedCart.items[0].quantity
        }
    } as Record<string, Record<string, Json>>,

    /*
     * Bodies a schema cannot produce correctly on its own. Only two, and both for the same reason:
     * the credentials have to be the ADMIN's. A login that returns a non-admin token makes every
     * admin-only request in the collection fail with a 403, and the first thing anyone would do
     * with the collection is log in.
     */
    byOperation: {
        'POST /account/login': {
            email: credentials.admin.email,
            password: credentials.admin.password
        },
        'POST /account/signup': {
            username: seedUser.username,
            email: credentials.user.email,
            password: credentials.user.password
        }
    },

    /** A credential is the dataset's, never invented: an invented one produces a login that fails. */
    byFormat: { email: credentials.user.email, password: credentials.user.password },

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
     * — the whole reason the dataset is published rather than retyped. Every one of these is
     * DERIVED from the records rather than restated, so a fixture that stops being soft-deleted
     * takes its probe with it instead of leaving one that quietly tests nothing.
     */
    tokens: {
        seedAdminEmail: credentials.admin.email,
        seedAdminPassword: credentials.admin.password,
        seedAdminId: seedAdmin.id,
        seedUserEmail: credentials.user.email,
        seedUserPassword: credentials.user.password,
        seedUserId: seedUser.id,
        seedProductId: seedProduct.id,
        seedOrderId: seedOrder.id,
        /* The dataset carries exactly one of each on purpose — see the comments in
         * `src/modules/products/demo.ts`: without them the soft-delete and role-scoping branches
         * have no fixture behind them, and a branch with no fixture is a branch nothing exercises. */
        seedSoftDeletedProductId: (
            seedProducts.find((product) => 'deletedAt' in product) ?? seedProduct
        ).id,
        seedInactiveProductId: (seedProducts.find((product) => !product.active) ?? seedProduct).id,
        seedDeletedOrderId: (seedOrders.find((order) => 'deletedAt' in order) ?? seedOrder).id
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
 * That covers deletion and not addition — a new module writing a perfectly good `probes.ts` and
 * not editing this map produces four collections that look complete and carry none of its probes.
 * `tests/cross-cutting/probes-are-wired.test.ts` closes that half, so the compile-time failure is
 * kept rather than traded for a directory scan.
 *
 * Seven modules and the `system` section declare none. That is deliberate rather than a backlog —
 * a probe exists where a rejection is interesting, and most read endpoints have none.
 */
const PROBES: Partial<Record<SectionName, Probe[]>> = {
    account: accountProbes,
    cart: cartProbes,
    orders: ordersProbes,
    products: productsProbes,
    wishlist: wishlistProbes
};

/** Which sections {@link PROBES} carries. Read by the completeness guard, nothing else. */
export const PROBED_SECTIONS: readonly SectionName[] = Object.keys(PROBES) as SectionName[];

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * 4. The four documents
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * One run of the generator.
 *
 * Deliberately not memoised: `build-contract-bundles.ts` writes `openapi.yaml` in phase 1 and generates
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
