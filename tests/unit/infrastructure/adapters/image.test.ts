/**
 * The sharp adapter.
 *
 * Real sharp, real bytes — this file exists to prove things about the ENCODED output (format,
 * dimensions, whether metadata survives), which a mocked sharp could only assert was *asked for*,
 * not that it actually happened. sharp is native and fast enough that this stays a unit test.
 */
import sharp from 'sharp';
import { digestImage, thumbnailImage } from '@infrastructure/adapters/image';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
});

/** sharp's own metadata reader, wrapped so callers never inline `(await sharp(x).metadata())`. */
const metadataOf = (buffer: Buffer) => sharp(buffer).metadata();

/** A solid-colour fixture of the given size and format, optionally carrying EXIF metadata. */
const makeImage = (
    format: 'png' | 'jpeg' | 'webp',
    width: number,
    height: number,
    withExif = false
) => {
    const pipeline = sharp({
        create: { width, height, channels: 3, background: { r: 200, g: 40, b: 10 } }
    })[format]();

    return (
        withExif
            ? pipeline.withExif({ IFD0: { Copyright: 'Jane Doe', Make: 'Acme Camera Corp' } })
            : pipeline
    ).toBuffer();
};

describe('digestImage', () => {
    it.each([
        ['image/png', 'png'],
        ['image/jpeg', 'jpeg'],
        ['image/webp', 'webp']
    ] as const)('keeps a %s input as %s output, never converting format', async (mime, format) => {
        const input = await makeImage(format, 100, 100);

        const digested = await digestImage(input, mime);

        const metadata = await metadataOf(digested);
        expect(metadata.format).toBe(format);
    });

    it('strips EXIF metadata carried by the original', async () => {
        const input = await makeImage('jpeg', 100, 100, true);
        const inputMetadata = await metadataOf(input);
        expect(inputMetadata.exif).toBeDefined();

        const digested = await digestImage(input, 'image/jpeg');

        const digestedMetadata = await metadataOf(digested);
        expect(digestedMetadata.exif).toBeUndefined();
    });

    it('caps the longest edge at NODE_IMAGE_MAX_DIMENSION', async () => {
        process.env.NODE_IMAGE_MAX_DIMENSION = '50';
        const input = await makeImage('png', 400, 200);

        const digested = await digestImage(input, 'image/png');

        const metadata = await metadataOf(digested);
        expect(metadata.width).toBe(50);
        expect(metadata.height).toBe(25);
    });

    it('leaves an image already smaller than the cap at its own resolution', async () => {
        process.env.NODE_IMAGE_MAX_DIMENSION = '2048';
        const input = await makeImage('png', 40, 30);

        const digested = await digestImage(input, 'image/png');

        const metadata = await metadataOf(digested);
        expect(metadata.width).toBe(40);
        expect(metadata.height).toBe(30);
    });

    it('reads NODE_IMAGE_MAX_DIMENSION at call time, not at import time', async () => {
        const input = await makeImage('png', 400, 400);

        process.env.NODE_IMAGE_MAX_DIMENSION = '10';
        const small = await digestImage(input, 'image/png');
        const smallMetadata = await metadataOf(small);
        expect(smallMetadata.width).toBe(10);

        process.env.NODE_IMAGE_MAX_DIMENSION = '20';
        const larger = await digestImage(input, 'image/png');
        const largerMetadata = await metadataOf(larger);
        expect(largerMetadata.width).toBe(20);
    });

    it('rejects bytes that will never decode as an image', async () => {
        await expect(digestImage(Buffer.from('not an image'), 'image/png')).rejects.toThrow();
    });

    /* The decompression-bomb guard: without it, the decode step itself is unbounded work. */
    it('rejects an input that decodes past NODE_IMAGE_MAX_INPUT_PIXELS', async () => {
        process.env.NODE_IMAGE_MAX_INPUT_PIXELS = '100';
        const input = await makeImage('png', 50, 50);

        await expect(digestImage(input, 'image/png')).rejects.toThrow();
    });
});

describe('thumbnailImage', () => {
    it.each(['png', 'jpeg', 'webp'] as const)(
        'always produces WebP output, regardless of the %s source format',
        async (format) => {
            const input = await makeImage(format, 100, 100);

            const thumbnail = await thumbnailImage(input);

            const metadata = await metadataOf(thumbnail);
            expect(metadata.format).toBe('webp');
        }
    );

    it('caps the longest edge at NODE_IMAGE_THUMBNAIL_DIMENSION', async () => {
        process.env.NODE_IMAGE_THUMBNAIL_DIMENSION = '32';
        const input = await makeImage('png', 400, 800);

        const thumbnail = await thumbnailImage(input);

        const metadata = await metadataOf(thumbnail);
        expect(metadata.height).toBe(32);
        expect(metadata.width).toBe(16);
    });

    it('strips EXIF metadata carried by the original', async () => {
        const input = await makeImage('jpeg', 100, 100, true);

        const thumbnail = await thumbnailImage(input);

        const metadata = await metadataOf(thumbnail);
        expect(metadata.exif).toBeUndefined();
    });

    it('rejects bytes that will never decode as an image', async () => {
        await expect(thumbnailImage(Buffer.from('not an image'))).rejects.toThrow();
    });
});
