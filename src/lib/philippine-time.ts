const PHILIPPINE_TIME_ZONE = "Asia/Manila"

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PHILIPPINE_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PHILIPPINE_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
})

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PHILIPPINE_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
})

function toDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatPhilippineDateTime(value: string | Date) {
  const date = toDate(value)
  return date ? `${dateTimeFormatter.format(date)} PHT` : null
}

export function formatPhilippineDate(value: string | Date) {
  const date = toDate(value)
  return date ? dateFormatter.format(date) : null
}

export function formatPhilippineTime(value: string | Date) {
  const date = toDate(value)
  return date ? `${timeFormatter.format(date)} PHT` : null
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const RELATIVE_TIME_PATTERNS = [
  { pattern: /(\d+)\s*(?:minutes?|mins?)\s+ago/i, duration: MINUTE },
  { pattern: /(\d+)\s*hours?\s+ago/i, duration: HOUR },
  { pattern: /(\d+)\s*days?\s+ago/i, duration: DAY },
  { pattern: /(\d+)\s*weeks?\s+ago/i, duration: 7 * DAY },
  { pattern: /(\d+)\s*months?\s+ago/i, duration: 30 * DAY },
  { pattern: /(\d+)\s*分前/u, duration: MINUTE },
  { pattern: /(\d+)\s*時間前/u, duration: HOUR },
  { pattern: /(\d+)\s*日前/u, duration: DAY },
  { pattern: /(\d+)\s*週間前/u, duration: 7 * DAY },
  { pattern: /(\d+)\s*(?:か月|ヶ月|月)前/u, duration: 30 * DAY },
  {
    pattern: /(\d+)\s*minuto(?:s)?\s+(?:ang\s+)?nakalipas/i,
    duration: MINUTE,
  },
  {
    pattern: /(\d+)\s*oras?\s+(?:ang\s+)?nakalipas/i,
    duration: HOUR,
  },
  {
    pattern: /(\d+)\s*araw\s+(?:ang\s+)?nakalipas/i,
    duration: DAY,
  },
  {
    pattern: /(\d+)\s*linggo\s+(?:ang\s+)?nakalipas/i,
    duration: 7 * DAY,
  },
  {
    pattern: /(\d+)\s*buwan\s+(?:ang\s+)?nakalipas/i,
    duration: 30 * DAY,
  },
] as const

export function estimateRelativeDate(
  label: string,
  observedAt: string | Date,
) {
  const anchor = toDate(observedAt)
  const normalizedLabel = String(label).trim()

  if (!anchor || !normalizedLabel) {
    return null
  }

  if (/^(?:just now|today|ngayon lang)$/i.test(normalizedLabel)) {
    return anchor
  }

  for (const { pattern, duration } of RELATIVE_TIME_PATTERNS) {
    const match = normalizedLabel.match(pattern)

    if (match) {
      return new Date(anchor.getTime() - Number(match[1]) * duration)
    }
  }

  return null
}
