import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  editorChords,
  TOOL_KEYS,
  toolForKey,
} from "../lib/annotation-shortcuts"

const normalise = (chord: string) =>
  chord
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .sort()
    .join("+")

function extensionCommandKeys(): string[] {
  const config = readFileSync(join(import.meta.dir, "../wxt.config.ts"), "utf8")
  return [
    ...config.matchAll(/(?:default|mac|windows|linux|chromeos):\s*"([^"]+)"/g),
  ].map((match) => match[1] as string)
}

describe("annotation editor shortcuts", () => {
  it("never collide with the extension commands in wxt.config.ts", () => {
    const commands = extensionCommandKeys()
    expect(commands.length).toBeGreaterThan(0)
    const taken = new Set(commands.map(normalise))
    for (const chord of editorChords()) {
      expect(taken.has(normalise(chord))).toBe(false)
    }
  })

  it("never use Alt, which every extension command requires", () => {
    for (const command of extensionCommandKeys()) {
      expect(normalise(command).split("+")).toContain("alt")
    }
    for (const chord of editorChords()) {
      expect(normalise(chord).split("+")).not.toContain("alt")
    }
  })

  it("gives every tool a distinct key", () => {
    const keys = Object.values(TOOL_KEYS)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("selects a tool only for an unmodified key", () => {
    const press = (key: string, mods: object = {}) =>
      toolForKey({
        key,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        ...mods,
      })
    expect(press("a")).toBe("arrow")
    expect(press("T")).toBe("text")
    expect(press("a", { altKey: true, shiftKey: true })).toBeNull()
    expect(press("r", { ctrlKey: true })).toBeNull()
    expect(press("z")).toBeNull()
  })
})
