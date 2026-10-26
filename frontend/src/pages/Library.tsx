import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Archive, Copy, Layers, Pencil, Pin, Plus, Search, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import type { EntryType, Fragment } from '../lib/types'
import { ENTRY_TYPES, TYPES } from '../lib/entries'
import { useDocumentTitle, useFragments, useLocalState } from '../lib/hooks'
import { FragmentCard, FragmentPreview } from '../components/FragmentCard'
import { FragmentEditor, newFragmentInput } from '../components/FragmentEditor'
import { Empty, Spinner, useToast } from '../components/ui'

export default function Library() {
  const { data: fragments = [], isLoading } = useFragments()
  const qc = useQueryClient()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [type, setType] = useLocalState<EntryType | ''>('library.type', '')
  const [tag, setTag] = useLocalState('library.tag', '')
  const [showArchived, setShowArchived] = useLocalState('library.archived', false)
  const [view, setView] = useLocalState<'cards' | 'preview'>('library.view', 'cards')
  const [newMenu, setNewMenu] = useState(false)
  const [editing, setEditing] = useState<{ fragment?: Fragment; initial?: ReturnType<typeof newFragmentInput> } | null>(null)
  useDocumentTitle('Fragment library')

  const tags = useMemo(() => [...new Set(fragments.flatMap((f) => f.tags))].sort(), [fragments])
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return fragments.filter((f) =>
      (showArchived || !f.archived) && (!type || f.type === type) && (!tag || f.tags.includes(tag)) &&
      (!needle || JSON.stringify([f.title, f.section, f.tags, f.content]).toLowerCase().includes(needle)))
  }, [fragments, q, type, tag, showArchived])

  const grouped = useMemo(() => {
    const m = new Map<string, Fragment[]>()
    for (const f of filtered) m.set(f.section, [...(m.get(f.section) ?? []), f])
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['fragments'] })
    qc.invalidateQueries({ queryKey: ['sections'] })
    qc.invalidateQueries({ queryKey: ['tags'] })
  }
  const toggle = async (f: Fragment, key: 'pinned' | 'archived') => {
    await api.updateFragment(f.id, { ...f, [key]: !f[key] })
    refresh()
  }
  const duplicate = async (f: Fragment) => {
    const copy = await api.duplicateFragment(f.id)
    refresh()
    setEditing({ fragment: copy })
  }
  const remove = async (f: Fragment) => {
    const msg = f.usageCount > 0
      ? `"${f.title}" is used in ${f.usageCount} resume(s). Deleting removes it from those drafts (generated PDFs are kept). Archive it instead?\n\nOK = delete, Cancel = keep`
      : `Delete "${f.title}"?`
    if (!confirm(msg)) return
    await api.deleteFragment(f.id)
    refresh()
    qc.invalidateQueries({ queryKey: ['resumes'] })
    toast('Fragment deleted')
  }

  return (
    <div className="page-wrap">
      <header className="page-head">
        <h1>Fragments</h1>
        <div className="menu-wrap">
          <button className="btn btn-primary" onClick={() => setNewMenu(!newMenu)}><Plus size={15} /> New fragment</button>
          {newMenu && (
            <div className="menu" onMouseLeave={() => setNewMenu(false)}>
              {ENTRY_TYPES.map((t) => (
                <button key={t} onClick={() => { setNewMenu(false); setEditing({ initial: newFragmentInput(t) }) }}>{TYPES[t].label}</button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="toolbar">
        <div className="search"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search all text…" /></div>
        <select value={type} onChange={(e) => setType(e.target.value as EntryType | '')}>
          <option value="">All types</option>
          {ENTRY_TYPES.map((t) => <option key={t} value={t}>{TYPES[t].label}</option>)}
        </select>
        <select value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">All tags</option>
          {tags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
        <span className="grow" />
        <div className="seg">
          <button className={view === 'cards' ? 'active' : ''} onClick={() => setView('cards')}>Cards</button>
          <button className={view === 'preview' ? 'active' : ''} onClick={() => setView('preview')}>As rendered</button>
        </div>
      </div>

      {isLoading && <Spinner />}
      {!isLoading && fragments.length === 0 && (
        <Empty icon={<Layers size={30} />} title="No fragments yet">
          <a href="/profile#import">Import a rendercv YAML</a> or create one with New fragment.
        </Empty>
      )}

      {grouped.map(([section, items]) => (
        <section key={section} className="lib-section">
          <h2>{section} <span className="muted small">{items.length}</span></h2>
          <div className={view === 'cards' ? 'card-grid' : 'preview-list'}>
            {items.map((f) => {
              const actions = (
                <>
                  <button className="icon-btn" title={f.pinned ? 'Unpin' : 'Pin: auto-add to new resumes'} onClick={() => toggle(f, 'pinned')}><Pin size={14} className={f.pinned ? 'on' : ''} /></button>
                  <button className="icon-btn" title={f.archived ? 'Unarchive' : 'Archive'} onClick={() => toggle(f, 'archived')}><Archive size={14} /></button>
                  <button className="icon-btn" title="Duplicate as a variant" onClick={() => duplicate(f)}><Copy size={14} /></button>
                  <button className="icon-btn" title="Edit" onClick={() => setEditing({ fragment: f })}><Pencil size={14} /></button>
                  <button className="icon-btn danger" title="Delete" onClick={() => remove(f)}><Trash2 size={14} /></button>
                </>
              )
              return view === 'cards'
                ? <FragmentCard key={f.id} fragment={f} actions={actions} onClick={() => setEditing({ fragment: f })} />
                : (
                  <div key={f.id} className="preview-row" onClick={() => setEditing({ fragment: f })}>
                    <div className="row between"><span className="small muted">{f.title}</span><span onClick={(e) => e.stopPropagation()}>{actions}</span></div>
                    <FragmentPreview type={f.type} content={f.content} />
                  </div>
                )
            })}
          </div>
        </section>
      ))}

      {editing && <FragmentEditor fragment={editing.fragment} initial={editing.initial} onClose={() => setEditing(null)} />}
    </div>
  )
}
