/**
 * @module
 * `notificationsService` — the rules that make an inbox safe to lean on: it is the owner's alone
 * (another user's id is a 404, never a delete), it stays bounded by the cap, a change reaches the
 * owner's open tabs, and the account's deletion takes it with it.
 */

import { Types } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { notificationsService } from '@modules/notifications/services';
import { notificationRepository } from '@modules/notifications/repository';
import { createNotification } from '@modules/notifications/tests/factories';
import * as stream from '@modules/notifications/services/stream';
import type { NewNotification } from '@modules/notifications/repository';
import { NotificationCreatedPayloadSchema } from '@types';
import { withTransaction } from '@infrastructure/runtime/database';

/*
 * The live push is replaced by a recording wrapper around the real one, not spied on:
 * `jest.spyOn` cannot redefine the non-configurable property a CommonJS namespace import exposes
 * under the swc transform the mutation runs use.
 */
jest.mock('@modules/notifications/services/stream', () => {
    const actual = jest.requireActual<typeof import('@modules/notifications/services/stream')>(
        '@modules/notifications/services/stream'
    );
    return { __esModule: true, ...actual, publishToUser: jest.fn(actual.publishToUser) };
});

setupTestDb();

beforeEach(() => {
    jest.mocked(stream.publishToUser).mockClear();
});

/** The ids in a user's inbox, newest first. */
const inboxOf = (userId: string) =>
    notificationsService.notificationsList(userId).then(({ items }) => items.map(({ id }) => id));

/** A row for `userId`, aged `minutesAgo` so ordering never depends on insert speed. */
const aged = (userId: string, minutesAgo: number) =>
    createNotification({ userId, createdAt: new Date(Date.now() - minutesAgo * 60_000) });

describe('notificationsList', () => {
    it('answers the owner their own rows, newest first', async () => {
        const user = await createUser();
        const oldest = await aged(user.id, 30);
        const newest = await aged(user.id, 1);
        const middle = await aged(user.id, 10);

        await expect(inboxOf(user.id)).resolves.toEqual([
            String(newest._id),
            String(middle._id),
            String(oldest._id)
        ]);
    });

    it('never shows another user a row that is not theirs', async () => {
        const owner = await createUser({ email: 'owner@example.com' });
        const other = await createUser({ email: 'other@example.com' });
        await createNotification({ userId: owner.id });

        await expect(inboxOf(other.id)).resolves.toEqual([]);
    });

    it('answers an empty list, not an error, for a user with no notifications', async () => {
        const user = await createUser();

        await expect(notificationsService.notificationsList(user.id)).resolves.toEqual({
            items: []
        });
    });
});

describe('notificationsCreate', () => {
    it('writes one row per entry and answers them in the owner’s inbox', async () => {
        const first = await createUser({ email: 'first@example.com' });
        const second = await createUser({ email: 'second@example.com' });

        await notificationsService.notificationsCreate([makeRow(first.id), makeRow(second.id)]);

        await expect(inboxOf(first.id)).resolves.toHaveLength(1);
        await expect(inboxOf(second.id)).resolves.toHaveLength(1);
    });

    it('writes nothing, and does not fail, for an empty list', async () => {
        await expect(notificationsService.notificationsCreate([])).resolves.toBeUndefined();

        await expect(notificationRepository.count()).resolves.toBe(0);
    });

    it('pushes the new notification to its owner’s open streams, whole', async () => {
        const user = await createUser();
        const publish = jest.mocked(stream.publishToUser);

        await notificationsService.notificationsCreate([makeRow(user.id)]);

        expect(publish).toHaveBeenCalledWith(
            user.id,
            'notifications.created',
            expect.objectContaining({
                notification: expect.objectContaining({
                    code: 'notifications.cart-line-removed',
                    severity: 'warning'
                })
            })
        );
    });

    it.each<NewNotification>([
        makeRow('64b7f1a2c3d4e5f607182931'),
        {
            userId: new Types.ObjectId('64b7f1a2c3d4e5f607182931'),
            code: 'notifications.cart-merge-refused',
            severity: 'warning',
            params: { lines: [{ productId: 'p3', requested: 4, titles: { en: 'Green mug' } }] }
        }
    ])('pushes a payload the AsyncAPI contract accepts, for $code', async (row) => {
        const publish = jest.mocked(stream.publishToUser);

        await notificationsService.notificationsCreate([row]);

        const payload = publish.mock.calls[0]?.[2];
        expect(NotificationCreatedPayloadSchema.safeParse(payload).success).toBe(true);
    });

    it('tells the open tabs nothing about a trim when the inbox is within the cap', async () => {
        const user = await createUser();
        const publish = jest.mocked(stream.publishToUser);

        await notificationsService.notificationsCreate([makeRow(user.id)]);

        expect(publish).not.toHaveBeenCalledWith(
            user.id,
            'notifications.deleted',
            expect.anything()
        );
    });

    describe('the per-user cap', () => {
        // The default is 100; the suite's environment decides the real number, so read it back
        // from the behaviour rather than assuming it.
        const CAP = Number(process.env.NODE_NOTIFICATIONS_MAX_PER_USER ?? 100);

        it('keeps the newest N and deletes the oldest past it', async () => {
            const user = await createUser();
            const oldest = await aged(user.id, CAP + 10);
            for (let i = CAP - 1; i >= 1; i--) await aged(user.id, i + 1);

            // One past the cap: the oldest must go, and the newcomer stay.
            await notificationsService.notificationsCreate([makeRow(user.id), makeRow(user.id)]);

            const ids = await inboxOf(user.id);
            expect(ids).toHaveLength(CAP);
            expect(ids).not.toContain(String(oldest._id));
        });

        it('tells the owner’s open tabs which rows the cap removed', async () => {
            const user = await createUser();
            const oldest = await aged(user.id, CAP + 10);
            for (let i = CAP - 1; i >= 1; i--) await aged(user.id, i + 1);
            const publish = jest.mocked(stream.publishToUser);

            await notificationsService.notificationsCreate([makeRow(user.id)]);

            expect(publish).toHaveBeenCalledWith(user.id, 'notifications.deleted', {
                all: false,
                ids: [String(oldest._id)]
            });
        });

        it('trims each owner separately, not the inbox of whoever wrote last', async () => {
            const crowded = await createUser({ email: 'crowded@example.com' });
            const quiet = await createUser({ email: 'quiet@example.com' });
            for (let i = CAP; i >= 1; i--) await aged(crowded.id, i + 1);
            await aged(quiet.id, 5);

            await notificationsService.notificationsCreate([
                makeRow(crowded.id),
                makeRow(quiet.id)
            ]);

            await expect(inboxOf(crowded.id)).resolves.toHaveLength(CAP);
            await expect(inboxOf(quiet.id)).resolves.toHaveLength(2);
        });
    });
});

describe('notificationDelete', () => {
    it('deletes the owner’s own row and tells their open tabs', async () => {
        const user = await createUser();
        const row = await createNotification({ userId: user.id });
        const publish = jest.mocked(stream.publishToUser);

        const result = await notificationsService.notificationDelete(user.id, String(row._id));

        expect(result).toMatchObject({ success: true, message: 'Notification deleted.' });
        await expect(inboxOf(user.id)).resolves.toEqual([]);
        expect(publish).toHaveBeenCalledWith(user.id, 'notifications.deleted', {
            all: false,
            ids: [String(row._id)]
        });
    });

    it('answers 404 for a row that is someone else’s, and leaves it alone', async () => {
        const owner = await createUser({ email: 'owner@example.com' });
        const intruder = await createUser({ email: 'intruder@example.com' });
        const row = await createNotification({ userId: owner.id });
        const publish = jest.mocked(stream.publishToUser);

        const result = await notificationsService.notificationDelete(intruder.id, String(row._id));

        expect(result).toMatchObject({ success: false, status: 404 });
        expect(result.errors).toEqual([
            expect.objectContaining({ message: 'This notification was not found.' })
        ]);
        await expect(inboxOf(owner.id)).resolves.toEqual([String(row._id)]);
        expect(publish).not.toHaveBeenCalled();
    });

    it('answers the same 404 for an id that does not exist at all', async () => {
        const user = await createUser();

        const result = await notificationsService.notificationDelete(
            user.id,
            '000000000000000000000000'
        );

        expect(result).toMatchObject({ success: false, status: 404 });
    });
});

describe('notificationsDismissAll', () => {
    it('empties the owner’s inbox and no one else’s', async () => {
        const user = await createUser({ email: 'user@example.com' });
        const other = await createUser({ email: 'other@example.com' });
        await createNotification({ userId: user.id });
        await createNotification({ userId: user.id });
        const kept = await createNotification({ userId: other.id });

        const result = await notificationsService.notificationsDismissAll(user.id);

        expect(result).toMatchObject({ success: true, message: 'All notifications deleted.' });
        await expect(inboxOf(user.id)).resolves.toEqual([]);
        await expect(inboxOf(other.id)).resolves.toEqual([String(kept._id)]);
    });

    it('succeeds on an inbox that is already empty', async () => {
        const user = await createUser();

        await expect(notificationsService.notificationsDismissAll(user.id)).resolves.toMatchObject({
            success: true
        });
    });

    it('tells the owner’s open tabs the whole inbox went', async () => {
        const user = await createUser();
        const publish = jest.mocked(stream.publishToUser);

        await notificationsService.notificationsDismissAll(user.id);

        expect(publish).toHaveBeenCalledWith(user.id, 'notifications.deleted', {
            all: true,
            ids: []
        });
    });
});

describe('notificationsReadAll', () => {
    it('stamps every unread row of the owner and leaves other users’ rows unread', async () => {
        const user = await createUser({ email: 'user@example.com' });
        const other = await createUser({ email: 'other@example.com' });
        await createNotification({ userId: user.id });
        await createNotification({ userId: user.id });
        await createNotification({ userId: other.id });

        const result = await notificationsService.notificationsReadAll(user.id);

        expect(result.message).toBe('All notifications marked as read.');
        const { items: mine } = await notificationsService.notificationsList(user.id);
        expect(mine.every(({ readAt }) => readAt !== undefined)).toBe(true);
        const { items: theirs } = await notificationsService.notificationsList(other.id);
        expect(theirs.every(({ readAt }) => readAt === undefined)).toBe(true);
    });

    it('keeps the original readAt of a row that was already read', async () => {
        const user = await createUser();
        const readAt = new Date('2026-01-01T00:00:00.000Z');
        await createNotification({ userId: user.id, readAt });

        await notificationsService.notificationsReadAll(user.id);

        const { items } = await notificationsService.notificationsList(user.id);
        const [row] = items;
        expect(row?.readAt).toBe(readAt.toISOString());
    });

    it('tells the owner’s open tabs when it read them', async () => {
        const user = await createUser();
        const publish = jest.mocked(stream.publishToUser);

        await notificationsService.notificationsReadAll(user.id);

        expect(publish).toHaveBeenCalledWith(user.id, 'notifications.read', {
            readAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as string
        });
    });
});

describe('notificationsDeleteByUserId', () => {
    it('joins the caller’s transaction: an aborted deletion leaves the inbox alone', async () => {
        const user = await createUser();
        const row = await createNotification({ userId: user.id });

        await expect(
            withTransaction((session) =>
                notificationsService.notificationsDeleteByUserId(user.id, session).then(() => {
                    throw new Error('the rest of the deletion failed');
                })
            )
        ).rejects.toThrow('the rest of the deletion failed');

        await expect(inboxOf(user.id)).resolves.toEqual([String(row._id)]);
    });

    it('removes the erased account’s inbox inside the caller’s transaction, and only theirs', async () => {
        const gone = await createUser({ email: 'gone@example.com' });
        const stays = await createUser({ email: 'stays@example.com' });
        await createNotification({ userId: gone.id });
        const kept = await createNotification({ userId: stays.id });

        await withTransaction((session) =>
            notificationsService.notificationsDeleteByUserId(gone.id, session)
        );

        await expect(inboxOf(gone.id)).resolves.toEqual([]);
        await expect(inboxOf(stays.id)).resolves.toEqual([String(kept._id)]);
    });
});

/** A minimal row for `userId`, in the shape `notificationsCreate` takes. */
function makeRow(userId: string) {
    return {
        userId: new Types.ObjectId(userId),
        code: 'notifications.cart-line-removed' as const,
        severity: 'warning' as const,
        params: { productId: 'p1', titles: { en: 'Blue mug' } }
    };
}
