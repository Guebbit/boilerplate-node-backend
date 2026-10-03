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
 * PUBLIC: reading a published example needs no account. `getAuth` still runs, so a signed-in
 * caller is resolved, but nothing here refuses an anonymous one. Mounted above the guard below
 * rather than carrying an exemption.
 */
router.get('/published/:id', getAuth, privateNoCache, getPublishedExample);

/*
 * Everything below is signed-in, and POSITIONAL: the guard covers routes under it, not above.
 * `isAuth`, not `isAuthOrCredential`: the `self` keys narrow by WHO is asking, and an API key
 * resolves to no session to narrow by.
 */
router.use(getAuth, isAuth);

/*
 * `search` is declared before `/:id` so the word cannot be read as an id. A POST answer is never
 * cached (`noStore`); the GET may be kept by the browser alone, since the answer depends on who asks.
 */
router.post('/search', requirePermission('examples.self.read'), noStore, getExamples);
router.get('/', requirePermission('examples.self.read'), privateNoCache, getExamples);

// `createExampleLimiter` first: a spent budget should not cost a database write.
router.post('/', requirePermission('examples.self.create'), createExampleLimiter, postExample);

router.get('/:id', requirePermission('examples.self.read'), privateNoCache, getExample);
router.put('/:id', requirePermission('examples.self.update'), replaceExample);
router.patch('/:id', requirePermission('examples.self.update'), updateExample);
router.delete('/:id', requirePermission('examples.self.delete'), deleteExample);

/*
 * The cover upload. `uploadLimiter` and `upload.image()` run before the controller; the
 * limiter first, so a refused request never writes a file.
 */
router.put(
    '/:id/cover',
    requirePermission('examples.self.update'),
    uploadLimiter,
    upload.image(),
    putExampleCover
);
