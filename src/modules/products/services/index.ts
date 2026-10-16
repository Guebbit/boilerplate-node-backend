/**
 * @module
 * Product service — all business logic for the catalogue entity, and the one place a controller
 * may call into. A folder rather than one file because it passed ~800 lines; see
 * `docs/theory/layers.md`.
 *
 * `search.ts`/`read.ts` read the catalogue, `crud.ts` writes a product, `translated-write.ts`
 * writes it together with its translations, `remove.ts` deletes and restores, `lookups.ts` is the
 * door sibling modules read and cache through.
 */

import type { Caller, Product } from '@types';
import { zodProductCreateSchema, zodProductReplaceSchema, zodProductUpdateSchema } from '../model';
import type { ProductDocument } from '../model';
import { presentProduct } from '../presenter';
import { canSeeStock, redactStock } from './stock-view';
import { search, searchForCaller, facets } from './search';
import { callerScope, getById, getByIdForCaller, getAdmin } from './read';
import { create, updateById, clearOmittedLocales } from './translated-write';
import { remove, removeById, restoreById } from './remove';
import {
    findByIdRaw,
    findPublicById,
    findManyByIds,
    countPublic,
    syncStockCache,
    titlesOf,
    titlesById
} from './lookups';

/** Whether a caller may read exact stock — published so a sibling's refusal can say the same. */
export { canSeeStock } from './stock-view';

/**
 * A product document as the wire shape `caller` may see — the counters only for a holder of
 * `read:StockLevel`, the `inStock`/`lowStock` flags for everyone.
 *
 * @param document - the stored product
 * @param caller - `request.caller`, or `undefined` for a path with no request (sees no counters)
 */
const toProduct = (document: ProductDocument, caller?: Caller): Product =>
    redactStock(presentProduct(document), canSeeStock(caller));

/**
 * The service's public surface — every controller and cross-module caller goes through this.
 * `create` and `updateById` write the translation rows with the product, so there is no door
 * that moves a title without its fallback-locale row.
 */
export const productService = {
    callerScope,
    search,
    searchForCaller,
    facets,
    getById,
    getByIdForCaller,
    getAdmin,
    create,
    updateById,
    clearOmittedLocales,
    remove,
    removeById,
    restoreById,
    // A controller may not reach `./presenter` directly (the persistence wall), so the shaping
    // helper it needs to build a response rides through the service instead.
    toProduct,
    findByIdRaw,
    findPublicById,
    findManyByIds,
    countPublic,
    syncStockCache,
    titlesOf,
    titlesById,
    // Same reason as `toProduct` just above: the update controller's factory needs these to
    // validate PUT/PATCH bodies against the contract plus its two refinements, and may not reach `./model`
    // directly.
    zodProductCreateSchema,
    zodProductReplaceSchema,
    zodProductUpdateSchema
};
