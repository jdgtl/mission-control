import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Activity, LogIn } from 'lucide-react'
import PageTransition from '../components/PageTransition'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await login(username, password)
    setLoading(false)

    if (result.ok) {
      navigate('/')
    } else {
      setError(result.error || 'Login failed')
    }
  }

  return (
    <PageTransition>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: 24,
      }}>
        {/* Logo */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 40,
        }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: '#007AFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Activity size={20} style={{ color: '#fff' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>Mission Control</h1>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>Sign in to continue</p>
          </div>
        </div>

        {/* Login Card */}
        <div className="glass-card" style={{
          width: '100%',
          maxWidth: 380,
          padding: 32,
          borderRadius: 16,
        }}>
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: 'rgba(255,69,58,0.15)',
                border: '1px solid rgba(255,69,58,0.3)',
                color: '#FF453A',
                fontSize: 13,
                marginBottom: 20,
              }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.9)',
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.9)',
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px 20px',
                borderRadius: 10,
                border: 'none',
                background: loading ? 'rgba(0,122,255,0.5)' : '#007AFF',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <LogIn size={16} />
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div style={{
            marginTop: 20,
            textAlign: 'center',
            fontSize: 12,
            color: 'rgba(255,255,255,0.4)',
          }}>
            Have an invite code?{' '}
            <Link to="/register" style={{ color: '#007AFF', textDecoration: 'none' }}>
              Create account
            </Link>
          </div>
        </div>
      </div>
    </PageTransition>
  )
}
