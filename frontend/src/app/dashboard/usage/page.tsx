'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  DatabaseZap,
  RefreshCw,
  ServerCog,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  getUsageReport,
  type TokenTotals,
  type UsageRangeDays,
  type UsageReport,
} from '@/lib/api/usage'

const RANGE_OPTIONS: { days: UsageRangeDays; label: string }[] = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 0, label: 'All time' },
]

const numberFormatter = new Intl.NumberFormat('en-CA')
const compactNumberFormatter = new Intl.NumberFormat('en-CA', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

function formatCompactNumber(value: number): string {
  return compactNumberFormatter.format(value)
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatChartDate(value: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

function formatFeature(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function formatLatency(value: number | null): string {
  if (value === null) return '—'
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`
  return `${value} ms`
}

function providerBadgeClass(provider: string): string {
  switch (provider.toLowerCase()) {
    case 'anthropic':
      return 'border-orange-200 bg-orange-50 text-orange-700'
    case 'openai':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    default:
      return 'border-gray-200 bg-gray-50 text-gray-700'
  }
}

function rangeLabel(days: number): string {
  return days === 0 ? 'All recorded time' : `Last ${days} days`
}

interface SummaryCardProps {
  label: string
  value: number
  detail: string
  icon: React.ReactNode
  accent: string
}

function SummaryCard({ label, value, detail, icon, accent }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-500">{label}</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{formatCompactNumber(value)}</p>
            <p className="mt-1 truncate text-xs text-gray-400" title={detail}>{detail}</p>
          </div>
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function LoadingState() {
  return (
    <div className="space-y-6" aria-label="Loading AI usage" role="status">
      <span className="sr-only">Loading AI usage</span>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Card key={item} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 w-24 rounded bg-gray-100" />
              <div className="mt-4 h-8 w-32 rounded bg-gray-100" />
              <div className="mt-3 h-3 w-40 rounded bg-gray-100" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="animate-pulse">
        <CardContent className="p-6">
          <div className="h-5 w-44 rounded bg-gray-100" />
          <div className="mt-6 h-72 rounded-lg bg-gray-50" />
        </CardContent>
      </Card>
    </div>
  )
}

function EmptyState({ hasOlderUsage }: { hasOlderUsage: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1B2A4A]/10 text-[#1B2A4A]">
          <DatabaseZap className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-gray-900">
          {hasOlderUsage ? 'No AI usage in this range' : 'No AI usage recorded yet'}
        </h3>
        <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">
          {hasOlderUsage
            ? 'Choose a longer date range to see earlier activity.'
            : 'Usage will appear here after EZWill makes a tracked Anthropic or OpenAI request.'}
        </p>
      </CardContent>
    </Card>
  )
}

function ModelBreakdown({ report }: { report: UsageReport }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Provider and model breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th scope="col" className="pb-3 pr-4 font-medium text-gray-500">Provider</th>
                <th scope="col" className="pb-3 pr-4 font-medium text-gray-500">Model</th>
                <th scope="col" className="pb-3 pr-4 text-right font-medium text-gray-500">Events</th>
                <th scope="col" className="pb-3 pr-4 text-right font-medium text-gray-500">Requests</th>
                <th scope="col" className="pb-3 pr-4 text-right font-medium text-gray-500">Input</th>
                <th scope="col" className="pb-3 pr-4 text-right font-medium text-gray-500">Output</th>
                <th scope="col" className="pb-3 pr-4 text-right font-medium text-gray-500">Cache</th>
                <th scope="col" className="pb-3 text-right font-medium text-gray-500">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {report.by_model.map((item) => {
                const cacheTokens = item.cache_read_input_tokens + item.cache_creation_input_tokens
                return (
                  <tr key={`${item.provider}:${item.model}`} className="hover:bg-gray-50">
                    <td className="py-3 pr-4">
                      <Badge variant="outline" className={providerBadgeClass(item.provider)}>
                        {formatFeature(item.provider)}
                      </Badge>
                    </td>
                    <td className="max-w-64 py-3 pr-4 font-medium text-gray-900">
                      <span className="block truncate" title={item.model}>{item.model}</span>
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-gray-600">{formatNumber(item.events)}</td>
                    <td className="py-3 pr-4 text-right tabular-nums text-gray-600">{formatNumber(item.requests)}</td>
                    <td className="py-3 pr-4 text-right tabular-nums text-gray-600">{formatNumber(item.input_tokens)}</td>
                    <td className="py-3 pr-4 text-right tabular-nums text-gray-600">{formatNumber(item.output_tokens)}</td>
                    <td className="py-3 pr-4 text-right tabular-nums text-gray-600" title={`${formatNumber(item.cache_read_input_tokens)} read, ${formatNumber(item.cache_creation_input_tokens)} created`}>
                      {formatNumber(cacheTokens)}
                    </td>
                    <td className="py-3 text-right font-semibold tabular-nums text-gray-900">{formatNumber(item.total_tokens)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function DailyTrend({ report }: { report: UsageReport }) {
  const chartData = useMemo(
    () => report.daily.map((item) => ({
      ...item,
      cache_tokens: item.cache_read_input_tokens + item.cache_creation_input_tokens,
    })),
    [report.daily],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily token usage</CardTitle>
        <p className="text-sm text-gray-500">Input, output, and cached input tokens by day.</p>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-400">
            No daily usage data is available.
          </div>
        ) : (
          <div className="h-80 w-full" aria-label="Daily token usage chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="usageInput" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1B2A4A" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#1B2A4A" stopOpacity={0.06} />
                  </linearGradient>
                  <linearGradient id="usageOutput" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4F8A6F" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#4F8A6F" stopOpacity={0.06} />
                  </linearGradient>
                  <linearGradient id="usageCache" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#C9A84C" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#C9A84C" stopOpacity={0.06} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#E8E4DF" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6B7280', fontSize: 12 }}
                  tickFormatter={formatChartDate}
                  minTickGap={24}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6B7280', fontSize: 12 }}
                  tickFormatter={formatCompactNumber}
                  width={52}
                />
                <Tooltip
                  labelFormatter={(label) => formatChartDate(String(label))}
                  formatter={(value, name) => [formatNumber(Number(value)), String(name)]}
                  contentStyle={{ borderColor: '#E8E4DF', borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
                <Area
                  type="monotone"
                  dataKey="input_tokens"
                  name="Input"
                  stackId="tokens"
                  stroke="#1B2A4A"
                  fill="url(#usageInput)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="output_tokens"
                  name="Output"
                  stackId="tokens"
                  stroke="#4F8A6F"
                  fill="url(#usageOutput)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="cache_tokens"
                  name="Cache"
                  stackId="tokens"
                  stroke="#C9A84C"
                  fill="url(#usageCache)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RecentEvents({ report }: { report: UsageReport }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent usage events</CardTitle>
      </CardHeader>
      <CardContent>
        {report.recent.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-10 text-center text-sm text-gray-400">
            No events are available for this range.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th scope="col" className="pb-3 pr-4 font-medium text-gray-500">When</th>
                  <th scope="col" className="pb-3 pr-4 font-medium text-gray-500">Client / feature</th>
                  <th scope="col" className="pb-3 pr-4 font-medium text-gray-500">Provider / model</th>
                  <th scope="col" className="pb-3 pr-4 text-right font-medium text-gray-500">Requests</th>
                  <th scope="col" className="pb-3 pr-4 text-right font-medium text-gray-500">Input</th>
                  <th scope="col" className="pb-3 pr-4 text-right font-medium text-gray-500">Output</th>
                  <th scope="col" className="pb-3 pr-4 text-right font-medium text-gray-500">Cache</th>
                  <th scope="col" className="pb-3 pr-4 text-right font-medium text-gray-500">Total</th>
                  <th scope="col" className="pb-3 text-right font-medium text-gray-500">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {report.recent.map((event) => {
                  const cacheTokens = event.cache_read_input_tokens + event.cache_creation_input_tokens
                  return (
                    <tr key={event.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap py-3 pr-4 text-xs text-gray-500">{formatDateTime(event.created_at)}</td>
                      <td className="py-3 pr-4">
                        {event.client_name && event.draft_id ? (
                          <Link href={`/dashboard/clients/${event.draft_id}`} className="font-medium text-[#1B2A4A] hover:underline">
                            {event.client_name}
                          </Link>
                        ) : (
                          <span className="font-medium text-gray-700">{event.client_name || 'No client'}</span>
                        )}
                        <p className="mt-0.5 text-xs text-gray-400">{formatFeature(event.feature)}</p>
                      </td>
                      <td className="max-w-64 py-3 pr-4">
                        <Badge variant="outline" className={providerBadgeClass(event.provider)}>
                          {formatFeature(event.provider)}
                        </Badge>
                        <p className="mt-1 truncate text-xs text-gray-500" title={event.model}>{event.model}</p>
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-gray-600">{formatNumber(event.request_count)}</td>
                      <td className="py-3 pr-4 text-right tabular-nums text-gray-600">{formatNumber(event.input_tokens)}</td>
                      <td className="py-3 pr-4 text-right tabular-nums text-gray-600">{formatNumber(event.output_tokens)}</td>
                      <td className="py-3 pr-4 text-right tabular-nums text-gray-600" title={`${formatNumber(event.cache_read_input_tokens)} read, ${formatNumber(event.cache_creation_input_tokens)} created`}>
                        {formatNumber(cacheTokens)}
                      </td>
                      <td className="py-3 pr-4 text-right font-semibold tabular-nums text-gray-900">{formatNumber(event.total_tokens)}</td>
                      <td className="whitespace-nowrap py-3 text-right text-gray-500">{formatLatency(event.latency_ms)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function UsageContent({ report }: { report: UsageReport }) {
  const totals: TokenTotals = report.totals
  const cachedTokens = totals.cache_read_input_tokens + totals.cache_creation_input_tokens

  if (totals.events === 0) {
    return <EmptyState hasOlderUsage={report.all_time.events > 0} />
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total tokens"
          value={totals.total_tokens}
          detail={`${formatNumber(report.all_time.total_tokens)} across all recorded time`}
          icon={<Activity className="h-5 w-5" />}
          accent="bg-[#1B2A4A]/10 text-[#1B2A4A]"
        />
        <SummaryCard
          label="API requests"
          value={totals.requests}
          detail={`${formatNumber(totals.events)} tracked feature events`}
          icon={<ServerCog className="h-5 w-5" />}
          accent="bg-blue-50 text-blue-700"
        />
        <SummaryCard
          label="Input tokens"
          value={totals.input_tokens}
          detail={`${formatNumber(cachedTokens)} additional cached input tokens`}
          icon={<ArrowDownToLine className="h-5 w-5" />}
          accent="bg-amber-50 text-amber-700"
        />
        <SummaryCard
          label="Output tokens"
          value={totals.output_tokens}
          detail={`${formatNumber(report.all_time.output_tokens)} across all recorded time`}
          icon={<ArrowUpFromLine className="h-5 w-5" />}
          accent="bg-emerald-50 text-emerald-700"
        />
      </div>

      <DailyTrend report={report} />
      <ModelBreakdown report={report} />
      <RecentEvents report={report} />
    </div>
  )
}

export default function UsagePage() {
  const [days, setDays] = useState<UsageRangeDays>(30)
  const [report, setReport] = useState<UsageReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setReport(null)

    getUsageReport(days, 50, controller.signal)
      .then(setReport)
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(reason instanceof Error ? reason.message : 'Failed to load AI usage')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [days, reloadKey])

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">AI Usage</h2>
          <p className="mt-1 text-sm text-gray-500">
            Monitor Anthropic and OpenAI token activity across EZWill.
          </p>
          {report?.range.tracked_since && (
            <p className="mt-2 text-xs text-gray-400">
              Tracking since {formatDate(report.range.tracked_since)} · {rangeLabel(report.range.days)}
            </p>
          )}
        </div>

        <div className="flex w-fit gap-1 rounded-lg bg-gray-100 p-1" aria-label="Usage date range">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.days}
              type="button"
              aria-pressed={days === option.days}
              onClick={() => setDays(option.days)}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                days === option.days
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-blue-100 bg-blue-50/70 px-4 py-3 text-xs leading-5 text-blue-800">
        This page shows tokens recorded by EZWill after usage tracking was deployed. Provider dashboards remain the
        source of truth for billing, and offline or rules-based fallbacks do not create usage events.
      </div>

      {loading && <LoadingState />}

      {!loading && error && (
        <Card className="border-red-200">
          <CardContent className="flex flex-col items-center px-6 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-gray-900">AI usage could not be loaded</h3>
            <p className="mt-2 max-w-md text-sm text-gray-500">{error}</p>
            <Button type="button" variant="outline" className="mt-5" onClick={() => setReloadKey((key) => key + 1)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && report && <UsageContent report={report} />}
    </div>
  )
}
