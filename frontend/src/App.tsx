import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Briefcase, FileStack, FileText, LayoutDashboard, Layers, Moon, Sun, SunMoon, TrendingUp, UserRound } from 'lucide-react'
import { useEffect } from 'react'
import { useLocalState } from './lib/hooks'

const NAV = [
  { to: '/', label: 'Applications', icon: LayoutDashboard, end: true },
  { to: '/jobs', label: 'Jobs', icon: Briefcase },
  { to: '/library', label: 'Fragments', icon: Layers },
  { to: '/resumes', label: 'Resumes', icon: FileText },
  { to: '/versions', label: 'Versions', icon: FileStack },
  { to: '/performance', label: 'Performance', icon: TrendingUp },
  { to: '/profile', label: 'Profile', icon: UserRound },
]

type Theme = 'system' | 'light' | 'dark'

export default function App() {
  const [theme, setTheme] = useLocalState<Theme>('theme', 'system')
  const { pathname } = useLocation()
  const fullBleed = /^\/resumes\/\d+/.test(pathname) || pathname.startsWith('/versions')

  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const next: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : SunMoon

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={22} height={22} />
          <span>Resume Builder</span>
        </div>
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Icon size={17} /> <span>{label}</span>
          </NavLink>
        ))}
        <span className="grow" />
        <button className="nav-link theme-toggle" onClick={() => setTheme(next[theme])} title={`Theme: ${theme}`}>
          <ThemeIcon size={17} /> <span>{theme === 'system' ? 'Auto theme' : theme === 'light' ? 'Light' : 'Dark'}</span>
        </button>
      </nav>
      <main className={`content ${fullBleed ? 'full-bleed' : ''}`}>
        <Outlet />
      </main>
    </div>
  )
}
