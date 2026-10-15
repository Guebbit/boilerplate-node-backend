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

describe('resolveInLiveFamily', () => {
    it('is revoked when the family has no live row', async () => {
        store.familyActivity.mockResolvedValue(undefined);

        await expect(resolve(SHOPPER)).resolves.toEqual({ miss: 'revoked' });
    });

    it('ends a staff family idle past the limit, revoking it', async () => {
        store.familyActivity.mockResolvedValue({ lastActiveAt: ago(1801) });

        await expect(resolve(STAFF)).resolves.toEqual({ miss: 'idle' });
        expect(store.removeFamily).toHaveBeenCalledWith('u1', 'f1');
    });

    it('never ends a shopper’s family, however idle', async () => {
        store.familyActivity.mockResolvedValue({ lastActiveAt: ago(100_000) });

        await expect(resolve(SHOPPER)).resolves.toEqual({ ok: SHOPPER });
        expect(store.removeFamily).not.toHaveBeenCalled();
    });

    it('stamps a request that was never stamped, and one stamped over a minute ago', async () => {
        store.familyActivity.mockResolvedValue({ lastActiveAt: ago(5) });
        await resolve(STAFF);
        store.familyActivity.mockResolvedValue({ lastActiveAt: ago(90), stampedAt: ago(90) });
        await resolve(STAFF);

        expect(store.touchFamily).toHaveBeenCalledTimes(2);
    });

    it('does not stamp a request already stamped within the minute', async () => {
        store.familyActivity.mockResolvedValue({ lastActiveAt: ago(10), stampedAt: ago(10) });

        await resolve(STAFF);

        expect(store.touchFamily).not.toHaveBeenCalled();
    });

    it('judges a passive request but never stamps it', async () => {
        store.familyActivity.mockResolvedValue({ lastActiveAt: ago(120), stampedAt: ago(120) });

        await expect(resolve(STAFF, true)).resolves.toEqual({ ok: STAFF });
        expect(store.touchFamily).not.toHaveBeenCalled();
    });

    it('still answers when the stamp fails', async () => {
        store.familyActivity.mockResolvedValue({ lastActiveAt: ago(120), stampedAt: ago(120) });
        store.touchFamily.mockRejectedValue(new Error('store down'));

        await expect(resolve(STAFF)).resolves.toEqual({ ok: STAFF });
    });
});
