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
import { zodProductReplaceSchema, zodProductUpdateSchema } from '../model';
import type { ProductDocument } from '../model';
import { presentProduct } from '../presenter';
import { canSeeStock, redactStock } from './stock-view';
import { validateCreateData, validateUpdateData } from './validation';
import { search, searchViewed, facets } from './search';
import { callerScope, getById, getByIdViewed, getAdmin } from './read';
import { create, update, updateById } from './crud';
import { writeCreate, writeUpdate, clearOmittedLocales } from './translated-write';
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

/*
 * Every operation is published by name as well as through the object below: the suites drive
 * them directly, and the barrel's surface must not shrink when a file moves.
 */
export { validateCreateData, validateUpdateData } from './validation';
export { search, searchViewed } from './search';
export { callerScope, getById, getByIdViewed, getAdmin } from './read';
export { create, update, updateById } from './crud';
export { writeCreate, writeUpdate, clearOmittedLocales } from './translated-write';
export { remove, removeById, restoreById } from './remove';

/**
 * A product document as the wire shape `caller` may see — the counters only for a holder of
 * `inventory.any.read`, the `inStock`/`lowStock` flags for everyone.
 *
 * @param document - the stored product
 * @param caller - `request.caller`, or `undefined` for a path with no request (sees no counters)
 */
const toProduct = (document: ProductDocument, caller?: Caller): Product =>
    redactStock(presentProduct(document), canSeeStock(caller));

/** The service's public surface — every controller and cross-module caller goes through this. */
export const productService = {
    validateCreateData,
    validateUpdateData,
    callerScope,
    search,
    searchViewed,
    facets,
    getById,
    getByIdViewed,
    getAdmin,
    create,
    update,
    updateById,
    writeCreate,
    writeUpdate,
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
    // validate PUT/PATCH bodies with the field-named price message, and may not reach `./model`
    // directly.
    zodProductReplaceSchema,
    zodProductUpdateSchema
};
