import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Briefcase, FilePlus2, FileStack, FileText, Layers, Plus } from 'lucide-react'
import { api } from '../lib/api'
import type { Job, JobStatus, Resume, Version } from '../lib/types'
import { STATUSES, STATUS_LABEL } from '../lib/entries'
import { fmtDate, timeAgo, useDocumentTitle, useJobs, useMeta, useProfile, useResumes } from '../lib/hooks'
import { ApplyDialog } from '../components/ApplyDialog'
import { NewResumeDialog } from './JobDetail'
import { Empty, Spinner } from '../components/ui'
import { GradeBadge, pct } from '../components/Grade'

const ACTIVE: JobStatus[] = ['saved', 'applied', 'interviewing', 'offer']

export default function Dashboard() {
  const qc = useQueryClient()
  const { data: jobs, isLoading } = useJobs()
  const { data: resumes = [] } = useResumes()
  const { data: versions = [] } = useQuery({ queryKey: ['versions'], queryFn: () => api.versions() })
  const { data: profile } = useProfile()
  const { data: meta } = useMeta()
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: api.stats })
  const { data: perf } = useQuery({ queryKey: ['performance'], queryFn: api.performance })
  const [applying, setApplying] = useState(false)
  const [resumeFor, setResumeFor] = useState<number | null>(null)
  const [showClosed, setShowClosed] = useState(false)
  useDocumentTitle('')

  const rows = useMemo(() => (jobs ?? []).map((job) => {
    const jobResumes = resumes.filter((r) => r.jobId === job.id)
    const jobVersions = versions.filter((v) => v.jobId === job.id)
    const submitted = jobVersions.find((v) => v.id === job.submittedVersionId)
    return { job, resume: jobResumes[0], latest: submitted ?? jobVersions[0], submitted }
  }), [jobs, resumes, versions])

  if (isLoading || !jobs) return <div className="center-pad"><Spinner size={24} /></div>

  const active = rows.filter((r) => ACTIVE.includes(r.job.status))
  const closed = rows.filter((r) => !ACTIVE.includes(r.job.status))
  const needsProfile = profile?.name === 'Your Name'
  const changeStatus = async (id: number, s: JobStatus) => {
    await api.setJobStatus(id, s)
    ;['jobs', 'stats', 'performance'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
  }

  return (
    <div className="page-wrap">
      <header className="page-head">
        <h1>Applications</h1>
        <button className="btn btn-primary btn-lg" onClick={() => setApplying(true)}><Plus size={17} /> Apply for a job</button>
      </header>

      {meta && !meta.rendercv && <div className="error-box">rendercv was not found on PATH, so PDFs can't be generated.</div>}
      {needsProfile && (
        <div className="notice">
          Add your name and contact details in <Link to="/profile">Profile</Link> before your first application.
        </div>
      )}

      {stats && (
        <div className="stat-row">
          <Link to="/library" className="stat"><Layers size={18} /><span className="stat-num">{stats.fragments}</span><span>fragments</span></Link>
          <Link to="/resumes" className="stat"><FilePlus2 size={18} /><span className="stat-num">{stats.resumes}</span><span>resumes</span></Link>
          <Link to="/versions" className="stat"><FileStack size={18} /><span className="stat-num">{stats.versions}</span><span>PDF versions</span></Link>
          <Link to="/jobs" className="stat"><Briefcase size={18} /><span className="stat-num">{stats.jobs}</span><span>jobs · {stats.appliedLast30} applied in 30 days</span></Link>
        </div>
      )}

      {jobs.length === 0 ? (
        <Empty icon={<Briefcase size={30} />} title="No applications yet" />
      ) : (
        <>
          <ul className="app-list">
            {active.map((r) => <AppRow key={r.job.id} {...r} onStatus={changeStatus} onCreateResume={() => setResumeFor(r.job.id)} />)}
            {active.length === 0 && <li className="muted pad">Nothing in progress.</li>}
          </ul>
          {closed.length > 0 && (
            <>
              <button className="link-btn closed-toggle" onClick={() => setShowClosed(!showClosed)}>
                {showClosed ? 'Hide' : 'Show'} {closed.length} closed application{closed.length > 1 ? 's' : ''}
              </button>
              {showClosed && (
                <ul className="app-list">
                  {closed.map((r) => <AppRow key={r.job.id} {...r} onStatus={changeStatus} onCreateResume={() => setResumeFor(r.job.id)} />)}
                </ul>
              )}
            </>
          )}
        </>
      )}

      {stats && jobs.length > 0 && (
        <div className="two-col">
          <div className="card">
            <h3>Pipeline</h3>
            <PipelineBars byStatus={stats.byStatus} />
            {stats.upcomingDeadlines.length > 0 && (
              <>
                <h4>Upcoming deadlines</h4>
                <ul className="mini-list">
                  {stats.upcomingDeadlines.map((d) => <li key={d.id}><Link to={`/jobs/${d.id}`}>{d.company} – {d.title}</Link><span className="small muted">{fmtDate(d.deadline)}</span></li>)}
                </ul>
              </>
            )}
          </div>
          <div className="card">
            <div className="row between"><h3>Performance</h3><Link to="/performance" className="small">Details</Link></div>
            {perf && perf.overall.sent > 0 ? (
              <>
                <div className="perf-summary">
                  <div><span className="stat-num">{pct(perf.overall.interviewRate)}</span><span className="small muted">interview rate</span></div>
                  <div><span className="stat-num">{pct(perf.overall.offerRate)}</span><span className="small muted">offer rate</span></div>
                  <div><span className="stat-num">{perf.overall.pending}</span><span className="small muted">waiting</span></div>
                </div>
                <ul className="mini-list">
                  {perf.resumes.slice(0, 5).map((r) => (
                    <li key={r.resumeId}>
                      <span className="row tight"><GradeBadge tally={r.tally} size="sm" /><Link to={`/resumes/${r.resumeId}`}>{r.name}</Link></span>
                      <span className="small muted">{r.tally.interviews}/{r.tally.resolved} interviews · {r.tally.sent} sent</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : <p className="muted small">Grades appear once you've sent a generated PDF.</p>}
          </div>
        </div>
      )}

      {stats && stats.recentVersions.length > 0 && (
        <div className="card recent-card">
          <h3>Recent versions</h3>
          <ul className="recent-grid">
            {stats.recentVersions.map((v) => (
              <li key={v.id}>
                <Link to={`/versions/${v.id}`}>
                  <img src={`/api/versions/${v.id}/page/1`} alt="" loading="lazy" />
                  <strong>{v.resumeName} v{v.number}</strong>
                  <span className="small muted">{v.job ? v.job.company : 'No job'} · {timeAgo(v.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {applying && <ApplyDialog onClose={() => setApplying(false)} />}
      {resumeFor !== null && <NewResumeDialog jobId={resumeFor} onClose={() => setResumeFor(null)} />}
    </div>
  )
}

function AppRow({ job, resume, latest, submitted, onStatus, onCreateResume }: {
  job: Job; resume?: Resume; latest?: Version; submitted?: Version
  onStatus: (id: number, s: JobStatus) => void; onCreateResume: () => void
}) {
  const thumb = latest ? latest.pages[0] : resume?.itemCount ? `/api/resumes/${resume.id}/thumbnail?v=${resume.updatedAt}` : null
  const next = !resume
    ? <button className="btn btn-primary btn-sm" onClick={onCreateResume}>Create resume</button>
    : !latest
      ? <Link className="btn btn-primary btn-sm" to={`/resumes/${resume.id}`}>Finish resume</Link>
      : !submitted
        ? <Link className="btn btn-primary btn-sm" to={`/versions/${latest.id}`}>Review and mark sent</Link>
        : <Link className="btn btn-sm" to={`/versions/${submitted.id}`}>View sent PDF</Link>
  return (
    <li className="app-row">
      <Link to={resume ? `/resumes/${resume.id}` : `/jobs/${job.id}`} className="app-thumb">
        {thumb ? <img src={thumb} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none' }} /> : <FileText size={22} />}
      </Link>
      <div className="app-main">
        <Link to={`/jobs/${job.id}`} className="app-title"><strong>{job.company}</strong> {job.title}</Link>
        <div className="small muted">
          {submitted ? `Sent v${submitted.number} ${fmtDate(job.appliedAt ?? submitted.createdAt)}`
            : latest ? `v${latest.number} generated ${timeAgo(latest.createdAt)}`
              : resume ? `Draft edited ${timeAgo(resume.updatedAt)}`
                : `Added ${timeAgo(job.createdAt)}`}
          {job.deadline && !submitted && ` · due ${fmtDate(job.deadline)}`}
        </div>
      </div>
      <select className={`status-select status-${job.status}`} value={job.status} onChange={(e) => onStatus(job.id, e.target.value as JobStatus)}>
        {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </select>
      <div className="app-next">{next}</div>
    </li>
  )
}

function PipelineBars({ byStatus }: { byStatus: Partial<Record<JobStatus, number>> }) {
  const max = Math.max(1, ...STATUSES.map((st) => byStatus[st] ?? 0))
  return (
    <div className="bars">
      {STATUSES.map((st) => (
        <Link key={st} to="/jobs" className="bar-row">
          <span className="bar-label">{STATUS_LABEL[st]}</span>
          <span className="bar-track"><span className={`bar-fill status-${st}`} style={{ width: `${((byStatus[st] ?? 0) / max) * 100}%` }} /></span>
          <span className="bar-num">{byStatus[st] ?? 0}</span>
        </Link>
      ))}
    </div>
  )
}
