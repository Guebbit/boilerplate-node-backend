/**
 * @module
 * Notifications — public barrel; the only surface a sibling may import. A sibling that wants to
 * tell a user something usually emits a domain event; one that writes a notice itself, or reads who
 * works a set, calls the service published here.
 *
 * @see docs/understand/strategic-ddd.md#_5-published-language-—-the-barrel
 * @see docs/modules/notifications.md#its-neighbourhood
 */

export * from './services';

export * from './emails';

export type * from './model';

export type * from './presenter';
