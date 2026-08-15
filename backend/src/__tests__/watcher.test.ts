import { describe, it, expect, vi, beforeEach } from 'vitest'

// chokidar.watch() runs at module scope in watcher.ts — mock before import
vi.mock('chokidar', () => ({
  watch: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis() }),
}))

vi.mock('fs', () => ({
  default: {
    readdirSync: vi.fn().mockReturnValue([]),
  },
}))

import fs from 'fs'
import { watch as chokidarWatch } from 'chokidar'
import { getAllFiles } from '../watcher/watcher'

const mockReaddirSync = vi.mocked(fs.readdirSync)

// watcher.ts passes `ignored` as part of the chokidar.watch() options at
// module load — pull it out of the mock's captured call args so the regex
// logic gets direct coverage instead of only being exercised indirectly.
const watchOptions = vi.mocked(chokidarWatch).mock.calls[0][1] as {
  ignored: (file: string) => boolean
}
const { ignored } = watchOptions

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

describe('ignored', () => {
  it('does not ignore a plain .mp4 path', () => {
    expect(ignored('/source/recording.mp4')).toBe(false)
  })

  it('ignores hidden dotfiles', () => {
    expect(ignored('/source/.recording.mp4')).toBe(true)
  })

  it('ignores paths under /google/', () => {
    expect(ignored('/source/google/recording.mp4')).toBe(true)
  })

  it('ignores paths without a real .mp4 extension', () => {
    // Regression test: an earlier version of this regex lost its escaped
    // dot inside the template literal, making "." match any character and
    // leaving the match unanchored at the end — so a file like this one
    // (extension "txt", not "mp4") was incorrectly treated as a match.
    expect(ignored('/source/testXmp4extra.txt')).toBe(true)
  })
})
