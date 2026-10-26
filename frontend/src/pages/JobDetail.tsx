import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, FilePlus2, Save, Star, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import type { JobInput, JobStatus } from '../lib/types'
import { STATUSES, STATUS_LABEL } from '../lib/entries'
import { fmtDate, fmtDateTime, useDocumentTitle, useResumes } from '../lib/hooks'
import { Modal, Spinner, StatusBadge, useToast } from '../components/ui'
import { JobForm, jobToInput } from '../components/JobForm'

export default function JobDetail() {
  const id = Number(useParams().id)
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const { data: job, isLoading } = useQuery({ queryKey: ['job', id], queryFn: () => api.job(id) })
  const { data: versions = [] } = useQuery({ queryKey: ['versions', { jobId: id }], queryFn: () => api.versions({ jobId: id }) })
  const { data: resumes = [] } = useResumes()
  const { data: kw } = useQuery({ queryKey: ['jobKeywords', id], queryFn: () => api.jobKeywords(id), enabled: !!job?.description })
  const [form, setForm] = useState<JobInput | null>(null)
  const [note, setNote] = useState('')
  const [newResume, setNewResume] = useState(false)
  useDocumentTitle(job ? `${job.company} – ${job.title}` : 'Job')

  useEffect(() => { if (job) setForm(jobToInput(job)) }, [job])

  if (isLoading || !job || !form) return <div className="center-pad"><Spinner size={24} /></div>
  const forJob = resumes.filter((r) => r.jobId === id)
  const dirty = JSON.stringify(form) !== JSON.stringify(jobToInput(job))

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['job', id] })
    qc.invalidateQueries({ queryKey: ['jobs'] })
    qc.invalidateQueries({ queryKey: ['versions'] })
    qc.invalidateQueries({ queryKey: ['stats'] })
  }
  const save = async () => {
    await api.updateJob(id, form)
    refresh()
    qc.invalidateQueries({ queryKey: ['jobKeywords', id] })
    toast('Job saved')
  }
  const changeStatus = async (s: JobStatus) => {
    await api.setJobStatus(id, s, note || undefined)
    setNote('')
    refresh()
  }
  const remove = async () => {
    if (!confirm(`Delete ${job.company} – ${job.title}? Resumes and versions are kept but unlinked.`)) return
    await api.deleteJob(id)
    refresh()
    navigate('/jobs')
  }

  return (
    <div className="page-wrap">
      <header className="page-head">
        <div className="row">
          <Link to="/jobs" className="icon-btn" aria-label="Back"><ArrowLeft size={18} /></Link>
          <div>
            <h1>{job.company} <span className="muted">· {job.title}</span></h1>
            <div className="row tight">
              <StatusBadge status={job.status} />
              {job.appliedAt && <span className="small muted">Applied {fmtDate(job.appliedAt)}</span>}
              {job.url && <a className="small" href={job.url} target="_blank" rel="noreferrer">Posting <ExternalLink size={11} /></a>}
            </div>
          </div>
        </div>
        <div className="row">
          {forJob.length > 0 && <button className="btn" onClick={() => setNewResume(true)}><FilePlus2 size={15} /> Another resume</button>}
          {forJob.length > 0
            ? <Link className="btn btn-primary" to={`/resumes/${forJob[0].id}`}>Open resume</Link>
            : <button className="btn btn-primary" onClick={() => setNewResume(true)}><FilePlus2 size={15} /> Create resume</button>}
          <button className="icon-btn danger" onClick={remove} aria-label="Delete job"><Trash2 size={16} /></button>
        </div>
      </header>

      <div className="two-col">
        <div className="card">
          <JobForm value={form} onChange={setForm} />
          <div className="row end"><button className="btn btn-primary" disabled={!dirty} onClick={save}><Save size={15} /> Save changes</button></div>
        </div>

        <div className="stack">
          <div className="card">
            <h3>Resumes</h3>
            {versions.length === 0 && forJob.length === 0 && <p className="muted small">None yet.</p>}
            {versions.length > 0 && (
              <ul className="mini-list">
                {versions.map((v) => (
                  <li key={v.id}>
                    <Link to={`/versions/${v.id}`} className="row tight">
                      <img src={v.pages[0]} alt="" className="thumb thumb-sm" />
                      <span><strong>{v.resumeName}</strong> v{v.number}<br /><span className="small muted">{fmtDateTime(v.createdAt)} · {v.pageCount}p</span></span>
                    </Link>
                    <button
                      className={`btn btn-sm ${v.submitted ? 'btn-added' : ''}`}
                      onClick={async () => { await api.submitVersion(id, v.submitted ? null : v.id); refresh() }}
                    >
                      <Star size={13} /> {v.submitted ? 'Submitted' : 'Mark sent'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {forJob.length > 0 && (
              <ul className="mini-list">
                {forJob.map((r) => (
                  <li key={r.id}><Link to={`/resumes/${r.id}`}>{r.name}</Link><span className="badge">draft</span></li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h3>Status</h3>
            <div className="status-buttons">
              {STATUSES.map((s) => (
                <button key={s} className={`status status-${s} ${job.status === s ? 'current' : ''}`} onClick={() => changeStatus(s)}>{STATUS_LABEL[s]}</button>
              ))}
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the next status change (optional)" />
            <ol className="timeline">
              {[...job.history].reverse().map((h, i) => (
                <li key={i}><StatusBadge status={h.status} /> <span className="small muted">{fmtDateTime(h.at)}</span>{h.note && <div className="small">{h.note}</div>}</li>
              ))}
            </ol>
          </div>

          {kw && kw.keywords.length > 0 && (
            <div className="card">
              <h3>Posting keywords</h3>
              <div className="kw-list">{kw.keywords.map((k) => <span key={k.term} className="kw" title={`${k.count}×`}>{k.term}</span>)}</div>
            </div>
          )}
        </div>
      </div>

      {newResume && <NewResumeDialog jobId={id} onClose={() => setNewResume(false)} />}
    </div>
  )
}

export function NewResumeDialog({ jobId, onClose }: { jobId?: number; onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data: resumes = [] } = useResumes()
  const { data: versions = [] } = useQuery({ queryKey: ['versions'], queryFn: () => api.versions() })
  const [mode, setMode] = useState<'match' | 'blank' | 'clone' | 'version'>(jobId ? 'match' : 'blank')
  const [source, setSource] = useState<number | ''>('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true)
    try {
      const r = await api.createResume({
        name: name || undefined, jobId: jobId ?? null, autoFill: mode === 'match',
        cloneFromId: mode === 'clone' && source ? Number(source) : undefined,
        fromVersionId: mode === 'version' && source ? Number(source) : undefined,
      })
      qc.invalidateQueries({ queryKey: ['resumes'] })
      qc.invalidateQueries({ queryKey: ['jobs'] })
      navigate(`/resumes/${r.id}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="New resume" onClose={onClose} footer={
      <><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || ((mode === 'clone' || mode === 'version') && !source)} onClick={create}>Create</button></>
    }>
      <label className="field"><span className="field-label">Name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder={jobId ? 'Defaults to company – role' : 'Untitled resume'} /></label>
      <div className="radio-cards">
        {jobId && <label className={mode === 'match' ? 'active' : ''}><input type="radio" checked={mode === 'match'} onChange={() => { setMode('match'); setSource('') }} /> <strong>Best matches</strong><span className="small muted">Pinned fragments plus the ones that fit this posting</span></label>}
        <label className={mode === 'blank' ? 'active' : ''}><input type="radio" checked={mode === 'blank'} onChange={() => { setMode('blank'); setSource('') }} /> <strong>Pinned fragments only</strong><span className="small muted">Pick the rest yourself</span></label>
        <label className={mode === 'clone' ? 'active' : ''}><input type="radio" checked={mode === 'clone'} onChange={() => { setMode('clone'); setSource('') }} disabled={!resumes.length} /> <strong>Clone a resume</strong><span className="small muted">Copy another resume's current layout</span></label>
        <label className={mode === 'version' ? 'active' : ''}><input type="radio" checked={mode === 'version'} onChange={() => { setMode('version'); setSource('') }} disabled={!versions.length} /> <strong>From a sent version</strong><span className="small muted">Reuse exactly what you sent before</span></label>
      </div>
      {mode === 'clone' && (
        <select value={source} onChange={(e) => setSource(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Choose resume…</option>
          {resumes.map((r) => <option key={r.id} value={r.id}>{r.name}{r.job ? ` (${r.job.company})` : ''}</option>)}
        </select>
      )}
      {mode === 'version' && (
        <select value={source} onChange={(e) => setSource(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Choose version…</option>
          {versions.filter((v) => v.hasSnapshot).map((v) => <option key={v.id} value={v.id}>{v.resumeName} v{v.number}{v.job ? ` · ${v.job.company}` : ''} · {fmtDate(v.createdAt)}</option>)}
        </select>
      )}
    </Modal>
  )
}

