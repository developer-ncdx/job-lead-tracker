import { parseHTML } from "linkedom"
import { createCrawlReader } from "./crawl-pages.mjs"
import { matchesTargetRole } from "./role-filter.mjs"
import { isRemoteOnlyJob } from "./sync-utils.mjs"

const ORIGIN = "https://joincrewclub.com"
const text = element => element?.textContent.replace(/\s+/g, " ").trim() || null

export function extractCrewClubListings(html, expectedPage = 1) {
  const { document } = parseHTML(html)
  const page = document.querySelector(".cj-page")
  const pageNumber = Number(page?.getAttribute("data-cj-page"))
  const maxPages = Number(page?.getAttribute("data-cj-max-pages"))
  if (pageNumber !== expectedPage || !Number.isInteger(maxPages) || maxPages < 1) {
    throw new Error("Crew Club listing pagination is missing or changed")
  }
  const cards = [...document.querySelectorAll("article.cj-card")]
  if (!cards.length) throw new Error("Crew Club public job cards are missing; access or layout may have changed")
  const jobs = []
  for (const card of cards) {
    if (card.classList.contains("cj-card--filled") || /\bfilled\b/i.test(text(card.querySelector(".cj-card__head")) ?? "")) continue
    const anchor = card.querySelector(".cj-card__title a[href]")
    const title = text(anchor)
    const url = new URL(anchor?.getAttribute("href") ?? "", ORIGIN)
    if (!title || url.origin !== ORIGIN || !/^\/jobs\/[^/]+\/$/.test(url.pathname)) {
      throw new Error("Crew Club listing title or job URL is missing or changed")
    }
    const metadata = [...card.querySelectorAll(".cj-card__meta-row")].map(text).filter(Boolean)
    const categories = [...card.querySelectorAll(".cj-card__cat-pill")].map(text).filter(Boolean)
    const date = text(card.querySelector(".cj-card__date"))
    const job = {
      source: "crewclub",
      sourceJobId: url.pathname.split("/")[2],
      title,
      url: `${ORIGIN}${url.pathname}`,
      company: null,
      location: "Remote — Philippines",
      // The public board explicitly advertises remote roles for Filipino talent.
      isRemote: true,
      description: [
        "Public Crew Club listing. Sign in to Crew Club to view the full job description and apply.",
        text(card.querySelector(".cj-card__type")),
        ...metadata,
        categories.length && `Categories: ${categories.join(", ")}`,
      ].filter(Boolean).join("\n\n"),
      sourceTimestampKind: date ? "posted" : null,
      sourceTimestampLabel: date ? `Posted ${date}` : null,
    }
    if (matchesTargetRole(job) && isRemoteOnlyJob(job)) jobs.push(job)
  }
  return { jobs, maxPages }
}

export async function fetchCrewClubJobs(config = {}, { fetchImpl = fetch, wait } = {}) {
  const pageLimit = config.maxListingPages ?? 10
  if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 10) {
    throw new Error("Crew Club listing page limit must be between 1 and 10")
  }
  const read = createCrawlReader({ fetchImpl, wait })
  const jobs = new Map()
  let maxPages = 1
  for (let page = 1; page <= maxPages; page++) {
    const url = `${ORIGIN}/crew-jobs/${page === 1 ? "" : `page/${page}/`}`
    const result = extractCrewClubListings(await read(url), page)
    if (result.maxPages > pageLimit) throw new Error(`Crew Club has ${result.maxPages} listing pages, exceeding the configured limit ${pageLimit}`)
    maxPages = result.maxPages
    for (const job of result.jobs) jobs.set(job.sourceJobId, job)
  }
  return [...jobs.values()]
}
