import { getAuthHeaders } from '@/lib/auth'

export type AnnualFrequency = 'quarterly' | 'biannual' | 'yearly' | 'biennial'

export interface CustomReminder {
  id?: string
  label: string
  date: string
  recurring: boolean
}

export interface ReminderPreferences {
  email_enabled: boolean
  sms_enabled: boolean
  email: string
  phone: string
  annual_reminder: boolean
  annual_frequency: AnnualFrequency
  enabled_life_events: string[]
  custom_reminders: CustomReminder[]
}

export interface ReminderSettingsResponse {
  draft_id: string
  client_name: string
  client_first_name: string
  client_last_name: string
  email: string
  phone: string
  created_at: string
  preferences: ReminderPreferences
  ghl_contact_id?: string | null
  reminders_synced_at?: string | null
}

export interface SaveReminderResponse {
  saved: boolean
  draft_id: string
  preferences: ReminderPreferences
  ghl: {
    success: boolean
    ghl_synced: boolean
    contact_id: string | null
    tags_added: string[]
    tags_removed: string[]
    custom_tasks: {
      success: boolean
      created: string[]
      deleted: string[]
      skipped: string[]
      desired: number
    }
  }
}

function reminderHeaders(magicToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
  }
  if (magicToken) {
    headers['X-Magic-Token'] = magicToken
  }
  return headers
}

export async function getReminderPreferences(
  draftId: string,
  magicToken?: string,
): Promise<ReminderSettingsResponse | null> {
  try {
    const res = await fetch(`/api/reminders/${draftId}`, {
      headers: reminderHeaders(magicToken),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function saveReminderPreferences(
  draftId: string,
  preferences: ReminderPreferences,
  magicToken?: string,
): Promise<SaveReminderResponse | null> {
  try {
    const res = await fetch(`/api/reminders/${draftId}`, {
      method: 'POST',
      headers: reminderHeaders(magicToken),
      body: JSON.stringify(preferences),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}
