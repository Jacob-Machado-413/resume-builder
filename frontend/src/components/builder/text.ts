import type { Fragment } from '../../lib/types'

/** All searchable text of a fragment. */
export function KeywordAnalyzerText(f: Fragment): string {
  const c = f.content
  return [c.text, c.company, c.position, c.institution, c.area, c.degree, c.name, c.title, c.journal, c.label, c.details, c.location, c.summary,
    ...c.highlights.map((h) => h.text), ...c.authors].filter(Boolean).join(' ')
}
