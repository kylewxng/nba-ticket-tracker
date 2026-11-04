import { useEffect } from 'react'
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { SideNav, TabBar } from '@/components/layout'
import { USE_HASH_ROUTER } from '@/lib/config'
import { StoreProvider, useStore } from '@/lib/store'
import { AlertsScreen } from '@/screens/Alerts'
import { ExploreScreen } from '@/screens/Explore'
import { GameScreen } from '@/screens/Game'
import { HomeScreen } from '@/screens/Home'
import { Onboarding } from '@/screens/Onboarding'
import { ProfileScreen } from '@/screens/Profile'
import { PushPrompt } from '@/screens/PushPrompt'
import { SignInSheet } from '@/screens/SignInSheet'

const TAB_PATHS = ['/', '/explore', '/alerts', '/profile']

function Shell() {
  const { onboarded, events, resume, clearResume } = useStore()
  const location = useLocation()
  const navigate = useNavigate()
  const onTab = TAB_PATHS.includes(location.pathname)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  useEffect(() => {
    if (resume?.type === 'alert') {
      clearResume()
      navigate(`/game/${resume.gameId}/alert`)
    }
  }, [resume, clearResume, navigate])

  if (!onboarded && location.pathname === '/') return <Onboarding />

  return (
    <>
      <SideNav />
      <div className="lg:pl-[248px]">
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/explore" element={<ExploreScreen />} />
        <Route path="/alerts" element={<AlertsScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/game/:id" element={<GameScreen />} />
        <Route path="/game/:id/alert" element={<GameScreen alertOpen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </div>
      {onTab && <TabBar badge={events.length > 0} />}
      <SignInSheet />
      <PushPrompt />
    </>
  )
}

export default function App() {
  const Router = USE_HASH_ROUTER ? HashRouter : BrowserRouter
  return (
    <StoreProvider>
      <Router>
        <Shell />
      </Router>
      <Toaster
        position="top-center"
        toastOptions={{
          classNames: {
            toast: '!rounded-2xl !border-[#2A3858] !bg-[#1E2B48] !shadow-[0_10px_30px_rgba(0,0,0,0.4)] !font-sans',
            title: '!text-[14px] !font-bold !text-ink',
            description: '!text-[13px] !text-sub',
          },
        }}
      />
    </StoreProvider>
  )
}
