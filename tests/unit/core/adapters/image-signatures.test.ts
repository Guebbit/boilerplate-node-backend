import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { identifyImage, identifyImageFile } from '@core/adapters/image-signatures';

/**
 * Content-based image identification.
 *
 * The whole point is that it does not care what anything claims. `Content-Type` on an upload part
 * is written by the client and verified by nobody, so the cases that matter here are the ones
 * where the claim and the bytes disagree — a disguised payload, and a real image mislabelled.
 */

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const WEBP = Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0x24, 0, 0, 0]),
    Buffer.from('WEBPVP8 ')
]);

describe('identifyImage', () => {
    it.each([
        ['PNG', PNG, 'image/png'],
        ['JPEG', JPEG, 'image/jpeg'],
        ['WebP', WEBP, 'image/webp']
    ])('identifies a real %s', (_label, buffer, expected) => {
        expect(identifyImage(buffer)).toBe(expected);
    });

    /**
     * The attack this exists to stop: the extension and the declared MIME say `image/png`, the
     * bytes are a script. `fileFilter` sees only the claim and waves it through.
     */
    it.each([
        ['an HTML document', '<!doctype html><script>alert(1)</script>'],
        [
            'an SVG with script',
            '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        ],
        ['a PHP snippet', '<?php system($_GET["c"]); ?>'],
        ['a shell script', '#!/bin/sh\nrm -rf /'],
        ['plain text', 'this is not an image']
    ])('refuses to identify %s', (_label, content) => {
        expect(identifyImage(Buffer.from(content))).toBeUndefined();
    });

    /**
     * RIFF alone also begins WAV and AVI, so a check that stopped at the container magic would
     * accept both as images. The format marker sits at offset 8, which is why the signature
     * carries an offset at all.
     */
    it('does not mistake another RIFF format for WebP', () => {
        const wav = Buffer.concat([
            Buffer.from('RIFF'),
            Buffer.from([0x24, 0, 0, 0]),
            Buffer.from('WAVEfmt ')
        ]);

        expect(identifyImage(wav)).toBeUndefined();
    });

    /**
     * A file shorter than the signature must not match by running off the end of the buffer.
     */
    it.each([0, 1, 2, 3, 7])('handles a %i-byte file without matching', (length) => {
        expect(identifyImage(PNG.subarray(0, length))).toBeUndefined();
    });

    /**
     * A near-miss: the PNG magic with one byte wrong. Truncating the check to the first four
     * bytes — a common shortcut — would let this through.
     */
    it('rejects a corrupted PNG header', () => {
        const almost = Buffer.from(PNG);
        almost[7] = 0x00;

        expect(identifyImage(almost)).toBeUndefined();
    });

    /**
     * The polyglot case: valid image bytes with a payload appended. Correctly identified as an
     * image, because it IS one — the appended bytes are inert to an image decoder. Pinned so the
     * limit of this defence is explicit: it identifies formats, it is not a malware scanner.
     */
    it('identifies an image with trailing data appended', () => {
        const polyglot = Buffer.concat([PNG, Buffer.from('<script>alert(1)</script>')]);

        expect(identifyImage(polyglot)).toBe('image/png');
    });
});

describe('identifyImageFile', () => {
    let directory: string;

    beforeAll(async () => {
        directory = await mkdtemp(path.join(tmpdir(), 'image-signatures-'));
    });

    afterAll(async () => {
        await rm(directory, { recursive: true, force: true });
    });

    const write = async (name: string, content: Buffer | string) => {
        const filePath = path.join(directory, name);
        await writeFile(filePath, content);
        return filePath;
    };

    it('identifies a real image on disk', async () => {
        const filePath = await write('real.png', PNG);

        await expect(identifyImageFile(filePath)).resolves.toBe('image/png');
    });

    /**
     * The name is deliberately `.png` and the bytes deliberately are not: the extension is
     * attacker-controlled too, and nothing here reads it.
     */
    it('ignores the extension entirely', async () => {
        const filePath = await write('disguised.png', '<script>alert(1)</script>');

        await expect(identifyImageFile(filePath)).resolves.toBeUndefined();
    });

    it('treats an unreadable file as unidentifiable rather than throwing', async () => {
        await expect(
            identifyImageFile(path.join(directory, 'does-not-exist.png'))
        ).resolves.toBeUndefined();
    });

    it('handles an empty file', async () => {
        const filePath = await write('empty.png', Buffer.alloc(0));

        await expect(identifyImageFile(filePath)).resolves.toBeUndefined();
    });

    /**
     * Only the header is read. A validator that loaded the whole file to inspect twelve bytes
     * would be its own denial of service, so this asserts a large file is answered as cheaply as
     * a small one.
     */
    it('reads only the header, not the file', async () => {
        const large = Buffer.concat([PNG, Buffer.alloc(20 * 1024 * 1024)]);
        const filePath = await write('large.png', large);

        const started = process.hrtime.bigint();
        await expect(identifyImageFile(filePath)).resolves.toBe('image/png');
        const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;

        expect(elapsedMs).toBeLessThan(200);
    });
});
