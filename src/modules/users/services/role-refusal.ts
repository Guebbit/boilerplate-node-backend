/**
 * @module
 * A refused role grant as the HTTP answer: who may not hand out roles is told 403, a name nobody
 * can be given is a 422 on the `role` field. Shared by the admin create and update.
 */

import { t } from '@infrastructure/i18n';
import { fieldError, generateReject, type ResponseReject } from '@infrastructure/http/response';
import { roleManagementRequired, type GrantRefusal } from '@modules/access';

/**
 * The answer to a refused grant.
 *
 * @param refusal - why `accessService.grantRefusalAudited` refused
 * @returns 403 `ROLE_MANAGEMENT_REQUIRED` for a granter without `assign:Role`, else a translated
 *   422 naming `role`. The internal sentence is never echoed.
 */
export const roleRefusalReject = (refusal: GrantRefusal): ResponseReject =>
    refusal.kind === 'not_granter'
        ? roleManagementRequired()
        : generateReject(422, [fieldError('role', t('users.role-not-assignable'))]);
