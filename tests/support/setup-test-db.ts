import { connect, disconnect, clearAll } from './database';

/**
 * The database lifecycle for any suite that touches Mongo. Call it once, at the TOP LEVEL of a
 * test file — not inside a `describe`, or the hooks only wrap that block.
 *
 * ── What it guarantees ───────────────────────────────────────────────────────────────────────
 * Its own database on the run's shared in-memory mongod, and an EMPTY one at the start of every
 * `it()`. That
 * second half is what lets each case create exactly the documents it talks about and assert on
 * absolute counts — `expect(found).toHaveLength(2)` rather than "two more than before".
 *
 * ── Why per-test wiping, and not per-file ────────────────────────────────────────────────────
 * Order-dependent tests are the failure this prevents. A suite that leaves rows behind passes in
 * the order it was written and fails when someone adds a case above, or runs one `it.only`. The
 * cost is a `deleteMany` per collection per test, which is microseconds against an in-memory
 * server — far cheaper than the afternoon spent on a suite that only passes in one order.
 *
 * ── What it deliberately does NOT do ─────────────────────────────────────────────────────────
 * It seeds nothing. A test that needs data creates it through a module's `tests/factory.ts`, so the
 * fixtures a case depends on are visible in the case itself rather than inherited from a shared
 * seed that later grows to serve someone else's assertions.
 */
export const setupTestDb = () => {
    beforeAll(connect);
    afterAll(disconnect);
    beforeEach(clearAll);
};
