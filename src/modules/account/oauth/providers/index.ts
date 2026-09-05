/**
 * @module
 * The OAuth provider registry — unlike `payments/providers/index.ts`'s single active provider,
 * MULTIPLE providers may be enabled at once, so this exposes "which are configured right now"
 * rather than memoising one winner. Each entry is a closure re-checked on every call, not a value
 * computed at import time: a provider becomes configured the moment its env vars are set, with no
 * restart-shaped memoisation to go stale.
 */

import { isDemoMode } from '@infrastructure/adapters/demo-outbox';
import { googleConfigured, googleOAuthProvider } from './google';
import { githubConfigured, githubOAuthProvider } from './github';
import { fakeOAuthProvider } from './fake';
import type { OAuthProvider } from './port';

/**
 * Every implementation this build knows, keyed by the name a route/`OAuthAccount` uses.
 * `Partial<Record<...>>`, not `Record<...>`: a route param the registry doesn't recognise (a typo,
 * a provider never built) must resolve to `undefined` rather than call a hole in the map.
 */
const PROVIDERS: Partial<Record<string, () => OAuthProvider | undefined>> = {
    google: () => (googleConfigured() ? googleOAuthProvider : undefined),
    github: () => (githubConfigured() ? githubOAuthProvider : undefined),
    // The demo profile's stand-in — see `./fake`'s doc for why it needs no credentials of its own.
    fake: () => (isDemoMode() ? fakeOAuthProvider : undefined)
};

/** The names `GET /account/oauth/providers` reports — a deployment with no keys set lists none. */
export const enabledProviders = (): string[] =>
    Object.keys(PROVIDERS).filter((name) => PROVIDERS[name]?.() !== undefined);

/**
 * Resolve one provider by name, only if it is actually enabled — an unset `NODE_OAUTH_GOOGLE_*`
 * pair makes `google` behave as if the route did not exist, same as an unset
 * `NODE_PAYMENT_PROVIDER` does for payments: loud (404 from the controller), never silently wrong.
 */
export const resolveOAuthProvider = (name: string): OAuthProvider | undefined =>
    PROVIDERS[name]?.();
