/**
 * The multilingual product write surface, over real HTTP: `POST /products`, `PUT`/`PATCH
 * /products/{id}`, and the `translations` map and `source` of `GET /products/{id}`. Cross-module by nature, sitting at the top level rather than
 * under `src/modules/products/tests/`: driving these routes needs a real `locales` collection
 * row, which `products` may only reach through the `kernel/translation.ts` port.
 */

import { randomUUID } from 'node:crypto';
import '@tests/contract';
import { settleOutboxNudges } from '@kernel/outbox';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { createProduct, productRepository } from '@modules/products/tests/factories';
import { givenLocale } from '@modules/locales/tests/factories';
import { translator } from '@infrastructure/i18n';
import { sendTwice } from '@tests/replay';
import { credentialHolding } from '@tests/credentials';

setupTestDb();

/** The sentence a negative price answers with (it is not a non-negative decimal), from the shipped English copy. */
const fieldPriceMin = () => {
    const english = translator('en');
    return english('validation.invalid-format', {
        attribute: english('validation.attributes.price')
    });
};

/** The sentence a title under the contract's five-character floor answers with. */
const titleTooShort = () => {
    const english = translator('en');
    return english('validation.too-small-string', {
        attribute: english('validation.attributes.title'),
        minimum: '5'
    });
};

// `@tests/http`'s import boots the real app, which registers every enabled module's `translatables`.

/** `en` is the default language in every environment this suite runs in — see `.env-example`. */
const FALLBACK = 'en';

beforeEach(async () => {
    await givenLocale(FALLBACK);
});

describe('POST /products', () => {
    it('matches the contract, creating a product in every language sent at once', async () => {
        const { bearer } = await authenticateAsRole('editor');

        const response = await api().post('/products').set('Authorization', bearer).send({
            price: '24.90',
            title: 'Memory Foam Bed',
            description: 'Extra support'
        });

        expect(response.status).toBe(201);
        expect(response.body.title).toBe('Memory Foam Bed');
    });

    it('rejects a four-character title, the contract declares five', async () => {
        const { bearer } = await authenticateAsRole('editor');

        const response = await api()
            .post('/products')
            .set('Authorization', bearer)
            .send({ price: '10.00', title: 'Abcd' });

        expect(response.status).toBe(422);
        expect(response.body.errors).toEqual([
            expect.objectContaining({
                message: titleTooShort(),
                details: { field: 'title' }
            })
        ]);
    });

    it.each([
        ['a JSON number', 10],
        ['more places than EUR has', '10.005'],
        ['not a decimal at all', 'ten']
    ])('refuses a price that is %s: 422', async (_label, price) => {
        const { bearer } = await authenticateAsRole('editor');

        const response = await api()
            .post('/products')
            .set('Authorization', bearer)
            .send({ price, title: 'Memory Foam Bed' });

        expect(response.status).toBe(422);
    });

    it("answers a price at the currency's places, whatever spelling it was sent in", async () => {
        const { bearer } = await authenticateAsRole('editor');

        const response = await api()
            .post('/products')
            .set('Authorization', bearer)
            .send({ price: '10.5', title: 'Memory Foam Bed' });

        expect(response.status).toBe(201);
        expect(response.body.price).toBe('10.50');
    });

    it.each([
        ['a null locale', { price: '10.00', title: 'Memory Foam Bed', translations: { it: null } }],
        ['a null imageUrl', { price: '10.00', title: 'Memory Foam Bed', imageUrl: null }]
    ])('refuses %s: a create has nothing to clear', async (_label, body) => {
        const { bearer } = await authenticateAsRole('editor');

        const response = await api().post('/products').set('Authorization', bearer).send(body);

        expect(response.status).toBe(422);
    });

    it('stores no description, and answers none, for a product created without one', async () => {
        const { bearer } = await authenticateAsRole('editor');

        const response = await api()
            .post('/products')
            .set('Authorization', bearer)
            .send({ price: '10.00', title: 'Memory Foam Bed' });

        expect(response.status).toBe(201);
        expect(response.body).not.toHaveProperty('description');
        const stored = await productRepository.findById(String(response.body.id));
        expect(stored?.description).toBeUndefined();
    });

    it('rejects a body missing the title: the default language needs its own words', async () => {
        const { bearer } = await authenticateAsRole('editor');

        const response = await api()
            .post('/products')
            .set('Authorization', bearer)
            .send({ price: '10.00', translations: {} });

        expect(response.status).toBe(422);
        expect(response.body.errors[0].details).toEqual({ field: 'title' });
    });

    it.each([
        ['an entry', { title: 'Memory Foam Bed' }],
        ['a null', null]
    ])('rejects %s for the default language inside translations', async (_label, slot) => {
        const { bearer } = await authenticateAsRole('editor');

        const response = await api()
            .post('/products')
            .set('Authorization', bearer)
            .send({ price: '10.00', title: 'Memory Foam Bed', translations: { en: slot } });

        expect(response.status).toBe(422);
    });

    /**
     * `products` never writes `onHand`, and the create body carries none: a new product starts at
     * zero, and units enter only through a receipt, which leaves the ledger row. `admin`, not
     * `editor`: reading the ledger back needs `read:StockLevel`.
     */
    it('creates the product with no stock, and a receipt then gives it its opening count', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api().post('/products').set('Authorization', bearer).send({
            price: '12.00',
            title: 'Cedar Chew Toy',
            description: 'Durable'
        });
        const id = String(response.body.id);
        await settleOutboxNudges();

        expect(response.status).toBe(201);
        const empty = await api().get(`/inventory/levels/${id}`).set('Authorization', bearer);
        expect(empty.body.onHand).toBe(0);

        const received = await api()
            .post(`/inventory/levels/${id}/receive`)
            .set('Idempotency-Key', randomUUID())
            .set('Authorization', bearer)
            .set('Idempotency-Key', 'opening-count-1')
            .send({ quantity: 7 });
        const read = await api().get(`/inventory/levels/${id}`).set('Authorization', bearer);
        const movements = await api()
            .get(`/inventory/movements?productId=${id}`)
            .set('Authorization', bearer);

        expect(received.status).toBe(200);
        expect(read.body.onHand).toBe(7);
        expect(movements.body.items).toHaveLength(1);
        expect(movements.body.items[0]).toMatchObject({
            reason: 'receive',
            onHandDelta: 7,
            reservedDelta: 0
        });
    });

    it('refuses an opening count in the create body: stock is not a product field', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api().post('/products').set('Authorization', bearer).send({
            price: '12.00',
            onHand: 7,
            title: 'Cedar Chew Toy',
            description: 'Durable'
        });

        expect(response.status).toBe(422);
    });
});

describe('PUT /products/{id}', () => {
    it('matches the contract when replacing every writable field', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct({ title: 'Bed', price: '10.00' });

        const response = await api()
            .put(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({
                price: '15.00',
                active: true,
                purchasable: true,
                requiresShipping: true,
                allowBackorder: false,
                noWithdrawal: false,
                categories: [],
                tags: [],
                title: 'Bed, replaced',
                translations: {}
            });

        expect(response.status).toBe(200);
        expect(response.body.price).toBe('15.00');
        expect(response.body.title).toBe('Bed, replaced');
    });

    /**
     * `releaseDate` is part of the replaced representation too: omitting it clears it, so a
     * preorder ends and the product is on the shelf like any other.
     */
    it('clears a release date the PUT leaves out, which ends the preorder', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct({
            title: 'Bed',
            price: '10.00',
            releaseDate: new Date(Date.now() + 30 * 86_400_000).toISOString()
        });
        const before = await productRepository.findById(String(product._id));
        expect(before?.releaseDate).toBeDefined();

        const response = await api()
            .put(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({
                price: '10.00',
                active: true,
                purchasable: true,
                requiresShipping: true,
                allowBackorder: false,
                noWithdrawal: false,
                categories: [],
                tags: [],
                title: 'Bed, replaced',
                translations: {}
            });

        expect(response.status).toBe(200);
        expect(response.body.releaseDate).toBeUndefined();
        const after = await productRepository.findById(String(product._id));
        expect(after?.releaseDate).toBeUndefined();
    });

    /**
     * A PUT body IS the new resource (RFC 9110 §9.3.4) — `active`/`requiresShipping`/`categories`/
     * `tags` have no legal "cleared" state, so all of them are required alongside price/translations.
     */
    it.each(['allowBackorder', 'noWithdrawal'])(
        'refuses a PUT that leaves out %s: it has no cleared state',
        async (field) => {
            const { bearer } = await authenticateAsRole('editor');
            const product = await createProduct({ title: 'Bed', price: '10.00' });
            const body: Record<string, unknown> = {
                price: '15.00',
                active: true,
                purchasable: true,
                requiresShipping: true,
                allowBackorder: false,
                noWithdrawal: false,
                categories: [],
                tags: [],
                title: 'Bed, replaced',
                translations: {}
            };
            delete body[field];

            const response = await api()
                .put(`/products/${String(product._id)}`)
                .set('Authorization', bearer)
                .send(body);

            expect(response.status).toBe(422);
        }
    );

    it('refuses a PUT body missing a required field', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct({ title: 'Bed', price: '10.00' });

        const response = await api()
            .put(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ price: '15.00', title: 'Bed, replaced' });

        expect(response.status).toBe(422);
    });

    /**
     * `translations` is part of the replaced representation too: a stored locale
     * the PUT leaves out is deleted, not kept. Keeping one is what PATCH is for.
     */
    it('deletes every stored locale the PUT leaves out', async () => {
        await givenLocale('it');
        const { bearer } = await authenticateAsRole('editor');
        const created = await api()
            .post('/products')
            .set('Authorization', bearer)
            .send({
                price: '10.00',
                title: 'Dog Bed',
                translations: { it: { title: 'Cuccia' } }
            });
        const id = String(created.body.id);

        const response = await api().put(`/products/${id}`).set('Authorization', bearer).send({
            price: '10.00',
            active: true,
            purchasable: true,
            requiresShipping: true,
            allowBackorder: false,
            noWithdrawal: false,
            categories: [],
            tags: [],
            title: 'Dog Bed, replaced',
            translations: {}
        });
        const admin = await api().get(`/products/${id}`).set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(admin.body.translations).toEqual({});
        expect(admin.body.source.title).toBe('Dog Bed, replaced');
    });

    it('refuses a PUT that names the default language inside translations', async () => {
        await givenLocale('it');
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct({ title: 'Bed', price: '10.00' });

        const response = await api()
            .put(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({
                price: '15.00',
                active: true,
                purchasable: true,
                requiresShipping: true,
                allowBackorder: false,
                noWithdrawal: false,
                categories: [],
                tags: [],
                title: 'Bed, replaced',
                translations: { en: { title: 'Bed, again' } }
            });

        expect(response.status).toBe(422);
        expect(response.body.errors[0].details).toEqual({ field: 'translations.en' });
    });

    /**
     * The factory now validates PUT against `zodProductReplaceSchema`, not the raw generated one —
     * otherwise this message never surfaces, refused first by the contract's generic minimum.
     */
    it('422s a negative price with the field-named message, not a generic one', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct({ title: 'Bed', price: '10.00' });

        const response = await api()
            .put(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({
                price: '-5.00',
                active: true,
                purchasable: true,
                requiresShipping: true,
                allowBackorder: false,
                noWithdrawal: false,
                categories: [],
                tags: [],
                title: 'Bed, replaced',
                translations: {}
            });

        expect(response.status).toBe(422);
        expect(response.body.errors.map((error: { message: string }) => error.message)).toContain(
            fieldPriceMin()
        );
    });
});

describe('PATCH /products/{id}', () => {
    it('matches the contract, merging a price change and a translation edit', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct({ title: 'Bed', price: '10.00' });

        const response = await api()
            .patch(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ price: '15.00', title: 'Bed, revised' });

        expect(response.status).toBe(200);
        expect(response.body.price).toBe('15.00');
        expect(response.body.title).toBe('Bed, revised');
    });

    /**
     * The write route stacks `update:Product` AND `update:Translation`. No preset role
     * holds one without the other, so the "one key alone refuses" half of this cannot be
     * exercised over HTTP today — `shared/cases/authorization.cases.yaml` asserts it at the
     * ability layer instead ("the dictionary keys do not update a price, even together").
     */
    it('lets the editor change a price', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct({ title: 'Bed', price: '10.00' });

        const response = await api()
            .patch(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ price: '999.00' });

        expect(response.status).toBe(200);
        expect(response.body.price).toBe('999.00');
    });

    /**
     * `taxClass: null` means "back to the shop's standard rate", the same as every other
     * clearable field on this schema.
     */
    it('clears taxClass back to the standard rate on an explicit null', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct({ title: 'Bed', price: '10.00', taxClass: 'reduced' });

        const response = await api()
            .patch(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ taxClass: null });

        expect(response.status).toBe(200);
        expect(response.body.taxClass).toBeUndefined();
    });

    /**
     * The factory now validates PATCH against `zodProductUpdateSchema` directly, and
     * `updateById` no longer re-parses — this message has exactly one place left to come from.
     */
    it('422s a negative price with the field-named message, not a generic one', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct({ title: 'Bed', price: '10.00' });

        const response = await api()
            .patch(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ price: '-5.00' });

        expect(response.status).toBe(422);
        expect(response.body.errors.map((error: { message: string }) => error.message)).toContain(
            fieldPriceMin()
        );
    });
});

/** Creates a product with both fields in the default language and an Italian copy of both. */
const seeded = async () => {
    await givenLocale('it');
    const { bearer } = await authenticateAs('admin');
    const created = await api()
        .post('/products')
        .set('Authorization', bearer)
        .send({
            price: '10.00',
            title: 'Cozy Bed',
            description: 'Extra support',
            translations: { it: { title: 'Cuccia', description: 'Supporto extra' } }
        });
    return { bearer, id: String(created.body.id) };
};

/** What the editor's form reads of a product: the default text, and the other languages. */
interface FormRead {
    source: Record<string, string>;
    translations: Record<string, Record<string, string>>;
}

/** The product as the editor's form reads it back. */
const readForForm = (bearer: string, id: string) =>
    api()
        .get(`/products/${id}`)
        .set('Authorization', bearer)
        // `as`: the response body is `any`; the shape is the one `Product.source`/`translations` declare.
        .then((response) => response.body as FormRead);

describe('PATCH /products/{id}, the default language and the others (RFC 7396)', () => {
    it('changes only the field named — the description stays', async () => {
        const { bearer, id } = await seeded();

        const response = await api()
            .patch(`/products/${id}`)
            .set('Authorization', bearer)
            .send({ title: 'Cozy Bed XL' });

        expect(response.status).toBe(200);
        expect(response.body.description).toBe('Extra support');
        const body = await readForForm(bearer, id);
        expect(body.source).toEqual({ title: 'Cozy Bed XL', description: 'Extra support' });
    });

    it('clears the description on null', async () => {
        const { bearer, id } = await seeded();

        const response = await api()
            .patch(`/products/${id}`)
            .set('Authorization', bearer)
            .send({ description: null });

        expect(response.status).toBe(200);
        expect(response.body).not.toHaveProperty('description');
        const body = await readForForm(bearer, id);
        expect(body.source).toEqual({ title: 'Cozy Bed' });
    });

    it('merges a translated field without touching the default text or the other fields', async () => {
        const { bearer, id } = await seeded();

        await api()
            .patch(`/products/${id}`)
            .set('Authorization', bearer)
            .send({ translations: { it: { title: 'Cuccia XL' } } });

        const body = await readForForm(bearer, id);
        expect(body.translations.it).toEqual({ title: 'Cuccia XL', description: 'Supporto extra' });
        expect(body.source).toEqual({ title: 'Cozy Bed', description: 'Extra support' });
    });

    it.each([
        ['an empty description', { it: { description: '' } }],
        ['an empty locale object', { it: {} }],
        ['a cleared title', { it: { title: null } }]
    ])('422s %s', async (_label, translations) => {
        const { bearer, id } = await seeded();

        const response = await api()
            .patch(`/products/${id}`)
            .set('Authorization', bearer)
            .send({ translations });

        expect(response.status).toBe(422);
    });

    it('422s a title under the minimum, and an empty description, on the default language', async () => {
        const { bearer, id } = await seeded();

        const short = await api()
            .patch(`/products/${id}`)
            .set('Authorization', bearer)
            .send({ title: 'abc' });
        const empty = await api()
            .patch(`/products/${id}`)
            .set('Authorization', bearer)
            .send({ description: '' });

        expect(short.status).toBe(422);
        expect(short.body.errors[0].details).toEqual({ field: 'title' });
        expect(empty.status).toBe(422);
    });

    it('422s any entry for the default language inside translations', async () => {
        const { bearer, id } = await seeded();

        const response = await api()
            .patch(`/products/${id}`)
            .set('Authorization', bearer)
            .send({ translations: { en: null } });

        expect(response.status).toBe(422);
        expect(response.body.errors[0].details).toEqual({ field: 'translations.en' });
    });

    it('states the default language whole on a PUT: an omitted description is cleared', async () => {
        const { bearer, id } = await seeded();

        const response = await api()
            .put(`/products/${id}`)
            .set('Authorization', bearer)
            .send({
                price: '10.00',
                active: true,
                purchasable: true,
                requiresShipping: true,
                allowBackorder: false,
                noWithdrawal: false,
                categories: [],
                tags: [],
                title: 'Cozy Bed XL',
                translations: { it: { title: 'Cuccia' } }
            });

        expect(response.status).toBe(200);
        const body = await readForForm(bearer, id);
        expect(body.source).toEqual({ title: 'Cozy Bed XL' });
        // The Italian row was stated whole too: its description is gone.
        expect(body.translations.it).toEqual({ title: 'Cuccia' });
    });

    it('stamps a row written beside a new title as current, and a row left alone as outdated', async () => {
        const { bearer, id } = await seeded();
        await givenLocale('de');
        await api()
            .patch(`/locales/translations/product/${id}`)
            .set('Authorization', bearer)
            .send({ de: { fields: { title: 'Hundekorb' }, origin: 'human' } });

        await api()
            .patch(`/products/${id}`)
            .set('Authorization', bearer)
            .send({ title: 'Cozy Bed, new', translations: { it: { title: 'Cuccia nuova' } } });

        const rows = await api()
            .get(`/locales/translations/product/${id}`)
            .set('Authorization', bearer);
        const outdatedByLocale = Object.fromEntries(
            rows.body.translations.map((row: { locale: string; outdated: boolean }) => [
                row.locale,
                row.outdated
            ])
        );
        expect(outdatedByLocale).toEqual({ de: true, it: false });
    });
});

describe('the generic translator door follows the product rules (bug W9)', () => {
    it('refuses a title under the product minimum instead of writing it', async () => {
        const { bearer, id } = await seeded();

        const response = await api()
            .patch(`/locales/translations/product/${id}`)
            .set('Authorization', bearer)
            .send({ it: { fields: { title: 'abc' }, origin: 'human' } });

        expect(response.status).toBe(422);
        expect(response.body.errors[0].details.field).toBe('it.title');
    });

    it('merges one field on PATCH and replaces the locale whole on PUT', async () => {
        const { bearer, id } = await seeded();
        const url = `/locales/translations/product/${id}`;

        const merged = await api()
            .patch(url)
            .set('Authorization', bearer)
            .send({ it: { fields: { title: 'Cuccia XL' }, origin: 'human' } });
        const replaced = await api()
            .put(url)
            .set('Authorization', bearer)
            .send({ it: { fields: { title: 'Cuccia XXL' }, origin: 'human' } });

        expect(merged.body.translations[0].fields).toEqual({
            title: 'Cuccia XL',
            description: 'Supporto extra'
        });
        expect(replaced.body.translations[0].fields).toEqual({ title: 'Cuccia XXL' });
    });

    it('answers the product’s own text as the source, and refuses the default language', async () => {
        const { bearer, id } = await seeded();
        const url = `/locales/translations/product/${id}`;

        const read = await api().get(url).set('Authorization', bearer);
        const refused = await api()
            .patch(url)
            .set('Authorization', bearer)
            .send({ en: { fields: { title: 'Cozy Bed XL' }, origin: 'human' } });

        expect(read.body.source.fields).toEqual({
            title: 'Cozy Bed',
            description: 'Extra support'
        });
        expect(refused.status).toBe(422);
    });
});

describe('SKU', () => {
    it('creates a product carrying a sku', async () => {
        const { bearer } = await authenticateAsRole('editor');

        const response = await api().post('/products').set('Authorization', bearer).send({
            price: '24.90',
            sku: 'DOG-BED-15KG',
            title: 'Dog Bed'
        });

        expect(response.status).toBe(201);
        expect(response.body.sku).toBe('DOG-BED-15KG');
    });

    /**
     * Unique across the catalogue, not per request — the sparse unique index
     * (`products/model.ts`'s `products_sku`) is what a second product colliding with an
     * ALREADY-STORED sku refuses against, same 409 shape `users`' duplicate email answers with.
     */
    it('409s a sku that collides with another product', async () => {
        const { bearer } = await authenticateAsRole('editor');
        await createProduct({ title: 'Existing', sku: 'DUP-1' });

        const response = await api()
            .post('/products')
            .set('Authorization', bearer)
            .send({ price: '10.00', sku: 'DUP-1', title: 'Collides' });

        expect(response.status).toBe(409);
    });

    it('clears a sku back to unset on an explicit null', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct({ title: 'Bed', price: '10.00', sku: 'BED-1' });

        const response = await api()
            .patch(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ sku: null });

        expect(response.status).toBe(200);
        expect(response.body.sku).toBeUndefined();
    });
});

describe('VAT rate type', () => {
    /**
     * `rateType` says WHY a `taxClass: zero` product is 0% — `zero_rated` or `exempt` — round
     * tripping each value the same way `taxClass` itself already does.
     */
    it.each(['zero_rated', 'exempt'] as const)(
        'creates a product carrying rateType %s',
        async (rateType) => {
            const { bearer } = await authenticateAsRole('editor');

            const response = await api().post('/products').set('Authorization', bearer).send({
                price: '24.90',
                taxClass: 'zero',
                rateType,
                title: 'Dog Bed'
            });

            expect(response.status).toBe(201);
            expect(response.body.rateType).toBe(rateType);
        }
    );

    // `rateType: null` means "back to standard", same as `taxClass`'s own clearing rule.
    it('clears rateType back to standard on an explicit null', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct({
            title: 'Bed',
            price: '10.00',
            taxClass: 'zero',
            rateType: 'exempt'
        });

        const response = await api()
            .patch(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ rateType: null });

        expect(response.status).toBe(200);
        expect(response.body.rateType).toBeUndefined();
    });
});

describe('GET /products/{id}, the translations map and the source', () => {
    it('matches the contract, returning the default text and every other language', async () => {
        await givenLocale('it');
        const { bearer } = await authenticateAsRole('editor');
        const created = await api()
            .post('/products')
            .set('Authorization', bearer)
            .send({
                price: '24.90',
                title: 'Memory Foam Bed',
                translations: { it: { title: 'Letto in memory' } }
            });

        const response = await api()
            .get(`/products/${String(created.body.id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.source).toEqual({ title: 'Memory Foam Bed' });
        expect(response.body.translations).toEqual({ it: { title: 'Letto in memory' } });
    });
});

/** A create body titled in the default language. */
const bodyTitled = (title: string) => ({ price: '10.00', title });

describe('the product writes carry no stock, for any role', () => {
    /** Every stock-shaped field the product answer used to carry. */
    const STOCK_FIELDS = [
        'onHand',
        'reserved',
        'available',
        'inStock',
        'lowStock',
        'buyable',
        'preorder',
        'backorder'
    ];

    it('answers a create by an editor and by an admin without them, and so does the read after', async () => {
        const editor = await authenticateAsRole('editor');
        const admin = await authenticateAsRole('admin');

        const byEditor = await api()
            .post('/products')
            .set('Authorization', editor.bearer)
            .send(bodyTitled('Editor desk'));
        const byAdmin = await api()
            .post('/products')
            .set('Authorization', admin.bearer)
            .send(bodyTitled('Admin desk'));

        expect(byEditor.status).toBe(201);
        expect(byAdmin.status).toBe(201);
        const adminRead = await api()
            .get(`/products/${String(byAdmin.body.id)}`)
            .set('Authorization', admin.bearer);
        expect(
            [byEditor.body, byAdmin.body, adminRead.body].flatMap((body: Record<string, unknown>) =>
                STOCK_FIELDS.filter((field) => field in body)
            )
        ).toEqual([]);
    });
});

describe('product states: `purchasable`', () => {
    it('defaults to true on create, and accepts false', async () => {
        const { bearer } = await authenticateAsRole('editor');

        const plain = await api()
            .post('/products')
            .set('Authorization', bearer)
            .send({ price: '10.00', title: 'Plain Dog Bed' });
        const offSale = await api().post('/products').set('Authorization', bearer).send({
            price: '10.00',
            purchasable: false,
            title: 'Off-sale Dog Bed'
        });

        expect(plain.body.purchasable).toBe(true);
        expect(offSale.body.purchasable).toBe(false);
    });

    it('round-trips through PATCH without touching `active`', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct({ title: 'Bed', active: true });

        const response = await api()
            .patch(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ purchasable: false });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ purchasable: false, active: true });
    });

    it('is part of the replaced representation: a PUT without it is refused', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct({ title: 'Bed' });

        const response = await api()
            .put(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({
                price: '15.00',
                active: true,
                requiresShipping: true,
                allowBackorder: false,
                noWithdrawal: false,
                categories: [],
                tags: [],
                title: 'Bed, replaced',
                translations: {}
            });

        expect(response.status).toBe(422);
    });
});

/** How many products the catalogue lists for the caller. */
const productCount = (bearer: string): Promise<number> =>
    api()
        .get('/products')
        .set('Authorization', bearer)
        .then((response) => (response.body.items as unknown[]).length);

describe('POST /products with an Idempotency-Key', () => {
    const WORDS = { title: 'Memory Foam Bed', description: 'Extra support' };

    it('creates one product for a retried JSON body and replays the first answer', async () => {
        const { bearer } = await authenticateAsRole('editor');

        const { first, retry } = await sendTwice(() =>
            api()
                .post('/products')
                .set('Authorization', bearer)
                .set('Idempotency-Key', 'product-json-1')
                .send({ price: '24.90', ...WORDS })
        );

        expect(first.status).toBe(201);
        expect(retry.status).toBe(201);
        expect(retry.headers['idempotent-replayed']).toBe('true');
        expect(retry.body.id).toBe(first.body.id);
        await expect(productCount(bearer)).resolves.toBe(1);
    });

    it('creates one product for a byte-identical multipart retry', async () => {
        const { bearer } = await authenticateAsRole('editor');

        const { first, retry } = await sendTwice(() =>
            api()
                .post('/products')
                .set('Authorization', bearer)
                .set('Idempotency-Key', 'product-multipart-1')
                .field('price', '24.90')
                .field('title', WORDS.title)
                .field('description', WORDS.description)
        );

        expect(first.status).toBe(201);
        expect(retry.headers['idempotent-replayed']).toBe('true');
        expect(retry.body.id).toBe(first.body.id);
        await expect(productCount(bearer)).resolves.toBe(1);
    });

    it('creates a second product for a new key', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const create = (key: string) =>
            api()
                .post('/products')
                .set('Authorization', bearer)
                .set('Idempotency-Key', key)
                .send({ price: '24.90', ...WORDS });

        await sendTwice(() => create('product-json-1'));
        await create('product-json-2');

        await expect(productCount(bearer)).resolves.toBe(2);
    });
});

/** A body a PUT accepts, in both languages the shared product carries. */
const REPLACEMENT = {
    price: '15.00',
    active: true,
    purchasable: true,
    requiresShipping: true,
    allowBackorder: false,
    noWithdrawal: false,
    categories: [],
    tags: [],
    title: 'Dog Bed, replaced',
    translations: { it: { title: 'Cuccia, sostituita' } }
};

/**
 * The four writes that answer a product, each as one call against an existing one. Restore needs a
 * deleted product, so it deletes first.
 */
const PRODUCT_WRITES = {
    create: (bearer: string, language: string) =>
        api()
            .post('/products')
            .set('Authorization', bearer)
            .set('Accept-Language', language)
            .send({
                price: '24.90',
                title: 'Memory Foam Bed',
                translations: { it: { title: 'Letto in memory' } }
            }),
    put: (bearer: string, language: string, id: string) =>
        api()
            .put(`/products/${id}`)
            .set('Authorization', bearer)
            .set('Accept-Language', language)
            .send(REPLACEMENT),
    patch: (bearer: string, language: string, id: string) =>
        api()
            .patch(`/products/${id}`)
            .set('Authorization', bearer)
            .set('Accept-Language', language)
            .send({ price: '12.00' }),
    restore: (bearer: string, language: string, id: string) =>
        api()
            .delete(`/products/${id}`)
            .set('Authorization', bearer)
            .then(() =>
                api()
                    .post(`/products/${id}/restore`)
                    .set('Authorization', bearer)
                    .set('Accept-Language', language)
            )
};

/** A product in both languages, made by an editor. */
const seedBilingual = (bearer: string): Promise<string> =>
    api()
        .post('/products')
        .set('Authorization', bearer)
        .send({
            price: '10.00',
            title: 'Dog Bed',
            translations: { it: { title: 'Cuccia' } }
        })
        .then((created) => String(created.body.id));

describe('a product write answers the product as its own GET reads it (AIP-133/134/164)', () => {
    beforeEach(async () => {
        await givenLocale('it');
    });

    it.each(['create', 'put', 'patch', 'restore'] as const)(
        '%s: an editor reading in Italian gets the body a GET right after gets',
        async (write) => {
            const { bearer } = await authenticateAsRole('editor');
            const id = await seedBilingual(bearer);

            const written = await PRODUCT_WRITES[write](bearer, 'it', id);
            await settleOutboxNudges();
            const read = await api()
                .get(`/products/${String(written.body.id)}`)
                .set('Authorization', bearer)
                .set('Accept-Language', 'it');

            expect(written.status).toBe(write === 'create' ? 201 : 200);
            expect(written.body.translations).toHaveProperty('it');
            expect(written.body).toEqual(read.body);
        }
    );

    it.each(['create', 'put', 'patch', 'restore'] as const)(
        '%s: without read:Translation or read:StockLevel the body has neither, as the GET',
        async (write) => {
            const { bearer: editor } = await authenticateAsRole('editor');
            const id = await seedBilingual(editor);
            const bearer = await credentialHolding([
                'create:Product',
                'update:Product',
                'delete:Product',
                'display:Product',
                'update:Translation'
            ]).then((secret) => `Bearer ${secret}`);

            const written = await PRODUCT_WRITES[write](bearer, 'it', id);
            const read = await api()
                .get(`/products/${String(written.body.id)}`)
                .set('Authorization', bearer)
                .set('Accept-Language', 'it');

            expect(written.status).toBe(write === 'create' ? 201 : 200);
            expect(written.body).not.toHaveProperty('translations');
            for (const counter of ['onHand', 'reserved', 'available'])
                expect(written.body).not.toHaveProperty(counter);
            expect(written.body).toEqual(read.body);
        }
    );

    // PATCH only: a PUT's answer may carry no tag, and create/restore carry Express's content tag.
    it('patch: the answer carries the ETag a GET right after answers', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const id = await seedBilingual(bearer);

        const written = await PRODUCT_WRITES.patch(bearer, 'it', id);
        const read = await api()
            .get(`/products/${id}`)
            .set('Authorization', bearer)
            .set('Accept-Language', 'it');

        expect(written.headers.etag).toBeDefined();
        expect(written.headers.etag).toBe(read.headers.etag);
    });
});
