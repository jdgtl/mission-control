import { useState, useEffect } from 'react'
import { Settings2, Save, RefreshCw, Shield, Database, Globe, Download, Upload, Clock, Zap, ArrowUpCircle, Loader2, Heart, FileText, Edit3, Eye, Lock } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import { SettingsSkeleton } from '../components/SkeletonLoader'
import { useIsMobile } from '../lib/useIsMobile'
import GlassCard from '../components/GlassCard'
import StatusBadge from '../components/StatusBadge'
import { useApi, timeAgo } from '../lib/hooks'
import { apiFetch } from '../lib/api'

export default function Settings() {
  const isMobile = useIsMobile()
  const { data: configData, loading } = useApi<any>('/api/settings')

  if (loading && !configData) {
    return <SettingsSkeleton isMobile={isMobile} />
  }

  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '16px' : '0', display: 'flex', flexDirection: 'column', gap: isMobile ? 16 : 24 }}>
        {/* Header */}
        <div>
          <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Settings2 size={22} style={{ color: '#007AFF' }} /> Settings
          </h1>
          <p className="text-body" style={{ marginTop: 4 }}>Gateway configuration, model routing & system status</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 16 : 20 }}>
          {/* Model Routing Card (read-only) */}
          <ModelRoutingCard isMobile={isMobile} />

          {/* OpenClaw Configuration Card */}
          <GlassCard noPad>
            <div style={{ padding: isMobile ? 16 : 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(191,90,242,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Shield size={18} style={{ color: '#BF5AF2' }} />
                </div>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>OpenClaw Configuration</h2>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  { label: 'Gateway Port', value: configData?.gateway_port || 18789 },
                  { label: 'Memory Path', value: configData?.memory_path || '...', mono: true },
                  { label: 'Skills Path', value: configData?.skills_path || '...', mono: true },
                  { label: 'AWS Region', value: configData?.bedrock_region || 'us-east-1', mono: true },
                ].map((item) => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', gap: 12 }}>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', flexShrink: 0 }}>{item.label}</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.92)', fontFamily: item.mono ? 'monospace' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{String(item.value)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>Status</span>
                  <StatusBadge status="active" label="Connected" />
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Change Password Card */}
          <ChangePasswordCard isMobile={isMobile} />

          {/* Heartbeat Status Card (read-only) */}
          <HeartbeatStatusCard isMobile={isMobile} />

          {/* System Information Card */}
          <SystemInfoCard isMobile={isMobile} />

          {/* Export/Import Configuration Card */}
          <ExportImportCard isMobile={isMobile} />

          {/* Roadmap Card */}
          <RoadmapCard isMobile={isMobile} />
        </div>
      </div>
    </PageTransition>
  )
}

function ChangePasswordCard({ isMobile }: { isMobile: boolean }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setStatus('error')
      setErrorMsg('Passwords do not match')
      return
    }
    if (newPassword.length < 6) {
      setStatus('error')
      setErrorMsg('Password must be at least 6 characters')
      return
    }
    setStatus('loading')
    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (res.ok) {
        setStatus('success')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setTimeout(() => setStatus('idle'), 3000)
      } else {
        setStatus('error')
        setErrorMsg(data.error || 'Failed to change password')
      }
    } catch {
      setStatus('error')
      setErrorMsg('Request failed')
    }
  }

  return (
    <GlassCard noPad>
      <div style={{ padding: isMobile ? 16 : 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(50,215,75,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lock size={18} style={{ color: '#32D74B' }} />
          </div>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>Change Password</h2>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>Current Password</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required
              style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 13, color: 'rgba(255,255,255,0.9)', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>New Password</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required minLength={6}
              style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 13, color: 'rgba(255,255,255,0.9)', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>Confirm New Password</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required minLength={6}
              style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 13, color: 'rgba(255,255,255,0.9)', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <button type="submit" disabled={status === 'loading' || !currentPassword || !newPassword || !confirmPassword}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 10, border: 'none', cursor: status === 'loading' ? 'not-allowed' : 'pointer',
              background: status === 'success' ? 'rgba(50,215,75,0.2)' : '#007AFF', color: '#fff', fontSize: 13, fontWeight: 600,
              opacity: status === 'loading' ? 0.6 : 1,
            }}>
            {status === 'loading' ? 'Updating...' : status === 'success' ? 'Password Updated' : 'Update Password'}
          </button>
          {status === 'error' && <p style={{ fontSize: 12, color: '#FF453A', textAlign: 'center' }}>{errorMsg}</p>}
        </form>
      </div>
    </GlassCard>
  )
}

function ModelRoutingCard({ isMobile }: { isMobile: boolean }) {
  const { data } = useApi<any>('/api/system/models', 60000)

  return (
    <GlassCard noPad>
      <div style={{ padding: isMobile ? 16 : 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,149,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={18} style={{ color: '#FF9500' }} />
          </div>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>Model Routing</h2>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>Configured via openclaw config</p>
          </div>
        </div>

        {!data ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Loading...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* Primary model */}
            <div style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Primary</span>
                <span style={{
                  fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                  background: 'rgba(50,215,75,0.15)', color: '#32D74B', border: '1px solid rgba(50,215,75,0.3)',
                }}>Active</span>
              </div>
              <p style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.92)', marginTop: 6 }}>
                {data.primary?.displayName || '...'}
              </p>
              {data.primary?.alias && (
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                  Alias: {data.primary.alias}
                </p>
              )}
            </div>

            {/* Fallbacks */}
            {data.fallbacks?.length > 0 && (
              <div style={{ paddingTop: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Fallbacks ({data.fallbacks.length})
                </span>
                {data.fallbacks.map((fb: any, i: number) => (
                  <div key={fb.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 0', borderBottom: i < data.fallbacks.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                  }}>
                    <div>
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>{fb.displayName}</p>
                      {fb.alias && <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{fb.alias}</p>}
                    </div>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>#{i + 1}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </GlassCard>
  )
}

function HeartbeatStatusCard({ isMobile }: { isMobile: boolean }) {
  const { data } = useApi<any>('/api/system/heartbeat', 30000)

  return (
    <GlassCard noPad>
      <div style={{ padding: isMobile ? 16 : 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,69,58,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Heart size={18} style={{ color: '#FF453A' }} />
          </div>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>Heartbeat Status</h2>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>Live system heartbeat data</p>
          </div>
        </div>

        {!data ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Loading...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[
              { label: 'Interval', value: data.interval || '—' },
              {
                label: 'Last Run',
                value: data.lastEvent?.time ? timeAgo(data.lastEvent.time) : '—',
              },
              {
                label: 'Status',
                value: data.lastEvent?.status || '—',
                badge: data.lastEvent?.status === 'ok' || data.lastEvent?.status === 'ok-token'
                  ? 'active' : data.lastEvent?.status ? 'error' : undefined,
              },
              { label: 'Channel', value: data.lastEvent?.channel || '—' },
              { label: 'Reason', value: data.lastEvent?.reason || '—' },
              {
                label: 'Duration',
                value: data.lastEvent?.durationMs ? `${(data.lastEvent.durationMs / 1000).toFixed(1)}s` : '—',
              },
            ].map((item) => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>{item.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {item.badge ? (
                    <StatusBadge status={item.badge as any} label={item.value} />
                  ) : (
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.92)' }}>{item.value}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </GlassCard>
  )
}

function SystemInfoCard({ isMobile }: { isMobile: boolean }) {
  const { data: sysInfo } = useApi<any>('/api/system/info', 60000)
  const [updating, setUpdating] = useState(false)
  const [updateMsg, setUpdateMsg] = useState<string | null>(null)

  const handleUpdate = async () => {
    if (updating) return
    setUpdating(true)
    setUpdateMsg(null)
    try {
      const res = await apiFetch('/api/system/update', { method: 'POST' })
      const result = await res.json()
      setUpdateMsg(result.message || 'Update triggered')
      if (result.status === 'updating') {
        setTimeout(() => window.location.reload(), 15000)
      }
    } catch {
      setUpdateMsg('Update request sent — reloading...')
      setTimeout(() => window.location.reload(), 10000)
    } finally {
      setUpdating(false)
    }
  }

  const formatUptime = (seconds: number) => {
    if (!seconds) return '—'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  const rows = sysInfo ? [
    { label: 'Mission Control', value: `v${sysInfo.missionControlVersion}` },
    { label: 'OpenClaw', value: `v${sysInfo.openclawVersion}`, highlight: sysInfo.updateAvailable },
    { label: 'Node.js', value: sysInfo.nodeVersion },
    { label: 'Platform', value: sysInfo.platform },
    { label: 'MC Uptime', value: formatUptime(sysInfo.uptime) },
  ] : [
    { label: 'Mission Control', value: '...' },
    { label: 'OpenClaw', value: '...' },
    { label: 'Node.js', value: '...' },
    { label: 'Platform', value: '...' },
  ]

  return (
    <GlassCard noPad>
      <div style={{ padding: isMobile ? 16 : 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,149,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Database size={18} style={{ color: '#FF9500' }} />
          </div>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>System Information</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {rows.map((item) => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>{item.label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.92)' }}>{item.value}</span>
                {item.highlight && (
                  <span style={{
                    fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                    background: 'rgba(255,149,0,0.15)', color: '#FF9500', border: '1px solid rgba(255,149,0,0.3)',
                  }}>
                    Update
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {sysInfo?.updateAvailable && (
          <div style={{ marginTop: 16 }}>
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: 'rgba(255,149,0,0.08)', border: '1px solid rgba(255,149,0,0.2)',
              marginBottom: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <ArrowUpCircle size={14} style={{ color: '#FF9500' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#FF9500' }}>Update Available</span>
              </div>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{sysInfo.updateDetail}</p>
            </div>

            <button
              onClick={handleUpdate}
              disabled={updating}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px 16px', borderRadius: 10, border: 'none',
                cursor: updating ? 'not-allowed' : 'pointer',
                background: updating ? 'rgba(255,149,0,0.3)' : '#FF9500',
                color: '#fff', fontSize: 13, fontWeight: 500,
                opacity: updating ? 0.5 : 1,
                transition: 'all 0.2s',
              }}
            >
              {updating ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Updating...</span>
                </>
              ) : (
                <>
                  <ArrowUpCircle size={16} />
                  <span>Update Now</span>
                </>
              )}
            </button>
          </div>
        )}

        {updateMsg && (
          <div style={{
            marginTop: 12, padding: '8px 12px', borderRadius: 6,
            background: 'rgba(255,149,0,0.1)', border: '1px solid rgba(255,149,0,0.3)',
            fontSize: 11, color: '#FF9500',
          }}>
            {updateMsg}
          </div>
        )}
      </div>
    </GlassCard>
  )
}

function ExportImportCard({ isMobile }: { isMobile: boolean }) {
  const [importing, setImporting] = useState(false)
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const handleExport = () => {
    window.location.href = '/api/settings/export'
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setImportStatus('idle')

    try {
      const formData = new FormData()
      formData.append('config', file)

      const res = await apiFetch('/api/settings/import', {
        method: 'POST',
        body: formData
      })

      if (res.ok) {
        setImportStatus('success')
        setTimeout(() => setImportStatus('idle'), 3000)
      } else {
        setImportStatus('error')
        setTimeout(() => setImportStatus('idle'), 3000)
      }
    } catch (e) {
      setImportStatus('error')
      setTimeout(() => setImportStatus('idle'), 3000)
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  return (
    <GlassCard noPad>
      <div style={{ padding: isMobile ? 16 : 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(50,215,75,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Globe size={18} style={{ color: '#32D74B' }} />
          </div>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>Export / Import</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            onClick={handleExport}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              border: '1px solid rgba(50,215,75,0.3)', background: 'rgba(50,215,75,0.1)',
              color: '#32D74B', fontSize: 13, cursor: 'pointer', fontWeight: 500,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(50,215,75,0.2)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(50,215,75,0.1)' }}
          >
            <Download size={16} />
            Export Configuration
          </button>

          <div style={{ position: 'relative' }}>
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              disabled={importing}
              style={{
                position: 'absolute', width: '100%', height: '100%', opacity: 0, cursor: importing ? 'not-allowed' : 'pointer'
              }}
            />
            <button
              disabled={importing}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                border: '1px solid rgba(0,122,255,0.3)', background: 'rgba(0,122,255,0.1)',
                color: '#007AFF', fontSize: 13, cursor: importing ? 'not-allowed' : 'pointer', fontWeight: 500,
                opacity: importing ? 0.5 : 1,
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { if (!importing) e.currentTarget.style.background = 'rgba(0,122,255,0.2)' }}
              onMouseLeave={(e) => { if (!importing) e.currentTarget.style.background = 'rgba(0,122,255,0.1)' }}
            >
              {importing ? (
                <>
                  <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <Upload size={16} />
                  <span>Import Configuration</span>
                </>
              )}
            </button>
          </div>

          {importStatus === 'success' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#32D74B', fontSize: 12 }}>
              <span className="status-dot status-dot-green" />
              Configuration imported successfully. Restart required.
            </div>
          )}
          {importStatus === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#FF453A', fontSize: 12 }}>
              <span className="status-dot status-dot-red" />
              Failed to import configuration
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  )
}

function RoadmapCard({ isMobile }: { isMobile: boolean }) {
  const { data, refetch } = useApi<{ content: string }>('/api/system/enhancements')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data?.content) setDraft(data.content)
  }, [data])

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiFetch('/api/system/enhancements', {
        method: 'POST',
        body: JSON.stringify({ content: draft })
      })
      setEditing(false)
      refetch()
    } catch {} finally {
      setSaving(false)
    }
  }

  // Simple markdown renderer for checkboxes, headers, bold
  const renderMarkdown = (text: string) => {
    if (!text) return <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No roadmap items yet.</p>
    return text.split('\n').map((line, i) => {
      const trimmed = line.trimStart()
      // H1
      if (trimmed.startsWith('# ')) return <h3 key={i} style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.92)', marginTop: i > 0 ? 16 : 0, marginBottom: 4 }}>{trimmed.slice(2)}</h3>
      // H2
      if (trimmed.startsWith('## ')) return <h4 key={i} style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginTop: 12, marginBottom: 4 }}>{trimmed.slice(3)}</h4>
      // Checked checkbox
      if (trimmed.startsWith('- [x] ')) return (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '3px 0' }}>
          <span style={{ color: '#32D74B', fontSize: 14, lineHeight: '18px', flexShrink: 0 }}>&#10003;</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', textDecoration: 'line-through' }}>{renderInline(trimmed.slice(6))}</span>
        </div>
      )
      // Unchecked checkbox
      if (trimmed.startsWith('- [ ] ')) return (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '3px 0' }}>
          <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 14, lineHeight: '18px', flexShrink: 0 }}>&#9675;</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>{renderInline(trimmed.slice(6))}</span>
        </div>
      )
      // Blank line
      if (!trimmed) return <div key={i} style={{ height: 6 }} />
      // Regular text
      return <p key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', padding: '1px 0' }}>{renderInline(trimmed)}</p>
    })
  }

  const renderInline = (text: string) => {
    // Bold: **text**
    const parts = text.split(/\*\*(.*?)\*\*/)
    return parts.map((part, i) => i % 2 === 1
      ? <strong key={i} style={{ fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>{part}</strong>
      : <span key={i}>{part}</span>
    )
  }

  return (
    <GlassCard noPad>
      <div style={{ padding: isMobile ? 16 : 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,122,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={18} style={{ color: '#007AFF' }} />
            </div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>Roadmap</h2>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>enhancements.md</p>
            </div>
          </div>
          <button
            onClick={() => { if (editing) { setDraft(data?.content || ''); } setEditing(!editing) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8,
              border: '1px solid rgba(0,122,255,0.3)', background: editing ? 'rgba(0,122,255,0.15)' : 'rgba(0,122,255,0.08)',
              color: '#007AFF', fontSize: 11, fontWeight: 500, cursor: 'pointer',
            }}
          >
            {editing ? <><Eye size={12} /> View</> : <><Edit3 size={12} /> Edit</>}
          </button>
        </div>

        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={{
                width: '100%', minHeight: 280, padding: 14, borderRadius: 10,
                border: '1px solid rgba(0,122,255,0.2)', background: 'rgba(255,255,255,0.03)',
                color: 'rgba(255,255,255,0.85)', fontSize: 12, fontFamily: 'monospace',
                lineHeight: 1.6, resize: 'vertical',
              }}
            />
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '10px 16px', borderRadius: 10, border: 'none',
                background: '#007AFF', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}
            >
              {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
              Save
            </button>
          </div>
        ) : (
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {renderMarkdown(data?.content || '')}
          </div>
        )}
      </div>
    </GlassCard>
  )
}
