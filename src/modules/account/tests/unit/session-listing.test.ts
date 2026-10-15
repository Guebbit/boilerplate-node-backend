/**
 * @module
 * The session list both modes publish (`../../session/listing.ts`): one entry per sign-in however
 * many rows a rotation race left, the caller's own marked, and the optional fields absent rather
 * than invented. The store is REPLACED; what `listLive` selects is the integration suite's.
 */

import { Types } from 'mongoose';
import { asStub } from '@tests/stub';

jest.mock('@modules/account/repository', () => {
    const actual = jest.requireActual<typeof import('@modules/account/repository')>(
        '@modules/account/repository'
    );
    return {
        ...actual,
        __esModule: true,
        sessionRepository: { ...actual.sessionRepository, listLive: jest.fn() }
    };
});

jest.mock('@modules/users', () => {
    const actual = jest.requireActual<typeof import('@modules/users')>('@modules/users');
    return {
        ...actual,
        __esModule: true,
        userService: { ...actual.userService, findAuthenticatableById: jest.fn() }
    };
});

import { listSessions, newestPerFamily } from '@modules/account/session/listing';
import { sessionRepository, type SessionRow } from '@modules/account/repository';
import { userService } from '@modules/users';
import { hashToken } from '@infrastructure/security/hash-token';

/** The account every case lists. */
const USER_ID = '507f1f77bcf86cd799439011';

/** The store double. */
const { listLive } = asStub<{ listLive: jest.Mock }>(sessionRepository);

/** A live row; `_id` decides which of a family's rows is newer. */
const row = (familyId: Types.ObjectId, overrides: Partial<SessionRow> = {}): SessionRow =>
    asStub<SessionRow>({
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(USER_ID),
        familyId,
        mode: 'jwt',
        tokenHash: hashToken(String(Math.random())),
        startedAt: new Date('2026-10-01T10:00:00.000Z'),
        expiresAt: new Date('2026-10-08T10:00:00.000Z'),
        ...overrides
    });

/** The account-read double. */
const { findAuthenticatableById } = asStub<{ findAuthenticatableById: jest.Mock }>(userService);

beforeEach(() => {
    jest.resetAllMocks();
    findAuthenticatableById.mockResolvedValue({ id: USER_ID });
});

describe('newestPerFamily', () => {
    it('keeps one row per family — the later-written one, wherever it sits in the input', () => {
        const family = new Types.ObjectId();
        const older = row(family);
        const newer = row(family);

        expect(newestPerFamily([newer, older])).toEqual([newer]);
        expect(newestPerFamily([older, newer])).toEqual([newer]);
    });

    it('keeps every family, in the order given', () => {
        const first = row(new Types.ObjectId());
        const second = row(new Types.ObjectId());

        expect(newestPerFamily([second, first])).toEqual([second, first]);
    });
});

describe('listSessions', () => {
    it('publishes the family id, the sign-in and the expiry, and marks the caller’s own', async () => {
        const family = new Types.ObjectId();
        const other = new Types.ObjectId();
        listLive.mockResolvedValue([
            row(family, { tokenHash: hashToken('mine') }),
            row(other, { tokenHash: hashToken('theirs') })
        ]);

        const listed = await listSessions('jwt', USER_ID, 'mine');

        expect(listed).toEqual([
            {
                id: String(family),
                createdAt: '2026-10-01T10:00:00.000Z',
                expiration: '2026-10-08T10:00:00.000Z',
                current: true
            },
            expect.objectContaining({ id: String(other), current: false })
        ]);
    });

    it('marks the family current even when the caller holds its older row, inside the grace window', async () => {
        const family = new Types.ObjectId();
        listLive.mockResolvedValue([
            row(family, { tokenHash: hashToken('rotated-away') }),
            row(family, { tokenHash: hashToken('successor') })
        ]);

        const listed = await listSessions('jwt', USER_ID, 'rotated-away');

        expect(listed).toEqual([expect.objectContaining({ id: String(family), current: true })]);
    });

    it('marks nothing current for a caller with no credential of its own', async () => {
        listLive.mockResolvedValue([row(new Types.ObjectId())]);

        const listed = await listSessions('cookie', USER_ID, undefined);

        expect(listed.map((entry) => entry.current)).toEqual([false]);
    });

    it('carries the last use and the device only when the row has them', async () => {
        const used = new Date('2026-10-02T09:30:00.000Z');
        listLive.mockResolvedValue([
            row(new Types.ObjectId(), { lastUsedAt: used, device: 'Firefox on Linux' }),
            row(new Types.ObjectId())
        ]);

        const [withBoth, bare] = await listSessions('cookie', USER_ID, undefined);

        expect(withBoth).toMatchObject({
            lastUsedAt: used.toISOString(),
            device: 'Firefox on Linux'
        });
        expect(bare).not.toHaveProperty('lastUsedAt');
        expect(bare).not.toHaveProperty('device');
    });
});

describe('listSessions and the account epoch', () => {
    it('drops a row whose proof predates the epoch, as a ban moves it without deleting a row', async () => {
        const stale = row(new Types.ObjectId(), { authTime: 1_700_000_000 });
        const fresh = row(new Types.ObjectId(), { authTime: 1_800_000_000 });
        listLive.mockResolvedValue([stale, fresh]);
        findAuthenticatableById.mockResolvedValue({
            id: USER_ID,
            tokensValidAfter: new Date(1_750_000_000_000)
        });

        const listed = await listSessions('jwt', USER_ID, undefined);

        expect(listed.map((entry) => entry.id)).toEqual([String(fresh.familyId)]);
    });

    it('keeps a row with no stored proof: there is no epoch to judge it by', async () => {
        listLive.mockResolvedValue([row(new Types.ObjectId())]);
        findAuthenticatableById.mockResolvedValue({
            id: USER_ID,
            tokensValidAfter: new Date(1_750_000_000_000)
        });

        await expect(listSessions('jwt', USER_ID, undefined)).resolves.toHaveLength(1);
    });
});
