/**
 * @module
 * In any module: the route table. Public routes sit ABOVE one `router.use(getAuth, isAuth)` and
 * everything below it is signed-in, so which half a route is in is decided by where it is typed.
 * Each mount states the one key its own action needs. Here: one public read, then the caller's
 * own examples (or everyone's, for a key that says so).
 *
 * See: docs/theory/request-flow.md
 */

import { Router } from 'express';
import { getAuth, isAuth, requirePermission } from '@kernel/middlewares/authorizations';
import { noStore, privateNoCache } from '@infrastructure/http/middlewares/cache';
import { uploadLimiter } from '@infrastructure/http/middlewares/rate-limit';
import { upload } from '@infrastructure/http/middlewares/upload';
import { getPublishedExample, getExample } from './controllers/get-example';
import { getExamples } from './controllers/get-examples';
import { postExample } from './controllers/post-example';
import { replaceExample, updateExample } from './controllers/update-example';
import { deleteExample } from './controllers/delete-example';
import { putExampleCover } from './controllers/put-example-cover';
import { createExampleLimiter } from './rate-limits';

/** Express router for the example endpoints. */
export const router = Router();

/*
 * PUBLIC: the answer is the same for everyone, so no credential is read. Mounted above the guard
 * below rather than carrying an exemption.
 * `privateNoCache`: the title varies by `Accept-Language`, and revalidation stops an archived
 * example being served.
 */
router.get('/published/:id', privateNoCache, getPublishedExample);

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
router.post('/search', requirePermission('read', 'Example'), noStore, getExamples);

// GET /examples — the caller's own examples, filtered by the query string.
router.get('/', requirePermission('read', 'Example'), privateNoCache, getExamples);

// `createExampleLimiter` first: a spent budget should not cost a database write.
router.post('/', requirePermission('create', 'Example'), createExampleLimiter, postExample);

// GET /examples/:id — one example. `privateNoCache`: the browser may keep it, revalidated.
router.get('/:id', requirePermission('read', 'Example'), privateNoCache, getExample);

// PUT /examples/:id — replace the whole example.
router.put('/:id', requirePermission('update', 'Example'), replaceExample);

// PATCH /examples/:id — change the fields sent.
router.patch('/:id', requirePermission('update', 'Example'), updateExample);

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
