import { settleOutboxNudges } from '@kernel/outbox';
import { connect, disconnect, clearAll } from './database';

/**
 * The database lifecycle for any suite that touches Mongo. Call it once at the TOP LEVEL of a test
 * file, not inside a `describe`, or the hooks only wrap that block.
 *
 * Guarantees: its own database on the run's shared in-memory mongod, EMPTY at the start of every
 *             `it()`, so a case asserts absolute counts (`toHaveLength(2)`, not "two more").
 * Per test:   wiping per test, not per file, prevents order dependence: a suite that leaves rows
 *             passes in the order written and fails on a new case above it or an `it.only`. A
 *             `deleteMany` per collection is microseconds on an in-memory server.
 * Drains:     a write that announces an event starts a background relay pass that runs listeners.
 *             Left running it would write into the NEXT test's wiped database, outlive the file's
 *             `resetDomainEvents`, or touch the client after `disconnect`. Declared first, so the
 *             drain runs before the file's own `afterEach` unregisters listeners (jest-circus runs
 *             `afterEach` in declaration order).
 * Seeds:      nothing. A test creates what it needs through a module's `tests/factories.ts`, so
 *             a case's dependencies are visible in the case, not inherited from a shared seed.
 */
export const setupTestDb = () => {
    beforeAll(connect);
    afterEach(settleOutboxNudges);
    afterAll(() => settleOutboxNudges().then(disconnect));
    beforeEach(clearAll);
};
