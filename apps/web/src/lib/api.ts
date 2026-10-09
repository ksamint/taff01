import { errorSchema } from "@taff/schemas/base";

export class ApiError extends Error {
  constructor(
    public code: string,
    public status = 0,
  ) {
    super(code);
  }
}

export async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
  } catch {
    throw new ApiError("network");
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const result = errorSchema.safeParse(body);
    throw new ApiError(
      result.success ? result.data.error : "internal_error",
      response.status,
    );
  }
  return body as T;
}

export function errorKey(error: unknown): string {
  return `errors.${error instanceof ApiError ? error.code : "internal_error"}`;
}
