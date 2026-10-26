import { Fragment as F, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, TrendingUp } from 'lucide-react'
import { api } from '../lib/api'
import type { JobStatus, Tally } from '../lib/types'
import { STATUSES, STATUS_LABEL } from '../lib/entries'
import { fmtDate, useDocumentTitle } from '../lib/hooks'
import { Empty, Spinner } from '../components/ui'
import { GradeBadge, OutcomePill, pct } from '../components/Grade'

function RateBar({ value }: { value: number | null }) {
  return (
    <span className="rate">
      <span className="rate-track"><span className="rate-fill" style={{ width: `${Math.round((value ?? 0) * 100)}%` }} /></span>
      <span className="rate-num">{pct(value)}</span>
    </span>
  )
}

function TallyCells({ t }: { t: Tally }) {
  return (
    <>
      <td className="num">{t.sent}</td>
      <td className="num">{t.interviews}</td>
      <td className="num">{t.offers}</td>
      <td className="num muted">{t.rejected + t.noResponse}</td>
      <td className="num muted">{t.pending}</td>
      <td><RateBar value={t.interviewRate} /></td>
    </>
  )
}

const TALLY_HEAD = (
  <>
    <th className="num">Sent</th>
    <th className="num">Interviews</th>
    <th className="num">Offers</th>
    <th className="num" title="Rejected, ghosted, or no reply after 30 days">No</th>
    <th className="num">Waiting</th>
    <th title="Interviews divided by applications with a result">Interview rate</th>
  </>
)

export default function Performance() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['performance'], queryFn: api.performance })
  const [open, setOpen] = useState<number | null>(null)
  useDocumentTitle('Performance')

  if (isLoading || !data) return <div className="center-pad"><Spinner size={24} /></div>

  const setStatus = async (jobId: number, s: JobStatus) => {
    await api.setJobStatus(jobId, s)
    qc.invalidateQueries({ queryKey: ['performance'] })
    qc.invalidateQueries({ queryKey: ['jobs'] })
  }
  const o = data.overall
  const fragments = data.fragments.filter((f) => f.tally.resolved > 0)

  return (
    <div className="page-wrap">
      <header className="page-head"><h1>Performance</h1></header>

      {data.applications.length === 0 ? (
        <Empty icon={<TrendingUp size={30} />} title="No sent applications yet">
          Grades appear once a generated PDF is linked to a job you've applied to.
        </Empty>
      ) : (
        <>
          <div className="stat-row">
            <div className="stat"><span className="stat-num">{o.sent}</span><span>applications sent</span></div>
            <div className="stat"><span className="stat-num">{pct(o.interviewRate)}</span><span>interview rate</span></div>
            <div className="stat"><span className="stat-num">{pct(o.offerRate)}</span><span>offer rate</span></div>
            <div className="stat"><span className="stat-num">{o.pending}</span><span>waiting to hear back</span></div>
          </div>

          <section className="card perf-card">
            <h3>Resumes</h3>
            <table className="table perf-table">
              <thead><tr><th>Grade</th><th>Resume</th>{TALLY_HEAD}</tr></thead>
              <tbody>
                {data.resumes.map((r) => (
                  <F key={r.resumeId}>
                    <tr className="clickable" onClick={() => setOpen(open === r.resumeId ? null : r.resumeId)}>
                      <td><GradeBadge tally={r.tally} /></td>
                      <td>
                        <span className="row tight">
                          {open === r.resumeId ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <strong>{r.name}</strong>
                        </span>
                      </td>
                      <TallyCells t={r.tally} />
                    </tr>
                    {open === r.resumeId && r.applications.map((a) => (
                      <tr key={a.jobId} className="sub-row">
                        <td />
                        <td colSpan={2}><Link to={`/jobs/${a.jobId}`}>{a.company}</Link> <span className="muted small">{a.title}</span></td>
                        <td colSpan={2}><Link to={`/versions/${a.versionId}`} className="small">v{a.versionNumber}</Link> <span className="small muted">{fmtDate(a.sentAt)}</span></td>
                        <td colSpan={3}><OutcomePill outcome={a.outcome} /></td>
                      </tr>
                    ))}
                  </F>
                ))}
              </tbody>
            </table>
          </section>

          <div className="two-col">
            <section className="card perf-card">
              <h3 title="Interview rate when the fragment was included, compared with your overall rate">Fragments</h3>
              {fragments.length === 0 ? <p className="muted small">No results yet.</p> : (
                <table className="table perf-table">
                  <thead><tr><th>Fragment</th><th className="num">Sent</th><th className="num">Interviews</th><th>Rate</th><th className="num">vs overall</th></tr></thead>
                  <tbody>
                    {fragments.map((f) => (
                      <tr key={f.fragmentId} className={f.tally.lowConfidence ? 'low' : ''}>
                        <td><strong>{f.title}</strong> <span className="small muted">{f.section}</span></td>
                        <td className="num">{f.tally.sent}</td>
                        <td className="num">{f.tally.interviews}</td>
                        <td><RateBar value={f.tally.interviewRate} /></td>
                        <td className={`num lift ${f.lift === null ? '' : f.lift > 0 ? 'up' : f.lift < 0 ? 'down' : ''}`}>
                          {f.lift === null ? '–' : `${f.lift > 0 ? '+' : ''}${Math.round(f.lift * 100)} pts`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section className="card perf-card">
              <h3>Themes</h3>
              <table className="table perf-table">
                <thead><tr><th>Theme</th><th className="num">Sent</th><th className="num">Interviews</th><th>Rate</th></tr></thead>
                <tbody>
                  {data.themes.map((t) => (
                    <tr key={t.theme}>
                      <td>{t.theme}</td><td className="num">{t.tally.sent}</td><td className="num">{t.tally.interviews}</td>
                      <td><RateBar value={t.tally.interviewRate} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <section className="card perf-card">
            <h3>Applications</h3>
            <table className="table perf-table">
              <thead><tr><th>Company</th><th>Resume</th><th>Sent</th><th>Result</th><th>Status</th></tr></thead>
              <tbody>
                {data.applications.map((a) => (
                  <tr key={a.jobId}>
                    <td><Link to={`/jobs/${a.jobId}`}><strong>{a.company}</strong></Link> <span className="small muted">{a.title}</span></td>
                    <td><Link to={`/versions/${a.versionId}`}>{a.resumeName} v{a.versionNumber}</Link>{!a.submitted && <span className="small muted" title="Not marked as sent; using the latest version for this job"> (latest)</span>}</td>
                    <td>{fmtDate(a.sentAt)} <span className="small muted">{a.daysWaiting}d</span></td>
                    <td><OutcomePill outcome={a.outcome} /></td>
                    <td>
                      <select className={`status-select status-${a.status}`} value={a.status} onChange={(e) => setStatus(a.jobId, e.target.value as JobStatus)}>
                        {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  )
}
