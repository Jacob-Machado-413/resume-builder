import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Briefcase, ExternalLink, Plus, Search, Star } from 'lucide-react'
import { api } from '../lib/api'
import type { JobInput, JobStatus } from '../lib/types'
import { STATUSES, STATUS_LABEL } from '../lib/entries'
import { fmtDate, timeAgo, useDocumentTitle, useJobs, useLocalState } from '../lib/hooks'
import { Empty, Modal, Spinner, StatusBadge, useToast } from '../components/ui'
import { JobForm, emptyJob } from '../components/JobForm'
import { ApplyDialog } from '../components/ApplyDialog'

export default function Jobs() {
  const { data: jobs = [], isLoading } = useJobs()
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [status, setStatus] = useLocalState<JobStatus | ''>('jobs.status', '')
  const [view, setView] = useLocalState<'table' | 'board'>('jobs.view', 'table')
  const [creating, setCreating] = useState<JobInput | null>(null)
  const [applying, setApplying] = useState(false)
  useDocumentTitle('Jobs')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return jobs.filter((j) => (!status || j.status === status) &&
      (!needle || [j.company, j.title, j.location, j.notes].filter(Boolean).join(' ').toLowerCase().includes(needle)))
  }, [jobs, q, status])

  const create = async () => {
    if (!creating?.company.trim() || !creating.title.trim()) return toast('Company and role are required', 'error')
    const j = await api.createJob(creating)
    qc.invalidateQueries({ queryKey: ['jobs'] })
    qc.invalidateQueries({ queryKey: ['stats'] })
    setCreating(null)
    navigate(`/jobs/${j.id}`)
  }

  const quickStatus = async (id: number, s: JobStatus) => {
    await api.setJobStatus(id, s)
    qc.invalidateQueries({ queryKey: ['jobs'] })
    qc.invalidateQueries({ queryKey: ['stats'] })
  }

  return (
    <div className="page-wrap">
      <header className="page-head">
        <h1>Jobs</h1>
        <div className="row">
          <button className="btn" onClick={() => setCreating(emptyJob())}>Save a job</button>
          <button className="btn btn-primary" onClick={() => setApplying(true)}><Plus size={15} /> Apply for a job</button>
        </div>
      </header>

      <div className="toolbar">
        <div className="search"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search jobs…" /></div>
        <select value={status} onChange={(e) => setStatus(e.target.value as JobStatus | '')}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]} ({jobs.filter((j) => j.status === s).length})</option>)}
        </select>
        <span className="grow" />
        <div className="seg">
          <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>Table</button>
          <button className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}>Board</button>
        </div>
      </div>

      {isLoading && <Spinner />}
      {!isLoading && jobs.length === 0 && (
        <Empty icon={<Briefcase size={30} />} title="No jobs yet" />
      )}

      {view === 'table' && filtered.length > 0 && (
        <table className="table">
          <thead>
            <tr><th>Company</th><th>Role</th><th>Status</th><th>Applied</th><th>Resumes</th><th>Versions</th><th>Updated</th></tr>
          </thead>
          <tbody>
            {filtered.map((j) => (
              <tr key={j.id} onClick={() => navigate(`/jobs/${j.id}`)} className="clickable">
                <td><strong>{j.company}</strong>{j.url && <a href={j.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="ext"><ExternalLink size={12} /></a>}</td>
                <td>{j.title}<div className="small muted">{j.location}</div></td>
                <td onClick={(e) => e.stopPropagation()}>
                  <select className={`status-select status-${j.status}`} value={j.status} onChange={(e) => quickStatus(j.id, e.target.value as JobStatus)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </td>
                <td>{fmtDate(j.appliedAt)}</td>
                <td>{j.resumeCount}</td>
                <td>{j.versionCount}{j.submittedVersionId && <Star size={12} className="star" aria-label="Has submitted version" />}</td>
                <td className="muted">{timeAgo(j.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {view === 'board' && (
        <div className="board">
          {STATUSES.filter((s) => !status || s === status).map((s) => {
            const col = filtered.filter((j) => j.status === s)
            return (
              <div key={s} className="board-col">
                <div className="board-col-head"><StatusBadge status={s} /> <span className="muted small">{col.length}</span></div>
                {col.map((j) => (
                  <Link key={j.id} to={`/jobs/${j.id}`} className="board-card">
                    <strong>{j.company}</strong>
                    <span className="small">{j.title}</span>
                    <span className="small muted">{j.appliedAt ? `Applied ${fmtDate(j.appliedAt)}` : `Added ${fmtDate(j.createdAt)}`}</span>
                    <select value={j.status} onClick={(e) => e.preventDefault()} onChange={(e) => quickStatus(j.id, e.target.value as JobStatus)}>
                      {STATUSES.map((x) => <option key={x} value={x}>{STATUS_LABEL[x]}</option>)}
                    </select>
                  </Link>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {applying && <ApplyDialog onClose={() => setApplying(false)} />}
      {creating && (
        <Modal wide title="Save a job" onClose={() => setCreating(null)} footer={<><button className="btn" onClick={() => setCreating(null)}>Cancel</button><button className="btn btn-primary" onClick={create}>Save job</button></>}>
          <JobForm value={creating} onChange={setCreating} />
        </Modal>
      )}
    </div>
  )
}
