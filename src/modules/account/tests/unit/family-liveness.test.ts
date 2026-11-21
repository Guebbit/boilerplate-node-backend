/**
 * @module
 * `resolveInLiveFamily` (`../../session/family-liveness.ts`): a family with no live row is
 * revoked, a staff one past its idle limit is ended, and any other live request is counted as
 * activity unless it is passive. The store is REPLACED; what its queries select is the integration
 * suite's.
 */

import { asStub } from '@tests/stub';
import { setEnvironment } from '@tests/environment';

jest.mock('@modules/account/repository', () => {
    const actual = jest.requireActual<typeof import('@modules/account/repository')>(
        '@modules/account/repository'
    );
    return {
        ...actual,
        __esModule: true,
        sessionRepository: {
            ...actual.sessionRepository,
            familyActivity: jest.fn(),
            touchFamily: jest.fn(),
            removeFamily: jest.fn()
        }
    };
});

import { resolveInLiveFamily } from '@modules/account/session/family-liveness';
import { sessionRepository } from '@modules/account/repository';

/** The store doubles. */
const store = asStub<{
    familyActivity: jest.Mock;
    touchFamily: jest.Mock;
    removeFamily: jest.Mock;
}>(sessionRepository);

/** The callers a proof can name. */
const SHOPPER: { id: string; roles: { tenant: string | null; platform: null } } = {
    id: 'u1',
    roles: { tenant: null, platform: null }
};

/** A tenant-scope staff caller; the cases give it a session family to revoke. */
const STAFF = { id: 'u1', roles: { tenant: 'editor', platform: null } };

/** How long ago, in seconds, a family last saw a request. */
const ago = (seconds: number) => new Date(Date.now() - seconds * 1000);

/** Resolves the family for a caller. */
const resolve = (caller: typeof SHOPPER, passive = false) =>
    resolveInLiveFamily('u1', 'f1', 'jwt', () => Promise.resolve(asStub(caller)), { passive });

beforeEach(() => {
    jest.resetAllMocks();
    setEnvironment({ NODE_SESSION_IDLE_TIME_STAFF: '1800' });
    store.touchFamily.mockResolvedValue(true);
    store.removeFamily.mockResolvedValue(1);
});

/** The clock of the caller a resolve answered. */
const clockOf = (resolved: Awaited<ReturnType<typeof resolve>>) =>
    'ok' in resolved ? resolved.ok?.sessionClock : undefined;

describe('resolveInLiveFamily', () => {
    it('is revoked when the family has no live row', async () => {
        store.familyActivity.mockResolvedValue(undefined);

        await expect(resolve(SHOPPER)).resolves.toEqual({ miss: 'revoked' });
    });

    it('ends a staff family idle past the limit, revoking it', async () => {
        store.familyActivity.mockResolvedValue({ startedAt: ago(100), lastActiveAt: ago(1801) });

        await expect(resolve(STAFF)).resolves.toEqual({ miss: 'idle' });
        expect(store.removeFamily).toHaveBeenCalledWith('u1', 'f1');
    });

    it('ends a staff family signed in past the lifetime cap even when it is busy', async () => {
        store.familyActivity.mockResolvedValue({
            startedAt: ago(86_401),
            lastActiveAt: ago(5)
        });

        await expect(resolve(STAFF)).resolves.toEqual({ miss: 'expired' });
        expect(store.removeFamily).toHaveBeenCalledWith('u1', 'f1');
    });

    it('lets a busy staff family inside the cap, and any family once the cap is off', async () => {
        store.familyActivity.mockResolvedValue({ startedAt: ago(86_000), lastActiveAt: ago(5) });
        await expect(resolve(STAFF)).resolves.toMatchObject({ ok: STAFF });

        setEnvironment({ NODE_SESSION_LIFETIME_STAFF: '0' });
        store.familyActivity.mockResolvedValue({
            startedAt: ago(10_000_000),
            lastActiveAt: ago(5)
        });
        await expect(resolve(STAFF)).resolves.toMatchObject({ ok: STAFF });
    });

    it('never ends a shopper’s family for age, however old', async () => {
        store.familyActivity.mockResolvedValue({
            startedAt: ago(10_000_000),
            lastActiveAt: ago(5)
        });

        await expect(resolve(SHOPPER)).resolves.toMatchObject({ ok: SHOPPER });
        expect(store.removeFamily).not.toHaveBeenCalled();
    });

    it('never ends a shopper’s family, however idle', async () => {
        store.familyActivity.mockResolvedValue({ startedAt: ago(100), lastActiveAt: ago(100_000) });

        await expect(resolve(SHOPPER)).resolves.toMatchObject({ ok: SHOPPER });
        expect(store.removeFamily).not.toHaveBeenCalled();
    });

    it('stamps a request that was never stamped, and one stamped over a minute ago', async () => {
        store.familyActivity.mockResolvedValue({ startedAt: ago(100), lastActiveAt: ago(5) });
        await resolve(STAFF);
        store.familyActivity.mockResolvedValue({
            startedAt: ago(100),
            lastActiveAt: ago(90),
            stampedAt: ago(90)
        });
        await resolve(STAFF);

        expect(store.touchFamily).toHaveBeenCalledTimes(2);
    });

    it('does not stamp a request already stamped within the minute', async () => {
        store.familyActivity.mockResolvedValue({
            startedAt: ago(100),
            lastActiveAt: ago(10),
            stampedAt: ago(10)
        });

        await resolve(STAFF);

        expect(store.touchFamily).not.toHaveBeenCalled();
    });

    it('judges a passive request but never stamps it', async () => {
        store.familyActivity.mockResolvedValue({
            startedAt: ago(100),
            lastActiveAt: ago(120),
            stampedAt: ago(120)
        });

        await expect(resolve(STAFF, true)).resolves.toMatchObject({ ok: STAFF });
        expect(store.touchFamily).not.toHaveBeenCalled();
    });

    it('still answers when the stamp fails', async () => {
        store.familyActivity.mockResolvedValue({
            startedAt: ago(100),
            lastActiveAt: ago(120),
            stampedAt: ago(120)
        });
        store.touchFamily.mockRejectedValue(new Error('store down'));

        await expect(resolve(STAFF)).resolves.toMatchObject({ ok: STAFF });
    });

    describe('the session clock it hands the caller', () => {
        it('says "now" when this request writes the stamp, and keeps the family start', async () => {
            const startedAt = ago(100);
            store.familyActivity.mockResolvedValue({
                startedAt,
                lastActiveAt: ago(90),
                stampedAt: ago(90)
            });

            const clock = clockOf(await resolve(STAFF));

            expect(Date.now() - clock!.lastActiveAt.getTime()).toBeLessThan(1000);
            expect(clock!.startedAt).toBe(startedAt);
        });

        it('keeps the SAVED stamp when it is still fresh, so the countdown never overstates', async () => {
            const lastActiveAt = ago(40);
            store.familyActivity.mockResolvedValue({
                startedAt: ago(100),
                lastActiveAt,
                stampedAt: lastActiveAt
            });

            expect(clockOf(await resolve(STAFF))!.lastActiveAt).toBe(lastActiveAt);
        });

        it('keeps the saved stamp for a passive request, even a stale one', async () => {
            const lastActiveAt = ago(120);
            store.familyActivity.mockResolvedValue({
                startedAt: ago(200),
                lastActiveAt,
                stampedAt: lastActiveAt
            });

            expect(clockOf(await resolve(STAFF, true))!.lastActiveAt).toBe(lastActiveAt);
        });
    });
});
