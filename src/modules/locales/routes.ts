import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@kernel/middlewares/authorizations';
import { invalidateCache, setCache } from '@infrastructure/http/middlewares/cache';
import { getLocales, getLocaleDictionary } from './controllers/get-locales';
import { getLocaleMessages } from './controllers/get-locale-messages';
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
 * Express router for locale discovery and translation administration.
 *
 * ── The reads are public, and that is not an oversight ───────────────────────────────────────
 * No `getAuth` on any of the three GETs above the `router.use` below. An unauthenticated client
 * that has just failed to reach the API is exactly who needs a dictionary, and requiring a token
 * would make the copy unavailable in the one case it exists for. There is nothing to protect: it
 * is text written to be published.
 *
 * ── The writes are admin-only, and cache-invalidating ────────────────────────────────────────
 * Everything below the `router.use` changes what every visitor reads, so each write wraps in
 * `invalidateCache(['locales'])`. That call reaches shared Redis, where both the cached responses
 * and the tag sets live, so one call covers every app instance — there is no process-local tier
 * for a broadcast to invalidate. Clustered invalidation is already solved and needs no machinery
 * here.
 *
 * ── Route order ──────────────────────────────────────────────────────────────────────────────
 * `/:locale/messages` is declared before `/:locale` for readability only: a single-segment pattern
 * cannot match a two-segment path, so neither shadows the other whichever way round they go.
 */
export const router = Router();

/*
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

// GET /locales — which languages this deployment offers, and what each of them can do
router.get('/', publicLocaleCache, getLocales);

// GET /locales/:locale/messages — the client's dictionary, out of the database
router.get('/:locale/messages', publicLocaleCache, getLocaleMessages);

// GET /locales/:locale — the API's own dictionary, off the filesystem
router.get('/:locale', publicLocaleCache, getLocaleDictionary);

/*
 * Everything past here is an admin write on the dynamic tier — or, in one case, the read that
 * feeds the screen those writes are made from.
 */
router.use(getAuth, isAuth, isAdmin);

router.post('/', invalidateCache(['locales']), createLocale);
router.put('/:locale', invalidateCache(['locales']), updateLocale);
router.delete('/:locale', invalidateCache(['locales']), deleteLocale);

// Uncached on purpose — see the controller for why the editing screen is the one read that is not.
router.get('/:locale/entries', getLocaleEntries);
router.post('/:locale/entries', invalidateCache(['locales']), createLocaleEntry);
// PUT replaces, PATCH merges. See `controllers/write-locale-entries.ts`.
router.put('/:locale/entries', invalidateCache(['locales']), replaceLocaleEntries);
router.patch('/:locale/entries', invalidateCache(['locales']), mergeLocaleEntries);

router.put('/:locale/entries/:entryId', invalidateCache(['locales']), updateLocaleEntry);
router.delete('/:locale/entries/:entryId', invalidateCache(['locales']), deleteLocaleEntry);
