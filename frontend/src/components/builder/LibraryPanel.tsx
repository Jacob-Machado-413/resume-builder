import { useMemo, useState } from 'react'
import { Check, Pencil, Plus, Search } from 'lucide-react'
import type { Fragment, FragmentScore } from '../../lib/types'
import { estimateLines } from '../../lib/entries'
import { KeywordAnalyzerText } from './text'
import { FragmentCard } from '../FragmentCard'
import { useLocalState } from '../../lib/hooks'

type Sort = 'relevance' | 'section' | 'recent'

export function LibraryPanel({ fragments, inResume, ranking, remainingLines, onAdd, onRemove, onNew, onEdit }: {
  fragments: Fragment[]
  inResume: Set<number>
  ranking?: Map<number, FragmentScore>
  remainingLines: number | null
  onAdd: (f: Fragment) => void
  onRemove: (f: Fragment) => void
  onNew: () => void
  onEdit: (f: Fragment) => void
}) {
  const [q, setQ] = useState('')
  const [section, setSection] = useLocalState('builder.lib.section', '')
  const [hideAdded, setHideAdded] = useLocalState('builder.lib.hideAdded', false)
  const [sort, setSort] = useLocalState<Sort>('builder.lib.sort', 'relevance')

  const sections = useMemo(() => [...new Set(fragments.map((f) => f.section))].sort(), [fragments])

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let xs = fragments.filter((f) => !f.archived)
    if (section) xs = xs.filter((f) => f.section === section)
    if (hideAdded) xs = xs.filter((f) => !inResume.has(f.id))
    if (needle) xs = xs.filter((f) => (f.title + ' ' + f.tags.join(' ') + ' ' + KeywordAnalyzerText(f)).toLowerCase().includes(needle))
    const score = (f: Fragment) => ranking?.get(f.id)?.score ?? 0
    const sorted = [...xs]
    if (sort === 'relevance' && ranking) sorted.sort((a, b) => score(b) - score(a) || Number(b.pinned) - Number(a.pinned))
    else if (sort === 'recent') sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    else sorted.sort((a, b) => a.section.localeCompare(b.section) || Number(b.pinned) - Number(a.pinned))
    return sorted
  }, [fragments, q, section, hideAdded, inResume, ranking, sort])

  return (
    <div className="library-panel">
      <div className="panel-toolbar">
        <div className="search">
          <Search size={15} />
          <input value={q} placeholder="Search fragments…" onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn btn-sm btn-primary" onClick={onNew} title="New fragment"><Plus size={15} /></button>
      </div>
      <div className="panel-toolbar wrap small">
        <select value={section} onChange={(e) => setSection(e.target.value)}>
          <option value="">All sections</option>
          {sections.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="relevance" disabled={!ranking}>Best match{ranking ? '' : ' (pick a job)'}</option>
          <option value="section">By section</option>
          <option value="recent">Recently edited</option>
        </select>
        <label className="check"><input type="checkbox" checked={hideAdded} onChange={(e) => setHideAdded(e.target.checked)} /> Hide added</label>
      </div>
      <div className="library-list">
        {list.length === 0 && <div className="muted small pad">No fragments match. {fragments.length === 0 && 'Create your first one with +.'}</div>}
        {list.map((f) => {
          const added = inResume.has(f.id)
          const lines = estimateLines(f.type, f.content)
          const fits = remainingLines === null ? null : lines <= remainingLines
          const r = ranking?.get(f.id)
          return (
            <FragmentCard
              key={f.id}
              fragment={f}
              dimmed={added}
              score={r?.score}
              matched={r?.matched}
              onClick={() => (added ? onRemove(f) : onAdd(f))}
              actions={
                <>
                  {!added && fits !== null && (
                    <span className={`fit ${fits ? 'fit-yes' : 'fit-no'}`} title={`≈${Math.round(lines)} lines; ≈${Math.max(0, Math.round(remainingLines!))} left on the last page`}>
                      ≈{Math.round(lines)}l
                    </span>
                  )}
                  <button className="icon-btn" title="Edit" onClick={() => onEdit(f)}><Pencil size={13} /></button>
                  <button
                    className={`btn btn-sm ${added ? 'btn-added' : ''}`}
                    title={added ? 'Remove from resume' : `Add to "${f.section}"`}
                    onClick={() => (added ? onRemove(f) : onAdd(f))}
                  >
                    {added ? <><Check size={13} /> Added</> : <><Plus size={13} /> Add</>}
                  </button>
                </>
              }
            />
          )
        })}
      </div>

    </div>
  )
}
