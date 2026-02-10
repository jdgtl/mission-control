import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Puzzle, Download, Trash2, ToggleLeft, ToggleRight, Package, FolderOpen, Code, Search, X, ExternalLink, Check, AlertCircle, Key, ChevronRight, Zap, Settings } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import { SkillsSkeleton } from '../components/SkeletonLoader'
import { useIsMobile } from '../lib/useIsMobile'
import GlassCard from '../components/GlassCard'
import StatusBadge from '../components/StatusBadge'
import { useApi } from '../lib/hooks'
import { apiFetch } from '../lib/api'

interface SkillDeps {
  bins: Record<string, boolean>
  env: Record<string, boolean>
  config: Record<string, boolean>
  ready: boolean
}

interface Skill {
  name: string
  description: string
  version?: string
  author?: string
  status: 'active' | 'inactive' | 'available'
  installed: boolean
  path?: string
  type?: 'workspace' | 'system' | 'custom'
  emoji?: string
  requires?: { bins?: string[], anyBins?: string[], env?: string[], config?: string[] }
  primaryEnv?: string
  install?: Array<{ id: string, kind: string, label: string }>
  os?: string[]
  deps?: SkillDeps
  hasApiKey?: boolean
  homepage?: string
}

interface SkillsResponse {
  installed: Skill[]
  available: Skill[]
  categories: Record<string, string[]>
}

export default function Skills() {
  const isMobile = useIsMobile()
  const { data: skillsData, loading, refetch } = useApi<SkillsResponse>('/api/skills')
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  const allSkills = useMemo(() => {
    if (!skillsData) return []
    return [...(skillsData.installed || []), ...(skillsData.available || [])]
  }, [skillsData])

  const filteredSkills = useMemo(() => {
    let skills = allSkills
    // Category filter
    if (activeCategory === 'installed') {
      skills = skills.filter(s => s.installed)
    } else if (activeCategory === 'available') {
      skills = skills.filter(s => !s.installed)
    } else if (activeCategory !== 'all' && skillsData?.categories) {
      const catSkills = skillsData.categories[activeCategory] || []
      skills = skills.filter(s => catSkills.includes(s.name))
    }
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      skills = skills.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q)
      )
    }
    return skills
  }, [allSkills, activeCategory, searchQuery, skillsData])

  const selectedSkillData = useMemo(() => {
    if (!selectedSkill) return null
    return allSkills.find(s => s.name === selectedSkill) || null
  }, [selectedSkill, allSkills])

  const stats = useMemo(() => {
    if (!skillsData) return { installed: 0, active: 0, ready: 0, needSetup: 0 }
    const inst = skillsData.installed || []
    return {
      installed: inst.length,
      active: inst.filter(s => s.status === 'active').length,
      ready: inst.filter(s => s.deps?.ready).length,
      needSetup: inst.filter(s => !s.deps?.ready).length,
    }
  }, [skillsData])

  const categoryTabs = useMemo(() => {
    const tabs: Array<{ key: string, label: string, count: number }> = [
      { key: 'all', label: 'All', count: allSkills.length },
      { key: 'installed', label: 'Installed', count: skillsData?.installed?.length || 0 },
      { key: 'available', label: 'Available', count: skillsData?.available?.length || 0 },
    ]
    if (skillsData?.categories) {
      for (const [cat, names] of Object.entries(skillsData.categories)) {
        const count = allSkills.filter(s => names.includes(s.name)).length
        if (count > 0) tabs.push({ key: cat, label: cat, count })
      }
    }
    return tabs
  }, [skillsData, allSkills])

  const handleToggleSkill = async (skillName: string) => {
    setToggling(skillName)
    try {
      const response = await apiFetch(`/api/skills/${skillName}/toggle`, { method: 'POST' })
      if (response.ok) refetch()
    } catch (error) {
      console.error('Failed to toggle skill:', error)
    } finally {
      setToggling(null)
    }
  }

  const handleInstallSkill = async (skillName: string, apiKey?: string) => {
    setSaving(true)
    try {
      const body: Record<string, string> = {}
      if (apiKey) body.apiKey = apiKey
      const response = await apiFetch(`/api/skills/${skillName}/install`, {
        method: 'POST',
        body: JSON.stringify(body)
      })
      if (response.ok) {
        setApiKeyInput('')
        setSelectedSkill(null)
        refetch()
      }
    } catch (error) {
      console.error('Failed to install skill:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleConfigureSkill = async (skillName: string, apiKey: string) => {
    setSaving(true)
    try {
      const response = await apiFetch(`/api/skills/${skillName}/configure`, {
        method: 'POST',
        body: JSON.stringify({ apiKey })
      })
      if (response.ok) {
        setApiKeyInput('')
        refetch()
      }
    } catch (error) {
      console.error('Failed to configure skill:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleUninstallSkill = async (skillName: string) => {
    if (!confirm(`Remove "${skillName}" from your config?`)) return
    setSaving(true)
    try {
      const response = await apiFetch(`/api/skills/${skillName}/uninstall`, { method: 'POST' })
      if (response.ok) {
        setSelectedSkill(null)
        refetch()
      }
    } catch (error) {
      console.error('Failed to uninstall skill:', error)
    } finally {
      setSaving(false)
    }
  }

  const openDetail = (skill: Skill) => {
    setSelectedSkill(skill.name)
    setApiKeyInput('')
  }

  const getTypeIcon = (type?: string) => {
    switch (type) {
      case 'system': return <Package size={14} style={{ color: '#007AFF' }} />
      case 'workspace': return <FolderOpen size={14} style={{ color: '#32D74B' }} />
      default: return <Code size={14} style={{ color: '#BF5AF2' }} />
    }
  }

  if (loading && !skillsData) {
    return <SkillsSkeleton isMobile={isMobile} />
  }

  const m = isMobile

  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: m ? '16px' : '0', display: 'flex', flexDirection: 'column', gap: m ? 16 : 24 }}>
        {/* Header */}
        <div>
          <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Puzzle size={22} style={{ color: '#BF5AF2' }} /> Skills Manager
          </h1>
          <p className="text-body" style={{ marginTop: 4 }}>Discover, install, and configure skills that extend your agent's capabilities</p>
        </div>

        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: m ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 16 }}>
          {[
            { label: 'Installed', value: stats.installed, color: '#007AFF' },
            { label: 'Active', value: stats.active, color: '#32D74B' },
            { label: 'Ready', value: stats.ready, color: '#30D158' },
            { label: 'Need Setup', value: stats.needSetup, color: '#FF9500' },
          ].map((s, i) => (
            <GlassCard key={s.label} delay={0.05 + i * 0.03} noPad>
              <div style={{ padding: '16px 20px' }}>
                <p className="text-label" style={{ marginBottom: 8 }}>{s.label}</p>
                <p style={{ fontSize: 24, fontWeight: 300, color: s.color }}>{s.value}</p>
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Search Bar */}
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)' }} />
          <input
            type="text"
            placeholder="Search skills by name or description..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 14px 12px 40px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)',
              color: '#fff',
              fontSize: 13,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', padding: 4 }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Category Tabs */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
          {categoryTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveCategory(tab.key)}
              style={{
                padding: '7px 14px',
                borderRadius: 10,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
                border: activeCategory === tab.key ? '1px solid rgba(0,122,255,0.4)' : '1px solid rgba(255,255,255,0.08)',
                background: activeCategory === tab.key ? 'rgba(0,122,255,0.15)' : 'rgba(255,255,255,0.04)',
                color: activeCategory === tab.key ? '#fff' : 'rgba(255,255,255,0.55)',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {tab.label}
              <span style={{
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 8,
                background: activeCategory === tab.key ? 'rgba(0,122,255,0.3)' : 'rgba(255,255,255,0.06)',
                color: activeCategory === tab.key ? '#fff' : 'rgba(255,255,255,0.4)',
              }}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Skills Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {filteredSkills.length === 0 ? (
            <GlassCard noPad>
              <div style={{ padding: m ? 16 : 24, textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
                {searchQuery ? `No skills matching "${searchQuery}"` : 'No skills found'}
              </div>
            </GlassCard>
          ) : (
            filteredSkills.map((skill) => (
              <motion.div
                key={skill.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.01, translateY: -2 }}
                transition={{ duration: 0.2 }}
                onClick={() => openDetail(skill)}
                style={{ cursor: 'pointer' }}
              >
                <GlassCard noPad>
                  <div style={{ padding: m ? 14 : 18 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 }}>
                        {/* Emoji or type icon */}
                        <div style={{ fontSize: 22, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>
                          {skill.emoji || <span style={{ display: 'inline-flex' }}>{getTypeIcon(skill.type)}</span>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.92)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{skill.name}</h3>
                            {/* Readiness dot */}
                            {skill.installed && skill.deps && (
                              <span style={{
                                width: 7,
                                height: 7,
                                borderRadius: '50%',
                                background: skill.deps.ready ? '#30D158' : '#FF9500',
                                flexShrink: 0,
                              }} />
                            )}
                          </div>
                          <p style={{
                            fontSize: 12,
                            color: 'rgba(255,255,255,0.55)',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            lineHeight: 1.5,
                          }}>
                            {skill.description || 'No description available'}
                          </p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <StatusBadge
                          status={skill.status === 'active' ? 'active' : skill.status === 'inactive' ? 'idle' : 'off'}
                          label={skill.status === 'active' ? 'Active' : skill.status === 'inactive' ? 'Inactive' : 'Available'}
                        />
                        <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.25)' }} />
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Detail / Config Panel (Modal) */}
      <AnimatePresence>
        {selectedSkillData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
              zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            }}
            onClick={() => setSelectedSkill(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'rgba(28, 28, 30, 0.95)', backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: m ? 12 : 16,
                padding: m ? 20 : 32, width: '100%', maxWidth: m ? '95vw' : 520,
                maxHeight: '90vh', overflowY: 'auto',
              }}
            >
              {/* Modal Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 32 }}>{selectedSkillData.emoji || '🧩'}</span>
                  <div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>{selectedSkillData.name}</h2>
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 4, lineHeight: 1.5 }}>{selectedSkillData.description}</p>
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setSelectedSkill(null)}
                  style={{
                    background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8,
                    width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  <X size={16} style={{ color: 'rgba(255,255,255,0.6)' }} />
                </motion.button>
              </div>

              {/* Homepage Link */}
              {selectedSkillData.homepage && (
                <a
                  href={selectedSkillData.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#007AFF', marginBottom: 20, textDecoration: 'none' }}
                >
                  <ExternalLink size={12} /> {selectedSkillData.homepage}
                </a>
              )}

              {/* Type + Status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                  {getTypeIcon(selectedSkillData.type)} {selectedSkillData.type || 'custom'}
                </div>
                <StatusBadge
                  status={selectedSkillData.status === 'active' ? 'active' : selectedSkillData.status === 'inactive' ? 'idle' : 'off'}
                  label={selectedSkillData.status === 'active' ? 'Active' : selectedSkillData.status === 'inactive' ? 'Inactive' : 'Available'}
                />
                {selectedSkillData.deps && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: selectedSkillData.deps.ready ? '#30D158' : '#FF9500' }}>
                    {selectedSkillData.deps.ready ? <Check size={12} /> : <AlertCircle size={12} />}
                    {selectedSkillData.deps.ready ? 'Ready' : 'Needs setup'}
                  </div>
                )}
              </div>

              {/* Requirements Checklist */}
              {selectedSkillData.deps && (Object.keys(selectedSkillData.deps.bins).length > 0 || Object.keys(selectedSkillData.deps.env).length > 0 || Object.keys(selectedSkillData.deps.config).length > 0) && (
                <div style={{ marginBottom: 20, padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Settings size={13} /> Requirements
                  </div>
                  {Object.entries(selectedSkillData.deps.bins).map(([bin, ok]) => (
                    <div key={bin} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: ok ? '#30D158' : '#FF453A', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>{bin}</span>
                      <span style={{ fontSize: 11, color: ok ? 'rgba(255,255,255,0.35)' : '#FF453A' }}>{ok ? 'installed' : 'missing'}</span>
                    </div>
                  ))}
                  {Object.entries(selectedSkillData.deps.env).map(([env, ok]) => (
                    <div key={env} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: ok ? '#30D158' : '#FF453A', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>{env}</span>
                      <span style={{ fontSize: 11, color: ok ? 'rgba(255,255,255,0.35)' : '#FF453A' }}>{ok ? 'set' : 'not set'}</span>
                    </div>
                  ))}
                  {Object.entries(selectedSkillData.deps.config).map(([cfg, ok]) => (
                    <div key={cfg} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: ok ? '#30D158' : '#FF453A', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>{cfg}</span>
                      <span style={{ fontSize: 11, color: ok ? 'rgba(255,255,255,0.35)' : '#FF453A' }}>{ok ? 'configured' : 'not configured'}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Install hints for missing binaries */}
              {selectedSkillData.install && selectedSkillData.deps && Object.values(selectedSkillData.deps.bins).some(v => !v) && (
                <div style={{ marginBottom: 20, padding: 16, borderRadius: 12, background: 'rgba(255,149,0,0.06)', border: '1px solid rgba(255,149,0,0.15)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#FF9500', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Zap size={13} /> Install Methods
                  </div>
                  {selectedSkillData.install.map((m) => (
                    <div key={m.id} style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 4 }}>
                      {m.label}
                    </div>
                  ))}
                </div>
              )}

              {/* API Key Section */}
              {(selectedSkillData.primaryEnv || (selectedSkillData.requires?.env && selectedSkillData.requires.env.length > 0)) && (
                <div style={{ marginBottom: 24, padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Key size={13} /> API Key
                    {selectedSkillData.primaryEnv && (
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', fontWeight: 400 }}>({selectedSkillData.primaryEnv})</span>
                    )}
                  </div>
                  {selectedSkillData.hasApiKey ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#30D158' }} />
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>API key is configured</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF453A' }} />
                      <span style={{ fontSize: 12, color: '#FF453A' }}>Not set</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="password"
                      placeholder={selectedSkillData.hasApiKey ? 'Enter new key to replace...' : 'Paste your API key...'}
                      value={apiKeyInput}
                      onChange={e => setApiKeyInput(e.target.value)}
                      style={{
                        flex: 1, padding: '10px 14px', borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)',
                        color: '#fff', fontSize: 12, outline: 'none', fontFamily: 'monospace',
                      }}
                    />
                    {selectedSkillData.installed && (
                      <button
                        onClick={() => handleConfigureSkill(selectedSkillData.name, apiKeyInput)}
                        disabled={!apiKeyInput || saving}
                        style={{
                          padding: '10px 16px', borderRadius: 10, border: 'none',
                          background: apiKeyInput ? '#007AFF' : 'rgba(255,255,255,0.06)',
                          color: apiKeyInput ? '#fff' : 'rgba(255,255,255,0.3)',
                          fontSize: 12, fontWeight: 600, cursor: apiKeyInput ? 'pointer' : 'default',
                          opacity: saving ? 0.5 : 1,
                        }}
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {selectedSkillData.installed ? (
                  <>
                    <button
                      onClick={() => handleToggleSkill(selectedSkillData.name)}
                      disabled={toggling === selectedSkillData.name}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.08)',
                        background: selectedSkillData.status === 'active' ? 'rgba(52,215,75,0.15)' : 'rgba(255,255,255,0.04)',
                        color: selectedSkillData.status === 'active' ? '#32D74B' : 'rgba(255,255,255,0.65)',
                        fontSize: 13, fontWeight: 500, cursor: 'pointer',
                        opacity: toggling === selectedSkillData.name ? 0.5 : 1,
                      }}
                    >
                      {selectedSkillData.status === 'active' ? (
                        <><ToggleRight size={16} style={{ color: '#32D74B' }} /> Enabled</>
                      ) : (
                        <><ToggleLeft size={16} style={{ color: '#8E8E93' }} /> Disabled</>
                      )}
                    </button>
                    <button
                      onClick={() => handleUninstallSkill(selectedSkillData.name)}
                      disabled={saving}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)',
                        color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                        opacity: saving ? 0.5 : 1,
                      }}
                    >
                      <Trash2 size={14} style={{ color: '#FF453A' }} /> Remove
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleInstallSkill(selectedSkillData.name, apiKeyInput || undefined)}
                    disabled={saving}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10,
                      border: 'none', background: '#007AFF', color: '#fff',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      opacity: saving ? 0.5 : 1,
                    }}
                  >
                    <Download size={16} />
                    {saving ? 'Installing...' : 'Install & Enable'}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  )
}
