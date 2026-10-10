import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { TOGGLE_PAUSE_RECORDING_COMMAND } from "../lib/recorder-hotkey-commands"

// Reads the command declarations as text: importing wxt itself costs ~10s per test run.
const source = readFileSync(
  new URL("../lib/manifest-contract.ts", import.meta.url),
  "utf8"
)

function commandBlock(name: string): string {
  const start = source.indexOf(`"${name}": {`)
  if (start === -1) {
    throw new Error(`command ${name} is missing from lib/manifest-contract.ts`)
  }
  return source.slice(start, source.indexOf("\n      },", start))
}

describe("pause/resume extension command", () => {
  it("is declared with a description and no default key binding", () => {
    const block = commandBlock(TOGGLE_PAUSE_RECORDING_COMMAND)
    expect(block).toContain("description:")
    expect(block).not.toContain("suggested_key")
  })

  it("leaves the existing commands bound", () => {
    expect(commandBlock("start-video-recording")).toContain("suggested_key")
    expect(commandBlock("stop-video-recording")).toContain("suggested_key")
  })
})
