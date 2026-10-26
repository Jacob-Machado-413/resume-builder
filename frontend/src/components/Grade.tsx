import type { Outcome, Tally } from '../lib/types'

export const pct = (v: number | null | undefined) => (v === null || v === undefined ? '–' : `${Math.round(v * 100)}%`)

export const OUTCOME_LABEL: Record<Outcome, string> = {
  pending: 'Waiting', noResponse: 'No response', rejected: 'Rejected', interview: 'Interview', offer: 'Offer', withdrawn: 'Withdrawn',
}

/** Letter grade from the interview rate; faded when there are too few results to trust it. */
export function GradeBadge({ tally, size = 'md' }: { tally: Tally; size?: 'sm' | 'md' | 'lg' }) {
  if (!tally.grade) {
    return <span className={`grade grade-none grade-${size}`} title={tally.sent ? 'Waiting on results' : 'Not sent yet'}>–</span>
  }
  const title = `${pct(tally.interviewRate)} interview rate from ${tally.resolved} result${tally.resolved === 1 ? '' : 's'}` +
    (tally.lowConfidence ? '. Too few results to be reliable.' : '')
  return <span className={`grade grade-${tally.grade} grade-${size} ${tally.lowConfidence ? 'low' : ''}`} title={title}>{tally.grade}</span>
}

export function OutcomePill({ outcome }: { outcome: Outcome }) {
  return <span className={`outcome outcome-${outcome}`}>{OUTCOME_LABEL[outcome]}</span>
}
