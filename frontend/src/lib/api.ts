import type {
  Coverage, Fragment, FragmentInput, FragmentScore, Job, JobInput, JobStatus, Keyword, Meta, PreviewResponse, Profile,
  Resume, ResumeSection, DesignSettings, Stats, Version, PerformanceReport,
} from './types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const init: RequestInit = { method, signal, headers: {} }
  if (body instanceof FormData) init.body = body
  else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  const res = await fetch(url, init)
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const data = await res.json()
      message = data.error ?? data.title ?? message
    } catch { /* not JSON */ }
    throw new ApiError(res.status, message)
  }
  if (res.status === 204) return undefined as T
  const type = res.headers.get('content-type') ?? ''
  return (type.includes('json') ? res.json() : res.text()) as Promise<T>
}

const get = <T,>(url: string) => request<T>('GET', url)
const post = <T,>(url: string, body?: unknown, signal?: AbortSignal) => request<T>('POST', url, body ?? {}, signal)
const put = <T,>(url: string, body: unknown) => request<T>('PUT', url, body)
const del = (url: string) => request<void>('DELETE', url)

export interface ResumeDraft {
  name?: string
  jobId?: number | null
  headlineOverride?: string | null
  sections: ResumeSection[]
  design: DesignSettings
  targetPages: number
  notes?: string | null
}

export const api = {
  meta: () => get<Meta>('/api/meta'),
  stats: () => get<Stats>('/api/stats'),
  performance: () => get<PerformanceReport>('/api/performance'),

  profile: () => get<Profile>('/api/profile'),
  saveProfile: (p: Profile) => put<Profile>('/api/profile', p),
  uploadPhoto: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return request<Profile>('POST', '/api/profile/photo', fd)
  },
  deletePhoto: () => request<Profile>('DELETE', '/api/profile/photo'),

  fragments: () => get<Fragment[]>('/api/fragments'),
  createFragment: (f: FragmentInput) => post<Fragment>('/api/fragments', f),
  updateFragment: (id: number, f: FragmentInput) => put<Fragment>(`/api/fragments/${id}`, f),
  duplicateFragment: (id: number) => post<Fragment>(`/api/fragments/${id}/duplicate`),
  deleteFragment: (id: number) => del(`/api/fragments/${id}`),
  sections: () => get<{ title: string; type: string; count: number }[]>('/api/sections'),
  tags: () => get<{ tag: string; count: number }[]>('/api/tags'),

  jobs: () => get<Job[]>('/api/jobs'),
  job: (id: number) => get<Job>(`/api/jobs/${id}`),
  createJob: (j: JobInput) => post<Job>('/api/jobs', j),
  updateJob: (id: number, j: JobInput) => put<Job>(`/api/jobs/${id}`, j),
  setJobStatus: (id: number, status: JobStatus, note?: string) => post<Job>(`/api/jobs/${id}/status`, { status, note }),
  submitVersion: (jobId: number, versionId: number | null) => post<Job>(`/api/jobs/${jobId}/submit`, { versionId }),
  deleteJob: (id: number) => del(`/api/jobs/${id}`),
  jobKeywords: (id: number) => get<{ keywords: Keyword[]; ranking: FragmentScore[] }>(`/api/jobs/${id}/keywords`),

  resumes: () => get<Resume[]>('/api/resumes'),
  resume: (id: number) => get<Resume>(`/api/resumes/${id}`),
  createResume: (input: { name?: string; jobId?: number | null; cloneFromId?: number; fromVersionId?: number; autoFill?: boolean }) =>
    post<Resume>('/api/resumes', input),
  saveResume: (id: number, draft: ResumeDraft) => put<Resume>(`/api/resumes/${id}`, draft),
  deleteResume: (id: number) => del(`/api/resumes/${id}`),
  resumeYaml: (id: number) => get<string>(`/api/resumes/${id}/yaml`),
  generate: (id: number, label?: string, notes?: string) =>
    post<{ version: Version; warnings: string[] }>(`/api/resumes/${id}/generate`, { label, notes }),
  preview: (draft: ResumeDraft, signal?: AbortSignal) => post<PreviewResponse>('/api/preview', draft, signal),

  versions: (filter: { jobId?: number; resumeId?: number } = {}) => {
    const q = new URLSearchParams()
    if (filter.jobId) q.set('jobId', String(filter.jobId))
    if (filter.resumeId) q.set('resumeId', String(filter.resumeId))
    return get<Version[]>(`/api/versions?${q}`)
  },
  version: (id: number) => get<Version>(`/api/versions/${id}`),
  updateVersion: (id: number, v: { label?: string | null; notes?: string | null; jobId?: number | null }) =>
    put<Version>(`/api/versions/${id}`, v),
  deleteVersion: (id: number) => del(`/api/versions/${id}`),
  versionText: (id: number, kind: 'yaml' | 'markdown' | 'typst') => get<string>(`/api/versions/${id}/${kind}`),

  importRenderCv: (input: { yaml: string; importProfile: boolean; createResume: boolean; resumeName?: string }) =>
    post<{ fragments: number; sections: { title: string; count: number }[]; resumeId?: number | null; warnings: string[] }>(
      '/api/import/rendercv', input),
  importLibrary: (data: unknown) => post<{ fragments: number; jobs: number }>('/api/import/library', data),
}

export type { Coverage }
