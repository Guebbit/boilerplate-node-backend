/**
 * The multilingual product write surface, over real HTTP: `POST /products`, `PUT`/`PATCH
 * /products/{id}` and `GET /products/{id}/admin`. Cross-module by nature, sitting at the top level rather than
 * under `src/modules/products/tests/`: driving these routes needs a real `locales` collection
 * row, which `products` may only reach through the `kernel/translation.ts` port.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { localeRepository } from '@modules/locales/repository';
import { makeLocale } from '@modules/locales/factories';
import { localeService } from '@modules/locales/services';
import { productRepository } from '@modules/products/repository';
import { checkProductTranslationFields } from '@modules/products/model';
import { mergedResources } from '@tests/i18n-boot';

setupTestDb();

/** The field-named copy the factory's own extended schema must be the one answering with. */
const fieldPriceMin = () =>
    (mergedResources().en.translation as { products: Record<string, string> }).products[
        'field-price-min'
    ];

beforeAll(() => {
    localeService.setTranslatables({
        product: {
            collection: 'products',
            fields: ['title', 'description'],
            cacheTag: 'products',
            exists: productRepository.existsById,
            writeDerived: productRepository.writeTranslatedFields,
            markEdited: productRepository.markEdited,
            checkFields: checkProductTranslationFields
        }
    });
});

afterAll(() => {
    localeService.setTranslatables({});
});

/** `en` is the fallback locale in every environment this suite runs in — see `.env-example`. */
const FALLBACK = 'en';

beforeEach(async () => {
    await localeRepository.create(
        makeLocale({ tag: FALLBACK, name: FALLBACK, nativeName: FALLBACK })
    );
});

describe('POST /products', () => {
    it('matches the contract, creating a product in every language sent at once', async () => {
        const { bearer } = await authenticateAsRole('editor');

        const response = await api()
            .post('/products')
            .set('Authorization', bearer)
            .send({
                price: 24.9,
                translations: { en: { title: 'Memory Foam Bed', description: 'Extra support' } }
            });

        expect(response.status).toBe(201);
        expect(response.body.data.title).toBe('Memory Foam Bed');
    });

    it('rejects a body missing the fallback locale', async () => {
        const { bearer } = await authenticateAsRole('editor');

        const response = await api()
            .post('/products')
            .set('Authorization', bearer)
            .send({ price: 10, translations: {} });

        expect(response.status).toBe(422);
    });

    /*
     * `products` never writes `onHand` itself — see `products/services/crud.ts`'s `create()` — so this
     * is the one test proving the opening count still reaches the document, through a real
     * `receive()` movement rather than a direct field write. `owner`, not `editor`: reading the
     * ledger back needs `inventory.any.read`, which the editor role does not hold.
     */
    it('gives the product its opening stock through a real receive movement', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post('/products')
            .set('Authorization', bearer)
            .send({
                price: 12,
                onHand: 7,
                translations: { en: { title: 'Cedar Chew Toy', description: 'Durable' } }
            });

        expect(response.status).toBe(201);
        expect(response.body.data.onHand).toBe(7);

        const movements = await api()
            .get(`/inventory/movements?productId=${String(response.body.data.id)}`)
            .set('Authorization', bearer);
        expect(movements.body.data.items).toHaveLength(1);
        expect(movements.body.data.items[0]).toMatchObject({
            reason: 'receive',
            onHandDelta: 7,
            reservedDelta: 0
        });
    });
});

describe('PUT /products/{id}', () => {
    it('matches the contract when replacing every writable field', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct({ title: 'Bed', price: 10 });

        const response = await api()
            .put(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({
                price: 15,
                active: true,
                requiresShipping: true,
                categories: [],
                tags: [],
                translations: { en: { title: 'Bed, replaced' } }
            });

        expect(response.status).toBe(200);
        expect(response.body.data.price).toBe(15);
        expect(response.body.data.title).toBe('Bed, replaced');
    });

    // A PUT body IS the new resource (RFC 9110 §9.3.4) — `active`/`requiresShipping`/`categories`/
    // `tags` have no legal "cleared" state, so all of them are required alongside price/translations.
    it('refuses a PUT body missing a required field', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct({ title: 'Bed', price: 10 });

        const response = await api()
            .put(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ price: 15, translations: { en: { title: 'Bed, replaced' } } });

        expect(response.status).toBe(422);
    });

    // `translations` is part of the replaced representation too: a stored locale
    // the PUT leaves out is deleted, not kept. Keeping one is what PATCH is for.
    it('deletes every stored locale the PUT leaves out', async () => {
        await localeRepository.create(makeLocale({ tag: 'it', name: 'it', nativeName: 'it' }));
        const { bearer } = await authenticateAsRole('editor');
        const created = await api()
            .post('/products')
            .set('Authorization', bearer)
            .send({
                price: 10,
                translations: { en: { title: 'Dog Bed' }, it: { title: 'Cuccia' } }
            });
        const id = String(created.body.data.id);

        const response = await api()
            .put(`/products/${id}`)
            .set('Authorization', bearer)
            .send({
                price: 10,
                active: true,
                requiresShipping: true,
                categories: [],
                tags: [],
                translations: { en: { title: 'Dog Bed, replaced' } }
            });
        const admin = await api().get(`/products/${id}/admin`).set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(Object.keys(admin.body.data.translations)).toEqual(['en']);
    });

    it('refuses a PUT whose translations leave out the fallback locale', async () => {
        await localeRepository.create(makeLocale({ tag: 'it', name: 'it', nativeName: 'it' }));
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct({ title: 'Bed', price: 10 });

        const response = await api()
            .put(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({
                price: 15,
                active: true,
                requiresShipping: true,
                categories: [],
                tags: [],
                translations: { it: { title: 'Cuccia' } }
            });

        expect(response.status).toBe(422);
    });

    // The factory now validates PUT against `zodProductReplaceSchema`, not the raw generated one —
    // otherwise this message never surfaces, refused first by the contract's generic minimum.
    it('422s a negative price with the field-named message, not a generic one', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct({ title: 'Bed', price: 10 });

        const response = await api()
            .put(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({
                price: -5,
                active: true,
                requiresShipping: true,
                categories: [],
                tags: [],
                translations: { en: { title: 'Bed, replaced' } }
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
        const product = await createProduct({ title: 'Bed', price: 10 });

        const response = await api()
            .patch(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ price: 15, translations: { en: { title: 'Bed, revised' } } });

        expect(response.status).toBe(200);
        expect(response.body.data.price).toBe(15);
        expect(response.body.data.title).toBe('Bed, revised');
    });

    // The write route stacks `products.any.update` AND `translations.any.update`. No preset role
    // holds one without the other, so the "one key alone refuses" half of this cannot be
    // exercised over HTTP today — `shared/authorization-conformance.yaml` asserts it at the
    // ability layer instead ("the dictionary keys do not update a price, even together").
    it('lets the editor change a price', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct({ title: 'Bed', price: 10 });

        const response = await api()
            .patch(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ price: 999 });

        expect(response.status).toBe(200);
        expect(response.body.data.price).toBe(999);
    });

    // `taxClass: null` means "back to the shop's standard rate", the same as every other
    // clearable field on this schema.
    it('clears taxClass back to the standard rate on an explicit null', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct({ title: 'Bed', price: 10, taxClass: 'reduced' });

        const response = await api()
            .patch(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ taxClass: null });

        expect(response.status).toBe(200);
        expect(response.body.data.taxClass).toBeUndefined();
    });

    // The factory now validates PATCH against `zodProductUpdateSchema` directly, and
    // `writeUpdate` no longer re-parses — this message has exactly one place left to come from.
    it('422s a negative price with the field-named message, not a generic one', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct({ title: 'Bed', price: 10 });

        const response = await api()
            .patch(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ price: -5 });

        expect(response.status).toBe(422);
        expect(response.body.errors.map((error: { message: string }) => error.message)).toContain(
            fieldPriceMin()
        );
    });
});

/** Creates a product with both fields in the fallback locale, returning its id and a session. */
const seeded = async () => {
    const { bearer } = await authenticateAs('admin');
    const created = await api()
        .post('/products')
        .set('Authorization', bearer)
        .send({
            price: 10,
            translations: { en: { title: 'Cozy Bed', description: 'Extra support' } }
        });
    return { bearer, id: String(created.body.data.id) };
};

/** The whole `en` entry as the editor's form would read it back. */
const readEnglish = (bearer: string, id: string) =>
    api()
        .get(`/products/${id}/admin`)
        .set('Authorization', bearer)
        .then((response) => response.body.data.translations.en as Record<string, unknown>);

describe('PATCH /products/{id} translations, field by field (RFC 7396)', () => {
    it('changes only the field named — the description and its mirrored column stay', async () => {
        const { bearer, id } = await seeded();

        const response = await api()
            .patch(`/products/${id}`)
            .set('Authorization', bearer)
            .send({ translations: { en: { title: 'Cozy Bed XL' } } });

        expect(response.status).toBe(200);
        expect(response.body.data.description).toBe('Extra support');
        expect(await readEnglish(bearer, id)).toEqual({
            title: 'Cozy Bed XL',
            description: 'Extra support'
        });
    });

    it('clears the description on null, in the row and in the mirrored column', async () => {
        const { bearer, id } = await seeded();

        const response = await api()
            .patch(`/products/${id}`)
            .set('Authorization', bearer)
            .send({ translations: { en: { description: null } } });

        expect(response.status).toBe(200);
        expect(response.body.data.description).toBe('');
        expect(await readEnglish(bearer, id)).toEqual({ title: 'Cozy Bed' });
    });

    it.each([
        ['an empty description', { en: { description: '' } }],
        ['an empty locale object', { en: {} }],
        ['a cleared title', { en: { title: null } }]
    ])('422s %s', async (_label, translations) => {
        const { bearer, id } = await seeded();

        const response = await api()
            .patch(`/products/${id}`)
            .set('Authorization', bearer)
            .send({ translations });

        expect(response.status).toBe(422);
    });

    it('states the locale whole on a PUT: an omitted description is cleared', async () => {
        const { bearer, id } = await seeded();

        const response = await api()
            .put(`/products/${id}`)
            .set('Authorization', bearer)
            .send({
                price: 10,
                active: true,
                requiresShipping: true,
                categories: [],
                tags: [],
                translations: { en: { title: 'Cozy Bed XL' } }
            });

        expect(response.status).toBe(200);
        expect(await readEnglish(bearer, id)).toEqual({ title: 'Cozy Bed XL' });
    });
});

describe('the generic translator door follows the product rules (bug W9)', () => {
    it('refuses a title under the product minimum instead of writing it', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ title: 'Cozy Bed', price: 10 });

        const response = await api()
            .patch(`/locales/translations/product/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ en: { fields: { title: 'abc' } } });

        expect(response.status).toBe(422);
        expect(response.body.errors[0].details.field).toBe('en.title');
    });

    it('merges one field on PATCH and replaces the locale whole on PUT', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ title: 'Cozy Bed', price: 10 });
        const url = `/locales/translations/product/${String(product._id)}`;
        await api()
            .put(url)
            .set('Authorization', bearer)
            .send({ en: { fields: { title: 'Cozy Bed', description: 'Extra support' } } });

        const merged = await api()
            .patch(url)
            .set('Authorization', bearer)
            .send({ en: { fields: { title: 'Cozy Bed XL' } } });
        const replaced = await api()
            .put(url)
            .set('Authorization', bearer)
            .send({ en: { fields: { title: 'Cozy Bed XXL' } } });

        expect(merged.body.data.translations[0].fields).toEqual({
            title: 'Cozy Bed XL',
            description: 'Extra support'
        });
        expect(replaced.body.data.translations[0].fields).toEqual({ title: 'Cozy Bed XXL' });
    });
});

describe('SKU (SH4)', () => {
    it('creates a product carrying a sku', async () => {
        const { bearer } = await authenticateAsRole('editor');

        const response = await api()
            .post('/products')
            .set('Authorization', bearer)
            .send({
                price: 24.9,
                sku: 'DOG-BED-15KG',
                translations: { en: { title: 'Dog Bed' } }
            });

        expect(response.status).toBe(201);
        expect(response.body.data.sku).toBe('DOG-BED-15KG');
    });

    // Unique across the catalogue, not per request — the sparse unique index
    // (`products/model.ts`'s `products_sku`) is what a second product colliding with an
    // ALREADY-STORED sku refuses against, same 409 shape `users`' duplicate email answers with.
    it('409s a sku that collides with another product', async () => {
        const { bearer } = await authenticateAsRole('editor');
        await createProduct({ title: 'Existing', sku: 'DUP-1' });

        const response = await api()
            .post('/products')
            .set('Authorization', bearer)
            .send({ price: 10, sku: 'DUP-1', translations: { en: { title: 'Collides' } } });

        expect(response.status).toBe(409);
    });

    it('clears a sku back to unset on an explicit null', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct({ title: 'Bed', price: 10, sku: 'BED-1' });

        const response = await api()
            .patch(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ sku: null });

        expect(response.status).toBe(200);
        expect(response.body.data.sku).toBeUndefined();
    });
});

describe('VAT rate type', () => {
    // `rateType` says WHY a `taxClass: zero` product is 0% — `zero-rated` or `exempt` — round
    // tripping each value the same way `taxClass` itself already does.
    it.each(['zero-rated', 'exempt'] as const)(
        'creates a product carrying rateType %s',
        async (rateType) => {
            const { bearer } = await authenticateAsRole('editor');

            const response = await api()
                .post('/products')
                .set('Authorization', bearer)
                .send({
                    price: 24.9,
                    taxClass: 'zero',
                    rateType,
                    translations: { en: { title: 'Dog Bed' } }
                });

            expect(response.status).toBe(201);
            expect(response.body.data.rateType).toBe(rateType);
        }
    );

    // `rateType: null` means "back to standard", same as `taxClass`'s own clearing rule.
    it('clears rateType back to standard on an explicit null', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct({
            title: 'Bed',
            price: 10,
            taxClass: 'zero',
            rateType: 'exempt'
        });

        const response = await api()
            .patch(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ rateType: null });

        expect(response.status).toBe(200);
        expect(response.body.data.rateType).toBeUndefined();
    });
});

describe('GET /products/{id}/admin', () => {
    it('matches the contract, returning every language the product has', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const created = await api()
            .post('/products')
            .set('Authorization', bearer)
            .send({
                price: 24.9,
                translations: { en: { title: 'Memory Foam Bed' } }
            });

        const response = await api()
            .get(`/products/${String(created.body.data.id)}/admin`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.translations.en.title).toBe('Memory Foam Bed');
    });

    it('is refused to a caller with no permission at all', async () => {
        const product = await createProduct();

        const response = await api().get(`/products/${String(product._id)}/admin`);

        expect(response.status).toBe(401);
    });
});

/** A create body with an opening count, titled in the fallback language. */
const bodyTitled = (title: string) => ({ price: 10, onHand: 7, translations: { en: { title } } });

describe('the stock counters on the product writes follow inventory.any.read', () => {
    /** The three counters only a stock reader sees. */
    const COUNTERS = ['onHand', 'reserved', 'available'];

    it('hides them from an editor who creates, and shows them to an admin', async () => {
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
        expect(COUNTERS.filter((field) => field in byEditor.body.data)).toEqual([]);
        expect(byEditor.body.data.inStock).toBe(true);
        expect(byAdmin.status).toBe(201);
        expect(byAdmin.body.data).toMatchObject({ onHand: 7, available: 7 });
    });

    it('hides them on the editor’s all-languages read, and shows them to a stock reader', async () => {
        const product = await createProduct({ onHand: 9 });
        const editor = await authenticateAsRole('editor');
        const admin = await authenticateAsRole('admin');

        const byEditor = await api()
            .get(`/products/${product.id}/admin`)
            .set('Authorization', editor.bearer);
        const byAdmin = await api()
            .get(`/products/${product.id}/admin`)
            .set('Authorization', admin.bearer);

        expect(COUNTERS.filter((field) => field in byEditor.body.data)).toEqual([]);
        expect(byEditor.body.data.inStock).toBe(true);
        expect(byAdmin.body.data).toMatchObject({ onHand: 9, available: 9 });
    });
});
