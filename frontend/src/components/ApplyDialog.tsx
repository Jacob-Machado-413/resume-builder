import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useFragments, useResumes } from '../lib/hooks'
import { Field, Modal, useToast } from './ui'

type Start = 'match' | 'copy' | 'pinned' | 'none'

/** The main entry point: paste a posting, choose how to start the resume, land in the builder. */
export function ApplyDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const { data: fragments = [] } = useFragments()
  const { data: resumes = [] } = useResumes()
  const [company, setCompany] = useState('')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  // Defaults follow the data once it loads, until the user picks something.
  const [picked, setStart] = useState<Start | null>(null)
  const start: Start = picked ?? (fragments.length ? 'match' : 'pinned')
  const [pickedCopy, setCopyFrom] = useState<number | ''>('')
  const copyFrom = pickedCopy || resumes[0]?.id || ''
  const [busy, setBusy] = useState(false)

  const valid = company.trim() && title.trim() && (start !== 'copy' || copyFrom)

  const submit = async () => {
    if (!valid) return
    setBusy(true)
    try {
      const job = await api.createJob({
        company, title, url, location, description, status: 'saved', salary: null, contact: null, notes: null, appliedAt: null, deadline: null,
      })
      qc.invalidateQueries({ queryKey: ['jobs'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      if (start === 'none') {
        navigate(`/jobs/${job.id}`)
        return
      }
      const resume = await api.createResume({
        jobId: job.id,
        autoFill: start === 'match',
        cloneFromId: start === 'copy' && copyFrom ? Number(copyFrom) : undefined,
      })
      qc.invalidateQueries({ queryKey: ['resumes'] })
      navigate(`/resumes/${resume.id}`)
    } catch (e) {
      toast((e as Error).message, 'error')
      setBusy(false)
    }
  }

  return (
    <Modal
      wide
      title="Apply for a job"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!valid || busy} onClick={submit}>
            {busy ? 'Creating…' : start === 'none' ? 'Save job' : 'Create resume'}
          </button>
        </>
      }
    >
      <div className="apply-grid">
        <div>
          <div className="row wrap">
            <Field label="Company" className="half"><input autoFocus value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
            <Field label="Role" className="half"><input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field label="Posting URL" className="half"><input value={url} placeholder="https://" onChange={(e) => setUrl(e.target.value)} /></Field>
            <Field label="Location" className="half"><input value={location} onChange={(e) => setLocation(e.target.value)} /></Field>
          </div>
          <Field label="Job posting">
            <textarea rows={12} value={description} placeholder="Paste the full posting to match it against your fragments" onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        <div className="radio-cards">
          <span className="field-label">Start the resume from</span>
          <label className={start === 'match' ? 'active' : ''}>
            <input type="radio" checked={start === 'match'} disabled={!fragments.length} onChange={() => setStart('match')} />
            <strong>Best matches</strong>
            <span className="small muted">Pinned fragments plus the ones that fit this posting</span>
          </label>
          <label className={start === 'copy' ? 'active' : ''}>
            <input type="radio" checked={start === 'copy'} disabled={!resumes.length} onChange={() => setStart('copy')} />
            <strong>A previous resume</strong>
            <span className="small muted">Same layout, re-targeted</span>
          </label>
          {start === 'copy' && (
            <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value ? Number(e.target.value) : '')}>
              {resumes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
          <label className={start === 'pinned' ? 'active' : ''}>
            <input type="radio" checked={start === 'pinned'} onChange={() => setStart('pinned')} />
            <strong>Pinned fragments only</strong>
            <span className="small muted">Pick the rest yourself</span>
          </label>
          <label className={start === 'none' ? 'active' : ''}>
            <input type="radio" checked={start === 'none'} onChange={() => setStart('none')} />
            <strong>No resume yet</strong>
            <span className="small muted">Save the job for later</span>
          </label>
        </div>
      </div>
    </Modal>
  )
}
