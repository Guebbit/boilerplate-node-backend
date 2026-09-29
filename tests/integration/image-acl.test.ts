import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { api, authenticateAs } from '@tests/http';
import { emptyFileSandbox } from '@tests/file-sandbox';
import { setupTestDb } from '@tests/setup-test-db';
import { localeRepository } from '@modules/locales/repository';
import { makeLocale } from '@modules/locales/factories';
import { localeService } from '@modules/locales/services';
import { productRepository } from '@modules/products/repository';

/**
 * A client may never name a path in the image store — the cross-module rule behind
 * `imageUrl: null`-only write bodies (docs/theory/defences/).
 *
 * Attack: a write sets `imageUrl` to ANOTHER record's file, and the next replace/clear deletes
 * "the old image", which is now the victim's. Every door that accepts an image is driven here,
 * over the real routes, through both body encodings — the multipart channel validates against
 * the same JSON schema, so an `imageUrl` text part is the same hole.
 *
 * The assertion that matters is on the filesystem: the victim's file survives.
 */

// `tests/support/setup-file-sandbox.ts` assigns this before any test file's own top-level code
// runs, so it is never actually unset here — the `!` narrows what the compiler cannot.
const PUBLIC_DIRECTORY = path.resolve(process.env.NODE_PUBLIC_PATH!);

/** A decodable PNG: every upload without a broker is digested inline, so sharp must accept it. */
let PNG_BYTES: Buffer;

beforeAll(async () => {
    PNG_BYTES = await sharp({
        create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } }
    })
        .png()
        .toBuffer();

    localeService.setTranslatables({
        product: {
            collection: 'products',
            fields: ['title', 'description'],
            cacheTag: 'products',
            exists: productRepository.existsById,
            writeDerived: productRepository.writeTranslatedFields
        }
    });
});

afterAll(() => {
    localeService.setTranslatables({});
});

setupTestDb();

/** Whether a stored `/images/<name>` url still has its file on disk. */
const fileExists = (url: string) => existsSync(path.join(PUBLIC_DIRECTORY, url));

/** How a write door is reached, as a table row. */
interface Door {
    name: string;
    method: 'post' | 'put' | 'patch';
    /** Signs in as the caller and resolves the route for this run. */
    route: (context: { adminBearer: string; userId: string }) => string;
    /** Whose token the request carries. */
    as: 'user' | 'admin';
    /** The minimal valid body apart from `imageUrl`, so a 422 can only be the image. */
    body: Record<string, string | boolean | number | object>;
}

const doors: Door[] = [
    {
        name: 'PATCH /account',
        method: 'patch',
        route: () => '/account',
        as: 'user',
        body: {}
    },
    {
        name: 'PUT /account',
        method: 'put',
        route: () => '/account',
        as: 'user',
        body: { email: 'attacker@example.com', username: 'attacker' }
    },
    {
        name: 'POST /users',
        method: 'post',
        route: () => '/users',
        as: 'admin',
        body: { email: 'created@example.com', username: 'created' }
    },
    {
        name: 'PATCH /users/{id}',
        method: 'patch',
        route: ({ userId }) => `/users/${userId}`,
        as: 'admin',
        body: {}
    },
    {
        name: 'PUT /users/{id}',
        method: 'put',
        route: ({ userId }) => `/users/${userId}`,
        as: 'admin',
        body: { email: 'put@example.com', username: 'putuser', role: 'customer', active: true }
    }
];

describe('imageUrl is never a client-named path', () => {
    let victimUrl: string;
    let adminBearer: string;
    let userBearer: string;
    let userId: string;

    beforeEach(async () => {
        await localeRepository.create(makeLocale({ tag: 'en', name: 'en', nativeName: 'en' }));
        const admin = await authenticateAs('admin');
        const user = await authenticateAs('user');
        adminBearer = admin.bearer;
        userBearer = user.bearer;
        userId = user.user.id;

        // The victim: a product whose picture arrived as an upload, like every real one.
        const created = await api()
            .post('/products')
            .set('Authorization', adminBearer)
            .field('translations', JSON.stringify({ en: { title: 'Victim' } }))
            .field('price', '10')
            .attach('imageUpload', PNG_BYTES, { filename: 'v.png', contentType: 'image/png' });
        expect(created.status).toBe(201);
        victimUrl = created.body.data.imageUrl as string;
        expect(fileExists(victimUrl)).toBe(true);
    });

    afterEach(emptyFileSandbox);

    const send = (door: Door, encoding: 'json' | 'multipart', imageUrl: string) => {
        const bearer = door.as === 'admin' ? adminBearer : userBearer;
        const request = api()
            [door.method](door.route({ adminBearer, userId }))
            .set('Authorization', bearer);

        if (encoding === 'json') return request.send({ ...door.body, imageUrl });

        // Multipart carries strings only — objects and booleans are encoded the way a form would.
        for (const [key, value] of Object.entries(door.body))
            request.field(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
        return request.field('imageUrl', imageUrl);
    };

    describe.each(doors)('$name', (door) => {
        it.each(['json', 'multipart'] as const)(
            "refuses another record's file named in a %s body, and the file survives",
            async (encoding) => {
                const response = await send(door, encoding, victimUrl);

                expect(response.status).toBe(422);
                expect(JSON.stringify(response.body)).toContain('imageUrl');
                expect(fileExists(victimUrl)).toBe(true);
            }
        );
    });

    it.each(['POST /products', 'PUT /products/{id}', 'PATCH /products/{id}'])(
        '%s refuses a client-named path, JSON and multipart alike',
        async (label) => {
            const target = await api()
                .post('/products')
                .set('Authorization', adminBearer)
                .send({ price: 1, translations: { en: { title: 'Target' } } });
            const url = label.startsWith('POST') ? '/products' : `/products/${target.body.data.id}`;
            const method = label.split(' ')[0].toLowerCase() as 'post' | 'put' | 'patch';
            const full = {
                price: 1,
                translations: { en: { title: 'Attempt' } },
                active: true,
                requiresShipping: true,
                categories: [],
                tags: []
            };

            const json = await api()
                [method](url)
                .set('Authorization', adminBearer)
                .send({
                    ...full,
                    imageUrl: victimUrl
                });
            const multipart = await api()
                [method](url)
                .set('Authorization', adminBearer)
                .field('translations', JSON.stringify(full.translations))
                .field('price', '1')
                .field('active', 'true')
                .field('requiresShipping', 'true')
                .field('imageUrl', victimUrl);

            expect([json.status, multipart.status]).toEqual([422, 422]);
            expect(fileExists(victimUrl)).toBe(true);
        }
    );

    describe('what stays allowed', () => {
        it("imageUrl: null removes the record's OWN image and deletes that file", async () => {
            const uploaded = await api()
                .patch('/account')
                .set('Authorization', userBearer)
                .attach('imageUpload', PNG_BYTES, { filename: 'a.png', contentType: 'image/png' });
            const ownUrl = uploaded.body.data.imageUrl as string;
            expect(fileExists(ownUrl)).toBe(true);

            const cleared = await api()
                .patch('/account')
                .set('Authorization', userBearer)
                .send({ imageUrl: null });

            expect(cleared.status).toBe(200);
            expect(fileExists(ownUrl)).toBe(false);
            expect(fileExists(victimUrl)).toBe(true);
        });

        it('omitting imageUrl leaves the image alone', async () => {
            const uploaded = await api()
                .patch('/account')
                .set('Authorization', userBearer)
                .attach('imageUpload', PNG_BYTES, { filename: 'a.png', contentType: 'image/png' });
            const ownUrl = uploaded.body.data.imageUrl as string;

            const response = await api()
                .patch('/account')
                .set('Authorization', userBearer)
                .send({ username: 'renamed' });

            expect(response.status).toBe(200);
            expect(response.body.data.imageUrl).toBe(ownUrl);
            expect(fileExists(ownUrl)).toBe(true);
        });

        it('a multipart upload sets the image, and wins over a null in the same request', async () => {
            const response = await api()
                .patch('/account')
                .set('Authorization', userBearer)
                .attach('imageUpload', PNG_BYTES, { filename: 'a.png', contentType: 'image/png' });

            expect(response.status).toBe(200);
            expect(response.body.data.imageUrl).toMatch(/^\/images\/.+\.png$/);
            expect(fileExists(response.body.data.imageUrl as string)).toBe(true);
        });
    });
});
