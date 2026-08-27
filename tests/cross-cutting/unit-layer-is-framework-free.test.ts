/**
 * The `tests/unit` layer stays free of the database — including inside modules.
 *
 * Node's port of BE's `UnitLayerIsFrameworkFreeTest`. The HTTP half of that rule already has an
 * enforcer here — `eslint.config.ts` bans `supertest`, `@tests/http` and importing `src/app`/
 * `src/cluster` from `tests/unit` and every module's own `tests/unit`. This file is the other
 * half: no real or in-memory database either.
 *
 * That used to be a deliberate exception — 36 module unit specs called `setupTestDb()` against the
 * run's shared in-memory mongod, on the reasoning that most of what a repository or a service does
 * IS what Mongo does. The cost was the mutation run: Stryker reruns the unit suite once per mutant,
 * so a `beforeEach` wipe that is microseconds in `npm test` is paid thousands of times over. Those
 * specs now live in each module's `tests/integration/` (see NODE_MUTATION_MONGOD.md for the count
 * and the per-module breakdown), and `stryker.config.json`'s `testPathIgnorePatterns` excludes that
 * directory — this test is what keeps a new spec from drifting back into `tests/unit` and quietly
 * undoing that.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const MODULES_ROOT = path.join(__dirname, '../../src/modules');
const TOP_LEVEL_UNIT = path.join(__dirname, '../unit');

const FORBIDDEN = ['setupTestDb', 'mongodb-memory-server', '@tests/database'];

const moduleUnitDirectories = (): string[] =>
    readdirSync(MODULES_ROOT)
        .map((name) => path.join(MODULES_ROOT, name, 'tests/unit'))
        .filter((dir) => existsSync(dir));

const walkTestFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walkTestFiles(full);
        return entry.name.endsWith('.test.ts') ? [full] : [];
    });

describe('the unit layer stays free of the database', () => {
    it('finds unit tests inside modules, so the sweep below is not vacuous', () => {
        // A canary: with no module unit tests, the sweep below would pass over nothing.
        expect(moduleUnitDirectories().length).toBeGreaterThan(0);
    });

    it('keeps every unit test free of a real or in-memory database', () => {
        const violations = [TOP_LEVEL_UNIT, ...moduleUnitDirectories()]
            .flatMap((dir) => walkTestFiles(dir))
            .flatMap((filePath) => {
                const source = readFileSync(filePath, 'utf8');
                return FORBIDDEN.filter((needle) => source.includes(needle)).map(
                    (needle) =>
                        `${path.relative(path.join(__dirname, '../..'), filePath)} uses ${needle}`
                );
            });

        expect(violations).toEqual([]);
    });
});
