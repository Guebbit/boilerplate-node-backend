/**
 * @module
 * The one place a return document becomes the `Return` contract. The read service builds on this
 * to add the `actions` a caller may take.
 */

import type { Return } from '@types';
import type { ReturnDocument } from './model';

/**
 * `.toJSON()` applies the model's `_id` → `id` / date-to-ISO-string transform: the document itself
 * is typed as stored, not as the wire shape `Return` promises — one cast narrowing what the
 * compiler cannot see through on its own.
 */
export const presentReturn = (document: ReturnDocument): Return => document.toJSON() as Return;
