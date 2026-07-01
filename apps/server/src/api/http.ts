const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:4000";

type RequestOptions = RequestInit & {
  parseJson?: boolean;
};

export async function http<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { parseJson = true, headers, body, ...rest } = options;

 const finalHeaders: Record<string, string> = {
  ...(headers as Record<string, string> | undefined),
};

if (body) {
  finalHeaders["Content-Type"] = "application/json";
}

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    body,
    headers: finalHeaders,
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;

    try {
      const errorData: unknown = await response.json();

      if (
        typeof errorData === "object" &&
        errorData !== null &&
        "message" in errorData
      ) {
        const msg = (errorData as { message?: unknown }).message;
        message = Array.isArray(msg) ? msg.join(", ") : String(msg);
      }
    } catch {
      //
    }

    throw new Error(message);
  }

  if (!parseJson) {
    return undefined as T;
  }

  return (await response.json()) as T;
}