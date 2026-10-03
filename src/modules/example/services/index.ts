/**
 * @module
 * In any module: the service layer, the one door. A folder rather than one file because each
 * optional capability keeps its own file (`./cover.ts`, `./notify.ts`); `exampleService` is what
 * controllers call, and the names below are also what the barrel publishes.
 *
 * See: docs/theory/layers.md
 */

import { create, getById, getPublishedById, remove, search, update } from './crud';
import { setCover } from './cover';

export { create, getById, getPublishedById, remove, search, update } from './crud';
export { setCover } from './cover';

/** The service's public surface — controllers call through this, never the bare functions. */
export const exampleService = {
    create,
    getById,
    getPublishedById,
    search,
    update,
    remove,
    setCover
};
