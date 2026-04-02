'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createMagicLink, type CreateLinkResponse } from '@/lib/api/drafts'

export default function NewClientPage() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [language, setLanguage] = useState('en')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CreateLinkResponse | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName.trim() || !lastName.trim()) {
      setError('First name and last name are required.')
      return
    }

    setSubmitting(true)
    setError(null)

    const res = await createMagicLink({
      client_first_name: firstName.trim(),
      client_last_name: lastName.trim(),
      client_email: email.trim() || undefined,
      client_phone: phone.trim() || undefined,
      language,
      note_for_client: note.trim() || undefined,
    })

    setSubmitting(false)

    if (!res) {
      setError('Failed to create magic link. Please try again.')
      return
    }

    setResult(res)
  }

  function handleCopy() {
    if (!result) return
    navigator.clipboard.writeText(result.link_url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Success state
  if (result) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <Link href="/dashboard/clients" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Clients
        </Link>

        <Card>
          <CardHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <CardTitle className="text-center">Magic Link Created</CardTitle>
            <CardDescription className="text-center">
              Send this link to {result.client_name} to start their will intake.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="mb-1 text-xs font-medium text-gray-500">Client Link</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all text-sm text-gray-800">{result.link_url}</code>
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-700">
                This link expires on{' '}
                {new Date(result.expires_at).toLocaleDateString('en-CA', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
                . The client can use it to fill out their will questionnaire.
              </p>
            </div>

            <div className="flex gap-3">
              <Link href={`/dashboard/clients/${result.draft_id}`} className="flex-1">
                <Button variant="outline" className="w-full">View Draft</Button>
              </Link>
              <Link href="/dashboard/clients/new" className="flex-1">
                <Button
                  className="w-full"
                  onClick={() => {
                    setResult(null)
                    setFirstName('')
                    setLastName('')
                    setEmail('')
                    setPhone('')
                    setNote('')
                  }}
                >
                  Create Another
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Form state
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link href="/dashboard/clients" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Clients
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>New Client</CardTitle>
          <CardDescription>
            Create a new client and generate a magic link for their will intake questionnaire.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Smith"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email (optional)</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 416 555 1234"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="language">Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ko">Korean</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">Note for Client (optional)</Label>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Any special instructions or notes for the client..."
                rows={3}
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Creating...
                </>
              ) : (
                'Create Client & Generate Link'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
