import {
  CONSOLE_ERROR_MESSAGE,
  FAKE_API_KEY,
  FAKE_PASSWORD,
  FAKE_TOKEN,
  LONG_PAGE_HEIGHT_PX,
  LONG_PAGE_SECTION_COUNT,
  LONG_PAGE_SECTION_HEIGHT_PX,
  SENSITIVE_CONSOLE_LINES,
} from "./fixtures"

export interface Scenario {
  description: string
  path: string
  slug: string
  title: string
}

export const SCENARIOS: readonly Scenario[] = [
  {
    slug: "working",
    title: "Working UI",
    description: "Nothing is wrong. A control group for a clean report.",
  },
  {
    slug: "console-error",
    title: "Console error",
    description: "Logs exactly one console.error when the page loads.",
  },
  {
    slug: "network-500",
    title: "Network 500",
    description: "Requests /api/error on load; it always returns 500.",
  },
  {
    slug: "slow",
    title: "Slow request",
    description: "Requests /api/slow on load; it answers after ?ms= (3000).",
  },
  {
    slug: "broken-image",
    title: "Broken image",
    description: "Renders an image whose URL always returns 404.",
  },
  {
    slug: "form-failure",
    title: "Form failure",
    description: "A form whose submit always fails with a 422.",
  },
  {
    slug: "long-page",
    title: "Long page",
    description: "A fixed-height page for scroll-and-stitch capture.",
  },
  {
    slug: "sensitive",
    title: "Sensitive data",
    description: "Emits a fake token, cookie and password for Redaction.",
  },
].map((scenario) => ({ ...scenario, path: `/scenarios/${scenario.slug}` }))

const STYLES = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; color: #1a1a1a; background: #fff; }
  main { max-width: 720px; margin: 0 auto; padding: 24px 16px; }
  a { color: #0b5cad; }
  button { font: inherit; padding: 8px 16px; cursor: pointer; }
  input { font: inherit; padding: 8px; display: block; margin: 4px 0 12px; width: 100%; }
  .error { color: #b00020; }
  .section { border-bottom: 1px solid #ccc; padding: 16px; }
`

// Inline script bodies are kept as plain strings so the tests can run the
// exact code a page ships.
function layout(title: string, body: string, script?: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} - Crikket QA fixtures</title>
<style>${STYLES}</style>
</head>
<body>
<main>
<p><a href="/">All scenarios</a></p>
<h1>${title}</h1>
${body}
</main>
${script ? `<script>${script}</script>` : ""}
</body>
</html>`
}

export function indexPage(): string {
  const items = SCENARIOS.map(
    (scenario) =>
      `<li><a href="${scenario.path}">${scenario.title}</a>: ${scenario.description}</li>`
  ).join("\n")
  return layout(
    "Crikket QA fixtures",
    `<p>A known-bad site to point Crikket at. Every problem here is deliberate and repeatable.</p>\n<ul>\n${items}\n</ul>`
  )
}

export const WORKING_SCRIPT = `
var count = 0;
var button = document.getElementById("counter");
button.addEventListener("click", function () {
  count += 1;
  button.textContent = "Clicked " + count + " times";
});
`

export function workingPage(): string {
  return layout(
    "Working UI",
    `<p>Everything on this page works.</p>\n<button id="counter" type="button">Clicked 0 times</button>`,
    WORKING_SCRIPT
  )
}

export const CONSOLE_ERROR_SCRIPT = `console.error(${JSON.stringify(CONSOLE_ERROR_MESSAGE)});`

export function consoleErrorPage(): string {
  return layout(
    "Console error",
    "<p>Open the console: one error was logged when this page loaded.</p>",
    CONSOLE_ERROR_SCRIPT
  )
}

function fetchStatusScript(url: string): string {
  return `
var out = document.getElementById("result");
fetch(${JSON.stringify(url)}).then(function (response) {
  out.textContent = "Response status: " + response.status;
}).catch(function () {
  out.textContent = "Request failed";
});
`
}

export const NETWORK_500_SCRIPT = fetchStatusScript("/api/error")

export function network500Page(): string {
  return layout(
    "Network 500",
    `<p>This page requests <code>/api/error</code>, which always returns 500.</p>\n<p id="result">Loading...</p>`,
    NETWORK_500_SCRIPT
  )
}

export function slowPage(ms: number): string {
  return layout(
    "Slow request",
    `<p>This page requests <code>/api/slow?ms=${ms}</code>. Add <code>?ms=</code> to this URL to change the delay (capped).</p>\n<p id="result">Loading...</p>`,
    fetchStatusScript(`/api/slow?ms=${ms}`)
  )
}

export function brokenImagePage(): string {
  return layout(
    "Broken image",
    `<p>The image below always fails to load.</p>\n<img src="/assets/missing.png" alt="Intentionally missing image" width="320" height="180">`
  )
}

export const FORM_FAILURE_SCRIPT = `
var form = document.getElementById("signup");
var out = document.getElementById("form-error");
form.addEventListener("submit", function (event) {
  event.preventDefault();
  fetch("/api/form", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: form.elements.email.value }),
  }).then(function (response) {
    return response.json();
  }).then(function (data) {
    out.textContent = data.errors.email;
  });
});
`

export function formFailurePage(): string {
  return layout(
    "Form failure",
    `<form id="signup">
<label for="email">Email</label>
<input id="email" name="email" type="email" value="tester@example.com">
<button type="submit">Submit</button>
<p id="form-error" class="error" role="alert"></p>
</form>`,
    FORM_FAILURE_SCRIPT
  )
}

export function longPage(): string {
  const sections = Array.from(
    { length: LONG_PAGE_SECTION_COUNT },
    (_, index) =>
      `<section class="section" style="height:${LONG_PAGE_SECTION_HEIGHT_PX}px"><h2>Section ${index + 1} of ${LONG_PAGE_SECTION_COUNT}</h2><p>Marker ${index + 1}: scroll-and-stitch should show every section once, in order.</p></section>`
  ).join("\n")
  // The wrapper has a fixed height; the document is that plus the header.
  return layout(
    "Long page",
    `<div id="long-content" style="height:${LONG_PAGE_HEIGHT_PX}px">
${sections}
</div>`
  )
}

export const SENSITIVE_SCRIPT = `
${SENSITIVE_CONSOLE_LINES.map((line) => `console.log(${JSON.stringify(line)});`).join("\n")}
fetch("/api/sensitive?api_key=" + ${JSON.stringify(FAKE_API_KEY)}, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: "Bearer " + ${JSON.stringify(FAKE_TOKEN)},
  },
  body: JSON.stringify({ username: "qa-fixture-user", password: ${JSON.stringify(FAKE_PASSWORD)} }),
});
`

export function sensitivePage(): string {
  return layout(
    "Sensitive data",
    `<p>All values here are synthetic. Capture this page and check the report masks them.</p>
<form onsubmit="return false">
<label for="username">Username</label>
<input id="username" name="username" value="qa-fixture-user" autocomplete="off">
<label for="password">Password</label>
<input id="password" name="password" type="password" value="${FAKE_PASSWORD}" autocomplete="off">
</form>`,
    SENSITIVE_SCRIPT
  )
}
