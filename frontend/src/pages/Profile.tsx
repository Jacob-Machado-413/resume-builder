import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Download, ImagePlus, Plus, Save, Trash2, Upload } from 'lucide-react'
import { api } from '../lib/api'
import type { Profile as ProfileT } from '../lib/types'
import { useDocumentTitle, useMeta, useProfile } from '../lib/hooks'
import { DesignPanel } from '../components/DesignPanel'
import { Field, Spinner, useToast } from '../components/ui'

export default function Profile() {
  const { data: profile } = useProfile()
  const { data: meta } = useMeta()
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState<ProfileT | null>(null)
  const [photoBust, setPhotoBust] = useState(0)
  useDocumentTitle('Profile & settings')
  useEffect(() => { if (profile) setForm(profile) }, [profile])
  const loaded = form !== null
  useEffect(() => {
    if (loaded && location.hash) document.querySelector(location.hash)?.scrollIntoView()
  }, [loaded])

  if (!form || !meta || !profile) return <div className="center-pad"><Spinner size={24} /></div>
  const set = <K extends keyof ProfileT>(k: K, v: ProfileT[K]) => setForm({ ...form, [k]: v })
  const dirty = JSON.stringify(form) !== JSON.stringify(profile)

  const save = async () => {
    const saved = await api.saveProfile(form)
    qc.setQueryData(['profile'], saved)
    qc.invalidateQueries({ queryKey: ['preview'] })
    toast('Profile saved')
  }

  const uploadPhoto = async (file: File) => {
    try {
      const saved = await api.uploadPhoto(file)
      qc.setQueryData(['profile'], saved)
      setForm({ ...form, photoFile: saved.photoFile })
      setPhotoBust(Date.now())
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  return (
    <div className="page-wrap">
      <header className="page-head">
        <h1>Profile &amp; settings</h1>
        <button className="btn btn-primary" disabled={!dirty} onClick={save}><Save size={15} /> Save</button>
      </header>

      <div className="two-col">
        <div className="card">
          <h3>Header</h3>
          <div className="row wrap">
            <Field label="Full name" className="half"><input value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Default headline" className="half"><input value={form.headline ?? ''} onChange={(e) => set('headline', e.target.value)} placeholder="Software Engineer" /></Field>
            <Field label="Email" className="half"><input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Phone" className="half"><input value={form.phone ?? ''} placeholder="+1 555 123 4567" onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="Location" className="half"><input value={form.location ?? ''} onChange={(e) => set('location', e.target.value)} /></Field>
            <Field label="Website" className="half"><input value={form.website ?? ''} onChange={(e) => set('website', e.target.value)} placeholder="https://" /></Field>
          </div>

          <h4>Social networks</h4>
          {form.socialNetworks.map((s, i) => (
            <div key={i} className="row">
              <select value={s.network} onChange={(e) => set('socialNetworks', form.socialNetworks.map((x, j) => (j === i ? { ...x, network: e.target.value } : x)))}>
                {meta.socialNetworks.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <input className="grow" value={s.username} placeholder="username" onChange={(e) => set('socialNetworks', form.socialNetworks.map((x, j) => (j === i ? { ...x, username: e.target.value } : x)))} />
              <button className="icon-btn danger" onClick={() => set('socialNetworks', form.socialNetworks.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 size={15} /></button>
            </div>
          ))}
          <button className="btn btn-sm" onClick={() => set('socialNetworks', [...form.socialNetworks, { network: 'LinkedIn', username: '' }])}><Plus size={14} /> Add network</button>

          <h4>Custom connections</h4>
          {form.customConnections.map((c, i) => (
            <div key={i} className="row">
              <input value={c.fontawesomeIcon} placeholder="Font Awesome icon" title="Font Awesome icon name, e.g. calendar-days" style={{ width: 150 }} onChange={(e) => set('customConnections', form.customConnections.map((x, j) => (j === i ? { ...x, fontawesomeIcon: e.target.value } : x)))} />
              <input className="grow" value={c.placeholder} placeholder="Text shown" onChange={(e) => set('customConnections', form.customConnections.map((x, j) => (j === i ? { ...x, placeholder: e.target.value } : x)))} />
              <input className="grow" value={c.url ?? ''} placeholder="https:// (optional)" onChange={(e) => set('customConnections', form.customConnections.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
              <button className="icon-btn danger" onClick={() => set('customConnections', form.customConnections.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 size={15} /></button>
            </div>
          ))}
          <button className="btn btn-sm" onClick={() => set('customConnections', [...form.customConnections, { placeholder: '', url: '', fontawesomeIcon: 'link' }])}><Plus size={14} /> Add connection</button>

          <h4>Photo</h4>
          <div className="row">
            {form.photoFile ? <img className="photo" src={`/api/profile/photo?v=${photoBust || form.photoFile}`} alt="Profile" /> : <div className="photo photo-empty"><ImagePlus size={22} /></div>}
            <label className="btn btn-sm">
              <Upload size={14} /> Upload
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
            </label>
            {form.photoFile && <button className="btn btn-sm" onClick={async () => { const p = await api.deletePhoto(); qc.setQueryData(['profile'], p); setForm({ ...form, photoFile: null }) }}>Remove</button>}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h3>Defaults for new resumes</h3>
            <Field label="Target pages">
              <select value={form.defaultTargetPages} onChange={(e) => set('defaultTargetPages', Number(e.target.value))}>
                {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <DesignPanel meta={meta} value={form.defaultDesign} onChange={(d) => set('defaultDesign', d)} hasPhoto={!!form.photoFile} />
          </div>
          <ImportCard />
          <DataCard dataDir={meta.dataDirectory} rendercv={meta.rendercv} />
        </div>
      </div>
    </div>
  )
}

function ImportCard() {
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [yaml, setYaml] = useState('')
  const [importProfile, setImportProfile] = useState(true)
  const [createResume, setCreateResume] = useState(true)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    try {
      const r = await api.importRenderCv({ yaml, importProfile, createResume, resumeName: 'Imported resume' })
      ;['fragments', 'sections', 'tags', 'profile', 'resumes', 'stats'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      setResult(`Imported ${r.fragments} fragments: ${r.sections.map((s) => `${s.title} (${s.count})`).join(', ')}.${r.warnings.length ? ' ' + r.warnings.join(' ') : ''}`)
      toast(`Imported ${r.fragments} fragments`)
      if (r.resumeId) navigate(`/resumes/${r.resumeId}`)
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card" id="import">
      <h3>Import a rendercv YAML</h3>
      <label className="btn btn-sm">
        <Upload size={14} /> Choose file
        <input type="file" accept=".yaml,.yml" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setYaml(await f.text()) }} />
      </label>
      <textarea className="mono" rows={6} value={yaml} onChange={(e) => setYaml(e.target.value)} placeholder={'cv:\n  name: …\n  sections:\n    experience:\n      - company: …'} />
      <div className="row wrap">
        <label className="check"><input type="checkbox" checked={importProfile} onChange={(e) => setImportProfile(e.target.checked)} /> Overwrite profile header</label>
        <label className="check"><input type="checkbox" checked={createResume} onChange={(e) => setCreateResume(e.target.checked)} /> Also create a resume with this layout</label>
      </div>
      <button className="btn btn-primary" disabled={!yaml.trim() || busy} onClick={run}>{busy ? 'Importing…' : 'Import'}</button>
      {result && <p className="small">{result}</p>}
    </div>
  )
}

function DataCard({ dataDir, rendercv }: { dataDir: string; rendercv?: string | null }) {
  const qc = useQueryClient()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const importLibrary = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      const r = await api.importLibrary(data)
      ;['fragments', 'jobs', 'stats', 'sections', 'tags'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      toast(`Imported ${r.fragments} fragments and ${r.jobs} jobs`)
    } catch (e) {
      toast(`Import failed: ${(e as Error).message}`, 'error')
    }
  }
  return (
    <div className="card">
      <h3>Data</h3>
      <div className="row wrap">
        <a className="btn btn-sm" href="/api/backup"><Download size={14} /> Full backup (.zip)</a>
        <a className="btn btn-sm" href="/api/export/library"><Download size={14} /> Export library (.json)</a>
        <button className="btn btn-sm" onClick={() => fileRef.current?.click()}><Upload size={14} /> Import library (.json)</button>
        <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && importLibrary(e.target.files[0])} />
      </div>
      <p className="small muted">
        The full backup has the database, every generated PDF and your photo. To restore, stop the app and unzip it into the data folder.
      </p>
      <dl className="kv small">
        <dt>Data folder</dt><dd><code>{dataDir}</code></dd>
        <dt>rendercv</dt><dd>{rendercv ?? <span className="field-error">not found</span>}</dd>
      </dl>
    </div>
  )
}
