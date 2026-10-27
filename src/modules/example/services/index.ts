/**
 * @module
 * In any module: the service layer, the one door. A folder rather than one file because each
 * optional capability keeps its own file; the service object is what controllers call and what the
 * barrel publishes: every operation once, on the object, and nowhere by name.
 * Here: CRUD, the cover, and the status doors (publish, archive, unarchive).
 *
 * See: docs/theory/layers.md
 */

import { create, getById, removeById, search, updateById } from './crud';
import { setCover } from './cover';
import { archiveById, publishById, unarchiveById } from './transition';

/** The service's public surface — controllers call through this, never the bare functions. */
export const exampleService = {
    create,
    getById,
    search,
    updateById,
    removeById,
    setCover,
    publishById,
    archiveById,
    unarchiveById
};
