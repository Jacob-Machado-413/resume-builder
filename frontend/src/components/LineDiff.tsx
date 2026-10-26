import { useMemo, type ReactNode } from 'react'

type Op = { kind: 'same' | 'add' | 'del'; text: string; a?: number; b?: number }

/** Line diff via longest common subsequence; fine for resume-sized documents. */
export function diffLines(a: string[], b: string[]): Op[] {
  const n = a.length, m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: Op[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ kind: 'same', text: a[i], a: i + 1, b: j + 1 }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ kind: 'del', text: a[i], a: i + 1 }); i++ }
    else { out.push({ kind: 'add', text: b[j], b: j + 1 }); j++ }
  }
  while (i < n) { out.push({ kind: 'del', text: a[i], a: i + 1 }); i++ }
  while (j < m) { out.push({ kind: 'add', text: b[j], b: j + 1 }); j++ }
  return out
}

export function LineDiff({ before, after, context = 3 }: { before: string; after: string; context?: number }) {
  const ops = useMemo(() => diffLines(before.split('\n'), after.split('\n')), [before, after])
  const changed = ops.map((o) => o.kind !== 'same')
  const visible = ops.map((_, i) => {
    for (let k = Math.max(0, i - context); k <= Math.min(ops.length - 1, i + context); k++) if (changed[k]) return true
    return false
  })
  const adds = ops.filter((o) => o.kind === 'add').length
  const dels = ops.filter((o) => o.kind === 'del').length
  if (adds + dels === 0) return <div className="muted pad">The two versions have identical YAML.</div>
  const rows: ReactNode[] = []
  let skipped = 0
  ops.forEach((o, i) => {
    if (!visible[i]) { skipped++; return }
    if (skipped) { rows.push(<div key={`s${i}`} className="diff-skip">⋯ {skipped} unchanged lines</div>); skipped = 0 }
    rows.push(
      <div key={i} className={`diff-line diff-${o.kind}`}>
        <span className="diff-num">{o.a ?? ''}</span><span className="diff-num">{o.b ?? ''}</span>
        <span className="diff-sign">{o.kind === 'add' ? '+' : o.kind === 'del' ? '−' : ' '}</span>
        <span className="diff-text">{o.text || ' '}</span>
      </div>,
    )
  })
  if (skipped) rows.push(<div key="end" className="diff-skip">⋯ {skipped} unchanged lines</div>)
  return (
    <div className="diff">
      <div className="diff-summary small"><span className="diff-add-c">+{adds}</span> <span className="diff-del-c">−{dels}</span> lines</div>
      {rows}
    </div>
  )
}
