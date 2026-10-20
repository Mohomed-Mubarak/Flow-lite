/** An error with an HTTP status. Thrown by the service layer, shown as JSON by the REST API and as a tool error by MCP. */
export class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'error') {
    super(message);
  }
}
export const bad = (m: string) => new ApiError(400, m, 'bad_request');
export const notFound = (m: string) => new ApiError(404, m, 'not_found');
