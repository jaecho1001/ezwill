'use client'

import { useEffect, useState, use } from 'react'
import { useSearchParams } from 'next/navigation'
import { Check } from 'lucide-react'
import { BrandLockup } from '@/components/ui/brand'
import { Button } from '@/components/ui/button'
import { useDraft } from '@/providers/draft-provider'
import {
  getTiers, getPaymentStatus, createCheckout, confirmSimulatedPayment,
  type PricingTier, type PaymentStatus,
} from '@/lib/api/payments'

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(cents / 100)

export default function CheckoutPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = use(params)
  const { token } = useDraft()
  const searchParams = useSearchParams()
  const [tiers, setTiers] = useState<PricingTier[]>([])
  const [processor, setProcessor] = useState<'stripe' | 'simulated'>('simulated')
  const [status, setStatus] = useState<PaymentStatus | null>(null)
  const [selected, setSelected] = useState<string>('complete')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const simulateReturn = searchParams.get('simulate') === '1'

  useEffect(() => {
    Promise.all([getTiers(), getPaymentStatus(draftId, token ?? undefined)]).then(([t, s]) => {
      setTiers(t.tiers); setProcessor(t.processor)
      if (t.tiers.length) setSelected(t.tiers[1]?.id ?? t.tiers[0].id)
      setStatus(s)
      setLoading(false)
    })
  }, [draftId, token])

  async function handlePay() {
    setBusy(true); setError(null)
    const res = await createCheckout(draftId, selected, token ?? undefined)
    if (!res) { setError('Could not start checkout. Please try again.'); setBusy(false); return }
    if (res.simulated) {
      // No live processor — complete the test payment inline.
      const ok = await confirmSimulatedPayment(draftId, token ?? undefined)
      if (ok) setStatus({ payment_status: 'paid', payment_tier: selected, paid_at: new Date().toISOString() })
      else setError('Test payment could not be completed.')
      setBusy(false)
    } else {
      window.location.href = res.url // Stripe Checkout
    }
  }

  const paid = status?.payment_status === 'paid'

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#2D2D2D]">
      <header className="border-b border-[#E8E4DF] bg-[#FAF8F5]/90 backdrop-blur-xl">
        <div className="ezw-container flex h-16 items-center"><BrandLockup /></div>
      </header>

      <main className="ezw-container max-w-4xl py-12">
        {loading ? (
          <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1B2A4A] border-t-transparent" /></div>
        ) : paid ? (
          <div className="mx-auto max-w-md rounded-2xl border border-[#7BA68C]/30 bg-white p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#7BA68C]/10">
              <Check className="h-7 w-7 text-[#7BA68C]" />
            </div>
            <h1 className="text-display text-2xl font-bold text-[#1B2A4A]">Payment complete</h1>
            <p className="mt-2 text-[#2D2D2D]/70">
              Thank you. Your {status?.payment_tier ? <span className="font-medium capitalize">{status.payment_tier}</span> : 'estate-plan'} package is paid.
              Your lawyer will finalize your documents and arrange signing.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-8 text-center">
              <h1 className="text-display text-3xl font-bold text-[#1B2A4A]">Complete your estate plan</h1>
              <p className="mt-2 text-[#2D2D2D]/60">Choose the package that fits your family. Pay once — no subscription.</p>
              {processor === 'simulated' && (
                <p className="mt-3 inline-block rounded-full bg-[#C9A84C]/15 px-3 py-1 text-xs font-medium text-[#8a6a1e]">
                  Test mode — no card required
                </p>
              )}
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {tiers.map((t) => {
                const isSel = selected === t.id
                return (
                  <button key={t.id} onClick={() => setSelected(t.id)}
                    className={`rounded-xl border p-6 text-left transition-all ${isSel ? 'border-[#C9A84C] shadow-lg shadow-[#C9A84C]/10 ring-1 ring-[#C9A84C]' : 'border-[#E8E4DF] bg-white hover:border-[#1B2A4A]/30'}`}>
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-[#1B2A4A]">{t.name}</h3>
                      <span className={`h-4 w-4 rounded-full border-2 ${isSel ? 'border-[#C9A84C] bg-[#C9A84C]' : 'border-gray-300'}`} />
                    </div>
                    <p className="text-display mt-2 text-3xl font-bold text-[#1B2A4A]">{money(t.amount_cents, t.currency)}</p>
                    <p className="mt-1 text-sm text-[#2D2D2D]/50">{t.description}</p>
                    <ul className="mt-4 space-y-2">
                      {t.features.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-[#2D2D2D]/70">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#7BA68C]" />{f}
                        </li>
                      ))}
                    </ul>
                  </button>
                )
              })}
            </div>

            {error && <p className="mt-6 text-center text-sm text-red-600">{error}</p>}

            <div className="mt-8 flex justify-center">
              <Button size="xl" onClick={handlePay} disabled={busy} className="px-10">
                {busy ? 'Processing…' : processor === 'simulated' ? 'Complete test payment' : 'Proceed to payment'}
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
