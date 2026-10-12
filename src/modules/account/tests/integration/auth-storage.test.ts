/**
 * @module
 * `sessions` and `verificationtokens` against a real database: the atomic claims, the one-live-link
 * upsert and what a TTL date means — the behaviours a mocked store could only agree with itself
 * about.
 */

import { Types } from 'mongoose';
import { withTransaction } from '@infrastructure/runtime/database';
import { sessionModel } from '../../model';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { hashToken } from '@infrastructure/security/hash-token';
import { raceN, RACE_SIZE } from '@tests/race';
import { sessionRepository, verificationTokenRepository } from '../../repository';
import {
    plantSession,
    plantToken,
    reapDueSessions,
    sessionRowFor,
    sessionHashesOf,
    sessionRowsOf,
    tokenRowsOf,
    tokenTypesOf
} from '../factories';
import { eraseSessionsAndTokens, exportSessions, sessionsList } from '../../services/sessions';
import type { SessionRequest } from '../../session/strategy';
import { asStub } from '@tests/stub';

setupTestDb();

/** A request carrying the session cookie `credential`, or none. */
const requestWithCookie = (credential?: string) =>
    asStub<SessionRequest>({
        cookies: credential === undefined ? {} : { '__Host-session': credential },
        headers: {}
    });

describe('sessionRepository.supersede', () => {
    it('lets exactly one of many concurrent callers claim a token', async () => {
        const user = await createUser();
        await plantSession(user.id, 'contended');

        const results = await raceN(RACE_SIZE, () =>
            sessionRepository.supersede(hashToken('contended'), new Date(), 60_000)
        );

        const claims = results.filter((result) => result.status === 'fulfilled' && result.value);
        expect(claims).toHaveLength(1);
    });

    it('moves `purgeAt` to the retention window, never past the row’s own expiry', async () => {
        const user = await createUser();
        await plantSession(user.id, 'short-lived', { ttlMs: 30_000 });
        await plantSession(user.id, 'long-lived', { ttlMs: 3_600_000 });
        const at = new Date();

        await sessionRepository.supersede(hashToken('short-lived'), at, 60_000);
        await sessionRepository.supersede(hashToken('long-lived'), at, 60_000);

        const short = await sessionRowFor('short-lived');
        const long = await sessionRowFor('long-lived');
        expect(short!.purgeAt).toEqual(short!.expiresAt);
        expect(long!.purgeAt).toEqual(new Date(at.getTime() + 60_000));
        expect(long!.supersededAt).toEqual(at);
    });

    it('refuses a `cookie` row: only a `jwt` row is ever rotated away', async () => {
        const user = await createUser();
        await plantSession(user.id, 'cookie-id', { mode: 'cookie' });

        await expect(
            sessionRepository.supersede(hashToken('cookie-id'), new Date(), 60_000)
        ).resolves.toBe(false);
    });
});

describe('sessionRepository.listLive', () => {
    it('lists only this account’s live rows of the asked mode, newest sign-in first', async () => {
        const user = await createUser({ email: 'lister@example.com' });
        const other = await createUser({ email: 'other@example.com' });
        await plantSession(user.id, 'older', { startedAt: new Date(Date.now() - 60_000) });
        await plantSession(user.id, 'newer');
        await plantSession(user.id, 'rotated-away', { supersededAt: new Date() });
        await plantSession(user.id, 'expired', { ttlMs: -1000 });
        await plantSession(user.id, 'wrong-mode', { mode: 'cookie' });
        await plantSession(other.id, 'not-mine');

        const rows = await sessionRepository.listLive(user.id, 'jwt', new Date());

        expect(rows.map((row) => row.tokenHash)).toEqual([hashToken('newer'), hashToken('older')]);
    });
});

describe('sessionRepository.removeFamily', () => {
    it('removes the live row and its rotated-away predecessors together', async () => {
        const user = await createUser();
        const family = new Types.ObjectId().toString();
        await plantSession(user.id, 'live', { familyId: family });
        await plantSession(user.id, 'predecessor', { familyId: family, supersededAt: new Date() });
        await plantSession(user.id, 'bystander');

        await expect(sessionRepository.removeFamily(user.id, family)).resolves.toBe(2);

        expect(await sessionHashesOf(user.id)).toEqual([hashToken('bystander')]);
    });

    it('cannot be turned on another account’s session', async () => {
        const owner = await createUser({ email: 'owner@example.com' });
        const attacker = await createUser({ email: 'attacker@example.com' });
        const family = new Types.ObjectId().toString();
        await plantSession(owner.id, 'owner-session', { familyId: family });

        await expect(sessionRepository.removeFamily(attacker.id, family)).resolves.toBe(0);

        expect(await sessionRowsOf(owner.id)).toHaveLength(1);
    });
});

describe('sessionRepository.removeByHash', () => {
    it('removes one session and leaves the siblings, and an unknown value is a no-op', async () => {
        const user = await createUser();
        await plantSession(user.id, 'phone');
        await plantSession(user.id, 'laptop');

        await expect(sessionRepository.removeByHash(hashToken('phone'))).resolves.toBe(1);
        await expect(sessionRepository.removeByHash(hashToken('never-issued'))).resolves.toBe(0);

        expect(await sessionHashesOf(user.id)).toEqual([hashToken('laptop')]);
    });
});

describe('sessionRepository.touch', () => {
    it('stamps only the row that matched', async () => {
        const user = await createUser();
        await plantSession(user.id, 'first');
        await plantSession(user.id, 'second');
        const now = new Date();

        await sessionRepository.touch(hashToken('second'), now);

        expect((await sessionRowFor('first'))!.lastUsedAt).toBeUndefined();
        expect((await sessionRowFor('second'))!.lastUsedAt).toEqual(now);
    });

    it('writes at most once per interval when throttled', async () => {
        const user = await createUser();
        await plantSession(user.id, 'busy');
        const first = new Date();

        await sessionRepository.touch(hashToken('busy'), first, 60_000);
        await sessionRepository.touch(hashToken('busy'), new Date(first.getTime() + 1000), 60_000);
        expect((await sessionRowFor('busy'))!.lastUsedAt).toEqual(first);

        const later = new Date(first.getTime() + 61_000);
        await sessionRepository.touch(hashToken('busy'), later, 60_000);
        expect((await sessionRowFor('busy'))!.lastUsedAt).toEqual(later);
    });
});

describe('what the TTL monitor deletes', () => {
    it('deletes rows past their `purgeAt` and nothing else', async () => {
        const user = await createUser();
        await plantSession(user.id, 'due', { ttlMs: -1000 });
        await plantSession(user.id, 'not-due');

        await reapDueSessions();

        expect(await sessionHashesOf(user.id)).toEqual([hashToken('not-due')]);
    });
});

describe('sessionsList', () => {
    it('shows one row per session, marks the caller’s own, and never carries a credential', async () => {
        const user = await createUser();
        const family = new Types.ObjectId().toString();
        // Two live rows of one session: the shape two refreshes inside the grace window leave.
        await plantSession(user.id, 'duplicate-a', { familyId: family });
        await plantSession(user.id, 'duplicate-b', { familyId: family });
        await plantSession(user.id, 'another-device');

        const sessions = await sessionsList(user.id, requestWithCookie('duplicate-a'));

        expect(sessions).toHaveLength(2);
        expect(sessions.filter((session) => session.current)).toEqual([
            expect.objectContaining({ id: family })
        ]);
        expect(JSON.stringify(sessions)).not.toContain('duplicate');
        expect(JSON.stringify(sessions)).not.toContain(hashToken('duplicate-a'));
    });

    it('marks nothing current for a caller that sent no credential', async () => {
        const user = await createUser();
        await plantSession(user.id, 'device');

        const sessions = await sessionsList(user.id, requestWithCookie());

        expect(sessions.map((session) => session.current)).toEqual([false]);
    });
});

describe('verificationTokenRepository.issue', () => {
    it('replaces the previous link of a one-live kind, in one atomic write', async () => {
        const user = await createUser();
        await plantToken(user.id, 'password', 'first');
        await plantToken(user.id, 'password', 'second');

        const rows = await tokenRowsOf(user.id);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.tokenHash).toBe(hashToken('second'));
    });

    it('survives a race between upserts for one (account, kind)', async () => {
        const user = await createUser();

        const results = await raceN(RACE_SIZE, (index) =>
            plantToken(user.id, 'verify', `racer-${String(index)}`)
        );

        expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
        expect(await tokenRowsOf(user.id)).toHaveLength(1);
    });

    it('keeps every link of a many-live kind', async () => {
        const user = await createUser();
        await plantToken(user.id, 'delete', 'a');
        await plantToken(user.id, 'delete', 'b');
        await plantToken(user.id, 'mfa-challenge', 'c', { amr: ['pwd'] });
        await plantToken(user.id, 'mfa-challenge', 'd', { amr: ['google'] });

        expect(await tokenRowsOf(user.id)).toHaveLength(4);
    });

    it('does not carry an old `amr` onto a link that replaces it', async () => {
        const user = await createUser();
        await plantToken(user.id, 'password', 'with-amr', { amr: ['pwd'] });
        await plantToken(user.id, 'password', 'without-amr');

        const [row] = await tokenRowsOf(user.id);
        expect(row?.amr).toBeUndefined();
    });

    it('refuses a kind outside the closed vocabulary', async () => {
        const user = await createUser();

        await expect(
            verificationTokenRepository.issue({
                userId: user.id,
                // @ts-expect-error -- an unknown kind is the thing under test: the schema's enum must refuse it
                type: 'made-up',
                tokenHash: hashToken('x'),
                sentAt: new Date(),
                expiresAt: new Date(Date.now() + 1000)
            })
        ).rejects.toThrow();
    });
});

describe('verificationTokenRepository.findLive / spend', () => {
    it('finds a live token of the right kind by its digest, and refuses every other reading', async () => {
        const user = await createUser();
        await plantToken(user.id, 'password', 'live');
        await plantToken(user.id, 'delete', 'stale', { ttlMs: -1000 });
        const now = new Date();

        const live = await verificationTokenRepository.findLive('password', hashToken('live'), now);
        const wrongKind = await verificationTokenRepository.findLive(
            'delete',
            hashToken('live'),
            now
        );
        const expired = await verificationTokenRepository.findLive(
            'delete',
            hashToken('stale'),
            now
        );
        const unknown = await verificationTokenRepository.findLive('password', hashToken('x'), now);

        expect(live?.userId).toEqual(new Types.ObjectId(user.id));
        expect([wrongKind, expired, unknown]).toEqual([null, null, null]);
    });

    it('lets exactly one of many simultaneous spends win', async () => {
        const user = await createUser();
        await plantToken(user.id, 'password', 'one-shot');

        const results = await raceN(RACE_SIZE, () =>
            verificationTokenRepository.spend('password', hashToken('one-shot'))
        );

        expect(
            results.filter((result) => result.status === 'fulfilled' && result.value)
        ).toHaveLength(1);
    });

    it('will not spend a link as another kind', async () => {
        const user = await createUser();
        await plantToken(user.id, 'delete', 'shared');

        await expect(
            verificationTokenRepository.spend('password', hashToken('shared'))
        ).resolves.toBe(false);
        expect(await tokenRowsOf(user.id)).toHaveLength(1);
    });
});

describe('verificationTokenRepository.userIdsWithLive', () => {
    it('names the accounts holding a live token of the kind, and not an expired one', async () => {
        const live = await createUser({ email: 'live@example.com' });
        const lapsed = await createUser({ email: 'lapsed@example.com' });
        await plantToken(live.id, 'email-change-undo', 'live-undo');
        await plantToken(lapsed.id, 'email-change-undo', 'lapsed-undo', { ttlMs: -1000 });

        await expect(
            verificationTokenRepository.userIdsWithLive('email-change-undo', new Date())
        ).resolves.toEqual([live.id]);
    });
});

describe('verificationTokenRepository.lastSentAt / removeOfTypes', () => {
    it('reports the send time of the kind, and removes only the named kinds', async () => {
        const user = await createUser();
        const sentAt = new Date(Date.now() - 5000);
        await plantToken(user.id, 'verify', 'v', { sentAt });
        await plantToken(user.id, 'password', 'p');

        await expect(verificationTokenRepository.lastSentAt(user.id, 'verify')).resolves.toEqual(
            sentAt
        );
        await expect(
            verificationTokenRepository.lastSentAt(user.id, 'delete')
        ).resolves.toBeUndefined();

        await verificationTokenRepository.removeOfTypes(user.id, ['verify']);
        expect(await tokenTypesOf(user.id)).toEqual(['password']);
    });
});

describe('what leaves with the account', () => {
    it('exports a session as metadata: its handle, when it began and ends, never the credential', async () => {
        const user = await createUser();
        const startedAt = new Date(Date.now() - 3_600_000);
        await plantSession(user.id, 'exported-credential', {
            startedAt,
            lastUsedAt: new Date()
        });

        const exported = await exportSessions(user.id);

        expect(exported).toHaveLength(1);
        expect(exported[0]).toMatchObject({ createdAt: startedAt.toISOString() });
        expect(Object.keys(exported[0] ?? {}).toSorted()).toEqual([
            'createdAt',
            'expiration',
            'id',
            'lastUsedAt'
        ]);
        expect(JSON.stringify(exported)).not.toContain('exported-credential');
    });

    it('exports one entry per session, and only the active mode’s', async () => {
        const user = await createUser();
        const family = new Types.ObjectId().toString();
        await plantSession(user.id, 'dup-a', { familyId: family });
        await plantSession(user.id, 'dup-b', { familyId: family });
        await plantSession(user.id, 'other-mode', { mode: 'cookie' });

        expect(await exportSessions(user.id)).toHaveLength(1);
    });

    it('erases every session and one-time token of the account, and no one else’s', async () => {
        const gone = await createUser({ email: 'gone@example.com' });
        const kept = await createUser({ email: 'kept@example.com' });
        await plantSession(gone.id, 'gone-session');
        await plantToken(gone.id, 'password', 'gone-link');
        await plantSession(kept.id, 'kept-session');
        await plantToken(kept.id, 'password', 'kept-link');

        await withTransaction((session) => eraseSessionsAndTokens(gone.id, session));

        expect(await sessionRowsOf(gone.id)).toEqual([]);
        expect(await tokenRowsOf(gone.id)).toEqual([]);
        expect(await sessionRowsOf(kept.id)).toHaveLength(1);
        expect(await tokenRowsOf(kept.id)).toHaveLength(1);
    });

    it('erases the device label with its row, since it lives on the row', async () => {
        const user = await createUser();
        await sessionModel.create({
            userId: new Types.ObjectId(user.id),
            familyId: new Types.ObjectId(),
            mode: 'cookie',
            tokenHash: hashToken('labelled'),
            startedAt: new Date(),
            expiresAt: new Date(Date.now() + 60_000),
            purgeAt: new Date(Date.now() + 60_000),
            device: 'Firefox on Linux'
        });

        await withTransaction((session) => eraseSessionsAndTokens(user.id, session));

        expect(await sessionRowsOf(user.id)).toEqual([]);
    });
});
