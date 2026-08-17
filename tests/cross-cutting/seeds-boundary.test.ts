/**
 * Demo data stays out of the runtime import graph.
 *
 * A module has two public paths — `@modules/<name>` for its runtime API and
 * `@modules/<name>/seeds` for its demo fixtures — and `eslint.config.ts` enforces that nothing
 * else is importable. What lint cannot express is the asymmetry between the two: the second path
 * exists so that a SEEDER can point at a sibling's fixtures, and for no other reason.
 *
 * That distinction is the whole justification for the second door. Before it, `products/index.ts`
 * published `SEED_PRODUCT_IDS` and `productFixtures` beside `productService`, and a controller
 * could have imported demo rows without anything failing — the barrel made runtime and demo the
 * same surface, so nothing could tell the two edges apart. Splitting the paths only helps if
 * something asserts that they carry different traffic; a `/seeds` import from a service would
 * otherwise be exactly as invisible as it was before, just spelled differently.
 *
 * So: only a `seeds.ts` may take a `/seeds` path. Everything else in `src/` may not.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SOURCE_ROOT = path.join(__dirname, '../../src');
const MODULES_ROOT = path.join(SOURCE_ROOT, 'modules');

/** Every `.ts` file below `directory`, recursively. */
const listFiles = (directory: string): string[] =>
    readdirSync(directory).flatMap((entry) => {
        const entryPath = path.join(directory, entry);
        if (statSync(entryPath).isDirectory()) return listFiles(entryPath);
        return entryPath.endsWith('.ts') ? [entryPath] : [];
    });

/** Every `@modules/<name>/seeds` specifier a file imports, however the import is written. */
const readSeedImports = (file: string): string[] =>
    [...readFileSync(file, 'utf8').matchAll(/["']@modules\/([^"'/]+)\/seeds["']/g)].map(
        (match) => match[1]
    );

describe('the seeds entry point', () => {
    const sourceFiles = listFiles(SOURCE_ROOT);

    it('is taken by more than nothing, so the assertions below are not vacuous', () => {
        // `cart`, `wishlist` and `orders` all seed rows that point at the demo catalogue. If this
        // drops to zero the path has fallen out of use and the second door should be closed again,
        // not silently kept open by a test that passes over an empty set.
        const takers = sourceFiles.filter((file) => readSeedImports(file).length > 0);

        expect(takers.length).toBeGreaterThanOrEqual(3);
    });

    it('is imported only by other seeders', () => {
        const violations = sourceFiles
            .filter((file) => path.basename(file) !== 'seeds.ts')
            .flatMap((file) =>
                readSeedImports(file).map(
                    (target) =>
                        `${path.relative(SOURCE_ROOT, file)} imports @modules/${target}/seeds`
                )
            );

        expect(violations).toEqual([]);
    });

    it('is never re-exported through a module barrel', () => {
        // The failure this closes is the one that started it: a barrel that re-exports its own
        // `./seeds` puts demo data back on the runtime surface, and every assertion above keeps
        // passing because the importer would name the barrel rather than the seeds path.
        const leaking = readdirSync(MODULES_ROOT)
            .map((name) => ({ name, barrel: path.join(MODULES_ROOT, name, 'index.ts') }))
            .filter(({ barrel }) => existsSync(barrel))
            .filter(({ barrel }) => /from\s+["']\.\/seeds["']/.test(readFileSync(barrel, 'utf8')))
            .map(({ name }) => `${name}/index.ts re-exports ./seeds`);

        expect(leaking).toEqual([]);
    });
});
