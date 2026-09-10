import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR, listMigrationFiles } from '../../db/data-changelog';

/**
 * Guard: no file under `ops/data/` touches an index.
 *
 * `db:sync` is the only author of indexes — see `docs/reference/data.md`. A data-change script
 * that also called `createIndex`/`dropIndex`/`syncIndexes` would give indexes a second author that
 * only runs once, on whichever databases happened to have the script applied, which is exactly the
 * drift `db:sync`'s reconciliation exists to prevent.
 *
 * There are no files here yet — the directory holds only `README.md` until the first real data
 * change is written — so this guard has nothing to prove itself against today. It is written now,
 * ahead of that file, so the rule is machine-checked from the first script rather than added after
 * one gets it wrong.
 */
describe('ops/data/*.ts never touches an index', () => {
    it('contains no createIndex, dropIndex or syncIndexes call', () => {
        for (const file of listMigrationFiles()) {
            const contents = readFileSync(path.join(DATA_DIR, file), 'utf8');
            expect(contents).not.toMatch(/createIndex|dropIndex|syncIndexes/);
        }
    });
});
