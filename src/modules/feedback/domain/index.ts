/**
 * @module
 * Feedback — domain layer: pure rules only, lint-guaranteed free of Express, Mongoose and every
 * tier. The status vocabulary is 4-wide, past the threshold that makes a `domain/` folder
 * mandatory, so it gets one rather than living inline in `service.ts`.
 *
 * See `docs/theory/domain-layer.md`.
 */

export { toFeedbackStatus, initialFeedbackStatus, shouldStampRespondedAt } from './lifecycle';
