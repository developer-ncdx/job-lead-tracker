const TARGET_ROLE_PATTERNS = Object.freeze([
  {
    family: "software-development",
    pattern:
      /\b(?:software|web|front[\s-]*end|back[\s-]*end|full[\s-]*stack|mobile|applications?|apps?|ios|android|game|wordpress|shopify|blockchain)\s+(?:developers?|devs?|engineers?|programmers?|architects?)\b/i,
  },
  {
    family: "ai-development",
    pattern:
      /\b(?:ai|a\.i\.|artificial\s+intelligence|machine\s+learning|ml|llm|generative\s+ai|genai)\s+(?:software\s+)?(?:developers?|engineers?|specialists?|programmers?|architects?)\b/i,
  },
  {
    family: "ai-agents",
    pattern:
      /\b(?:(?:ai\s+)?agents?|agentic(?:\s+ai)?|ai[\s-]*assisted)\s+(?:developers?|engineers?|specialists?|programmers?|architects?)\b/i,
  },
  {
    family: "bubble",
    pattern:
      /\b(?:bubble(?:\.io)?\s+(?:developers?|engineers?|specialists?)|(?:developers?|engineers?|specialists?)\s+(?:for\s+)?bubble(?:\.io)?)\b/i,
  },
  {
    family: "automation",
    pattern:
      /\b(?:automation|integration)\s+(?:developers?|engineers?|specialists?|architects?)\b/i,
  },
  {
    family: "platform-infrastructure",
    pattern:
      /\b(?:cloud|platform|infrastructure|devops|site\s+reliability|sre|data|embedded|firmware|application\s+security)\s+(?:developers?|engineers?|architects?)\b/i,
  },
  {
    family: "software-engineering",
    pattern:
      /\b(?:(?:back[\s-]*end)(?:\/api)?|api|product|research|forward[\s-]*deployed|c\+\+|java|python|java\s*script|type\s*script|node(?:\.js)?|go(?:lang)?|rust)\s+engineers?\b|\b(?:cloud|client\s+platform|product|application)?\s*security\s+engineers?\b|\b(?:principal|staff|senior\s+staff)\s+engineers?\b/i,
  },
  {
    family: "software-quality",
    pattern:
      /\b(?:(?:software\s+)?(?:qa|quality\s+assurance)\s+(?:developers?|engineers?)|software\s+(?:qa|quality\s+assurance)\s+specialists?|test\s+automation\s+(?:developers?|engineers?|specialists?))\b/i,
  },
  {
    family: "technical-lead",
    pattern:
      /\b(?:(?:it|tech(?:nical)?|software|engineering|development|developer|web|front[\s-]*end|back[\s-]*end|full[\s-]*stack|ai|automation)\s+(?:team\s+)?leads?|leads?\s+(?:(?:software|web|front[\s-]*end|back[\s-]*end|full[\s-]*stack|ai|automation)\s+)?(?:developers?|devs?|engineers?|programmers?))\b/i,
  },
  {
    family: "software-architecture",
    pattern:
      /\b(?:software|systems?|applications?)\s+architects?\b/i,
  },
  {
    family: "programming",
    pattern: /\b(?:developers?|programmers?)\b/i,
  },
])

const EXCLUDED_TITLE_PATTERN =
  /\b(?:sales|pre[\s-]*sales|customer\s+success|support|help\s*desk|marketing|recruit(?:er|ing)|talent\s+acquisition|product\s+manager|project\s+manager|program\s+manager|business\s+analyst|data\s+analyst|product\s+analytics|business\s+systems?\s+(?:analyst|architect)|solutions?\s+(?:architect|engineer)|partner\s+development|(?:mechanical|industrial|design)\s+engineer|instructional\s+designer|curriculum\s+development|instructor|trainer|teacher|speaker|template)\b/i

export function normalizeRoleText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}.+#/\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function evaluateTargetRole(jobOrTitle) {
  const title = normalizeRoleText(
    typeof jobOrTitle === "string" ? jobOrTitle : jobOrTitle?.title,
  )

  if (!title) {
    return {
      matches: false,
      reason: "missing_title",
      family: null,
    }
  }

  if (EXCLUDED_TITLE_PATTERN.test(title)) {
    return {
      matches: false,
      reason: "excluded_non_development_role",
      family: null,
    }
  }

  const match = TARGET_ROLE_PATTERNS.find(({ pattern }) => pattern.test(title))

  if (!match) {
    return {
      matches: false,
      reason: "no_target_software_role",
      family: null,
    }
  }

  return {
    matches: true,
    reason: "target_software_role",
    family: match.family,
  }
}

export function matchesTargetRole(jobOrTitle) {
  return evaluateTargetRole(jobOrTitle).matches
}
