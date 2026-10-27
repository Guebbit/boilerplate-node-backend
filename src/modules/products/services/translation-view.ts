/**
 * @module
 * Who sees every language of a product. The editor's tabs need each locale's copy, drafts
 * included, which is more than the resolved `title`/`description` a shopper reads — so it goes
 * only to a caller holding `read:Translation`. Same field-level shape as `./stock-view`.
 */

import type { Caller } from '@types';
import { holds } from '@kernel/ability';

/**
 * Does this caller see a product's `translations`? Asks for the rule `read:Translation`, never a
 * write key such as `update:Product`: reading and writing are different grants.
 *
 * @param caller - `request.caller`, or `undefined` for an anonymous request
 */
export const canSeeTranslations = (caller?: Caller): boolean =>
    caller !== undefined && holds(caller, 'read', 'Translation');
