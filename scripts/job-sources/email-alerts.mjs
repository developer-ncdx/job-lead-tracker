import { createHash } from "node:crypto"

import { ImapFlow } from "imapflow"
import { simpleParser } from "mailparser"

import {
  canonicalizeUrl,
  cleanText,
  inferRemote,
} from "./shared.mjs"

const GOOGLE_ALERTS_SENDER = "googlealerts-noreply@google.com"

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
  {
    source: "google-alerts",
    senderPattern: /^googlealerts-noreply@google\.com$/i,
  },
])

const GENERIC_LINK_TEXT =
  /^(?:apply(?: now)?|view(?: job)?|see (?:job|more|details)|learn more|read more|job alert|unsubscribe|manage|settings|click here)$/i
const ABSOLUTE_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i

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
      const match = url.pathname.match(
        /\/jobs\/view\/(?:[^/?#]*-)?(\d+)\/?$/i,
      )

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

    if (hostname === "upwork.com" || hostname.endsWith(".upwork.com")) {
      if (
        !url.pathname.startsWith("/jobs/") &&
        !url.pathname.startsWith("/freelance-jobs/apply/")
      ) {
        return null
      }

      const match = url.pathname.match(/(?:\/|_)~(\d+)(?:\/|$)/)

      return match
        ? {
            source: "upwork-email",
            sourceJobId: `~${match[1]}`,
            url: canonicalizeUrl(url.toString()),
          }
        : null
    }
  } catch {
    return null
  }

  return null
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
    sourceTimestampLabel: null,
  }
}

function fallbackIdentity(messageId, url) {
  return createHash("sha256")
    .update(`${messageId ?? ""}:${url}`)
    .digest("hex")
    .slice(0, 32)
}

function googleAlertResults(html) {
  const results = []

  for (const script of String(html).matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
  )) {
    if (
      !/\bdata-scope=["']inboxmarkup["']/i.test(script[1]) ||
      !/\btype=["']application\/json["']/i.test(script[1])
    ) {
      continue
    }

    try {
      const markup = JSON.parse(script[2])

      if (markup.publisher?.name !== "Google Alerts") {
        continue
      }

      const widgets = Array.isArray(markup.cards)
        ? markup.cards.flatMap((card) =>
            Array.isArray(card.widgets) ? card.widgets : [],
          )
        : []
      const structuredResults = widgets
        .filter((widget) => widget.type === "LINK")
        .map((widget) => ({
          url: widget.url,
          title: widget.title,
          description: widget.description,
        }))
      results.push(...structuredResults)
    } catch {
      // Fall back to visible result links when inbox markup is malformed.
    }
  }

  // Inbox metadata can contain only a subset of the email's results. Keep
  // structured results first so their descriptions survive deduplication.
  const visibleHtml = String(html).replace(
    /<script\b[^>]*>[\s\S]*?<\/script>/gi,
    "",
  )
  const visibleResults = extractAnchors(visibleHtml).map((link) => ({
    url: link.href,
    title: link.text,
    // Without a structured result boundary, neighboring snippets must not
    // make an unrelated onsite posting appear remote.
    description: "",
  }))
  return [...results, ...visibleResults]
}

function parseGoogleAlertEmail(html) {
  const jobs = []
  const seen = new Set()

  for (const result of googleAlertResults(html)) {
    const providerUrl = normalizeProviderUrl(result.url)
    const title = usableTitle(result.title)

    if (!providerUrl || !title) {
      continue
    }

    const identity = `${providerUrl.source}:${providerUrl.sourceJobId}`

    if (seen.has(identity)) {
      continue
    }

    seen.add(identity)
    const description = cleanText(result.description)
    const isRemote = inferRemote(title, description)

    jobs.push({
      ...providerUrl,
      title,
      company: "",
      location: isRemote ? "Remote" : "",
      description,
      isRemote,
      sourceTimestampAt: null,
      sourceTimestampKind: null,
      sourceTimestampLabel: null,
    })
  }

  return jobs
}

function isAuthenticatedGoogleAlert(authenticationResults) {
  return /\bdmarc=pass\b[^;]*\bheader\.from=google\.com\b/i.test(
    String(authenticationResults ?? ""),
  )
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
  authenticationResults = "",
} = {}) {
  const addresses = from.map((entry) =>
    typeof entry === "string" ? entry : entry?.address,
  ).filter(Boolean)
  const provider = identifyEmailAlertProvider(addresses)

  if (!provider) {
    return []
  }

  if (provider === "google-alerts") {
    return /^Google Alert\s*-/i.test(subject) &&
      isAuthenticatedGoogleAlert(authenticationResults)
      ? parseGoogleAlertEmail(html)
      : []
  }

  const body = String(html || text || "")
  const links = html ? extractAnchors(body) : extractPlainUrls(body)
  const jobs = []
  const seen = new Set()

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
      seen.add(identity)
      jobs.push(job)
    }
  }

  return jobs
}

function normalizeAbsoluteTimestamp(value) {
  const candidate = String(value ?? "").trim()

  if (!ABSOLUTE_TIMESTAMP.test(candidate)) {
    return null
  }

  const timestamp = new Date(candidate)
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString()
}

function findJobPostingDate(value) {
  if (Array.isArray(value)) {
    return value.map(findJobPostingDate).find(Boolean) ?? null
  }

  if (!value || typeof value !== "object") {
    return null
  }

  const types = Array.isArray(value["@type"])
    ? value["@type"]
    : [value["@type"]]

  if (types.includes("JobPosting")) {
    return normalizeAbsoluteTimestamp(value.datePosted)
  }

  return Object.values(value).map(findJobPostingDate).find(Boolean) ?? null
}

export function extractExactPostedAt(html) {
  const scripts = String(html).matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )

  for (const match of scripts) {
    try {
      const postedAt = findJobPostingDate(JSON.parse(match[1]))

      if (postedAt) {
        return postedAt
      }
    } catch {
      // Ignore malformed structured data and continue looking for JobPosting JSON-LD.
    }
  }

  return null
}

export function extractProviderPostedLabel(html) {
  const match = String(html).match(
    /<span\b[^>]*class=["'][^"']*\bposted-time-ago__text\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
  )
  const label = match ? cleanText(match[1]) : ""

  return label && label.length <= 80 ? label : null
}

function providerPostingUrl(job) {
  if (job.source === "linkedin-email") {
    return `https://www.linkedin.com/jobs/view/${job.sourceJobId}`
  }

  return job.url
}

export async function enrichEmailAlertPostedDates(
  jobs,
  { fetchImpl = fetch, includeLinkedIn = false } = {},
) {
  const postingMetadata = new Map()
  const pending = [...new Map(
    jobs
      .filter(
        (job) =>
          !job.sourceTimestampAt &&
          (includeLinkedIn || job.source !== "linkedin-email"),
      )
      .map((job) => [`${job.source}:${job.sourceJobId}`, job]),
  ).values()]

  for (let index = 0; index < pending.length; index += 3) {
    const batch = pending.slice(index, index + 3)

    await Promise.all(
      batch.map(async (job) => {
        try {
          const response = await fetchImpl(
            providerPostingUrl(job),
            {
              headers: {
                accept: "text/html,application/xhtml+xml",
                "accept-language": "en-US,en;q=0.9",
                "user-agent": "curl/8.7.1",
              },
              redirect: "follow",
              signal: AbortSignal.timeout(15_000),
            },
          )

          if (!response.ok) {
            return
          }

          const html = await response.text()
          const postedAt = extractExactPostedAt(html)

          if (postedAt) {
            postingMetadata.set(`${job.source}:${job.sourceJobId}`, {
              sourceTimestampAt: postedAt,
              sourceTimestampKind: "published",
              sourceTimestampLabel: null,
            })
            return
          }

          if (job.source === "linkedin-email") {
            const postedLabel = extractProviderPostedLabel(html)

            if (postedLabel) {
              postingMetadata.set(`${job.source}:${job.sourceJobId}`, {
                sourceTimestampAt: null,
                sourceTimestampKind: null,
                sourceTimestampLabel: postedLabel,
              })
            }
          }
        } catch {
          // A missing page date should not fail the complete email sync.
        }
      }),
    )
  }

  return jobs.map((job) => {
    const metadata = postingMetadata.get(
      `${job.source}:${job.sourceJobId}`,
    )

    return metadata
      ? { ...job, ...metadata }
      : {
          ...job,
          sourceTimestampLabel: job.sourceTimestampLabel ?? null,
        }
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

  try {
    await client.connect()
    const since = new Date(Date.now() - settings.lookbackDays * 86_400_000)
    const folders = await client.list()
    const spamMailbox = folders.find(
      (folder) => folder.specialUse === "\\Junk",
    )?.path
    const mailboxes = [
      { path: settings.mailbox, googleOnly: false },
    ]

    if (spamMailbox && spamMailbox !== settings.mailbox) {
      mailboxes.push({ path: spamMailbox, googleOnly: true })
    }

    const jobs = []

    for (const mailbox of mailboxes) {
      const lock = await client.getMailboxLock(mailbox.path, {
        readOnly: true,
      })

      try {
        const search = mailbox.googleOnly
          ? { since, from: GOOGLE_ALERTS_SENDER }
          : { since }
        const allUids = await client.search(search, { uid: true })
        const uids = allUids.slice(-settings.maxMessages)

        if (uids.length === 0) {
          continue
        }

        for await (const message of client.fetch(
          uids,
          { envelope: true, source: true, uid: true },
          { uid: true },
        )) {
          const senderAddresses =
            message.envelope?.from?.map((entry) => entry.address)
              .filter(Boolean) ?? []

          const provider = identifyEmailAlertProvider(senderAddresses)

          if (
            !provider ||
            (mailbox.googleOnly && provider !== "google-alerts")
          ) {
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
              authenticationResults:
                parsed.headers.get("authentication-results"),
            }),
          )
        }
      } finally {
        lock.release()
      }
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
    if (client.usable) {
      await client.logout().catch(() => client.close())
    } else {
      client.close()
    }
  }
}
