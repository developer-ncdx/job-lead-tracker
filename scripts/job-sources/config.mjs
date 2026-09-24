import { readFile } from "node:fs/promises"
import path from "node:path"

export async function loadSourceConfig(
  configPath = process.env.JOB_SOURCES_CONFIG ??
    "job-sources.config.json",
) {
  const absolutePath = path.resolve(process.cwd(), configPath)
  const contents = await readFile(absolutePath, "utf8")
  const config = JSON.parse(contents)

  for (const source of ["greenhouse", "ashby", "lever"]) {
    if (!Array.isArray(config[source])) {
      throw new Error(
        `${path.basename(absolutePath)} must define a \`${source}\` array.`,
      )
    }
  }

  return config
}

export function loadLocalEnvironment(filename) {
  if (typeof process.loadEnvFile !== "function") {
    return
  }

  const candidates = filename ? [filename] : [".env.local", ".env"]

  for (const candidate of candidates) {
    try {
      process.loadEnvFile(candidate)
      return candidate
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error
      }
    }
  }

  return undefined
}
