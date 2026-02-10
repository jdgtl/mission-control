import { useState } from 'react'
import { motion } from 'framer-motion'
import { Users, Shield, Copy, Check, UserX, UserCheck, Heart, Plus, RefreshCw } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import { AdminSkeleton } from '../components/SkeletonLoader'
import { useIsMobile } from '../lib/useIsMobile'
import GlassCard from '../components/GlassCard'
import StatusBadge from '../components/StatusBadge'
import { useApi, timeAgo } from '../lib/hooks'
import { apiFetch } from '../lib/api'

interface User {
  id: string
  username: string
  displayName: string
  role: 'admin' | 'user'
  gateway: { profile?: string; port?: number }
  createdAt: string
  disabled: boolean
}

interface GatewayHealth {
  userId: string
  username: string
  port: number
  healthy: boolean
}

export default function Admin() {
  const isMobile = useIsMobile()
  const { data: usersData, refetch: refetchUsers } = useApi<{ users: User[] }>('/api/admin/users', 30000)
  const { data: healthData, refetch: refetchHealth } = useApi<{ gateways: GatewayHealth[] }>('/api/admin/health', 30000)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [creating, setCreating] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  const users = usersData?.users || []
  const gateways = healthData?.gateways || []

  const getGatewayHealth = (userId: string) => {
    return gateways.find(g => g.userId === userId)
  }

  const handleCreateInvite = async () => {
    setCreating(true)
    try {
      const res = await apiFetch('/api/admin/invite', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setInviteCode(data.code)
        setCopied(false)
      }
    } catch (e) {
      console.error('Failed to create invite:', e)
    } finally {
      setCreating(false)
    }
  }

  const handleCopyCode = () => {
    if (inviteCode) {
      navigator.clipboard.writeText(inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleToggleUser = async (userId: string, currentlyDisabled: boolean) => {
    if (currentlyDisabled) {
      if (!confirm('Re-enable this user?')) return
      setToggling(userId)
      try {
        const res = await apiFetch(`/api/admin/users/${userId}`, { method: 'PATCH' })
        if (res.ok) refetchUsers()
      } catch (e) {
        console.error('Failed to re-enable user:', e)
      } finally {
        setToggling(null)
      }
      return
    }
    if (!confirm('Are you sure you want to disable this user?')) return
    setToggling(userId)
    try {
      const res = await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
      if (res.ok) refetchUsers()
    } catch (e) {
      console.error('Failed to disable user:', e)
    } finally {
      setToggling(null)
    }
  }

  const handleRefreshHealth = () => {
    refetchHealth()
  }

  const activeUsers = users.filter(u => !u.disabled)
  const adminCount = users.filter(u => u.role === 'admin').length
  const healthyGateways = gateways.filter(g => g.healthy).length

  if (!usersData) {
    return <AdminSkeleton isMobile={isMobile} />
  }

  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '16px' : '0', display: 'flex', flexDirection: 'column', gap: isMobile ? 16 : 24 }}>
        {/* Header */}
        <div>
          <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Shield size={22} style={{ color: '#FF9500' }} /> Admin Panel
          </h1>
          <p className="text-body" style={{ marginTop: 4 }}>Manage users, invites, and gateway health</p>
        </div>

        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 16 }}>
          {[
            { label: 'Total Users', value: users.length, color: '#007AFF' },
            { label: 'Active', value: activeUsers.length, color: '#32D74B' },
            { label: 'Admins', value: adminCount, color: '#FF9500' },
            { label: 'Gateways Up', value: `${healthyGateways}/${gateways.length}`, color: healthyGateways === gateways.length ? '#32D74B' : '#FF453A' },
          ].map((s, i) => (
            <GlassCard key={s.label} delay={0.05 + i * 0.03} noPad>
              <div style={{ padding: '16px 20px' }}>
                <p className="text-label" style={{ marginBottom: 8 }}>{s.label}</p>
                <p style={{ fontSize: 24, fontWeight: 300, color: s.color }}>{s.value}</p>
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Invite Code Section */}
        <GlassCard delay={0.1} noPad>
          <div style={{ padding: isMobile ? 16 : 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>Invite Codes</h2>
              <button
                onClick={handleCreateInvite}
                disabled={creating}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8,
                  border: 'none', background: '#007AFF', color: '#fff', fontSize: 12, cursor: 'pointer',
                  opacity: creating ? 0.5 : 1,
                }}
              >
                <Plus size={14} />
                <span>Generate Invite</span>
              </button>
            </div>

            {inviteCode && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', borderRadius: 10,
                  background: 'rgba(0,122,255,0.1)', border: '1px solid rgba(0,122,255,0.2)',
                }}
              >
                <code style={{ flex: 1, fontSize: 16, fontWeight: 600, color: '#007AFF', letterSpacing: 2 }}>
                  {inviteCode}
                </code>
                <button
                  onClick={handleCopyCode}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)',
                    color: copied ? '#32D74B' : 'rgba(255,255,255,0.65)', fontSize: 11, cursor: 'pointer',
                  }}
                >
                  {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
                </button>
              </motion.div>
            )}

            {!inviteCode && (
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
                Generate an invite code to allow a new user to register. Codes expire after 7 days and can be used once.
              </p>
            )}
          </div>
        </GlassCard>

        {/* Users List */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>Users</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {users.map((user, i) => {
              const health = getGatewayHealth(user.id)
              return (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i }}
                >
                  <GlassCard noPad>
                    <div style={{ padding: isMobile ? 16 : 20, display: 'flex', alignItems: 'center', gap: 16 }}>
                      {/* Avatar */}
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: user.role === 'admin' ? 'rgba(255,149,0,0.15)' : 'rgba(0,122,255,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        {user.role === 'admin'
                          ? <Shield size={18} style={{ color: '#FF9500' }} />
                          : <Users size={18} style={{ color: '#007AFF' }} />
                        }
                      </div>

                      {/* User Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>
                            {user.displayName}
                          </span>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                            @{user.username}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                          {user.gateway?.port && (
                            <span>Port {user.gateway.port}</span>
                          )}
                          <span>Joined {timeAgo(user.createdAt)}</span>
                        </div>
                      </div>

                      {/* Gateway Health */}
                      {health && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Heart size={14} style={{ color: health.healthy ? '#32D74B' : '#FF453A' }} />
                          <span style={{ fontSize: 11, color: health.healthy ? '#32D74B' : '#FF453A' }}>
                            {health.healthy ? 'Healthy' : 'Down'}
                          </span>
                        </div>
                      )}

                      {/* Status Badge */}
                      <StatusBadge
                        status={user.disabled ? 'off' : 'active'}
                        label={user.disabled ? 'disabled' : user.role}
                      />

                      {/* Actions */}
                      {user.role !== 'admin' && (
                        <button
                          onClick={() => handleToggleUser(user.id, user.disabled)}
                          disabled={toggling === user.id}
                          title={user.disabled ? 'Re-enable user' : 'Disable user'}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 32, height: 32, borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.08)',
                            background: 'rgba(255,255,255,0.04)',
                            color: user.disabled ? '#32D74B' : '#FF453A',
                            cursor: 'pointer',
                            opacity: toggling === user.id ? 0.5 : 1,
                          }}
                        >
                          {user.disabled ? <UserCheck size={14} /> : <UserX size={14} />}
                        </button>
                      )}
                    </div>
                  </GlassCard>
                </motion.div>
              )
            })}

            {users.length === 0 && (
              <GlassCard noPad>
                <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
                  No users found
                </div>
              </GlassCard>
            )}
          </div>
        </div>

        {/* Gateway Health */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>Gateway Health</h2>
            <button
              onClick={handleRefreshHealth}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)',
                color: 'rgba(255,255,255,0.65)', fontSize: 11, cursor: 'pointer',
              }}
            >
              <RefreshCw size={12} />
              <span>Refresh</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 12 }}>
            {gateways.map((gw, i) => (
              <motion.div
                key={gw.userId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
              >
                <GlassCard noPad>
                  <div style={{
                    padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12,
                    borderLeft: `3px solid ${gw.healthy ? '#32D74B' : '#FF453A'}`,
                    borderRadius: '12px',
                  }}>
                    <Heart size={16} style={{ color: gw.healthy ? '#32D74B' : '#FF453A' }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>
                        {gw.username}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.45)' }}>
                      :{gw.port}
                    </span>
                    <StatusBadge
                      status={gw.healthy ? 'active' : 'off'}
                      label={gw.healthy ? 'online' : 'offline'}
                    />
                  </div>
                </GlassCard>
              </motion.div>
            ))}

            {gateways.length === 0 && (
              <GlassCard noPad>
                <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
                  No gateways configured
                </div>
              </GlassCard>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  )
}
