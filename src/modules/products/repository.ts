import { productModel, applyProductTransform } from './model';
import type { IProductDocument } from './model';
import {
    createBaseRepository,
    type IBaseRepository
} from '@infrastructure/persistence/base-repository';

/**
 * Product Repository
 * Standard CRUD via the base factory, plus the catalogue's own query rules.
 *
 * The type is written out because Mongoose's generics are too large for TypeScript to serialize
 * an inferred one at an export boundary (TS7056) — the same reason `IBaseRepository` exists.
 */
export const productRepository: IBaseRepository<IProductDocument> & {
    publicScope: () => Record<string, unknown>;
} = {
    ...createBaseRepository<IProductDocument>(productModel, {
        transform: applyProductTransform,
        searchable: {
            objectIds: { id: '_id' },
            text: ['title', 'description'],
            arrayRegex: { category: 'categories', tag: 'tags' },
            ranges: { price: { min: 'minPrice', max: 'maxPrice' } }
        }
    }),

    /**
     * What a non-admin caller is allowed to see: published, not soft-deleted.
     *
     * Lives here rather than in the service because it is a rule about which *rows* exist for a
     * given audience — spread it into any filter (`{ ...publicScope(), price: … }`). Admin
     * callers pass nothing, which is how they see inactive and soft-deleted rows.
     */
    publicScope: (): Record<string, unknown> => ({
        active: true,
        deletedAt: { $exists: false }
    })
};
