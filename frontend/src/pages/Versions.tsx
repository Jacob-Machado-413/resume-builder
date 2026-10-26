import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Columns2, Download, ExternalLink, FileStack, GitBranch, Pencil, Search, Send, Star, Trash2,
} from 'lucide-react'
import { api } from '../lib/api'
import type { Version } from '../lib/types'
import { STATUSES, STATUS_LABEL } from '../lib/entries'
import { fmtDate, fmtDateTime, useDocumentTitle, useJobs, useLocalState } from '../lib/hooks'
import { CopyButton, Empty, Field, Modal, Spinner, StatusBadge, Tabs, useToast } from '../components/ui'
import { LineDiff } from '../components/LineDiff'

export default function Versions() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const resumeFilter = params.get('resume') ? Number(params.get('resume')) : undefined
  const { data: versions = [], isLoading } = useQuery({ queryKey: ['versions'], queryFn: () => api.versions() })
  const [q, setQ] = useState('')
  const [status, setStatus] = useLocalState('versions.status', '')
  useDocumentTitle('Versions')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return versions.filter((v) =>
      (!resumeFilter || v.resumeId === resumeFilter) &&
      (!status || (status === 'none' ? !v.job : v.job?.status === status)) &&
      (!needle || [v.resumeName, v.label, v.job?.company, v.job?.title].filter(Boolean).join(' ').toLowerCase().includes(needle)))
  }, [versions, q, status, resumeFilter])

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; job?: Version['job']; items: Version[] }>()
    for (const v of filtered) {
      const key = v.job ? `j${v.job.id}` : 'none'
      if (!map.has(key)) map.set(key, { key, job: v.job, items: [] })
      map.get(key)!.items.push(v)
    }
    return [...map.values()].sort((a, b) => (a.job ? 0 : 1) - (b.job ? 0 : 1) || b.items[0].createdAt.localeCompare(a.items[0].createdAt))
  }, [filtered])

  const selectedId = id ? Number(id) : filtered[0]?.id

  return (
    <div className="split">
      <aside className="split-list">
        <div className="panel-toolbar">
          <div className="search"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company, role, label…" /></div>
        </div>
        <div className="panel-toolbar small">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All applications</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            <option value="none">Not linked to a job</option>
          </select>
          {resumeFilter && <button className="chip" onClick={() => { params.delete('resume'); setParams(params) }}>One resume only ✕</button>}
        </div>
        {isLoading && <div className="pad"><Spinner /></div>}
        {!isLoading && filtered.length === 0 && (
          <Empty icon={<FileStack size={28} />} title="No versions yet" />
        )}
        <div className="version-groups">
          {groups.map((g) => (
            <div key={g.key} className="version-group">
              <div className="version-group-head">
                {g.job ? (
                  <>
                    <Link to={`/jobs/${g.job.id}`} className="strong">{g.job.company}</Link>
                    <span className="muted small">{g.job.title}</span>
                    <StatusBadge status={g.job.status} />
                  </>
                ) : <span className="muted">Not linked to a job</span>}
              </div>
              {g.items.map((v) => (
                <Link key={v.id} to={`/versions/${v.id}${resumeFilter ? `?resume=${resumeFilter}` : ''}`} className={`version-row ${v.id === selectedId ? 'active' : ''}`}>
                  <img src={v.pages[0]} alt="" loading="lazy" className="thumb" />
                  <div className="version-row-body">
                    <div className="row tight">
                      <strong>{v.resumeName}</strong>
                      <span className="badge">v{v.number}</span>
                      {v.submitted && <Star size={13} className="star" aria-label="Submitted" />}
                    </div>
                    {v.label && <div className="small">{v.label}</div>}
                    <div className="small muted">{fmtDateTime(v.createdAt)} · {v.pageCount}p · {v.theme}</div>
                  </div>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </aside>
      <section className="split-main">
        {selectedId ? <VersionViewer key={selectedId} id={selectedId} all={versions} /> : !isLoading && <Empty title="Select a version" />}
      </section>
    </div>
  )
}

type ViewTab = 'pdf' | 'pages' | 'text' | 'yaml' | 'compare'

function VersionViewer({ id, all }: { id: number; all: Version[] }) {
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const { data: v } = useQuery({ queryKey: ['version', id], queryFn: () => api.version(id) })
  const [tab, setTab] = useLocalState<ViewTab>('versions.tab', 'pdf')
  const [editing, setEditing] = useState(false)
  const [compareTo, setCompareTo] = useState<number | null>(null)

  if (!v) return <div className="pad"><Spinner /></div>

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['versions'] })
    qc.invalidateQueries({ queryKey: ['version', id] })
    qc.invalidateQueries({ queryKey: ['jobs'] })
    qc.invalidateQueries({ queryKey: ['job'] })
  }

  const toggleSubmitted = async () => {
    if (!v.job) return
    await api.submitVersion(v.job.id, v.submitted ? null : v.id)
    refresh()
    toast(v.submitted ? 'Unmarked as submitted' : `Marked v${v.number} as the resume sent to ${v.job.company}`)
  }

  const branch = async () => {
    const r = await api.createResume({ fromVersionId: v.id })
    qc.invalidateQueries({ queryKey: ['resumes'] })
    navigate(`/resumes/${r.id}`)
  }

  const remove = async () => {
    if (!confirm(`Delete v${v.number} of "${v.resumeName}"? The PDF will be removed.`)) return
    await api.deleteVersion(v.id)
    refresh()
    navigate('/versions')
  }

  const others = all.filter((x) => x.id !== v.id)
  const defaultCompare = compareTo ?? others.find((x) => x.resumeId === v.resumeId && x.number < v.number)?.id ?? others[0]?.id ?? null

  return (
    <div className="viewer">
      <header className="viewer-head">
        <div>
          <h2>{v.resumeName} <span className="badge">v{v.number}</span> {v.submitted && <span className="badge badge-accent"><Star size={12} /> submitted</span>}</h2>
          <div className="muted small">
            {fmtDateTime(v.createdAt)} · {v.pageCount} page{v.pageCount > 1 ? 's' : ''} · {v.theme}
            {v.job && <> · for <Link to={`/jobs/${v.job.id}`}>{v.job.company} – {v.job.title}</Link> <StatusBadge status={v.job.status} /></>}
          </div>
          {v.label && <div className="viewer-label">{v.label}</div>}
          {v.notes && <p className="small">{v.notes}</p>}
        </div>
        <div className="viewer-actions">
          <a className="btn btn-primary" href={`${v.pdfUrl}?download=true`}><Download size={15} /> PDF</a>
          <a className="btn" href={v.pdfUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open</a>
          {v.job && (
            <button className={`btn ${v.submitted ? 'btn-added' : ''}`} onClick={toggleSubmitted} title="Record that this exact PDF was sent">
              <Send size={15} /> {v.submitted ? 'Submitted' : 'Mark submitted'}
            </button>
          )}
          <Link className="btn" to={`/resumes/${v.resumeId}`}><Pencil size={15} /> Edit resume</Link>
          {v.hasSnapshot && <button className="btn" onClick={branch} title="Start a new resume from this exact layout"><GitBranch size={15} /> Branch</button>}
          <button className="btn" onClick={() => setEditing(true)}>Details</button>
          <button className="icon-btn danger" onClick={remove} aria-label="Delete version"><Trash2 size={16} /></button>
        </div>
      </header>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'pdf', label: 'PDF' },
          { id: 'pages', label: 'Pages' },
          { id: 'text', label: 'Plain text' },
          { id: 'yaml', label: 'YAML' },
          { id: 'compare', label: <><Columns2 size={14} /> Compare</> },
        ]}
      />

      <div className="viewer-body">
        {tab === 'pdf' && <iframe className="pdf-frame" src={v.pdfUrl} title="PDF" />}
        {tab === 'pages' && <div className="pages pages-grid">{v.pages.map((p, i) => <figure key={p} className="page"><img src={p} alt={`Page ${i + 1}`} /><figcaption>Page {i + 1}</figcaption></figure>)}</div>}
        {tab === 'text' && <TextView id={v.id} kind="markdown" />}
        {tab === 'yaml' && <TextView id={v.id} kind="yaml" downloadable />}
        {tab === 'compare' && (
          others.length === 0 ? <div className="pad muted">There is no other version to compare with.</div> : (
            <CompareView a={defaultCompare!} b={v} all={others} onPick={setCompareTo} />
          )
        )}
      </div>

      {editing && <EditVersion version={v} onClose={() => setEditing(false)} onSaved={refresh} />}
    </div>
  )
}

function TextView({ id, kind, downloadable }: { id: number; kind: 'yaml' | 'markdown'; downloadable?: boolean }) {
  const { data, isLoading } = useQuery({ queryKey: ['versionText', id, kind], queryFn: () => api.versionText(id, kind) })
  if (isLoading) return <Spinner />
  return (
    <div className="text-view">
      <div className="row tight end-top">
        {data && <CopyButton text={data} />}
        {downloadable && <a className="btn btn-sm" href={`/api/versions/${id}/${kind}?download=true`}>Download</a>}
      </div>
      <pre className="code">{data ?? 'Not available for this version.'}</pre>
    </div>
  )
}

function CompareView({ a, b, all, onPick }: { a: number; b: Version; all: Version[]; onPick: (id: number) => void }) {
  const other = all.find((x) => x.id === a)
  const [mode, setMode] = useState<'pages' | 'diff'>('pages')
  const ya = useQuery({ queryKey: ['versionText', a, 'yaml'], queryFn: () => api.versionText(a, 'yaml') })
  const yb = useQuery({ queryKey: ['versionText', b.id, 'yaml'], queryFn: () => api.versionText(b.id, 'yaml') })
  return (
    <div className="compare">
      <div className="row wrap">
        <select value={a} onChange={(e) => onPick(Number(e.target.value))} aria-label="Compare with">
          {all.map((x) => <option key={x.id} value={x.id}>vs {x.resumeName} v{x.number}{x.job ? ` · ${x.job.company}` : ''} · {fmtDate(x.createdAt)}</option>)}
        </select>
        <span className="grow" />
        <Tabs value={mode} onChange={setMode} tabs={[{ id: 'pages', label: 'Side by side' }, { id: 'diff', label: 'YAML diff' }]} />
      </div>
      {mode === 'pages' && other && (
        <div className="compare-cols">
          <div>
            <div className="small strong">{other.resumeName} v{other.number}{other.job && ` · ${other.job.company}`}</div>
            <div className="pages">{other.pages.map((p) => <figure key={p} className="page"><img src={p} alt="" /></figure>)}</div>
          </div>
          <div>
            <div className="small strong">{b.resumeName} v{b.number}{b.job && ` · ${b.job.company}`} (this)</div>
            <div className="pages">{b.pages.map((p) => <figure key={p} className="page"><img src={p} alt="" /></figure>)}</div>
          </div>
        </div>
      )}
      {mode === 'diff' && (ya.data !== undefined && yb.data !== undefined ? <LineDiff before={ya.data} after={yb.data} /> : <Spinner />)}
    </div>
  )
}

function EditVersion({ version, onClose, onSaved }: { version: Version; onClose: () => void; onSaved: () => void }) {
  const { data: jobs = [] } = useJobs()
  const [label, setLabel] = useState(version.label ?? '')
  const [notes, setNotes] = useState(version.notes ?? '')
  const [jobId, setJobId] = useState<number | null>(version.jobId ?? null)
  const save = async () => {
    await api.updateVersion(version.id, { label, notes, jobId })
    onSaved()
    onClose()
  }
  return (
    <Modal title={`v${version.number} details`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
      <Field label="Label"><input value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
      <Field label="Notes"><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Field label="Job this version was used for">
        <select value={jobId ?? ''} onChange={(e) => setJobId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Not linked</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.company} – {j.title}</option>)}
        </select>
      </Field>
    </Modal>
  )
}
