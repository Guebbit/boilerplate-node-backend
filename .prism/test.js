'use strict';

/**
 * Prism proxy-based OpenAPI contract test runner.
 * Replaces Dredd for API spec-conformance testing.
 *
 * Usage:
 *   1. Start the application:  npm run dev
 *   2. In another terminal:    npm run test:prism
 *
 * Environment variables:
 *   TEST_BASE_URL       – server base URL            (default: http://localhost:3000)
 *   TEST_ADMIN_EMAIL    – admin account e-mail       (default: admin@example.com)
 *   TEST_ADMIN_PASSWORD – admin account password     (default: adminpassword)
 *   PRISM_PORT          – prism proxy port           (default: 4010)
 *
 * @see https://docs.stoplight.io/docs/prism
 */

const { spawn } = require('child_process');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL    = process.env.TEST_BASE_URL       || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL    || 'admin@example.com';
const ADMIN_PASS  = process.env.TEST_ADMIN_PASSWORD || 'adminpassword';
const PRISM_PORT  = parseInt(process.env.PRISM_PORT || '4010', 10);

const PRISM_BASE_URL = `http://localhost:${PRISM_PORT}`;
const OPENAPI_PATH   = path.resolve(__dirname, '..', 'openapi.yaml');

/** Maximum time (ms) to wait for the prism process to signal readiness. */
const PRISM_READY_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

/** Spawned prism child process. */
let prismProcess = null;

/** Session cookie acquired after login (e.g. connect.sid=...). */
let sessionCookie = '';

/** CSRF token required by state-changing requests. */
let csrfToken = '';

/**
 * Real MongoDB ObjectIds for created resources.
 * Populated by CRUD test cases and used by dependent tests.
 */
const testIds = {
    userId:    '',
    productId: '',
    orderId:   '',
};

/** Running totals for the final report. */
const results = { passed: 0, failed: 0 };

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Fetch a URL and return status, headers and body text.
 *
 * @param {string}      url
 * @param {RequestInit} [options]
 * @returns {Promise<{status: number, headers: Headers, text: string}>}
 */
async function makeRequest(url, options = {}) {
    const response = await fetch(url, options);
    const text     = await response.text();
    return { status: response.status, headers: response.headers, text };
}

/**
 * Extract the CSRF token embedded in an HTML form field.
 * Matches: <input ... name="CSRFToken" value="<token>">
 *
 * @param {string} html
 * @returns {string}
 */
function extractCsrfToken(html) {
    const match = html.match(/name="CSRFToken"\s+value="([^"]+)"/);
    return match ? match[1] : '';
}

/**
 * Extract the first Set-Cookie segment matching the given cookie name.
 *
 * @param {Headers} headers
 * @param {string}  cookieName
 * @returns {string}
 */
function extractCookie(headers, cookieName) {
    const raw     = headers.get('set-cookie') || '';
    const escaped = cookieName.replace(/\./g, '\\.');
    const match   = raw.match(new RegExp(`${escaped}=[^;]+`));
    return match ? match[0] : '';
}

/**
 * Build request headers, automatically injecting the session cookie.
 *
 * @param {Record<string,string>} [extra]
 * @returns {Record<string,string>}
 */
function buildHeaders(extra = {}) {
    const headers = { ...extra };
    if (sessionCookie) headers['Cookie'] = sessionCookie;
    return headers;
}

// ---------------------------------------------------------------------------
// Prism process management
// ---------------------------------------------------------------------------

/**
 * Spawn `prism proxy` and resolve once it signals that it is listening
 * (or after PRISM_READY_TIMEOUT_MS, whichever comes first).
 *
 * @returns {Promise<void>}
 */
function startPrism() {
    return new Promise((resolve, reject) => {
        const prismBin = path.resolve(
            __dirname, '..', 'node_modules', '.bin', 'prism',
        );

        prismProcess = spawn(
            prismBin,
            [
                'proxy',
                OPENAPI_PATH,
                BASE_URL,
                '--port',   String(PRISM_PORT),
                '--errors',               // Return 4xx/5xx on spec violations
            ],
            { stdio: ['ignore', 'pipe', 'pipe'] },
        );

        let resolved = false;

        function onReady() {
            if (!resolved) {
                resolved = true;
                resolve();
            }
        }

        // Prism prints "[CLI] ... Prism is listening on ..." to stderr
        prismProcess.stderr.on('data', (chunk) => {
            const line = chunk.toString();
            if (line.includes('Prism is listening')) {
                onReady();
            }
        });

        prismProcess.on('error', reject);

        prismProcess.on('exit', (code) => {
            if (!resolved && code !== 0 && code !== null) {
                reject(new Error(`Prism exited with code ${code} before becoming ready`));
            }
        });

        // Safety net: resolve after timeout so the suite can still run
        setTimeout(onReady, PRISM_READY_TIMEOUT_MS);
    });
}

/** Terminate the prism proxy process. */
function stopPrism() {
    if (prismProcess) {
        prismProcess.kill();
        prismProcess = null;
    }
}

// ---------------------------------------------------------------------------
// Authentication (against the real server, not the proxy)
// ---------------------------------------------------------------------------

/**
 * Perform the full session-based login flow against the real server:
 *   1. GET  /account/login  → initial session cookie + CSRF token
 *   2. POST /account/login  → authenticate; refresh session cookie
 *   3. GET  /account        → re-read CSRF token for the authenticated session
 */
async function authenticate() {
    const loginPage = await makeRequest(`${BASE_URL}/account/login`);

    sessionCookie = extractCookie(loginPage.headers, 'connect.sid');
    csrfToken     = extractCsrfToken(loginPage.text);

    if (!sessionCookie || !csrfToken) {
        console.warn(
            '[Prism] WARNING: Could not obtain a session cookie or CSRF token ' +
            'from GET /account/login. Authenticated tests may fail.',
        );
        return;
    }

    const loginResponse = await makeRequest(`${BASE_URL}/account/login`, {
        method:   'POST',
        redirect: 'manual',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Cookie:         sessionCookie,
        },
        body: new URLSearchParams({
            email:     ADMIN_EMAIL,
            password:  ADMIN_PASS,
            CSRFToken: csrfToken,
        }).toString(),
    });

    const newCookie = extractCookie(loginResponse.headers, 'connect.sid');
    if (newCookie) sessionCookie = newCookie;

    const accountPage = await makeRequest(`${BASE_URL}/account`, {
        headers: { Cookie: sessionCookie },
    });
    const freshCsrf = extractCsrfToken(accountPage.text);
    if (freshCsrf) csrfToken = freshCsrf;

    console.log(`[Prism] Authenticated session established for ${ADMIN_EMAIL}`);
}

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

/**
 * Run a single named test case, recording pass/fail in `results`.
 *
 * @param {string}          name
 * @param {() => Promise<void>} fn
 */
async function runTest(name, fn) {
    try {
        await fn();
        console.log(`  ✓ ${name}`);
        results.passed++;
    } catch (error) {
        console.error(`  ✗ ${name}: ${error.message}`);
        results.failed++;
    }
}

/**
 * Send a request **through the prism proxy** and assert that prism did not
 * reject it with a spec-validation error.
 *
 * Prism (with --errors) signals validation failures via:
 *  - HTTP 422  – the request body / params do not match the spec
 *  - HTTP 500  – the upstream response does not match the spec
 *
 * When the upstream server legitimately returns one of `expectedStatuses`,
 * prism forwards the response as-is, so those are considered passing.
 *
 * @param {string}   method
 * @param {string}   urlPath
 * @param {object}   [options]
 * @param {object}   [options.headers]          Extra request headers
 * @param {string}   [options.body]             Request body (string)
 * @param {number[]} [options.expectedStatuses] Statuses considered passing
 *                                              (default: 200, 201, 204, 302,
 *                                               400, 401, 403, 404)
 * @returns {Promise<Response>}
 */
async function assertValidResponse(method, urlPath, options = {}) {
    const expectedStatuses = options.expectedStatuses
        ?? [200, 201, 204, 302, 400, 401, 403, 404];

    const headers = buildHeaders(options.headers ?? {});

    // Inject CSRF token into state-changing request bodies
    let body = options.body ?? null;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase()) && csrfToken) {
        let parsed = {};
        try { parsed = body ? JSON.parse(body) : {}; } catch { /* non-JSON body */ }
        parsed.CSRFToken = csrfToken;
        body = JSON.stringify(parsed);
        headers['Content-Type'] ??= 'application/json';
    }

    const url      = `${PRISM_BASE_URL}${urlPath}`;
    const response = await fetch(url, { method, headers, body, redirect: 'manual' });

    // Prism validation errors always carry a JSON body with a stoplight error type
    if (response.status === 422 || response.status === 500) {
        let errorDetail = `HTTP ${response.status}`;
        try {
            const payload = await response.clone().json();
            if (typeof payload.type === 'string' && payload.type.includes('stoplight.io')) {
                errorDetail = `Prism validation error ${response.status}: ${payload.detail ?? payload.title ?? JSON.stringify(payload)}`;
                throw new Error(errorDetail);
            }
        } catch (parseError) {
            if (parseError.message.startsWith('Prism validation')) throw parseError;
            // Not a prism error; fall through to the expectedStatuses check below
        }
    }

    if (!expectedStatuses.includes(response.status)) {
        const text = await response.text().catch(() => '');
        throw new Error(
            `Unexpected status ${response.status} for ${method} ${urlPath}: ${text.slice(0, 200)}`,
        );
    }

    return response;
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

/** Account / Auth */
async function testAuth() {
    console.log('\nAuth:');
    await runTest('GET /account', () =>
        assertValidResponse('GET', '/account', { expectedStatuses: [200, 302, 401] }),
    );
}

/** Products – list, CRUD, search */
async function testProducts() {
    console.log('\nProducts:');

    await runTest('GET /products', () =>
        assertValidResponse('GET', '/products'),
    );

    // Create – capture the new ID for dependent tests
    await runTest('POST /products', async () => {
        const res = await assertValidResponse('POST', '/products', {
            body: JSON.stringify({
                name:        'Prism Test Product',
                description: 'Created by prism contract test',
                price:       9.99,
                stock:       10,
            }),
            expectedStatuses: [200, 201, 401, 403],
        });
        try {
            const data = JSON.parse(await res.clone().text());
            testIds.productId = data._id || data.id || '';
        } catch { /* ignore */ }
    });

    if (testIds.productId) {
        await runTest(`GET /products/${testIds.productId}`, () =>
            assertValidResponse('GET', `/products/${testIds.productId}`, {
                expectedStatuses: [200, 404],
            }),
        );

        await runTest(`PUT /products/${testIds.productId}`, () =>
            assertValidResponse('PUT', `/products/${testIds.productId}`, {
                body: JSON.stringify({ name: 'Prism Updated Product', price: 19.99 }),
                expectedStatuses: [200, 401, 403, 404],
            }),
        );

        await runTest(`DELETE /products/${testIds.productId}`, () =>
            assertValidResponse('DELETE', `/products/${testIds.productId}`, {
                body: JSON.stringify({}),
                expectedStatuses: [200, 204, 401, 403, 404],
            }),
        );
    }

    await runTest('POST /products/search', () =>
        assertValidResponse('POST', '/products/search', {
            body:            JSON.stringify({ query: '' }),
            expectedStatuses: [200, 401, 403],
        }),
    );
}

/** Users – list, CRUD, search */
async function testUsers() {
    console.log('\nUsers:');

    await runTest('GET /users', () =>
        assertValidResponse('GET', '/users', { expectedStatuses: [200, 401, 403] }),
    );

    // Create a user for dependent tests
    await runTest('POST /users', async () => {
        const res = await assertValidResponse('POST', '/users', {
            body: JSON.stringify({
                email:    `prism-test-${Date.now()}@example.com`,
                password: 'TestPassword1!',
                role:     'user',
            }),
            expectedStatuses: [200, 201, 401, 403, 422],
        });
        try {
            const data = JSON.parse(await res.clone().text());
            testIds.userId = data._id || data.id || '';
        } catch { /* ignore */ }
    });

    if (testIds.userId) {
        await runTest(`GET /users/${testIds.userId}`, () =>
            assertValidResponse('GET', `/users/${testIds.userId}`, {
                expectedStatuses: [200, 401, 403, 404],
            }),
        );

        await runTest(`PUT /users/${testIds.userId}`, () =>
            assertValidResponse('PUT', `/users/${testIds.userId}`, {
                body:            JSON.stringify({ role: 'user' }),
                expectedStatuses: [200, 401, 403, 404],
            }),
        );

        await runTest(`DELETE /users/${testIds.userId}`, () =>
            assertValidResponse('DELETE', `/users/${testIds.userId}`, {
                body:            JSON.stringify({}),
                expectedStatuses: [200, 204, 401, 403, 404],
            }),
        );
    }

    await runTest('POST /users/search', () =>
        assertValidResponse('POST', '/users/search', {
            body:            JSON.stringify({ query: '' }),
            expectedStatuses: [200, 401, 403],
        }),
    );
}

/** Cart */
async function testCart() {
    console.log('\nCart:');

    await runTest('GET /cart', () =>
        assertValidResponse('GET', '/cart', { expectedStatuses: [200, 302, 401] }),
    );

    await runTest('GET /cart/summary', () =>
        assertValidResponse('GET', '/cart/summary', { expectedStatuses: [200, 302, 401] }),
    );
}

/** Orders */
async function testOrders() {
    console.log('\nOrders:');

    await runTest('GET /orders', () =>
        assertValidResponse('GET', '/orders', { expectedStatuses: [200, 401, 403] }),
    );

    await runTest('POST /orders/search', () =>
        assertValidResponse('POST', '/orders/search', {
            body:            JSON.stringify({ query: '' }),
            expectedStatuses: [200, 401, 403],
        }),
    );
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function main() {
    console.log('[Prism] Starting proxy…');

    try {
        await startPrism();
        console.log(`[Prism] Proxy is ready on port ${PRISM_PORT}.`);

        await authenticate();

        await testAuth();
        await testProducts();
        await testUsers();
        await testCart();
        await testOrders();

        console.log('[Prism] Contract test run complete.');
    } catch (error) {
        console.error(`[Prism] Fatal error: ${error.message}`);
        results.failed++;
    } finally {
        stopPrism();

        const { passed, failed } = results;
        console.log(`\n[Prism] Results: ${passed} passed, ${failed} failed\n`);

        if (failed > 0) process.exit(1);
    }
}

main();
