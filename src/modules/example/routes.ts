/**
 * @module
 * In any module: the route table. Public routes sit ABOVE one `router.use(getAuth, isAuth)` and
 * everything below it is signed-in, so which half a route is in is decided by where it is typed.
 * Each mount states the one key its own action needs. Here: one open read, then the caller's
 * own examples (or everyone's, for a key that says so).
 *
 * See: docs/theory/request-flow.md
 */

import { Router } from 'express';
import { getAuth, isAuth, requirePermission } from '@kernel/middlewares/authorizations';
import { previewDraftLanguage } from '@kernel/middlewares/locale-preview';
import { noStore, privateNoCache } from '@infrastructure/http/middlewares/cache';
import { uploadLimiter } from '@infrastructure/http/middlewares/rate-limit';
import { idempotencyKey } from '@infrastructure/http/middlewares/idempotency';
import { upload } from '@infrastructure/http/middlewares/upload';
import { getExample } from './controllers/get-example';
import { getExamples } from './controllers/get-examples';
import { postExample } from './controllers/post-example';
import {
    postExampleArchive,
    postExamplePublish,
    postExampleUnarchive
} from './controllers/post-example-event';
import { replaceExample, updateExample } from './controllers/update-example';
import { deleteExample } from './controllers/delete-example';
import { putExampleCover } from './controllers/put-example-cover';
import { createExampleLimiter } from './rate-limits';

/** Express router for the example endpoints. */
export const router = Router();

/*
 * OPEN READ: a published example is anyone's, a draft its owner's. `getAuth` alone, no `isAuth`:
 * the caller is resolved if there is one and the service scopes the answer. Mounted above the
 * guard below rather than carrying an exemption.
 * `privateNoCache`: the answer varies by caller and by `Accept-Language`, and revalidation stops
 * an archived example being served.
 * `previewDraftLanguage` lets staff read the title in a draft language, uncached (all three reads).
 */
router.get('/:id', getAuth, previewDraftLanguage, privateNoCache, getExample);

/*
 * Everything below is signed-in, and POSITIONAL: the guard covers routes under it, not above.
 * `isAuth`, not `isAuthOrCredential`: the own-rows rules narrow by WHO is asking, and an API key
 * resolves to no session to narrow by.
 */
router.use(getAuth, isAuth);

/*
 * `search` is declared before `/:id` so the word cannot be read as an id. A POST answer is never
 * cached (`noStore`); the GET may be kept by the browser alone, since the answer depends on who asks.
 */
router.post(
    '/search',
    requirePermission('read', 'Example'),
    previewDraftLanguage,
    noStore,
    getExamples
);

// GET /examples — the caller's own examples, filtered by the query string.
router.get(
    '/',
    requirePermission('read', 'Example'),
    previewDraftLanguage,
    privateNoCache,
    getExamples
);

// `createExampleLimiter` first: a spent budget should not cost a database write, and the ledger
// records any JSON answer, so a 429 placed behind `idempotencyKey` would be replayed as the result.
router.post(
    '/',
    requirePermission('create', 'Example'),
    createExampleLimiter,
    idempotencyKey,
    postExample
);

// PUT /examples/:id — replace the whole example.
router.put('/:id', requirePermission('update', 'Example'), replaceExample);

// PATCH /examples/:id — change the fields sent.
router.patch('/:id', requirePermission('update', 'Example'), updateExample);

// POST /examples/:id/publish|archive|unarchive — one door per lifecycle event. No `If-Match`: the
// write is conditional on the status read, so of two racing moves exactly one lands. All three
// need `update`; the paths cannot collide with `/:id/cover`.
router.post('/:id/publish', requirePermission('update', 'Example'), postExamplePublish);
router.post('/:id/archive', requirePermission('update', 'Example'), postExampleArchive);
router.post('/:id/unarchive', requirePermission('update', 'Example'), postExampleUnarchive);

// DELETE /examples/:id — remove the example.
router.delete('/:id', requirePermission('delete', 'Example'), deleteExample);

/*
 * The cover upload. `uploadLimiter` and `upload.image()` run before the controller; the
 * limiter first, so a refused request never writes a file.
 */
router.put(
    '/:id/cover',
    requirePermission('update', 'Example'),
    uploadLimiter,
    upload.image(),
    putExampleCover
);
