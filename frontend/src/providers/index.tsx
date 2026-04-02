'use client'
import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { WillFormProvider } from './will-form-provider'
import { I18nProvider } from './i18n-provider'
import { DraftProvider } from './draft-provider'

const queryClient = new QueryClient()

function InnerProviders({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <TooltipProvider>
        {children}
      </TooltipProvider>
    </I18nProvider>
  )
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <DraftProvider>
        <WillFormProvider>
          <InnerProviders>
            {children}
          </InnerProviders>
        </WillFormProvider>
      </DraftProvider>
    </QueryClientProvider>
  )
}
