const PHILIPPINE_TIME_ZONE = "Asia/Manila"

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PHILIPPINE_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
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

export function formatPhilippineTime(value: string | Date) {
  const date = toDate(value)
  return date ? `${timeFormatter.format(date)} PHT` : null
}
