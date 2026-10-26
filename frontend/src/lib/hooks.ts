import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api'

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: Infinity })
export const useFragments = () => useQuery({ queryKey: ['fragments'], queryFn: api.fragments })
export const useJobs = () => useQuery({ queryKey: ['jobs'], queryFn: api.jobs })
export const useResumes = () => useQuery({ queryKey: ['resumes'], queryFn: api.resumes })
export const useProfile = () => useQuery({ queryKey: ['profile'], queryFn: api.profile })

/** Persists a small UI preference in localStorage, tolerating private mode. */
export function useLocalState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })
  const set = (next: T) => {
    setV(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* ignore */ }
  }
  return [v, set]
}

export function useDocumentTitle(title: string) {
  useEffect(() => { document.title = title ? `${title} · Resume Builder` : 'Resume Builder' }, [title])
}

/** Calls the latest version of fn without re-subscribing effects. */
export function useLatest<T>(value: T) {
  const ref = useRef(value)
  ref.current = value
  return ref
}

export const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''

export const fmtDateTime = (s?: string | null) =>
  s ? new Date(s).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''

export function timeAgo(s: string): string {
  const diff = (Date.now() - new Date(s).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`
  return fmtDate(s)
}
