/**
 * @module
 * Express router for locale discovery and translation administration. The four GET reads are
 * public — an unauthenticated client is exactly who needs a dictionary — with only the
 * manifest taking `getAuth`, to include inactive languages for admins. Every write is gated per
 * mount (`getAuth, isAuthOrCredential, requirePermission(...)` spelled on each route, not a
 * shared `router.use`) and invalidates the shared Redis cache. Route order matters: `/tenants`
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
import { getLocaleTenants } from './controllers/get-locale-tenants';
import { createLocale } from './controllers/create-locale';
import { replaceLocale, updateLocale } from './controllers/update-locale';
import { deleteLocale } from './controllers/delete-locale';
import { getLocaleEntries, getTenantLocaleEntries } from './controllers/get-locale-entries';
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
    scopeKey: (request: Request) =>
        hasAnonymousReadScope(localeService.callerScope, request.authContext)
});

// GET /locales — which languages this deployment offers, and what each of them can do.
// `getAuth` (and only that: no token still answers) so an admin's manifest can include the
// inactive rows a visitor is not offered. Before the cache, whose `scopeKey` reads that caller.
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
// POST /locales — add a language.
router.post(
    '/',
    getAuth,
    isAuthOrCredential,
    requirePermission('locales.any.create'),
    invalidateCache(['locales']),
    createLocale
);
// PUT /locales/:locale — replace the language.
router.put(
    '/:locale',
    getAuth,
    isAuthOrCredential,
    requirePermission('locales.any.update'),
    invalidateCache(['locales']),
    replaceLocale
);

// PATCH /locales/:locale — merge the fields sent.
router.patch(
    '/:locale',
    getAuth,
    isAuthOrCredential,
    requirePermission('locales.any.update'),
    invalidateCache(['locales']),
    updateLocale
);

// DELETE /locales/:locale — remove a language (the fallback one cannot be removed).
router.delete(
    '/:locale',
    getAuth,
    isAuthOrCredential,
    requirePermission('locales.any.delete'),
    invalidateCache(['locales']),
    deleteLocale
);

// Uncached on purpose — see the controller for why the editing screen is the one read that is not.
// `locales.any.update`, not `locales.self.read`: every visitor holds the read key — it is how
// the shop renders in their language — and this is the EDITING screen, which lists every string
// including the ones no page has asked for yet.
router.get(
    '/:locale/entries',
    getAuth,
    isAuthOrCredential,
    requirePermission('locales.any.update'),
    getLocaleEntries
);
// One tenant's slice of the entries is a resource of its own — the tenant is a path segment, so a
// PUT replaces exactly what the GET on the same URI lists. See `controllers/write-locale-entries.ts`.
router.get(
    '/:locale/tenants/:tenant/entries',
    getAuth,
    isAuthOrCredential,
    requirePermission('locales.any.update'),
    getTenantLocaleEntries
);

// POST /locales/:locale/tenants/:tenant/entries — add one entry to the tenant's slice.
router.post(
    '/:locale/tenants/:tenant/entries',
    getAuth,
    isAuthOrCredential,
    requirePermission('locales.any.create'),
    invalidateCache(['locales']),
    createLocaleEntry
);

// PUT /locales/:locale/tenants/:tenant/entries — replace the tenant's whole slice.
router.put(
    '/:locale/tenants/:tenant/entries',
    getAuth,
    isAuthOrCredential,
    requirePermission('locales.any.update'),
    invalidateCache(['locales']),
    replaceLocaleEntries
);

// PATCH /locales/:locale/tenants/:tenant/entries — merge the entries sent.
router.patch(
    '/:locale/tenants/:tenant/entries',
    getAuth,
    isAuthOrCredential,
    requirePermission('locales.any.update'),
    invalidateCache(['locales']),
    mergeLocaleEntries
);

// PUT /locales/:locale/entries/:entryId — change one entry.
router.put(
    '/:locale/entries/:entryId',
    getAuth,
    isAuthOrCredential,
    requirePermission('locales.any.update'),
    invalidateCache(['locales']),
    updateLocaleEntry
);

// DELETE /locales/:locale/entries/:entryId — remove one entry.
router.delete(
    '/:locale/entries/:entryId',
    getAuth,
    isAuthOrCredential,
    requirePermission('locales.any.delete'),
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
    requirePermission('translations.any.read'),
    getEntityTranslations
);
// PUT replaces (a stored locale not sent is deleted), PATCH merges.
router.put(
    '/translations/:entityType/:id',
    getAuth,
    isAuthOrCredential,
    requirePermission('translations.any.update'),
    replaceEntityTranslations
);

// PATCH /locales/translations/:entityType/:id — merge the languages sent.
router.patch(
    '/translations/:entityType/:id',
    getAuth,
    isAuthOrCredential,
    requirePermission('translations.any.update'),
    upsertEntityTranslations
);
