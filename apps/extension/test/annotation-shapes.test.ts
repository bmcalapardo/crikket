import { describe, expect, it } from "bun:test"
import { type DrawContext, drawAnnotation } from "../lib/annotation-render"
import {
  type Annotation,
  addAnnotation,
  arrowHead,
  commitAnnotation,
  createAnnotationHistory,
  deleteAnnotation,
  hitTest,
  redo,
  translateHistory,
  undo,
} from "../lib/annotations"

const base = { color: "#ef4444", width: 6 }
const at = (x: number, y: number) => ({ x, y })

const line: Annotation = {
  ...base,
  id: "line",
  kind: "line",
  points: [at(0, 0), at(100, 0)],
}
const arrow: Annotation = {
  ...base,
  id: "arrow",
  kind: "arrow",
  points: [at(0, 50), at(100, 50)],
}
const rectangle: Annotation = {
  ...base,
  id: "rect",
  kind: "rectangle",
  points: [at(200, 200), at(300, 260)],
}
const ellipse: Annotation = {
  ...base,
  id: "ellipse",
  kind: "ellipse",
  points: [at(400, 400), at(500, 460)],
}
const text: Annotation = {
  ...base,
  id: "text",
  kind: "text",
  text: "Broken",
  fontSize: 20,
  points: [at(600, 600)],
}
const all = [line, arrow, rectangle, ellipse, text]

function recorder() {
  const calls: string[] = []
  const rec = (name: string) => () => {
    calls.push(name)
  }
  const ctx = {
    beginPath: rec("beginPath"),
    moveTo: rec("moveTo"),
    lineTo: rec("lineTo"),
    stroke: rec("stroke"),
    arc: rec("arc"),
    fill: rec("fill"),
    save: rec("save"),
    restore: rec("restore"),
    clearRect: rec("clearRect"),
    closePath: rec("closePath"),
    ellipse: rec("ellipse"),
    fillText: rec("fillText"),
    strokeText: rec("strokeText"),
  } as unknown as DrawContext
  return { ctx, calls }
}

describe("shape hit-testing", () => {
  it("hits a line near its path and not away from it", () => {
    expect(hitTest([line], at(50, 2), 0)?.id).toBe("line")
    expect(hitTest([line], at(50, 30), 0)).toBeNull()
  })

  it("hits an arrow's shaft and its head, not beyond the tip", () => {
    expect(hitTest([arrow], at(40, 50), 0)?.id).toBe("arrow")
    const [, left] = arrowHead(at(0, 50), at(100, 50), 6)
    expect(hitTest([arrow], left, 0)?.id).toBe("arrow")
    expect(hitTest([arrow], at(130, 50), 0)).toBeNull()
  })

  it("hits a rectangle on its outline but not its interior", () => {
    expect(hitTest([rectangle], at(250, 200), 0)?.id).toBe("rect")
    expect(hitTest([rectangle], at(300, 230), 0)?.id).toBe("rect")
    expect(hitTest([rectangle], at(250, 230), 0)).toBeNull()
  })

  it("normalises a rectangle drawn right-to-left", () => {
    const flipped: Annotation = {
      ...rectangle,
      points: [at(300, 260), at(200, 200)],
    }
    expect(hitTest([flipped], at(250, 200), 0)?.id).toBe("rect")
  })

  it("hits an ellipse on its outline but not its centre", () => {
    expect(hitTest([ellipse], at(400, 430), 0)?.id).toBe("ellipse")
    expect(hitTest([ellipse], at(450, 400), 0)?.id).toBe("ellipse")
    expect(hitTest([ellipse], at(450, 430), 0)).toBeNull()
  })

  it("hits text anywhere in its box", () => {
    expect(hitTest([text], at(620, 610), 0)?.id).toBe("text")
    expect(hitTest([text], at(900, 610), 0)).toBeNull()
  })

  it("widens every shape's hit area by the tolerance", () => {
    expect(hitTest([line], at(50, 20), 0)).toBeNull()
    expect(hitTest([line], at(50, 20), 20)?.id).toBe("line")
  })
})

describe("shapes in history", () => {
  it("adds, undoes, redoes and deletes every kind", () => {
    let history = createAnnotationHistory()
    for (const annotation of all) history = addAnnotation(history, annotation)
    expect(history.annotations).toHaveLength(5)
    for (const annotation of all) {
      history = deleteAnnotation(history, annotation.id)
    }
    expect(history.annotations).toHaveLength(0)
    for (let i = 0; i < 10; i++) history = undo(history)
    expect(history.annotations).toEqual([])
    for (let i = 0; i < 10; i++) history = redo(history)
    expect(history.annotations).toEqual([])
  })

  it("deletes a shape by clicking it and restores it on undo", () => {
    const start = addAnnotation(createAnnotationHistory(), ellipse)
    const clicked = commitAnnotation(
      start,
      { ...line, id: "new", points: [at(400, 430)] },
      { isClick: true, tolerance: 0 }
    )
    expect(clicked.annotations).toHaveLength(0)
    expect(undo(clicked).annotations).toEqual([ellipse])
  })

  it("ignores a click on empty space for a shape but draws a pen dot", () => {
    const empty = createAnnotationHistory()
    const options = { isClick: true, tolerance: 0 }
    const none = commitAnnotation(
      empty,
      { ...line, points: [at(5, 5)] },
      options
    )
    expect(none.annotations).toHaveLength(0)
    const dot = commitAnnotation(
      empty,
      { ...base, id: "p", kind: "pen", points: [at(5, 5)] },
      options
    )
    expect(dot.annotations).toHaveLength(1)
  })

  it("translates every kind with a crop and keeps text", () => {
    const history = all.reduce(addAnnotation, createAnnotationHistory())
    const { history: moved } = translateHistory(history, -10, -20, null)
    expect(moved.annotations.map((a) => a.points[0])).toEqual(
      all.map((a) => at((a.points[0]?.x ?? 0) - 10, (a.points[0]?.y ?? 0) - 20))
    )
    const last = moved.annotations.at(-1)
    expect(last?.kind === "text" && last.text).toBe("Broken")
  })

  it("keeps the pen persistence shape", () => {
    const pen = { ...base, id: "p", kind: "pen" as const, points: [at(1, 2)] }
    expect(Object.keys(pen).sort()).toEqual(
      ["color", "id", "kind", "points", "width"].sort()
    )
    expect(JSON.parse(JSON.stringify(pen))).toEqual(pen)
  })
})

describe("shape rendering", () => {
  const draw = (annotation: Annotation) => {
    const { ctx, calls } = recorder()
    drawAnnotation(ctx, annotation)
    return calls
  }

  it("draws a line as one segment", () => {
    const calls = draw(line)
    expect(calls.filter((c) => c === "lineTo")).toHaveLength(1)
    expect(calls).toContain("stroke")
  })

  it("draws an arrow as a shaft plus a head", () => {
    const calls = draw(arrow)
    expect(calls.filter((c) => c === "lineTo")).toHaveLength(3)
    expect(calls.filter((c) => c === "stroke")).toHaveLength(1)
  })

  it("draws a rectangle as a closed path and an ellipse with ellipse()", () => {
    expect(draw(rectangle)).toContain("closePath")
    expect(draw(ellipse)).toContain("ellipse")
  })

  it("draws text with a halo then the fill", () => {
    const calls = draw(text)
    expect(calls.indexOf("strokeText")).toBeLessThan(calls.indexOf("fillText"))
  })

  it("draws nothing for empty text or an incomplete shape", () => {
    expect(draw({ ...text, text: "" } as Annotation)).not.toContain("fillText")
    expect(draw({ ...line, points: [at(1, 1)] })).not.toContain("stroke")
  })
})
