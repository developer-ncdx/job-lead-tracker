const DEFAULT_TIMEOUT_MS = 30_000

const HTML_ENTITIES = Object.freeze({
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
})

export async function fetchJson(
  url,
  {
    fetchImpl = fetch,
    headers,
    method = "GET",
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {},
) {
  const response = await fetchImpl(url, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) {
    const responseText = await response.text().catch(() => "")
    const detail = responseText.trim().slice(0, 240)
    throw new Error(
      `${response.status} ${response.statusText}${
        detail ? `: ${detail}` : ""
      }`,
    )
  }

  return response.json()
}

export async function fetchText(
  url,
  {
    fetchImpl = fetch,
    headers,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {},
) {
  const response = await fetchImpl(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) {
    const responseText = await response.text().catch(() => "")
    const detail = responseText.trim().slice(0, 240)
    throw new Error(
      `${response.status} ${response.statusText}${
        detail ? `: ${detail}` : ""
      }`,
    )
  }

  return response.text()
}

export function cleanText(value) {
  return String(value ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code) => {
      if (code[0] === "#") {
        const numericCode =
          code[1]?.toLowerCase() === "x"
            ? Number.parseInt(code.slice(2), 16)
            : Number.parseInt(code.slice(1), 10)

        return Number.isFinite(numericCode)
          ? String.fromCodePoint(numericCode)
          : entity
      }

      return HTML_ENTITIES[code.toLowerCase()] ?? entity
    })
    .replace(/\s+/g, " ")
    .trim()
}

const NAIVE_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?)?$/

function timeZoneOffsetMs(utcMs, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs))
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  )
  const hour = values.hour === "24" ? 0 : Number(values.hour)
  const zonedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    hour,
    Number(values.minute),
    Number(values.second),
  )

  return zonedAsUtc - utcMs
}

function zonedWallTimeToUtc(value, timeZone) {
  const match = String(value).trim().match(NAIVE_DATE_TIME)

  if (!match) {
    return null
  }

  const [
    ,
    year,
    month,
    day,
    hour = "00",
    minute = "00",
    second = "00",
    fraction = "",
  ] = match
  const milliseconds = fraction ? Math.round(Number(fraction) * 1_000) : 0
  const wallTimeAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    milliseconds,
  )
  const initialOffset = timeZoneOffsetMs(wallTimeAsUtc, timeZone)
  let utcMs = wallTimeAsUtc - initialOffset
  const correctedOffset = timeZoneOffsetMs(utcMs, timeZone)

  if (correctedOffset !== initialOffset) {
    utcMs = wallTimeAsUtc - correctedOffset
  }

  const timestamp = new Date(utcMs)
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString()
}

export function normalizeTimestamp(value, timeZone) {
  if (value === null || value === undefined || value === "") {
    return null
  }

  if (typeof value === "number" || /^\d{10,13}$/.test(String(value).trim())) {
    const numericValue = Number(value)
    const timestamp = new Date(
      numericValue < 10_000_000_000 ? numericValue * 1_000 : numericValue,
    )

    return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString()
  }

  const text = String(value).trim()
  const hasTimeZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(text)

  if (timeZone && !hasTimeZone) {
    return zonedWallTimeToUtc(text, timeZone)
  }

  const timestamp = new Date(text)
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString()
}

export function normalizeSourceJobId(value) {
  if (value === null || value === undefined) {
    return ""
  }

  return String(value).trim()
}

export function inferRemote(...values) {
  const text = values
    .flat()
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(" ")

  return /\b(?:remote(?:ly)?|work\s+from\s+(?:home|anywhere)|worldwide|distributed)\b/i.test(
    text,
  )
}

export function canonicalizeUrl(value) {
  try {
    const url = new URL(String(value))

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return ""
    }

    url.hash = ""

    for (const key of [...url.searchParams.keys()]) {
      if (
        /^utm_/i.test(key) ||
        ["gh_src", "lever-source", "source", "ref"].includes(
          key.toLowerCase(),
        )
      ) {
        url.searchParams.delete(key)
      }
    }

    return url.toString()
  } catch {
    return ""
  }
}

export function combineText(...values) {
  return values.map(cleanText).filter(Boolean).join("\n\n")
}

export function titleCaseSlug(value) {
  return String(value ?? "")
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ")
}

export function extractBoardSlug(value, source) {
  const configuredValue = String(value ?? "").trim()

  if (!configuredValue) {
    return ""
  }

  try {
    const url = new URL(configuredValue)
    const segments = url.pathname.split("/").filter(Boolean)

    if (source === "greenhouse") {
      const boardsIndex = segments.findIndex((segment) => segment === "boards")
      return decodeURIComponent(
        boardsIndex >= 0 ? segments[boardsIndex + 1] : segments[0],
      )
    }

    return decodeURIComponent(segments[0])
  } catch {
    return configuredValue
  }
}
