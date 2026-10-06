/**
 * @module
 * The door the doubles come through: a Node preload, run as `tsx --import <this file> …`.
 *
 * Production has no fake payment provider, no mail log and no OAuth stand-in — they are not in
 * `src/`, not in the image. A process that wants them (`dev`, `e2e:serve`, `demo`, `debug`,
 * `scenario:apply`) loads this file first, and it:
 *   1. reads `.env`, so "when unset" below means unset there too;
 *   2. gives the three variables a developer machine would otherwise have to set a default;
 *   3. registers the doubles in the registries the application resolves from.
 *
 * `cluster.fork()` hands `execArgv` to every worker, so a worker preloads this too.
 * https://nodejs.org/api/cluster.html#clustersettings
 *
 * See: docs/tools/test-doubles.md
 */

// First, for its side effect: `.env` into `process.env`, and the config store told it did.
import '@infrastructure/config/dotenv';
import { refreshEnvironment } from '@infrastructure/config/store';
import { registerOAuthProvider } from '@modules/account/oauth/providers';
import { fakeOAuthProvider } from './doubles/oauth-fake';
import { registerDoubles } from './doubles/register';

/**
 * What a developer machine gets when it sets nothing. The key is not a secret: nothing here holds
 * data worth protecting, and a digest still has to be stable between two runs.
 */
const DEV_DEFAULTS: Readonly<Record<string, string>> = {
    NODE_PAYMENT_PROVIDER: 'fake',
    NODE_MAIL_TRANSPORT: 'log',
    NODE_PSEUDONYM_KEY: '44df8572d10ff3d8a54e552b215b307c6cc2c286faff33a691299c0a6394ed0e'
};

for (const [name, value] of Object.entries(DEV_DEFAULTS))
    if (!process.env[name]?.trim()) process.env[name] = value;

// The store snapshots `process.env` once and `dotenv` already took one; take it again with the
// defaults above in it.
refreshEnvironment();

registerDoubles();

// A factory, not a value: the OAuth registry re-asks "is it configured" on every call, and this
// one always is.
registerOAuthProvider('fake', () => fakeOAuthProvider);
