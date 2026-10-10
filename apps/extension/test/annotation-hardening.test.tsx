import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { flushSync } from "react-dom"
import { createRoot, type Root } from "react-dom/client"
import { TextEntry } from "../components/annotate-step"
import { registerDomEnvironment } from "../happydom"
import { type DrawContext, drawAnnotation } from "../lib/annotation-render"
import { toolForKey } from "../lib/annotation-shortcuts"
import {
  type Annotation,
  addAnnotation,
  commitAnnotation,
  createAnnotationHistory,
  hitTest,
  MAX_TEXT_LENGTH,
  normalizeAnnotationText,
  redo,
  type ShapeKind,
  type TextAnnotation,
  translateHistory,
  undo,
} from "../lib/annotations"

const at = (x: number, y: number) => ({ x, y })
const base = { color: "#ef4444", width: 6 }
const drag = { isClick: false, tolerance: 0 }

describe("degenerate and invalid shapes", () => {
  const kinds: ShapeKind[] = ["line", "arrow", "rectangle", "ellipse"]
  for (const kind of kinds) {
    it(`${kind}: a drag that ends where it began adds nothing`, () => {
      const shape = {
        ...base,
        id: "z",
        kind,
        points: [at(50, 50), at(50, 50)],
      } as Annotation
      const history = createAnnotationHistory()
      expect(commitAnnotation(history, shape, drag)).toBe(history)
    })

    it(`${kind}: negative drag direction is hit like a positive one`, () => {
      const forward = {
        ...base,
        id: "f",
        kind,
        points: [at(10, 10), at(110, 80)],
      } as Annotation
      const backward = { ...forward, points: [at(110, 80), at(10, 10)] }
      for (const probe of [at(10, 10), at(110, 80), at(60, 45), at(500, 500)]) {
        expect(!!hitTest([forward], probe, 4)).toBe(
          !!hitTest([backward], probe, 4)
        )
      }
    })

    it(`${kind}: NaN, Infinity or missing points are rejected`, () => {
      const history = createAnnotationHistory()
      for (const points of [
        [at(Number.NaN, 0), at(5, 5)],
        [at(0, 0), at(Number.POSITIVE_INFINITY, 5)],
        [at(0, 0)],
        [],
      ]) {
        const shape = { ...base, id: "x", kind, points } as Annotation
        expect(commitAnnotation(history, shape, drag)).toBe(history)
      }
    })
  }

  it("hit-testing never throws or matches on malformed annotations", () => {
    const broken = [
      { ...base, id: "a", kind: "arrow", points: [] },
      { ...base, id: "b", kind: "rectangle", points: [at(1, 1)] },
      { ...base, id: "c", kind: "ellipse", points: [at(1, 1)] },
      { ...base, id: "d", kind: "text", text: "x", fontSize: 10, points: [] },
      { ...base, id: "e", kind: "line", points: [at(Number.NaN, 0), at(1, 1)] },
    ] as Annotation[]
    expect(hitTest(broken, at(-9999, 9999), 4)).toBeNull()
  })

  it("points outside the image can still be hit-tested", () => {
    const line: Annotation = {
      ...base,
      id: "l",
      kind: "line",
      points: [at(-50, 0), at(-10, 0)],
    }
    expect(hitTest([line], at(-30, 0), 2)?.id).toBe("l")
  })
})

describe("text normalisation", () => {
  it("drops empty and whitespace-only text", () => {
    for (const raw of ["", "   ", "\n\t ", " "]) {
      expect(normalizeAnnotationText(raw)).toBe("")
    }
  })

  it("turns line breaks into spaces and trims", () => {
    expect(normalizeAnnotationText("  a\nb\r\nc  ")).toBe("a b c")
  })

  it("caps length without splitting an emoji surrogate pair", () => {
    const text = normalizeAnnotationText("😀".repeat(MAX_TEXT_LENGTH + 50))
    expect(Array.from(text).length).toBe(MAX_TEXT_LENGTH)
    expect(text.at(-1)).not.toBe("\ud83d")
  })

  it("keeps RTL, combining and hostile strings verbatim as plain text", () => {
    for (const raw of [
      "مرحبا بالعالم",
      "é",
      "<img src=x onerror=alert(1)>",
      "__proto__",
      "../../etc/passwd",
    ]) {
      expect(normalizeAnnotationText(raw)).toBe(raw)
    }
  })
})

describe("text kept through a crop", () => {
  const text: TextAnnotation = {
    ...base,
    id: "t",
    kind: "text",
    text: "a long label",
    fontSize: 20,
    points: [at(0, 0)],
  }
  it("keeps text whose origin is cropped away but whose body is inside", () => {
    const history = addAnnotation(createAnnotationHistory(), text)
    const { history: moved, removed } = translateHistory(history, -50, 0, {
      width: 400,
      height: 300,
    })
    expect(removed).toBe(0)
    expect(moved.annotations).toHaveLength(1)
  })
  it("drops text whose whole box is outside", () => {
    const history = addAnnotation(createAnnotationHistory(), text)
    const { removed } = translateHistory(history, -5000, 0, {
      width: 400,
      height: 300,
    })
    expect(removed).toBe(1)
  })
})

describe("arrows survive into the rendered image", () => {
  function recorder() {
    const calls: string[] = []
    const ctx = new Proxy(
      {},
      {
        get:
          (_t, name: string) =>
          (...args: unknown[]) => {
            calls.push(
              `${name}:${args.map((a) => Math.round(Number(a))).join(",")}`
            )
          },
        set: () => true,
      }
    ) as unknown as DrawContext
    return { calls, ctx }
  }
  const arrow: Annotation = {
    ...base,
    id: "ar",
    kind: "arrow",
    points: [at(100, 100), at(200, 100)],
  }

  it("draws shaft and both wings", () => {
    const { calls, ctx } = recorder()
    drawAnnotation(ctx, arrow)
    expect(calls.filter((c) => c.startsWith("lineTo")).length).toBe(3)
    expect(calls).toContain("stroke:")
  })

  it("draws the same strokes, translated, after a crop", () => {
    const before = recorder()
    drawAnnotation(before.ctx, arrow)
    const { history } = translateHistory(
      addAnnotation(createAnnotationHistory(), arrow),
      -40,
      -10,
      { width: 300, height: 300 }
    )
    const after = recorder()
    drawAnnotation(after.ctx, history.annotations[0] as Annotation)
    expect(after.calls).toHaveLength(before.calls.length)
    expect(after.calls).toContain("moveTo:60,90")
    expect(after.calls).toContain("lineTo:160,90")
  })
})

describe("shortcut keys vs modifiers", () => {
  const key = (k: string, mods: Record<string, boolean> = {}) =>
    toolForKey({
      key: k,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      ...mods,
    })
  it("undo/redo chords and browser chords never switch tools", () => {
    expect(key("z", { ctrlKey: true })).toBeNull()
    expect(key("Z", { ctrlKey: true, shiftKey: true })).toBeNull()
    expect(key("y", { ctrlKey: true })).toBeNull()
    expect(key("y", { metaKey: true })).toBeNull()
    for (const k of ["a", "r", "t", "e", "l", "o", "p"]) {
      expect(key(k, { ctrlKey: true })).toBeNull()
      expect(key(k, { metaKey: true })).toBeNull()
    }
  })
  it("ignores non-letter and multi-character keys", () => {
    for (const k of ["", "Enter", "Process", "Dead", "Unidentified", " "]) {
      expect(key(k)).toBeNull()
    }
  })
})

describe("TextEntry", () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(async () => {
    await registerDomEnvironment()
  })
  afterEach(() => {
    root?.unmount()
    container?.remove()
  })

  function mount() {
    const onCommit = mock((_text: string) => undefined)
    const onCancel = mock(() => undefined)
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    flushSync(() => {
      root.render(
        <TextEntry left={1} onCancel={onCancel} onCommit={onCommit} top={1} />
      )
    })
    const input = container.querySelector("input") as HTMLInputElement
    return { input, onCommit, onCancel }
  }
  function type(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set
    setter?.call(input, value)
  }
  function keydown(input: HTMLInputElement, init: KeyboardEventInit) {
    flushSync(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          ...init,
        })
      )
    })
  }
  const blur = (input: HTMLInputElement) =>
    flushSync(() => {
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
    })

  it("Enter then blur commits exactly once", () => {
    const { input, onCommit } = mount()
    type(input, "hello")
    keydown(input, { key: "Enter" })
    blur(input)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit.mock.calls[0]?.[0]).toBe("hello")
  })

  it("Escape then blur never commits", () => {
    const { input, onCommit, onCancel } = mount()
    type(input, "secret")
    keydown(input, { key: "Escape" })
    blur(input)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it("repeated Enter commits once", () => {
    const { input, onCommit } = mount()
    type(input, "x")
    keydown(input, { key: "Enter" })
    keydown(input, { key: "Enter" })
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it("Enter while an IME is composing does not commit", () => {
    const { input, onCommit } = mount()
    type(input, "にほん")
    keydown(input, { key: "Enter", isComposing: true })
    keydown(input, { key: "Process" })
    expect(onCommit).not.toHaveBeenCalled()
    keydown(input, { key: "Enter" })
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it("limits input length", () => {
    const { input } = mount()
    expect(input.maxLength).toBe(MAX_TEXT_LENGTH)
  })
})

describe("stress", () => {
  const kinds = [
    "pen",
    "line",
    "arrow",
    "rectangle",
    "ellipse",
    "text",
  ] as const
  function make(i: number): Annotation {
    const kind = kinds[i % kinds.length] as (typeof kinds)[number]
    const a = at((i * 37) % 4000, (i * 91) % 3000)
    const b = at((i * 53) % 4000, (i * 17) % 3000)
    if (kind === "text") {
      return {
        ...base,
        id: `a${i}`,
        kind,
        text: `note ${i}`,
        fontSize: 24,
        points: [a],
      }
    }
    return { ...base, id: `a${i}`, kind, points: [a, b] } as Annotation
  }

  it("handles thousands of mixed annotations through undo/redo", () => {
    let history = createAnnotationHistory()
    const n = 3000
    for (let i = 0; i < n; i++) history = addAnnotation(history, make(i))
    expect(history.annotations).toHaveLength(n)
    for (let i = 0; i < n; i++) history = undo(history)
    expect(history.annotations).toHaveLength(0)
    for (let i = 0; i < n; i++) history = redo(history)
    expect(history.annotations.map((a) => a.id)).toEqual(
      Array.from({ length: n }, (_, i) => `a${i}`)
    )
  })

  it("hit-testing 5000 annotations stays fast (best of 5)", () => {
    const all = Array.from({ length: 5000 }, (_, i) => make(i))
    hitTest(all, at(1, 1), 4)
    let best = Number.POSITIVE_INFINITY
    for (let r = 0; r < 5; r++) {
      const t = performance.now()
      for (let q = 0; q < 20; q++) hitTest(all, at(q * 7, q * 11), 4)
      best = Math.min(best, performance.now() - t)
    }
    expect(best).toBeLessThan(2000)
  })
})
