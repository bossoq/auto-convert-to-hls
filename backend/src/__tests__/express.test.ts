import { describe, it, expect } from 'vitest'
import { parseCorsOrigins } from '../api/express'

describe('parseCorsOrigins', () => {
  it('returns a string for a single origin', () => {
    expect(parseCorsOrigins('https://example.com')).toBe('https://example.com')
  })

  it('returns an array for multiple comma-separated origins', () => {
    expect(parseCorsOrigins('https://a.com,https://b.com')).toEqual([
      'https://a.com',
      'https://b.com',
    ])
  })

  it('trims spaces around each origin', () => {
    expect(parseCorsOrigins('https://a.com , https://b.com')).toEqual([
      'https://a.com',
      'https://b.com',
    ])
  })

  it('ignores trailing commas', () => {
    expect(parseCorsOrigins('https://a.com,')).toBe('https://a.com')
  })

  it('ignores trailing commas with multiple origins', () => {
    expect(parseCorsOrigins('https://a.com,https://b.com,')).toEqual([
      'https://a.com',
      'https://b.com',
    ])
  })
})
