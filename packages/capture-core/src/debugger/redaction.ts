// Redaction is deliberately conservative, not guaranteed complete: it masks
// values by field name and value shape, so a secret under an unusual name or
// in free-form text can still get through.

export const REDACTED_VALUE = "[REDACTED]"

// Past this depth a value cannot be inspected, so it is replaced rather than
// passed through. Bodies are length-capped first, so real payloads stay well
// inside it.
const MAX_STRUCTURED_DEPTH = 32

// Matched as substrings of a lowercased name with "_" read as "-", so these
// also cover set-cookie, x-api-key, access_token, client_secret and so on.
const SENSITIVE_NAME_PATTERNS = [
  "authorization",
  "cookie",
  "token",
  "secret",
  "password",
  "passwd",
  "pwd",
  "session",
  "api-key",
  "apikey",
  "private-key",
  "privatekey",
  "jwt",
] as const

// A name followed by ":" or "=", as in "token=…", "Authorization: …" or a
// JSON "key": (the optional quote is the key's closing quote). The name must
// not start mid-word.
const KEY_SEPARATOR_SOURCE = String.raw`(?<![\w$.-])([A-Za-z_$][\w$.-]{0,63})(["']?\s*[:=]\s*)`

// An unquoted value runs to the next separator, so a value with spaces is
// masked whole.
const UNQUOTED_VALUE_END = /[&,;"'\n]/

// Names that are only secret as URL parameters (an OAuth "code", a signed-URL
// "sig"), where treating them as sensitive everywhere would mask harmless
// body fields such as {"code": 404}.
const URL_PARAM_SECRET_NAMES = new Set([
  "auth",
  "code",
  "credential",
  "credentials",
  "key",
  "sig",
  "signature",
  "x-amz-credential",
  "x-amz-signature",
  "x-goog-signature",
])

// "?name=value", "&name=value" and the same inside a #fragment, up to the
// next "&" or "#".
const URL_PARAM_PATTERN = /([?&#])([^=&#?/\s]+)=([^&#\s]*)/g

// "user:password@" in the authority of an absolute or protocol-relative URL.
const URL_USERINFO_PATTERN = /(\/\/[^/\s:@?#]+:)[^/\s@?#]+@/g

// A JWT is recognizable by shape whatever field it sits in.
const JWT_PATTERN = /\beyJ[\w-]{4,}\.eyJ[\w-]{4,}\.[\w-]*/g

const MULTIPART_START_PATTERN = /^--[^\n]*\r?\ncontent-disposition:/i

const MULTIPART_BOUNDARY_PATTERN = /boundary="?([^";\s]+)"?/i

const MULTIPART_FIELD_NAME_PATTERN =
  /^content-disposition:.*?[;\s]name="([^"]*)"/i

const AUTH_SCHEME_PREFIX_PATTERN = /^(?:bearer|basic)\s+/i

// A bare bearer token in free text. It must contain a digit or token
// punctuation, so prose such as "Bearer authentication" is left alone.
const BEARER_TOKEN_PATTERN =
  /\b(Bearer)\s+(?=[A-Za-z]*[0-9._\-~+/])([A-Za-z0-9\-._~+/]{8,}=*)/gi

const AUTH_SCHEME_PATTERN = /^([A-Za-z][\w-]*)\s+\S/

// Number values under these names are usage counts (max_tokens,
// prompt_tokens), not secrets.
const TOKEN_COUNT_NAME_PATTERN = /tokens/i

const COOKIE_PAIR_PATTERN = /(^|[;,\n]\s*)([^=;,\s]+)=([^;,\n]*)/g

const COOKIE_ATTRIBUTE_NAMES = new Set([
  "domain",
  "expires",
  "httponly",
  "max-age",
  "partitioned",
  "path",
  "priority",
  "samesite",
  "secure",
])

export interface RedactableNetworkRequest {
  url: string
  requestHeaders?: Record<string, string>
  responseHeaders?: Record<string, string>
  requestBody?: string
  responseBody?: string
}

export function isSensitiveName(value: string): boolean {
  const normalizedValue = value.trim().toLowerCase().replaceAll("_", "-")
  if (!normalizedValue) {
    return false
  }

  return SENSITIVE_NAME_PATTERNS.some((pattern) => {
    return normalizedValue.includes(pattern)
  })
}

// Whether a name/value pair should be masked. Booleans and nulls carry no
// secret, so they stay readable even under a sensitive name.
export function isRedactableEntry(name: string, value: unknown): boolean {
  if (!isSensitiveName(name) || value === null || typeof value === "boolean") {
    return false
  }

  return !(typeof value === "number" && TOKEN_COUNT_NAME_PATTERN.test(name))
}

// Masks the value of every sensitive name/value pair in text: headers, query
// strings, form bodies, log lines and JSON, including JSON cut off mid-value.
export function redactText(value: string): string {
  const keySeparatorPattern = new RegExp(KEY_SEPARATOR_SOURCE, "g")
  let result = ""
  let cursor = 0

  for (
    let match = keySeparatorPattern.exec(value);
    match;
    match = keySeparatorPattern.exec(value)
  ) {
    const name = match[1] ?? ""
    const valueStart = match.index + match[0].length
    if (!isSensitiveName(name)) {
      continue
    }

    const masked =
      maskCookieLineAt(value, valueStart, name, match[2] ?? "") ??
      maskValueAt(value, valueStart, name)
    if (!masked) {
      continue
    }

    result += value.slice(cursor, valueStart) + masked.replacement
    cursor = masked.end
    keySeparatorPattern.lastIndex = masked.end
  }

  return (result + value.slice(cursor))
    .replace(URL_USERINFO_PATTERN, `$1${REDACTED_VALUE}@`)
    .replace(JWT_PATTERN, REDACTED_VALUE)
    .replace(BEARER_TOKEN_PATTERN, `$1 ${REDACTED_VALUE}`)
}

export function redactHeaderValue(name: string, value: string): string {
  const normalizedName = name.trim().toLowerCase()
  if (normalizedName === "cookie" || normalizedName === "set-cookie") {
    return redactCookieHeader(value, normalizedName === "set-cookie")
  }

  if (!isSensitiveName(normalizedName)) {
    return value
  }

  // Keep the scheme so a developer can still tell Basic from Bearer.
  if (normalizedName.includes("authorization")) {
    const scheme = AUTH_SCHEME_PATTERN.exec(value.trim())?.[1]
    if (scheme) {
      return `${scheme} ${REDACTED_VALUE}`
    }
  }

  return REDACTED_VALUE
}

export function redactHeaders(
  headers: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    result[name] = redactHeaderValue(name, value)
  }

  return result
}

// URLs are redacted as text, not parsed and re-serialized, so relative,
// protocol-relative and opaque URLs (data:, javascript:) keep their exact
// form, and query params, OAuth fragments and hash routes are all covered.
export function redactUrl(url: string): string {
  return redactText(redactUrlParams(url))
}

// Parameter names are percent-decoded before the check, so "%61pi_key" is
// still an api_key, and the value runs to the next "&" or "#" whatever
// punctuation it contains.
function redactUrlParams(url: string): string {
  return url.replace(
    URL_PARAM_PATTERN,
    (match, separator: string, name: string, paramValue: string) => {
      if (!paramValue) {
        return match
      }

      const decodedName = safeDecode(name)
      const secret =
        URL_PARAM_SECRET_NAMES.has(decodedName.toLowerCase()) ||
        isRedactableEntry(decodedName, parseScalar(safeDecode(paramValue)))
      return secret ? `${separator}${name}=${REDACTED_VALUE}` : match
    }
  )
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

// Bodies are JSON-parsed whatever their Content-Type claims, because a secret
// in a JSON body is still a secret when the header lies.
export function redactBody(body: string, contentType = ""): string {
  const parsed = parseJsonBody(body)
  if (parsed !== undefined) {
    const redacted = redactStructuredValue(parsed)
    const serialized = JSON.stringify(redacted)
    return serialized === JSON.stringify(parsed) ? body : serialized
  }

  if (contentType.toLowerCase().includes("x-www-form-urlencoded")) {
    return redactFormBody(body)
  }

  if (isMultipartBody(body, contentType)) {
    return redactText(redactMultipartBody(body, contentType))
  }

  return redactText(body)
}

export function redactStructuredValue(value: unknown, depth = 0): unknown {
  if (depth >= MAX_STRUCTURED_DEPTH) {
    return "[MaxDepth]"
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactStructuredValue(item, depth + 1))
  }

  if (value && typeof value === "object") {
    // fromEntries defines own properties, so a "__proto__" key from parsed
    // JSON stays a key instead of replacing the object's prototype.
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        isRedactableEntry(key, nestedValue)
          ? REDACTED_VALUE
          : redactStructuredValue(nestedValue, depth + 1),
      ])
    )
  }

  if (typeof value === "string") {
    return redactText(value)
  }

  return value
}

export function redactMetadata(
  metadata: Record<string, unknown>
): Record<string, unknown> {
  return redactStructuredValue(metadata) as Record<string, unknown>
}

export function redactNetworkRequest<TRequest extends RedactableNetworkRequest>(
  request: TRequest
): TRequest {
  return {
    ...request,
    url: redactUrl(request.url),
    requestHeaders: request.requestHeaders
      ? redactHeaders(request.requestHeaders)
      : request.requestHeaders,
    responseHeaders: request.responseHeaders
      ? redactHeaders(request.responseHeaders)
      : request.responseHeaders,
    requestBody:
      request.requestBody === undefined
        ? undefined
        : redactBody(
            request.requestBody,
            request.requestHeaders?.["content-type"]
          ),
    responseBody:
      request.responseBody === undefined
        ? undefined
        : redactBody(
            request.responseBody,
            request.responseHeaders?.["content-type"]
          ),
  }
}

interface MaskedValue {
  end: number
  replacement: string
}

// Finds the value starting at valueStart and returns its masked form, or
// undefined when there is nothing to mask.
function maskValueAt(
  text: string,
  valueStart: number,
  name: string
): MaskedValue | undefined {
  const quote = text[valueStart]
  return quote === '"' || quote === "'"
    ? maskQuotedValueAt(text, valueStart, name, quote)
    : maskUnquotedValueAt(text, valueStart, name)
}

// A quoted value runs to its closing quote, or to the end of the text when
// truncation cut the quote off.
function maskQuotedValueAt(
  text: string,
  valueStart: number,
  name: string,
  quote: string
): MaskedValue | undefined {
  let end = valueStart + 1
  while (end < text.length && text[end] !== quote && text[end] !== "\n") {
    end += text[end] === "\\" ? 2 : 1
  }
  end = Math.min(end, text.length)

  const closed = text[end] === quote
  const inner = text.slice(valueStart + 1, end)
  if (!(inner && isRedactableEntry(name, inner))) {
    return undefined
  }

  const scheme = AUTH_SCHEME_PREFIX_PATTERN.exec(inner)?.[0] ?? ""
  return {
    end: closed ? end + 1 : end,
    replacement: `${quote}${scheme}${REDACTED_VALUE}${closed ? quote : ""}`,
  }
}

// "Cookie: a=1; b=2" in a log line or raw header dump: the value runs to the
// end of the line, not to the first ";", so every cookie value is masked.
function maskCookieLineAt(
  text: string,
  valueStart: number,
  name: string,
  separator: string
): MaskedValue | undefined {
  const lowerName = name.toLowerCase()
  const quote = text[valueStart]
  const isCookieHeader = lowerName === "cookie" || lowerName === "set-cookie"
  if (
    !(isCookieHeader && separator.includes(":")) ||
    quote === '"' ||
    quote === "'"
  ) {
    return undefined
  }

  const lineEnd = text.indexOf("\n", valueStart)
  const end = lineEnd === -1 ? text.length : lineEnd
  const rawValue = text.slice(valueStart, end)
  if (!rawValue.trim()) {
    return undefined
  }

  return {
    end,
    replacement: redactCookieHeader(rawValue, lowerName === "set-cookie"),
  }
}

function maskUnquotedValueAt(
  text: string,
  valueStart: number,
  name: string
): MaskedValue | undefined {
  let end = valueStart
  while (end < text.length && !UNQUOTED_VALUE_END.test(text[end] ?? "")) {
    end += 1
  }

  const rawValue = text.slice(valueStart, end).trim()
  if (!(rawValue && isRedactableEntry(name, parseScalar(rawValue)))) {
    return undefined
  }

  const scheme = AUTH_SCHEME_PREFIX_PATTERN.exec(rawValue)?.[0] ?? ""
  return { end, replacement: `${scheme}${REDACTED_VALUE}` }
}

function parseScalar(value: string): unknown {
  if (value === "true") return true
  if (value === "false") return false
  if (value === "null") return null

  const asNumber = Number(value)
  return Number.isFinite(asNumber) ? asNumber : value
}

// Cookie names stay readable and every value is masked. In Set-Cookie the
// attributes (Path, Expires and so on) are kept too. Cookie values cannot
// contain commas, so values combined with ", " still split correctly.
function redactCookieHeader(value: string, keepAttributes: boolean): string {
  if (!value.includes("=")) {
    return value.trim() ? REDACTED_VALUE : value
  }

  return value.replace(
    COOKIE_PAIR_PATTERN,
    (match, separator: string, name: string) =>
      keepAttributes && COOKIE_ATTRIBUTE_NAMES.has(name.toLowerCase())
        ? match
        : `${separator}${name}=${REDACTED_VALUE}`
  )
}

function isMultipartBody(body: string, contentType: string): boolean {
  return (
    contentType.toLowerCase().includes("multipart/") ||
    (body.startsWith("--") && MULTIPART_START_PATTERN.test(body))
  )
}

// "--" plus the boundary from the Content-Type, else the body's first line.
function multipartDelimiter(body: string, contentType: string): string {
  const boundary = MULTIPART_BOUNDARY_PATTERN.exec(contentType)?.[1]
  if (boundary) {
    return `--${boundary}`
  }
  const lineEnd = body.indexOf("\n")
  const firstLine = lineEnd === -1 ? body : body.slice(0, lineEnd)
  return firstLine.endsWith("\r") ? firstLine.slice(0, -1) : firstLine
}

// Walks the parts line by line (linear, no backtracking) and masks the value
// lines of parts whose field name is sensitive. Part headers stay readable.
// Only the delimiter line starts a new part, so a value line that happens to
// begin with "--" stays masked.
function redactMultipartBody(body: string, contentType: string): string {
  const delimiter = multipartDelimiter(body, contentType)
  const lines = body.split("\n")
  let fieldName: string | undefined
  let inHeaders = false
  let inValue = false

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? ""
    const text = line.endsWith("\r") ? line.slice(0, -1) : line
    if (text === delimiter || text === `${delimiter}--`) {
      inHeaders = true
      inValue = false
      fieldName = undefined
    } else if (inHeaders) {
      if (text === "") {
        inHeaders = false
        inValue = true
      } else {
        fieldName = MULTIPART_FIELD_NAME_PATTERN.exec(text)?.[1] ?? fieldName
      }
    } else if (inValue && text && fieldName && isSensitiveName(fieldName)) {
      lines[index] = line.endsWith("\r")
        ? `${REDACTED_VALUE}\r`
        : REDACTED_VALUE
    }
  }

  return lines.join("\n")
}

function redactFormBody(body: string): string {
  const params = new URLSearchParams(body)
  let changed = false
  for (const [key] of params.entries()) {
    if (isSensitiveName(key)) {
      params.set(key, REDACTED_VALUE)
      changed = true
    }
  }

  return changed ? params.toString() : redactText(body)
}

function parseJsonBody(body: string): unknown {
  const trimmed = body.trim()
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return undefined
  }

  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return undefined
  }
}
