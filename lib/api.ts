/** Turns thrown errors into JSON so the UI can show them. */
export function guard<A extends any[]>(fn: (...a: A) => Promise<Response>) {
  return async (...a: A): Promise<Response> => {
    try {
      return await fn(...a);
    } catch (e: any) {
      return Response.json({ error: e?.message || 'Server error' }, { status: 500 });
    }
  };
}
