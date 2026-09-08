/**
 * @module
 * The permission-key GRAMMAR — the part of the authorization model that is pure string logic over
 * `<subject>.<action>` and needs no file, no role and no caller.
 *
 * It lives here rather than in `kernel/permissions.ts` for one reason: the tier walls. The audit
 * trail is infrastructure and has to tell an unrestricted caller from an ordinary one, and
 * infrastructure may not reach the kernel. Splitting the model along that line is honest — the
 * grammar is a fact about how keys are SPELLED, while which keys exist, which roles hold them and
 * what a caller may do are facts about this deployment, and those stay in the kernel.
 *
 * `kernel/permissions.ts` asserts at load that `shared/authorization-keys.yaml` still spells its
 * wildcards the way this file does, so the two cannot drift apart in silence.
 *
 * See: docs/theory/authorization.md#the-key-grammar-and-the-invariant-it-exists-for
 */

import type { AuthorizationScope } from '@types';

/**
 * The prefix that marks a platform key.
 *
 * Bare keys are tenant keys and prefixed ones are platform keys, and that asymmetry is the whole
 * safety property: a bare key can never be satisfied by a platform-scope caller, and a
 * `platform.` key can never be satisfied by a tenant-scope one.
 */
export const PLATFORM_PREFIX = 'platform.';

/** `all` — the wildcard subject, CASL's own. */
export const WILDCARD_SUBJECT = 'all';

/** `manage` — the wildcard action, with CASL's exact semantics. */
export const WILDCARD_ACTION = 'manage';

/** Which scope a key belongs to, read from its spelling rather than from a lookup. */
export const scopeOfKey = (key: string): AuthorizationScope =>
    key.startsWith(PLATFORM_PREFIX) ? 'platform' : 'tenant';

/**
 * The wildcard key for a scope: `all.manage` inside a shop, `platform.all.manage` over the
 * installation.
 *
 * Holding it is what the audit trail means by an unrestricted actor. It is deliberately NOT the
 * same question as "is called owner": roles are data a deployment may rename, and the trail's
 * vocabulary has to outlive them.
 */
export const wildcardKeyFor = (scope: AuthorizationScope): string =>
    `${scope === 'platform' ? PLATFORM_PREFIX : ''}${WILDCARD_SUBJECT}.${WILDCARD_ACTION}`;
