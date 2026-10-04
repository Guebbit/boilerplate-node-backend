/**
 * @module
 * Driving the account data export the way a client does: ask, wait for the build, download. With
 * no broker in a test run the build runs inline after the `202`, so "wait" is the service's own
 * settle hook rather than a poll, and the download is the real route.
 */
import { api } from '@tests/http';
import { settleInlineExports } from '@modules/account/services/export';

/** What a finished request-and-download resolves to. */
export interface DownloadedExport {
    /** The `POST` answer. */
    request: { status: number; id: string };
    /** The `GET` answer's status. */
    status: number;
    /** The downloaded document: the sections of the export. */
    data: Record<string, unknown>;
}

/**
 * Request an export, wait for its build, and download it.
 *
 * @param bearer - the caller's `Authorization` header value
 */
export const requestAndDownloadExport = async (bearer: string): Promise<DownloadedExport> => {
    const requested = await api().post('/account/export').set('Authorization', bearer).send();
    const { id } = (requested.body as { data: { id: string } }).data;

    await settleInlineExports();
    const downloaded = await api().get(`/account/export/${id}`).set('Authorization', bearer);

    return {
        request: { status: requested.status, id },
        status: downloaded.status,
        data: downloaded.body as Record<string, unknown>
    };
};
