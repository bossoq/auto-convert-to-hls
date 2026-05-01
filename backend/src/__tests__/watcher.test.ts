import { describe, it, expect, vi, beforeEach } from 'vitest'

// chokidar.watch() runs at module scope in watcher.ts — mock before import
vi.mock('chokidar', () => ({
  watch: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis() }),
}))

vi.mock('fs', () => ({
  default: {
    readdirSync: vi.fn().mockReturnValue([]),
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
  },
}))

import fs from 'fs'
import { getAllFiles } from '../watcher/watcher'

const mockReaddirSync = vi.mocked(fs.readdirSync)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getAllFiles', () => {
  it('returns an empty array when directory is empty', () => {
    mockReaddirSync.mockReturnValue([] as any)
    expect(getAllFiles('/source/')).toEqual([])
  })

  it('returns only .mp4 files', () => {
    mockReaddirSync.mockReturnValue([
      'video.mp4',
      'image.jpg',
      'document.txt',
      'audio.mp3',
    ] as any)
    const result = getAllFiles('/source/')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('video')
  })

  it('excludes files starting with ._', () => {
    mockReaddirSync.mockReturnValue(['._hidden.mp4', 'visible.mp4'] as any)
    const result = getAllFiles('/source/')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('visible')
  })

  it('returns correct Queue shape', () => {
    mockReaddirSync.mockReturnValue(['my-recording.mp4'] as any)
    const result = getAllFiles('/source/')
    expect(result[0]).toMatchObject({
      name: 'my-recording',
      inputPath: '/source/my-recording.mp4',
    })
    expect(result[0].outputPath).toContain('my-recording')
  })

  it('uses the provided dir for inputPath', () => {
    mockReaddirSync.mockReturnValue(['clip.mp4'] as any)
    const result = getAllFiles('/custom/path/')
    expect(result[0].inputPath).toBe('/custom/path/clip.mp4')
  })

  it('handles multiple mp4 files', () => {
    mockReaddirSync.mockReturnValue([
      'alpha.mp4',
      'beta.mp4',
      'gamma.mp4',
    ] as any)
    const result = getAllFiles('/source/')
    expect(result).toHaveLength(3)
    expect(result.map((r) => r.name)).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('does not set autoPublish on filesystem-watched files', () => {
    mockReaddirSync.mockReturnValue(['local.mp4'] as any)
    const result = getAllFiles('/source/')
    expect(result[0].autoPublish).toBeUndefined()
  })
})
