/**
 * @module
 * In any module: the domain layer — pure rules only, lint-guaranteed free of Express, Mongoose
 * and every tier. A module gets a `domain/` folder once it has a closed vocabulary with rules of its
 * own.
 * Here: the status lifecycle and the two small facts that hang off it.
 *
 * See: docs/theory/domain-layer.md
 */

export {
    canApply,
    EXAMPLE_EVENTS,
    exampleActionsFor,
    fitsBodyLength,
    initialExampleStatus,
    isPublished,
    shouldStampPublishedAt,
    statusAfter
} from './lifecycle';
export type { ExampleEvent } from './lifecycle';
