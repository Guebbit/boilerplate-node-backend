/**
 * The multilingual product write surface, over real HTTP: `POST /products`, `PATCH /products/{id}`
 * and `GET /products/{id}/admin`. Cross-module by nature, sitting at the top level rather than
 * under `src/modules/products/tests/` for the same reason `translation-cascades.test.ts` does:
 * driving these routes needs a real `locales` collection row, which `products` may only reach
 * through the `@infrastructure/i18n` port.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
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
     * ledger back needs `inventory.read`, which the editor role does not hold.
     */
    it('gives the product its opening stock through a real receive movement', async () => {
        const { bearer } = await authenticateAs('owner');

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

    // The write route stacks `products.update` AND `translations.manage`. No preset role holds one
    // without the other any more, so the "one key alone refuses" half of this cannot be exercised
    // over HTTP today — `shared/authorization-conformance.yaml` asserts it at the ability layer
    // instead ("the dictionary keys do not update a price, even together").
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

describe('the removed write operations', () => {
    it('no longer appear in the bundled contract', () => {
        const bundlePath = path.join(__dirname, '../../openapi.yaml');
        const bundle = YAML.parse(readFileSync(bundlePath, 'utf8')) as {
            paths: Record<string, Record<string, { operationId?: string }>>;
        };

        const operationIds = Object.values(bundle.paths).flatMap((operations) =>
            Object.values(operations)
                .map((operation) => operation.operationId)
                .filter((id): id is string => id !== undefined)
        );

        // `updateProduct` was `PUT /products`; the old `PUT /products/{id}` reused
        // `updateProductById`, which the new `PATCH /products/{id}` reuses too — so its PRESENCE
        // doesn't prove the old operation is gone. The method is what changed; asserted directly.
        expect(operationIds).not.toContain('updateProduct');
        expect(bundle.paths['/products']?.put).toBeUndefined();
        expect(bundle.paths['/products/{id}']?.put).toBeUndefined();
        expect(bundle.paths['/products/{id}']?.patch?.operationId).toBe('updateProductById');
    });
});
