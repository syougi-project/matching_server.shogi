export function jsonOk<T>(data: T) {
  return { ok: true as const, data };
}

export function jsonError(code: string, message: string) {
  return { ok: false as const, error: { code, message } };
}
