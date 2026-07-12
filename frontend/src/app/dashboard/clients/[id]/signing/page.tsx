'use client'

import { useEffect, useState, use, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getDraft } from '@/lib/api/drafts'
import { getAuthHeaders } from '@/lib/auth'
import { getSigning, recordSigning, type SigningEvent } from '@/lib/api/signing'

const DOC_LABELS: Record<string, string> = {
  simple_will_short: 'Short Will',
  single_will: 'Last Will and Testament',
  probate_will: 'Probate Will',
  non_probate_will: 'Non-Probate Will',
  poa_property: 'POA — Property',
  poa_personal_care: 'POA — Personal Care',
}

interface WitnessForm {
  name: string
  address: string
  occupation: string
  is_lso: boolean
}
const emptyWitness = (): WitnessForm => ({ name: '', address: '', occupation: '', is_lso: false })

export default function SigningPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [clientName, setClientName] = useState('')
  const [events, setEvents] = useState<SigningEvent[]>([])
  const [docTypes, setDocTypes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // form
  const [documentType, setDocumentType] = useState('single_will')
  const [signingMethod, setSigningMethod] = useState<'in_person' | 'remote_video'>('in_person')
  const [signedAt, setSignedAt] = useState('')
  const [location, setLocation] = useState('')
  const [platform, setPlatform] = useState('')
  const [w1, setW1] = useState<WitnessForm>(emptyWitness())
  const [w2, setW2] = useState<WitnessForm>(emptyWitness())

  const load = useCallback(async () => {
    const [draft, evts, cfgRes, setRes] = await Promise.all([
      getDraft(id),
      getSigning(id),
      fetch(`/api/documents/${id}/list`, { headers: { ...getAuthHeaders() } }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/settings', { headers: { ...getAuthHeaders() } }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
    if (draft) setClientName(`${draft.client_first_name} ${draft.client_last_name}`.trim())
    setEvents(evts)
    const enabled = (cfgRes?.documents ?? []).filter((d: { enabled: boolean }) => d.enabled).map((d: { document_type: string }) => d.document_type)
      .filter((t: string) => t in DOC_LABELS)
    setDocTypes(enabled.length ? enabled : ['single_will', 'poa_property', 'poa_personal_care'])
    if (enabled.length) setDocumentType(enabled[0])
    // Prefill witnesses from firm default witnesses (Settings → Default Witnesses)
    const ws = setRes?.settings?.witnesses
    if (Array.isArray(ws)) {
      if (ws[0]) setW1({ name: ws[0].name || '', address: ws[0].address || '', occupation: ws[0].occupation || '', is_lso: false })
      if (ws[1]) setW2({ name: ws[1].name || '', address: ws[1].address || '', occupation: ws[1].occupation || '', is_lso: false })
    }
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  async function handleRecord() {
    setSaving(true); setError(null); setSuccess(false)
    const res = await recordSigning(id, {
      document_type: documentType,
      signing_method: signingMethod,
      signed_at: signedAt || null,
      location: location || null,
      platform: signingMethod === 'remote_video' ? platform || null : null,
      witness1: w1.name ? w1 : undefined,
      witness2: w2.name ? w2 : undefined,
    })
    setSaving(false)
    if (res.ok) { setSuccess(true); setTimeout(() => setSuccess(false), 3000); await getSigning(id).then(setEvents) }
    else setError(res.error || 'Failed to record')
  }

  const executed = (dt: string) => events.find((e) => e.document_type === dt && e.signed_at)

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1B2A4A] border-t-transparent" /></div>
  }

  const inputCls = 'w-full rounded-lg border border-[#E8E4DF] bg-white px-3 py-2 text-sm focus:border-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/25'

  return (
    <div className="space-y-6">
      <Link href={`/dashboard/clients/${id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to Client
      </Link>

      <div>
        <h2 className="text-display text-2xl font-bold text-[#1B2A4A]">Signing Ceremony</h2>
        <p className="mt-1 text-sm text-gray-500">Record how {clientName || 'the client'} executed each document.</p>
      </div>

      {/* Ontario requirements */}
      <div className="rounded-xl border border-[#C9A84C]/40 bg-[#C9A84C]/10 p-4 text-sm text-[#8a6a1e]">
        <p className="font-semibold">Ontario execution requirements</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>The testator signs in the presence of <strong>two witnesses</strong>, both present at the same time (SLRA s.4).</li>
          <li>Remote audio-visual execution is permitted (SLRA s.21.1) — <strong>one witness must be a licensee of the Law Society of Ontario</strong>.</li>
          <li>A witness (or their spouse) must <strong>not</strong> be a beneficiary under the will.</li>
          <li>Bring valid government-issued photo ID to the appointment.</li>
        </ul>
      </div>

      {/* Recorded status */}
      <div className="flex flex-wrap gap-2">
        {docTypes.map((dt) => (
          <span key={dt} className={`rounded-full px-3 py-1 text-xs font-medium ${executed(dt) ? 'bg-[#7BA68C]/15 text-[#5f8a70]' : 'bg-gray-100 text-gray-500'}`}>
            {executed(dt) ? '✓ ' : '○ '}{DOC_LABELS[dt] ?? dt}{executed(dt)?.signed_at ? ` · ${executed(dt)!.signed_at!.slice(0, 10)}` : ''}
          </span>
        ))}
      </div>

      {/* Record form */}
      <div className="rounded-xl border border-[#E8E4DF] bg-white p-6 space-y-4">
        <h3 className="font-semibold text-[#1B2A4A]">Record execution</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Document</Label>
            <select className={inputCls} value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
              {docTypes.map((dt) => <option key={dt} value={dt}>{DOC_LABELS[dt] ?? dt}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Execution method</Label>
            <select className={inputCls} value={signingMethod} onChange={(e) => setSigningMethod(e.target.value as 'in_person' | 'remote_video')}>
              <option value="in_person">In person (SLRA s.4)</option>
              <option value="remote_video">Remote video (SLRA s.21.1)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Date signed</Label>
            <input type="date" className={inputCls} value={signedAt} onChange={(e) => setSignedAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City / office" />
          </div>
          {signingMethod === 'remote_video' && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Video platform</Label>
              <Input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="Zoom, Teams…" />
            </div>
          )}
        </div>

        {[{ w: w1, set: setW1, n: 1 }, { w: w2, set: setW2, n: 2 }].map(({ w, set, n }) => (
          <div key={n} className="rounded-lg border border-[#E8E4DF] p-4 space-y-3">
            <p className="text-sm font-medium text-[#1B2A4A]">Witness {n}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input value={w.name} onChange={(e) => set({ ...w, name: e.target.value })} placeholder="Full name" />
              <Input value={w.occupation} onChange={(e) => set({ ...w, occupation: e.target.value })} placeholder="Occupation" />
              <Input value={w.address} onChange={(e) => set({ ...w, address: e.target.value })} placeholder="Address" />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={w.is_lso} onChange={(e) => set({ ...w, is_lso: e.target.checked })} />
              Licensee of the Law Society of Ontario (required for remote execution)
            </label>
          </div>
        ))}

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {success && <div className="rounded-lg border border-[#7BA68C]/40 bg-[#7BA68C]/10 p-3 text-sm text-[#5f8a70]">Execution recorded.</div>}

        <div className="flex justify-end">
          <Button onClick={handleRecord} disabled={saving}>{saving ? 'Recording…' : 'Record Execution'}</Button>
        </div>
      </div>
    </div>
  )
}
