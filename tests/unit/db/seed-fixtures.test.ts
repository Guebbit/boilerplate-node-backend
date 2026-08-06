/**
 * Seed fixture integrity — `db/seeds/fixtures.ts`.
 *
 * Every `imageUrl` in the demo dataset must be a URL path that resolves to a file this repository
 * actually ships, because `express.static` (`src/app.ts`) serves them and a browser gets a plain
 * 404 otherwise.
 *
 * This is a regression net for a bug that survived a long time precisely because nothing tested
 * it: the fixtures carried Windows-style `\images\x.jpg`, captured from a `path.join()` on the
 * machine that first uploaded them. A backslash is a literal filename character in a URL, so
 * every seeded product and user pointed at nothing. It was invisible while `public/` was served
 * by nothing at all, and would have become "the images are broken" the moment anyone rendered one.
 *
 * Reading the fixtures rather than the source text is the point — `fixtures.ts` was split out of
 * `db/seeds/index.ts` so this file could import the data without the seeder connecting to a
 * database and writing to it on import.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { users, products, orders } from '../../../db/seeds/fixtures';

/** Where `express.static` is rooted, and therefore what a leading `/` in an `imageUrl` means. */
const PUBLIC_ROOT = path.join(__dirname, '../../../public');

/**
 * Every `imageUrl` the dataset contains, labelled so a failure names the fixture at fault rather
 * than just an index. Orders embed a product snapshot, which carries its own copy — that copy is
 * a separate value that can drift on its own, so it is collected separately rather than assumed
 * to match the live product.
 */
const imageUrls: [label: string, url: string][] = [
    ...users.map((user): [string, string] => [`user ${user.username}`, user.imageUrl]),
    ...products.map((product): [string, string] => [`product ${product.title}`, product.imageUrl]),
    ...orders.flatMap((order) =>
        order.items.map((item): [string, string] => [
            `order ${order._id.toString()} → ${item.product.title}`,
            item.product.imageUrl
        ])
    )
];

describe('seed fixture imageUrls', () => {
    it('collects a url from every fixture that has one', () => {
        // Guards the test itself: if the fixtures are restructured so the traversal above stops
        // finding them, every assertion below would vacuously pass over an empty list.
        expect(imageUrls.length).toBeGreaterThanOrEqual(users.length + products.length);
    });

    it.each(imageUrls)('%s — is a URL path, not a filesystem path', (_label, url) => {
        // The original defect, stated directly. `path.sep` is deliberately not consulted: the
        // rule is about URLs, so it holds identically on every platform.
        expect(url).not.toMatch(/\\/);
    });

    it.each(imageUrls)('%s — is rooted at the static mount', (_label, url) => {
        // A relative url would resolve against whatever page happened to reference it.
        expect(url.startsWith('/')).toBe(true);
    });

    it.each(imageUrls)('%s — points at a file that ships with the repository', (_label, url) => {
        // The assertion that would have caught the bug even if the paths had been posix all
        // along: a fixture referencing an image nobody committed is just as broken.
        expect(existsSync(path.join(PUBLIC_ROOT, url))).toBe(true);
    });

    it.each(imageUrls)('%s — lives under /images/seed/', (_label, url) => {
        // Fixtures are repository content; everything else under `public/images/` is a runtime
        // upload that `.gitignore` drops. A fixture added outside `seed/` would be committed by
        // accident or ignored by accident, and both are worse than failing here.
        expect(url.startsWith('/images/seed/')).toBe(true);
    });
});
