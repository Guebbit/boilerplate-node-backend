/**
 * @module
 * In any module: the domain layer — pure rules only, lint-guaranteed free of Express, Mongoose
 * and every tier. A module gets a `domain/` folder once it has a closed vocabulary with rules of
 * its own, as the status lifecycle here.
 *
 * See: docs/theory/domain-layer.md
 */

export {
    canTransition,
    fitsBodyLength,
    initialExampleStatus,
    isPublished,
    shouldStampPublishedAt
} from './lifecycle';
