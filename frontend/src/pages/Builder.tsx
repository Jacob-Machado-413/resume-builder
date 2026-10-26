import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Copy, Download, FileText, History, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { api, type ResumeDraft } from '../lib/api'
import type { Fragment, FragmentContent, ResumeItem, ResumeSection } from '../lib/types'
import { TYPES, newId } from '../lib/entries'
import { useDebounced, useDocumentTitle, useFragments, useJobs, useLatest, useLocalState, useMeta, useProfile } from '../lib/hooks'
import { LibraryPanel } from '../components/builder/LibraryPanel'
import { LayoutPanel } from '../components/builder/LayoutPanel'
import { PreviewPanel, computeBudget, linesPerPage } from '../components/builder/PreviewPanel'
import { DesignPanel } from '../components/DesignPanel'
import { FragmentEditor, OverrideEditor, newFragmentInput } from '../components/FragmentEditor'
import { CopyButton, Field, Modal, Spinner, Tabs, useToast } from '../components/ui'
import { Highlighted } from '../components/Md'

type RightTab = 'preview' | 'design' | 'match' | 'yaml'

export default function Builder() {
  const { id } = useParams()
  const resumeId = Number(id)
  const { data: resume, isLoading, error } = useQuery({ queryKey: ['resume', resumeId], queryFn: () => api.resume(resumeId) })

  if (isLoading) return <div className="center-pad"><Spinner size={24} /></div>
  if (error || !resume) return <div className="center-pad">Resume not found. <Link to="/resumes">Back to resumes</Link></div>
  return <BuilderInner key={resume.id} initial={resume} />
}

function BuilderInner({ initial }: { initial: Awaited<ReturnType<typeof api.resume>> }) {
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const { data: meta } = useMeta()
  const { data: fragments = [] } = useFragments()
  const { data: jobs = [] } = useJobs()
  const { data: profile } = useProfile()

  const [draft, setDraft] = useState<ResumeDraft>(() => ({
    name: initial.name, jobId: initial.jobId, headlineOverride: initial.headlineOverride, sections: initial.sections,
    design: initial.design, targetPages: initial.targetPages, notes: initial.notes,
  }))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useLocalState<RightTab>('builder.tab', 'preview')
  const [editing, setEditing] = useState<{ fragment?: Fragment; initial?: ReturnType<typeof newFragmentInput> } | null>(null)
  const [tailoring, setTailoring] = useState<{ sectionId: string; item: ResumeItem; fragment: Fragment } | null>(null)
  const [generating, setGenerating] = useState(false)
  const [menu, setMenu] = useState(false)
  useDocumentTitle(draft.name ?? 'Resume')

  const fragmentMap = useMemo(() => new Map(fragments.map((f) => [f.id, f])), [fragments])
  const inResume = useMemo(() => new Set(draft.sections.flatMap((s) => s.items.map((i) => i.fragmentId))), [draft.sections])
  const job = jobs.find((j) => j.id === draft.jobId)

  const update = useCallback((fn: (d: ResumeDraft) => ResumeDraft) => {
    setDraft((d) => fn(d))
    setDirty(true)
  }, [])
  const setSections = (sections: ResumeSection[]) => update((d) => ({ ...d, sections }))

  // ---- saving --------------------------------------------------------------------------------
  const draftRef = useLatest(draft)
  const dirtyRef = useLatest(dirty)
  const save = useCallback(async () => {
    if (!dirtyRef.current) return
    setSaving(true)
    const snapshot = draftRef.current
    try {
      const saved = await api.saveResume(initial.id, snapshot)
      if (draftRef.current === snapshot) setDirty(false)
      qc.setQueryData(['resume', initial.id], saved)
      qc.invalidateQueries({ queryKey: ['resumes'] })
      qc.invalidateQueries({ queryKey: ['fragments'] })
    } catch (e) {
      toast(`Save failed: ${(e as Error).message}`, 'error')
    } finally {
      setSaving(false)
    }
  }, [initial.id, qc, toast, draftRef, dirtyRef])

  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(save, 800)
    return () => clearTimeout(t)
  }, [draft, dirty, save])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save() }
    }
    const onUnload = (e: BeforeUnloadEvent) => { if (dirtyRef.current) e.preventDefault() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('beforeunload', onUnload)
      if (dirtyRef.current) api.saveResume(initial.id, draftRef.current).then(() => qc.invalidateQueries({ queryKey: ['resumes'] }))
    }
  }, [save, initial.id, qc, draftRef, dirtyRef])

  // ---- preview -------------------------------------------------------------------------------
  const previewInput = useMemo(() => ({
    jobId: draft.jobId, headlineOverride: draft.headlineOverride, sections: draft.sections, design: draft.design, targetPages: draft.targetPages,
  }), [draft.jobId, draft.headlineOverride, draft.sections, draft.design, draft.targetPages])
  const debounced = useDebounced(previewInput, 450)
  // Fragment edits change the output too, so they are part of the key.
  const fragmentStamp = useMemo(() => fragments.map((f) => f.updatedAt).join('|'), [fragments])
  const profileStamp = JSON.stringify(profile ?? {})
  const preview = useQuery({
    queryKey: ['preview', debounced, fragmentStamp, profileStamp],
    queryFn: ({ signal }) => api.preview(debounced, signal),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    retry: false,
  })
  const lpp = linesPerPage(draft.design, meta)
  const budget = computeBudget(preview.data, draft.targetPages, lpp)

  const keywords = useQuery({
    queryKey: ['jobKeywords', draft.jobId, fragmentStamp],
    queryFn: () => api.jobKeywords(draft.jobId!),
    enabled: !!draft.jobId,
  })
  const ranking = useMemo(
    () => (keywords.data && keywords.data.keywords.length ? new Map(keywords.data.ranking.map((r) => [r.fragmentId, r])) : undefined),
    [keywords.data],
  )

  // ---- editing helpers ----------------------------------------------------------------------
  const addFragment = (f: Fragment) => update((d) => {
    const sections = [...d.sections]
    let idx = sections.findIndex((s) => s.title.trim().toLowerCase() === f.section.trim().toLowerCase())
    if (idx < 0) {
      // A summary-style paragraph belongs at the top; everything else goes after the existing sections.
      const section = { id: newId(), title: f.section, items: [] }
      if (f.type === 'text') { sections.unshift(section); idx = 0 }
      else { sections.push(section); idx = sections.length - 1 }
    }
    sections[idx] = { ...sections[idx], items: [...sections[idx].items, { id: newId(), fragmentId: f.id }] }
    return { ...d, sections }
  })
  const removeFragment = (f: Fragment) => update((d) => ({
    ...d,
    sections: d.sections.map((s) => ({ ...s, items: s.items.filter((i) => i.fragmentId !== f.id) })),
  }))
  const setOverride = (sectionId: string, itemId: string, override: FragmentContent | null) => update((d) => ({
    ...d,
    sections: d.sections.map((s) => s.id !== sectionId ? s : {
      ...s, items: s.items.map((i) => i.id === itemId ? { ...i, override, highlightIds: override ? null : i.highlightIds } : i),
    }),
  }))
  const sortSectionsByDate = () => update((d) => ({
    ...d,
    sections: d.sections.map((s) => ({
      ...s,
      items: [...s.items].sort((a, b) => {
        const ca = fragmentMap.get(a.fragmentId)?.content, cb = fragmentMap.get(b.fragmentId)?.content
        const key = (c?: FragmentContent) => (c?.endDate === 'present' || (c?.startDate && !c?.endDate) ? '9999' : c?.endDate || c?.date || c?.startDate || '')
        return key(cb).localeCompare(key(ca))
      }),
    })),
  }))

  const deleteResume = async () => {
    if (!confirm(`Delete "${draft.name}" and all ${initial.versionCount} generated versions? This can't be undone.`)) return
    setDirty(false)
    await api.deleteResume(initial.id)
    qc.invalidateQueries({ queryKey: ['resumes'] })
    qc.invalidateQueries({ queryKey: ['versions'] })
    navigate('/resumes')
  }

  const cloneResume = async () => {
    await save()
    const copy = await api.createResume({ cloneFromId: initial.id })
    qc.invalidateQueries({ queryKey: ['resumes'] })
    toast('Resume cloned')
    navigate(`/resumes/${copy.id}`)
  }

  if (!meta) return <div className="center-pad"><Spinner size={24} /></div>

  return (
    <div className="builder">
      <header className="builder-head">
        <Link to="/resumes" className="icon-btn" aria-label="Back"><ArrowLeft size={18} /></Link>
        <input className="title-input" value={draft.name ?? ''} onChange={(e) => update((d) => ({ ...d, name: e.target.value }))} aria-label="Resume name" />
        <select className="job-select" value={draft.jobId ?? ''} onChange={(e) => update((d) => ({ ...d, jobId: e.target.value ? Number(e.target.value) : null }))}>
          <option value="">No job linked</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.company} – {j.title}</option>)}
        </select>
        <label className="target">
          Target
          <select value={draft.targetPages} onChange={(e) => update((d) => ({ ...d, targetPages: Number(e.target.value) }))}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} page{n > 1 ? 's' : ''}</option>)}
          </select>
        </label>
        <span className="save-state small muted">{saving ? 'Saving…' : dirty ? 'Unsaved' : 'Saved'}</span>
        <span className="grow" />
        <Link className="btn" to={`/versions?resume=${initial.id}`}><History size={15} /> Versions ({initial.versionCount})</Link>
        <button className="btn btn-primary" onClick={async () => { await save(); setGenerating(true) }} disabled={!!preview.data?.error}>
          <FileText size={15} /> Generate PDF
        </button>
        <div className="menu-wrap">
          <button className="icon-btn" onClick={() => setMenu(!menu)} aria-label="More"><MoreHorizontal size={18} /></button>
          {menu && (
            <div className="menu" onMouseLeave={() => setMenu(false)}>
              <button onClick={() => { setMenu(false); cloneResume() }}><Copy size={14} /> Clone resume</button>
              <a href={`/api/resumes/${initial.id}/yaml`} download={`${draft.name}.yaml`} onClick={() => setMenu(false)}><Download size={14} /> Download YAML</a>
              <button onClick={() => { setMenu(false); sortSectionsByDate() }}><History size={14} /> Sort entries newest first</button>
              <button className="danger" onClick={() => { setMenu(false); deleteResume() }}><Trash2 size={14} /> Delete resume</button>
            </div>
          )}
        </div>
      </header>

      <div className="builder-cols">
        <aside className="col col-library">
          <LibraryPanel
            fragments={fragments}
            inResume={inResume}
            ranking={ranking}
            remainingLines={budget ? budget.remainingLines : null}
            onAdd={addFragment}
            onRemove={removeFragment}
            onNew={() => setEditing({ initial: newFragmentInput() })}
            onEdit={(f) => setEditing({ fragment: f })}
          />
        </aside>

        <main className="col col-layout">
          <div className="header-card">
            <Link to="/profile" className="header-name" title="Edit in Profile">{profile?.name}</Link>
            <input
              className="headline-input"
              value={draft.headlineOverride ?? ''}
              placeholder={profile?.headline || 'Headline under your name (optional)'}
              onChange={(e) => update((d) => ({ ...d, headlineOverride: e.target.value || null }))}
              aria-label="Headline"
            />
          </div>
          <LayoutPanel
            sections={draft.sections}
            onChange={setSections}
            fragments={fragmentMap}
            onEditFragment={(f) => setEditing({ fragment: f })}
            onTailor={(sectionId, item, fragment) => setTailoring({ sectionId, item, fragment })}
          />
          <textarea className="notes-input" rows={2} value={draft.notes ?? ''} onChange={(e) => update((d) => ({ ...d, notes: e.target.value }))} placeholder="Private notes about this resume" aria-label="Notes" />
        </main>

        <aside className="col col-preview">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'preview', label: 'Preview' },
              { id: 'design', label: 'Design' },
              { id: 'match', label: <>Job match{preview.data?.coverage ? ` ${Math.round(preview.data.coverage.ratio * 100)}%` : ''}</> },
              { id: 'yaml', label: 'YAML' },
            ]}
          />
          {tab === 'preview' && (
            <PreviewPanel preview={preview.data} loading={preview.isFetching} error={preview.error ? (preview.error as Error).message : null} budget={budget} />
          )}
          {tab === 'design' && (
            <div className="pad-panel">
              <DesignPanel
                meta={meta}
                value={draft.design}
                onChange={(design) => update((d) => ({ ...d, design }))}
                keywordSuggestions={keywords.data?.keywords.map((k) => k.term)}
                hasPhoto={!!profile?.photoFile}
              />
            </div>
          )}
          {tab === 'match' && (
            <JobMatch
              jobId={draft.jobId}
              description={job?.description}
              coverage={preview.data?.coverage}
              ranking={keywords.data?.ranking ?? []}
              fragments={fragmentMap}
              inResume={inResume}
              onAdd={addFragment}
            />
          )}
          {tab === 'yaml' && (
            <div className="pad-panel">
              <div className="row end-top">{preview.data && <CopyButton text={preview.data.yaml} />}</div>
              <pre className="code">{preview.data?.yaml}</pre>
            </div>
          )}
        </aside>
      </div>

      {editing && (
        <FragmentEditor
          fragment={editing.fragment}
          initial={editing.initial}
          onClose={() => setEditing(null)}
          onSaved={(f) => { if (!editing.fragment) addFragment(f) }}
        />
      )}
      {tailoring && (
        <OverrideEditor
          fragment={tailoring.fragment}
          content={tailoring.item.override ?? tailoring.fragment.content}
          onClose={() => setTailoring(null)}
          onSave={(c) => setOverride(tailoring.sectionId, tailoring.item.id, c)}
          onReset={tailoring.item.override ? () => setOverride(tailoring.sectionId, tailoring.item.id, null) : undefined}
        />
      )}
      {generating && <GenerateDialog resumeId={initial.id} jobLabel={job ? `${job.company} – ${job.title}` : undefined} budget={budget} onClose={() => setGenerating(false)} />}
    </div>
  )
}

function GenerateDialog({ resumeId, jobLabel, budget, onClose }: {
  resumeId: number; jobLabel?: string; budget: ReturnType<typeof computeBudget>; onClose: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [label, setLabel] = useState('')
  const [notes, setNotes] = useState('')
  const labelRef = useRef<HTMLInputElement>(null)
  useEffect(() => labelRef.current?.focus(), [])
  const gen = useMutation({
    mutationFn: () => api.generate(resumeId, label, notes),
    onSuccess: ({ version }) => {
      qc.invalidateQueries({ queryKey: ['versions'] })
      qc.invalidateQueries({ queryKey: ['resumes'] })
      qc.invalidateQueries({ queryKey: ['resume', resumeId] })
      qc.invalidateQueries({ queryKey: ['jobs'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      toast(`Generated v${version.number}`)
      navigate(`/versions/${version.id}`)
    },
  })
  return (
    <Modal
      title="Generate PDF version"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={gen.isPending} onClick={() => gen.mutate()}>
            {gen.isPending ? <><Spinner /> Rendering…</> : 'Generate'}
          </button>
        </>
      }
    >
      {jobLabel && <p>For <strong>{jobLabel}</strong></p>}
      {budget?.state === 'over' && <div className="warn-inline">This is over your {budget.target}-page target.</div>}
      <Field label="Label (optional)"><input ref={labelRef} value={label} placeholder="e.g. Sent via referral" onChange={(e) => setLabel(e.target.value)} /></Field>
      <Field label="Notes (optional)"><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {gen.error && <div className="error-box"><pre>{(gen.error as Error).message}</pre></div>}
    </Modal>
  )
}

function JobMatch({ jobId, description, coverage, ranking, fragments, inResume, onAdd }: {
  jobId?: number | null
  description?: string | null
  coverage?: { covered: string[]; missing: string[]; ratio: number } | null
  ranking: { fragmentId: number; score: number; matched: string[] }[]
  fragments: Map<number, Fragment>
  inResume: Set<number>
  onAdd: (f: Fragment) => void
}) {
  if (!jobId) return <div className="pad-panel muted">Link a job to see keyword coverage and fragment suggestions.</div>
  if (!description) return <div className="pad-panel muted">This job has no description. <Link to={`/jobs/${jobId}`}>Paste the job posting</Link> to enable matching.</div>
  const suggestions = ranking.filter((r) => r.score > 0 && !inResume.has(r.fragmentId) && fragments.get(r.fragmentId)).slice(0, 8)
  return (
    <div className="pad-panel match-panel">
      {coverage && (
        <>
          <div className="coverage">
            <div className="coverage-ring" style={{ ['--p' as string]: coverage.ratio }}><span>{Math.round(coverage.ratio * 100)}%</span></div>
            <div>{coverage.covered.length} of {coverage.covered.length + coverage.missing.length} posting keywords covered</div>
          </div>
          <div className="kw-list">
            {coverage.covered.map((k) => <span key={k} className="kw kw-hit">{k}</span>)}
            {coverage.missing.map((k) => <span key={k} className="kw kw-miss">{k}</span>)}
          </div>
        </>
      )}
      <h4>Suggested fragments</h4>
      {suggestions.length === 0 && <p className="small muted">No unused fragments mention the job's keywords.</p>}
      <ul className="suggest-list">
        {suggestions.map((s) => {
          const f = fragments.get(s.fragmentId)!
          return (
            <li key={s.fragmentId}>
              <div>
                <strong>{f.title}</strong> <span className="muted small">{f.section} · {TYPES[f.type].label}</span>
                <div className="kw-list">{s.matched.map((m) => <span key={m} className="kw kw-hit">{m}</span>)}</div>
              </div>
              <button className="btn btn-sm" onClick={() => onAdd(f)}><Plus size={13} /> Add</button>
            </li>
          )
        })}
      </ul>
      <details>
        <summary>Job description</summary>
        <div className="job-desc"><Highlighted text={description} terms={[...(coverage?.covered ?? []), ...(coverage?.missing ?? [])]} /></div>
      </details>
    </div>
  )
}
