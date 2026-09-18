/**
 * @module
 * The permission-key GRAMMAR — the part of the authorization model that is pure string logic over
 * `<subject>.<action>` and needs no file, no role and no caller.
 *
 * It lives here, rather than in `kernel/permissions.ts`, for the tier walls: a few infrastructure
 * call sites need to know which scope a key belongs to, and infrastructure may not reach the
 * kernel. Splitting the model along that line is honest — the grammar is a fact about how keys are
 * SPELLED, while which keys exist, which roles hold them and what a caller may do are facts about
 * this deployment, and those stay in the kernel.
 *
 * See: docs/theory/authorization.md
 */

import type { AuthorizationScope } from '@types';

/**
 * The prefix that marks a platform key.
 *
 * Bare keys are tenant keys and prefixed ones are platform keys, and that asymmetry is the whole
 * safety property: a bare key can never be satisfied by a platform-scope caller, and a
 * `platform.` key can never be satisfied by a tenant-scope one.
 */
const PLATFORM_PREFIX = 'platform.';

/** Which scope a key belongs to, read from its spelling rather than from a lookup. */
export const scopeOfKey = (key: string): AuthorizationScope =>
    key.startsWith(PLATFORM_PREFIX) ? 'platform' : 'tenant';
