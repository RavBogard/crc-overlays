export class AuthoringApiError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "AuthoringApiError";
  }
}

export async function authoringCall<T>(
  key: string,
  operation: string,
  input: unknown = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (key !== "session") headers.Authorization = `Bearer ${key}`;
  const response = await fetch("/api/authoring", {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
    headers,
    body: JSON.stringify({ operation, input }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const value =
      body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    throw new AuthoringApiError(
      typeof value.error === "string"
        ? value.error
        : `The authoring request failed (${response.status}).`,
      typeof value.code === "string" ? value.code : undefined,
    );
  }
  return body as T;
}
