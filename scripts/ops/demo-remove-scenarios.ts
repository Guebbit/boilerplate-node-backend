/**
 * @module
 * The "demo scenario data" half of the strip: the files under `scenarios/` and
 * `scripts/contracts/client-collections-bundle.ts` that exist only to give the shop's own modules
 * (`products`, `wishlist`, and the order book `flows/shop-history.ts` drives) something to show —
 * `demo-remove.ts` deletes what is entirely theirs and edits what a foundation-only deployment
 * still wants (named accounts, address books, locale entries, a webhook subscription).
 *
 * Each edit below is a handful of exact, known substitutions rather than a general-purpose
 * codemod: these files are hand-authored prose and object literals, not a repeated per-module
 * shape `stripModuleLines` can walk. A substitution that no longer matches throws — see
 * {@link replaceOnce} — so a file that has since drifted from what this script expects fails loud
 * instead of writing something half right.
 */

import { readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { RemovalNote } from './demo-remove-registry';

/**
 * Replace the first (and only expected) occurrence of `search` in `content`.
 * @throws {Error} when `search` is not found — the file this script expected has changed shape
 */
const replaceOnce = (content: string, search: string, replace: string, label: string): string => {
    if (!content.includes(search))
        throw new Error(
            `[demo-remove] expected text not found in ${label}: ${JSON.stringify(search.slice(0, 80))}…`
        );
    // A function replacer: a string one would read `$&` / `$1` in `replace` as patterns.
    return content.replace(search, () => replace);
};

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
    'scenarios/products.ts',
    'scenarios/products-filler.ts',
    'scenarios/products-images.generated.json',
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
 * Delete every seed image the deleted `scenarios/products-images.generated.json` manifest pointed
 * at, before that manifest is itself deleted — an orphaned `public/images/seed/*.jpg` a future
 * `npm run scenario:images` run would otherwise have to notice and sweep on its own.
 */
export const removeGeneratedProductImages = (repoRoot: string): RemovalNote[] => {
    const manifestPath = path.join(repoRoot, 'scenarios', 'products-images.generated.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<
        string,
        { imageUrl: string; thumbnailUrl: string }
    >;

    return Object.values(manifest).flatMap(({ imageUrl, thumbnailUrl }) => {
        for (const publicPath of [imageUrl, thumbnailUrl])
            unlinkSync(path.join(repoRoot, 'public', publicPath));
        return [
            { file: `public${imageUrl}`, detail: 'deleted' },
            { file: `public${thumbnailUrl}`, detail: 'deleted' }
        ];
    });
};

/**
 * Remove each removed module's slice of the scenario fixtures: its own `scenarios/<name>.ts`, its
 * import and entry in `scenarios/shop-modules.ts`'s table, and its name from any other entry's
 * `after` list. Generic over the module, so `demo:remove` and a single-module removal share it.
 * A module with no scenario file and no entry is left alone.
 * @param repoRoot - the checkout to edit
 * @param names - the removed module names
 */
export const stripScenarioModuleEntries = (
    repoRoot: string,
    names: readonly string[]
): RemovalNote => {
    const file = path.join(repoRoot, 'scenarios', 'shop-modules.ts');
    let content = readFileSync(file, 'utf8');

    for (const name of names) {
        rmSync(path.join(repoRoot, 'scenarios', `${name}.ts`), { force: true });
        // `import { … } from './<name>';` — the module's own scenario file.
        content = content.replaceAll(
            new RegExp(String.raw`^import [^\n]*from './${name}';\n`, 'gm'),
            ''
        );
        // The table entry: one line, or a block that closes on a 4-space `}`.
        content = content.replace(
            new RegExp(
                String.raw`^ {4}${name}: \{(?:[^\n]*\},?\n|\n(?:[^\n]*\n)*? {4}\},?\n)`,
                'm'
            ),
            ''
        );
    }

    // `after: ['a', 'b']` — drop the removed names, and the whole property once it is empty.
    content = content.replaceAll(/,? ?after: \[([^\]]*)]/g, (whole, inner: string) => {
        const kept = inner
            .split(',')
            .map((each) => each.trim())
            .filter((each) => each !== '' && names.every((name) => each !== `'${name}'`));
        return kept.length > 0
            ? `${whole.startsWith(',') ? ',' : ''} after: [${kept.join(', ')}]`
            : '';
    });

    writeFileSync(file, content);
    return { file: 'scenarios/shop-modules.ts', detail: `removed ${names.join(', ')} fixtures` };
};

/**
 * Rewrite the two comments in `scenarios/shop-modules.ts` that name the deleted
 * `flows/shop-history.ts`.
 */
export const stripShopModulesTable = (repoRoot: string): RemovalNote => {
    const file = path.join(repoRoot, 'scenarios', 'shop-modules.ts');
    const label = 'scenarios/shop-modules.ts';
    let content = readFileSync(file, 'utf8');

    // Both comments below named `flows/shop-history.ts` by path — deleted alongside the shop, so
    // `local/comment-links` refuses to leave the reference dangling. Reworded rather than deleted:
    // `driveHistoryEdit` and the "what a fixture table does NOT need to seed" rule both stay real
    // for whatever scenario drives history next.
    content = replaceOnce(
        content,
        'A demo-history step this entry contributes, driven by `flows/shop-history.ts` — the module\n     * that owns a piece of the story owns writing it, rather than the flow hardcoding a call into\n     * a route that stops existing the day this entry does.',
        'A demo-history step this entry contributes, driven by whatever scenario calls\n     * `Scenario.drive` (`./index.ts`) — the module that owns a piece of the story owns writing\n     * it, rather than the flow hardcoding a call into a route that stops existing the day this\n     * entry does.',
        label
    );
    content = replaceOnce(
        content,
        'Orders, payments, shipments, stock movements, reservations, carts and audit entries are\n * deliberately absent: those are what using the shop PRODUCES, and `./flows/shop-history.ts`\n * produces them by using it. See: docs/tools/demo-profile.md#how-a-scenario-is-built',
        'A module that only produces rows by being DRIVEN — through `driveHistoryEdit`, once\n * something calls it — has nothing to seed here; a fixture table entry is for what has to\n * exist BEFORE anything runs. See: docs/tools/demo-profile.md#how-a-scenario-is-built',
        label
    );

    writeFileSync(file, content);
    return { file: label, detail: 'reworded the comments naming the deleted shop history flow' };
};

/**
 * Edit `scenarios/index.ts`: drop the shop's order-book drive step and its pinned catalogue
 * subjects, and fall back to `blank` — `shop`'s own reason for being the default ("a demo with no
 * catalogue in it demonstrates nothing") is exactly what removing the catalogue produces.
 */
export const stripScenarioIndex = (repoRoot: string): RemovalNote => {
    const file = path.join(repoRoot, 'scenarios', 'index.ts');
    const label = 'scenarios/index.ts';
    let content = readFileSync(file, 'utf8');

    content = replaceOnce(
        content,
        "import { driveShopHistory, type ShopHistory } from './flows/shop-history';\nimport { backdateHistory } from './flows/backdate';\n",
        '',
        label
    );
    content = replaceOnce(
        content,
        '    shop: { seed: seedShop, drive: driveShopHistory, subjects: SHOP_SUBJECTS },\n    blank: { seed: seedBlank, subjects: {} }',
        '    shop: { seed: seedShop, subjects: SHOP_SUBJECTS },\n    blank: { seed: seedBlank, subjects: {} }',
        label
    );
    content = replaceOnce(
        content,
        "/**\n * The scenario every caller falls back to when none was named — the shop, since a demo of an\n * ecommerce boilerplate with no catalogue in it demonstrates nothing.\n */\nexport const DEFAULT_SCENARIO: ScenarioName = 'shop';",
        "/**\n * The scenario every caller falls back to when none was named. `shop` seeds no catalogue once\n * `demo:remove` has run (see `stripScenarioIndex`), so `blank` — harness accounts only — is the\n * more honest default; re-point this at `shop` again if a foundation-only demo profile is worth\n * keeping seeded.\n */\nexport const DEFAULT_SCENARIO: ScenarioName = 'blank';",
        label
    );

    // `ShopHistory` (deleted with `flows/shop-history.ts`) bundled a generic idea — "extra
    // subjects a drive step produced" — with a shop-only one — "orders to backdate"
    // (`flows/backdate.ts`, also deleted, since aging six shop collections cannot be generic).
    // `Scenario.drive` keeps the generic half so the mechanism stays real for whatever a later
    // scenario drives; backdating becomes that scenario's own `drive` step to call, not
    // `buildScenario`'s job to assume every history needs.
    content = replaceOnce(
        content,
        '    /**\n     * Drive the application until the shop has a past, against a base URL that is already\n     * listening. Absent for a scenario with nothing to live through.\n     */\n    drive?: (baseUrl: string) => Promise<ShopHistory>;',
        '    /**\n     * Drive the application until it has a past, against a base URL that is already listening.\n     * Absent for a scenario with nothing to live through. Resolves whatever EXTRA subjects that\n     * drive produced (an order id, say) — a scenario that also needs to backdate what it wrote\n     * does so inside this function, before resolving.\n     */\n    drive?: (baseUrl: string) => Promise<Readonly<Record<string, string>>>;',
        label
    );
    content = replaceOnce(
        content,
        [
            '    return (',
            '        seed()',
            '            // The flows are a script: they can solve no human challenge, so the provider is off while they run.',
            '            .then(() =>',
            '                drive && app',
            '                    ? withoutHumanChallenge(() => withLoopbackServer(app, drive))',
            '                    : undefined',
            '            )',
            '            .then((history) =>',
            '                history',
            '                    ? backdateHistory(history.ages).then(() => ({',
            '                          ...subjects,',
            '                          ...history.subjects',
            '                      }))',
            '                    : subjects',
            '            )',
            '    );'
        ].join('\n'),
        [
            '    return (',
            '        seed()',
            '            // The flows are a script: they can solve no human challenge, so the provider is off while they run.',
            '            .then(() =>',
            '                drive && app ? withoutHumanChallenge(() => withLoopbackServer(app, drive)) : {}',
            '            )',
            '            .then((extra) => ({ ...subjects, ...extra }))',
            '    );'
        ].join('\n'),
        label
    );

    writeFileSync(file, content);
    return {
        file: label,
        detail: "dropped the shop's drive step and flipped the default to blank"
    };
};

/**
 * Empty `scenarios/jobs.ts`: its one job (`reap-orders`) runs the orders module's sweep, so it
 * leaves with `orders`. The file and its `/__test/jobs/:name` route stay — a later module's job
 * is added to the same map — and the route answers 404 for every name.
 */
export const stripDemoJobs = (repoRoot: string): RemovalNote => {
    const file = path.join(repoRoot, 'scenarios', 'jobs.ts');
    const label = 'scenarios/jobs.ts';
    let content = readFileSync(file, 'utf8');

    content = replaceOnce(
        content,
        "import { orderService } from '@modules/orders';\n\n",
        '',
        label
    );
    content = replaceOnce(
        content,
        "new Map([\n    // `reap:orders` — scrubs the PII of orders past their retention window.\n    ['reap-orders', () => orderService.anonymizeDueOrders()]\n]);",
        'new Map();',
        label
    );

    writeFileSync(file, content);
    return { file: label, detail: 'dropped the reap-orders job' };
};

/** Remove the catalogue-only exports from `scenarios/subjects.ts`, keeping the admin/user pair. */
export const stripSubjects = (repoRoot: string): RemovalNote => {
    const file = path.join(repoRoot, 'scenarios', 'subjects.ts');
    const label = 'scenarios/subjects.ts';
    let content = readFileSync(file, 'utf8');

    // Matched by shape, not by text: the id table and the pinned-subject map grow a row per
    // guarantee, so an exact-text anchor would drift with every one.
    content = removeOnce(
        content,
        /\/\*\*(?:(?!\*\/)[\s\S])*?\*\/\nexport const SEED_PRODUCT_IDS = \{[\s\S]*?\n\} as const;\n\n/,
        label
    );
    content = removeOnce(content, /^ {4}'product\.[^']*': SEED_PRODUCT_IDS\.\w+,?\n/gm, label);
    // Only the address pins stay in `SHOP_SUBJECTS`: the `addresses` module is foundation.
    content = replaceOnce(
        content,
        'Only `products` and `addresses` appear',
        'Only `addresses` appears',
        label
    );
    content = replaceOnce(
        content,
        `export const SUBJECTS = {
    admin: { id: SEED_ADMIN_ID, email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD },
    user: { id: SEED_USER_ID, email: SEED_USER_EMAIL, password: SEED_USER_PASSWORD },
    product: {
        id: SEED_PRODUCT_IDS.dogFoodStandard,
        softDeletedId: SEED_PRODUCT_IDS.heaterSoftDeleted,
        inactiveId: SEED_PRODUCT_IDS.bundleInactive
    }
} as const;`,
        `export const SUBJECTS = {
    admin: { id: SEED_ADMIN_ID, email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD },
    user: { id: SEED_USER_ID, email: SEED_USER_EMAIL, password: SEED_USER_PASSWORD }
} as const;`,
        label
    );

    writeFileSync(file, content);
    return {
        file: label,
        detail: 'removed SEED_PRODUCT_IDS, the product pins and SUBJECTS.product'
    };
};

/**
 * Edit `scripts/contracts/client-collections-bundle.ts`: the generated API collections' example
 * values name the demo shop's seeded product and order. Probes are loaded from each module's own
 * `probes.ts` by scan, so they leave with their modules; only these values are edited here.
 */
export const stripClientCollections = (repoRoot: string): RemovalNote => {
    const file = path.join(repoRoot, 'scripts', 'contracts', 'client-collections-bundle.ts');
    const label = 'scripts/contracts/client-collections-bundle.ts';
    let content = readFileSync(file, 'utf8');

    content = replaceOnce(
        content,
        `import { SEED_PRODUCT_IDS, SUBJECTS } from '../../scenarios/subjects';`,
        `import { SUBJECTS } from '../../scenarios/subjects';`,
        label
    );
    content = replaceOnce(
        content,
        `/**
 * What a generated request puts where an ORDER id belongs.
 *
 * Not a literal, and it cannot be one: the demo shop's orders are produced by driving
 * real checkouts (\`scenarios/flows/\`), so their ids are minted when the shop is built and differ
 * every time. Bruno, Insomnia and Postman all read \`{{name}}\` as a collection variable at send
 * time, so this hands the reader a slot to fill instead of an id that 404s. The orders section's
 * own first probe is the request that fills it.
 */
const ORDER_ID_VARIABLE = '{{orderId}}';

/** The four tools`,
        `/** The four tools`,
        label
    );
    content = replaceOnce(
        content,
        `const COLLECTION_NAME = 'Ecommerce Demo API';`,
        `const COLLECTION_NAME = 'API';`,
        label
    );
    content = replaceOnce(
        content,
        `    byProperty: {
        id: SUBJECTS.product.id,
        email: SUBJECTS.user.email,
        password: SUBJECTS.user.password,
        newPassword: SUBJECTS.user.password,
        username: 'new-shopper',
        productId: SUBJECTS.product.id,
        userId: SUBJECTS.user.id,
        orderId: ORDER_ID_VARIABLE,
        quantity: 2,
        admin: false,
        active: true,
        locale: 'en',
        page: 1,
        pageSize: 20
    },`,
        `    byProperty: {
        email: SUBJECTS.user.email,
        password: SUBJECTS.user.password,
        newPassword: SUBJECTS.user.password,
        username: 'new-shopper',
        userId: SUBJECTS.user.id,
        admin: false,
        active: true,
        locale: 'en',
        page: 1,
        pageSize: 20
    },`,
        label
    );
    content = replaceOnce(
        content,
        `    pathParam: (name, template) => {
        if (name === 'productId') return SUBJECTS.product.id;
        if (name === 'locale') return 'en';
        if (name !== 'id') return undefined;

        if (template.startsWith('/products')) return SUBJECTS.product.id;
        if (template.startsWith('/orders')) return ORDER_ID_VARIABLE;
        if (template.startsWith('/users')) return SUBJECTS.user.id;
        return SUBJECTS.admin.id;
    },`,
        `    pathParam: (name, template) => {
        if (name === 'locale') return 'en';
        if (name !== 'id') return undefined;

        if (template.startsWith('/users')) return SUBJECTS.user.id;
        return SUBJECTS.admin.id;
    },`,
        label
    );
    content = replaceOnce(
        content,
        `        seedUserEmail: SUBJECTS.user.email,
        seedUserPassword: SUBJECTS.user.password,
        seedUserId: SUBJECTS.user.id,
        seedProductId: SUBJECTS.product.id,
        seedSoftDeletedProductId: SEED_PRODUCT_IDS.heaterSoftDeleted,
        seedInactiveProductId: SEED_PRODUCT_IDS.bundleInactive,
        // Both resolve to a collection variable rather than an id — see ORDER_ID_VARIABLE.
        seedOrderId: ORDER_ID_VARIABLE,
        seedDeletedOrderId: '{{deletedOrderId}}'
    }`,
        `        seedUserEmail: SUBJECTS.user.email,
        seedUserPassword: SUBJECTS.user.password,
        seedUserId: SUBJECTS.user.id
    }`,
        label
    );
    writeFileSync(file, content);
    return { file: label, detail: 'dropped the shop’s example values' };
};

/**
 * Edit `scenarios/tools/generate-seed-images.ts` (`npm run scenario:images`): stop generating and
 * writing the catalogue's image manifest, keep the named accounts' avatars.
 */
export const stripSeedImageGenerator = (repoRoot: string): RemovalNote => {
    const file = path.join(repoRoot, 'scenarios', 'tools', 'generate-seed-images.ts');
    const label = 'scenarios/tools/generate-seed-images.ts';
    let content = readFileSync(file, 'utf8');

    content = replaceOnce(
        content,
        `import { FILLER_IMAGE_ROLE_KEYS } from '@scenarios/products-filler';`,
        '',
        label
    );
    content = replaceOnce(
        content,
        `/** The five named product roles that keep an image — \`barebones\` deliberately has none, since
 * its whole point is exercising the schema's own \`imageUrl\` default. The filler roles are a
 * fixed pool (\`FILLER_IMAGE_ROLE_KEYS\`), independent of how large the generated catalogue grid
 * is — \`scenarios/products.ts\` cycles through them, so growing the grid never needs a new
 * download. */
const PRODUCT_ROLES = [
    'dogFoodStandard',
    'heaterSoftDeleted',
    'scratchPostOutOfStock',
    'dogBedPremium',
    'bundleInactive',
    ...FILLER_IMAGE_ROLE_KEYS
];

/** The two named accounts`,
        `/** The two named accounts`,
        label
    );
    content = replaceOnce(
        content,
        `    const products: Record<string, ImageEntry> = {};
    for (const role of PRODUCT_ROLES) products[role] = await generateOne(role, \`product-\${role}\`);

    const users: Record<string, ImageEntry> = {};
    for (const role of USER_ROLES) users[role] = await generateOne(role, \`user-\${role}\`);

    const written = Object.values({ ...products, ...users });`,
        `    const users: Record<string, ImageEntry> = {};
    for (const role of USER_ROLES) users[role] = await generateOne(role, \`user-\${role}\`);

    const written = Object.values(users);`,
        label
    );
    content = replaceOnce(
        content,
        `    await writeManifest('scenarios/products-images.generated.json', products);
    await writeManifest('scenarios/users-images.generated.json', users);

    console.info(
        \`[seed-images] done: \${Object.keys(products).length} product images, \` +
            \`\${Object.keys(users).length} user images.\`
    );`,
        `    await writeManifest('scenarios/users-images.generated.json', users);

    console.info(\`[seed-images] done: \${Object.keys(users).length} user images.\`);`,
        label
    );

    writeFileSync(file, content);
    return { file: label, detail: 'dropped the catalogue image generation, kept the avatars' };
};
