import PageTransition from './PageTransition'

// ── Primitives ──────────────────────────────────────────────

export function SkeletonLine({ width = '100%', height = 14 }: { width?: string | number; height?: number }) {
  return <div className="skeleton-bone" style={{ width, height, flexShrink: 0 }} />
}

export function SkeletonCircle({ size = 32 }: { size?: number }) {
  return <div className="skeleton-bone-circle" style={{ width: size, height: size, flexShrink: 0 }} />
}

export function SkeletonBlock({ width = '100%', height = 120 }: { width?: string | number; height?: number }) {
  return <div className="skeleton-bone" style={{ width, height, borderRadius: 12 }} />
}

// ── Composed Helpers ────────────────────────────────────────

function SkeletonStatCard({ m }: { m?: boolean }) {
  return (
    <div className="macos-panel" style={{ padding: m ? '12px 14px' : 20, borderRadius: m ? 12 : 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <SkeletonCircle size={28} />
        <SkeletonLine width={60} height={10} />
      </div>
      <SkeletonLine width={80} height={m ? 22 : 28} />
    </div>
  )
}

function SkeletonListItem({ m }: { m?: boolean }) {
  return (
    <div className="macos-panel" style={{ padding: m ? 14 : '16px 20px', borderRadius: m ? 12 : 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <SkeletonCircle size={m ? 40 : 44} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <SkeletonLine width="60%" height={13} />
          <SkeletonLine width="40%" height={11} />
        </div>
        <SkeletonLine width={60} height={11} />
      </div>
    </div>
  )
}

function SkeletonCard({ m, height = 160 }: { m?: boolean; height?: number }) {
  return (
    <div className="macos-panel" style={{ padding: m ? 14 : 20, borderRadius: m ? 12 : 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <SkeletonCircle size={48} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <SkeletonLine width="70%" height={13} />
          <SkeletonLine width="50%" height={11} />
          <SkeletonLine width="30%" height={10} />
        </div>
      </div>
      <SkeletonLine width="90%" height={12} />
      <div style={{ marginTop: 8 }}>
        <SkeletonLine width="60%" height={12} />
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
        <SkeletonLine width={80} height={11} />
        <SkeletonLine width={80} height={11} />
      </div>
    </div>
  )
}

function SkeletonSettingsCard({ m }: { m?: boolean }) {
  return (
    <div className="macos-panel" style={{ padding: m ? 16 : 24, borderRadius: m ? 12 : 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <SkeletonCircle size={36} />
        <SkeletonLine width={140} height={15} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <SkeletonLine width={100} height={13} />
            <SkeletonLine width={120} height={12} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Page Skeletons ──────────────────────────────────────────

export function DashboardSkeleton({ isMobile: m }: { isMobile?: boolean }) {
  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: m ? 16 : 28 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <SkeletonLine width={140} height={24} />
            <SkeletonLine width={280} height={14} />
          </div>
          <SkeletonLine width={60} height={24} />
        </div>

        {/* Hero Status Card */}
        <div className="macos-panel" style={{ padding: m ? 16 : 24, borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <SkeletonCircle size={40} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <SkeletonLine width={120} height={14} />
              <SkeletonLine width={200} height={11} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, justifyContent: m ? 'space-around' : 'flex-end', paddingTop: 16 }}>
            <SkeletonLine width={80} height={30} />
            <SkeletonLine width={80} height={30} />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="macos-panel" style={{ padding: m ? 14 : 20, borderRadius: 16 }}>
          <SkeletonLine width={100} height={13} />
          <div style={{ display: 'flex', flexDirection: m ? 'column' : 'row', gap: m ? 10 : 12, marginTop: 12 }}>
            {[1, 2, 3].map(i => <SkeletonBlock key={i} height={40} />)}
          </div>
        </div>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: m ? 10 : 20 }}>
          {[1, 2, 3, 4].map(i => <SkeletonStatCard key={i} m={m} />)}
        </div>

        {/* Activity Feed + Sidebar */}
        <div style={{ display: 'flex', flexDirection: m ? 'column' : 'row', gap: m ? 16 : 24 }}>
          <div style={{ flex: m ? undefined : 1.5 }}>
            <div className="macos-panel" style={{ padding: m ? 14 : 24, borderRadius: 16 }}>
              <SkeletonLine width={120} height={14} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
                {[1, 2, 3, 4].map(i => (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <SkeletonCircle size={32} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <SkeletonLine width="70%" height={12} />
                      <SkeletonLine width="50%" height={11} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: m ? 12 : 20 }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="macos-panel" style={{ padding: m ? 14 : 24, borderRadius: 16 }}>
                <SkeletonLine width={100} height={13} />
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <SkeletonLine width="80%" height={12} />
                  <SkeletonLine width="60%" height={12} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageTransition>
  )
}

export function ChatSkeleton({ isMobile: m }: { isMobile?: boolean }) {
  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: m ? 14 : 24 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <SkeletonLine width={160} height={22} />
            <SkeletonLine width={220} height={14} />
          </div>
          <SkeletonBlock width={m ? '100%' : 130} height={42} />
        </div>

        {/* Search */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SkeletonBlock height={42} />
          <div style={{ display: 'flex', gap: 6 }}>
            <SkeletonLine width={70} height={32} />
            <SkeletonLine width={55} height={32} />
          </div>
        </div>

        {/* Session cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: m ? 8 : 10 }}>
          {[1, 2, 3, 4, 5].map(i => <SkeletonListItem key={i} m={m} />)}
        </div>
      </div>
    </PageTransition>
  )
}

export function AgentsSkeleton({ isMobile: m }: { isMobile?: boolean }) {
  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: m ? '16px' : '0', display: 'flex', flexDirection: 'column', gap: m ? 20 : 28 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: m ? 'flex-start' : 'center', justifyContent: 'space-between', flexDirection: m ? 'column' : 'row', gap: m ? 12 : 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <SkeletonLine width={140} height={22} />
            <SkeletonLine width={280} height={14} />
          </div>
          <SkeletonBlock width={m ? '100%' : 150} height={44} />
        </div>

        {/* Section title */}
        <SkeletonLine width={160} height={16} />

        {/* Agent cards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: m ? 12 : 16 }}>
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} m={m} />)}
        </div>
      </div>
    </PageTransition>
  )
}

export function WorkshopSkeleton({ isMobile: m }: { isMobile?: boolean }) {
  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: m ? 14 : 24 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: m ? 'flex-start' : 'center', justifyContent: 'space-between', flexDirection: m ? 'column' : 'row', gap: m ? 12 : 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <SkeletonLine width={120} height={22} />
            <SkeletonLine width={300} height={14} />
          </div>
          <SkeletonBlock width={m ? '100%' : 120} height={42} />
        </div>

        {/* Kanban columns */}
        <div style={{ display: 'flex', flexDirection: m ? 'column' : 'row', gap: m ? 20 : 24 }}>
          {[1, 2, 3].map(col => (
            <div key={col} style={{ flex: m ? undefined : 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingLeft: 4 }}>
                <SkeletonCircle size={15} />
                <SkeletonLine width={80} height={13} />
                <SkeletonLine width={24} height={20} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[1, 2].map(card => (
                  <div key={card} className="macos-panel" style={{ padding: m ? 14 : 16, borderRadius: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <SkeletonCircle size={8} />
                      <SkeletonLine width="70%" height={13} />
                    </div>
                    <SkeletonLine width="90%" height={12} />
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      <SkeletonLine width={50} height={18} />
                      <SkeletonLine width={50} height={18} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageTransition>
  )
}

export function CostsSkeleton({ isMobile: m }: { isMobile?: boolean }) {
  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: m ? '16px' : '0', display: 'flex', flexDirection: 'column', gap: m ? 20 : 28 }}>
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <SkeletonLine width={160} height={m ? 20 : 28} />
          <SkeletonLine width={280} height={14} />
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : 'repeat(3, 1fr)', gap: m ? 12 : 20 }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="macos-panel" style={{ padding: m ? 16 : 24, borderRadius: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <SkeletonCircle size={m ? 40 : 48} />
                <SkeletonLine width={70} height={11} />
              </div>
              <SkeletonLine width={120} height={m ? 24 : 32} />
            </div>
          ))}
        </div>

        {/* Budget card */}
        <div className="macos-panel" style={{ padding: m ? 16 : 24, borderRadius: 16 }}>
          <SkeletonLine width={140} height={16} />
          <div style={{ display: 'flex', flexDirection: m ? 'column' : 'row', gap: 12, marginTop: 20 }}>
            <SkeletonBlock height={42} />
            <SkeletonBlock width={m ? '100%' : 80} height={42} />
          </div>
        </div>

        {/* Chart + breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '2fr 1fr', gap: m ? 16 : 24 }}>
          <div className="macos-panel" style={{ padding: m ? 16 : 24, borderRadius: 16 }}>
            <SkeletonLine width={160} height={16} />
            <SkeletonBlock height={m ? 180 : 240} />
          </div>
          <div className="macos-panel" style={{ padding: m ? 16 : 24, borderRadius: 16 }}>
            <SkeletonLine width={140} height={16} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 20 }}>
              {[1, 2, 3].map(i => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <SkeletonLine width={100} height={14} />
                    <SkeletonLine width={50} height={14} />
                  </div>
                  <SkeletonBlock height={6} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  )
}

export function CronSkeleton({ isMobile: m }: { isMobile?: boolean }) {
  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: m ? 14 : 28 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <SkeletonLine width={160} height={22} />
            <SkeletonLine width={260} height={14} />
          </div>
          <SkeletonBlock width={m ? 110 : 140} height={42} />
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: m ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: m ? 10 : 20 }}>
          {[1, 2, 3].map(i => <SkeletonStatCard key={i} m={m} />)}
        </div>

        {/* Job list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: m ? 10 : 14 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="macos-panel" style={{ padding: m ? 14 : 20, borderRadius: m ? 12 : 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <SkeletonCircle size={40} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <SkeletonLine width="50%" height={13} />
                  <SkeletonLine width="30%" height={11} />
                </div>
                <SkeletonLine width={60} height={24} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageTransition>
  )
}

export function ScoutSkeleton({ isMobile: m }: { isMobile?: boolean }) {
  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: m ? 14 : 24 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: m ? 'flex-start' : 'center', justifyContent: 'space-between', flexDirection: m ? 'column' : 'row', gap: m ? 12 : 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <SkeletonLine width={120} height={22} />
            <SkeletonLine width={280} height={14} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <SkeletonBlock width={100} height={36} />
            <SkeletonBlock width={100} height={36} />
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
          {[1, 2, 3, 4, 5].map(i => <SkeletonLine key={i} width={80} height={32} />)}
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: m ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: m ? 10 : 16 }}>
          {[1, 2, 3, 4].map(i => <SkeletonStatCard key={i} m={m} />)}
        </div>

        {/* Result cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: m ? 10 : 14 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="macos-panel" style={{ padding: m ? 14 : 20, borderRadius: m ? 12 : 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <SkeletonCircle size={40} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <SkeletonLine width="60%" height={14} />
                  <SkeletonLine width="80%" height={12} />
                  <SkeletonLine width="40%" height={11} />
                </div>
                <SkeletonLine width={50} height={24} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageTransition>
  )
}

export function AdminSkeleton({ isMobile: m }: { isMobile?: boolean }) {
  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: m ? '16px' : '0', display: 'flex', flexDirection: 'column', gap: m ? 16 : 24 }}>
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <SkeletonLine width={180} height={22} />
          <SkeletonLine width={280} height={14} />
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: m ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: m ? 10 : 16 }}>
          {[1, 2, 3, 4].map(i => <SkeletonStatCard key={i} m={m} />)}
        </div>

        {/* Invite section */}
        <div className="macos-panel" style={{ padding: m ? 16 : 24, borderRadius: 16 }}>
          <SkeletonLine width={140} height={15} />
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <SkeletonBlock height={42} />
            <SkeletonBlock width={m ? '100%' : 130} height={42} />
          </div>
        </div>

        {/* User list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: m ? 10 : 14 }}>
          <SkeletonLine width={80} height={15} />
          {[1, 2, 3].map(i => <SkeletonListItem key={i} m={m} />)}
        </div>

        {/* Gateway health */}
        <div className="macos-panel" style={{ padding: m ? 16 : 24, borderRadius: 16 }}>
          <SkeletonLine width={140} height={15} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            {[1, 2].map(i => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <SkeletonLine width={120} height={13} />
                <SkeletonLine width={60} height={20} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageTransition>
  )
}

export function SettingsSkeleton({ isMobile: m }: { isMobile?: boolean }) {
  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: m ? '16px' : '0', display: 'flex', flexDirection: 'column', gap: m ? 16 : 24 }}>
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <SkeletonLine width={120} height={22} />
          <SkeletonLine width={320} height={14} />
        </div>

        {/* Settings cards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: m ? 16 : 20 }}>
          {[1, 2, 3, 4, 5, 6].map(i => <SkeletonSettingsCard key={i} m={m} />)}
        </div>
      </div>
    </PageTransition>
  )
}

export function AWSSkeleton({ isMobile: m }: { isMobile?: boolean }) {
  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: m ? '16px' : '0', display: 'flex', flexDirection: 'column', gap: m ? 16 : 28 }}>
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <SkeletonLine width={200} height={22} />
          <SkeletonLine width={300} height={14} />
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: m ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: m ? 10 : 16 }}>
          {[1, 2, 3, 4].map(i => <SkeletonStatCard key={i} m={m} />)}
        </div>

        {/* Services + Billing */}
        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: m ? 16 : 24 }}>
          <div className="macos-panel" style={{ padding: m ? 16 : 24, borderRadius: 16 }}>
            <SkeletonLine width={120} height={15} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <SkeletonLine width={140} height={13} />
                  <SkeletonLine width={60} height={20} />
                </div>
              ))}
            </div>
          </div>
          <div className="macos-panel" style={{ padding: m ? 16 : 24, borderRadius: 16 }}>
            <SkeletonLine width={100} height={15} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
              <SkeletonLine width="80%" height={14} />
              <SkeletonBlock height={8} />
              <SkeletonLine width="60%" height={12} />
            </div>
          </div>
        </div>

        {/* Bedrock models grid */}
        <div>
          <SkeletonLine width={160} height={16} />
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            {[1, 2, 3, 4].map(i => <SkeletonLine key={i} width={80} height={32} />)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: m ? 10 : 14, marginTop: 16 }}>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="macos-panel" style={{ padding: m ? 14 : 18, borderRadius: 12 }}>
                <SkeletonLine width="60%" height={13} />
                <SkeletonLine width="40%" height={11} />
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <SkeletonLine width={50} height={18} />
                  <SkeletonLine width={50} height={18} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageTransition>
  )
}

export function SkillsSkeleton({ isMobile: m }: { isMobile?: boolean }) {
  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: m ? '16px' : '0', display: 'flex', flexDirection: 'column', gap: m ? 16 : 24 }}>
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <SkeletonLine width={160} height={22} />
          <SkeletonLine width={320} height={14} />
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: m ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 16 }}>
          {[1, 2, 3, 4].map(i => <SkeletonStatCard key={i} m={m} />)}
        </div>

        {/* Search bar */}
        <SkeletonBlock width="100%" height={44} />

        {/* Category tabs */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[1, 2, 3, 4, 5, 6].map(i => <SkeletonLine key={i} width={i <= 3 ? 80 : 100} height={34} />)}
        </div>

        {/* Skills grid */}
        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="macos-panel" style={{ padding: m ? 14 : 18, borderRadius: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <SkeletonCircle size={28} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <SkeletonLine width="50%" height={14} />
                  <SkeletonLine width="90%" height={12} />
                </div>
                <SkeletonLine width={50} height={20} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageTransition>
  )
}
