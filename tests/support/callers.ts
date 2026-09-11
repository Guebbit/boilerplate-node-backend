/**
 * The callers a test acts as, by ROLE rather than by flag.
 *
 * By ROLE, because that is what the model decides from and what a reader needs to see. A warehouse
 * operator and a support agent differ in every rule that matters and in no flag at all, so a test
 * naming the flag proves nothing about the rule that separates them.
 *
 * Each factory returns a full `AuthContext` because that is what services take — the identity
 * fields are filler, and only `roles`/`tenantId` are ever read by an authorization decision.
 *
 * Roles come from `shared/authorization-roles.yaml`, so a preset renamed there fails here rather
 * than in one route's integration test three layers down.
 */

import type { AuthContext, Caller } from '@types';
import { anonymousCaller, callerInScope } from '@kernel/permissions';
import type { CallerContext } from '@infrastructure/http/request';

/** The single shop every fixture belongs to. Multi-tenant behaviour is the conformance suite's. */
export const TEST_TENANT_ID = 'shop';

/** Identity filler. Nothing authorization-facing reads any of it. */
const identity = (id: string) => ({
    id,
    email: `${id}@example.com`,
    username: id,
    authTime: Math.floor(Date.now() / 1000),
    amr: ['pwd'] as readonly string[],
    analyticsConsent: false,
    verified: true
});

/**
 * Someone acting in the shop, in the named role.
 *
 * @param role - a preset tenant role: `customer`, `manager`, `warehouse`, `support`, `editor`,
 * `translator`, `moderator` or `owner`
 */
export const asRole = (role: string, id = 'test-user'): AuthContext => ({
    ...identity(id),
    roles: { tenant: role, platform: null },
    tenantId: TEST_TENANT_ID
});

/** A shopper. Reads the catalogue and their own orders, and nothing else. */
export const asCustomer = (id = 'test-customer'): AuthContext => asRole('customer', id);

/** Unrestricted inside the shop, and only inside it. */
export const asOwner = (id = 'test-owner'): AuthContext => asRole('owner', id);

/** Runs the shop: catalogue, orders, locales. Reads stock without moving it. */
export const asManager = (id = 'test-manager'): AuthContext => asRole('manager', id);

/** Moves stock and advances consignments. Cannot change a price. */
export const asWarehouse = (id = 'test-warehouse'): AuthContext => asRole('warehouse', id);

/** Handles messages and accounts. May update an account, never erase one. */
export const asSupport = (id = 'test-support'): AuthContext => asRole('support', id);

/**
 * Everything the shop says and shows, in every registered language: the catalogue record, the
 * dictionary, and the words on a translatable entity. Cannot touch stock, an order, or a person.
 */
export const asEditor = (id = 'test-editor'): AuthContext => asRole('editor', id);

/** Accounts, orders and payments, plus the audit trail those three write to. Cannot set a price. */
export const asModerator = (id = 'test-moderator'): AuthContext => asRole('moderator', id);

/**
 * Operates the installation and is NOT a super-owner: holds no bare key, so it cannot read one
 * shop's orders, customers or messages. The pair to {@link asOwner} in every scope test.
 */
export const asOperator = (id = 'test-operator'): AuthContext => ({
    ...identity(id),
    roles: { tenant: 'guest', platform: 'operator' },
    tenantId: null
});

/**
 * A `CallerContext` for a unit test calling a service directly, bypassing the controller that
 * would build one from the request. Anonymous by default — most such tests do not care who the
 * caller is, only that the emit does not throw for lack of one.
 */
export const testCallerContext: CallerContext = {
    caller: anonymousCaller(),
    analyticsConsent: false
};

/**
 * The same actors as a `Caller` — what an authorization decision, an audit row or an analytics
 * event actually sees, rather than the whole session behind it.
 *
 * Tenant scope, because that is the scope those three things are about. A platform-scope caller
 * is built by asking `callerInScope(asOperator(), 'platform')`, which is rare enough to spell out
 * where it happens.
 */
export const callerAs = (role: string, id?: string): Caller =>
    callerInScope(asRole(role, id), 'tenant');

/**
 * A `CallerContext` for a service test that needs a specific caller ROLE rather than the
 * anonymous default `testCallerContext` carries — the granter behind an `assignRole` call, for
 * one, since anonymous holds no key an elevated role could ever be a subset of.
 */
export const callerContextAs = (role: string, id?: string): CallerContext => ({
    caller: callerAs(role, id),
    analyticsConsent: false
});

/** A stranger, as the evaluator sees them: the `guest` role, in the shop. */
export const strangerCaller = (): Caller => anonymousCaller();
