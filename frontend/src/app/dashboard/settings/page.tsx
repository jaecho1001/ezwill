'use client'

import { useState, useEffect } from 'react'
import { getAuthHeaders } from '@/lib/auth'

// ----- Types -----

interface FirmSettings {
  firmName: string
  address1: string
  address2: string
  city: string
  province: string
  postalCode: string
  phone: string
  fax: string
  email: string
  lsoNumber: string
}

interface WillDefaults {
  trustDistributionAge: number
  survivalPeriodDays: number
  defaultTier: '1' | '2'
  enableDualWill: boolean
}

interface NotificationSettings {
  emailOnSubmission: boolean
  submissionEmail: string
  emailOnReview: boolean
  reviewEmail: string
}

interface BrandingSettings {
  coverPageStyle: 'standard' | 'minimal' | 'custom'
  defaultLanguage: 'en' | 'ko'
}

// ----- Defaults -----

const DEFAULT_FIRM: FirmSettings = {
  firmName: 'Vaturi & Cho LLP',
  address1: '',
  address2: '',
  city: 'Toronto',
  province: 'ON',
  postalCode: '',
  phone: '',
  fax: '',
  email: '',
  lsoNumber: '',
}

const DEFAULT_WILL: WillDefaults = {
  trustDistributionAge: 25,
  survivalPeriodDays: 30,
  defaultTier: '1',
  enableDualWill: false,
}

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  emailOnSubmission: false,
  submissionEmail: '',
  emailOnReview: false,
  reviewEmail: '',
}

const DEFAULT_BRANDING: BrandingSettings = {
  coverPageStyle: 'standard',
  defaultLanguage: 'en',
}

interface WitnessInfo {
  name: string
  occupation: string
  address: string
}

const DEFAULT_WITNESSES: WitnessInfo[] = [
  { name: '', occupation: '', address: '' },
  { name: '', occupation: '', address: '' },
]

// ----- Storage helpers -----

const STORAGE_KEY = 'ezwill_settings'

function loadSettings() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveSettings(data: {
  firm: FirmSettings
  will: WillDefaults
  notifications: NotificationSettings
  branding: BrandingSettings
  witnesses: WitnessInfo[]
}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

// ----- Components -----

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
    </div>
  )
}

function InputField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string | number
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/25"
      />
    </div>
  )
}

// ----- Main Page -----

export default function SettingsPage() {
  const [firm, setFirm] = useState<FirmSettings>(DEFAULT_FIRM)
  const [will, setWill] = useState<WillDefaults>(DEFAULT_WILL)
  const [notifications, setNotifications] = useState<NotificationSettings>(DEFAULT_NOTIFICATIONS)
  const [branding, setBranding] = useState<BrandingSettings>(DEFAULT_BRANDING)
  const [witnesses, setWitnesses] = useState<WitnessInfo[]>(DEFAULT_WITNESSES)
  const [toast, setToast] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ current: '', newPass: '', confirm: '' })
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  // Load from the server (source of truth), falling back to the local cache.
  useEffect(() => {
    let cancelled = false
    const apply = (s: { firm?: unknown; will?: unknown; notifications?: unknown; branding?: unknown; witnesses?: unknown }) => {
      setFirm({ ...DEFAULT_FIRM, ...(s.firm as object) })
      setWill({ ...DEFAULT_WILL, ...(s.will as object) })
      setNotifications({ ...DEFAULT_NOTIFICATIONS, ...(s.notifications as object) })
      setBranding({ ...DEFAULT_BRANDING, ...(s.branding as object) })
      const w = Array.isArray(s.witnesses) ? (s.witnesses as Partial<WitnessInfo>[]) : []
      setWitnesses([0, 1].map((i) => ({ ...DEFAULT_WITNESSES[i], ...(w[i] || {}) })))
    }
    async function load() {
      try {
        const res = await fetch('/api/settings', { headers: { ...getAuthHeaders() } })
        if (res.ok) {
          const { settings } = await res.json()
          if (!cancelled && settings && Object.keys(settings).length > 0) {
            apply(settings)
            return
          }
        }
      } catch {
        // fall through to the local cache
      }
      const saved = loadSettings()
      if (!cancelled && saved) apply(saved)
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function handleSave() {
    const payload = { firm, will, notifications, branding, witnesses }
    saveSettings(payload) // keep a local cache for offline / instant reload
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ settings: payload }),
      })
    } catch {
      // Local cache still holds the values; server sync will retry on next save.
    }
    setToast(true)
    setTimeout(() => setToast(false), 2500)
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess(false)

    if (passwordForm.newPass !== passwordForm.confirm) {
      setPasswordError('New passwords do not match.')
      return
    }
    if (passwordForm.newPass.length < 6) {
      setPasswordError('Password must be at least 6 characters.')
      return
    }

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: passwordForm.current,
          new_password: passwordForm.newPass,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setPasswordError(data.detail || 'Failed to change password.')
        return
      }
      setPasswordSuccess(true)
      setPasswordForm({ current: '', newPass: '', confirm: '' })
      setTimeout(() => setPasswordSuccess(false), 3000)
    } catch {
      setPasswordError('Unable to connect. Please try again.')
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your firm configuration and preferences.</p>
      </div>

      {/* Section A: Firm Information */}
      <section className="rounded-xl border border-[#E8E4DF] bg-white p-6">
        <SectionHeading title="Firm Information" description="Your firm details used on generated documents." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <InputField label="Firm Name" value={firm.firmName} onChange={(v) => setFirm({ ...firm, firmName: v })} />
          </div>
          <div className="sm:col-span-2">
            <InputField label="Address Line 1" value={firm.address1} onChange={(v) => setFirm({ ...firm, address1: v })} placeholder="123 Bay St, Suite 400" />
          </div>
          <div className="sm:col-span-2">
            <InputField label="Address Line 2" value={firm.address2} onChange={(v) => setFirm({ ...firm, address2: v })} placeholder="Optional" />
          </div>
          <InputField label="City" value={firm.city} onChange={(v) => setFirm({ ...firm, city: v })} />
          <div className="grid grid-cols-2 gap-4">
            <InputField label="Province" value={firm.province} onChange={(v) => setFirm({ ...firm, province: v })} />
            <InputField label="Postal Code" value={firm.postalCode} onChange={(v) => setFirm({ ...firm, postalCode: v })} placeholder="M5H 2N2" />
          </div>
          <InputField label="Phone" value={firm.phone} onChange={(v) => setFirm({ ...firm, phone: v })} placeholder="(416) 555-0100" />
          <InputField label="Fax" value={firm.fax} onChange={(v) => setFirm({ ...firm, fax: v })} placeholder="(416) 555-0101" />
          <InputField label="Email" value={firm.email} onChange={(v) => setFirm({ ...firm, email: v })} type="email" placeholder="info@vatcho.com" />
          <InputField label="LSO Firm Number" value={firm.lsoNumber} onChange={(v) => setFirm({ ...firm, lsoNumber: v })} placeholder="12345" />
        </div>
      </section>

      {/* Section A2: Default Witnesses */}
      <section className="rounded-xl border border-[#E8E4DF] bg-white p-6">
        <SectionHeading
          title="Default Witnesses"
          description="Pre-fills the witness block on generated Wills & POAs so you use the same witnesses every time."
        />
        <div className="mb-5 rounded-lg border border-[#C9A84C]/40 bg-[#C9A84C]/10 px-4 py-3 text-xs text-[#8a6a1e]">
          Witnesses must sign in the testator&apos;s presence and cannot be a beneficiary
          (or the spouse of a beneficiary). Ontario wills require two witnesses.
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {witnesses.map((w, i) => (
            <div key={i} className="space-y-3 rounded-lg border border-[#E8E4DF] p-4">
              <p className="text-sm font-semibold text-[#1B2A4A]">Witness {i + 1}</p>
              <InputField
                label="Full Name"
                value={w.name}
                onChange={(v) => setWitnesses(witnesses.map((x, j) => (j === i ? { ...x, name: v } : x)))}
                placeholder="Jane Doe"
              />
              <InputField
                label="Occupation"
                value={w.occupation}
                onChange={(v) => setWitnesses(witnesses.map((x, j) => (j === i ? { ...x, occupation: v } : x)))}
                placeholder="Law Clerk"
              />
              <InputField
                label="Address"
                value={w.address}
                onChange={(v) => setWitnesses(witnesses.map((x, j) => (j === i ? { ...x, address: v } : x)))}
                placeholder="200 Bay St, Toronto"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Section B: Default Will Settings */}
      <section className="rounded-xl border border-[#E8E4DF] bg-white p-6">
        <SectionHeading title="Default Will Settings" description="Defaults applied to new client wills." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField
            label="Trust Distribution Age"
            value={will.trustDistributionAge}
            onChange={(v) => setWill({ ...will, trustDistributionAge: Number(v) || 0 })}
            type="number"
          />
          <InputField
            label="Survival Period (days)"
            value={will.survivalPeriodDays}
            onChange={(v) => setWill({ ...will, survivalPeriodDays: Number(v) || 0 })}
            type="number"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Default Document Tier</label>
            <div className="flex gap-6">
              {(['1', '2'] as const).map((tier) => (
                <label key={tier} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="tier"
                    checked={will.defaultTier === tier}
                    onChange={() => setWill({ ...will, defaultTier: tier })}
                    className="h-4 w-4 text-[#1B2A4A] border-gray-300 focus:ring-[#1B2A4A]"
                  />
                  Tier {tier}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={will.enableDualWill}
                onChange={(e) => setWill({ ...will, enableDualWill: e.target.checked })}
                className="h-4 w-4 rounded text-[#1B2A4A] border-gray-300 focus:ring-[#1B2A4A]"
              />
              Enable dual will by default
            </label>
          </div>
        </div>
      </section>

      {/* Section C: Notification Settings */}
      <section className="rounded-xl border border-[#E8E4DF] bg-white p-6">
        <SectionHeading title="Notification Settings" description="Configure email alerts for client activity." />
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer min-w-[220px] pt-2">
              <input
                type="checkbox"
                checked={notifications.emailOnSubmission}
                onChange={(e) => setNotifications({ ...notifications, emailOnSubmission: e.target.checked })}
                className="h-4 w-4 rounded text-[#1B2A4A] border-gray-300 focus:ring-[#1B2A4A]"
              />
              Email on client submission
            </label>
            {notifications.emailOnSubmission && (
              <div className="flex-1">
                <input
                  type="email"
                  value={notifications.submissionEmail}
                  onChange={(e) => setNotifications({ ...notifications, submissionEmail: e.target.value })}
                  placeholder="lawyer@vatcho.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/25"
                />
              </div>
            )}
          </div>
          <div className="flex items-start gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer min-w-[220px] pt-2">
              <input
                type="checkbox"
                checked={notifications.emailOnReview}
                onChange={(e) => setNotifications({ ...notifications, emailOnReview: e.target.checked })}
                className="h-4 w-4 rounded text-[#1B2A4A] border-gray-300 focus:ring-[#1B2A4A]"
              />
              Email on review completion
            </label>
            {notifications.emailOnReview && (
              <div className="flex-1">
                <input
                  type="email"
                  value={notifications.reviewEmail}
                  onChange={(e) => setNotifications({ ...notifications, reviewEmail: e.target.value })}
                  placeholder="lawyer@vatcho.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/25"
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Section D: Branding */}
      <section className="rounded-xl border border-[#E8E4DF] bg-white p-6">
        <SectionHeading title="Branding" description="Customize document appearance and defaults." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cover Page Style</label>
            <select
              value={branding.coverPageStyle}
              onChange={(e) => setBranding({ ...branding, coverPageStyle: e.target.value as BrandingSettings['coverPageStyle'] })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/25"
            >
              <option value="standard">Standard</option>
              <option value="minimal">Minimal</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Default Language for New Clients</label>
            <select
              value={branding.defaultLanguage}
              onChange={(e) => setBranding({ ...branding, defaultLanguage: e.target.value as 'en' | 'ko' })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/25"
            >
              <option value="en">English</option>
              <option value="ko">Korean</option>
            </select>
          </div>
        </div>
      </section>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="rounded-lg bg-[#1B2A4A] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#16233d] focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/50"
        >
          Save Settings
        </button>
      </div>

      {/* Section E: Security */}
      <section className="rounded-xl border border-[#E8E4DF] bg-white p-6">
        <SectionHeading title="Security" description="Change the dashboard access password." />
        <form onSubmit={handlePasswordChange} className="max-w-md space-y-4">
          <InputField
            label="Current Password"
            value={passwordForm.current}
            onChange={(v) => setPasswordForm({ ...passwordForm, current: v })}
            type="password"
          />
          <InputField
            label="New Password"
            value={passwordForm.newPass}
            onChange={(v) => setPasswordForm({ ...passwordForm, newPass: v })}
            type="password"
          />
          <InputField
            label="Confirm New Password"
            value={passwordForm.confirm}
            onChange={(v) => setPasswordForm({ ...passwordForm, confirm: v })}
            type="password"
          />
          {passwordError && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-100">
              {passwordError}
            </div>
          )}
          {passwordSuccess && (
            <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 border border-green-100">
              Password changed successfully.
            </div>
          )}
          <button
            type="submit"
            disabled={!passwordForm.current || !passwordForm.newPass || !passwordForm.confirm}
            className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Change Password
          </button>
        </form>
      </section>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 rounded-lg bg-green-600 px-5 py-3 text-sm font-medium text-white shadow-lg animate-[fadeIn_0.2s_ease]">
          Settings saved successfully.
        </div>
      )}
    </div>
  )
}
