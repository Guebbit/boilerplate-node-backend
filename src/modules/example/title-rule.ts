/**
 * @module
 * The example's title rule, written once for both doors that accept a title.
 */

import { UpdateExampleByIdBody } from '@api/schemas.zod';
import { trimmedInto } from '@infrastructure/http/schemas';

/**
 * `PATCH`'s title as the contract bounds it, trimmed first: `"   "` is a field-level 422, not a
 * blank column. One rule for the owner's own door and the generic translator's door.
 */
export const trimmedExampleTitle = trimmedInto(UpdateExampleByIdBody.shape.title.unwrap());
