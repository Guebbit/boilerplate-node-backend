/**
 * @module
 * Express router for locale discovery and translation administration. The four GET reads are
 * public — an unauthenticated client is exactly who needs a dictionary — with only the
 * manifest taking `getAuth`, to include inactive languages for admins. Every write is gated per
 * mount (`getAuth, isAuthOrCredential, requirePermission(...)` spelled on each route, not a
 * shared `router.use`) and invalidates the shared Redis cache. Route order matters: `/apps`
 * and `/:locale/messages` must be declared before `/:locale`, or Express's first-match wins the
 * wildcard instead.
 */

import type { Request } from 'express';
import { Router } from 'express';
import { getAuth, isAuthOrCredential, requirePermission } from '@kernel/middlewares/authorizations';
import { invalidateCache, setCache } from '@infrastructure/http/middlewares/cache';
import { hasAnonymousReadScope } from '@kernel/access/query';
import { localeService } from './services';
import { getLocales, getLocaleDictionary } from './controllers/get-locales';
import { getLocaleMessages } from './controllers/get-locale-messages';
import { getLocaleApps } from './controllers/get-locale-apps';
import { createLocale } from './controllers/create-locale';
import { replaceLocale, updateLocale } from './controllers/update-locale';
import { deleteLocale } from './controllers/delete-locale';
import { getLocaleEntries, getAppLocaleEntries } from './controllers/get-locale-entries';
import {
    createLocaleEntry,
    updateLocaleEntry,
    replaceLocaleEntries,
    mergeLocaleEntries
} from './controllers/write-locale-entries';
import { deleteLocaleEntry } from './controllers/delete-locale-entry';
import { getEntityTranslations } from './controllers/get-entity-translations';
import {
    replaceEntityTranslations,
    upsertEntityTranslations
} from './controllers/write-entity-translations';

/**
 * Express router mounted at `/locales` — see the module header for the ordering and guard rules.
 */
export const router = Router();

/**
 * `/:locale/messages` answers per `?app=` — a dictionary is an app's own — so the app
 * is part of its cache key where the other public reads have none.
 */
const messagesCache = setCache(3600, {
    tags: ['locales'],
    keyParameters: ['app'],
    browserRevalidate: true,
    scopeKey: (request: Request) => hasAnonymousReadScope(localeService.callerScope, request.caller)
});

/**
 * The four public reads, all `browserRevalidate`: Redis still holds them for the hour, but the
 * flag tells the BROWSER to revalidate rather than answer from its own store. Without it, an
 * editor's save clears Redis but not the browser's copy, and reads as "saving is broken" — the
 * one failure this tier cannot afford. Costs one conditional request per read, answered `304`
 * when nothing changed.
 *
 * `scopeKey`: three of the four never see `request.authContext` at all (no `getAuth` mounted
 * ahead of them), so they are trivially guest-equivalent; `GET /locales` does take `getAuth`, for
 * the admin manifest that includes inactive languages — `hasAnonymousReadScope` is what tells
 * that caller apart from a guest and bypasses Redis for them, safe BY CONSTRUCTION.
 */
const publicLocaleCache = setCache(3600, {
    tags: ['locales'],
    keyParameters: [],
    browserRevalidate: true,
    scopeKey: (request: Request) => hasAnonymousReadScope(localeService.callerScope, request.caller)
});

// GET /locales — which languages this deployment offers, and what each of them can do.
// `getAuth` (and only that: no token still answers) so an admin's manifest can include the
// inactive rows a visitor is not offered. Before the cache, whose `scopeKey` reads that caller.
router.get('/', getAuth, publicLocaleCache, getLocales);

// GET /locales/apps — the keyspaces an entry can belong to. Before `/:locale`, see above.
router.get('/apps', publicLocaleCache, getLocaleApps);

// GET /locales/:locale/messages — the client's dictionary, out of the database
router.get('/:locale/messages', messagesCache, getLocaleMessages);

// GET /locales/:locale — the API's own dictionary, off the filesystem
router.get('/:locale', publicLocaleCache, getLocaleDictionary);

/*
 * Everything past here is an admin write on the dynamic tier — or, in one case, the read that
 * feeds the screen those writes are made from.
 */
// POST /locales — add a language.
router.post(
    '/',
    getAuth,
    isAuthOrCredential,
    requirePermission('create', 'Locale'),
    invalidateCache(['locales']),
    createLocale
);
// PUT /locales/:locale — replace the language.
router.put(
    '/:locale',
    getAuth,
    isAuthOrCredential,
    requirePermission('update', 'Locale'),
    invalidateCache(['locales']),
    replaceLocale
);

// PATCH /locales/:locale — merge the fields sent.
router.patch(
    '/:locale',
    getAuth,
    isAuthOrCredential,
    requirePermission('update', 'Locale'),
    invalidateCache(['locales']),
    updateLocale
);

// DELETE /locales/:locale — remove a language (the fallback one cannot be removed).
router.delete(
    '/:locale',
    getAuth,
    isAuthOrCredential,
    requirePermission('delete', 'Locale'),
    invalidateCache(['locales']),
    deleteLocale
);

// Uncached on purpose — see the controller for why the editing screen is the one read that is not.
// `update:Locale`, not `read:Locale`: every visitor holds the read key — it is how
// the shop renders in their language — and this is the EDITING screen, which lists every string
// including the ones no page has asked for yet.
router.get(
    '/:locale/entries',
    getAuth,
    isAuthOrCredential,
    requirePermission('update', 'Locale'),
    getLocaleEntries
);
// One app's slice of the entries is a resource of its own — the app is a path segment, so a
// PUT replaces exactly what the GET on the same URI lists. See `controllers/write-locale-entries.ts`.
router.get(
    '/:locale/apps/:app/entries',
    getAuth,
    isAuthOrCredential,
    requirePermission('update', 'Locale'),
    getAppLocaleEntries
);

// POST /locales/:locale/apps/:app/entries — add one entry to the app's slice.
router.post(
    '/:locale/apps/:app/entries',
    getAuth,
    isAuthOrCredential,
    requirePermission('create', 'Locale'),
    invalidateCache(['locales']),
    createLocaleEntry
);

// PUT /locales/:locale/apps/:app/entries — replace the app's whole slice.
router.put(
    '/:locale/apps/:app/entries',
    getAuth,
    isAuthOrCredential,
    requirePermission('update', 'Locale'),
    invalidateCache(['locales']),
    replaceLocaleEntries
);

// PATCH /locales/:locale/apps/:app/entries — merge the entries sent.
router.patch(
    '/:locale/apps/:app/entries',
    getAuth,
    isAuthOrCredential,
    requirePermission('update', 'Locale'),
    invalidateCache(['locales']),
    mergeLocaleEntries
);

// PUT /locales/:locale/apps/:app/entries/:entryId — change one entry.
router.put(
    '/:locale/apps/:app/entries/:entryId',
    getAuth,
    isAuthOrCredential,
    requirePermission('update', 'Locale'),
    invalidateCache(['locales']),
    updateLocaleEntry
);

// DELETE /locales/:locale/apps/:app/entries/:entryId — remove one entry.
router.delete(
    '/:locale/apps/:app/entries/:entryId',
    getAuth,
    isAuthOrCredential,
    requirePermission('delete', 'Locale'),
    invalidateCache(['locales']),
    deleteLocaleEntry
);

/*
 * The translator's door onto user-authored content — generic across whatever `translatables`
 * declares, `product` in V1. Uncached, like `/:locale/entries` above: this is the screen someone
 * is actively typing into. Its own cache tag (the registry-declared one, `products` today) is
 * invalidated inside the service, not by this route's middleware — the tag varies with
 * `entityType`, which `invalidateCache`'s fixed array cannot express.
 */
router.get(
    '/translations/:entityType/:id',
    getAuth,
    isAuthOrCredential,
    requirePermission('read', 'Translation'),
    getEntityTranslations
);
// PUT replaces (a stored locale not sent is deleted), PATCH merges.
router.put(
    '/translations/:entityType/:id',
    getAuth,
    isAuthOrCredential,
    requirePermission('update', 'Translation'),
    replaceEntityTranslations
);

// PATCH /locales/translations/:entityType/:id — merge the languages sent.
router.patch(
    '/translations/:entityType/:id',
    getAuth,
    isAuthOrCredential,
    requirePermission('update', 'Translation'),
    upsertEntityTranslations
);
