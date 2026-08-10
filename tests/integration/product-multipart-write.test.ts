import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { api, authenticateAs } from '../helpers/http';
import { setupTestDb } from '../helpers/setup-test-db';

/**
 * Writing a product through the MULTIPART body, which is the only way to send one with an image.
 *
 * A multipart body carries no types: every field arrives as a string, so `price` reaches
 * `zodProductSchema`'s `z.number()` as `'101'` and `active` reaches its boolean as `'false'`,
 * which is truthy. `readInput`'s `numbers`/`booleans` declarations are the only thing between
 * that and a 422 on every write carrying a file.
 *
 * No other suite covers this combination. The contract-derived request suite posts JSON, where
 * the types are already right; `upload-security.test.ts` drives multipart but through
 * `POST /account/signup`, which has no numeric field; and the frontend's mock coerces form values
 * on the way in, so its mocked e2e never sends a string either.
 *
 * The assertions read the returned document rather than only the status, because a 200 that
 * persisted `price: '101'` would answer the same and mean something quite different.
 */

const UPLOAD_DIRECTORY = path.resolve(process.env.NODE_PUBLIC_PATH ?? 'public', 'images');

/** A minimal but genuine PNG header — `identifyImageFile()` reads the magic bytes, not the name. */
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

const uploadedFiles = () => (existsSync(UPLOAD_DIRECTORY) ? readdirSync(UPLOAD_DIRECTORY) : []);

setupTestDb();

describe('writing a product through a multipart body', () => {
    let before: string[];

    beforeEach(() => {
        before = uploadedFiles();
    });

    /* A test that stores a file for real has to remove it, or the repository's upload directory
     * fills with fixtures and the next run's `before` snapshot stops meaning anything. */
    afterEach(() => {
        for (const file of uploadedFiles())
            if (!before.includes(file)) rmSync(path.join(UPLOAD_DIRECTORY, file), { force: true });
    });

    it('creates a product, decoding the string-transported price', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post('/products')
            .set('Authorization', bearer)
            .field('title', 'Multipart product')
            .field('price', '101.5')
            .field('description', 'Created through a form body')
            .attach('imageUpload', PNG_BYTES, {
                filename: 'product.png',
                contentType: 'image/png'
            });

        expect(response.status).toBe(201);
        // A number, not the string it arrived as: a 200 storing `'101.5'` would be the same bug
        // with a friendlier status.
        expect(response.body.data.price).toBe(101.5);
        expect(response.body.data.imageUrl).toMatch(/^\/images\/.+\.png$/);
    });

    it('updates a product, decoding the string-transported price', async () => {
        const { bearer } = await authenticateAs('admin');

        const created = await api()
            .post('/products')
            .set('Authorization', bearer)
            .send({ title: 'Starts as JSON', price: 10 });

        const response = await api()
            .put(`/products/${created.body.data.id}`)
            .set('Authorization', bearer)
            .field('title', 'Updated through a form')
            .field('price', '42')
            .attach('imageUpload', PNG_BYTES, {
                filename: 'product.png',
                contentType: 'image/png'
            });

        expect(response.status).toBe(200);
        expect(response.body.data.price).toBe(42);
    });

    it('decodes the boolean alongside the number', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post('/products')
            .set('Authorization', bearer)
            .field('title', 'Inactive on arrival')
            .field('price', '5')
            // The string 'false' is truthy — the decoder is the only thing standing between this
            // and a product published against its author's wishes.
            .field('active', 'false')
            .attach('imageUpload', PNG_BYTES, {
                filename: 'product.png',
                contentType: 'image/png'
            });

        expect(response.status).toBe(201);
        expect(response.body.data.active).toBe(false);
    });

    it('defaults active to true when the form omits it', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post('/products')
            .set('Authorization', bearer)
            .field('title', 'Active by default')
            .field('price', '7')
            .attach('imageUpload', PNG_BYTES, {
                filename: 'product.png',
                contentType: 'image/png'
            });

        expect(response.status).toBe(201);
        expect(response.body.data.active).toBe(true);
    });

    it('still rejects a price that is not a number at all', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post('/products')
            .set('Authorization', bearer)
            .field('title', 'Nonsense price')
            .field('price', 'not-a-number')
            .attach('imageUpload', PNG_BYTES, {
                filename: 'product.png',
                contentType: 'image/png'
            });

        // The decoder leaves an unparseable value as the string it was, precisely so this stays a
        // 422 about the caller's input rather than becoming a `NaN` the validator has to explain.
        expect(response.status).toBe(422);
        // Nothing stored: a rejected write must not leave its upload behind.
        expect(uploadedFiles()).toEqual(before);
    });
});
