import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Activity, UserPlus } from 'lucide-react'
import PageTransition from '../components/PageTransition'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [inviteCode, setInviteCode] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    const result = await register(inviteCode, username, password, displayName || undefined)
    setLoading(false)

    if (result.ok) {
      navigate('/')
    } else {
      setError(result.error || 'Registration failed')
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box' as const,
  }

  const labelStyle = {
    display: 'block' as const,
    fontSize: 12,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 6,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#007AFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={20} style={{ color: '#fff' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>Create Account</h1>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>Enter your invite code to get started</p>
          </div>
        </div>

        <div className="glass-card" style={{ width: '100%', maxWidth: 380, padding: 32, borderRadius: 16 }}>
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
              <label style={labelStyle}>Invite Code</label>
              <input
                type="text"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                placeholder="Enter 8-character code"
                autoFocus
                required
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                required
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Display Name (optional)</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder={username || 'Your name'}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                style={inputStyle}
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
              <UserPlus size={16} />
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#007AFF', textDecoration: 'none' }}>Sign in</Link>
          </div>
        </div>
      </div>
    </PageTransition>
  )
}
