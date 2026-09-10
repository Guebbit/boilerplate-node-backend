/**
 * Does the demo dataset still match the contract it is supposed to be a specimen of?
 *
 * The dataset is published here and nowhere else: it is not in `SHARED_FILES`, so nothing copies
 * it to the paired frontend and `check:spec-identity` never sees it. `check:seed-export` proves the
 * committed bytes match a fresh seeding run; nothing compared those bytes to `openapi.yaml`. That
 * is what this does.
 *
 * WHICH DIRECTION OF DRIFT THIS CATCHES, because only one of the two was ever covered. Renaming a
 * field in the SEED is already loud: the fixtures are typed against the mongoose documents, so a
 * `makeProduct({ imageUrl })` that no longer matches the schema is a compile error. Renaming it in
 * `openapi.yaml` was silent — the seeders keep writing the old field, the serializer keeps emitting
 * it, and nothing in either repo ever compared the result to the contract. That is the gap this
 * file closes, and it is the direction a contract-first project actually drifts in.
 *
 * WHY IT READS THE EXPORTED DATASET. `demo-data.json` holds what the API actually answered, so
 * the generated schemas are used AS GENERATED — no surgery. Reading hand-written fixtures instead
 * would need it: the user schema `.extend()`ed with a `password` and a `cart` the API never
 * returns, the order schema `.pick()`ed down to four fields because a fixture has no business
 * stating a total or a status.
 *
 * The totals and the status are in the export, derived by `applyOrderTransform` and therefore
 * worth checking, where a seeded guess at them would only test the guess.
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
    GetEntityTranslationsResponse,
    GetOrderByIdResponse,
    GetProductByIdResponse,
    GetUserByIdResponse,
    GetWishlistResponse
} from '@api/schemas.zod';
import { getFallbackLocale, listSupportedLocales } from '@infrastructure/i18n';
import { demoModules } from '@demo/index';
import dataset from '../../db/demo/demo-data.json';
import { enabledModules } from '../../src/modules';

const { credentials, collections } = dataset;

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
    .required({ role: true, active: true, imageUrl: true })
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

/** One entity's one-locale translation row, as the admin GET's `translations` array element. */
const translationSchema = GetEntityTranslationsResponse.shape.data.shape.translations.element
    .required({ createdAt: true, updatedAt: true })
    .strict();

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

    describe('translations', () => {
        it('parse against the generated translation schema', () => {
            expect(collections.translations.length).toBeGreaterThan(0);
            for (const translation of collections.translations) {
                expect(() => translationSchema.parse(translation)).not.toThrow();
            }
        });

        it('give every seeded product a fallback-locale row', () => {
            /* Every locale is a row, no special case for the source one — a product with no
             * fallback-locale row is one `planTranslations` should have refused to create in the
             * first place, so a seeded catalogue missing one means the seeder skipped the write
             * surface's own primitives rather than going through them. */
            const fallbackLocale = getFallbackLocale();
            const fallbackRowIds = new Set(
                collections.translations
                    .filter(
                        (translation) =>
                            translation.entityType === 'product' &&
                            translation.locale === fallbackLocale
                    )
                    .map((translation) => translation.entityId)
            );

            for (const product of collections.products) {
                expect(fallbackRowIds).toContain(product.id);
            }
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

        it('include exactly one shop owner, and several ordinary accounts', () => {
            /* Only `root` runs the shop. The ordinary count is deliberately not pinned to a
             * literal — `demo/users.ts`'s ten further customers exist to give `cart`/`orders` a
             * spread of shoppers, and that number is that module's to grow without this test
             * moving too. */
            expect(collections.users.filter((user) => user.role === 'owner')).toHaveLength(1);
            expect(
                collections.users.filter((user) => user.role === 'customer').length
            ).toBeGreaterThanOrEqual(2);
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

            // `role` alone no longer picks out the admin: the staff accounts (editor, translator,
            // moderator) carry one too, so this must name the one role that means "runs the shop".
            const admin = collections.users.find((user) => user.role === 'owner');
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
            /* The row that makes the manifest's merge real — one entry carrying both tenants and
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
             * dataset would be languages the filesystem already provides, and `tenants` would never
             * be observed carrying anything but both of them. */
            const deployed = new Set(listSupportedLocales());

            expect(collections.locales.some((language) => !deployed.has(language.tag))).toBe(true);
        });

        it('include a language with nothing translated into it yet', () => {
            /* The state between `POST /locales` and the first entry. Every count that reads this
             * collection has to survive it — `entryCount` of 0, a `revision` still at its default
             * — and a dataset where every language has rows checks none of that. */
            const translated = new Set(collections.localeEntries.map((entry) => entry.locale));
            const untranslated = collections.locales.filter(
                (language) => !translated.has(language.tag)
            );

            expect(untranslated.length).toBeGreaterThan(0);
            expect(untranslated.every((language) => language.revision === 0)).toBe(true);
        });
    });

    describe('locale entries', () => {
        it('parse against the generated entry schema', () => {
            expect(collections.localeEntries.length).toBeGreaterThan(0);
            for (const entry of collections.localeEntries) {
                expect(() => localeEntrySchema.parse(entry)).not.toThrow();
            }
        });

        it('name only languages the dataset also publishes', () => {
            /* The referential integrity a tag string buys instead of an ObjectId reference. An
             * entry pointing at a language nobody registered would render as a dictionary the
             * manifest never lists — and `scripts/demo/export-dataset.ts`'s dangling-reference sweep
             * cannot see it, because it matches keys ending in `Id`. */
            const tags = new Set(collections.locales.map((language) => language.tag));
            for (const entry of collections.localeEntries) {
                expect(tags).toContain(entry.locale);
            }
        });

        it('carry a key nested at least three levels deep', () => {
            /* A flat fixture set would let a tree builder that only ever nests once pass its own
             * tests and the contract suite alike. */
            expect(
                collections.localeEntries.some((entry) => entry.key.split('.').length >= 3)
            ).toBe(true);
        });

        it('never carry a key that collides with another in the same language', () => {
            /* `products.list` alongside `products.list.title` cannot be expressed as one tree, so
             * a dataset containing the pair would make `GET /locales/:locale/messages` throw for
             * the seeded language — and would do it in the paired frontend's mocks too. */
            const byLanguage = new Map<string, string[]>();
            for (const entry of collections.localeEntries)
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
     * `demo/index.ts` colocates nothing — moving a module's fixtures out from under it means
     * `rm -rf src/modules/<name>` no longer takes its demo data with it. This is the check that
     * replaces the guarantee colocation used to give for free: an entry left behind after its
     * module is deleted is loud here, instead of quietly seeding a collection nothing serves.
     */
    describe('the demo registry', () => {
        it('registers no module that `enabledModules` does not also enable', () => {
            const known = new Set(enabledModules.map((appModule) => appModule.name));
            for (const name of Object.keys(demoModules)) {
                expect(known).toContain(name);
            }
        });
    });
});
