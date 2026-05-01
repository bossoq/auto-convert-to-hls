import { describe, it, expect } from 'vitest'
import {
  DefaultFPS,
  DefaultRenditions,
  TranscodeCommand,
  ScreenshotCommand,
  FrameCountCommand,
  FPSCommand,
} from '../ffmpeg/default-renditions'

describe('DefaultFPS', () => {
  it('is a positive number', () => {
    expect(DefaultFPS).toBeGreaterThan(0)
    expect(typeof DefaultFPS).toBe('number')
  })
})

describe('DefaultRenditions', () => {
  it('has 4 renditions', () => {
    expect(DefaultRenditions).toHaveLength(4)
  })

  it('defines the expected heights', () => {
    const heights = DefaultRenditions.map((r) => r.height)
    expect(heights).toEqual([360, 480, 720, 1080])
  })

  it('all bitrate values end with k', () => {
    for (const r of DefaultRenditions) {
      expect(r.bv, `${r.height}p bv`).toMatch(/^\d+k$/)
      expect(r.maxrate, `${r.height}p maxrate`).toMatch(/^\d+k$/)
      expect(r.bufsize, `${r.height}p bufsize`).toMatch(/^\d+k$/)
      expect(r.ba, `${r.height}p ba`).toMatch(/^\d+k$/)
    }
  })

  it('maxrate is greater than bv for each rendition', () => {
    for (const r of DefaultRenditions) {
      const bv = parseInt(r.bv)
      const maxrate = parseInt(r.maxrate)
      expect(maxrate, `${r.height}p maxrate > bv`).toBeGreaterThan(bv)
    }
  })

  it('hlsTime is a string-encoded integer', () => {
    for (const r of DefaultRenditions) {
      expect(parseInt(r.hlsTime), `${r.height}p hlsTime`).toBeGreaterThan(0)
    }
  })

  it('ts_title and master_title match height', () => {
    for (const r of DefaultRenditions) {
      expect(r.ts_title).toBe(`${r.height}p`)
      expect(r.master_title).toBe(`${r.height}p`)
    }
  })

  it('renditions are in ascending order by height', () => {
    const heights = DefaultRenditions.map((r) => r.height)
    expect(heights).toEqual([...heights].sort((a, b) => a - b))
  })
})

describe('TranscodeCommand', () => {
  it('enables hardware acceleration', () => {
    expect(TranscodeCommand).toContain('-hwaccel')
    expect(TranscodeCommand).toContain('cuvid')
  })

  it('sets decoder to h264_cuvid', () => {
    const idx = TranscodeCommand.indexOf('-c:v')
    expect(TranscodeCommand[idx + 1]).toBe('h264_cuvid')
  })

  it('includes corrupt-packet tolerance flag', () => {
    expect(TranscodeCommand).toContain('+discardcorrupt')
  })
})

describe('ScreenshotCommand', () => {
  it('seeks to 10 seconds', () => {
    const idx = ScreenshotCommand.indexOf('-ss')
    expect(ScreenshotCommand[idx + 1]).toBe('00:00:10')
  })
})

describe('FrameCountCommand', () => {
  it('targets video stream and outputs nb_frames', () => {
    expect(FrameCountCommand).toContain('v:0')
    expect(FrameCountCommand).toContain('stream=nb_frames')
  })
})

describe('FPSCommand', () => {
  it('targets video stream and outputs r_frame_rate', () => {
    expect(FPSCommand).toContain('v:0')
    expect(FPSCommand).toContain('stream=r_frame_rate')
  })
})
