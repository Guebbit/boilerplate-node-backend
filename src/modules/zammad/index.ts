/**
 * @module
 * Zammad: public barrel. Nothing in the shop depends on this module: it installs a port in `tasks`
 * and listens to an event, so a sibling has nothing to import. The one export is the service the
 * ops scripts call.
 *
 * @see docs/modules/zammad.md#its-neighbourhood
 */

export { zammadService } from './services';
