/**
 * @module
 * Example factories that touch the test database. The BUILDER lives one level up in
 * `../factories.ts`, the file the demo seed is built from; this file only persists what it returns.
 */

import { exampleRepository } from '../repository';
import type { ExampleDocument } from '../model';
import { makeExample, type ExampleOverrides } from '../factories';

export { makeExample, type ExampleOverrides } from '../factories';

/**
 * Persist an example owned by `overrides.userId`.
 * @param overrides - the owner, plus whatever the case cares about
 */
export const createExample = (overrides: ExampleOverrides): Promise<ExampleDocument> =>
    exampleRepository.create(makeExample(overrides));

/**
 * One stored field of an example, read back from the database — what a test asserts on after a
 * write, without reaching into a `findById(...)` result with an `await` in the middle.
 * @param id - the example's id
 * @param field - which field to read
 * @returns the stored value, or `undefined` when the example or the field is absent
 */
export const fieldOf = <TField extends keyof ExampleDocument>(
    id: string,
    field: TField
): Promise<ExampleDocument[TField] | undefined> =>
    exampleRepository.findById(id).then((example) => example?.[field]);
