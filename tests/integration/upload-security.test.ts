import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { api } from '../helpers/http';
import { setupTestDb } from '../helpers/setup-test-db';

/**
 * What actually reaches the disk.
 *
 * `fileFilter` checks the type the client CLAIMS, in the `Content-Type` of the multipart part —
 * a value the client writes and nothing verifies. `curl -F 'imageUpload=@shell.html;type=image/png'`
 * sets it to whatever you like, so on its own it stops honest mistakes and nothing else. These
 * drive the real route and assert on the filesystem, because the question is not "what did the
 * API answer" but "what is now stored".
 *
 * `POST /account/signup` is the subject: it is the one upload route reachable without a token,
 * which makes it the one an unauthenticated attacker would use.
 */

const UPLOAD_DIRECTORY = path.resolve(process.env.NODE_PUBLIC_PATH ?? 'public', 'images');

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

/** Files present in the upload directory, so a test can tell what a request left behind. */
const uploadedFiles = () => (existsSync(UPLOAD_DIRECTORY) ? readdirSync(UPLOAD_DIRECTORY) : []);

const signupWith = (content: Buffer | string, filename: string, contentType: string) =>
    api()
        .post('/account/signup')
        .field('email', `upload-${Date.now()}@example.com`)
        .field('username', 'uploader')
        .field('password', 'Password1!')
        .field('passwordConfirm', 'Password1!')
        .attach('imageUpload', Buffer.isBuffer(content) ? content : Buffer.from(content), {
            filename,
            contentType
        });

setupTestDb();

describe('upload content validation', () => {
    let before: string[];

    beforeEach(() => {
        before = uploadedFiles();
    });

    /**
     * A test that stores a file for real has to remove it, or the repository's upload directory
     * slowly fills with fixtures — and the next run's `before` snapshot stops meaning anything.
     */
    afterEach(() => {
        for (const file of uploadedFiles())
            if (!before.includes(file)) rmSync(path.join(UPLOAD_DIRECTORY, file), { force: true });
    });

    /**
     * The attack. Every claim the client controls says "image": the part's `Content-Type`, the
     * filename, the extension. Only the bytes disagree, and only the bytes are true.
     */
    it.each([
        ['an HTML document', '<!doctype html><script>alert(1)</script>'],
        [
            'an SVG carrying script',
            '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        ],
        ['a PHP snippet', '<?php system($_GET["c"]); ?>']
    ])('rejects %s disguised as a PNG, and stores nothing', async (_label, content) => {
        const response = await signupWith(content, 'avatar.png', 'image/png');

        expect(response.status).toBe(422);
        // The decisive assertion: not the status, but that the disguised file is not on disk.
        expect(uploadedFiles()).toEqual(before);
    });

    it('accepts a real PNG', async () => {
        const response = await signupWith(PNG_BYTES, 'avatar.png', 'image/png');

        expect(response.status).toBe(201);
        expect(uploadedFiles().length).toBe(before.length + 1);
    });

    /**
     * The other direction: a genuine image whose declared type is wrong is refused by
     * `fileFilter` before it is written. The request still succeeds — a dropped file is not an
     * error, by multer's contract — so what matters is that nothing was stored.
     */
    it('drops a real image declared as a non-image, without storing it', async () => {
        const response = await signupWith(PNG_BYTES, 'avatar.png', 'application/pdf');

        expect(response.status).toBe(201);
        expect(uploadedFiles()).toEqual(before);
    });

    /**
     * Multer's own default is UNLIMITED file size, which on a public endpoint is a denial of
     * service needing no exploit: every byte is written before any handler runs.
     */
    it('refuses a file over the configured size limit', async () => {
        const oversized = Buffer.concat([
            PNG_BYTES,
            Buffer.alloc(Number(process.env.NODE_MAX_UPLOAD_BYTES ?? 5 * 1024 * 1024) + 1024)
        ]);

        const response = await signupWith(oversized, 'huge.png', 'image/png');

        expect(response.status).toBe(400);
        expect(uploadedFiles()).toEqual(before);
    });
});
