/**
 * Does the demo dataset still match the contract it is supposed to be a specimen of?
 *
 * MIRROR of `tests/cross-cutting/seedConformance.spec.ts` in the paired frontend. Same assertions,
 * different import paths — `db/demo/demo-data.json` is byte-identical to the copy over there, so a
 * check living in only one repo would let the other's copy rot until the next
 * `check:spec-identity`. That job compares the two copies to each other; nothing compared either of
 * them to `openapi.yaml`.
 *
 * WHICH DIRECTION OF DRIFT THIS CATCHES, because only one of the two was ever covered. Renaming a
 * field in the SEED is already loud: the fixtures are typed against the mongoose documents, so a
 * `makeProduct({ imageUrl })` that no longer matches the schema is a compile error. Renaming it in
 * `openapi.yaml` was silent — the seeders keep writing the old field, the serializer keeps emitting
 * it, and nothing in either repo ever compared the result to the contract. That is the gap this
 * file closes, and it is the direction a contract-first project actually drifts in.
 *
 * WHAT CHANGED WHEN THE DATASET STARTED BEING EXPORTED. This used to parse `seed-identities.ts`, a
 * file of hand-written FACTS, which meant every schema here needed surgery before it could be used:
 * the user schema was `.extend()`ed with a `password` and a `cart` the API never returns, and the
 * order schema was `.pick()`ed down to four fields because a fixture had no business stating a
 * total or a status.
 *
 * `demo-data.json` holds what the API actually answered, so the schemas are used AS GENERATED. The
 * totals and the status are in there now — derived by `applyOrderTransform`, and therefore worth
 * checking, where a seeded guess at them would only have tested the guess.
 *
 * `.strict()` is what makes these catch a RENAME in both directions. Orval emits a plain
 * `zod.object()` even though `openapi.yaml` says `additionalProperties: false`, and almost every
 * property is optional because a client must tolerate a sparse server. Parsed as generated, a row
 * still carrying `imageUrl` after the contract renamed it to `image` would pass twice over: the
 * stale key is STRIPPED as unknown, and the new one is absent-but-optional. `.strict()` fails on
 * the stale key; the `.required()` masks fail on the missing one.
 */

import {
    CreateLocaleEntryResponse,
    CreateLocaleResponse,
    CreateUserBody,
    GetAddressesResponse,
    GetCartResponse,
    GetOrderByIdResponse,
    GetProductByIdResponse,
    GetUserByIdResponse,
    GetWishlistResponse
} from '@api/schemas.zod';
import { listSupportedLocales } from '@infrastructure/i18n';
import dataset from '../../db/demo/demo-data.json';

const { _meta, credentials, collections } = dataset;

/*
 * The `.required()` masks are where "a seeded record is a complete specimen" stops being a comment.
 * The wire type is permissive on purpose; every seeded row promises these fields, and both repos
 * read them with no `?? fallback`. `deletedAt` stays optional throughout: it is present on exactly
 * one product and one order, by design.
 */
const productSchema = GetProductByIdResponse.shape.data
    .required({
        // All three stock fields, including the derived one: `available` is required on the wire
        // and computed at serialization, so a seeded row missing it would mean the transform did
        // not run — exactly the kind of silent gap this mask exists to catch.
        onHand: true,
        reserved: true,
        available: true,
        description: true,
        active: true,
        imageUrl: true,
        categories: true,
        tags: true
    })
    .strict();

const userSchema = GetUserByIdResponse.shape.data
    .required({ admin: true, active: true, imageUrl: true })
    .strict();

const orderSchema = GetOrderByIdResponse.shape.data.strict();

/** `{ productId, quantity }` — one line of a stored cart. */
const cartItemSchema = GetCartResponse.shape.data.shape.items.element.strict();

/**
 * One entry of a stored address book, which is the contract's `Address` exactly.
 *
 * A book is never served raw — `GET /account/addresses` answers `{ addresses: [...] }` — but its
 * ENTRIES are what that array carries, so the stored subdocument and the wire object are the same
 * shape by construction. `.strict()` is doing real work here: an entry serializing as `_id`
 * instead of `id` is precisely the drift this catches, and it is what the collection published
 * before `addressItemSchema` carried the shared serializer.
 */
const addressSchema = GetAddressesResponse.shape.data.shape.addresses.element.strict();

const wishlistProductIdSchema = GetWishlistResponse.shape.data.shape.items.element.shape.productId;

/**
 * The two dynamic-locale collections.
 *
 * Taken from the CREATE responses rather than from a read: a stored row and the row a write
 * answers with are the same object here, and those are the only operations whose `data` is a
 * single language or a single entry. `.required()` masks the fields every seeded row promises —
 * `active` and `direction` are schema defaults, so a row missing one would mean the default
 * stopped applying, which is exactly the kind of drift an exported dataset exists to catch.
 */
const languageSchema = CreateLocaleResponse.shape.data
    .required({ createdAt: true, updatedAt: true })
    .strict();

const localeEntrySchema = CreateLocaleEntryResponse.shape.data
    .required({ createdAt: true, updatedAt: true })
    .strict();

const idSchema = GetUserByIdResponse.shape.data.shape.id;

describe('the exported dataset conforms to the generated contract', () => {
    describe('products', () => {
        it('parse against the generated product schema', () => {
            expect(collections.products.length).toBeGreaterThan(0);
            for (const product of collections.products) {
                expect(() => productSchema.parse(product)).not.toThrow();
            }
        });

        it('carry exactly one soft-deleted and one inactive specimen', () => {
            /* Both branches of `publicScope()` need a fixture behind them, and a branch with no
             * fixture is a branch nothing exercises. */
            expect(collections.products.filter((product) => 'deletedAt' in product)).toHaveLength(
                1
            );
            expect(collections.products.filter((product) => !product.active)).toHaveLength(1);
        });
    });

    describe('users', () => {
        it('parse against the generated user schema', () => {
            expect(collections.users.length).toBeGreaterThan(0);
            for (const user of collections.users) {
                expect(() => userSchema.parse(user)).not.toThrow();
            }
        });

        it('never publish a password or a token', () => {
            /* `applyUserTransform` omits both and the schema marks them `select: false`. This is the
             * assertion that would fail if the export ever started reading rows some other way. */
            for (const user of collections.users) {
                expect(user).not.toHaveProperty('password');
                expect(user).not.toHaveProperty('tokens');
            }
        });

        it('include one admin and one ordinary account', () => {
            expect(collections.users.filter((user) => user.admin)).toHaveLength(1);
            expect(collections.users.filter((user) => !user.admin)).toHaveLength(1);
        });
    });

    describe('credentials', () => {
        it('would be accepted by the real signup policy', () => {
            /* `CreateUserBody.shape.password` IS the policy — a published credential the API would
             * reject is a demo nobody can re-register by hand, and the frontend's `cy.loginAs()`
             * types these into a real form. */
            for (const account of Object.values(credentials)) {
                expect(() => CreateUserBody.shape.password.parse(account.password)).not.toThrow();
            }
        });

        it('name accounts the dataset actually contains', () => {
            const emails = new Set(collections.users.map((user) => user.email));
            for (const account of Object.values(credentials)) {
                expect(emails).toContain(account.email);
            }
        });
    });

    describe('orders', () => {
        it('parse against the generated order schema, totals included', () => {
            expect(collections.orders.length).toBeGreaterThan(0);
            for (const order of collections.orders) {
                expect(() => orderSchema.parse(order)).not.toThrow();
            }
        });

        it('carry the totals the serializer derived rather than stored values', () => {
            /* Recomputed here from the lines, which is the one place restating the arithmetic is
             * the point: if `applyOrderTransform` ever stops agreeing with its own inputs, the
             * published dataset would carry the disagreement into the frontend's mocks. */
            for (const order of collections.orders) {
                const quantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
                const price = order.items.reduce(
                    (sum, item) => sum + item.product.price * item.quantity,
                    0
                );
                expect(order.totalItems).toBe(order.items.length);
                expect(order.totalQuantity).toBe(quantity);
                /* Plus the shipping frozen at checkout, which `applyOrderTransform` folds into the
                 * total. Written out rather than assumed zero: one fixture chose a method, and an
                 * assertion that ignored the column would go green on an order whose published
                 * total silently dropped it. */
                expect(order.totalPrice).toBe(price + (order.shippingCost ?? 0));
            }
        });

        it('include one soft-deleted order, owned by the NON-admin account', () => {
            /* The case this exercises is "the owner cannot see their own soft-deleted order", which
             * ownership-only scoping would wrongly allow and an admin-owned fixture could not
             * catch. */
            const deleted = collections.orders.filter((order) => 'deletedAt' in order);
            expect(deleted).toHaveLength(1);

            const admin = collections.users.find((user) => user.admin);
            expect(deleted[0].userId).not.toBe(admin?.id);
        });
    });

    describe('address books', () => {
        it('parse their entries against the generated address schema', () => {
            const entries = collections.addressBooks.flatMap((book) => book.items);
            expect(entries.length).toBeGreaterThan(0);
            for (const entry of entries) {
                expect(() => addressSchema.parse(entry)).not.toThrow();
            }
        });

        it('carry exactly one default per book, the invariant the repository maintains', () => {
            /* `addEntry`/`updateEntry`/`removeEntry` all exist to keep this true of a non-empty
             * book. A dataset that broke it would hand the paired frontend a book its checkout
             * cannot pick a default from — and would do it silently, since no endpoint validates
             * a book it did not write. */
            expect(collections.addressBooks.length).toBeGreaterThan(0);
            for (const book of collections.addressBooks) {
                expect(book.items.filter((entry) => entry.default)).toHaveLength(1);
            }
        });

        it('include one entry with no phone, so an absent optional has a specimen', () => {
            const entries = collections.addressBooks.flatMap((book) => book.items);
            expect(entries.some((entry) => !('phone' in entry))).toBe(true);
        });
    });

    describe('carts', () => {
        it('parse their lines against the generated cart item schema', () => {
            const items = collections.carts.flatMap((cart) => cart.items);
            expect(items.length).toBeGreaterThan(0);
            for (const item of items) {
                expect(() => cartItemSchema.parse(item)).not.toThrow();
            }
        });
    });

    describe('languages', () => {
        it('parse against the generated language schema', () => {
            expect(collections.locales.length).toBeGreaterThan(0);
            for (const language of collections.locales) {
                expect(() => languageSchema.parse(language)).not.toThrow();
            }
        });

        it('carry both a published language and a draft', () => {
            /* Both branches of the visibility rule need a fixture behind them: an inactive
             * language must be absent from `GET /locales` and 404 on its dictionary, and neither
             * is checkable against a dataset where every language is active. */
            expect(
                collections.locales.filter((language) => language.active).length
            ).toBeGreaterThan(0);
            expect(
                collections.locales.filter((language) => !language.active).length
            ).toBeGreaterThan(0);
        });

        it('include a language the API also has a deployed file for', () => {
            /* The row that makes the manifest's merge real — one entry carrying both scopes and
             * `source: 'both'`. A dataset of languages the API cannot answer in would exercise
             * only half of it, which is exactly what happened while `es` played this part: it has
             * since become the database-only fixture and carries no deployed file at all. Read
             * from `listSupportedLocales()` rather than naming a tag, so this keeps asserting the
             * property and not one repository's current spelling of it. */
            const deployed = new Set(listSupportedLocales());

            expect(collections.locales.some((language) => deployed.has(language.tag))).toBe(true);
        });

        it('include a language with no deployed file, which is the tier this module exists for', () => {
            /* The converse, and the one the split is FOR: a language a client can download a
             * dictionary for and the API cannot answer a single request in. Without it the whole
             * dataset would be languages the filesystem already provides, and `scopes` would never
             * be observed carrying anything but both of them. */
            const deployed = new Set(listSupportedLocales());

            expect(collections.locales.some((language) => !deployed.has(language.tag))).toBe(true);
        });

        it('include a language with nothing translated into it yet', () => {
            /* The state between `POST /locales` and the first entry. Every count that reads this
             * collection has to survive it — `entryCount` of 0, a `revision` still at its default
             * — and a dataset where every language has rows checks none of that. */
            const translated = new Set(collections.localeMessages.map((entry) => entry.locale));
            const untranslated = collections.locales.filter(
                (language) => !translated.has(language.tag)
            );

            expect(untranslated.length).toBeGreaterThan(0);
            expect(untranslated.every((language) => language.revision === 0)).toBe(true);
        });
    });

    describe('locale entries', () => {
        it('parse against the generated entry schema', () => {
            expect(collections.localeMessages.length).toBeGreaterThan(0);
            for (const entry of collections.localeMessages) {
                expect(() => localeEntrySchema.parse(entry)).not.toThrow();
            }
        });

        it('name only languages the dataset also publishes', () => {
            /* The referential integrity a tag string buys instead of an ObjectId reference. An
             * entry pointing at a language nobody registered would render as a dictionary the
             * manifest never lists — and `scripts/export-seed.ts`'s dangling-reference sweep
             * cannot see it, because it matches keys ending in `Id`. */
            const tags = new Set(collections.locales.map((language) => language.tag));
            for (const entry of collections.localeMessages) {
                expect(tags).toContain(entry.locale);
            }
        });

        it('carry a key nested at least three levels deep', () => {
            /* A flat fixture set would let a tree builder that only ever nests once pass its own
             * tests and the contract suite alike. */
            expect(
                collections.localeMessages.some((entry) => entry.key.split('.').length >= 3)
            ).toBe(true);
        });

        it('never carry a key that collides with another in the same language', () => {
            /* `products.list` alongside `products.list.title` cannot be expressed as one tree, so
             * a dataset containing the pair would make `GET /locales/:locale/messages` throw for
             * the seeded language — and would do it in the paired frontend's mocks too. */
            const byLanguage = new Map<string, string[]>();
            for (const entry of collections.localeMessages)
                byLanguage.set(entry.locale, [...(byLanguage.get(entry.locale) ?? []), entry.key]);

            for (const [, keys] of byLanguage)
                for (const key of keys)
                    for (const other of keys)
                        if (other !== key) expect(other.startsWith(`${key}.`)).toBe(false);
        });
    });

    describe('wishlists', () => {
        it('parse their owner and their saved products against the generated id scalars', () => {
            expect(collections.wishlists.length).toBeGreaterThan(0);
            for (const wishlist of collections.wishlists) {
                expect(() => idSchema.parse(wishlist.userId)).not.toThrow();
                for (const item of wishlist.items) {
                    expect(() => wishlistProductIdSchema.parse(item.productId)).not.toThrow();
                }
            }
        });

        it('save only products the storefront would actually show', () => {
            /* A saved line pointing at the soft-deleted or inactive fixture renders as a hole in the
             * wishlist page: the row resolves to a product the scoping rules then refuse. */
            const visible = new Set(
                collections.products
                    .filter((product) => product.active && !('deletedAt' in product))
                    .map((product) => product.id)
            );
            for (const wishlist of collections.wishlists) {
                for (const item of wishlist.items) {
                    expect(visible).toContain(item.productId);
                }
            }
        });
    });

    /**
     * `_meta.shapes` — what the consumer is allowed to do with each collection.
     *
     * The map is the artefact's answer to the only question a mock author asks of it: can I return
     * this row as it stands? `scripts/export-seed.ts` refuses to publish an unclassified
     * collection, so these cases are the second net — they hold the COMMITTED file to the rule, in
     * both repos, which is what covers the frontend's copy between exports.
     */
    describe('the shapes map', () => {
        it('names every published collection, and only those', () => {
            expect(Object.keys(_meta.shapes).toSorted()).toStrictEqual(
                Object.keys(collections).toSorted()
            );
        });

        it('classifies each one as either servable or not', () => {
            /* A JSON import widens the values to `string`, so the union the manifest declares is
             * not checked on the way back in. A third value would be a consumer reading a label it
             * has no branch for. */
            for (const shape of Object.values(_meta.shapes)) {
                expect(['response', 'stored']).toContain(shape);
            }
        });

        it('calls a collection servable exactly when this file parses it as a whole response', () => {
            /* The tripwire on a mislabel, which is the failure the map introduces: a wrong label is
             * worse than none, because the reader stops checking. Every collection above parses
             * against SOMETHING, but only these three parse against a whole `Get<X>ByIdResponse`
             * payload — the rest are checked through an element or a nested field, which is itself
             * the evidence that no endpoint serves the row. Relabel a collection and this list has
             * to move with it, deliberately. */
            const parsedAsWholeResponses = ['orders', 'products', 'users'];

            const servable = Object.entries(_meta.shapes)
                .filter(([, shape]) => shape === 'response')
                .map(([name]) => name);

            expect(servable.toSorted()).toStrictEqual(parsedAsWholeResponses);
        });
    });
});
