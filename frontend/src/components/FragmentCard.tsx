import type { ReactNode } from 'react'
import { Archive, Pin } from 'lucide-react'
import type { EntryType, Fragment, FragmentContent } from '../lib/types'
import { TYPES, dateRange, headline } from '../lib/entries'
import { Highlighted, Md } from './Md'

/** Approximates how the entry looks on the page. */
export function FragmentPreview({ type, content: c, highlightIds }: { type: EntryType; content: FragmentContent; highlightIds?: string[] | null }) {
  const hs = highlightIds ? c.highlights.filter((h) => highlightIds.includes(h.id)) : c.highlights
  switch (type) {
    case 'text':
      return <div className="fp"><p><Md text={c.text} /></p></div>
    case 'bullet': case 'numbered': case 'reversedNumbered':
      return <div className="fp"><ul><li><Md text={c.text} /></li></ul></div>
    case 'oneLine':
      return <div className="fp"><p><strong><Md text={c.label} />:</strong> <Md text={c.details} /></p></div>
    case 'publication':
      return (
        <div className="fp">
          <div className="fp-head"><strong><Md text={c.title} /></strong><span className="fp-date">{c.date}</span></div>
          {c.authors.length > 0 && <div><Md text={c.authors.filter(Boolean).join(', ')} /></div>}
          {(c.doi || c.journal) && <div className="muted">{c.doi}{c.journal && ` (${c.journal})`}</div>}
          {c.summary && <div><Md text={c.summary} /></div>}
        </div>
      )
    default: {
      const title = type === 'experience' ? <><strong><Md text={c.company} /></strong>{c.position && <>, <Md text={c.position} /></>}</>
        : type === 'education' ? <><strong><Md text={c.institution} /></strong>{c.area && <>, <Md text={c.area} /></>}</>
          : <strong><Md text={c.name} /></strong>
      return (
        <div className="fp">
          <div className="fp-head">
            <span>{type === 'education' && c.degree && <span className="fp-degree">{c.degree}</span>}{title}</span>
            <span className="fp-date">{c.location}{c.location && dateRange(c) && <br />}{dateRange(c)}</span>
          </div>
          {c.summary && <div><Md text={c.summary} /></div>}
          {hs.length > 0 && <ul>{hs.map((h) => <li key={h.id}><Md text={h.text} /></li>)}</ul>}
        </div>
      )
    }
  }
}

export function FragmentCard({ fragment: f, actions, onClick, matched, score, compact, dimmed }: {
  fragment: Fragment
  actions?: ReactNode
  onClick?: () => void
  matched?: string[]
  score?: number
  compact?: boolean
  dimmed?: boolean
}) {
  const { primary, secondary } = headline(f.type, f.content)
  const range = dateRange(f.content)
  return (
    <article className={`fcard ${dimmed ? 'dimmed' : ''} ${onClick ? 'clickable' : ''}`} onClick={onClick}>
      <div className="fcard-top">
        <span className={`type-pill type-${f.type}`}>{TYPES[f.type].label.split(' ')[0]}</span>
        <span className="fcard-title" title={f.title}>{f.title}</span>
        {f.pinned && <Pin size={13} className="muted" aria-label="Pinned" />}
        {f.archived && <Archive size={13} className="muted" aria-label="Archived" />}
        {score !== undefined && score > 0 && <span className="score" title="Keyword match with the job">{Math.round(score * 100)}%</span>}
      </div>
      {!compact && (
        <div className="fcard-body">
          <div className="fcard-primary"><Highlighted text={primary} terms={matched ?? []} /></div>
          {secondary && <div className="fcard-secondary"><Highlighted text={secondary} terms={matched ?? []} /></div>}
          {f.content.highlights.length > 0 && (
            <ul className="fcard-hl">
              {f.content.highlights.slice(0, 3).map((h) => <li key={h.id}><Highlighted text={h.text.replace(/\*\*/g, '')} terms={matched ?? []} /></li>)}
              {f.content.highlights.length > 3 && <li className="muted">+{f.content.highlights.length - 3} more</li>}
            </ul>
          )}
        </div>
      )}
      <div className="fcard-meta">
        {range && <span>{range}</span>}
        <span className="muted">{f.section}</span>
        {f.tags.map((t) => <span key={t} className="chip chip-sm">{t}</span>)}
        {f.usageCount > 0 && <span className="muted" title="Resumes using this fragment">· in {f.usageCount}</span>}
        {actions && <span className="fcard-actions" onClick={(e) => e.stopPropagation()}>{actions}</span>}
      </div>
      {matched && matched.length > 0 && (
        <div className="fcard-match">{matched.slice(0, 8).map((m) => <span key={m} className="kw kw-hit">{m}</span>)}</div>
      )}
    </article>
  )
}
