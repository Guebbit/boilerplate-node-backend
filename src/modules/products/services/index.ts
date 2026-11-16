/**
 * @module
 * Product service — all business logic for the catalogue entity, and the one place a controller
 * may call into. One file per flow, not one big file.
 *
 * `search.ts`/`read.ts` read the catalogue, `crud.ts` writes a product, `translated-write.ts`
 * writes it together with its translations, `remove.ts` deletes and restores, `lookups.ts` is the
 * door sibling modules read and cache through.
 */

import { zodProductCreateSchema, zodProductReplaceSchema, zodProductUpdateSchema } from '../model';
import { search, searchForCaller, facets } from './search';
import { callerScope, getById, getByIdForCaller, presentForCaller } from './read';
import { create, updateById, clearOmittedLocales } from './translated-write';
import { removeById, restoreById } from './remove';
import {
    findByIdRaw,
    findByIdRawScoped,
    isLive,
    findPublicById,
    findManyByIds,
    countPublic,
    listPublicPage,
    countListed,
    syncStockCache,
    titlesOf,
    titlesById
} from './lookups';

/** Whether a caller may read exact stock — published so a sibling's refusal can say the same. */
export { canSeeStock } from './stock-view';

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
    create,
    updateById,
    clearOmittedLocales,
    removeById,
    restoreById,
    /**
     * The barrel never publishes a presenter function, so a sibling that has to shape a product
     * for a response reaches the helper through the service.
     */
    presentForCaller,
    findByIdRaw,
    findByIdRawScoped,
    isLive,
    findPublicById,
    findManyByIds,
    countPublic,
    listPublicPage,
    countListed,
    syncStockCache,
    titlesOf,
    titlesById,
    /**
     * Same reason as `presentForCaller` just above: the update controller's factory needs these to
     * validate PUT/PATCH bodies against the contract plus its two refinements, and may not reach
     * `./model` directly.
     */
    zodProductCreateSchema,
    zodProductReplaceSchema,
    zodProductUpdateSchema
};
