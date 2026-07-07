'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  Baby,
  Bell,
  Briefcase,
  Calendar,
  Check,
  Clock,
  Heart,
  Home,
  Mail,
  Plus,
  RefreshCw,
  Shield,
  Smartphone,
  Trash2,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getReminderPreferences,
  saveReminderPreferences,
  type AnnualFrequency,
  type CustomReminder,
  type ReminderPreferences,
} from '@/lib/api/reminders'
import { useDraft } from '@/providers/draft-provider'
import { cn } from '@/lib/utils'

const LIFE_EVENTS = [
  {
    id: 'marriage',
    name: 'Marriage, separation, or divorce',
    description: 'A change in relationship status can affect estate planning choices.',
    category: 'Family Changes',
    icon: Heart,
  },
  {
    id: 'child-birth',
    name: 'Birth or adoption of a child',
    description: 'Guardianship, trusts, and beneficiary allocations may need review.',
    category: 'Family Changes',
    icon: Baby,
  },
  {
    id: 'beneficiary-death',
    name: 'Death of a beneficiary or executor',
    description: 'Named people and backup appointments should be revisited.',
    category: 'Family Changes',
    icon: Users,
  },
  {
    id: 'home-purchase',
    name: 'Buying or selling property',
    description: 'Real estate changes can shift estate value and administration details.',
    category: 'Financial Changes',
    icon: Home,
  },
  {
    id: 'business',
    name: 'Starting or selling a business',
    description: 'Business succession and share ownership may require specific clauses.',
    category: 'Financial Changes',
    icon: Briefcase,
  },
  {
    id: 'retirement',
    name: 'Retirement or job change',
    description: 'Pensions, benefits, and registered accounts may need review.',
    category: 'Financial Changes',
    icon: Clock,
  },
  {
    id: 'relocation',
    name: 'Moving to another province',
    description: 'Provincial law and signing requirements can differ.',
    category: 'Personal Changes',
    icon: Home,
  },
  {
    id: 'health-change',
    name: 'Significant health change',
    description: 'Powers of Attorney and care wishes may need updating.',
    category: 'Personal Changes',
    icon: Shield,
  },
]

const FREQUENCIES: Array<{ value: AnnualFrequency; label: string; months: number }> = [
  { value: 'quarterly', label: 'Every 3 months', months: 3 },
  { value: 'biannual', label: 'Every 6 months', months: 6 },
  { value: 'yearly', label: 'Once a year', months: 12 },
  { value: 'biennial', label: 'Every 2 years', months: 24 },
]

function SwitchControl({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={event => {
        event.stopPropagation()
        onChange(!checked)
      }}
      className={cn(
        'relative h-6 w-11 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B2A4A]/25',
        checked ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300 bg-gray-200',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
          checked ? 'left-5' : 'left-0.5',
        )}
      />
    </button>
  )
}

function formatNextDate(createdAt: string, frequency: AnnualFrequency) {
  const base = createdAt ? new Date(createdAt) : new Date()
  if (Number.isNaN(base.getTime())) return 'After your signing date is confirmed'
  const months = FREQUENCIES.find(item => item.value === frequency)?.months ?? 12
  const next = new Date(base)
  next.setMonth(next.getMonth() + months)
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(next)
}

function newReminderId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return String(Date.now())
}

export default function RemindersPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#FAF8F5]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
      </div>
    }>
      <RemindersContent />
    </Suspense>
  )
}

function RemindersContent() {
  const params = useParams<{ draftId: string }>()
  const searchParams = useSearchParams()
  const { token, setToken } = useDraft()
  const queryToken = searchParams.get('t') || ''
  const draftId = params.draftId
  const magicToken = queryToken || token || undefined

  const [clientName, setClientName] = useState('')
  const [createdAt, setCreatedAt] = useState('')
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [smsEnabled, setSmsEnabled] = useState(false)
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [annualReminder, setAnnualReminder] = useState(true)
  const [annualFrequency, setAnnualFrequency] = useState<AnnualFrequency>('yearly')
  const [enabledLifeEvents, setEnabledLifeEvents] = useState<string[]>([])
  const [customReminders, setCustomReminders] = useState<CustomReminder[]>([])
  const [newCustomLabel, setNewCustomLabel] = useState('')
  const [newCustomDate, setNewCustomDate] = useState('')
  const [newCustomRecurring, setNewCustomRecurring] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ kind: 'idle' | 'success' | 'error'; message: string }>({
    kind: 'idle',
    message: '',
  })

  useEffect(() => {
    if (queryToken) setToken(queryToken)
  }, [queryToken, setToken])

  useEffect(() => {
    let active = true
    setLoading(true)
    getReminderPreferences(draftId, magicToken).then(result => {
      if (!active) return
      if (!result) {
        setStatus({
          kind: 'error',
          message: 'We could not load reminder settings for this link.',
        })
        setLoading(false)
        return
      }

      const prefs = result.preferences
      setClientName(result.client_name)
      setCreatedAt(result.created_at)
      setEmailEnabled(prefs.email_enabled)
      setSmsEnabled(prefs.sms_enabled)
      setEmail(prefs.email || result.email || '')
      setPhone(prefs.phone || result.phone || '')
      setAnnualReminder(prefs.annual_reminder)
      setAnnualFrequency(prefs.annual_frequency)
      setEnabledLifeEvents(prefs.enabled_life_events || [])
      setCustomReminders(prefs.custom_reminders || [])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [draftId, magicToken])

  const enabledEventsCount = enabledLifeEvents.length
  const nextReminderDate = useMemo(
    () => formatNextDate(createdAt, annualFrequency),
    [annualFrequency, createdAt],
  )

  function toggleLifeEvent(eventId: string) {
    setEnabledLifeEvents(current =>
      current.includes(eventId)
        ? current.filter(id => id !== eventId)
        : [...current, eventId],
    )
    setStatus({ kind: 'idle', message: '' })
  }

  function addCustomReminder() {
    if (!newCustomLabel.trim() || !newCustomDate) {
      setStatus({ kind: 'error', message: 'Add a label and date for the custom reminder.' })
      return
    }
    setCustomReminders(current => [
      ...current,
      {
        id: newReminderId(),
        label: newCustomLabel.trim(),
        date: newCustomDate,
        recurring: newCustomRecurring,
      },
    ])
    setNewCustomLabel('')
    setNewCustomDate('')
    setNewCustomRecurring(false)
    setStatus({ kind: 'idle', message: '' })
  }

  async function handleSave() {
    if (emailEnabled && !email.includes('@')) {
      setStatus({ kind: 'error', message: 'Enter a valid email address for email reminders.' })
      return
    }
    if (smsEnabled && !phone.trim()) {
      setStatus({ kind: 'error', message: 'Enter a phone number for SMS reminders.' })
      return
    }

    const preferences: ReminderPreferences = {
      email_enabled: emailEnabled,
      sms_enabled: smsEnabled,
      email: email.trim(),
      phone: phone.trim(),
      annual_reminder: annualReminder,
      annual_frequency: annualFrequency,
      enabled_life_events: enabledLifeEvents,
      custom_reminders: customReminders,
    }

    setSaving(true)
    const result = await saveReminderPreferences(draftId, preferences, magicToken)
    setSaving(false)
    if (!result) {
      setStatus({
        kind: 'error',
        message: 'Reminder settings could not be saved. Please try again or contact the firm.',
      })
      return
    }

    setStatus({
      kind: 'success',
      message: result.ghl.ghl_synced
        ? 'Reminder preferences saved and synced to GoHighLevel.'
        : 'Reminder preferences saved. GoHighLevel sync will run when credentials are configured.',
    })
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF8F5]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-[#FAF8F5]">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-6 flex flex-col gap-4 border-b border-stone-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1B2A4A]">
              EZWill Reminders
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-stone-900">
              Keep Your Estate Plan Current
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              {clientName ? `${clientName}, ` : ''}choose how EZWill should prompt future reviews.
            </p>
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Saving
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Save
              </>
            )}
          </Button>
        </header>

        {status.message && (
          <div
            className={cn(
              'mb-6 rounded-lg border px-4 py-3 text-sm',
              status.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-800',
            )}
          >
            {status.message}
          </div>
        )}

        <div className="space-y-6">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="h-5 w-5 text-stone-600" />
                Notification Channels
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1B2A4A]/10">
                    <Mail className="h-4 w-4 text-[#1B2A4A]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-stone-900">Email reminders</p>
                    <p className="text-xs text-stone-500">Review prompts sent to your inbox.</p>
                  </div>
                </div>
                <SwitchControl checked={emailEnabled} onChange={setEmailEnabled} label="Email reminders" />
              </div>

              {emailEnabled && (
                <div className="pl-12">
                  <Label htmlFor="reminder-email" className="mb-1.5 block text-xs text-stone-500">
                    Email address
                  </Label>
                  <Input
                    id="reminder-email"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    className="max-w-sm"
                  />
                </div>
              )}

              <div className="border-t border-stone-100 pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50">
                      <Smartphone className="h-4 w-4 text-sky-700" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-stone-900">SMS reminders</p>
                      <p className="text-xs text-stone-500">Short text reminders for key dates.</p>
                    </div>
                  </div>
                  <SwitchControl checked={smsEnabled} onChange={setSmsEnabled} label="SMS reminders" />
                </div>
              </div>

              {smsEnabled && (
                <div className="pl-12">
                  <Label htmlFor="reminder-phone" className="mb-1.5 block text-xs text-stone-500">
                    Phone number
                  </Label>
                  <Input
                    id="reminder-phone"
                    value={phone}
                    onChange={event => setPhone(event.target.value)}
                    placeholder="+1 416 555 0123"
                    className="max-w-sm"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-5 w-5 text-emerald-700" />
                Periodic Review
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-stone-900">Scheduled review reminder</p>
                  <p className="text-xs text-stone-500">A regular check-in after the will is created.</p>
                </div>
                <SwitchControl checked={annualReminder} onChange={setAnnualReminder} label="Periodic review reminder" />
              </div>

              {annualReminder && (
                <div className="space-y-3">
                  <div>
                    <Label className="mb-1.5 block text-xs text-stone-500">Reminder frequency</Label>
                    <Select value={annualFrequency} onValueChange={value => setAnnualFrequency(value as AnnualFrequency)}>
                      <SelectTrigger className="max-w-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FREQUENCIES.map(item => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    <Calendar className="h-4 w-4 shrink-0" />
                    Next estimated reminder: <span className="font-medium">{nextReminderDate}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900">
                <AlertTriangle className="h-5 w-5 text-[#C9A84C]" />
                Life Event Triggers
              </h2>
              <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-600">
                {enabledEventsCount} active
              </span>
            </div>

            <div className="space-y-4">
              {['Family Changes', 'Financial Changes', 'Personal Changes'].map(category => (
                <div key={category}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                    {category}
                  </p>
                  <div className="space-y-2">
                    {LIFE_EVENTS.filter(event => event.category === category).map(event => {
                      const Icon = event.icon
                      const enabled = enabledLifeEvents.includes(event.id)
                      return (
                        <button
                          type="button"
                          key={event.id}
                          onClick={() => toggleLifeEvent(event.id)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg border bg-white p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B2A4A]/25',
                            enabled ? 'border-[#7BA68C]/50' : 'border-stone-200 hover:border-stone-300',
                          )}
                        >
                          <div
                            className={cn(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                              enabled ? 'bg-[#7BA68C]/15 text-[#5c8069]' : 'bg-stone-100 text-stone-500',
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-stone-900">{event.name}</p>
                            <p className="mt-0.5 text-xs text-stone-500">{event.description}</p>
                          </div>
                          <SwitchControl checked={enabled} onChange={() => toggleLifeEvent(event.id)} label={event.name} />
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-5 w-5 text-sky-700" />
                Custom Review Dates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {customReminders.length > 0 && (
                <div className="space-y-2">
                  {customReminders.map(reminder => (
                    <div
                      key={reminder.id || `${reminder.label}-${reminder.date}`}
                      className="flex items-center gap-3 rounded-lg border border-stone-200 bg-[#FAF8F5] px-3 py-3"
                    >
                      <Calendar className="h-4 w-4 text-sky-700" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-stone-900">{reminder.label}</p>
                        <p className="text-xs text-stone-500">
                          {reminder.date}{reminder.recurring ? ' · recurring' : ''}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${reminder.label}`}
                        onClick={() => setCustomReminders(current => current.filter(item => item.id !== reminder.id))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto]">
                <div>
                  <Label htmlFor="custom-label" className="mb-1.5 block text-xs text-stone-500">
                    Label
                  </Label>
                  <Input
                    id="custom-label"
                    value={newCustomLabel}
                    onChange={event => setNewCustomLabel(event.target.value)}
                    placeholder="Review after tax season"
                  />
                </div>
                <div>
                  <Label htmlFor="custom-date" className="mb-1.5 block text-xs text-stone-500">
                    Date
                  </Label>
                  <Input
                    id="custom-date"
                    type="date"
                    value={newCustomDate}
                    onChange={event => setNewCustomDate(event.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button type="button" variant="outline" onClick={addCustomReminder} className="w-full">
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </div>
              </div>

              <Checkbox
                id="custom-recurring"
                checked={newCustomRecurring}
                onChange={event => setNewCustomRecurring(event.target.checked)}
                label="Repeat this custom reminder each year"
              />
            </CardContent>
          </Card>

          <div className="flex flex-col-reverse gap-3 border-t border-stone-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Button asChild variant="ghost" className="w-full sm:w-auto">
              <Link href="/">Return Home</Link>
            </Button>
            <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save Reminder Preferences
            </Button>
          </div>
        </div>
      </div>
    </main>
  )
}
