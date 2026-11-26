import type { DataProvider } from "@refinedev/core";
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number,
    public requestId?: string,
  ) {
    super(message);
  }
}
export function createApi(token: string) {
  return async function api<T = any>(
    url: string,
    method = "GET",
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`/api/v1/${url}`, {
        method,
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new ApiError("API_UNREACHABLE", "无法连接 XcAIPool 服务。", 0);
    }
    const result = await response.json().catch(() => null);
    if (!response.ok)
      throw new ApiError(
        result?.error?.code ?? "HTTP_ERROR",
        result?.error?.message ?? "服务请求失败。",
        response.status,
        result?.error?.requestId,
      );
    if (!result)
      throw new ApiError(
        "API_RESPONSE_INVALID",
        "服务返回了无效响应。",
        response.status,
      );
    return result;
  };
}
export type Api = ReturnType<typeof createApi>;
export function createDataProvider(api: Api): DataProvider {
  return {
    getApiUrl: () => "/api/v1",
    getList: async ({ resource, filters }) => {
      const query = new URLSearchParams();
      for (const f of filters ?? [])
        if ("field" in f && f.value) query.set(f.field, String(f.value));
      return api(`${resource}${query.size ? "?" + query : ""}`);
    },
    getOne: async ({ resource, id }) => ({
      data: await api(`${resource}/${encodeURIComponent(String(id))}`),
    }),
    create: async ({ resource, variables }) => ({
      data: await api(resource, "POST", variables),
    }),
    update: async ({ resource, id, variables }) => ({
      data: await api(
        `${resource}/${encodeURIComponent(String(id))}`,
        "PATCH",
        variables,
      ),
    }),
    deleteOne: async () => {
      throw new Error("P1-A 不提供删除操作");
    },
  };
}
