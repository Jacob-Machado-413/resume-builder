import { useState } from 'react'
import type { Job, JobInput } from '../lib/types'
import { STATUSES, STATUS_LABEL } from '../lib/entries'
import { Field } from './ui'

export const emptyJob = (): JobInput => ({
  company: '', title: '', url: '', location: '', salary: '', contact: '', description: '', notes: '', status: 'saved', appliedAt: null, deadline: null,
})

export const jobToInput = (j: Job): JobInput => ({
  company: j.company, title: j.title, url: j.url, location: j.location, salary: j.salary, contact: j.contact,
  description: j.description, notes: j.notes, status: j.status, appliedAt: j.appliedAt, deadline: j.deadline,
})

const dateOnly = (s?: string | null) => (s ? s.slice(0, 10) : '')

export function JobForm({ value, onChange }: { value: JobInput; onChange: (j: JobInput) => void }) {
  const set = <K extends keyof JobInput>(k: K, v: JobInput[K]) => onChange({ ...value, [k]: v })
  const [descRows] = useState(value.description ? 10 : 6)
  return (
    <div className="row wrap">
      <Field label={<>Company<span className="req">*</span></>} className="half"><input value={value.company} onChange={(e) => set('company', e.target.value)} autoFocus /></Field>
      <Field label={<>Role<span className="req">*</span></>} className="half"><input value={value.title} onChange={(e) => set('title', e.target.value)} /></Field>
      <Field label="Posting URL" className="half"><input value={value.url ?? ''} onChange={(e) => set('url', e.target.value)} placeholder="https://" /></Field>
      <Field label="Location" className="half"><input value={value.location ?? ''} onChange={(e) => set('location', e.target.value)} placeholder="Remote / city" /></Field>
      <Field label="Salary / range" className="half"><input value={value.salary ?? ''} onChange={(e) => set('salary', e.target.value)} /></Field>
      <Field label="Contact / recruiter" className="half"><input value={value.contact ?? ''} onChange={(e) => set('contact', e.target.value)} /></Field>
      <Field label="Status" className="third">
        <select value={value.status} onChange={(e) => set('status', e.target.value as JobInput['status'])}>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </Field>
      <Field label="Applied on" className="third"><input type="date" value={dateOnly(value.appliedAt)} onChange={(e) => set('appliedAt', e.target.value || null)} /></Field>
      <Field label="Deadline" className="third"><input type="date" value={dateOnly(value.deadline)} onChange={(e) => set('deadline', e.target.value || null)} /></Field>
      <Field label="Job posting" className="full">
        <textarea rows={descRows} placeholder="Paste the full posting to match it against your fragments" value={value.description ?? ''} onChange={(e) => set('description', e.target.value)} />
      </Field>
      <Field label="Notes" className="full"><textarea rows={3} value={value.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
    </div>
  )
}
