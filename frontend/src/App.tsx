import { Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import { Menu, X } from 'lucide-react'
import { useIsMobile } from './lib/useIsMobile'
import { AuthProvider, useAuth } from './lib/auth'
import { apiFetch } from './lib/api'
import Sidebar from './components/Sidebar'
import ChatWidget from './components/ChatWidget'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import Workshop from './pages/Workshop'
import Costs from './pages/Costs'
import Cron from './pages/Cron'
import Scout from './pages/Scout'
import Agents from './pages/Agents'
import Settings from './pages/Settings'
import Skills from './pages/Skills'
import AWS from './pages/AWS'
import Setup from './pages/Setup'
import Admin from './pages/Admin'
import Login from './pages/Login'
import Register from './pages/Register'

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, loading, isAdmin } = useAuth()

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
      }}>
        Loading...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function AppContent() {
  const location = useLocation()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { user, loading } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Check if setup is needed on initial app load (non-blocking)
  useEffect(() => {
    if (location.pathname !== '/setup' && user) {
      apiFetch('/api/setup')
        .then(r => r.json())
        .then(data => {
          if (data.needsSetup) navigate('/setup')
        })
        .catch(() => {}) // Ignore errors — just show dashboard
    }
  }, [user]) // Run when user changes (login)

  // Don't render main layout for auth pages
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register'
  if (isAuthPage) {
    return (
      <div className="macos-desktop" style={{ height: '100vh', overflow: 'hidden', maxWidth: '100vw' }}>
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Routes>
        </AnimatePresence>
      </div>
    )
  }

  // Hide global chat widget on Conversations page (has its own chat)
  const hideChatWidget = isMobile && location.pathname === '/conversations'

  // Hide sidebar and chat widget on setup page
  const isSetupPage = location.pathname === '/setup'

  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="macos-desktop" style={{ display: 'flex', height: '100vh', overflow: 'hidden', maxWidth: '100vw' }}>
      {/* Mobile hamburger button — fixed top-left (hidden on setup) */}
      {isMobile && !isSetupPage && (
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            position: 'fixed',
            top: 12,
            left: 12,
            zIndex: 201,
            width: 44,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: sidebarOpen ? 'rgba(255,255,255,0.15)' : 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 10,
            color: 'rgba(255, 255, 255, 0.9)',
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      )}

      {/* Sidebar overlay for mobile (hidden on setup) */}
      {isMobile && !isSetupPage && (
        <div
          className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar (hidden on setup) */}
      {!isSetupPage && <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />}

      <main style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        position: 'relative',
        zIndex: 1,
        maxWidth: '100%',
        WebkitOverflowScrolling: 'touch',
      }}>
        <div style={{
          padding: isSetupPage ? '32px 16px' : (isMobile ? '60px 16px 24px' : '32px 40px'),
          maxWidth: '100%',
          overflowX: 'hidden',
        }}>
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route path="/setup" element={<ProtectedRoute><Setup /></ProtectedRoute>} />
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/conversations" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
              <Route path="/workshop" element={<ProtectedRoute><Workshop /></ProtectedRoute>} />
              <Route path="/costs" element={<ProtectedRoute><Costs /></ProtectedRoute>} />
              <Route path="/cron" element={<ProtectedRoute><Cron /></ProtectedRoute>} />
              <Route path="/scout" element={<ProtectedRoute><Scout /></ProtectedRoute>} />
              <Route path="/agents" element={<ProtectedRoute><Agents /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/skills" element={<ProtectedRoute><Skills /></ProtectedRoute>} />
              <Route path="/aws" element={<ProtectedRoute><AWS /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
            </Routes>
          </AnimatePresence>
        </div>
      </main>

      {/* Global chat widget — hidden on pages with built-in chat (mobile) and setup page */}
      {!hideChatWidget && !isSetupPage && <ChatWidget />}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
