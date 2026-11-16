/**
 * `readiness.ts` — the phase `GET /readyz` reads.
 *
 * `phase` is module-level state with no reset export: production never moves it backwards, so
 * none was added. Each case loads a fresh copy of the module instead, which starts `booting`.
 */

/** A fresh `readiness` and the Mongoose connection it reads, both from one module registry. */
const load = async () => {
    jest.resetModules();
    const [readiness, { connection }] = await Promise.all([
        import('@infrastructure/runtime/readiness'),
        import('@infrastructure/runtime/database')
    ]);
    return {
        ...readiness,
        /** Drive `connection.readyState` without opening a database. */
        withReadyState: (state: number) => {
            Object.defineProperty(connection, 'readyState', {
                value: state,
                configurable: true
            });
        }
    };
};

describe('isServerReady', () => {
    it('is false before the process is marked listening, even with the database up', async () => {
        const { isServerReady, withReadyState } = await load();
        withReadyState(1);

        expect(isServerReady()).toBe(false);
    });

    it('is true once listening and the database is connected', async () => {
        const { isServerReady, markServerListening, withReadyState } = await load();
        withReadyState(1);
        markServerListening();

        expect(isServerReady()).toBe(true);
    });

    it('is false while listening if the database is not connected', async () => {
        const { isServerReady, markServerListening, withReadyState } = await load();
        markServerListening();
        withReadyState(0);

        expect(isServerReady()).toBe(false);
    });

    it('is false once draining, even with the database up — never goes back to ready', async () => {
        const { isServerReady, markServerListening, markServerDraining, withReadyState } =
            await load();
        withReadyState(1);
        markServerListening();
        markServerDraining();

        expect(isServerReady()).toBe(false);
    });

    it('stays false when boot finishes after a shutdown signal already arrived', async () => {
        const { isServerReady, markServerListening, markServerDraining, withReadyState } =
            await load();
        withReadyState(1);
        markServerDraining();

        markServerListening();

        expect(isServerReady()).toBe(false);
    });
});

describe('isServerDraining', () => {
    it('is false until a shutdown signal marks the process draining, and true after', async () => {
        const { isServerDraining, markServerListening, markServerDraining } = await load();
        markServerListening();
        expect(isServerDraining()).toBe(false);

        markServerDraining();

        expect(isServerDraining()).toBe(true);
    });

    it('stays true when boot finishes after the signal', async () => {
        const { isServerDraining, markServerListening, markServerDraining } = await load();
        markServerDraining();

        markServerListening();

        expect(isServerDraining()).toBe(true);
    });
});
