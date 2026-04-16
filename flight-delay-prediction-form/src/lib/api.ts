import { getRuntimeConfig } from '@/lib/runtime';

export interface ApiClient {
  baseUrl?: string;
  post<TRequest, TResponse>(path: string, payload: TRequest, init?: RequestInit): Promise<TResponse>;
}

export interface ApiClientOptions {
  baseUrl?: string;
}

export const createApiClient = (options: ApiClientOptions = {}): ApiClient => {
  const resolveBaseUrl = () => options.baseUrl ?? getRuntimeConfig().apiBaseUrl;

  const buildUrl = (path: string) => {
    const baseUrl = resolveBaseUrl();

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
    get baseUrl() {
      return resolveBaseUrl();
    },
    post: (path, payload, init) => request('POST', path, payload, init),
  };
};
