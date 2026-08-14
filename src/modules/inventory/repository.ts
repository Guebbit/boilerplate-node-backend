import { stockMovementModel, applyStockMovementTransform } from './model';
import type { IStockMovementDocument } from './model';
import {
    createBaseRepository,
    toObjectId,
    type IBaseRepository
} from '@infrastructure/persistence/base-repository';

/** How much history one read answers. The ledger is append-only; nobody pages a demo forever. */
const MOVEMENTS_PAGE_SIZE = 50;

/**
 * Stock Movement Repository
 * Standard CRUD via the base factory, plus the one read the ledger serves.
 *
 * The type is written out because Mongoose's generics are too large for TypeScript to serialize
 * an inferred one at an export boundary (TS7056) — the same reason `IBaseRepository` exists.
 */
export const stockMovementRepository: IBaseRepository<IStockMovementDocument> & {
    findLatest: (productId?: string) => Promise<IStockMovementDocument[]>;
} = {
    ...createBaseRepository<IStockMovementDocument>(stockMovementModel, {
        transform: applyStockMovementTransform
    }),

    /** The latest movements, newest first — all products, or one product's story. */
    findLatest: (productId?: string) =>
        stockMovementModel
            .find(productId === undefined ? {} : { productId: toObjectId(productId) })
            .sort({ createdAt: -1, _id: -1 })
            .limit(MOVEMENTS_PAGE_SIZE)
            .exec()
};
