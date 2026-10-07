/**
 * @module
 * Returns — domain layer: pure rules only, lint-guaranteed free of Express, Mongoose and every
 * tier. See `docs/theory/domain-layer.md`.
 */

export {
    DECIDABLE_RETURN_STATUSES,
    RECEIVABLE_RETURN_STATUSES,
    CLOSABLE_RETURN_STATUSES,
    QUANTITY_HOLDING_RETURN_STATUSES,
    initialStatusFor
} from './lifecycle';
export type { ReturnStatus, ReturnReason } from './lifecycle';

export {
    returnableQuantities,
    returnableLinesOf,
    wireLines,
    checkRequestedLines
} from './quantities';
export type { ProductQuantity, LinesVerdict } from './quantities';

export { projectReturnStatus } from './status-projection';
export type { ProjectedReturn, ProjectedReturnStatus } from './status-projection';
