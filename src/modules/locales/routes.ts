/**
 * @module
 * Express router for locale discovery and translation administration. The four GET reads are
 * public — an unauthenticated client is exactly who needs a dictionary — with only the manifest
 * taking `getAuth`, to include inactive languages for admins. Every write is admin-gated per mount
 * (`getAuth, isAuth, isAdmin` spelled on each route, not a shared `router.use`) and invalidates
 * the shared Redis cache. Route order matters: `/tenants` and `/:locale/messages` must be declared
 * before `/:locale`, or Express's first-match wins the wildcard instead.
 */

import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@kernel/middlewares/authorizations';
import { invalidateCache, setCache } from '@infrastructure/http/middlewares/cache';
import { getLocales, getLocaleDictionary } from './controllers/get-locales';
import { getLocaleMessages } from './controllers/get-locale-messages';
import { getLocaleTenants } from './controllers/get-locale-tenants';
import { createLocale, updateLocale } from './controllers/write-locales';
import { deleteLocale } from './controllers/delete-locale';
import { getLocaleEntries } from './controllers/get-locale-entries';
import {
    createLocaleEntry,
    updateLocaleEntry,
    replaceLocaleEntries,
    mergeLocaleEntries
} from './controllers/write-locale-entries';
import { deleteLocaleEntry } from './controllers/delete-locale-entry';

/** Express router mounted at `/locales` — see the module header for the ordering and guard rules. */
export const router = Router();

/**
 * The three public reads, all `browserRevalidate`: Redis still holds them for the hour, but the
 * flag tells the BROWSER to revalidate rather than answer from its own store. Without it, an
 * editor's save clears Redis but not the browser's copy, and reads as "saving is broken" — the
 * one failure this tier cannot afford. Costs one conditional request per read, answered `304`
 * when nothing changed.
 */
const publicLocaleCache = setCache(3600, {
    tags: ['locales'],
    keyParameters: [],
    browserRevalidate: true
});

// GET /locales — which languages this deployment offers, and what each of them can do.
// `getAuth` (and only that: no token still answers) so an admin's manifest can include the
// inactive rows a visitor is not offered. Before the cache, which scopes its key by caller.
router.get('/', getAuth, publicLocaleCache, getLocales);

// GET /locales/tenants — the keyspaces an entry can belong to. Before `/:locale`, see above.
router.get('/tenants', publicLocaleCache, getLocaleTenants);

// GET /locales/:locale/messages — the client's dictionary, out of the database
router.get('/:locale/messages', publicLocaleCache, getLocaleMessages);

// GET /locales/:locale — the API's own dictionary, off the filesystem
router.get('/:locale', publicLocaleCache, getLocaleDictionary);

/*
 * Everything past here is an admin write on the dynamic tier — or, in one case, the read that
 * feeds the screen those writes are made from.
 */
router.post('/', getAuth, isAuth, isAdmin, invalidateCache(['locales']), createLocale);
router.put('/:locale', getAuth, isAuth, isAdmin, invalidateCache(['locales']), updateLocale);
router.delete('/:locale', getAuth, isAuth, isAdmin, invalidateCache(['locales']), deleteLocale);

// Uncached on purpose — see the controller for why the editing screen is the one read that is not.
router.get('/:locale/entries', getAuth, isAuth, isAdmin, getLocaleEntries);
router.post(
    '/:locale/entries',
    getAuth,
    isAuth,
    isAdmin,
    invalidateCache(['locales']),
    createLocaleEntry
);
// PUT replaces, PATCH merges. See `controllers/write-locale-entries.ts`.
router.put(
    '/:locale/entries',
    getAuth,
    isAuth,
    isAdmin,
    invalidateCache(['locales']),
    replaceLocaleEntries
);
router.patch(
    '/:locale/entries',
    getAuth,
    isAuth,
    isAdmin,
    invalidateCache(['locales']),
    mergeLocaleEntries
);

router.put(
    '/:locale/entries/:entryId',
    getAuth,
    isAuth,
    isAdmin,
    invalidateCache(['locales']),
    updateLocaleEntry
);
router.delete(
    '/:locale/entries/:entryId',
    getAuth,
    isAuth,
    isAdmin,
    invalidateCache(['locales']),
    deleteLocaleEntry
);
