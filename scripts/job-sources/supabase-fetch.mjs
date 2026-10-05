import { brotliDecompressSync, gunzipSync } from "node:zlib"

export async function fetchSupabaseJson(input, init, fetchImpl = fetch) {
  const response = await fetchImpl(input, init)
  if (!response.body) return response
  const bytes = Buffer.from(await response.clone().arrayBuffer())
  const firstCharacter = bytes.toString("utf8").trimStart()[0]
  if (!bytes.length || firstCharacter === "[" || firstCharacter === "{") return response
  let decoded
  try {
    // Some local responses lose encoding headers, leaving compressed JSON.
    decoded = bytes[0] === 0x1f && bytes[1] === 0x8b
      ? gunzipSync(bytes, { maxOutputLength: 5 * 1024 * 1024 })
      : brotliDecompressSync(bytes, { maxOutputLength: 5 * 1024 * 1024 })
    JSON.parse(decoded.toString("utf8"))
  } catch {
    return response
  }
  const headers = new Headers(response.headers)
  headers.delete("content-encoding")
  headers.delete("content-length")
  return new Response(decoded, { status: response.status, statusText: response.statusText, headers })
}
