'use strict';

/**
 * Dredd lifecycle hooks – API contract / spec-conformance testing.
 *
 * Responsibilities:
 *  1. Authenticate once before all tests (session-based login flow).
 *  2. Inject the session cookie and CSRF token into every transaction.
 *  3. Rewrite placeholder path-parameter IDs with real MongoDB ObjectIds
 *     when test resources have been seeded (set testIds.* below).
 *  4. Log a completion message after all tests.
 *
 * Environment variables:
 *   TEST_BASE_URL       – base URL of the running server (default: http://localhost:3000)
 *   TEST_ADMIN_EMAIL    – email of an existing admin account (default: admin@example.com)
 *   TEST_ADMIN_PASSWORD – password of the admin account       (default: adminpassword)
 *
 * @see https://dredd.org/en/latest/hooks/nodejs.html
 */

const hooks = require('hooks');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Base URL of the server under test. */
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

/** Admin credentials used to establish an authenticated test session. */
const ADMIN_EMAIL    = process.env.TEST_ADMIN_EMAIL    || 'admin@example.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'adminpassword';

// ---------------------------------------------------------------------------
// Shared state across hooks
// ---------------------------------------------------------------------------

/** HTTP session cookie retrieved after login (e.g. connect.sid=...). */
let sessionCookie = '';

/** CSRF token required by state-changing requests (POST / PUT / DELETE). */
let csrfToken = '';

/**
 * Real MongoDB ObjectIds for resources that may exist in the database.
 * Override these via the hooks if you seed the database during beforeAll.
 * Dredd uses these to replace the placeholder IDs it generates from the spec.
 */
const testIds = {
    userId:    '',
    productId: '',
    orderId:   '',
};

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/**
 * Make an HTTP request and return the full response (body as text + headers).
 *
 * @param {string}      url
 * @param {RequestInit} [options]
 * @returns {Promise<{text: string, headers: Headers, status: number}>}
 */
async function makeRequest(url, options = {}) {
    const response = await fetch(url, options);
    const text     = await response.text();
    return { text, headers: response.headers, status: response.status };
}

/**
 * Extract the CSRF token embedded in an HTML form field.
 * Matches: <input ... name="CSRFToken" value="<token>">
 *
 * @param {string} html
 * @returns {string} The extracted token, or an empty string if not found.
 */
function extractCsrfToken(html) {
    const match = html.match(/name="CSRFToken"\s+value="([^"]+)"/);
    return match ? match[1] : '';
}

/**
 * Extract the first Set-Cookie segment whose name matches the given cookie name.
 * The cookie name is treated as a plain string (dots are escaped for regex safety).
 *
 * @param {Headers} headers
 * @param {string}  cookieName  Cookie name to look up (e.g. 'connect.sid').
 * @returns {string} The matched cookie segment (e.g. "connect.sid=..."), or ''.
 */
function extractCookie(headers, cookieName) {
    const raw   = headers.get('set-cookie') || '';
    // Escape dots so we match the literal cookie name
    const escaped = cookieName.replace(/\./g, '\\.');
    const match   = raw.match(new RegExp(`${escaped}=[^;]+`));
    return match ? match[0] : '';
}

// ---------------------------------------------------------------------------
// beforeAll – authenticate and (optionally) seed test data
// ---------------------------------------------------------------------------

hooks.beforeAll(async (transactions, done) => {
    try {
        // -------------------------------------------------------------------
        // 1. GET /account/login → initial session cookie + CSRF token
        // -------------------------------------------------------------------
        const loginPage = await makeRequest(`${BASE_URL}/account/login`);

        sessionCookie = extractCookie(loginPage.headers, 'connect.sid');
        csrfToken     = extractCsrfToken(loginPage.text);

        if (!sessionCookie || !csrfToken) {
            hooks.log(
                '[Dredd] WARNING: Could not obtain a session cookie or CSRF token ' +
                'from GET /account/login. Authenticated tests will be skipped.',
            );
            done();
            return;
        }

        // -------------------------------------------------------------------
        // 2. POST /account/login → authenticated session
        // -------------------------------------------------------------------
        const loginResponse = await makeRequest(`${BASE_URL}/account/login`, {
            method:   'POST',
            redirect: 'manual',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Cookie:         sessionCookie,
            },
            body: new URLSearchParams({
                email:     ADMIN_EMAIL,
                password:  ADMIN_PASSWORD,
                CSRFToken: csrfToken,
            }).toString(),
        });

        // The server issues a refreshed session cookie on successful login
        const newCookie = extractCookie(loginResponse.headers, 'connect.sid');
        if (newCookie) sessionCookie = newCookie;

        // -------------------------------------------------------------------
        // 3. Re-fetch CSRF token using the authenticated session
        //    (csrf-sync stores one token per session; re-reading it ensures we
        //     have the correct value for subsequent state-changing requests)
        // -------------------------------------------------------------------
        const accountPage = await makeRequest(`${BASE_URL}/account`, {
            headers: { Cookie: sessionCookie },
        });
        const freshCsrf = extractCsrfToken(accountPage.text);
        if (freshCsrf) csrfToken = freshCsrf;

        hooks.log(`[Dredd] Authenticated session established for ${ADMIN_EMAIL}`);
    } catch (error) {
        hooks.log(`[Dredd] beforeAll error: ${error.message}`);
    }

    done();
});

// ---------------------------------------------------------------------------
// beforeEach – inject auth + CSRF into every transaction
// ---------------------------------------------------------------------------

hooks.beforeEach((transaction, done) => {
    // -----------------------------------------------------------------------
    // Attach the session cookie to every outgoing request
    // -----------------------------------------------------------------------
    if (sessionCookie) {
        transaction.request.headers['Cookie'] = sessionCookie;
    }

    // -----------------------------------------------------------------------
    // Replace placeholder path-parameter IDs with real seeded MongoDB ObjectIds
    // so that GET /users/{id}, GET /products/{id}, etc. resolve real documents.
    // -----------------------------------------------------------------------
    if (testIds.userId && transaction.request.uri.includes('/users/')) {
        transaction.request.uri = transaction.request.uri.replace(
            /\/users\/[^/?#]+/,
            `/users/${testIds.userId}`,
        );
    }
    if (testIds.productId && transaction.request.uri.includes('/products/')) {
        transaction.request.uri = transaction.request.uri.replace(
            /\/products\/[^/?#]+/,
            `/products/${testIds.productId}`,
        );
    }
    if (testIds.orderId && transaction.request.uri.includes('/orders/')) {
        transaction.request.uri = transaction.request.uri.replace(
            /\/orders\/[^/?#]+/,
            `/orders/${testIds.orderId}`,
        );
    }

    // -----------------------------------------------------------------------
    // Inject the CSRF token into the body of state-changing requests.
    // The server reads it from request.body.CSRFToken (see src/middlewares/csrf.ts).
    // -----------------------------------------------------------------------
    const method = (transaction.request.method || '').toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && csrfToken) {
        try {
            const body    = JSON.parse(transaction.request.body || '{}');
            body.CSRFToken = csrfToken;
            transaction.request.body = JSON.stringify(body);
            transaction.request.headers['Content-Type'] = 'application/json';
        } catch {
            // Body is not valid JSON – leave it as-is
        }
    }

    done();
});

// ---------------------------------------------------------------------------
// afterAll – log completion
// ---------------------------------------------------------------------------

hooks.afterAll((transactions, done) => {
    hooks.log('[Dredd] Contract test run complete.');
    done();
});
