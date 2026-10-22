/**
 * @module
 * In any module: the service layer, the one door. A folder rather than one file because each
 * optional capability keeps its own file; `exampleService` is what controllers call and what the
 * barrel publishes: every operation once, on the object, and nowhere by name.
 * Here: CRUD, the cover, and the status transition door.
 *
 * See: docs/theory/layers.md
 */

import { create, getById, getPublishedById, removeById, search, updateById } from './crud';
import { setCover } from './cover';
import { transitionById } from './transition';

/** The service's public surface — controllers call through this, never the bare functions. */
export const exampleService = {
    create,
    getById,
    getPublishedById,
    search,
    updateById,
    removeById,
    setCover,
    transitionById
};
