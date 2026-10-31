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
import { isDuplicateKey } from '@infrastructure/persistence/mongo-errors';
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
 * A work notice for one recipient: the same body plus what the staff-only fields need. Always
 * `audience: 'staff'`, so a caller cannot write a staff row that reads as someone's own.
 */
export type NewStaffNotification = NewNotification &
    Required<Pick<NotificationDocument, 'tenantId' | 'sets' | 'dedupeKey' | 'expiresAt'>>;

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
    listOwn: (userId: string) => Promise<NotificationDocument[]>;
    listStaff: (userId: string, tenantId?: string) => Promise<NotificationDocument[]>;
    insertMany: (rows: NewNotification[]) => Promise<NotificationDocument[]>;
    insertStaffOnce: (row: NewStaffNotification) => Promise<NotificationDocument | null>;
    findSummary: (userId: string, dedupeKey: string) => Promise<NotificationDocument | null>;
    writeSummary: (
        row: NewStaffNotification,
        reappear: boolean
    ) => Promise<NotificationDocument | null>;
    deleteSummaries: (dedupeKey: string) => Promise<{ id: string; userId: string }[]>;
    findOwned: (userId: string, id: string) => Promise<NotificationDocument | null>;
    deleteOwned: (userId: string, id: string) => Promise<boolean>;
    deleteByUserId: (userId: string, session?: ClientSession) => Promise<void>;
    deleteByAudience: (
        userId: string,
        audience: NotificationDocument['audience']
    ) => Promise<string[]>;
    markAllRead: (userId: string, readAt: Date) => Promise<void>;
    trimToNewest: (
        userId: string,
        keep: number,
        audience: NotificationDocument['audience']
    ) => Promise<string[]>;
} = {
    ...createRepository<NotificationDocument, Wire<NotificationDocument>>(notificationModel, {
        transform: applyNotificationTransform
    }),

    /** A user's own messages, newest first. Bounded by the cap, so never paged. */
    listOwn: async (userId: string) =>
        notificationModel
            .find({ userId: toObjectId(userId), audience: 'own' })
            .sort({ createdAt: -1 })
            .exec(),

    /**
     * A user's work notices, newest first; of one shop when `tenantId` is given, of every shop
     * (the data export) when not. Bounded by the staff cap, so never paged.
     */
    listStaff: async (userId: string, tenantId?: string) =>
        notificationModel
            .find({
                userId: toObjectId(userId),
                audience: 'staff',
                ...(tenantId === undefined ? {} : { tenantId })
            })
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
     * Write a work notice unless the recipient already has one for this situation. `null` says it
     * was a repeat (a redelivered event, or a second door onto the same situation), which is how
     * the caller knows not to push or mail it again. The unique `{ userId, dedupeKey }` index is
     * the arbiter, so two racing writers cannot both win.
     */
    insertStaffOnce: async (row: NewStaffNotification) =>
        notificationModel
            .insertMany([{ ...row, audience: 'staff' }], { ordered: true })
            .then(([created]) => created)
            .catch((error: unknown) => {
                if (isDuplicateKey(error)) return null;
                throw error;
            }),

    /** A recipient's summary row for one code, if they have one. */
    findSummary: async (userId: string, dedupeKey: string) =>
        notificationModel.findOne({ userId: toObjectId(userId), dedupeKey }).exec(),

    /**
     * Write a summary row over the recipient's last one, or create it. `reappear` makes it unread
     * again (`readAt` removed): the caller says so when the count grew, so an unchanged count does
     * not nag a person who already read it. Upsert on the unique `{ userId, dedupeKey }` key.
     * https://mongoosejs.com/docs/api/model.html#Model.findOneAndUpdate()
     */
    writeSummary: async (row: NewStaffNotification, reappear: boolean) =>
        notificationModel
            .findOneAndUpdate(
                { userId: row.userId, dedupeKey: row.dedupeKey },
                {
                    $set: { ...row, audience: 'staff' },
                    ...(reappear ? { $unset: { readAt: 1 } } : {})
                },
                { upsert: true, returnDocument: 'after' }
            )
            .exec(),

    /** Remove every recipient's summary row for a code (its count fell to zero). */
    deleteSummaries: async (dedupeKey: string) => {
        const rows = await notificationModel
            .find({ audience: 'staff', dedupeKey })
            .select('_id userId')
            .lean()
            .exec();
        await notificationModel.deleteMany({ audience: 'staff', dedupeKey }).exec();
        return rows.map((row) => ({ id: String(row._id), userId: String(row.userId) }));
    },

    /** One row, but only if it is the caller's: `null` covers "no such row" and "someone else's". */
    findOwned: async (userId: string, id: string) =>
        notificationModel.findOne({ _id: toObjectId(id), userId: toObjectId(userId) }).exec(),

    /**
     * Delete one row, but only if it is the caller's. `false` covers "no such row" and "someone
     * else's" alike, so the service answers the same 404 for both.
     */
    deleteOwned: async (userId: string, id: string) =>
        notificationModel
            .deleteOne({ _id: toObjectId(id), userId: toObjectId(userId) })
            .exec()
            .then(({ deletedCount }) => deletedCount > 0),

    /** Empty a user's inbox: what a hard account deletion owes it (inside that deletion's own
     * transaction), and what "clear everything" does. */
    deleteByUserId: (userId: string, session?: ClientSession) =>
        notificationModel
            .deleteMany({ userId: toObjectId(userId) }, session ? { session } : undefined)
            .exec()
            .then(() => {
                // explicit void return
            }),

    /**
     * Delete one audience of a user's inbox, answering the ids removed so the stream can tell an
     * open tab exactly which rows left (the other audience stays on screen).
     */
    deleteByAudience: async (userId: string, audience: NotificationDocument['audience']) => {
        const owner = { userId: toObjectId(userId), audience };
        const rows = await notificationModel.find(owner).select('_id').lean().exec();
        if (rows.length === 0) return [];

        const ids = rows.map(({ _id }) => _id);
        await notificationModel.deleteMany({ ...owner, _id: { $in: ids } }).exec();
        return ids.map(String);
    },

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
     * Delete everything older than a user's newest `keep` rows of one audience, answering the ids
     * it removed. Each audience has its own cap, so a flood of work notices cannot push a person's
     * own messages out. The cap and the TTL are the things besides the owner and account deletion
     * that remove a row; the ids go back so the stream can tell an open tab.
     */
    trimToNewest: async (
        userId: string,
        keep: number,
        audience: NotificationDocument['audience']
    ) => {
        const owner = { userId: toObjectId(userId), audience };
        const excess = await notificationModel
            .find(owner)
            .sort({ createdAt: -1, _id: -1 })
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
