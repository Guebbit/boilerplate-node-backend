/**
 * The ledger's file-side logic: which `ops/data/*.ts` files exist, their checksums, and how they
 * compare against what a ledger already recorded — all of it without a database connection, which
 * is the whole reason `db/data-changelog.ts` was split from `db/apply-data.ts`.
 *
 * See: docs/reference/data.md
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    diffMigrations,
    fileChecksum,
    listMigrationFiles,
    type DataChangeRecord
} from '../../../db/data-changelog';

/** A scratch `ops/data/`-shaped directory, fresh per case. */
let dir: string;

/** One fake migration file, so a case can control exactly what is "on disk". */
const write = (name: string, contents: string): void =>
    writeFileSync(path.join(dir, name), contents);

/** A ledger record with only the fields a given case cares about. */
const record = (overrides: Partial<DataChangeRecord> = {}): DataChangeRecord => ({
    file: '20260101000000-example.ts',
    appliedAt: new Date('2026-01-01'),
    durationMs: 5,
    checksum: 'irrelevant',
    host: 'test',
    ...overrides
});

beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'data-changelog-'));
});

afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe('listMigrationFiles', () => {
    it('lists .ts files in filename order, ignoring everything else', () => {
        write('20260102-second.ts', '');
        write('20260101-first.ts', '');
        write('README.md', '');

        expect(listMigrationFiles(dir)).toEqual(['20260101-first.ts', '20260102-second.ts']);
    });

    it('reports an empty ledger, not a failure, for a directory that does not exist yet', () => {
        expect(listMigrationFiles(path.join(dir, 'never-created'))).toEqual([]);
    });
});

describe('fileChecksum', () => {
    it('is stable for identical contents and differs when contents change', () => {
        write('a.ts', 'export const up = () => Promise.resolve();');
        write('b.ts', 'export const up = () => Promise.resolve();');
        write('c.ts', 'export const up = () => undefined;');

        const a = fileChecksum(path.join(dir, 'a.ts'));
        const b = fileChecksum(path.join(dir, 'b.ts'));
        const c = fileChecksum(path.join(dir, 'c.ts'));

        expect(a).toBe(b);
        expect(a).not.toBe(c);
    });
});

describe('diffMigrations', () => {
    it('treats a file the ledger has never seen as pending', () => {
        write('20260101000000-example.ts', 'export const up = () => Promise.resolve();');

        const { pending, changed } = diffMigrations(new Map(), dir);

        expect(pending).toEqual([
            {
                file: '20260101000000-example.ts',
                checksum: fileChecksum(path.join(dir, '20260101000000-example.ts'))
            }
        ]);
        expect(changed).toEqual([]);
    });

    it('treats a matching checksum as neither pending nor changed', () => {
        write('20260101000000-example.ts', 'export const up = () => Promise.resolve();');
        const checksum = fileChecksum(path.join(dir, '20260101000000-example.ts'));
        const applied = new Map([['20260101000000-example.ts', record({ checksum })]]);

        expect(diffMigrations(applied, dir)).toEqual({ pending: [], changed: [] });
    });

    it('flags a file whose contents changed since it was recorded, with the old checksum kept', () => {
        write('20260101000000-example.ts', 'export const up = () => undefined; // edited');
        const applied = new Map([
            ['20260101000000-example.ts', record({ checksum: 'a-stale-checksum' })]
        ]);

        const { pending, changed } = diffMigrations(applied, dir);

        expect(pending).toEqual([]);
        expect(changed).toEqual([
            {
                file: '20260101000000-example.ts',
                checksum: fileChecksum(path.join(dir, '20260101000000-example.ts')),
                previousChecksum: 'a-stale-checksum'
            }
        ]);
    });

    it('ignores a ledger record for a file that is no longer on disk', () => {
        // Deleted-once-applied is rule 3 working as intended, not drift to report.
        const applied = new Map([['20250101000000-long-gone.ts', record()]]);

        expect(diffMigrations(applied, dir)).toEqual({ pending: [], changed: [] });
    });
});
