/**
 * The multilingual product write surface, over real HTTP: `POST /products`, `PATCH /products/{id}`
 * and `GET /products/{id}/admin`. Cross-module by nature, sitting at the top level rather than
 * under `src/modules/products/tests/` for the same reason `translation-cascades.test.ts` does:
 * driving these routes needs a real `locales` collection row, which `products` may only reach
 * through the `kernel/translation.ts` port.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { localeRepository } from '@modules/locales/repository';
import { makeLocale } from '@modules/locales/factories';
import { localeService } from '@modules/locales/services';

setupTestDb();

beforeAll(() => {
    localeService.setTranslatables({
        product: { collection: 'products', fields: ['title', 'description'], cacheTag: 'products' }
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
        expect(response).toSatisfyApiSpec();
    });

    it('rejects a body missing the fallback locale', async () => {
        const { bearer } = await authenticateAsRole('editor');

        const response = await api()
            .post('/products')
            .set('Authorization', bearer)
            .send({ price: 10, translations: {} });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    /*
     * `products` never writes `onHand` itself — see `products/service.ts`'s `create()` — so this
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
        expect(response).toSatisfyApiSpec();

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
        expect(response).toSatisfyApiSpec();
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
        expect(response).toSatisfyApiSpec();
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
        expect(response).toSatisfyApiSpec();
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

    // FE_PARITY's P1 needs `taxClass: null` to mean "back to the shop's standard rate" — D17c
    // made every other clearable field on this schema nullable, but missed this one.
    it('clears taxClass back to the standard rate on an explicit null', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const product = await createProduct({ title: 'Bed', price: 10, taxClass: 'reduced' });

        const response = await api()
            .patch(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ taxClass: null });

        expect(response.status).toBe(200);
        expect(response.body.data.taxClass).toBeUndefined();
        expect(response).toSatisfyApiSpec();
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
        expect(response).toSatisfyApiSpec();
    });

    it('is refused to a caller with no permission at all', async () => {
        const product = await createProduct();

        const response = await api().get(`/products/${String(product._id)}/admin`);

        expect(response.status).toBe(401);
    });
});
