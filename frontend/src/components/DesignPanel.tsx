import type { DesignSettings, Meta } from '../lib/types'
import { Field, TagInput } from './ui'

const COLORS = ['#004f90', '#2f5bd3', '#0f766e', '#7c3aed', '#b91c1c', '#c2410c', '#374151', '#000000']

const THEME_NOTES: Record<string, string> = {
  classic: 'Blue accents, partial-line section titles',
  engineeringresumes: 'Dense, single-colour, ATS friendly',
  engineeringclassic: 'Classic layout tuned for engineers',
  sb2nov: 'The popular LaTeX "Jake" style',
  moderncv: 'Dates in a left column',
  harvard: 'Traditional serif, centred header',
  ember: 'Warm accent colours',
  ink: 'Minimal monochrome',
  opal: 'Soft modern look',
}

export function DesignPanel({ meta, value, onChange, keywordSuggestions, hasPhoto }: {
  meta: Meta
  value: DesignSettings
  onChange: (d: DesignSettings) => void
  keywordSuggestions?: string[]
  hasPhoto?: boolean
}) {
  const set = <K extends keyof DesignSettings>(k: K, v: DesignSettings[K]) => onChange({ ...value, [k]: v })
  const tri = (v?: boolean | null) => (v === true ? 'on' : v === false ? 'off' : '')
  const fromTri = (s: string) => (s === 'on' ? true : s === 'off' ? false : null)
  return (
    <div className="design-panel">
      <div className="theme-grid">
        {meta.themes.map((t) => (
          <button key={t} type="button" className={`theme-option ${value.theme === t ? 'active' : ''}`} onClick={() => set('theme', t)}>
            <strong>{t}</strong>
            <span>{THEME_NOTES[t] ?? ''}</span>
          </button>
        ))}
      </div>

      <div className="row wrap">
        <Field label="Page size" className="half">
          <select value={value.pageSize} onChange={(e) => set('pageSize', e.target.value)}>
            {meta.pageSizes.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Language" className="half">
          <select value={value.locale} onChange={(e) => set('locale', e.target.value)}>
            {meta.locales.map((l) => <option key={l} value={l}>{l.replace(/_/g, ' ')}</option>)}
          </select>
        </Field>
        <Field label="Font" className="half">
          <select value={value.fontFamily ?? ''} onChange={(e) => set('fontFamily', e.target.value || null)}>
            <option value="">Theme default</option>
            {meta.fonts.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </Field>
        <Field label="Body font size" className="half">
          <input value={value.fontSize ?? ''} placeholder="Theme default" onChange={(e) => set('fontSize', e.target.value || null)} />
        </Field>
        <Field label="Page margins" className="half">
          <input value={value.margin ?? ''} placeholder={meta.themeMargins[value.theme]} onChange={(e) => set('margin', e.target.value || null)} />
        </Field>
        <Field label="Line spacing" className="half">
          <input value={value.lineSpacing ?? ''} placeholder="Theme default (e.g. 0.6em)" onChange={(e) => set('lineSpacing', e.target.value || null)} />
        </Field>
        <Field label="Text alignment" className="half">
          <select value={value.alignment ?? ''} onChange={(e) => set('alignment', e.target.value || null)}>
            <option value="">Theme default</option>
            <option value="left">Left</option>
            <option value="justified">Justified</option>
            <option value="justified-with-no-hyphenation">Justified, no hyphenation</option>
          </select>
        </Field>
        <Field label="Accent colour" className="half">
          <div className="swatches">
            <button type="button" className={`swatch swatch-none ${!value.primaryColor ? 'active' : ''}`} onClick={() => set('primaryColor', null)} title="Theme default">∅</button>
            {COLORS.map((c) => (
              <button key={c} type="button" className={`swatch ${value.primaryColor === c ? 'active' : ''}`} style={{ background: c }} onClick={() => set('primaryColor', c)} aria-label={c} />
            ))}
            <input type="color" value={value.primaryColor ?? '#004f90'} onChange={(e) => set('primaryColor', e.target.value)} aria-label="Custom colour" />
          </div>
        </Field>
        <Field label="Footer (name, page x/y)" className="half">
          <select value={tri(value.showFooter)} onChange={(e) => set('showFooter', fromTri(e.target.value))}>
            <option value="">Theme default</option><option value="on">Show</option><option value="off">Hide</option>
          </select>
        </Field>
        <Field label='"Last updated" note' className="half">
          <select value={tri(value.showTopNote)} onChange={(e) => set('showTopNote', fromTri(e.target.value))}>
            <option value="">Theme default</option><option value="on">Show</option><option value="off">Hide</option>
          </select>
        </Field>
        <Field label="Contact icons (email, LinkedIn…)" className="half">
          <select value={tri(value.showConnectionIcons)} onChange={(e) => set('showConnectionIcons', fromTri(e.target.value))}>
            <option value="">Theme default</option><option value="on">Show</option><option value="off">Hide</option>
          </select>
        </Field>
      </div>

      <label className="check">
        <input type="checkbox" checked={value.showPhoto} disabled={!hasPhoto} onChange={(e) => set('showPhoto', e.target.checked)} />
        Include profile photo{!hasPhoto && ' (upload one in Profile)'}
      </label>

      <Field label="Bold keywords">
        <TagInput value={value.boldKeywords} onChange={(v) => set('boldKeywords', v)} placeholder="Kubernetes, C#…" />
      </Field>
      {keywordSuggestions && keywordSuggestions.length > 0 && (
        <div className="kw-suggest" title="Keywords from the job posting">
          {keywordSuggestions.filter((k) => !value.boldKeywords.some((b) => b.toLowerCase() === k.toLowerCase())).slice(0, 14).map((k) => (
            <button key={k} type="button" className="kw kw-add" onClick={() => set('boldKeywords', [...value.boldKeywords, k])}>+ {k}</button>
          ))}
        </div>
      )}

      <details className="advanced">
        <summary>Advanced: raw design YAML</summary>
        <textarea
          className="mono"
          rows={8}
          value={value.customDesignYaml ?? ''}
          placeholder={'section_titles:\n  type: with_full_line\nentries:\n  highlights:\n    bullet: ◦'}
          onChange={(e) => set('customDesignYaml', e.target.value || null)}
        />
      </details>
    </div>
  )
}
