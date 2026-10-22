/**
 * @module
 * In any module: the one place it reads another module's data, always through that module's
 * barrel (`@modules/users`), never its repository or model.
 * Here: the owner's display name, which the contract carries on every example and the collection
 * does not store, and the two ways a row is presented (for a caller, for anyone).
 *
 * See: docs/theory/strategic-ddd.md
 */

import type { CallerContext, Example } from '@types';
import { t } from '@infrastructure/i18n';
import { userService } from '@modules/users';
import type { ExampleDocument } from '../model';
import { presentExample } from '../presenter';
import { actionsForRows } from './actions';

/**
 * The owner's display name.
 * @param userId - the owner
 * @returns the username, or a translated placeholder when the account no longer exists
 */
export const ownerNameOf = (userId: string): Promise<string> =>
    userService.getById(userId).then((owner) => owner?.username ?? t('example.owner-unknown'));

/**
 * Owner names for a page of rows, one `users` read per distinct owner — a page of one person's
 * examples costs one read, not one per row.
 * @param userIds - the owners on the page, repeats allowed
 * @returns each distinct owner's id mapped to their display name
 */
export const ownerNamesOf = (userIds: string[]): Promise<Map<string, string>> =>
    Promise.all(
        [...new Set(userIds)].map((userId) =>
            ownerNameOf(userId).then((name) => [userId, name] as const)
        )
    ).then((entries) => new Map(entries));

/**
 * A document as the contract's `Example` for a signed-in caller: the owner's name filled in, and
 * what this caller may do to it.
 * @param document - the stored example
 * @param context - the caller
 */
export const presentForCaller = (
    document: ExampleDocument,
    context: CallerContext
): Promise<Example> =>
    ownerNameOf(String(document.userId)).then((name) =>
        presentExample(
            document,
            name,
            actionsForRows(context)({ userId: String(document.userId), status: document.status })
        )
    );

/**
 * A document as the contract's `Example` for anyone: the owner's name, and no `actions` — nobody
 * is acting on the public read.
 * @param document - the stored example
 */
export const presentPublic = (document: ExampleDocument): Promise<Example> =>
    ownerNameOf(String(document.userId)).then((name) => presentExample(document, name));
