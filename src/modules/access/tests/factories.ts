/**
 * @module
 * The test-side door into `access`'s storage, for a sibling module's own tests.
 * A sibling forces a membership write to fail, or names an audit action, through here instead of
 * reaching `../model` or `../audit`, which its import boundary refuses — see `docs/reference/tests.md`.
 */

/** The membership rows — a sibling spies on a write here to force a role grant to fail. */
export { membershipModel } from '../model';

/** The audit actions `access` records, so a sibling asserts on the real name. */
export { accessAuditActions } from '../audit';
