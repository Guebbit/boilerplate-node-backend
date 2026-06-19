/**
 * Custom fetch mutator used by Orval-generated clients.
 *
 * Features:
 * - Automatically adds `Content-Type: application/json` when the request
 *   body is a string and no content type is already provided.
 * - Executes the HTTP request using the native Fetch API.
 * - Safely handles responses without a body (204, 205, 304).
 * - Parses response bodies as JSON when present.
 * - Returns a normalized object containing:
 *   - `data`: parsed JSON payload
 *   - `status`: HTTP status code
 *   - `headers`: response headers
 *
 * Note:
 * This implementation assumes all non-empty responses contain valid JSON.
 * Requests returning text, HTML, or invalid JSON will throw during parsing.
 */
export const customFetch = <T>(url: string, options: RequestInit = {}): Promise<T> => {
    const headers = new Headers(options.headers);

    if (typeof options.body === 'string' && !headers.has('Content-Type'))
        headers.set('Content-Type', 'application/json');

    return fetch(url, { ...options, headers }).then((response) =>
        ([204, 205, 304].includes(response.status)
            ? Promise.resolve({})
            : response.text().then((text) => JSON.parse(text))
        ).then(
            (data) =>
                ({
                    data,
                    status: response.status,
                    headers: response.headers
                }) as T
        )
    );
};
