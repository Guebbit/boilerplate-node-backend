/**
 * The readiness fold, with every dependency's state controlled.
 *
 * The contract suite can only assert that the payload speaks the four words, because which one each
 * dependency reports depends on the `.env` of whoever runs the suite. This is where the mapping
 * itself is pinned — including the two cases that are easy to get backwards and expensive to get
 * wrong: `disabled` must not degrade a service, and `connecting` must not read as broken.
 */

import { connection } from '@infrastructure/runtime/database';
import { cacheState } from '@infrastructure/adapters/cache';
import { queueState } from '@infrastructure/adapters/queue';
import {
    dependencyHealth,
    overallStatus,
    type DependencyHealth
} from '@infrastructure/observability/dependency-health';

jest.mock('@infrastructure/adapters/cache', () => ({ cacheState: jest.fn() }));
jest.mock('@infrastructure/adapters/queue', () => ({ queueState: jest.fn() }));

const mockedCacheState = cacheState as jest.MockedFunction<typeof cacheState>;
const mockedQueueState = queueState as jest.MockedFunction<typeof queueState>;

/** Drive `connection.readyState` without opening a database. */
const withReadyState = (state: number) => {
    Object.defineProperty(connection, 'readyState', {
        value: state,
        configurable: true
    });
};

beforeEach(() => {
    jest.clearAllMocks();
    mockedCacheState.mockReturnValue('ready');
    mockedQueueState.mockReturnValue('ready');
    withReadyState(1);
});

// ─── The reading ──────────────────────────────────────────────────────────────

describe('dependencyHealth', () => {
    it.each([
        [1, 'ready'],
        [2, 'connecting'],
        [0, 'unavailable'],
        /* Mongoose's `disconnecting`. Not `connecting`: it is on its way OUT and will not start
         * serving again, so reporting it as nearly-ready would show a shutdown as a startup. */
        [3, 'unavailable']
    ])('maps mongoose readyState %i to %s', (state, expected) => {
        withReadyState(state);

        expect(dependencyHealth().database).toBe(expected);
    });

    it('reports an unknown readyState as unavailable rather than crashing', () => {
        /* A future mongoose could add a state. Answering "unavailable" is the safe direction: it
         * degrades a healthy service, where the opposite would report a dead one as serving. */
        withReadyState(99);

        expect(dependencyHealth().database).toBe('unavailable');
    });

    it('asks each adapter for its own state rather than probing it', () => {
        mockedCacheState.mockReturnValue('disabled');
        mockedQueueState.mockReturnValue('connecting');

        expect(dependencyHealth()).toEqual({
            database: 'ready',
            cache: 'disabled',
            queue: 'connecting'
        });
    });
});

// ─── The fold ─────────────────────────────────────────────────────────────────

/** Every dependency ready, minus whatever the case under test wants broken. */
const health = (overrides: Partial<DependencyHealth> = {}): DependencyHealth => ({
    database: 'ready',
    cache: 'ready',
    queue: 'ready',
    ...overrides
});

describe('overallStatus', () => {
    it('is ok when everything is ready', () => {
        expect(overallStatus(health())).toBe('ok');
    });

    it('is ok when an optional dependency is disabled', () => {
        /* The single most important case here. A deployment without Redis or without RabbitMQ is
         * supported, not broken — reporting it as degraded would leave the field permanently red on
         * exactly the deployments that chose it, and a permanently red field is one nobody reads. */
        expect(overallStatus(health({ cache: 'disabled', queue: 'disabled' }))).toBe('ok');
    });

    it.each([['unavailable'], ['connecting']] as const)(
        'is degraded when the cache is %s',
        (state) => {
            /* The bug this whole finding was about: `status` used to read the database and nothing
             * else, so Mongo up + Redis down reported `ok` while every cache lookup missed. */
            expect(overallStatus(health({ cache: state }))).toBe('degraded');
        }
    );

    it('is degraded while the database is still connecting', () => {
        /* `connecting` is honest about not serving yet. It is a separate WORD from `unavailable` so
         * a deploy inside its start-up grace period is legible, but it is not a separate STATUS —
         * an instance that cannot answer yet must not claim it can. */
        expect(overallStatus(health({ database: 'connecting' }))).toBe('degraded');
    });

    it('is degraded when the only problem is one optional dependency', () => {
        expect(overallStatus(health({ queue: 'unavailable' }))).toBe('degraded');
    });
});
