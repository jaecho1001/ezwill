/**
 * The intake page's credential must never re-enter a URL the app builds
 * (#91, Codex re-review): the chapter-sync and mode-toggle effects used to
 * rebuild the query from a snapshot that still held ?t=, scheduling another
 * token-bearing navigation after the initial strip.
 */
import { describe, it, expect } from 'vitest'
import { cleanUrl, paramsWithoutToken } from '@/lib/intake/url-params'

describe('paramsWithoutToken', () => {
  it('removes the credential and keeps everything else', () => {
    const params = paramsWithoutToken('t=secret-token&lang=ko&chapter=3')
    expect(params.get('t')).toBeNull()
    expect(params.get('lang')).toBe('ko')
    expect(params.get('chapter')).toBe('3')
  })
})

describe('cleanUrl', () => {
  it('strips the token on arrival while preserving language deep-links', () => {
    expect(cleanUrl('/intake/draft-1', 't=secret-token&lang=ko'))
      .toBe('/intake/draft-1?lang=ko')
  })

  it('never re-adds the token when chapter navigation rebuilds the query', () => {
    const url = cleanUrl('/intake/draft-1', 't=secret-token&lang=ko', { chapter: '4' })
    expect(url).not.toContain('secret-token')
    expect(url).not.toContain('t=')
    expect(url).toContain('chapter=4')
    expect(url).toContain('lang=ko')
  })

  it('never re-adds the token when the chat toggle rebuilds the query', () => {
    const on = cleanUrl('/intake/draft-1', 't=secret-token&chapter=2', { mode: 'chat' })
    expect(on).not.toContain('secret-token')
    expect(on).toContain('mode=chat')

    const off = cleanUrl('/intake/draft-1', 't=secret-token&mode=chat', { mode: null })
    expect(off).not.toContain('secret-token')
    expect(off).not.toContain('mode=')
  })

  it('drops the "?" entirely when nothing but the token was present', () => {
    expect(cleanUrl('/intake/draft-1', 't=secret-token')).toBe('/intake/draft-1')
  })
})
