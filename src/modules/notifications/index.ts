/**
 * @module
 * Notifications — public barrel; the only surface a sibling may import (see
 * `docs/understand/strategic-ddd.md` §5 for the rule). A sibling that wants to tell a user something
 * usually emits a domain event; one that writes a notice itself, or reads who works a set, calls
 * the service published here.
 *
 * @see docs/modules/notifications.md#its-neighbourhood
 */

export * from './services';

export * from './emails';

export type * from './model';

export type * from './presenter';
