/**
 * @module
 * `imageUrl: null` on a product: the field is unset on disk, and the old file and its thumbnail are
 * deleted only once the save has landed. Real files in a temp directory, real store — the point
 * is WHICH files go, which a mocked store cannot say.
 */

import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/callers';
import { createProduct } from '@modules/products/tests/factories';
import * as productService from '../../service';
import { productModel } from '../../model';

setupTestDb();

const ORIGINAL_PUBLIC_PATH = process.env.NODE_PUBLIC_PATH;

let root: string;

/** The picture and thumbnail a finished digest would have left behind. */
const PICTURE = '/images/picture-abc.png';
const THUMBNAIL = '/images/thumbs/v1/picture-abc.webp';

beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'image-clear-products-'));
    await mkdir(path.join(root, 'images', 'thumbs', 'v1'), { recursive: true });
    await writeFile(path.join(root, PICTURE), 'picture');
    await writeFile(path.join(root, THUMBNAIL), 'thumbnail');
    process.env.NODE_PUBLIC_PATH = root;
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    process.env.NODE_PUBLIC_PATH = ORIGINAL_PUBLIC_PATH;
});

/** The stored document as MongoDB holds it, with no Mongoose default applied on the way out. */
const storedRow = (id: string) => productModel.findById(id).lean();

describe('productService.updateById — imageUrl: null', () => {
    it('unsets imageUrl and thumbnailUrl on disk, writing no placeholder', async () => {
        const product = await createProduct({ imageUrl: PICTURE, thumbnailUrl: THUMBNAIL });

        await productService.updateById(product.id, { imageUrl: null }, testCallerContext);

        const row = await storedRow(product.id);
        expect(row).not.toHaveProperty('imageUrl');
        expect(row).not.toHaveProperty('thumbnailUrl');
    });

    it('deletes the old file and its thumbnail after the save', async () => {
        const product = await createProduct({ imageUrl: PICTURE, thumbnailUrl: THUMBNAIL });

        await productService.updateById(product.id, { imageUrl: null }, testCallerContext);

        expect(existsSync(path.join(root, PICTURE))).toBe(false);
        expect(existsSync(path.join(root, THUMBNAIL))).toBe(false);
    });

    it('leaves the file alone when the update never mentions the image', async () => {
        const product = await createProduct({ imageUrl: PICTURE, thumbnailUrl: THUMBNAIL });

        await productService.updateById(product.id, { active: false }, testCallerContext);

        expect(existsSync(path.join(root, PICTURE))).toBe(true);
        const row = await storedRow(product.id);
        expect(row?.imageUrl).toBe(PICTURE);
    });

    it('is a no-op for a product that never had an image', async () => {
        const product = await createProduct();

        const result = await productService.updateById(
            product.id,
            { imageUrl: null },
            testCallerContext
        );

        expect(result.success).toBe(true);
        expect(await storedRow(product.id)).not.toHaveProperty('imageUrl');
    });
});
