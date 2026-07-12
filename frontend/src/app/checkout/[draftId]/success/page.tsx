'use client'

import { use } from 'react'
import { Check } from 'lucide-react'
import { BrandLockup } from '@/components/ui/brand'

// Stripe's return URL. The checkout.session.completed webhook records the
// payment; this page just confirms receipt to the client.
export default function CheckoutSuccessPage({ params }: { params: Promise<{ draftId: string }> }) {
  use(params)
  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#2D2D2D]">
      <header className="border-b border-[#E8E4DF] bg-[#FAF8F5]/90 backdrop-blur-xl">
        <div className="ezw-container flex h-16 items-center"><BrandLockup /></div>
      </header>
      <main className="ezw-container flex max-w-md flex-col items-center py-24 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#7BA68C]/10">
          <Check className="h-7 w-7 text-[#7BA68C]" />
        </div>
        <h1 className="text-display text-2xl font-bold text-[#1B2A4A]">Payment received</h1>
        <p className="mt-2 text-[#2D2D2D]/70">
          Thank you. Your estate-plan package is paid. Your lawyer will finalize your documents and arrange signing.
        </p>
      </main>
    </div>
  )
}
