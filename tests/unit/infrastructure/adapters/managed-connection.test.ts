/**
 * The lifecycle both optional dependencies now run on.
 *
 * Redis and RabbitMQ used to state these rules separately, and drifted: `cacheState()` read
 * `connecting` off the client's socket flag while `queueState()` read it off whether a connect was
 * in flight, so one health payload answered the same question two ways. The rules live here now,
 * which means they can be tested once — against a fake handle, with no Redis and no broker.
 *
 * Four properties are load-bearing and each has its own block below: never rejecting, never
 * opening a second connection while one is in flight, warning exactly once per outage, and
 * closing on the way out even when the handle is mid-open.
 */
import { manageConnection } from '@infrastructure/adapters/managed-connection';
import { logger } from '@infrastructure/adapters/logger';

jest.mock('@infrastructure/adapters/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

const mockedLogger = jest.mocked(logger);

/** A handle standing in for a Redis client or an AMQP channel: it only has to be identifiable. */
interface FakeHandle {
    id: number;
    live: boolean;
}

/** A promise plus the controls to settle it, so a test can hold a connect open mid-flight. */
const deferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((resolveIt, rejectIt) => {
        resolve = resolveIt;
        reject = rejectIt;
    });
    return { promise, resolve, reject };
};

/**
 * A managed connection over fake handles, with every callback observable.
 *
 * `connect` hands back a fresh live handle by default; a case that needs to control the timing
 * overrides the implementation.
 */
const setup = () => {
    let opened = 0;
    const connect = jest.fn(() =>
        Promise.resolve<FakeHandle | undefined>({ id: ++opened, live: true })
    );
    const close = jest.fn(() => Promise.resolve());
    const isEnabled = jest.fn(() => true);

    const connection = manageConnection<FakeHandle>({
        unavailableMessage: 'Fake dependency unavailable.',
        isEnabled,
        connect,
        isReady: (handle) => handle.live,
        close
    });

    return { connection, connect, close, isEnabled };
};

describe('when the dependency is switched off', () => {
    it('reports disabled and opens nothing', async () => {
        const { connection, connect, isEnabled } = setup();
        isEnabled.mockReturnValue(false);

        await expect(connection.get()).resolves.toBeUndefined();

        expect(connection.state()).toBe('disabled');
        expect(connect).not.toHaveBeenCalled();
    });

    /*
     * `disabled` is not a failure: a deployment without Redis is supported, and reporting it as
     * broken would train every reader of the health payload to ignore the field.
     */
    it('stays disabled even after a handle was opened while it was on', async () => {
        const { connection, isEnabled } = setup();
        await connection.get();
        expect(connection.state()).toBe('ready');

        isEnabled.mockReturnValue(false);

        expect(connection.state()).toBe('disabled');
    });
});

/*
 * The reason this file exists. `connecting` means one thing — an attempt is in flight — for every
 * dependency that reports through it, so two entries in one health payload cannot disagree about
 * what the word means. The production HEALTHCHECK allows a start period, during which
 * "not yet" and "broken" look identical on the wire and mean opposite things to whoever is
 * watching a deploy.
 */
describe('the reported state', () => {
    it('walks unavailable → connecting → ready → unavailable', async () => {
        const { connection, connect } = setup();
        const attempt = deferred<FakeHandle | undefined>();
        connect.mockReturnValue(attempt.promise);

        expect(connection.state()).toBe('unavailable');

        const opening = connection.get();
        expect(connection.state()).toBe('connecting');

        attempt.resolve({ id: 1, live: true });
        const handle = await opening;
        expect(connection.state()).toBe('ready');

        handle!.live = false;
        expect(connection.state()).toBe('unavailable');
    });
});

describe('the handle', () => {
    it('is opened once and reused', async () => {
        const { connection, connect } = setup();

        const first = await connection.get();
        const second = await connection.get();

        expect(first).toBe(second);
        expect(connect).toHaveBeenCalledTimes(1);
    });

    // The reason `isReady` exists: a dependency that died since the last call must be reconnected
    // rather than handed back dead, or every caller gets a corpse whose methods throw.
    it('is replaced once it stops being ready', async () => {
        const { connection, connect } = setup();

        const first = await connection.get();
        first!.live = false;
        const second = await connection.get();

        expect(second).not.toBe(first);
        expect(connect).toHaveBeenCalledTimes(2);
    });

    // `forget` is the whole reconnect strategy for a handle that announces its own close.
    it('is re-opened after forget(), without being closed', async () => {
        const { connection, connect, close } = setup();
        await connection.get();

        connection.forget();
        await connection.get();

        expect(connect).toHaveBeenCalledTimes(2);
        expect(close).not.toHaveBeenCalled();
    });

    /*
     * A burst at startup — every worker's first request arriving at once — must not open a
     * connection per caller. The second caller joins the attempt already running.
     */
    it('is not opened twice by concurrent callers', async () => {
        const { connection, connect } = setup();
        const attempt = deferred<FakeHandle | undefined>();
        connect.mockReturnValue(attempt.promise);

        const both = Promise.all([connection.get(), connection.get()]);
        expect(connection.state()).toBe('connecting');

        attempt.resolve({ id: 1, live: true });
        const [first, second] = await both;

        expect(connect).toHaveBeenCalledTimes(1);
        expect(first).toBe(second);
    });
});

describe('a connect that fails', () => {
    /*
     * The property every fail-open adapter is built on. A rejection here would become a 500 on a
     * request the cache was only ever an optimisation for, and would skip the queue's inline
     * fallback entirely.
     */
    it('resolves undefined rather than rejecting', async () => {
        const { connection, connect } = setup();
        connect.mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(connection.get()).resolves.toBeUndefined();
        expect(connection.state()).toBe('unavailable');
    });

    it('is retried by the next call, so recovery follows traffic', async () => {
        const { connection, connect } = setup();
        connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));

        await connection.get();
        const recovered = await connection.get();

        expect(connect).toHaveBeenCalledTimes(2);
        expect(recovered).toEqual({ id: 1, live: true });
    });

    // An unreachable dependency emits per failed operation. One line, not one per request.
    it('logs one warning however many times it is asked', async () => {
        const { connection, connect } = setup();
        connect.mockRejectedValue(new Error('ECONNREFUSED'));

        await connection.get();
        await connection.get();
        await connection.get();

        expect(mockedLogger.warn).toHaveBeenCalledTimes(1);
    });

    // Latched, not disabled: a later outage is a different outage and has to be visible.
    it('re-arms the warning once a connect succeeds', async () => {
        const { connection, connect } = setup();
        connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));

        await connection.get();
        await connection.get();
        connection.forget();
        connect.mockRejectedValueOnce(new Error('ECONNRESET'));
        await connection.get();

        expect(mockedLogger.warn).toHaveBeenCalledTimes(2);
    });

    /*
     * `reportUnavailable` shares that latch with failures arriving from outside `connect` — an
     * `error` event on a live handle, a command rejected mid-publish. They are the same outage.
     */
    it('shares its latch with failures reported from outside', async () => {
        const { connection, connect } = setup();
        connect.mockRejectedValue(new Error('ECONNREFUSED'));

        await connection.get();
        connection.reportUnavailable(new Error('socket hang up'));

        expect(mockedLogger.warn).toHaveBeenCalledTimes(1);
    });
});

/*
 * `connect` resolving `undefined` means "cannot be built" — configuration `isEnabled` could not
 * rule out, such as a URL that assembles to nothing. Nothing failed, so nothing is logged.
 */
describe('a connect that declines to build a handle', () => {
    it('reports unavailable without a warning', async () => {
        const { connection, connect } = setup();
        connect.mockResolvedValue(undefined);

        await expect(connection.get()).resolves.toBeUndefined();

        expect(connection.state()).toBe('unavailable');
        expect(mockedLogger.warn).not.toHaveBeenCalled();
    });
});

describe('stop()', () => {
    it('closes the live handle and forgets it', async () => {
        const { connection, close, connect } = setup();
        const handle = await connection.get();

        await connection.stop();

        expect(close).toHaveBeenCalledWith(handle);
        expect(connection.state()).toBe('unavailable');

        // A restarted app — or a test that boots one in-process — gets a fresh handle rather than
        // a closed one.
        await connection.get();
        expect(connect).toHaveBeenCalledTimes(2);
    });

    /*
     * A connect still in flight owns the handle `stop` is about to close. Without waiting, the
     * socket finishes opening after shutdown with nobody left to close it, and holds the process
     * open past the point the server stopped listening.
     */
    it('waits for an in-flight connect before closing it', async () => {
        const { connection, connect, close } = setup();
        const attempt = deferred<FakeHandle | undefined>();
        connect.mockReturnValue(attempt.promise);

        void connection.get();
        const stopped = connection.stop();

        expect(close).not.toHaveBeenCalled();

        attempt.resolve({ id: 9, live: true });
        await stopped;

        expect(close).toHaveBeenCalledWith({ id: 9, live: true });
    });

    /*
     * Called with `undefined` rather than skipped: an adapter that opened more than the handle —
     * `queue.ts` holds the TCP connection under its channel — still has to release it.
     */
    it('calls close even when no handle is live', async () => {
        const { connection, close } = setup();

        await connection.stop();

        expect(close).toHaveBeenCalledWith(undefined);
    });

    // Shutdown is the one path that must not raise: an already-dead socket rejecting its own
    // close is the ordinary case, and the process is on its way out regardless.
    it('resolves even when close fails', async () => {
        const { connection, close } = setup();
        await connection.get();
        close.mockRejectedValue(new Error('socket already gone'));

        await expect(connection.stop()).resolves.toBeUndefined();
    });
});
