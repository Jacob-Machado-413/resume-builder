export type EntryType =
  | 'text' | 'experience' | 'education' | 'normal' | 'publication'
  | 'oneLine' | 'bullet' | 'numbered' | 'reversedNumbered'

export type JobStatus =
  | 'saved' | 'applied' | 'interviewing' | 'offer' | 'accepted' | 'rejected' | 'withdrawn' | 'ghosted'

export interface Highlight { id: string; text: string }

export interface FragmentContent {
  text?: string | null
  company?: string | null
  position?: string | null
  institution?: string | null
  area?: string | null
  degree?: string | null
  name?: string | null
  title?: string | null
  authors: string[]
  doi?: string | null
  url?: string | null
  journal?: string | null
  label?: string | null
  details?: string | null
  date?: string | null
  startDate?: string | null
  endDate?: string | null
  location?: string | null
  summary?: string | null
  highlights: Highlight[]
}

export interface Fragment {
  id: number
  title: string
  section: string
  type: EntryType
  content: FragmentContent
  tags: string[]
  notes?: string | null
  archived: boolean
  pinned: boolean
  createdAt: string
  updatedAt: string
  usageCount: number
  usedInResumeIds: number[]
}

export type FragmentInput = Pick<Fragment, 'title' | 'section' | 'type' | 'content' | 'tags' | 'notes' | 'archived' | 'pinned'>

export interface SocialLink { network: string; username: string }
export interface CustomConnection { placeholder: string; url?: string | null; fontawesomeIcon: string }

export interface DesignSettings {
  theme: string
  pageSize: string
  primaryColor?: string | null
  fontFamily?: string | null
  fontSize?: string | null
  margin?: string | null
  lineSpacing?: string | null
  alignment?: string | null
  showFooter?: boolean | null
  showTopNote?: boolean | null
  showConnectionIcons?: boolean | null
  showPhoto: boolean
  locale: string
  boldKeywords: string[]
  customDesignYaml?: string | null
}

export interface Profile {
  id: number
  name: string
  headline?: string | null
  location?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  photoFile?: string | null
  socialNetworks: SocialLink[]
  customConnections: CustomConnection[]
  defaultDesign: DesignSettings
  defaultTargetPages: number
}

export interface StatusChange { status: JobStatus; at: string; note?: string | null }

export interface Job {
  id: number
  company: string
  title: string
  url?: string | null
  location?: string | null
  salary?: string | null
  contact?: string | null
  description?: string | null
  notes?: string | null
  status: JobStatus
  history: StatusChange[]
  appliedAt?: string | null
  deadline?: string | null
  submittedVersionId?: number | null
  createdAt: string
  updatedAt: string
  resumeCount: number
  versionCount: number
}

export type JobInput = Pick<Job, 'company' | 'title' | 'url' | 'location' | 'salary' | 'contact' | 'description' | 'notes' | 'status' | 'appliedAt' | 'deadline'>

export interface ResumeItem {
  id: string
  fragmentId: number
  highlightIds?: string[] | null
  override?: FragmentContent | null
}

export interface ResumeSection { id: string; title: string; items: ResumeItem[] }

export interface JobSummary { id: number; company: string; title: string; status: JobStatus; appliedAt?: string | null }

export interface Resume {
  id: number
  name: string
  jobId?: number | null
  headlineOverride?: string | null
  sections: ResumeSection[]
  design: DesignSettings
  targetPages: number
  notes?: string | null
  clonedFromId?: number | null
  createdAt: string
  updatedAt: string
  job?: JobSummary | null
  itemCount: number
  versionCount: number
  latestVersion?: { id: number; number: number; pageCount: number; createdAt: string } | null
}

export interface Version {
  id: number
  resumeId: number
  number: number
  resumeName: string
  label?: string | null
  notes?: string | null
  pageCount: number
  theme?: string | null
  createdAt: string
  jobId?: number | null
  hasSnapshot: boolean
  job?: JobSummary | null
  submitted: boolean
  pdfUrl: string
  pages: string[]
}

export interface Keyword { term: string; count: number; weight: number }
export interface FragmentScore { fragmentId: number; score: number; matched: string[] }
export interface Coverage { covered: string[]; missing: string[]; ratio: number }

export interface PagePreview { number: number; url: string; fill: number }

export interface PreviewResponse {
  key: string
  pageCount: number
  pages: PagePreview[]
  warnings: string[]
  error?: string | null
  yaml: string
  coverage?: Coverage | null
  targetPages: number
}

export interface Meta {
  themes: string[]
  pageSizes: string[]
  fonts: string[]
  locales: string[]
  socialNetworks: string[]
  entryTypes: EntryType[]
  jobStatuses: JobStatus[]
  themeMargins: Record<string, string>
  rendercv?: string | null
  dataDirectory: string
}

export interface Stats {
  fragments: number
  resumes: number
  versions: number
  jobs: number
  byStatus: Partial<Record<JobStatus, number>>
  appliedLast30: number
  upcomingDeadlines: { id: number; company: string; title: string; deadline: string }[]
  recentVersions: {
    id: number; number: number; resumeName: string; resumeId: number; createdAt: string; pageCount: number
    job?: { id: number; company: string; title: string } | null
  }[]
}

export type Outcome = 'pending' | 'noResponse' | 'rejected' | 'interview' | 'offer' | 'withdrawn'

export interface Tally {
  sent: number
  pending: number
  noResponse: number
  rejected: number
  interviews: number
  offers: number
  resolved: number
  interviewRate: number | null
  offerRate: number | null
  grade: string | null
  lowConfidence: boolean
}

export interface ApplicationOutcome {
  jobId: number
  company: string
  title: string
  status: JobStatus
  versionId: number
  versionNumber: number
  resumeId: number
  resumeName: string
  theme?: string | null
  sentAt: string
  outcome: Outcome
  daysWaiting: number
  submitted: boolean
}

export interface PerformanceReport {
  overall: Tally
  resumes: { resumeId: number; name: string; tally: Tally; applications: ApplicationOutcome[] }[]
  fragments: { fragmentId: number; title: string; section: string; tally: Tally; lift: number | null }[]
  themes: { theme: string; tally: Tally }[]
  applications: ApplicationOutcome[]
  noResponseAfterDays: number
}
