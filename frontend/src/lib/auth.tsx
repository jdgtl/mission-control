import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

interface User {
  id: string
  username: string
  displayName: string
  role: 'admin' | 'user'
}

interface AuthContextType {
  user: User | null
  token: string | null
  loading: boolean
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  register: (inviteCode: string, username: string, password: string, displayName?: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('mc_token'))
  const [loading, setLoading] = useState(true)

  // Check auth on mount
  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }

    fetch('/api/auth/check', {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(r => {
        if (!r.ok) throw new Error('Invalid token')
        return r.json()
      })
      .then(data => {
        setUser(data.user)
      })
      .catch(() => {
        // Token expired/invalid — clear it
        localStorage.removeItem('mc_token')
        setToken(null)
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, []) // Only on mount

  const login = useCallback(async (username: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) return { ok: false, error: data.error || 'Login failed' }

      localStorage.setItem('mc_token', data.token)
      setToken(data.token)
      setUser(data.user)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err.message || 'Network error' }
    }
  }, [])

  const register = useCallback(async (inviteCode: string, username: string, password: string, displayName?: string) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode, username, password, displayName }),
      })
      const data = await res.json()
      if (!res.ok) return { ok: false, error: data.error || 'Registration failed' }

      localStorage.setItem('mc_token', data.token)
      setToken(data.token)
      setUser(data.user)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err.message || 'Network error' }
    }
  }, [])

  const logout = useCallback(() => {
    const t = localStorage.getItem('mc_token')
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: t ? { 'Authorization': `Bearer ${t}` } : {},
    }).catch(() => {})
    localStorage.removeItem('mc_token')
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      login,
      register,
      logout,
      isAdmin: user?.role === 'admin',
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
