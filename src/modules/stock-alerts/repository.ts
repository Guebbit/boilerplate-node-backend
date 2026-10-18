/**
 * @module
 * Stock alert repository: the writes a request takes. Ask (idempotent), cancel, list a user's own,
 * find who waits for a product, and the two cleanups owed to an erased account and a deleted
 * product.
 *
 * See: docs/modules/stock-alerts.md
 */

import type { ClientSession } from 'mongoose';
import { stockAlertModel, applyStockAlertTransform } from './model';
import type { StockAlertDocument } from './model';
import {
    createRepository,
    toObjectId,
    type Repository,
    type Wire
} from '@infrastructure/persistence/create-repository';

/** The factory's CRUD surface plus the request's own writes. */
export const stockAlertRepository: Repository<StockAlertDocument, Wire<StockAlertDocument>> & {
    ask: (
        userId: string,
        productId: string
    ) => Promise<{ alert: StockAlertDocument; added: boolean }>;
    cancel: (userId: string, productId: string) => Promise<boolean>;
    findByUserId: (userId: string) => Promise<StockAlertDocument[]>;
    findByProductId: (productId: string, session?: ClientSession) => Promise<StockAlertDocument[]>;
    deleteById: (id: string, session: ClientSession) => Promise<boolean>;
    deleteByUserId: (userId: string, session?: ClientSession) => Promise<void>;
    deleteByProductId: (productId: string) => Promise<void>;
} = {
    ...createRepository<StockAlertDocument, Wire<StockAlertDocument>>(stockAlertModel, {
        transform: applyStockAlertTransform
    }),

    /**
     * Record the request, or find the one already there. `$setOnInsert` on an exact match of the
     * unique pair is the shape mongod resolves atomically, so asking twice (a double click) lands
     * one row and the second call says it was not new.
     */
    ask: (userId, productId) =>
        stockAlertModel
            .findOneAndUpdate(
                { userId: toObjectId(userId), productId: toObjectId(productId) },
                { $setOnInsert: { userId: toObjectId(userId), productId: toObjectId(productId) } },
                // `rawResult`-free: `includeResultMetadata` tells an insert from a match.
                // https://mongoosejs.com/docs/api/query.html#Query.prototype.findOneAndUpdate()
                { upsert: true, returnDocument: 'after', includeResultMetadata: true }
            )
            .exec()
            .then((result) => ({
                alert: result.value!,
                added: result.lastErrorObject?.updatedExisting === false
            })),

    /** Drop the caller's own request; `false` when they had none. */
    cancel: (userId, productId) =>
        stockAlertModel
            .deleteOne({ userId: toObjectId(userId), productId: toObjectId(productId) })
            .exec()
            .then(({ deletedCount }) => deletedCount > 0),

    /** A user's requests, newest first. */
    findByUserId: (userId) =>
        stockAlertModel
            .find({ userId: toObjectId(userId) })
            .sort({ createdAt: -1, _id: -1 })
            .exec(),

    /** Everyone waiting for one product. */
    findByProductId: (productId, session) =>
        stockAlertModel
            .find({ productId: toObjectId(productId) })
            .session(session ?? null)
            .exec(),

    /** Delete one request by id, in the caller's transaction; `false` when another run already did. */
    deleteById: (id, session) =>
        stockAlertModel
            .deleteOne({ _id: toObjectId(id) }, { session })
            .exec()
            .then(({ deletedCount }) => deletedCount > 0),

    /** What a hard account deletion owes: the requests go with the account. */
    deleteByUserId: (userId, session) =>
        stockAlertModel
            .deleteMany({ userId: toObjectId(userId) }, session ? { session } : undefined)
            .exec()
            .then(() => {
                // explicit void return
            }),

    /** What a product deletion owes: nobody can be told about a product that is gone. */
    deleteByProductId: (productId) =>
        stockAlertModel
            .deleteMany({ productId: toObjectId(productId) })
            .exec()
            .then(() => {
                // explicit void return
            })
};
