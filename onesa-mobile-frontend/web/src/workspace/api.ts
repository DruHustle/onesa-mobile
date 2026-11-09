export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message); this.status = status; this.code = code; this.requestId = requestId;
  }
}
export async function apiResponse(path: string, init: RequestInit = {}): Promise<Response> {
  if (!path.startsWith('/v1/')) throw new Error('Use an Onesa Mobile API path.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  init.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 20000);
  try {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    const response = await fetch('/api' + path, { ...init, headers, credentials: 'include', cache: 'no-store', redirect: 'error', signal: controller.signal });
    if (!response.ok) {
      let data: { error?: { code?: string; message?: string }; requestId?: string } = {};
      try { data = await response.json(); } catch { /* A proxy may return a non-JSON error. */ }
      throw new ApiError(response.status, data.error?.code ?? 'SERVICE_ERROR', data.error?.message ?? 'The service could not complete this request.', data.requestId);
    }
    // Keep the timeout active until the body has arrived, including exports.
    const bytes = await response.arrayBuffer();
    return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, 'CONNECTION_UNCERTAIN', 'The connection was interrupted. Try again when you are connected.');
  } finally {
    clearTimeout(timeout); init.signal?.removeEventListener('abort', abort);
  }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiResponse(path, init);
  try { return await response.json() as T; }
  catch { throw new ApiError(0, 'RESPONSE_UNREADABLE', 'The service response could not be read. Refresh your workspace before continuing.'); }
}
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'INVALID_CREDENTIALS') return error.message;
    if (error.code === 'REVISION_CONFLICT') return 'This record changed while you were working. Your entries are still here. Refresh, review the latest record, then save again.';
    if (error.status === 401) return 'Your session has ended. Sign in again to continue.';
    if (error.code === 'REAUTHENTICATION_REQUIRED') return 'Sign out and sign in again to confirm this sensitive action, then return to this record.';
    return error.message;
  }
  return error instanceof Error ? error.message : 'This action could not be completed. Please try again.';
}
