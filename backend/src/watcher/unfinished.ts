// The Meet REST API only keeps conference records for a limited time (~30
// days). Past that, getConferences() returns nothing for a space, so a
// videoProcess row can never yield a recording and replaying it on every
// startup is wasted API calls. Rooms that were created but never recorded
// also stay unprocessed forever, so they must age out the same way.
export const DefaultReplayMaxAgeDays = 30

export const replayMaxAgeDays = (raw = process.env.REPLAY_MAX_AGE_DAYS) => {
  const days = Number(raw)
  return Number.isFinite(days) && days > 0 ? days : DefaultReplayMaxAgeDays
}

export const unfinishedWhere = (now: Date, maxAgeDays: number) => ({
  processed: false,
  createdAt: {
    gte: new Date(now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000),
  },
})
