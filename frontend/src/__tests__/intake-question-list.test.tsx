// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { IntakeQuestionList } from '@/components/intake/question-list'
import { willIntakeChapters } from '@/lib/intake/will-intake-script'
import { emptyVault, normalizeVault } from '@/types/will-vault'

describe('conditional intake rendering', () => {
  let container: HTMLDivElement | null = null

  afterEach(() => {
    container?.remove()
    container = null
  })

  it('can reveal conditional POA questions without changing parent hook count', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const poa = willIntakeChapters.find((chapter) => chapter.id === 'poa')!
    const render = (property: boolean, care: boolean) => (
      <IntakeQuestionList
        chapter={poa}
        vault={normalizeVault({
          ...emptyVault,
          poa: {
            property: { requested: property, attorneys: [] },
            personalCare: { requested: care, attorneys: [] },
          },
        })}
        language="en"
        showErrors={false}
        onChange={() => undefined}
      />
    )

    await act(async () => root.render(render(false, false)))
    expect(container.querySelectorAll('label')).toHaveLength(2)
    await act(async () => root.render(render(true, false)))
    expect(container.querySelectorAll('label').length).toBeGreaterThan(2)
    await act(async () => root.render(render(true, true)))
    expect(container.textContent).toContain('Attorney for Personal Care choices')
    await act(async () => root.unmount())
  })
})
