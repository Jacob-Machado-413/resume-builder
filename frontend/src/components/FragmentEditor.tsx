import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ClipboardPaste, Plus, Trash2 } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { EntryType, Fragment, FragmentContent, FragmentInput } from '../lib/types'
import { ENTRY_TYPES, TYPES, contentErrors, emptyContent, newId, validateDate } from '../lib/entries'
import { Field, Modal, TagInput, useToast } from './ui'
import { FragmentPreview } from './FragmentCard'

export function newFragmentInput(type: EntryType = 'experience', section?: string): FragmentInput {
  return { title: '', section: section ?? TYPES[type].defaultSection, type, content: emptyContent(), tags: [], notes: '', archived: false, pinned: false }
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

/** Suggests a library title from the content when the user leaves it blank. */
function autoTitle(type: EntryType, c: FragmentContent): string {
  const pick = (...xs: (string | null | undefined)[]) => xs.filter(Boolean).join(' – ')
  switch (type) {
    case 'experience': return pick(c.company, c.position)
    case 'education': return pick(c.institution, c.degree)
    case 'normal': return c.name ?? ''
    case 'publication': return c.title ?? ''
    case 'oneLine': return c.label ?? ''
    default: return (c.text ?? '').slice(0, 60)
  }
}

export function FragmentEditor({ fragment, initial, onClose, onSaved }: {
  fragment?: Fragment
  initial?: FragmentInput
  onClose: () => void
  onSaved?: (f: Fragment) => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState<FragmentInput>(() => clone(fragment ?? initial ?? newFragmentInput()))
  const [saving, setSaving] = useState(false)
  const [touched, setTouched] = useState(false)
  const { data: sections = [] } = useQuery({ queryKey: ['sections'], queryFn: api.sections })
  const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: api.tags })
  const errors = useMemo(() => contentErrors(form.type, form.content), [form])

  const set = <K extends keyof FragmentInput>(k: K, v: FragmentInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  const changeType = (type: EntryType) => {
    const wasDefault = !form.section || form.section === TYPES[form.type].defaultSection
    setForm((f) => ({ ...f, type, section: wasDefault ? TYPES[type].defaultSection : f.section }))
  }

  const save = async () => {
    setTouched(true)
    if (errors.length) return
    setSaving(true)
    try {
      const body = { ...form, title: form.title.trim() || autoTitle(form.type, form.content) || 'Untitled fragment' }
      const saved = fragment ? await api.updateFragment(fragment.id, body) : await api.createFragment(body)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['fragments'] }),
        qc.invalidateQueries({ queryKey: ['sections'] }),
        qc.invalidateQueries({ queryKey: ['tags'] }),
      ])
      toast(fragment ? 'Fragment saved' : 'Fragment added to library')
      onSaved?.(saved)
      onClose()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      wide
      title={fragment ? `Edit fragment` : 'New fragment'}
      onClose={onClose}
      footer={
        <>
          {touched && errors.length > 0 && <span className="field-error grow">{errors[0]}</span>}
          {fragment && fragment.usageCount > 0 && (
            <span className="muted grow">Used in {fragment.usageCount} resume{fragment.usageCount > 1 ? 's' : ''}. Drafts update; generated PDFs don't.</span>
          )}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save fragment'}</button>
        </>
      }
    >
      <div className="editor-grid">
        <div className="editor-form">
          <div className="row">
            <Field label="Entry type" className="half">
              <select value={form.type} onChange={(e) => changeType(e.target.value as EntryType)}>
                {ENTRY_TYPES.map((t) => <option key={t} value={t}>{TYPES[t].label}</option>)}
              </select>
            </Field>
            <Field label="Section" className="half">
              <input value={form.section} list="section-names" onChange={(e) => set('section', e.target.value)} />
              <datalist id="section-names">{sections.map((s) => <option key={s.title} value={s.title} />)}</datalist>
            </Field>
          </div>

          <ContentForm type={form.type} content={form.content} onChange={(c) => set('content', c)} />

          <hr />
          <div className="row">
            <Field label="Library name" className="half">
              <input value={form.title} placeholder={autoTitle(form.type, form.content) || 'e.g. Acme – backend focus'} onChange={(e) => set('title', e.target.value)} />
            </Field>
            <Field label="Tags" className="half">
              <TagInput value={form.tags} onChange={(v) => set('tags', v)} placeholder="backend, leadership…" suggestions={tags.map((t) => t.tag)} />
            </Field>
          </div>
          <Field label="Private notes">
            <textarea rows={2} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="When to use this variant, metrics sources…" />
          </Field>
          <div className="row">
            <label className="check"><input type="checkbox" checked={form.pinned} onChange={(e) => set('pinned', e.target.checked)} /> Pinned (added to every new resume)</label>
            <label className="check"><input type="checkbox" checked={form.archived} onChange={(e) => set('archived', e.target.checked)} /> Archived</label>
          </div>
        </div>
        <aside className="editor-preview">
          <FragmentPreview type={form.type} content={form.content} />
          <div className="small muted md-help">
            Markdown: <code>**bold**</code> <code>*italic*</code> <code>[text](url)</code>
          </div>
        </aside>
      </div>
    </Modal>
  )
}

/** Edits a resume-only copy of a fragment's content. */
export function OverrideEditor({ fragment, content, onClose, onSave, onReset }: {
  fragment: Fragment
  content: FragmentContent
  onClose: () => void
  onSave: (c: FragmentContent) => void
  onReset?: () => void
}) {
  const [c, setC] = useState(() => clone(content))
  const errors = contentErrors(fragment.type, c)
  return (
    <Modal
      wide
      title={<>Tailor “{fragment.title}” for this resume</>}
      onClose={onClose}
      footer={
        <>
          {errors.length > 0 && <span className="field-error grow">{errors[0]}</span>}
          {onReset && <button className="btn btn-ghost" onClick={() => { onReset(); onClose() }}>Reset to library version</button>}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={errors.length > 0} onClick={() => { onSave(c); onClose() }}>Use for this resume</button>
        </>
      }
    >
      <div className="editor-grid">
        <div className="editor-form"><ContentForm type={fragment.type} content={c} onChange={setC} /></div>
        <aside className="editor-preview">
          <FragmentPreview type={fragment.type} content={c} />
        </aside>
      </div>
    </Modal>
  )
}

export function ContentForm({ type, content, onChange }: { type: EntryType; content: FragmentContent; onChange: (c: FragmentContent) => void }) {
  const spec = TYPES[type]
  const set = (k: keyof FragmentContent, v: unknown) => onChange({ ...content, [k]: v })
  return (
    <>
      <div className="row wrap">
        {spec.fields.map((f) => {
          const value = (content[f.key] as string | null | undefined) ?? ''
          const dateErr = f.key === 'startDate' || f.key === 'endDate' ? validateDate(value) : null
          return (
            <Field key={f.key} label={<>{f.label}{f.required && <span className="req">*</span>}</>} className={f.half ? 'half' : 'full'} error={dateErr}>
              {f.multiline
                ? <textarea rows={type === 'text' ? 5 : 2} value={value} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
                : <input value={value} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />}
            </Field>
          )
        })}
      </div>
      {spec.authors && (
        <Field label="Authors">
          <textarea rows={3} placeholder={'One per line; *Your Name* in italics'} value={content.authors.join('\n')} onChange={(e) => set('authors', e.target.value.split('\n'))} />
        </Field>
      )}
      {spec.highlights && <HighlightsEditor value={content.highlights} onChange={(h) => set('highlights', h)} />}
    </>
  )
}

function HighlightsEditor({ value, onChange }: { value: FragmentContent['highlights']; onChange: (v: FragmentContent['highlights']) => void }) {
  const [paste, setPaste] = useState<string | null>(null)
  const update = (i: number, text: string) => onChange(value.map((h, j) => (j === i ? { ...h, text } : h)))
  const move = (i: number, d: number) => {
    const next = [...value]
    const [h] = next.splice(i, 1)
    next.splice(i + d, 0, h)
    onChange(next)
  }
  const addPasted = () => {
    const lines = (paste ?? '').split('\n').map((l) => l.replace(/^\s*[-•*●◦]\s+/, '').trim()).filter(Boolean)
    onChange([...value, ...lines.map((text) => ({ id: newId(), text }))])
    setPaste(null)
  }
  return (
    <div className="highlights-editor">
      <div className="row between">
        <span className="field-label">Highlights <span className="muted">({value.length})</span></span>
        <div className="row tight">
          <button type="button" className="btn btn-sm" onClick={() => setPaste(paste === null ? '' : null)}><ClipboardPaste size={14} /> Paste list</button>
          <button type="button" className="btn btn-sm" onClick={() => onChange([...value, { id: newId(), text: '' }])}><Plus size={14} /> Add</button>
        </div>
      </div>
      {paste !== null && (
        <div className="paste-box">
          <textarea autoFocus rows={5} value={paste} placeholder={'- Shipped X, cutting latency 40%\n- Led migration to Y'} onChange={(e) => setPaste(e.target.value)} />
          <button type="button" className="btn btn-sm btn-primary" onClick={addPasted}>Add {paste.split('\n').filter((l) => l.trim()).length} highlights</button>
        </div>
      )}
      <ol className="hl-list">
        {value.map((h, i) => (
          <li key={h.id}>
            <textarea rows={Math.max(1, Math.ceil(h.text.length / 80))} value={h.text} onChange={(e) => update(i, e.target.value)} placeholder="Achievement with a measurable result" />
            <div className="hl-actions">
              <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp size={14} /></button>
              <button type="button" className="icon-btn" disabled={i === value.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown size={14} /></button>
              <button type="button" className="icon-btn danger" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Delete"><Trash2 size={14} /></button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
