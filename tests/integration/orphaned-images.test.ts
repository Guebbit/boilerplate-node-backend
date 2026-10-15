/**
 * The orphaned-image sweep against a real database and a real (sandboxed) public directory: a file
 * no document names goes, a file one does stays, and a file too young to have been saved stays too.
 */

import { mkdir, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { emptyFileSandbox, fileExists } from '@tests/file-sandbox';
import { IMAGES_SEGMENT, publicRoot } from '@infrastructure/adapters/image-store';
import { reapOrphanedImages } from '@infrastructure/adapters/orphaned-images';

setupTestDb();

afterEach(emptyFileSandbox);

/** Where the originals live. */
const imagesDirectory = () => path.join(publicRoot(), IMAGES_SEGMENT);

/** Writes an image file `ageHours` old. */
const imageAged = async (name: string, ageHours: number): Promise<string> => {
    await mkdir(imagesDirectory(), { recursive: true });
    const file = path.join(imagesDirectory(), name);
    await writeFile(file, 'bytes');
    const then = new Date(Date.now() - ageHours * 3_600_000);
    await utimes(file, then, then);
    return file;
};

/** A document in a collection that holds image references, naming `imageUrl`. */
const documentNaming = (imageUrl: string) =>
    mongoose.connection.collection('products').insertOne({ imageUrl });

describe('reapOrphanedImages', () => {
    it('removes an old file nothing names, and keeps one a document does', async () => {
        const kept = await imageAged('kept.jpg', 5);
        const orphan = await imageAged('orphan.jpg', 5);
        await documentNaming('/images/kept.jpg');

        const sweep = await reapOrphanedImages(['products']);

        expect(await fileExists(kept)).toBe(true);
        expect(await fileExists(orphan)).toBe(false);
        expect(sweep.originalsReaped).toBe(1);
    });

    it('spares a file younger than an hour: it may be promoted but not yet saved', async () => {
        const fresh = await imageAged('fresh.jpg', 0);

        await reapOrphanedImages(['products']);

        expect(await fileExists(fresh)).toBe(true);
    });

    it('reads a thumbnail reference as naming the file too', async () => {
        const original = await imageAged('with-thumb.jpg', 5);
        await mongoose.connection
            .collection('products')
            .insertOne({ thumbnailUrl: '/images/thumbs/with-thumb.jpg' });

        await reapOrphanedImages(['products']);

        expect(await fileExists(original)).toBe(true);
    });

    it('reads only the collections it is told about', async () => {
        const orphan = await imageAged('unlisted.jpg', 5);
        await mongoose.connection.collection('elsewhere').insertOne({
            imageUrl: '/images/unlisted.jpg'
        });

        await reapOrphanedImages(['products']);

        expect(await fileExists(orphan)).toBe(false);
    });
});
