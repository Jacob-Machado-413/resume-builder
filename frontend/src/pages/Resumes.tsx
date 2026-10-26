import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Plus, Search } from 'lucide-react'
import { fmtDate, timeAgo, useDocumentTitle, useResumes } from '../lib/hooks'
import { Empty, Spinner, StatusBadge } from '../components/ui'
import { NewResumeDialog } from './JobDetail'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { GradeBadge } from '../components/Grade'

export default function Resumes() {
  const { data: resumes = [], isLoading } = useResumes()
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const { data: perf } = useQuery({ queryKey: ['performance'], queryFn: api.performance })
  const tallies = new Map(perf?.resumes.map((r) => [r.resumeId, r.tally]))
  useDocumentTitle('Resumes')

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase()
    return resumes.filter((r) => !n || [r.name, r.job?.company, r.job?.title].filter(Boolean).join(' ').toLowerCase().includes(n))
  }, [resumes, q])

  return (
    <div className="page-wrap">
      <header className="page-head">
        <h1>Resumes</h1>
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> New resume</button>
      </header>
      <div className="toolbar">
        <div className="search"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search resumes…" /></div>
      </div>
      {isLoading && <Spinner />}
      {!isLoading && resumes.length === 0 && (
        <Empty icon={<FileText size={30} />} title="No resumes yet" />
      )}
      <div className="resume-grid">
        {filtered.map((r) => (
          <Link key={r.id} to={`/resumes/${r.id}`} className="resume-card">
            <div className="resume-thumb">
              {r.itemCount > 0
                ? <img src={`/api/resumes/${r.id}/thumbnail?v=${encodeURIComponent(r.updatedAt)}`} alt="" loading="lazy" />
                : <div className="thumb-empty">Empty</div>}
            </div>
            <div className="resume-card-body">
              <span className="row between"><strong>{r.name}</strong>{tallies.get(r.id) && <GradeBadge tally={tallies.get(r.id)!} size="sm" />}</span>
              {r.job && r.name !== `${r.job.company} – ${r.job.title}` && <span className="small">{r.job.company} – {r.job.title}</span>}
              <span className="row tight small muted">
                {r.job && <StatusBadge status={r.job.status} />}
                {r.versionCount ? `v${r.latestVersion?.number} · ${fmtDate(r.latestVersion?.createdAt)}` : `Edited ${timeAgo(r.updatedAt)}`}
              </span>
            </div>
          </Link>
        ))}
      </div>
      {creating && <NewResumeDialog onClose={() => setCreating(false)} />}
    </div>
  )
}
