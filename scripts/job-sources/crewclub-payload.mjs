// Crew Club's Next.js board sends every public listing in the page payload;
// its HTML renders only the first nine cards. Parse data without running scripts.
export function readCrewClubPayload(document) {
  const chunks = []
  for (const script of document.querySelectorAll("script:not([src])")) {
    const match = script.textContent.match(/^self\.__next_f\.push\((\[[\s\S]*\])\);?\s*$/)
    if (!match) continue
    let chunk
    try {
      chunk = JSON.parse(match[1])
    } catch {
      throw new Error("Crew Club public page payload is malformed")
    }
    if (chunk[0] === 1 && typeof chunk[1] === "string") chunks.push(chunk[1])
  }
  if (!chunks.length) return null

  const stream = Buffer.from(chunks.join(""), "utf8")
  const hubs = []
  let offset = 0
  while (offset < stream.length) {
    const colon = stream.indexOf(58, offset)
    if (colon < 0 || !/^[0-9a-f]*$/i.test(stream.toString("ascii", offset, colon))) {
      throw new Error("Crew Club public page payload framing changed")
    }
    const start = colon + 1
    if (stream[start] === 84) {
      // Flight text rows are byte-length-prefixed, not newline-delimited.
      // Skip them so job-description text cannot be mistaken for listing data.
      const comma = stream.indexOf(44, start)
      const length = stream.toString("ascii", start + 1, comma)
      if (comma < 0 || !/^[0-9a-f]+$/i.test(length)) {
        throw new Error("Crew Club public page text framing changed")
      }
      offset = comma + 1 + Number.parseInt(length, 16)
      if (offset > stream.length) throw new Error("Crew Club public page payload is incomplete")
      continue
    }
    const newline = stream.indexOf(10, start)
    if (newline < 0) throw new Error("Crew Club public page payload is incomplete")
    offset = newline + 1
    // Import references, hints, and strings do not contain the jobs props.
    if (![91, 123].includes(stream[start])) continue
    let value
    try {
      value = JSON.parse(stream.toString("utf8", start, newline))
    } catch {
      throw new Error("Crew Club public page payload is malformed")
    }
    const pending = [value]
    while (pending.length) {
      const node = pending.pop()
      if (!node || typeof node !== "object") continue
      if (Object.hasOwn(node, "hub") && Array.isArray(node.hub?.jobs)) hubs.push(node.hub)
      pending.push(...Object.values(node))
    }
  }
  if (hubs.length !== 1) throw new Error("Crew Club public jobs payload is missing or changed")
  return hubs[0].jobs
}
