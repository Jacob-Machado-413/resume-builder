import { AlertTriangle, ZoomIn, ZoomOut } from 'lucide-react'
import type { DesignSettings, Meta, PreviewResponse } from '../../lib/types'
import { Spinner } from '../ui'
import { useLocalState } from '../../lib/hooks'

const PAGE_HEIGHT_IN: Record<string, number> = { 'us-letter': 11, a4: 297 / 25.4, a5: 210 / 25.4, 'us-executive': 10.5 }

function toInches(dim?: string | null): number | null {
  const m = dim?.trim().match(/^([0-9]*\.?[0-9]+)\s*(in|cm|mm|pt)$/)
  if (!m) return null
  const v = parseFloat(m[1])
  return m[2] === 'in' ? v : m[2] === 'cm' ? v / 2.54 : m[2] === 'mm' ? v / 25.4 : v / 72
}

/** Approximate body lines per page, from page size, margins and font size. */
export function linesPerPage(design: DesignSettings, meta?: Meta): number {
  const margin = toInches(design.margin) ?? toInches(meta?.themeMargins[design.theme]) ?? 0.7
  const usable = ((PAGE_HEIGHT_IN[design.pageSize] ?? 11) - 2 * margin) * 72
  const font = parseFloat(design.fontSize ?? '') || 10
  return usable / (font * 1.55)
}

export interface Budget {
  pages: number
  target: number
  lastFill: number
  used: number
  state: 'over' | 'under' | 'good' | 'empty'
  remainingLines: number
}

export function computeBudget(preview: PreviewResponse | undefined, target: number, lpp: number): Budget | null {
  if (!preview || preview.error || preview.pageCount === 0) return null
  const pages = preview.pageCount
  const lastFill = preview.pages[pages - 1]?.fill ?? 0
  const used = pages - 1 + lastFill
  const state = pages > target ? 'over' : used < 0.15 ? 'empty' : pages < target || lastFill < 0.8 ? 'under' : 'good'
  return { pages, target, lastFill, used, state, remainingLines: (target - used) * lpp }
}

export function BudgetMeter({ budget }: { budget: Budget | null }) {
  if (!budget) return <div className="budget budget-none muted small">No preview yet</div>
  const segments = Math.max(budget.target, budget.pages)
  const text =
    budget.state === 'over' ? `${budget.pages} pages · over by ≈${Math.round(-budget.remainingLines)} lines`
      : budget.state === 'good' ? `${budget.pages}/${budget.target} page${budget.target > 1 ? 's' : ''} · filled`
        : `${Math.round(budget.used * 100) / 100}/${budget.target} pages · room for ≈${Math.round(budget.remainingLines)} lines`
  return (
    <div className={`budget budget-${budget.state}`} title="How full the target page count is">
      <div className="budget-bar">
        {Array.from({ length: segments }, (_, i) => {
          const fill = i < budget.pages - 1 ? 1 : i === budget.pages - 1 ? budget.lastFill : 0
          const over = i >= budget.target
          return (
            <div key={i} className={`budget-seg ${over ? 'over' : ''}`}>
              <div className="budget-fill" style={{ width: `${Math.round(fill * 100)}%` }} />
            </div>
          )
        })}
      </div>
      <span className="budget-text">{text}</span>
    </div>
  )
}

export function PreviewPanel({ preview, loading, error, budget }: {
  preview?: PreviewResponse
  loading: boolean
  error?: string | null
  budget: Budget | null
}) {
  const [zoom, setZoom] = useLocalState('builder.zoom', 100)
  return (
    <div className="preview-panel">
      <div className="panel-toolbar">
        <BudgetMeter budget={budget} />
        <span className="grow" />
        {loading && <Spinner />}
        <button className="icon-btn" onClick={() => setZoom(Math.max(40, zoom - 15))} aria-label="Zoom out"><ZoomOut size={15} /></button>
        <span className="small muted">{zoom}%</span>
        <button className="icon-btn" onClick={() => setZoom(Math.min(200, zoom + 15))} aria-label="Zoom in"><ZoomIn size={15} /></button>
      </div>

      {error && <div className="error-box"><pre>{error}</pre></div>}
      {preview?.error && (
        <div className="error-box">
            <pre>{preview.error}</pre>
        </div>
      )}
      {preview && preview.warnings.length > 0 && (
        <ul className="warn-list">{preview.warnings.map((w) => <li key={w}><AlertTriangle size={13} /> {w}</li>)}</ul>
      )}

      <div className="pages" style={{ ['--zoom' as string]: zoom / 100 }}>
        {preview?.pages.map((p) => (
          <figure key={p.url} className={`page ${budget && p.number > budget.target ? 'page-over' : ''}`}>
            <img src={p.url} alt={`Page ${p.number}`} />
            <figcaption>
              <span>Page {p.number}</span>
              <span className="fill-mini"><span style={{ width: `${Math.round(p.fill * 100)}%` }} /></span>
              <span>{Math.round(p.fill * 100)}% full</span>
              {budget && p.number > budget.target && <span className="over-tag">beyond target</span>}
            </figcaption>
          </figure>
        ))}
        {!preview && !error && <div className="page-skeleton"><Spinner size={22} /></div>}
      </div>
    </div>
  )
}
