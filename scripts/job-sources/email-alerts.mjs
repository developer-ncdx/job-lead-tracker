import { createHash } from "node:crypto"

import { ImapFlow } from "imapflow"
import { simpleParser } from "mailparser"

import {
  canonicalizeUrl,
  cleanText,
  inferRemote,
} from "./shared.mjs"

const PROVIDERS = Object.freeze([
  {
    source: "linkedin-email",
    senderPattern: /(?:^|[.@])linkedin\.com$/i,
  },
  {
    source: "indeed-email",
    senderPattern: /(?:^|[.@])indeed\.(?:com|[a-z]{2,3})$/i,
  },
  {
    source: "onlinejobsph-email",
    senderPattern: /(?:^|[.@])onlinejobs\.ph$/i,
  },
])

const GENERIC_LINK_TEXT =
  /^(?:apply(?: now)?|view(?: job)?|see (?:job|more|details)|learn more|read more|job alert|unsubscribe|manage|settings|click here)$/i
const RELATIVE_POSTED_DATE =
  /^(?:reposted\s+)?(?:just posted|today|yesterday|\d+\+?\s+(?:minutes?|hours?|days?|weeks?|months?)\s+ago)$/i

function decodeHtmlAttribute(value) {
  return String(value ?? "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
}

function unwrapRedirectUrl(value) {
  let current = decodeHtmlAttribute(value)

  for (let depth = 0; depth < 3; depth += 1) {
    try {
      const url = new URL(current)
      const nested = ["url", "redirect", "redirect_url", "dest", "destination"]
        .map((key) => url.searchParams.get(key))
        .find((candidate) => /^https?:\/\//i.test(candidate ?? ""))

      if (!nested) {
        return current
      }

      current = nested
    } catch {
      return ""
    }
  }

  return current
}

function normalizeProviderUrl(value) {
  const unwrapped = unwrapRedirectUrl(value)

  try {
    const url = new URL(unwrapped)
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "")

    if (hostname === "linkedin.com" || hostname.endsWith(".linkedin.com")) {
      const match = url.pathname.match(/\/jobs\/view\/(\d+)/i)

      return match
        ? {
            source: "linkedin-email",
            sourceJobId: match[1],
            url: `https://www.linkedin.com/jobs/view/${match[1]}`,
          }
        : null
    }

    if (hostname === "indeed.com" || hostname.endsWith(".indeed.com")) {
      const sourceJobId = url.searchParams.get("jk") || url.searchParams.get("vjk")

      return sourceJobId
        ? {
            source: "indeed-email",
            sourceJobId,
            url: `https://www.indeed.com/viewjob?jk=${encodeURIComponent(sourceJobId)}`,
          }
        : null
    }

    if (hostname === "onlinejobs.ph" || hostname.endsWith(".onlinejobs.ph")) {
      const match = url.pathname.match(/\/jobseekers\/job\/([^/?#]+)/i)

      if (!match) {
        return null
      }

      const sourceJobId = match[1].match(/(?:^|-)(\d+)$/)?.[1] ?? match[1]
      return {
        source: "onlinejobsph-email",
        sourceJobId,
        url: canonicalizeUrl(`https://www.onlinejobs.ph${url.pathname}`),
      }
    }
  } catch {
    return null
  }

  return null
}

export function parseRelativePostedAt(value, baseDate = new Date()) {
  const text = cleanText(value).toLowerCase().replace(/^reposted\s+/, "")
  const timestamp = new Date(baseDate)

  if (Number.isNaN(timestamp.getTime()) || !RELATIVE_POSTED_DATE.test(text)) {
    return null
  }

  if (text === "just posted" || text === "today") {
    return timestamp.toISOString()
  }

  if (text === "yesterday") {
    timestamp.setUTCDate(timestamp.getUTCDate() - 1)
    return timestamp.toISOString()
  }

  const match = text.match(
    /^(\d+)\+?\s+(minutes?|hours?|days?|weeks?|months?)\s+ago$/,
  )

  if (!match) {
    return null
  }

  const amount = Number(match[1])
  const unit = match[2]
  const durationMs = amount * (
    unit.startsWith("minute")
      ? 60_000
      : unit.startsWith("hour")
        ? 3_600_000
        : unit.startsWith("day")
          ? 86_400_000
          : unit.startsWith("week")
            ? 7 * 86_400_000
            : 30 * 86_400_000
  )

  return new Date(timestamp.getTime() - durationMs).toISOString()
}

function extractAnchors(html) {
  const anchors = []
  const pattern = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi
  let match

  while ((match = pattern.exec(html)) !== null) {
    anchors.push({
      href: match[1] ?? match[2] ?? match[3] ?? "",
      text: cleanText(match[4]),
      index: match.index,
      endIndex: pattern.lastIndex,
    })
  }

  return anchors
}

function extractPlainUrls(text) {
  return [...String(text ?? "").matchAll(/https?:\/\/[^\s<>"')\]]+/gi)].map(
    (match) => ({ href: match[0], text: "", index: match.index ?? 0 }),
  )
}

function titleFromUrl(value) {
  try {
    const url = new URL(value)
    const slug = url.pathname.split("/").filter(Boolean).at(-1) ?? ""

    return cleanText(
      decodeURIComponent(slug)
        .replace(/-\d+$/, "")
        .replace(/[-_]+/g, " "),
    )
  } catch {
    return ""
  }
}

function usableTitle(value) {
  const title = cleanText(value)

  if (
    title.length < 4 ||
    title.length > 160 ||
    /^\d+$/.test(title) ||
    GENERIC_LINK_TEXT.test(title) ||
    /^(?:https?:\/\/|www\.)/i.test(title)
  ) {
    return ""
  }

  return title
}

function jobFromLink(link, body, subject) {
  const providerUrl = normalizeProviderUrl(link.href)

  if (!providerUrl) {
    return null
  }

  const context = cleanText(
    body.slice(Math.max(0, link.index - 500), link.index + 900),
  )
  const title =
    usableTitle(link.text) ||
    usableTitle(titleFromUrl(providerUrl.url))

  if (!title) {
    return null
  }

  return {
    ...providerUrl,
    title,
    company: "",
    location: inferRemote(title, context, subject) ? "Remote" : "",
    description: context,
    isRemote: inferRemote(title, context, subject),
    sourceTimestampAt: null,
    sourceTimestampKind: null,
  }
}

function fallbackIdentity(messageId, url) {
  return createHash("sha256")
    .update(`${messageId ?? ""}:${url}`)
    .digest("hex")
    .slice(0, 32)
}

function extractTextPostingDates(text, messageDate) {
  const lines = String(text ?? "").split(/\r?\n/)
  const dates = new Map()

  for (let index = 0; index < lines.length; index += 1) {
    const providerUrl = normalizeProviderUrl(lines[index].trim())

    if (!providerUrl) {
      continue
    }

    const relativeDate = lines
      .slice(Math.max(0, index - 14), index)
      .map((line) => cleanText(line))
      .reverse()
      .find((line) => RELATIVE_POSTED_DATE.test(line))
    const postedAt = parseRelativePostedAt(relativeDate, messageDate)

    if (postedAt) {
      dates.set(`${providerUrl.source}:${providerUrl.sourceJobId}`, postedAt)
    }
  }

  return dates
}

export function identifyEmailAlertProvider(addresses) {
  const normalized = addresses.map((address) => String(address).toLowerCase())

  return PROVIDERS.find(({ senderPattern }) =>
    normalized.some((address) => senderPattern.test(address)),
  )?.source ?? null
}

export function parseJobAlertEmail({
  from = [],
  subject = "",
  html = "",
  text = "",
  messageId = "",
  messageDate = new Date(),
} = {}) {
  const addresses = from.map((entry) =>
    typeof entry === "string" ? entry : entry?.address,
  ).filter(Boolean)
  const provider = identifyEmailAlertProvider(addresses)

  if (!provider) {
    return []
  }

  const body = String(html || text || "")
  const links = html ? extractAnchors(body) : extractPlainUrls(body)
  const jobs = []
  const seen = new Set()
  const textPostingDates = extractTextPostingDates(text, messageDate)

  for (const link of links) {
    const job = jobFromLink(link, body, subject)

    if (!job || job.source !== provider) {
      continue
    }

    if (!job.sourceJobId) {
      job.sourceJobId = fallbackIdentity(messageId, job.url)
    }

    const identity = `${job.source}:${job.sourceJobId}`
    if (!seen.has(identity)) {
      const postedAt = textPostingDates.get(identity)

      if (postedAt) {
        job.sourceTimestampAt = postedAt
        job.sourceTimestampKind = "published"
      }

      seen.add(identity)
      jobs.push(job)
    }
  }

  return jobs
}

function extractLinkedInPostedText(html) {
  const match = String(html).match(
    /<span\b[^>]*class=["'][^"']*\bposted-time-ago__text\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
  )

  return match ? cleanText(match[1]) : ""
}

export async function enrichEmailAlertPostedDates(
  jobs,
  { fetchImpl = fetch, observedAt = new Date() } = {},
) {
  const postedDates = new Map()
  const pending = [...new Map(
    jobs
      .filter(
        (job) => job.source === "linkedin-email" && !job.sourceTimestampAt,
      )
      .map((job) => [`${job.source}:${job.sourceJobId}`, job]),
  ).values()]

  for (let index = 0; index < pending.length; index += 6) {
    const batch = pending.slice(index, index + 6)

    await Promise.all(
      batch.map(async (job) => {
        try {
          const response = await fetchImpl(
            `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${job.sourceJobId}`,
            {
            headers: {
              "user-agent": "Mozilla/5.0 (compatible; JobLeadTracker/1.0)",
            },
            redirect: "follow",
            signal: AbortSignal.timeout(15_000),
            },
          )

          if (!response.ok) {
            return
          }

          const html = await response.text()
          const postedAt = parseRelativePostedAt(
            extractLinkedInPostedText(html),
            observedAt,
          )

          if (postedAt) {
            postedDates.set(`${job.source}:${job.sourceJobId}`, postedAt)
          }
        } catch {
          // A missing page date should not fail the complete email sync.
        }
      }),
    )
  }

  return jobs.map((job) => {
    const postedAt = postedDates.get(`${job.source}:${job.sourceJobId}`)

    return postedAt
      ? {
          ...job,
          sourceTimestampAt: postedAt,
          sourceTimestampKind: "published",
        }
      : job
  })
}

export function resolveEmailAlertEnvironment(environment = process.env) {
  const enabled = environment.JOB_ALERT_EMAIL_ENABLED === "true"
  const user = environment.JOB_ALERT_EMAIL_USER?.trim()
  const password = environment.JOB_ALERT_EMAIL_APP_PASSWORD?.replace(/\s+/g, "")
  const missing = [
    !user && "JOB_ALERT_EMAIL_USER",
    !password && "JOB_ALERT_EMAIL_APP_PASSWORD",
  ].filter(Boolean)

  return {
    enabled,
    missing,
    host: environment.JOB_ALERT_IMAP_HOST?.trim() || "imap.gmail.com",
    port: Number(environment.JOB_ALERT_IMAP_PORT || 993),
    secure: environment.JOB_ALERT_IMAP_SECURE !== "false",
    user,
    password,
    mailbox: environment.JOB_ALERT_MAILBOX?.trim() || "INBOX",
    lookbackDays: Math.max(1, Number(environment.JOB_ALERT_LOOKBACK_DAYS || 14)),
    maxMessages: Math.max(1, Number(environment.JOB_ALERT_MAX_MESSAGES || 100)),
    enrichPostedDates:
      environment.JOB_ALERT_ENRICH_POSTED_DATES !== "false",
  }
}

export async function fetchEmailAlertJobs(
  _config = {},
  { environment = process.env, clientFactory = (options) => new ImapFlow(options) } = {},
) {
  const settings = resolveEmailAlertEnvironment(environment)

  if (settings.missing.length > 0) {
    throw new Error(`Missing ${settings.missing.join(", ")}`)
  }

  const client = clientFactory({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: {
      user: settings.user,
      pass: settings.password,
    },
    logger: false,
  })

  let lock

  try {
    await client.connect()
    lock = await client.getMailboxLock(settings.mailbox, { readOnly: true })
    const since = new Date(Date.now() - settings.lookbackDays * 86_400_000)
    const allUids = await client.search({ since }, { uid: true })
    const uids = allUids.slice(-settings.maxMessages)
    const jobs = []

    if (uids.length === 0) {
      return jobs
    }

    for await (const message of client.fetch(
      uids,
      { envelope: true, source: true, uid: true },
      { uid: true },
    )) {
      const senderAddresses =
        message.envelope?.from?.map((entry) => entry.address).filter(Boolean) ?? []

      if (!identifyEmailAlertProvider(senderAddresses)) {
        continue
      }

      const parsed = await simpleParser(message.source)
      jobs.push(
        ...parseJobAlertEmail({
          from: parsed.from?.value ?? [],
          subject: parsed.subject ?? "",
          html: typeof parsed.html === "string" ? parsed.html : "",
          text: parsed.text ?? "",
          messageId: parsed.messageId ?? String(message.uid),
          messageDate: parsed.date ?? message.envelope?.date ?? new Date(),
        }),
      )
    }

    return settings.enrichPostedDates
      ? enrichEmailAlertPostedDates(jobs)
      : jobs
  } catch (error) {
    if (error?.authenticationFailed) {
      throw new Error(
        "Gmail IMAP authentication failed. Verify JOB_ALERT_EMAIL_USER and the 16-character Gmail app password.",
      )
    }

    throw error
  } finally {
    lock?.release()

    if (client.usable) {
      await client.logout().catch(() => client.close())
    } else {
      client.close()
    }
  }
}
