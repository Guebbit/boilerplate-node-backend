/**
 * Seed image integrity — every file under `scenarios/`.
 *
 * Every `imageUrl` in the demo dataset must be a URL path that resolves to a file this repository
 * actually ships, because `express.static` (`src/app.ts`) serves them and a browser gets a plain
 * 404 otherwise.
 *
 * Nothing else catches a bad one: an `imageUrl` captured from a `path.join()` carries the writing
 * machine's separators, and a backslash is a literal filename character in a URL, so a Windows-
 * style `\images\x.jpg` points at nothing and only shows up as "the images are broken".
 *
 * Reading the rows rather than the source text is the point, and it is why `scenarios/`'s files
 * export their row arrays separately from the `seed*Collection` functions that write them:
 * importing the data must not connect to a database. `scenarios/apply.ts` seeds on import, so
 * nothing can go through the runner to get at these values.
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const SCENARIOS_ROOT = path.join(__dirname, '../../../scenarios');

/** Where `express.static` is rooted, and therefore what a leading `/` in an `imageUrl` means. */
const PUBLIC_ROOT = path.join(__dirname, '../../../public');

/**
 * The two files directly under `scenarios/` that act the moment they are `require()`'d, rather
 * than merely exporting data — see the walk below for what each one does. `check.ts` and the
 * `tools/`/`run-server.ts` subdirectory-free layout mean this is the whole list.
 */
const RUNNER_FILES = new Set(['apply.ts', 'run-server.ts']);

/**
 * Every `imageUrl` the dataset contains, labelled so a failure names the row at fault rather
 * than just an index.
 *
 * Collected by WALKING `scenarios/`, not by importing three of its files by name. Two reasons,
 * and the second is the one that matters: a new domain with images falls under this guard by
 * existing, and deleting a domain takes its rows out of the sweep instead of breaking it.
 *
 * The walk is deep because an order embeds a product snapshot, which carries its own copy of the
 * url — a separate value that can drift on its own, so it is collected rather than assumed to
 * match the live product.
 */
const collectImageUrls = (): [label: string, url: string][] => {
    const found: [string, string][] = [];

    const walk = (value: unknown, label: string): void => {
        if (Array.isArray(value)) {
            for (const [index, entry] of value.entries()) walk(entry, `${label}[${index}]`);
            return;
        }
        if (typeof value !== 'object' || value === null) return;

        for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
            if (key === 'imageUrl' && typeof nested === 'string') found.push([label, nested]);
            else walk(nested, `${label}.${key}`);
        }
    };

    for (const file of readdirSync(SCENARIOS_ROOT)) {
        // `apply.ts` and `run-server.ts` are runners, not data files: each connects to Mongo (or
        // boots one) and acts the moment it is `require()`'d — `apply.ts` via its own
        // `void runScript(...)` at the bottom, `run-server.ts` via its top-level
        // `MongoMemoryServer.create().then(...)`. Requiring either here would trigger that for
        // real, which `unit-layer-stays-database-free` (`.dependency-cruiser.cjs`) exists to catch
        // everywhere else. `check.ts` has no such side effect — it only exports functions — so it
        // is left to the ordinary `Array.isArray` filter below rather than named here too.
        if (!file.endsWith('.ts') || RUNNER_FILES.has(file)) continue;
        const seeds = path.join(SCENARIOS_ROOT, file);

        // Synchronous on purpose: `it.each` needs the list while the file is being collected, and
        // an async import would hand it a promise. ts-jest runs this suite as CommonJS, so a
        // `require` of a `.ts` module resolves in place.
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- synchronous load inside jest.isolateModules, see the note above
        const loaded = require(seeds) as Record<string, unknown>;
        const name = file.replace(/\.ts$/, '');
        for (const [exported, value] of Object.entries(loaded))
            if (Array.isArray(value)) walk(value, `${name}.${exported}`);
    }

    return found;
};

const imageUrls = collectImageUrls();

describe('seed row imageUrls', () => {
    it('collects a url from every row that has one', () => {
        // Guards the test itself: if the rows are restructured so the traversal above stops
        // finding them, every assertion below would vacuously pass over an empty list. 132
        // products (5 named + 126 combinatorial) and 2 users carry one today, drawing from a
        // fixed pool of 27 physical files — the count here is far higher than 27, since most
        // rows share a photo. The floor is deliberately low enough to survive a row being
        // retired and high enough to catch a broken walk.
        expect(imageUrls.length).toBeGreaterThanOrEqual(5);
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
        // along: a row referencing an image nobody committed is just as broken.
        expect(existsSync(path.join(PUBLIC_ROOT, url))).toBe(true);
    });

    it.each(imageUrls)('%s — lives under /images/seed/', (_label, url) => {
        // Seed images are repository content; everything else under `public/images/` is a
        // runtime upload that `.gitignore` drops. A row added outside `seed/` would be committed
        // by accident or ignored by accident, and both are worse than failing here.
        expect(url.startsWith('/images/seed/')).toBe(true);
    });
});
