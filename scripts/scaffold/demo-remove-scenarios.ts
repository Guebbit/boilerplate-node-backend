/**
 * @module
 * The "demo scenario data" half of the strip: the files under `scenarios/` that exist only to
 * give the shop's own modules something to show.
 *
 * It only DELETES. What lists those files (the fixture table, the scenario registry, the doubles
 * registry) is generated from the tree by `npm run scenarios:generate`, and what would otherwise
 * name them (`DEFAULT_SCENARIO`, the generated client collections' example values) derives from
 * what is registered. The one exception is the seed images' avatar spread, which is edited by
 * shape — see {@link removeSeedImages}.
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { RemovalNote } from './demo-remove-registry';

/**
 * Delete every match of `pattern` from `content`.
 * @throws {Error} when nothing matches — the file this script expected has changed shape
 */
const removeOnce = (content: string, pattern: RegExp, label: string): string => {
    if (!pattern.test(content))
        throw new Error(`[demo-remove] expected shape not found in ${label}: ${String(pattern)}`);
    // `test` on a global pattern advances `lastIndex`; `replace` resets it, so the call below is safe.
    return content.replace(pattern, '');
};

/** Files deleted outright — entirely the shop catalogue's own demo data, nothing else reads them. */
const SHOP_ONLY_FILES = [
    'scenarios/product-ids.ts',
    'scenarios/products.ts',
    'scenarios/products-filler.ts',
    'scenarios/products-images.generated.json',
    'scenarios/shop.scenario.ts',
    'scenarios/wishlist.ts',
    'scenarios/flows/shop-history.ts',
    'scenarios/flows/backdate.ts'
];

/** Delete every scenario file that belongs to the shop catalogue alone. */
export const removeShopOnlyScenarioFiles = (repoRoot: string): RemovalNote[] =>
    SHOP_ONLY_FILES.map((relativePath) => {
        rmSync(path.join(repoRoot, relativePath), { force: true });
        return { file: relativePath, detail: 'deleted' };
    });

/**
 * Delete the whole `public/images/seed/` folder — every photo, thumbnail and avatar the generator
 * wrote, not only the ones a manifest names. The folder is the demo's own and nothing foundation
 * reads it; left behind it is 2 MB of images in a deployment's image that belong to a shop it no
 * longer has.
 *
 * Also takes what pointed at it: the user avatars' manifest, the `scenario:images` generator that
 * wrote both, its npm script, and the avatar spread in each seeded user — so no seeded row names
 * a file that is gone.
 * @param repoRoot - the checkout to edit
 */
export const removeSeedImages = (repoRoot: string): RemovalNote[] => {
    rmSync(path.join(repoRoot, 'public', 'images', 'seed'), { recursive: true, force: true });
    for (const file of [
        'scenarios/users-images.generated.json',
        'scenarios/tools/generate-seed-images.ts'
    ])
        rmSync(path.join(repoRoot, file), { force: true });

    const packageFile = path.join(repoRoot, 'package.json');
    writeFileSync(
        packageFile,
        removeOnce(
            readFileSync(packageFile, 'utf8'),
            /^ {8}"scenario:images": "[^"\n]*",?\n/m,
            'package.json'
        )
    );

    const usersFile = path.join(repoRoot, 'scenarios', 'users.ts');
    const label = 'scenarios/users.ts';
    const withoutImport = removeOnce(
        readFileSync(usersFile, 'utf8'),
        /^import userImages from '\.\/users-images\.generated\.json';\n/m,
        label
    );
    // `,\n        ...userImages.customer`, or the customer base's `...(index % 2 === 0 ? userImages.root :
    // userImages.customer)` — the spread is always a user's last property.
    writeFileSync(
        usersFile,
        withoutImport.replaceAll(
            /,\n\s*\.\.\.(?:userImages\.\w+|\([^\n]*userImages[^\n]*\))(?=\n)/g,
            ''
        )
    );

    return [
        { file: 'public/images/seed/', detail: 'deleted' },
        { file: 'scenarios/users-images.generated.json', detail: 'deleted' },
        { file: 'scenarios/tools/generate-seed-images.ts', detail: 'deleted' },
        { file: 'package.json', detail: 'removed the "scenario:images" script' },
        { file: label, detail: 'dropped the avatar of each seeded user' }
    ];
};

/**
 * Delete each removed module's own scenario files: its fixtures (`scenarios/<name>.ts`), its
 * example values for the generated client collections (`scenarios/values/<name>.ts`) and its test
 * doubles (`scenarios/support/doubles/<name>/`). A module with none of them is left alone.
 *
 * Nothing is edited: the registries that list these files are regenerated afterwards.
 * @param repoRoot - the checkout to edit
 * @param names - the removed module names
 * @returns one note per module that had scenario files
 */
export const removeScenarioModuleFiles = (
    repoRoot: string,
    names: readonly string[]
): RemovalNote[] =>
    names.flatMap((name) => {
        const owned = [
            `scenarios/${name}.ts`,
            `scenarios/values/${name}.ts`,
            `scenarios/support/doubles/${name}`
        ].filter((relativePath) => existsSync(path.join(repoRoot, relativePath)));
        for (const relativePath of owned)
            rmSync(path.join(repoRoot, relativePath), { recursive: true, force: true });
        return owned.map((relativePath) => ({ file: relativePath, detail: 'deleted' }));
    });
