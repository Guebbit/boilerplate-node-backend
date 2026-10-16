import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { emptyFileSandbox } from '@tests/file-sandbox';
import { setupTestDb } from '@tests/setup-test-db';
import { givenLocale } from '@modules/locales/tests/factories';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { MISSING_ID } from '@tests/ids';
import { createExample } from '@modules/example/tests/factories';
import { decodablePng, publicDirectory } from '@tests/images';

/**
 * Who owns an upload once the request is over.
 *
 * The upload middleware deletes an upload whose response closed 4xx/5xx and which no write
 * claimed (`claimUpload`); a write that succeeds claims it and the file stays. Driven through the
 * three controllers that claim by hand — create product, create user, replace an example's cover
 * — asserting on the disk, since that is where an orphan would show.
 */

// `tests/support/setup-file-sandbox.ts` assigns this before any test file's own top-level code
// runs, so it is never actually unset here — the `!` narrows what the compiler cannot.
const UPLOAD_DIRECTORY = path.join(publicDirectory(), 'images');

/** A genuinely decodable PNG: with no broker the upload is digested inline, so sharp decodes it. */
let PNG_BYTES: Buffer;

beforeAll(async () => {
    PNG_BYTES = await decodablePng();
});

/** Image files present — files only, the `thumbs/` directory is not what these assertions read. */
const uploadedFiles = () =>
    existsSync(UPLOAD_DIRECTORY)
        ? readdirSync(UPLOAD_DIRECTORY).filter((name) =>
              statSync(path.join(UPLOAD_DIRECTORY, name)).isFile()
          )
        : [];

/**
 * The close hook runs after the answer is sent, so the delete trails the response by a moment.
 *
 * @param isDone - true once the disk is in the state the test expects
 */
const settled = async (isDone: () => boolean): Promise<void> => {
    for (let attempt = 0; attempt < 50 && !isDone(); attempt++)
        await new Promise((resolve) => {
            setTimeout(resolve, 20);
        });
};

setupTestDb();

beforeEach(() => givenLocale('en').then(() => {}));

afterEach(emptyFileSandbox);

const IMAGE = { filename: 'upload.png', contentType: 'image/png' };

describe('POST /products', () => {
    it('keeps the upload of a product that was created', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post('/products')
            .set('Authorization', bearer)
            .field('translations', JSON.stringify({ en: { title: 'Claimed product' } }))
            .field('price', '10')
            .attach('imageUpload', PNG_BYTES, IMAGE);
        await settled(() => false);

        expect(response.status).toBe(201);
        expect(uploadedFiles()).toHaveLength(1);
    });

    it('deletes the upload of a product that was refused', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post('/products')
            .set('Authorization', bearer)
            .field('translations', JSON.stringify({ en: { title: 'Refused product' } }))
            .field('price', '-5')
            .attach('imageUpload', PNG_BYTES, IMAGE);
        await settled(() => uploadedFiles().length === 0);

        expect(response.status).toBe(422);
        expect(uploadedFiles()).toEqual([]);
    });
});

describe('PUT /products/:id', () => {
    it('keeps the upload of a product that was updated', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();

        const response = await api()
            .put(`/products/${String(product._id)}`)
            .set('Authorization', bearer)
            .field('translations', JSON.stringify({ en: { title: 'Updated product' } }))
            .field('price', '12')
            .field('active', 'true')
            .field('purchasable', 'true')
            .field('requiresShipping', 'true')
            .field('categories', '[]')
            .field('tags', '[]')
            .attach('imageUpload', PNG_BYTES, IMAGE);
        await settled(() => false);

        expect(response.status).toBe(200);
        expect(uploadedFiles()).toHaveLength(1);
    });

    it('deletes the upload for a product that does not exist', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .put(`/products/${MISSING_ID}`)
            .set('Authorization', bearer)
            .field('translations', JSON.stringify({ en: { title: 'Updated product' } }))
            .field('price', '12')
            .field('active', 'true')
            .field('purchasable', 'true')
            .field('requiresShipping', 'true')
            .field('categories', '[]')
            .field('tags', '[]')
            .attach('imageUpload', PNG_BYTES, IMAGE);
        await settled(() => uploadedFiles().length === 0);

        expect(response.status).toBe(404);
        expect(uploadedFiles()).toEqual([]);
    });
});

describe('POST /users', () => {
    it('keeps the upload of a user that was created', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post('/users')
            .set('Authorization', bearer)
            .field('email', 'claimed@example.com')
            .field('username', 'claimeduser')
            .attach('imageUpload', PNG_BYTES, IMAGE);
        await settled(() => false);

        expect(response.status).toBe(201);
        expect(uploadedFiles()).toHaveLength(1);
    });

    it('deletes the upload of a user that was refused', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post('/users')
            .set('Authorization', bearer)
            .field('email', 'not-an-email')
            .field('username', 'refuseduser')
            .attach('imageUpload', PNG_BYTES, IMAGE);
        await settled(() => uploadedFiles().length === 0);

        expect(response.status).toBe(422);
        expect(uploadedFiles()).toEqual([]);
    });
});

describe('PUT /examples/:id/cover', () => {
    it('keeps the upload of a cover that was stored', async () => {
        const { user, bearer } = await authenticateAsRole('editor');
        const mine = await createExample({ userId: user.id });

        const response = await api()
            .put(`/examples/${String(mine._id)}/cover`)
            .set('Authorization', bearer)
            .attach('imageUpload', PNG_BYTES, IMAGE);
        await settled(() => false);

        expect(response.status).toBe(200);
        expect(uploadedFiles()).toHaveLength(1);
    });

    it('deletes the upload for an example that is not the caller’s', async () => {
        const { bearer } = await authenticateAsRole('editor');
        const other = await createUser({ email: 'other@example.com' });
        const theirs = await createExample({ userId: other.id });

        const response = await api()
            .put(`/examples/${String(theirs._id)}/cover`)
            .set('Authorization', bearer)
            .attach('imageUpload', PNG_BYTES, IMAGE);
        await settled(() => uploadedFiles().length === 0);

        expect(response.status).toBe(404);
        expect(uploadedFiles()).toEqual([]);
    });
});
