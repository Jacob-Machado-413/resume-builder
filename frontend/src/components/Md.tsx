import type { ReactNode } from 'react'

/** Renders the markdown subset rendercv understands: **bold**, *italic* and [links](url). */
export function Md({ text }: { text?: string | null }) {
  if (!text) return null
  return <>{parse(text)}</>
}

function parse(s: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index))
    if (m[1] !== undefined) out.push(<strong key={k++}>{parse(m[1])}</strong>)
    else if (m[2] !== undefined) out.push(<em key={k++}>{parse(m[2])}</em>)
    else out.push(<a key={k++} href={m[4]} target="_blank" rel="noreferrer">{m[3]}</a>)
    last = re.lastIndex
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}

/** Wraps job keywords found in text with a highlight mark. */
export function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>
  const escaped = terms
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(?<![A-Za-z0-9])(${escaped.join('|')})(?![A-Za-z0-9])`, 'gi')
  const parts = text.split(re)
  return <>{parts.map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : p))}</>
}
