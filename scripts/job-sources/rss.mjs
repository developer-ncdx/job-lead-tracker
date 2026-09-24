import { XMLParser } from "fast-xml-parser"

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
})

export function parseRssItems(xml) {
  const items = parser.parse(xml)?.rss?.channel?.item

  if (!items) {
    return []
  }

  return Array.isArray(items) ? items : [items]
}

export function rssValue(value) {
  if (value && typeof value === "object") {
    return value["#text"] ?? ""
  }

  return value ?? ""
}
