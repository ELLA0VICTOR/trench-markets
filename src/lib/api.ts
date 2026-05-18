const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath
}

export function apiFetch(path: string, init?: RequestInit) {
  return fetch(apiUrl(path), init)
}
