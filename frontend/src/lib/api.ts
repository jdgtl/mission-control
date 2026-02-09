/**
 * Authenticated fetch wrapper.
 * Automatically attaches the auth token from localStorage.
 * On 401, clears token and redirects to /login.
 */
export async function apiFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('mc_token')
  const headers = new Headers(opts.headers || {})

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  // Default content-type for POST/PUT/PATCH if body is provided and not FormData
  if (opts.body && !(opts.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(url, { ...opts, headers })

  if (res.status === 401) {
    localStorage.removeItem('mc_token')
    // Only redirect if not already on login page
    if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) {
      window.location.href = '/login'
    }
  }

  return res
}
