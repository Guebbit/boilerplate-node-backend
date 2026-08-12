/**
 * Feedback — public barrel.
 *
 * The only surface a sibling module may import. See `modules/products/index.ts` for the rule.
 *
 * Nothing imports it today: a contact request is a leaf, related to no other domain. The barrel
 * exists anyway because this module owns a collection, and the first sibling that needs to read it
 * should find a surface rather than a reason to reach for an internal.
 */

export { feedbackRequestService } from './service';
export { feedbackRequestRepository } from './repository';
export { feedbackRequestModel } from './model';
export type { IFeedbackRequestDocument } from './model';
