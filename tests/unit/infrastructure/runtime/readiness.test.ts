/**
 * `readiness.ts` — the phase `GET /readyz` reads.
 *
 * Order matters in the first describe block: `phase` is module-level state with no reset export
 * (mirrors `resetAnalyticsProvider`-style modules, but this one has no legitimate reason to move
 * backwards in production, so no reset was added for a case production never needs). The booting
 * case is asserted before anything else in this file calls `markServerListening`/
 * `markServerDraining`, so it observes the module's true initial state.
 */
import { connection } from '@infrastructure/runtime/database';
import {
    isServerReady,
    markServerListening,
    markServerDraining
} from '@infrastructure/runtime/readiness';

/** Drive `connection.readyState` without opening a database — same helper as `dependency-health.test.ts`. */
const withReadyState = (state: number) => {
    Object.defineProperty(connection, 'readyState', {
        value: state,
        configurable: true
    });
};

describe('isServerReady', () => {
    it('is false before the process is marked listening, even with the database up', () => {
        withReadyState(1);

        expect(isServerReady()).toBe(false);
    });

    it('is true once listening and the database is connected', () => {
        withReadyState(1);
        markServerListening();

        expect(isServerReady()).toBe(true);
    });

    it('is false while listening if the database is not connected', () => {
        markServerListening();
        withReadyState(0);

        expect(isServerReady()).toBe(false);
    });

    it('is false once draining, even with the database up — never goes back to ready', () => {
        withReadyState(1);
        markServerListening();
        markServerDraining();

        expect(isServerReady()).toBe(false);
    });
});
