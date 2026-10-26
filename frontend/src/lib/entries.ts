import type { EntryType, FragmentContent, JobStatus } from './types'

export type FieldKey = keyof Omit<FragmentContent, 'highlights' | 'authors'>

export interface FieldSpec {
  key: FieldKey
  label: string
  required?: boolean
  multiline?: boolean
  placeholder?: string
  half?: boolean
}

const dates: FieldSpec[] = [
  { key: 'startDate', label: 'Start date', placeholder: '2021-06', half: true },
  { key: 'endDate', label: 'End date', placeholder: 'present', half: true },
  { key: 'date', label: 'Single date (instead of a range)', placeholder: '2023 or Fall 2023', half: true },
  { key: 'location', label: 'Location', placeholder: 'Remote', half: true },
]

const summary: FieldSpec = { key: 'summary', label: 'Summary', multiline: true, placeholder: 'One-line description under the heading' }

export interface TypeSpec {
  label: string
  description: string
  defaultSection: string
  fields: FieldSpec[]
  highlights: boolean
  authors: boolean
}

export const TYPES: Record<EntryType, TypeSpec> = {
  experience: {
    label: 'Experience', description: 'Company, position, dates and bullet highlights', defaultSection: 'Experience',
    fields: [
      { key: 'company', label: 'Company', required: true, half: true },
      { key: 'position', label: 'Position', half: true },
      ...dates, summary,
    ],
    highlights: true, authors: false,
  },
  education: {
    label: 'Education', description: 'Institution, field of study, degree', defaultSection: 'Education',
    fields: [
      { key: 'institution', label: 'Institution', required: true, half: true },
      { key: 'area', label: 'Area of study', required: true, half: true },
      { key: 'degree', label: 'Degree', placeholder: 'BS', half: true },
      ...dates, summary,
    ],
    highlights: true, authors: false,
  },
  normal: {
    label: 'Project / generic', description: 'A named entry with optional dates and highlights', defaultSection: 'Projects',
    fields: [{ key: 'name', label: 'Name', required: true, placeholder: '[MyProject](https://github.com/me/project)' }, ...dates, summary],
    highlights: true, authors: false,
  },
  publication: {
    label: 'Publication', description: 'Title, authors, venue and DOI', defaultSection: 'Publications',
    fields: [
      { key: 'title', label: 'Title', required: true },
      { key: 'journal', label: 'Journal / venue', half: true },
      { key: 'date', label: 'Date', placeholder: '2023-07', half: true },
      { key: 'doi', label: 'DOI', half: true },
      { key: 'url', label: 'URL', half: true },
      summary,
    ],
    highlights: false, authors: true,
  },
  oneLine: {
    label: 'One-line (label: details)', description: 'Great for skills: "Languages: C#, TypeScript"', defaultSection: 'Skills',
    fields: [
      { key: 'label', label: 'Label', required: true, placeholder: 'Languages', half: true },
      { key: 'details', label: 'Details', required: true, placeholder: 'C#, TypeScript, SQL', half: true },
    ],
    highlights: false, authors: false,
  },
  text: {
    label: 'Text paragraph', description: 'Free text, e.g. a professional summary', defaultSection: 'Summary',
    fields: [{ key: 'text', label: 'Text', required: true, multiline: true }], highlights: false, authors: false,
  },
  bullet: {
    label: 'Bullet', description: 'A single bullet point', defaultSection: 'Highlights',
    fields: [{ key: 'text', label: 'Bullet text', required: true, multiline: true }], highlights: false, authors: false,
  },
  numbered: {
    label: 'Numbered', description: 'A numbered list item', defaultSection: 'Achievements',
    fields: [{ key: 'text', label: 'Text', required: true, multiline: true }], highlights: false, authors: false,
  },
  reversedNumbered: {
    label: 'Reverse-numbered', description: 'Numbered from the bottom up, e.g. talks', defaultSection: 'Talks',
    fields: [{ key: 'text', label: 'Text', required: true, multiline: true }], highlights: false, authors: false,
  },
}

export const ENTRY_TYPES = Object.keys(TYPES) as EntryType[]

export const emptyContent = (): FragmentContent => ({ authors: [], highlights: [] })

export const newId = () => Math.random().toString(36).slice(2, 12)

/** Strips the small markdown subset rendercv supports, for plain-text summaries. */
export const plain = (s?: string | null) =>
  (s ?? '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1')

export function dateRange(c: FragmentContent): string {
  if (c.startDate) return `${c.startDate} – ${c.endDate || 'present'}`
  return c.date ?? ''
}

/** Heading and subheading used for cards and lists. */
export function headline(type: EntryType, c: FragmentContent): { primary: string; secondary: string } {
  switch (type) {
    case 'experience': return { primary: plain(c.company), secondary: plain(c.position) }
    case 'education': return { primary: plain(c.institution), secondary: [c.degree, c.area].filter(Boolean).join(', ') }
    case 'normal': return { primary: plain(c.name), secondary: plain(c.summary) }
    case 'publication': return { primary: plain(c.title), secondary: [c.journal, c.authors.join(', ')].filter(Boolean).join(' · ') }
    case 'oneLine': return { primary: plain(c.label), secondary: plain(c.details) }
    default: return { primary: plain(c.text), secondary: '' }
  }
}

/** Rough count of rendered lines, used for "room left" hints. */
export function estimateLines(type: EntryType, c: FragmentContent, highlightCount?: number): number {
  const wrap = (s?: string | null, perLine = 95) => (s ? Math.max(1, Math.ceil(plain(s).length / perLine)) : 0)
  switch (type) {
    case 'oneLine': return wrap(`${c.label}: ${c.details}`)
    case 'text': case 'bullet': case 'numbered': case 'reversedNumbered': return wrap(c.text)
    case 'publication': return 3 + wrap(c.summary)
    default: {
      const hs = c.highlights.slice(0, highlightCount ?? c.highlights.length)
      return 1.6 + (type === 'experience' && c.position ? 0 : 0) + wrap(c.summary) + hs.reduce((n, h) => n + wrap(h.text, 90), 0)
    }
  }
}

export const STATUS_LABEL: Record<JobStatus, string> = {
  saved: 'Saved', applied: 'Applied', interviewing: 'Interviewing', offer: 'Offer', accepted: 'Accepted',
  rejected: 'Rejected', withdrawn: 'Withdrawn', ghosted: 'Ghosted',
}

export const STATUSES = Object.keys(STATUS_LABEL) as JobStatus[]

export function validateDate(value?: string | null): string | null {
  if (!value) return null
  const v = value.trim()
  if (/^present$/i.test(v)) return null
  if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(v)) return null
  return 'Use YYYY, YYYY-MM, YYYY-MM-DD or "present"'
}

/** Single dates may be free text in rendercv; only range endpoints must be ISO-like. */
export function contentErrors(type: EntryType, c: FragmentContent): string[] {
  const errors: string[] = []
  for (const f of TYPES[type].fields) {
    if (f.required && !String(c[f.key] ?? '').trim()) errors.push(`${f.label} is required`)
  }
  const s = validateDate(c.startDate)
  if (s) errors.push(`Start date: ${s}`)
  const e = validateDate(c.endDate)
  if (e) errors.push(`End date: ${e}`)
  if (c.endDate && !c.startDate) errors.push('End date needs a start date')
  return errors
}
