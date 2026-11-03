import { describe, it, expect } from 'vitest'
import {
  DefaultReplayMaxAgeDays,
  replayMaxAgeDays,
  unfinishedWhere,
} from '../watcher/unfinished'

describe('replayMaxAgeDays', () => {
  it('defaults to 30 days when unset', () => {
    expect(replayMaxAgeDays(undefined)).toBe(DefaultReplayMaxAgeDays)
    expect(DefaultReplayMaxAgeDays).toBe(30)
  })

  it('uses a valid positive override', () => {
    expect(replayMaxAgeDays('45')).toBe(45)
  })

  it('falls back to the default for invalid values', () => {
    expect(replayMaxAgeDays('abc')).toBe(DefaultReplayMaxAgeDays)
    expect(replayMaxAgeDays('0')).toBe(DefaultReplayMaxAgeDays)
    expect(replayMaxAgeDays('-5')).toBe(DefaultReplayMaxAgeDays)
  })
})

describe('unfinishedWhere', () => {
  const now = new Date('2026-11-03T00:00:00Z')

  it('selects only unprocessed rows', () => {
    expect(unfinishedWhere(now, 30).processed).toBe(false)
  })

  it('only replays rows created within the max age', () => {
    expect(unfinishedWhere(now, 30).createdAt.gte.toISOString()).toBe(
      '2026-10-04T00:00:00.000Z'
    )
  })
})
