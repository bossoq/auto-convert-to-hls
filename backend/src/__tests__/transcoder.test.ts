import { describe, it, expect, vi, beforeEach } from 'vitest'

type Handler = (...args: any[]) => void
type FakeWorker = { file: string; handlers: Record<string, Handler> }

// Each Worker records its own event handlers so tests can drive a specific
// worker (e.g. send the transcode worker's done/failed message).
const workers = vi.hoisted(() => [] as FakeWorker[])
const prismaMock = vi.hoisted(() => ({
  videoProcess: { update: vi.fn() },
  videoTable: { create: vi.fn() },
}))

// Mock Worker before importing Transcoder so no real threads are spawned
vi.mock('worker_threads', () => ({
  Worker: vi.fn((file: string) => {
    const w = {
      file,
      handlers: {} as Record<string, Handler>,
      on(event: string, fn: Handler) {
        this.handlers[event] = fn
        return this
      },
    }
    workers.push(w)
    return w
  }),
  workerData: {},
  parentPort: null,
  isMainThread: true,
}))

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => prismaMock),
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

import fs from 'fs'
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
  workers.length = 0
  prismaMock.videoProcess.update.mockResolvedValue({})
  prismaMock.videoTable.create.mockResolvedValue({})
  transcoder = new Transcoder()
})

// createHLS awaits makeOutputDir before spawning workers; let it settle
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const transcodeWorkerFor = (name: string) => {
  const i = workers.findIndex((w) => w.file.includes('transcode-worker'))
  if (i === -1) throw new Error(`no transcode worker for ${name}`)
  return workers.splice(0, i + 1)[i]
}

const publishMeta = {
  autoPublish: true,
  meta: { id: 1, participants: [7], className: 'Math' },
}

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
    expect(emit).toHaveBeenCalledWith(
      'status',
      expect.objectContaining({ busy: true })
    )
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

  it('deduplicates entries within the batch and against the in-flight job', () => {
    transcoder.add(makeQueue('job-a')) // starts processing
    transcoder.bulkAdd([
      makeQueue('job-a'), // duplicate of in-flight job — should be dropped
      makeQueue('job-b'),
      makeQueue('job-b'), // duplicate within the batch — should be dropped
    ])
    expect(transcoder.getQueue().length).toBe(1)
    expect(transcoder.getQueue().queue[0].name).toBe('job-b')
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

describe('transcode result handling', () => {
  it('does not write index.m3u8 before the transcode finishes', async () => {
    transcoder.add(makeQueue('job-a'))
    await flush()
    transcodeWorkerFor('job-a')
    expect(fs.writeFileSync).not.toHaveBeenCalled()
  })

  it('on success: writes index.m3u8, moves the source, publishes, goes idle', async () => {
    transcoder.add(makeQueue('job-a', publishMeta))
    await flush()
    transcodeWorkerFor('job-a').handlers.message({ done: true })
    await flush()

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/dest/job-a/index.m3u8',
      expect.stringContaining('1080.m3u8')
    )
    expect(fs.renameSync).toHaveBeenCalledWith(
      '/source/job-a.mp4',
      '/source/converted/job-a.mp4'
    )
    expect(prismaMock.videoProcess.update).toHaveBeenCalled()
    expect(prismaMock.videoTable.create).toHaveBeenCalled()
    expect(transcoder.getStatus().busy).toBe(false)
  })

  it('on failure: no index.m3u8, no move, no publish, next job starts', async () => {
    transcoder.add(makeQueue('job-a', publishMeta))
    transcoder.add(makeQueue('job-b'))
    await flush()
    transcodeWorkerFor('job-a').handlers.message({
      failed: 'ffmpeg exited with code 1',
    })
    await flush()

    expect(fs.writeFileSync).not.toHaveBeenCalled()
    expect(fs.renameSync).not.toHaveBeenCalled()
    expect(prismaMock.videoProcess.update).not.toHaveBeenCalled()
    expect(prismaMock.videoTable.create).not.toHaveBeenCalled()
    expect(transcoder.getStatus().job).toBe('job-b')
  })

  it('on worker crash without a result: advances without publishing', async () => {
    transcoder.add(makeQueue('job-a', publishMeta))
    transcoder.add(makeQueue('job-b'))
    await flush()
    transcodeWorkerFor('job-a').handlers.exit(1)
    await flush()

    expect(fs.writeFileSync).not.toHaveBeenCalled()
    expect(prismaMock.videoTable.create).not.toHaveBeenCalled()
    expect(transcoder.getStatus().job).toBe('job-b')
  })
})
