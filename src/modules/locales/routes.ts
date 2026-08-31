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

/**
 * @module
 * Express router for locale discovery and translation administration.
 *
 * ── The reads are public, and that is not an oversight ───────────────────────────────────────
 * None of the four GETs REQUIRE a token. An unauthenticated client that has just failed to reach
 * the API is exactly who needs a dictionary, and requiring one would make the copy unavailable in
 * the one case it exists for. There is nothing to protect: it is text written to be published. The
 * manifest alone takes `getAuth` — reading the role without demanding it — because an admin's copy
 * also lists inactive languages.
 *
 * ── The writes are admin-only, and cache-invalidating ────────────────────────────────────────
 * Every write changes what every visitor reads, so each one wraps in `invalidateCache(['locales'])`.
 * That call reaches shared Redis, where both the cached responses and the tag sets live, so one
 * call covers every app instance — there is no process-local tier for a broadcast to invalidate.
 * Clustered invalidation is already solved and needs no machinery here.
 *
 * ── Each admin route names its own guard ─────────────────────────────────────────────────────
 * `getAuth, isAuth, isAdmin` is spelled on every admin mount rather than set once by a `router.use`.
 * The public reads have to be declared first (see the ordering note below), so a single gate could
 * only sit mid-file, where it guards by line number: a route appended above it would be public
 * without looking wrong. Spelled per route, a mount carries its own policy and cannot drift.
 *
 * ── Route order ──────────────────────────────────────────────────────────────────────────────
 * `/tenants` MUST be declared before `/:locale`: both are one segment, and Express takes the first
 * match, so the other way round `GET /locales/tenants` would be a dictionary lookup for a language
 * called "tenants". `/:locale/messages` before `/:locale` is readability only — a single-segment
 * pattern cannot match a two-segment path.
 */

/** Express router mounted at `/locales` — see the module header for the ordering and guard rules. */
export const router = Router();

/**
 * The three public reads, all `browserRevalidate`.
 *
 * Redis still holds them for the hour and still drops them on any write below. What the flag
 * changes is what a BROWSER is told: revalidate rather than answer from your own store. Without
 * it a translator edits a string, reloads, and sees the old one for up to an hour — the write
 * cleared Redis, and could not reach the copy already in their browser. That reads as "saving is
 * broken", and it is the one failure this whole tier cannot afford, because the people it was
 * built for have no other way to tell.
 *
 * The cost is a conditional request per read, answered `304` with no body while nothing has
 * changed. Cheap, and paid only by clients that already hold a copy.
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
