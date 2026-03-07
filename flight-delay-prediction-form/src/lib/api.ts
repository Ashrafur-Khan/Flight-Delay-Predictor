const normalizeBaseUrl = (value?: string) => {
  if (!value) return undefined;
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

export interface ApiClient {
  baseUrl?: string;
  post<TRequest, TResponse>(path: string, payload: TRequest, init?: RequestInit): Promise<TResponse>;
}

export interface ApiClientOptions {
  baseUrl?: string;
}

export const createApiClient = (options: ApiClientOptions = {}): ApiClient => {
  const inferredBaseUrl = options.baseUrl ?? import.meta.env.VITE_API_BASE_URL;
  const baseUrl = normalizeBaseUrl(inferredBaseUrl);

  const buildUrl = (path: string) => {
    if (!baseUrl) {
      throw new Error('API base URL is not configured.');
    }

    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${baseUrl}${normalizedPath}`;
  };

  const request = async <TRequest, TResponse>(method: string, path: string, payload?: TRequest, init?: RequestInit) => {
    const response = await fetch(buildUrl(path), {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      body: payload ? JSON.stringify(payload) : undefined,
      ...init,
    });

    if (!response.ok) {
      const message = await response.text().catch(() => response.statusText);
      throw new Error(message || `Request failed with status ${response.status}`);
    }

    return (await response.json()) as TResponse;
  };

  return {
    baseUrl,
    post: (path, payload, init) => request('POST', path, payload, init),
  };
};
