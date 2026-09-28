/**
 * @module
 * The OAuth provider registry — unlike `payments/providers/index.ts`'s single active provider,
 * MULTIPLE providers may be enabled at once, so this exposes "which are configured right now"
 * rather than memoising one winner. Each entry is a closure re-checked on every call, not a value
 * computed at import time: a provider becomes configured the moment its env vars are set, with no
 * restart-shaped memoisation to go stale.
 */

import { isDemoMode } from '@infrastructure/runtime/demo-profile';
import { createProviderRegistry } from '@infrastructure/runtime/provider-registry';
import { googleOAuthProvider } from './google';
import { isOAuthProviderConfigured } from '../config';
import { githubOAuthProvider } from './github';
import { fakeOAuthProvider } from './fake';
import type { OAuthProvider } from './port';

/** A registered entry is a FACTORY, not a value: "configured" can change between calls. */
type OAuthProviderFactory = () => OAuthProvider | undefined;

/**
 * Every implementation this build knows, keyed by the name a route/`OAuthAccount` uses. A live
 * deployment adds one file and calls {@link registerOAuthProvider} — no edit here required.
 */
const registry = createProviderRegistry<OAuthProviderFactory>({
    google: () => (isOAuthProviderConfigured('google') ? googleOAuthProvider : undefined),
    github: () => (isOAuthProviderConfigured('github') ? githubOAuthProvider : undefined),
    // The demo profile's stand-in — see `./fake`'s doc for why it needs no credentials of its own.
    fake: () => (isDemoMode() ? fakeOAuthProvider : undefined)
});

/** Add (or, in a test, override) one implementation without editing this file. */
export const registerOAuthProvider = (name: string, factory: OAuthProviderFactory): void =>
    registry.register(name, factory);

/** The names `GET /account/oauth/providers` reports — a deployment with no keys set lists none. */
export const enabledProviders = (): string[] =>
    registry.names().filter((name) => registry.resolve(name)?.() !== undefined);

/**
 * Resolve one provider by name, only if it is actually enabled — an unset `NODE_OAUTH_GOOGLE_*`
 * pair makes `google` behave as if the route did not exist, same as an unset
 * `NODE_PAYMENT_PROVIDER` does for payments: loud (404 from the controller), never silently wrong.
 */
export const resolveOAuthProvider = (name: string): OAuthProvider | undefined =>
    registry.resolve(name)?.();
