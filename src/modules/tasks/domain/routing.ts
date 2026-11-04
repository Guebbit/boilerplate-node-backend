/**
 * @module
 * Jurisdiction: which permission set works a task. A contact message is always the same set; a
 * system task carries the set its opener named (`SystemOpening.routeSet`), so this file holds no
 * list of kinds and a module that adds a kind adds its set with it. Admin holds every set by
 * construction, so there is no admin special case.
 */
import type { PermissionSetName } from '@api/permission-vocabulary';

/** The permission set that reads, and is routed, a visitor's contact message. */
export const CONTACT_ROUTE_SET: PermissionSetName = 'TaskDisplay';
