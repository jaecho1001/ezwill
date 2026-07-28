// @vitest-environment jsdom

// Lawyer ↔ client follow-up questions (#98): request shapes of the API
// helpers (auth header vs. magic token, URLs, bodies), the pure partition
// logic, and one render test of the client-portal question card.

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  askClientQuestion,
  answerClientQuestion,
  listClientQuestions,
  resolveClientQuestion,
  partitionClientQuestions,
  type ClientQuestion,
} from '@/lib/api/drafts'
import { ClientQuestionsCard } from '@/components/intake/client-questions-card'

function questionRow(overrides: Partial<ClientQuestion> = {}): ClientQuestion {
  return {
    id: 'q-1',
    question_text: 'Who should act if your backup executor cannot?',
    required: false,
    status: 'open',
    answer_text: null,
    resolution_note: null,
    document_type: null,
    clause_id: null,
    section: null,
    created_at: '2026-07-27T00:00:00Z',
    answered_at: null,
    resolved_at: null,
    asked_by: 'dashboard',
    ...overrides,
  }
}

type FetchCall = [string, { method?: string; headers: Record<string, string>; body?: string }]

describe('client-question API helpers (#98)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('askClientQuestion POSTs the question via the dashboard session (no magic token)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => questionRow() })
    vi.stubGlobal('fetch', fetchMock)

    const created = await askClientQuestion('draft-1', {
      question_text: 'Who is the alternate guardian?',
      required: true,
      document_type: 'single_will',
    })

    expect(created?.id).toBe('q-1')
    const [url, init] = fetchMock.mock.calls[0] as FetchCall
    expect(url).toBe('/api/drafts/draft-1/questions')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.headers).not.toHaveProperty('X-Magic-Token')
    expect(JSON.parse(init.body!)).toEqual({
      question_text: 'Who is the alternate guardian?',
      required: true,
      document_type: 'single_will',
      clause_id: null,
      section: null,
    })
  })

  it('askClientQuestion defaults required to false and scope to the entire file', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => questionRow() })
    vi.stubGlobal('fetch', fetchMock)

    await askClientQuestion('draft-1', { question_text: 'Any foreign assets?' })

    const [, init] = fetchMock.mock.calls[0] as FetchCall
    expect(JSON.parse(init.body!)).toEqual({
      question_text: 'Any foreign assets?',
      required: false,
      document_type: null,
      clause_id: null,
      section: null,
    })
  })

  it('listClientQuestions sends the magic token when given and unwraps the list', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ questions: [questionRow()] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const rows = await listClientQuestions('draft-1', 'magic-token-abc')

    expect(rows).toHaveLength(1)
    expect(rows?.[0].id).toBe('q-1')
    const [url, init] = fetchMock.mock.calls[0] as FetchCall
    expect(url).toBe('/api/drafts/draft-1/questions')
    expect(init.headers['X-Magic-Token']).toBe('magic-token-abc')
    expect(init.method).toBeUndefined() // GET
  })

  it('listClientQuestions omits the magic-token header for the dashboard session', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ questions: [] }) })
    vi.stubGlobal('fetch', fetchMock)

    const rows = await listClientQuestions('draft-1')

    expect(rows).toEqual([])
    const [, init] = fetchMock.mock.calls[0] as FetchCall
    expect(init.headers ?? {}).not.toHaveProperty('X-Magic-Token')
  })

  it('answerClientQuestion POSTs the answer under the client magic token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => questionRow({ status: 'answered', answer_text: 'Please use my sister.' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const updated = await answerClientQuestion('draft-1', 'q-1', 'Please use my sister.', 'magic-token-abc')

    expect(updated?.status).toBe('answered')
    const [url, init] = fetchMock.mock.calls[0] as FetchCall
    expect(url).toBe('/api/drafts/draft-1/questions/q-1/answer')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.headers['X-Magic-Token']).toBe('magic-token-abc')
    expect(JSON.parse(init.body!)).toEqual({ answer_text: 'Please use my sister.' })
  })

  it('resolveClientQuestion POSTs the optional note via the dashboard session', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => questionRow({ status: 'resolved', resolution_note: 'Confirmed by phone' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const resolved = await resolveClientQuestion('draft-1', 'q-1', 'Confirmed by phone')

    expect(resolved?.status).toBe('resolved')
    const [url, init] = fetchMock.mock.calls[0] as FetchCall
    expect(url).toBe('/api/drafts/draft-1/questions/q-1/resolve')
    expect(init.method).toBe('POST')
    expect(init.headers).not.toHaveProperty('X-Magic-Token')
    expect(JSON.parse(init.body!)).toEqual({ resolution_note: 'Confirmed by phone' })
  })

  it('resolveClientQuestion sends a null note when none is given', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => questionRow({ status: 'resolved' }) })
    vi.stubGlobal('fetch', fetchMock)

    await resolveClientQuestion('draft-1', 'q-1')

    const [, init] = fetchMock.mock.calls[0] as FetchCall
    expect(JSON.parse(init.body!)).toEqual({ resolution_note: null })
  })

  it('every helper returns null on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }))

    expect(await askClientQuestion('d', { question_text: 'x' })).toBeNull()
    expect(await listClientQuestions('d')).toBeNull()
    expect(await answerClientQuestion('d', 'q', 'a', 't')).toBeNull()
    expect(await resolveClientQuestion('d', 'q')).toBeNull()
  })

  it('every helper returns null when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    expect(await askClientQuestion('d', { question_text: 'x' })).toBeNull()
    expect(await listClientQuestions('d', 't')).toBeNull()
    expect(await answerClientQuestion('d', 'q', 'a', 't')).toBeNull()
    expect(await resolveClientQuestion('d', 'q', 'note')).toBeNull()
  })
})

describe('partitionClientQuestions', () => {
  it('splits questions into open / answered / resolved buckets, preserving order', () => {
    const result = partitionClientQuestions([
      questionRow({ id: 'o1' }),
      questionRow({ id: 'a1', status: 'answered', answer_text: 'Yes' }),
      questionRow({ id: 'r1', status: 'resolved' }),
      questionRow({ id: 'o2' }),
    ])

    expect(result.open.map((q) => q.id)).toEqual(['o1', 'o2'])
    expect(result.answered.map((q) => q.id)).toEqual(['a1'])
    expect(result.resolved.map((q) => q.id)).toEqual(['r1'])
  })

  it('returns empty buckets for an empty list', () => {
    expect(partitionClientQuestions([])).toEqual({ open: [], answered: [], resolved: [] })
  })
})

describe('ClientQuestionsCard rendering', () => {
  let container: HTMLDivElement | null = null

  afterEach(() => {
    container?.remove()
    container = null
  })

  it('shows open questions editable, answered read-only, resolved not at all — in EN and KO', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const questions = [
      questionRow({ id: 'open-1', question_text: 'Is the cottage jointly owned?' }),
      questionRow({
        id: 'ans-1',
        status: 'answered',
        question_text: 'Who is the backup guardian?',
        answer_text: 'My sister Dana.',
      }),
      questionRow({ id: 'res-1', status: 'resolved', question_text: 'A resolved question' }),
    ]
    const render = (language: 'en' | 'ko') => (
      <ClientQuestionsCard questions={questions} language={language} onAnswer={async () => true} />
    )

    await act(async () => root.render(render('en')))
    expect(container.textContent).toContain('Your lawyer has a question')
    expect(container.textContent).toContain('Is the cottage jointly owned?')
    // Only the open question offers an answer box; the answered one is read-only.
    expect(container.querySelectorAll('textarea')).toHaveLength(1)
    expect(container.textContent).toContain('My sister Dana.')
    expect(container.textContent).toContain('Answered — your lawyer will review')
    expect(container.textContent).not.toContain('A resolved question')

    await act(async () => root.render(render('ko')))
    expect(container.textContent).toContain('변호사가 확인 질문을 보냈습니다')
    expect(container.textContent).toContain('답변 보내기')
    expect(container.textContent).toContain('답변 완료 — 변호사가 검토합니다')

    // Fully resolved list → the card disappears entirely.
    await act(async () =>
      root.render(
        <ClientQuestionsCard
          questions={[questionRow({ status: 'resolved' })]}
          language="en"
          onAnswer={async () => true}
        />,
      ),
    )
    expect(container.textContent).toBe('')
    await act(async () => root.unmount())
  })
})
