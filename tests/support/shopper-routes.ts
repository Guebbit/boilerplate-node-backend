/**
 * The routes only a shopper may call, and the role that reaches them.
 *
 * The spec-walking suites send as an administrator so that a refusal is the controller's own and
 * never a permission gate. The basket and the card steps of a payment are the exception: an
 * administrator holds no basket key (`shopperOnly`), a customer does, so they are sent as one.
 */
import type { Operation } from './spec-walk';

/** The basket, and the card steps of a payment (intent, confirm, sync). */
const SHOPPER_ROUTE = /^\/(cart|payments\/(\{id\}\/(confirm|sync)|intent))/;

/**
 * The seeded role that reaches an operation's controller.
 *
 * @param operation - the operation about to be called
 * @returns `user` for a shopping route, `admin` for every other
 */
export const roleReaching = (operation: Pick<Operation, 'path'>): 'user' | 'admin' =>
    SHOPPER_ROUTE.test(operation.path) ? 'user' : 'admin';
