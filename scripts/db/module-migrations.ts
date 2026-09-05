/**
 * @module
 * Which migrations the enabled modules own, and the two rules a filename has to satisfy.
 *
 * Separated from `build-migrations.ts` so the rules can be driven directly: that file registers
 * every model and writes to disk on import, which a test cannot do per case.
 *
 * See: docs/reference/data.md
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * What a module's migration filename must look like: `20260905000000-what-it-does.js`.
 *
 * `migrate-mongo` orders migrations by filename alone, so the leading timestamp is the ONLY thing
 * sequencing one module's change against another's. A file without one sorts wherever its first
 * letter falls and would run in an order nobody chose.
 */
export const MIGRATION_NAME_PATTERN = /^\d{14}-[\da-z-]+\.js$/;

/** One migration a module owns, resolved to where it comes from and where it lands. */
export interface ModuleMigration {
    /** The module that declared the `migrations` directory holding it. */
    module: string;
    /** Its filename, which is also its identity in the changelog — preserved verbatim. */
    file: string;
    /** Absolute path to the authored file. */
    source: string;
}

/**
 * The parts of a module manifest this reads.
 *
 * Structural rather than `AppModule`, so a test case is two fields instead of a router and a
 * seeder — and so this file needs no import from `src/`.
 */
export interface MigrationSource {
    /** The module's registry name, used only to name it in an error. */
    name: string;
    /** Absolute path to its `migrations/` directory, if it declares one. */
    migrations?: string;
}

/**
 * Every enabled module's migrations, in the order `migrate-mongo` will apply them.
 *
 * Takes the module list rather than importing `enabledModules`, matching `registerModules` — here
 * it also keeps the caller's model registration untouched, since importing the manifest would
 * register every model ahead of the walk that attributes them.
 *
 * @param appModules - the enabled module list
 * @returns the migrations, sorted by filename across all modules
 * @throws when a filename is malformed, or two modules claim the same one
 */
export const collectModuleMigrations = (
    appModules: readonly MigrationSource[]
): ModuleMigration[] => {
    const found = appModules.flatMap(({ name, migrations }) =>
        migrations && fs.existsSync(migrations)
            ? fs
                  .readdirSync(migrations)
                  .filter((file) => file.endsWith('.js'))
                  .map((file) => ({ module: name, file, source: path.join(migrations, file) }))
            : []
    );

    assertNamesAreOrderable(found);
    assertNoDuplicateNames(found);

    return found.toSorted((a, b) => a.file.localeCompare(b.file));
};

/**
 * Refuse a filename `migrate-mongo` cannot sequence.
 *
 * Every offender is listed at once — one restart per mistake is how a rename of several files
 * turns into several runs.
 *
 * @param found - the discovered migrations
 * @throws when any filename fails {@link MIGRATION_NAME_PATTERN}
 */
const assertNamesAreOrderable = (found: readonly ModuleMigration[]): void => {
    const malformed = found.filter(({ file }) => !MIGRATION_NAME_PATTERN.test(file));
    if (malformed.length === 0) return;

    throw new Error(
        'Migration filenames must be `<14-digit timestamp>-kebab-name.js` — ' +
            'migrate-mongo orders by filename alone:\n' +
            malformed.map(({ module, file }) => `  ${module}/migrations/${file}`).join('\n')
    );
};

/**
 * Refuse two modules claiming one filename.
 *
 * They would collapse into a single copied file, and the changelog records by NAME — so the
 * survivor would mark the other module's migration as already applied, and it would never run.
 *
 * @param found - the discovered migrations
 * @throws when any filename is claimed twice
 */
const assertNoDuplicateNames = (found: readonly ModuleMigration[]): void => {
    const byFile = new Map<string, string>();

    for (const { module, file } of found) {
        const claimed = byFile.get(file);
        if (claimed)
            throw new Error(
                `Two modules own a migration named ${file} — ${claimed} and ${module}. ` +
                    'Rename one: the filename is its identity in the changelog.'
            );
        byFile.set(file, module);
    }
};
