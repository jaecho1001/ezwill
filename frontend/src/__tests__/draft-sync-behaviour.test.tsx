// @vitest-environment jsdom

/**
 * Behavioural regression tests for the wizard autosave (#92) and the
 * per-draft credential store (#91).
 *
 * Codex's re-review was right that the earlier fixes had no tests: green
 * CI proved nothing about them. Each test below fails against the code as
 * it stood before the fix.
 */

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDraftSync } from '@/hooks/use-draft-sync'
import { DraftProvider, useDraft } from '@/providers/draft-provider'
import { WillFormProvider } from '@/providers/will-form-provider'

// ── Harness ──────────────────────────────────────────────────────────────

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  localStorage.clear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** Requests the hook made, in order, with the parsed PUT bodies. */
interface Recorder {
  resolveCalls: number
  puts: Array<Record<string, unknown>>
}

function stubFetch(recorder: Recorder, opts: {
  resolveOk?: boolean
  revision?: number
  putStatus?: number
} = {}) {
  const { resolveOk = true, revision = 7, putStatus = 200 } = opts
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes('/api/links/resolve')) {
      recorder.resolveCalls += 1
      if (!resolveOk) return new Response('{}', { status: 500 })
      return new Response(JSON.stringify({ draft_id: 'draft-1', revision }), { status: 200 })
    }
    if (init?.method === 'PUT') {
      recorder.puts.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ revision: revision + 1 }), { status: putStatus })
    }
    return new Response('{}', { status: 200 })
  }))
}

function Harness({ onState }: { onState: (s: ReturnType<typeof useDraftSync>) => void }) {
  const { setDraftId, setToken } = useDraft()
  const state = useDraftSync()
  onState(state)
  // Seed a magic-link session exactly as the intake arrival does.
  const seeded = (globalThis as { __seeded?: boolean }).__seeded
  if (!seeded) {
    ;(globalThis as { __seeded?: boolean }).__seeded = true
    setToken('magic-token', 'draft-1')
    setDraftId('draft-1')
  }
  return null
}

async function renderHarness(): Promise<{ latest: () => ReturnType<typeof useDraftSync> }> {
  ;(globalThis as { __seeded?: boolean }).__seeded = false
  let state: ReturnType<typeof useDraftSync> | null = null
  await act(async () => {
    root.render(
      <DraftProvider>
        <WillFormProvider>
          <Harness onState={(s) => { state = s }} />
        </WillFormProvider>
      </DraftProvider>
    )
  })
  return { latest: () => state as ReturnType<typeof useDraftSync> }
}

// ── #92: the revision baseline must fail CLOSED ──────────────────────────

describe('wizard autosave revision baseline (#92)', () => {
  it('waits for the server revision and sends it with the first save', async () => {
    const recorder: Recorder = { resolveCalls: 0, puts: [] }
    stubFetch(recorder, { revision: 7 })
    const { latest } = await renderHarness()

    await act(async () => { await latest().flush() })

    expect(recorder.resolveCalls).toBeGreaterThan(0)
    expect(recorder.puts).toHaveLength(1)
    // The load-bearing assertion: the FIRST write is conditional.
    expect(recorder.puts[0].revision).toBe(7)
  })

  it('refuses to save at all when the baseline cannot be fetched', async () => {
    const recorder: Recorder = { resolveCalls: 0, puts: [] }
    stubFetch(recorder, { resolveOk: false })
    const { latest } = await renderHarness()

    const ok = await act(async () => latest().flush())

    // Fail CLOSED: an unconditional overwrite is never sent, the client is
    // told, and their answers stay in local storage.
    expect(recorder.puts).toHaveLength(0)
    expect(ok).toBe(false)
    expect(latest().saveFailed).toBe(true)
  })

  it('retries the baseline on the next attempt instead of giving up', async () => {
    const recorder: Recorder = { resolveCalls: 0, puts: [] }
    stubFetch(recorder, { resolveOk: false })
    const { latest } = await renderHarness()
    await act(async () => { await latest().flush() })
    const afterFirst = recorder.resolveCalls

    stubFetch(recorder, { resolveOk: true, revision: 3 })
    await act(async () => { await latest().flush() })

    expect(recorder.resolveCalls).toBeGreaterThan(afterFirst)
    expect(recorder.puts).toHaveLength(1)
    expect(recorder.puts[0].revision).toBe(3)
  })
})

// ── #92: flush() is what submit awaits ───────────────────────────────────

describe('flush before submit (#92)', () => {
  it('writes immediately rather than waiting out the debounce', async () => {
    const recorder: Recorder = { resolveCalls: 0, puts: [] }
    stubFetch(recorder)
    const { latest } = await renderHarness()

    // No timers advanced: the debounce has NOT fired.
    const ok = await act(async () => latest().flush())

    expect(ok).toBe(true)
    expect(recorder.puts).toHaveLength(1)
  })

  it('reports failure so the caller can refuse to submit stale data', async () => {
    const recorder: Recorder = { resolveCalls: 0, puts: [] }
    stubFetch(recorder, { putStatus: 500 })
    const { latest } = await renderHarness()

    const ok = await act(async () => latest().flush())

    expect(ok).toBe(false)
    expect(latest().saveFailed).toBe(true)
  })
})

// ── #91: credentials are stored per draft ────────────────────────────────

describe('per-draft credential storage (#91)', () => {
  function TokenProbe({ report }: { report: (api: ReturnType<typeof useDraft>) => void }) {
    report(useDraft())
    return null
  }

  async function renderProbe() {
    let api: ReturnType<typeof useDraft> | null = null
    await act(async () => {
      root.render(
        <DraftProvider>
          <TokenProbe report={(a) => { api = a }} />
        </DraftProvider>
      )
    })
    return () => api as ReturnType<typeof useDraft>
  }

  it('keeps each draft its own token, so opening B does not break A', async () => {
    const probe = await renderProbe()
    await act(async () => {
      probe().setToken('token-a', 'draft-a')
      probe().setToken('token-b', 'draft-b')
      probe().setDraftId('draft-b')
    })

    expect(probe().token).toBe('token-b')
    // The previously opened draft is still recoverable — the single global
    // pair used to destroy it.
    expect(probe().tokenForDraft('draft-a')).toBe('token-a')
  })

  it('survives a reload (localStorage, not per-tab)', async () => {
    const probe = await renderProbe()
    await act(async () => {
      probe().setToken('token-a', 'draft-a')
      probe().setDraftId('draft-a')
    })
    act(() => root.unmount())

    root = createRoot(container)
    const reloaded = await renderProbe()
    expect(reloaded().token).toBe('token-a')
  })

  it('migrates a client mid-questionnaire from the old single-token store', async () => {
    localStorage.setItem('ew_draft_id', 'draft-legacy')
    localStorage.setItem('ew_token', 'legacy-token')

    const probe = await renderProbe()

    expect(probe().token).toBe('legacy-token')
    expect(localStorage.getItem('ew_token')).toBeNull()
  })
})
