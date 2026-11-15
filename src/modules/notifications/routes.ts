/**
 * @module
 * The notifications route table.
 *
 * An inbox is somebody's, so every route needs only a signed-in account and is scoped to the
 * caller by the service; the module declares no permission rule. One thing can silently break:
 * the stream authenticates by refresh cookie, not by header, so it sits above the bearer chain.
 *
 * @see docs/modules/notifications.md
 */

import { Router } from 'express';
import { getAuth, isAuth, requireSessionViaCookie } from '@kernel/middlewares/authorizations';
import { requireAllowedOrigin } from '@infrastructure/http/middlewares/origin';
import { getNotifications } from './controllers/get-notifications';
import { getNotificationsStream } from './controllers/get-notifications-stream';
import { postReadAll } from './controllers/post-read-all';
import { deleteNotifications } from './controllers/delete-notifications';
import { getNotification } from './controllers/get-notification';
import { deleteNotification } from './controllers/delete-notification';

/** Express router for notification operations, mounted at /notifications. */
export const router = Router();

// GET /notifications/stream — the live SSE stream, opened by the browser's `EventSource`.
// The cookie alone authenticates this stream, so a page on another origin must not open it.
router.get('/stream', requireAllowedOrigin, requireSessionViaCookie(), getNotificationsStream);

// Everything below is an ordinary bearer-authenticated call.
router.use(getAuth, isAuth);

// GET /notifications
router.get('/', getNotifications);

// POST /notifications/read-all — the bell opened: the badge goes to zero, the messages stay.
router.post('/read-all', postReadAll);

// DELETE /notifications — empty the inbox. Membership changes, so it is a delete; `read-all` above
// only moves `readAt`, so it stays an action.
router.delete('/', deleteNotifications);

// GET /notifications/:id — one of the caller's own. Below the literal paths, so none is read as an id.
router.get('/:id', getNotification);

// DELETE /notifications/:id — one of the caller's own.
router.delete('/:id', deleteNotification);
