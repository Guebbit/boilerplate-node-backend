/**
 * Upload helpers — `src/infrastructure/http/uploads.ts`.
 *
 * `getFormFiles()` wraps `request.file` in an array so controllers get a uniform return type
 * regardless of whether anything was uploaded — `upload.image()` is the only middleware every
 * route mounts, and it always populates `request.file`, never `request.files`.
 *
 * `readUploadedImage()` reads back what the upload middleware recorded — it neither derives the
 * url from multer's path nor hands the path back. The store constructs the url and owns the
 * delete, so no filesystem path leaves the upload pipeline and none can reach a database row.
 */

import type { Request } from 'express';
import { imageStore } from '@infrastructure/adapters/image-store';
import { uploadConfig } from '@infrastructure/http/config';
import {
    getFormFiles,
    readUploadedImage,
    writeWithUploadedImage
} from '@infrastructure/http/uploads';

/*
 * Image-store calls are mocked: the undo is asserted by WHICH store door it opens (`remove` for a
 * promoted file, `removeQuarantined` for a pending one), never by touching a disk.
 */
jest.mock('@infrastructure/adapters/image-store', () => ({
    imageStore: { remove: jest.fn(), removeQuarantined: jest.fn() }
}));

/** A multer file stub — `path` is the only field these helpers touch. */
const uploaded = (path: string) => ({ path }) as Express.Multer.File;

/**
 * A partial Request stub, `body` defaulted to `{}` so `readUploadedImage`'s own fallback branch
 * (which reads `request.body.imageUrl`) never sees `undefined` — `getFormFiles`'s cases never
 * read `body` at all, so the default changes nothing for them.
 */
const requestWith = (parts: Partial<Request>): Request => ({ body: {}, ...parts }) as Request;

describe('getFormFiles', () => {
    it('wraps a single-file upload (multer.single) in an array', () => {
        const files = getFormFiles(requestWith({ file: uploaded('public/images/a.png') }));

        // The uniform return type is the point: callers must never have to branch on shape.
        expect(files).toEqual(['public/images/a.png']);
    });

    it('returns undefined when nothing was uploaded', () => {
        expect(getFormFiles(requestWith({}))).toBeUndefined();
    });
});

describe('readUploadedImage', () => {
    it('returns the url the store recorded for the upload', () => {
        expect(
            readUploadedImage(requestWith({ storedImageUrls: ['/images/a.png'] })).imageUrl
        ).toBe('/images/a.png');
    });

    /* A remote store answers absolute urls, and controllers must not be able to tell. */
    it('returns an absolute url unchanged', () => {
        expect(
            readUploadedImage(
                requestWith({ storedImageUrls: ['https://cdn.example.com/images/a.png'] })
            ).imageUrl
        ).toBe('https://cdn.example.com/images/a.png');
    });

    it('takes only the first url when several images were committed', () => {
        // These endpoints accept a single image; extras are ignored rather than silently
        // overwriting each other downstream.
        expect(
            readUploadedImage(
                requestWith({ storedImageUrls: ['/images/first.png', '/images/second.png'] })
            ).imageUrl
        ).toBe('/images/first.png');
    });

    it('returns undefined when the request uploaded nothing', () => {
        // Callers distinguish "no image supplied" from "image supplied" on this being undefined,
        // so an empty string here would read as "an image at the site root" — and, worse, would
        // make the failure-path cleanup try to delete it.
        expect(readUploadedImage(requestWith({})).imageUrl).toBeUndefined();
    });

    /**
     * The staged path is deliberately NOT a fallback. A request whose upload never reached the
     * store has no stored image, and answering with the temp path would persist a filesystem path
     * into `imageUrl` — the exact bug the store exists to make impossible.
     */
    it('ignores a staged file the store never committed', () => {
        expect(
            readUploadedImage(
                requestWith({ file: { path: '/tmp/staging/a.png' } as Express.Multer.File })
            ).imageUrl
        ).toBeUndefined();
    });
});

/** The mocked store, typed so a case can assert which door the undo opened. */
const store = jest.mocked(imageStore);

/** A request that carries the given upload-middleware record and body. */
const withUpload = (parts: Partial<Request>) =>
    requestWith({ storedThumbnailUrls: undefined, ...parts });

describe('readUploadedImage — the pending and promoted paths', () => {
    beforeEach(() => {
        store.remove.mockResolvedValue(true);
        store.removeQuarantined.mockResolvedValue(true);
    });

    it('answers the configured placeholders and the quarantine key for a pending upload', () => {
        const image = readUploadedImage(withUpload({ quarantinedImageKeys: ['q1'] }));

        expect(image).toMatchObject({
            imageUrl: uploadConfig().NODE_PENDING_IMAGE_URL,
            thumbnailUrl: uploadConfig().NODE_PENDING_THUMBNAIL_URL,
            pendingImageKey: 'q1'
        });
    });

    it('undoes a pending upload by removing the quarantined file only', async () => {
        await readUploadedImage(withUpload({ quarantinedImageKeys: ['q1'] })).deleteUpload();

        expect(store.removeQuarantined).toHaveBeenCalledWith('q1');
        expect(store.remove).not.toHaveBeenCalled();
    });

    it('answers the stored thumbnail and no pending key for a promoted upload', () => {
        const image = readUploadedImage(
            withUpload({
                storedImageUrls: ['/images/a.png'],
                storedThumbnailUrls: ['/images/a.thumb.png']
            })
        );

        expect(image).toMatchObject({
            imageUrl: '/images/a.png',
            thumbnailUrl: '/images/a.thumb.png',
            pendingImageKey: undefined
        });
    });

    it('undoes a promoted upload by removing the stored url', async () => {
        await readUploadedImage(withUpload({ storedImageUrls: ['/images/a.png'] })).deleteUpload();

        expect(store.remove).toHaveBeenCalledWith('/images/a.png');
        expect(store.removeQuarantined).not.toHaveBeenCalled();
    });

    it('drops a body string imageUrl, and its undo touches no file', async () => {
        const image = readUploadedImage(requestWith({ body: { imageUrl: '/images/victim.png' } }));

        expect(image.imageUrl).toBeUndefined();
        expect(image.thumbnailUrl).toBeUndefined();
        await expect(image.deleteUpload()).resolves.toBe(false);
        expect(store.remove).not.toHaveBeenCalled();
        expect(store.removeQuarantined).not.toHaveBeenCalled();
    });

    it('keeps a body null as the caller removing the image', () => {
        expect(readUploadedImage(requestWith({ body: { imageUrl: null } })).imageUrl).toBeNull();
    });

    it('lets an upload beat a body string, and the undo targets the upload, never the victim', async () => {
        const image = readUploadedImage(
            requestWith({
                storedImageUrls: ['/images/mine.png'],
                body: { imageUrl: '/images/victim.png' }
            })
        );

        expect(image.imageUrl).toBe('/images/mine.png');
        await image.deleteUpload();
        expect(store.remove).toHaveBeenCalledTimes(1);
        expect(store.remove).toHaveBeenCalledWith('/images/mine.png');
    });

    it('lets an upload beat a body null', () => {
        expect(
            readUploadedImage(
                requestWith({ storedImageUrls: ['/images/mine.png'], body: { imageUrl: null } })
            ).imageUrl
        ).toBe('/images/mine.png');
    });

    it('does not throw when the request has no body at all', () => {
        expect(readUploadedImage(requestWith({ body: undefined })).imageUrl).toBeUndefined();
    });
});

/** A request carrying a promoted upload that no write has claimed yet. */
const promoted = () => ({
    ...withUpload({ storedImageUrls: ['/images/a.png'] }),
    uploadClaimed: false
});

describe('writeWithUploadedImage — claim on success, leave to the close hook otherwise', () => {
    it('passes a successful write through and claims the upload', async () => {
        const request = promoted();
        const write = jest.fn().mockResolvedValue({ success: true, id: 7 });

        await expect(writeWithUploadedImage(request, undefined, write)).resolves.toEqual({
            success: true,
            id: 7
        });
        expect(request.uploadClaimed).toBe(true);
        expect(write).toHaveBeenCalledWith(
            expect.objectContaining({ imageUrl: '/images/a.png', pendingImageKey: undefined })
        );
    });

    it('leaves a refused write unclaimed and returns it unchanged', async () => {
        const request = promoted();
        const refusal = { success: false, status: 409 };

        await expect(
            writeWithUploadedImage(request, undefined, () => Promise.resolve(refusal))
        ).resolves.toBe(refusal);
        expect(request.uploadClaimed).toBe(false);
    });

    it('leaves a throwing write unclaimed and rejects with the identical error', async () => {
        const request = promoted();
        const failure = new Error('db down');

        await expect(
            writeWithUploadedImage(request, undefined, () => Promise.reject(failure))
        ).rejects.toBe(failure);
        expect(request.uploadClaimed).toBe(false);
    });

    it('hands the write the PUT fill null when nothing was uploaded', async () => {
        const write = jest.fn().mockResolvedValue({ success: true });

        await writeWithUploadedImage(withUpload({}), null, write);

        expect(write).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: null }));
    });

    it.each([
        ['promoted', { storedImageUrls: ['/images/a.png'] }, '/images/a.png'],
        ['pending', { quarantinedImageKeys: ['q1'] }, uploadConfig().NODE_PENDING_IMAGE_URL]
    ])('lets a %s upload beat the PUT fill null', async (_label, parts, expected) => {
        const write = jest.fn().mockResolvedValue({ success: true });

        await writeWithUploadedImage(withUpload(parts), null, write);

        expect(write).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: expected }));
    });
});
