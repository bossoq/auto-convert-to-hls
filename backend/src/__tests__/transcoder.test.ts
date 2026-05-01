import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Worker before importing Transcoder so no real threads are spawned
const workerOnFn = vi.fn().mockReturnThis()
const workerMock = { on: workerOnFn }
vi.mock('worker_threads', () => ({
  Worker: vi.fn(() => workerMock),
  workerData: {},
  parentPort: null,
  isMainThread: true,
}))

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    videoProcess: { update: vi.fn().mockResolvedValue({}) },
    videoTable: { create: vi.fn().mockResolvedValue({}) },
  })),
}))

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
  },
}))

import { Transcoder } from '../ffmpeg/ffmpeg'
import type { Queue } from '../types'

const makeQueue = (name: string, extra: Partial<Queue> = {}): Queue => ({
  name,
  inputPath: `/source/${name}.mp4`,
  outputPath: `/dest/${name}`,
  ...extra,
})

let transcoder: Transcoder

beforeEach(() => {
  vi.clearAllMocks()
  transcoder = new Transcoder()
})

describe('getStatus', () => {
  it('returns idle state on a fresh instance', () => {
    const status = transcoder.getStatus()
    expect(status.busy).toBe(false)
    expect(status.job).toBe('')
    expect(status.currentFrames).toBe(0)
    expect(status.totalFramesCount).toBe(0)
    expect(status.fps).toBe(0)
    expect(status.speed).toBe(0)
  })

  it('includes a progress field', () => {
    const status = transcoder.getStatus()
    expect(status).toHaveProperty('progress')
  })
})

describe('getQueue', () => {
  it('returns empty queue on a fresh instance', () => {
    expect(transcoder.getQueue()).toEqual({ length: 0, queue: [] })
  })
})

describe('add', () => {
  it('starts processing the first job immediately (busy=true)', () => {
    transcoder.add(makeQueue('job-a'))
    expect(transcoder.getStatus().busy).toBe(true)
    expect(transcoder.getStatus().job).toBe('job-a')
  })

  it('first job is not left in the queue (it is being processed)', () => {
    transcoder.add(makeQueue('job-a'))
    expect(transcoder.getQueue().length).toBe(0)
  })

  it('second job while busy goes into the queue', () => {
    transcoder.add(makeQueue('job-a'))
    transcoder.add(makeQueue('job-b'))
    expect(transcoder.getQueue().length).toBe(1)
    expect(transcoder.getQueue().queue[0].name).toBe('job-b')
  })

  it('deduplicates: ignores add for the job currently being processed', () => {
    transcoder.add(makeQueue('job-a'))
    transcoder.add(makeQueue('job-a')) // same name as current job
    expect(transcoder.getQueue().length).toBe(0)
  })

  it('deduplicates: ignores add for a job already in the queue', () => {
    transcoder.add(makeQueue('job-a')) // starts processing
    transcoder.add(makeQueue('job-b')) // queued
    transcoder.add(makeQueue('job-b')) // duplicate — should be dropped
    expect(transcoder.getQueue().length).toBe(1)
  })

  it('allows two different jobs in the queue', () => {
    transcoder.add(makeQueue('job-a'))
    transcoder.add(makeQueue('job-b'))
    transcoder.add(makeQueue('job-c'))
    expect(transcoder.getQueue().length).toBe(2)
  })

  it('emits status and queue events via io when io is set', () => {
    const emit = vi.fn()
    transcoder.setIO({ emit })
    transcoder.add(makeQueue('job-a'))
    expect(emit).toHaveBeenCalledWith('status', expect.objectContaining({ busy: true }))
    expect(emit).toHaveBeenCalledWith('queue', expect.any(Object))
  })
})

describe('bulkAdd', () => {
  it('queues multiple items at once', () => {
    transcoder.bulkAdd([makeQueue('a'), makeQueue('b'), makeQueue('c')])
    // first item is being processed, the rest are in the queue
    expect(transcoder.getStatus().busy).toBe(true)
    expect(transcoder.getQueue().length).toBe(2)
  })

  it('starts processing the first item', () => {
    transcoder.bulkAdd([makeQueue('first'), makeQueue('second')])
    expect(transcoder.getStatus().job).toBe('first')
  })

  it('handles an empty array without error', () => {
    expect(() => transcoder.bulkAdd([])).not.toThrow()
    expect(transcoder.getStatus().busy).toBe(false)
  })
})

describe('setIO', () => {
  it('does not throw when io is set before any jobs', () => {
    const emit = vi.fn()
    expect(() => transcoder.setIO({ emit })).not.toThrow()
  })

  it('emits to the registered io on add', () => {
    const emit = vi.fn()
    transcoder.setIO({ emit })
    transcoder.add(makeQueue('job-x'))
    const events = emit.mock.calls.map((c) => c[0])
    expect(events).toContain('status')
    expect(events).toContain('queue')
  })

  it('does not throw if io is not set (socketSend is a no-op)', () => {
    expect(() => transcoder.add(makeQueue('job-y'))).not.toThrow()
  })
})
