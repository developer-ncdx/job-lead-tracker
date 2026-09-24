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

export function normalizeTimestamp(value) {
  if (value === null || value === undefined || value === "") {
    return null
  }

  const timestamp =
    typeof value === "number" || /^\d{10,13}$/.test(String(value))
      ? new Date(
          Number(value) < 10_000_000_000
            ? Number(value) * 1_000
            : Number(value),
        )
      : new Date(String(value))

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

  return /\b(?:remote|work\s+from\s+(?:home|anywhere)|worldwide|distributed)\b/i.test(
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
