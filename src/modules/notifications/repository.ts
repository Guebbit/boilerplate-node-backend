/**
 * @module
 * Notification repository — the repository factory's standard CRUD, plus the writes an inbox
 * actually takes. Every one is keyed by `userId`: no caller reads or removes a row without naming
 * whose it is, which is what makes "another user's id is a 404" a property of the query rather
 * than of a check someone has to remember.
 *
 * See: docs/modules/notifications.md
 */

import type { ClientSession } from 'mongoose';
import { notificationModel, applyNotificationTransform } from './model';
import type { NotificationDocument } from './model';
import {
    createRepository,
    toObjectId,
    type Repository,
    type Wire
} from '@infrastructure/persistence/create-repository';

/** What a caller supplies for a new row; everything else is the schema's. */
export type NewNotification = Pick<NotificationDocument, 'userId' | 'code' | 'params' | 'severity'>;

/**
 * The type is written out because Mongoose's generics are too large for TypeScript to serialize
 * an inferred one at an export boundary (TS7056) — the same reason `Repository` exists.
 *
 * Every method is `async` because each assembles its filter with `toObjectId`, which throws on a
 * malformed id — see `create-repository.ts` for why that decides between a 4xx and a 500.
 */
export const notificationRepository: Repository<
    NotificationDocument,
    Wire<NotificationDocument>
> & {
    listByUserId: (userId: string) => Promise<NotificationDocument[]>;
    insertMany: (rows: NewNotification[]) => Promise<NotificationDocument[]>;
    deleteOwned: (userId: string, id: string) => Promise<boolean>;
    deleteAllOwned: (userId: string) => Promise<void>;
    deleteByUserId: (userId: string, session?: ClientSession) => Promise<void>;
    markAllRead: (userId: string, readAt: Date) => Promise<void>;
    trimToNewest: (userId: string, keep: number) => Promise<string[]>;
} = {
    ...createRepository<NotificationDocument, Wire<NotificationDocument>>(notificationModel, {
        transform: applyNotificationTransform
    }),

    /** A user's whole inbox, newest first. Bounded by the cap, so never paged. */
    listByUserId: async (userId: string) =>
        notificationModel
            .find({ userId: toObjectId(userId) })
            .sort({ createdAt: -1 })
            .exec(),

    /**
     * Write several rows in one round trip. A bulk product delete writes one row per affected
     * user, so this is the path that has to stay one query. `ordered: false` lets a bad row fail
     * alone instead of abandoning the ones behind it.
     * https://mongoosejs.com/docs/api/model.html#Model.insertMany()
     */
    insertMany: async (rows: NewNotification[]) =>
        notificationModel.insertMany(rows, { ordered: false }),

    /**
     * Delete one row, but only if it is the caller's. `false` covers "no such row" and "someone
     * else's" alike, so the service answers the same 404 for both.
     */
    deleteOwned: async (userId: string, id: string) =>
        notificationModel
            .deleteOne({ _id: toObjectId(id), userId: toObjectId(userId) })
            .exec()
            .then(({ deletedCount }) => deletedCount > 0),

    /** Empty a user's inbox. */
    deleteAllOwned: async (userId: string) =>
        notificationModel
            .deleteMany({ userId: toObjectId(userId) })
            .exec()
            .then(() => {
                // explicit void return
            }),

    /** What a hard account deletion owes the inbox, inside that deletion's own transaction. */
    deleteByUserId: (userId: string, session?: ClientSession) =>
        notificationModel
            .deleteMany({ userId: toObjectId(userId) }, session ? { session } : undefined)
            .exec()
            .then(() => {
                // explicit void return
            }),

    /** Stamp every still-unread row of a user. Already-read rows keep their original `readAt`. */
    markAllRead: async (userId: string, readAt: Date) =>
        notificationModel
            .updateMany(
                { userId: toObjectId(userId), readAt: { $exists: false } },
                { $set: { readAt } }
            )
            .exec()
            .then(() => {
                // explicit void return
            }),

    /**
     * Delete everything older than a user's newest `keep` rows, answering the ids it removed.
     * The cap is the one thing besides the owner and account deletion that removes a row; the ids
     * go back so the stream can tell an open tab.
     */
    trimToNewest: async (userId: string, keep: number) => {
        const owner = { userId: toObjectId(userId) };
        const excess = await notificationModel
            .find(owner)
            .sort({ createdAt: -1 })
            .skip(keep)
            .select('_id')
            .lean()
            .exec();
        if (excess.length === 0) return [];

        const ids = excess.map(({ _id }) => _id);
        await notificationModel.deleteMany({ ...owner, _id: { $in: ids } }).exec();
        return ids.map(String);
    }
};
