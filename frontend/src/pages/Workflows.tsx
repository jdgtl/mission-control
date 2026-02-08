import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Play, Pause, Settings, Download, Trash2, ExternalLink, Clock, ChevronRight, Check, X, Plus } from 'lucide-react'
import GlassCard from '../components/GlassCard'

const useIsMobile = () => {
  const [m, setM] = useState(window.innerWidth < 768)
  useEffect(() => { const h = () => setM(window.innerWidth < 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h) }, [])
  return m
}

interface WorkflowStep {
  id: string; name: string; icon: string; description: string
  type: 'cron' | 'manual'; schedule?: string; task: string
}

interface WorkflowConfig {
  [key: string]: { label: string; type: string; default: any; description: string }
}

interface WorkflowMetric {
  id: string; label: string; icon: string; format?: string
}

interface Workflow {
  id: string; name: string; icon: string; description: string
  author: string; version: string; category: string; tags: string[]
  config: WorkflowConfig; steps: WorkflowStep[]; metrics: WorkflowMetric[]
  _enabled: boolean; _userConfig: Record<string, any>
  _enabledSteps: string[]; _metrics: Record<string, number>
}

const categoryColors: Record<string, string> = {
  Sales: '#FF9500', Marketing: '#AF52DE', Security: '#FF453A',
  Productivity: '#0A84FF', Monitoring: '#32D74B', Learning: '#FFD60A',
}

export default function Workflows() {
  const m = useIsMobile()
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [selected, setSelected] = useState<Workflow | null>(null)
  const [configuring, setConfiguring] = useState(false)
  const [configValues, setConfigValues] = useState<Record<string, any>>({})
  const [importing, setImporting] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchWorkflows = () => {
    fetch('/api/workflows').then(r => r.json()).then(d => {
      setWorkflows(d.workflows || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { fetchWorkflows() }, [])

  const toggleWorkflow = async (wf: Workflow) => {
    const newEnabled = !wf._enabled
    await fetch(`/api/workflows/${wf.id}/configure`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: newEnabled })
    })
    fetchWorkflows()
  }

  const saveConfig = async (wf: Workflow) => {
    await fetch(`/api/workflows/${wf.id}/configure`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: wf._enabled, values: configValues })
    })
    setConfiguring(false)
    fetchWorkflows()
  }

  const deleteWorkflow = async (wf: Workflow) => {
    if (!confirm(`Delete workflow "${wf.name}"?`)) return
    await fetch(`/api/workflows/${wf.id}`, { method: 'DELETE' })
    setSelected(null)
    fetchWorkflows()
  }

  const importWorkflow = async () => {
    if (!importUrl.trim()) return
    const res = await fetch('/api/workflows/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: importUrl })
    })
    if (res.ok) { setImporting(false); setImportUrl(''); fetchWorkflows() }
  }

  const openConfig = (wf: Workflow) => {
    const defaults: Record<string, any> = {}
    Object.entries(wf.config || {}).forEach(([k, v]) => {
      defaults[k] = wf._userConfig?.[k] ?? v.default
    })
    setConfigValues(defaults)
    setConfiguring(true)
  }

  // Detail view
  if (selected) {
    const wf = selected
    const catColor = categoryColors[wf.category] || '#0A84FF'

    return (
      <div style={{ padding: m ? 16 : 32, maxWidth: 900, margin: '0 auto' }}>
        {/* Back button */}
        <motion.button
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          onClick={() => { setSelected(null); setConfiguring(false) }}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 14 }}
        >
          <ArrowLeft size={16} /> Back to Workflows
        </motion.button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <span style={{ fontSize: 40 }}>{wf.icon}</span>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: m ? 22 : 28, fontWeight: 700, color: '#fff', margin: 0 }}>{wf.name}</h1>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: '4px 0 0' }}>{wf.description}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => toggleWorkflow(wf)}
              style={{
                padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                background: wf._enabled ? 'rgba(255,69,58,0.15)' : 'rgba(50,215,75,0.15)',
                color: wf._enabled ? '#FF453A' : '#32D74B',
              }}
            >
              {wf._enabled ? <><Pause size={14} /> Disable</> : <><Play size={14} /> Enable</>}
            </motion.button>
          </div>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: `${catColor}22`, color: catColor }}>{wf.category}</span>
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>by {wf.author}</span>
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>v{wf.version}</span>
          {wf.tags?.map(t => (
            <span key={t} style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>{t}</span>
          ))}
        </div>

        {/* Metrics */}
        {wf.metrics && wf.metrics.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(wf.metrics.length, 4)}, 1fr)`, gap: 12, marginBottom: 24 }}>
            {wf.metrics.map(metric => (
              <GlassCard key={metric.id} hover={false}>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: 20 }}>{metric.icon}</span>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '4px 0' }}>
                    {wf._metrics?.[metric.id] ?? '—'}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{metric.label}</div>
                </div>
              </GlassCard>
            ))}
          </div>
        )}

        {/* Steps */}
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.9)', marginBottom: 16 }}>Pipeline Steps</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {wf.steps.map((step, i) => (
            <GlassCard key={step.id} hover={false}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: step.type === 'manual' ? 'rgba(255,149,0,0.15)' : 'rgba(10,132,255,0.15)',
                  fontSize: 20, flexShrink: 0
                }}>
                  {step.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>STEP {i + 1}</span>
                    <span style={{
                      padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600,
                      background: step.type === 'manual' ? 'rgba(255,149,0,0.15)' : 'rgba(10,132,255,0.15)',
                      color: step.type === 'manual' ? '#FF9500' : '#0A84FF'
                    }}>
                      {step.type === 'manual' ? '👤 Manual' : '⏰ Automated'}
                    </span>
                  </div>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: '#fff', margin: '4px 0' }}>{step.name}</h3>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, margin: 0 }}>{step.description}</p>
                  {step.schedule && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                      <Clock size={10} /> {step.schedule}
                    </div>
                  )}
                </div>
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Config section */}
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.9)', margin: '24px 0 16px' }}>
          <Settings size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          Configuration
        </h2>

        {!configuring ? (
          <GlassCard hover={false}>
            <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: 16 }}>
              {Object.entries(wf.config || {}).map(([key, cfg]) => (
                <div key={key}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{cfg.label}</div>
                  <div style={{ fontSize: 14, color: '#fff', fontWeight: 500 }}>
                    {wf._userConfig?.[key] ?? cfg.default ?? '—'}
                  </div>
                </div>
              ))}
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => openConfig(wf)}
              style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
            >
              <Settings size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Edit Configuration
            </motion.button>
          </GlassCard>
        ) : (
          <GlassCard hover={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {Object.entries(wf.config || {}).map(([key, cfg]) => (
                <div key={key}>
                  <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 600, display: 'block', marginBottom: 4 }}>{cfg.label}</label>
                  <input
                    type={cfg.type === 'number' ? 'number' : 'text'}
                    value={configValues[key] ?? ''}
                    onChange={e => setConfigValues({ ...configValues, [key]: cfg.type === 'number' ? Number(e.target.value) : e.target.value })}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 14, outline: 'none',
                    }}
                  />
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{cfg.description}</div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8 }}>
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => saveConfig(wf)}
                  style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: '#0A84FF', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                >
                  <Check size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Save
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => setConfiguring(false)}
                  style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 13 }}
                >
                  Cancel
                </motion.button>
              </div>
            </div>
          </GlassCard>
        )}

        {/* Danger zone */}
        <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid rgba(255,69,58,0.2)' }}>
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }}
            onClick={() => deleteWorkflow(wf)}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,69,58,0.3)', background: 'rgba(255,69,58,0.1)', color: '#FF453A', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
          >
            <Trash2 size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Delete Workflow
          </motion.button>
        </div>
      </div>
    )
  }

  // List view
  return (
    <div style={{ padding: m ? 16 : 32, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: m ? 22 : 28, fontWeight: 700, color: '#fff', margin: 0 }}>⚡ Workflows</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: '4px 0 0' }}>
            Automated multi-step pipelines for your agent
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
          onClick={() => setImporting(true)}
          style={{
            padding: '8px 16px', borderRadius: 8, border: '1px dashed rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer',
            fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6
          }}
        >
          <Download size={14} /> Import
        </motion.button>
      </div>

      {/* Import modal */}
      <AnimatePresence>
        {importing && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            style={{ marginBottom: 16 }}
          >
            <GlassCard hover={false}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 12 }}>Import Workflow</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text" placeholder="Paste workflow URL or ClawHub link..."
                  value={importUrl} onChange={e => setImportUrl(e.target.value)}
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 13, outline: 'none'
                  }}
                />
                <motion.button whileTap={{ scale: 0.95 }} onClick={importWorkflow}
                  style={{ padding: '8px 16px', borderRadius: 8, background: '#0A84FF', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                  Import
                </motion.button>
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => setImporting(false)}
                  style={{ padding: '8px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
                  <X size={16} />
                </motion.button>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: m ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total', value: workflows.length, icon: '⚡' },
          { label: 'Active', value: workflows.filter(w => w._enabled).length, icon: '🟢', color: '#32D74B' },
          { label: 'Steps', value: workflows.reduce((a, w) => a + (w.steps?.length || 0), 0), icon: '📋' },
          { label: 'Categories', value: new Set(workflows.map(w => w.category)).size, icon: '🏷️' },
        ].map(stat => (
          <GlassCard key={stat.label} hover={false}>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: 16 }}>{stat.icon}</span>
              <div style={{ fontSize: 22, fontWeight: 700, color: stat.color || '#fff', margin: '2px 0' }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{stat.label}</div>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Workflow cards */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)' }}>Loading workflows...</div>
      ) : workflows.length === 0 ? (
        <GlassCard hover={false}>
          <div style={{ textAlign: 'center', padding: 40 }}>
            <span style={{ fontSize: 48 }}>⚡</span>
            <h3 style={{ color: '#fff', margin: '12px 0 8px' }}>No Workflows Yet</h3>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, maxWidth: 400, margin: '0 auto 16px' }}>
              Workflows are multi-step automation pipelines. Add workflow JSON files to the <code>workflows/</code> directory, or import one from a URL.
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => setImporting(true)}
              style={{ padding: '10px 24px', borderRadius: 8, background: '#0A84FF', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
            >
              <Plus size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Import Workflow
            </motion.button>
          </div>
        </GlassCard>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : 'repeat(2, 1fr)', gap: 16 }}>
          {workflows.map((wf, i) => {
            const catColor = categoryColors[wf.category] || '#0A84FF'
            return (
              <motion.div
                key={wf.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <GlassCard hover noPad>
                  <motion.div
                    whileHover={{ x: 2 }}
                    onClick={() => setSelected(wf)}
                    style={{ padding: m ? 16 : 20, cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                      <div style={{
                        width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: `${catColor}15`, fontSize: 26, flexShrink: 0
                      }}>
                        {wf.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#fff', margin: 0 }}>{wf.name}</h3>
                          {wf._enabled && (
                            <span style={{ width: 8, height: 8, borderRadius: 4, background: '#32D74B', flexShrink: 0 }} />
                          )}
                        </div>
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, margin: '0 0 8px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {wf.description}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 8, background: `${catColor}15`, color: catColor, fontWeight: 600 }}>{wf.category}</span>
                          <span>{wf.steps?.length || 0} steps</span>
                          <span style={{ marginLeft: 'auto' }}><ChevronRight size={14} /></span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </GlassCard>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
