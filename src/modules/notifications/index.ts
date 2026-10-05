/**
 * @module
 * Notifications — public barrel; the only surface a sibling may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). A sibling that wants to tell a user something
 * emits a domain event instead of calling in, so what is published here is mostly for reading.
 *
 * See: docs/modules/notifications.md
 */

export * from './services';

export type * from './model';

export type * from './presenter';
