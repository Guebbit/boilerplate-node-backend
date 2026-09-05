/**
 * `scripts/db/module-migrations.ts` — which migrations the assembler picks up, and what it refuses.
 *
 * Both refusals exist because `migrate-mongo` identifies a migration by its FILENAME and nothing
 * else: the leading timestamp is the only thing sequencing one module's change against another's,
 * and the changelog records what it has applied by name. A duplicate name is the dangerous one —
 * it does not fail loudly at runtime, it marks one module's migration as already applied and never
 * runs it.
 *
 * Driven against temp directories rather than the real modules, so a case can describe a state the
 * repository does not currently contain — no module ships a migration yet, which would make an
 * assertion over the live manifest vacuous.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    collectModuleMigrations,
    type MigrationSource
} from '../../../../scripts/db/module-migrations';

/** One temp root per run, removed in `afterAll`. */
let root: string;

beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'module-migrations-'));
});

afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

/**
 * A module owning a `migrations/` directory holding `files`.
 *
 * @param name  - the module's registry name
 * @param files - filenames to create, contents irrelevant — only the name is ever read
 */
const moduleWith = (name: string, files: string[]): MigrationSource => {
    const migrations = path.join(root, name, 'migrations');
    fs.mkdirSync(migrations, { recursive: true });
    for (const file of files) fs.writeFileSync(path.join(migrations, file), '');
    return { name, migrations };
};

describe('collectModuleMigrations', () => {
    it('returns nothing for a module that declares no migrations directory', () => {
        expect(collectModuleMigrations([{ name: 'observability' }])).toEqual([]);
    });

    it('tolerates a declared directory that does not exist', () => {
        const missing = { name: 'ghost', migrations: path.join(root, 'ghost', 'migrations') };
        expect(collectModuleMigrations([missing])).toEqual([]);
    });

    it('sorts across modules by filename, not by module order', () => {
        const modules = [
            moduleWith('orders', ['20261110120000-detach-user.js']),
            moduleWith('cart', ['20260101000000-drop-stale.js'])
        ];

        expect(collectModuleMigrations(modules).map(({ file, module }) => [module, file])).toEqual([
            ['cart', '20260101000000-drop-stale.js'],
            ['orders', '20261110120000-detach-user.js']
        ]);
    });

    it('ignores non-.js files, so a stray README does not become a migration', () => {
        const modules = [moduleWith('notes', ['20260101000000-real.js', 'README.md'])];

        expect(collectModuleMigrations(modules).map(({ file }) => file)).toEqual([
            '20260101000000-real.js'
        ]);
    });

    /*
     * Each rejected shape is its own case, because they fail for different reasons and a single
     * "invalid name" case would pass while only one of them was still caught.
     */
    it.each([
        ['no timestamp', 'detach-user.js'],
        ['a short timestamp', '2026111012000-detach-user.js'],
        ['a long timestamp', '202611101200000-detach-user.js'],
        ['no description', '20261110120000.js'],
        ['underscores', '20261110120000-detach_user.js'],
        ['capitals', '20261110120000-detachUser.js']
    ])('refuses a filename with %s', (_, file) => {
        expect(() => collectModuleMigrations([moduleWith('bad', [file])])).toThrow(
            /14-digit timestamp/
        );
    });

    it('names every malformed file at once, not just the first', () => {
        const modules = [moduleWith('sloppy', ['one.js', 'two.js'])];

        expect(() => collectModuleMigrations(modules)).toThrow(/one\.js[\S\s]*two\.js/);
    });

    it('refuses one filename claimed by two modules, naming both', () => {
        const modules = [
            moduleWith('alpha', ['20260101000000-shared.js']),
            moduleWith('beta', ['20260101000000-shared.js'])
        ];

        expect(() => collectModuleMigrations(modules)).toThrow(
            'Two modules own a migration named 20260101000000-shared.js — alpha and beta.'
        );
    });

    it('allows one module to own several migrations', () => {
        const modules = [
            moduleWith('busy', ['20260101000000-first.js', '20260102000000-second.js'])
        ];

        expect(collectModuleMigrations(modules)).toHaveLength(2);
    });
});
