import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { PLAIN_PASSWORD } from '@modules/users/tests/fixtures';
import { maxUploadBytes } from '@infrastructure/adapters/storage';

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

/**
 * A genuinely decodable PNG, not merely a magic-byte header.
 *
 * A header-only stub was enough before the digest pipeline existed: `storeUploadedImages` moved
 * bytes to disk without ever decoding them. Now every upload without a broker is digested inline
 * (`quarantineUploadedImages`), which means sharp has to actually decode it — a stub answers
 * "unsupported image format" and the request 500s, which is not the thing any test here means to
 * exercise.
 */
let PNG_BYTES: Buffer;

beforeAll(async () => {
    PNG_BYTES = await sharp({
        create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } }
    })
        .png()
        .toBuffer();
});

/**
 * Files present in the upload directory, so a test can tell what a request left behind.
 *
 * Files only — the digest pipeline's `thumbs/` derivative directory now lives alongside the
 * uploads themselves, and it is not one of the per-test artifacts this suite cleans up.
 */
const uploadedFiles = () =>
    existsSync(UPLOAD_DIRECTORY)
        ? readdirSync(UPLOAD_DIRECTORY).filter((name) =>
              statSync(path.join(UPLOAD_DIRECTORY, name)).isFile()
          )
        : [];

const signupWith = (content: Buffer | string, filename: string, contentType: string) =>
    api()
        .post('/account/signup')
        .field('email', `upload-${Date.now()}@example.com`)
        .field('username', 'uploader')
        .field('password', PLAIN_PASSWORD)
        .field('passwordConfirm', PLAIN_PASSWORD)
        .field('termsAccepted', 'true')
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
        // Asked of the adapter rather than restated: the cap is read lazily there, so a test
        // repeating the default would be guessing at a value it cannot see.
        const oversized = Buffer.concat([PNG_BYTES, Buffer.alloc(maxUploadBytes() + 1024)]);

        const response = await signupWith(oversized, 'huge.png', 'image/png');

        expect(response.status).toBe(400);
        expect(uploadedFiles()).toEqual(before);
    });
});

/**
 * The upload directory is served by this API (`express.static` in `app.ts`), which is what makes
 * a stored `imageUrl` resolvable at all — and what makes everything above load-bearing rather
 * than theoretical. These assert the serving side of that bargain.
 */
describe('serving the upload directory', () => {
    it('serves a stored image with an image content type', async () => {
        const uploaded = await signupWith(PNG_BYTES, 'avatar.png', 'image/png');
        const imageUrl = uploaded.body.data.imageUrl as string;

        const response = await api().get(imageUrl);

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('image/png');
        // Helmet defaults every response to `same-origin`, which would have the browser fetch the
        // bytes and then refuse to render them for the frontend on another port.
        expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
        // Set globally by helmet; restated here because it is what stops a browser second-guessing
        // the type we just committed to.
        expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    /**
     * The reason the stored extension is derived from the declared type rather than the client's
     * filename. Were it carried over, this upload would be stored as `.html` and served as
     * `text/html` — and a PNG may legally carry `<script>` in a metadata chunk, so it would
     * execute. Stored XSS that passes a content check cleanly.
     */
    it('never serves an uploaded file as html, whatever it was named', async () => {
        const uploaded = await signupWith(PNG_BYTES, 'payload.html', 'image/png');
        const imageUrl = uploaded.body.data.imageUrl as string;

        expect(imageUrl.endsWith('.png')).toBe(true);

        const response = await api().get(imageUrl);

        expect(response.headers['content-type']).not.toContain('text/html');
    });

    it('does not serve dotfiles', async () => {
        const response = await api().get('/.env');

        expect(response.status).toBe(404);
    });

    it('does not list the upload directory', async () => {
        const response = await api().get('/images/');

        expect(response.status).toBe(404);
    });

    /**
     * `express.static` resolves `..` before it looks at the filesystem, but the guarantee is
     * worth pinning rather than assuming — it is the difference between serving one directory and
     * serving the repository.
     */
    it.each(['/../package.json', '/images/../../package.json', '/%2e%2e/package.json'])(
        'refuses to escape the public directory via %s',
        async (attempt) => {
            const response = await api().get(attempt);

            expect(response.status).toBeGreaterThanOrEqual(400);
        }
    );
});
