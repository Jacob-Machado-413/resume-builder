import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import Dashboard from './pages/Dashboard'
import Resumes from './pages/Resumes'
import Builder from './pages/Builder'
import Library from './pages/Library'
import Jobs from './pages/Jobs'
import JobDetail from './pages/JobDetail'
import Versions from './pages/Versions'
import Profile from './pages/Profile'
import Performance from './pages/Performance'
import { ToastProvider } from './components/ui'
import './styles.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 5_000 } },
})

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'resumes', element: <Resumes /> },
      { path: 'resumes/:id', element: <Builder /> },
      { path: 'library', element: <Library /> },
      { path: 'jobs', element: <Jobs /> },
      { path: 'jobs/:id', element: <JobDetail /> },
      { path: 'versions', element: <Versions /> },
      { path: 'versions/:id', element: <Versions /> },
      { path: 'profile', element: <Profile /> },
      { path: 'performance', element: <Performance /> },
      { path: '*', element: <div className="center-pad">Page not found.</div> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
