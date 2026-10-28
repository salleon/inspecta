import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import type { Mark } from "../db/types";
import { useBackHandler } from "../lib/backButton";
import { drawMark, labelBox, RED, rotateMark, rotatePhoto, rotatePhotoSafe, YELLOW } from "../lib/markup";
import "./PhotoTools.css";

// ✎ Mark up: draw on a photo. Two main tools:
//   ◯ Circle   tap to add a red circle; drag it to move, pinch (or the
//              mouse wheel) to size it, drag its side handles to make an oval
//   ↔ Measure  drag between two points: a yellow double arrow, then type
//              the measurement with its unit (650 mm, 1.2 m); drag its
//              ends to adjust, tap the number to change it
// and smaller: Arrow, Pen, Delete (the selected mark), Undo. ⟲ over the
// photo's corner turns it a quarter anticlockwise, marks and all.
// The photo itself is only changed if it's turned; the marks are kept apart.

type Tool = "circle" | "measure" | "arrow" | "pen";

interface Props {
  blob: Blob;
  marks: Mark[];
  onCancel: () => void;
  // blob: the photo turned with ⟲ (only when it was)
  onDone: (marks: Mark[], blob?: Blob) => void;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

type Drag =
  | { kind: "move"; i: number; start: Mark; px: number; py: number; moved: boolean }
  | { kind: "handle"; i: number; h: "x" | "y" }
  | { kind: "corner"; i: number; start: Extract<Mark, { t: "circle" }>; dist: number }
  | { kind: "end"; i: number; end: 0 | 1 }
  | { kind: "draw"; t: "measure" | "arrow"; x0: number; y0: number; moved: boolean }
  | { kind: "pen"; pts: [number, number][] }
  | { kind: "tap"; px: number; py: number };

const NEW_CIRCLE = 56; // px on screen

export default function MarkupEditor({ blob, marks: initial, onCancel, onDone }: Props) {
  const [url] = useState(() => URL.createObjectURL(blob));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  // ⟲ quarter turns anticlockwise, and the turned photo shown (a smaller copy)
  const [turns, setTurns] = useState(0);
  const [turnedUrl, setTurnedUrl] = useState<string | null>(null);
  // which undo steps were turns (their places in history)
  const turnSteps = useRef<number[]>([]);
  const finishing = useRef(false);
  useEffect(() => {
    if (turns % 4 === 0) {
      setTurnedUrl(null);
      return;
    }
    let live = true, made: string | null = null;
    rotatePhoto(blob, turns, 2000)
      .then((r) => {
        if (!live) return;
        made = URL.createObjectURL(r.blob);
        setTurnedUrl(made);
      })
      .catch(() => {});
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [blob, turns]);
  const shownUrl = turns % 4 ? turnedUrl : url;
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [area, setArea] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [marks, setMarks] = useState<Mark[]>(initial);
  const [history, setHistory] = useState<Mark[][]>([]);
  const [sel, setSel] = useState(-1);
  // null: no tool (its button tapped again), so taps only pick and change
  // the marks already there, never add one
  const [tool, setTool] = useState<Tool | null>("circle");
  const [editing, setEditing] = useState(-1); // measurement whose label is being typed
  const [draft, setDraft] = useState<Mark | null>(null);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; i: number; start: Extract<Mark, { t: "circle" }> } | null>(null);
  // where the cursor is in the measurement being typed (on the number pad)
  const [caret, setCaret] = useState(0);
  // the markup tools' height, so the photo makes room for the taller pad
  const toolsRef = useRef<HTMLDivElement>(null);
  const [toolsH, setToolsH] = useState(0);

  // Android back keeps the marks, like Done (Cancel throws them away)
  useBackHandler(() => {
    void finish();
    return true;
  });

  // Done (and Android back): the marks, and the photo turned if it was
  async function finish() {
    if (finishing.current) return;
    finishing.current = true;
    setEditing(-1);
    if (turns % 4 === 0) {
      onDone(marks);
      return;
    }
    const turned = await rotatePhotoSafe(blob, turns);
    if (turned) onDone(marks, turned);
    else {
      finishing.current = false;
      alert("Couldn't turn the photo on this phone");
    }
  }

  function rotate() {
    finishLabel();
    setSel(-1);
    turnSteps.current.push(history.length);
    commit(marks.map(rotateMark));
    setTurns((t) => t + 1);
    setNatural(null);
  }

  // the area the photo is shown in
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => setArea({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // where the photo sits in it (whole, centred)
  const rect: Rect | null = natural && area.w && area.h
    ? (() => {
        const s = Math.min(area.w / natural.w, area.h / natural.h);
        const width = natural.w * s, height = natural.h * s;
        return { left: (area.w - width) / 2, top: (area.h - height) / 2, width, height };
      })()
    : null;

  // draw
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !rect) return;
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(rect.width * dpr), H = Math.round(rect.height * dpr);
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, W, H);
    marks.forEach((m, i) => drawMark(g, m, W, H, i === editing));
    if (draft) drawMark(g, draft, W, H);
    const m = marks[sel];
    if (!m) return;
    // the selected mark's handles
    g.save();
    g.scale(dpr, dpr);
    const w = rect.width, h = rect.height;
    const dot = (x: number, y: number, ring: string) => {
      g.fillStyle = "#fff";
      g.beginPath();
      g.arc(x, y, 9, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = ring;
      g.lineWidth = 3;
      g.stroke();
    };
    if (m.t === "circle") {
      const cx = m.cx * w, cy = m.cy * h, rx = m.rx * w, ry = m.ry * h;
      // a soft glow round it says it's selected
      g.strokeStyle = "rgba(255,255,255,.22)";
      g.lineWidth = 12;
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      g.stroke();
      // slim pills on the edge to stretch it into an oval
      const pill = (x: number, y: number, upright: boolean) => {
        const pw = upright ? 7 : 24, ph = upright ? 24 : 7;
        g.fillStyle = "#fff";
        g.strokeStyle = "rgba(0,0,0,.3)";
        g.lineWidth = 1;
        g.beginPath();
        g.roundRect(x - pw / 2, y - ph / 2, pw, ph, 3.5);
        g.fill();
        g.stroke();
      };
      pill(cx + rx, cy, true);
      pill(cx - rx, cy, true);
      pill(cx, cy - ry, false);
      pill(cx, cy + ry, false);
      // the corner handle: drag it diagonally to size it, one-thumbed
      const c = cornerAt(m, w, h);
      const sx = Math.sign(c.x - cx) || 1, sy = Math.sign(c.y - cy) || 1;
      const r = drag.current?.kind === "corner" ? 16 : 14;
      g.fillStyle = "#fff";
      g.strokeStyle = "rgba(0,0,0,.3)";
      g.lineWidth = 1;
      g.beginPath();
      g.arc(c.x, c.y, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.strokeStyle = "#3a3a38";
      g.lineWidth = 2;
      g.lineCap = "round";
      g.lineJoin = "round";
      const a = 4.5;
      g.beginPath();
      g.moveTo(c.x - a * sx, c.y - a * sy);
      g.lineTo(c.x + a * sx, c.y + a * sy);
      g.moveTo(c.x - a * sx, c.y);
      g.lineTo(c.x - a * sx, c.y - a * sy);
      g.lineTo(c.x, c.y - a * sy);
      g.moveTo(c.x + a * sx, c.y);
      g.lineTo(c.x + a * sx, c.y + a * sy);
      g.lineTo(c.x, c.y + a * sy);
      g.stroke();
    } else if (m.t === "measure" || m.t === "arrow") {
      dot(m.x0 * w, m.y0 * h, m.t === "measure" ? YELLOW : RED);
      dot(m.x1 * w, m.y1 * h, m.t === "measure" ? YELLOW : RED);
    } else {
      const xs = m.pts.map((p) => p[0] * w), ys = m.pts.map((p) => p[1] * h);
      g.setLineDash([7, 6]);
      g.strokeStyle = "rgba(255,255,255,.9)";
      g.lineWidth = 1.5;
      g.strokeRect(Math.min(...xs) - 10, Math.min(...ys) - 10, Math.max(...xs) - Math.min(...xs) + 20, Math.max(...ys) - Math.min(...ys) + 20);
    }
    g.restore();
  });

  // the cursor starts at the end of what the measurement says
  useEffect(() => {
    const m = marks[editing];
    if (m?.t === "measure") setCaret(m.label.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  useLayoutEffect(() => {
    const el = toolsRef.current;
    if (!el) return;
    const measure = () => setToolsH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- the number pad: each key types at the cursor ----

  function setLabel(label: string, at: number) {
    setMarks((ms) => ms.map((m, i) => (i === editing && m.t === "measure" ? { ...m, label } : m)));
    setCaret(at);
  }
  function padKey(key: string) {
    const m = marks[editing];
    if (m?.t !== "measure") return;
    const t = m.label, c = Math.min(caret, t.length);
    if (key === "bs") {
      if (c > 0) setLabel(t.slice(0, c - 1) + t.slice(c), c - 1);
      return;
    }
    let add = key;
    // a decimal point that isn't after a number gets a 0 in front: .5 is 0.5
    if (key === "." && !(c > 0 && /[0-9]/.test(t[c - 1]))) add = "0.";
    // a unit goes in with a space before it (after a number)
    if ((key === "mm" || key === "cm" || key === "m") && c > 0 && t[c - 1] !== " ") add = " " + key;
    setLabel(t.slice(0, c) + add + t.slice(c), c + add.length);
  }
  // tap in the measurement's box: the cursor goes to the nearest gap
  function placeCaret(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const ch = (e.target as HTMLElement).closest<HTMLElement>("[data-i]");
    const m = marks[editing];
    if (m?.t !== "measure") return;
    if (!ch) {
      setCaret(m.label.length);
      return;
    }
    const r = ch.getBoundingClientRect(), i = Number(ch.dataset.i);
    setCaret(e.clientX > r.left + r.width / 2 ? i + 1 : i);
  }

  // ---- changes, with undo ----

  function commit(next: Mark[], before = marks) {
    setHistory((h) => [...h, before]);
    setMarks(next);
  }
  function undo() {
    finishLabel();
    if (!history.length) return;
    if (turnSteps.current[turnSteps.current.length - 1] === history.length - 1) {
      turnSteps.current.pop();
      setTurns((t) => t - 1);
      setNatural(null);
    }
    setMarks(history[history.length - 1]);
    setHistory(history.slice(0, -1));
    setSel(-1);
  }
  function remove() {
    if (sel < 0) return;
    setEditing(-1);
    commit(marks.filter((_, i) => i !== sel));
    setSel(-1);
  }
  function finishLabel() {
    if (editing < 0) return;
    setEditing(-1);
  }

  // ---- pointer work, in screen px within the photo ----

  function local(e: { clientX: number; clientY: number }) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // which mark (and which part of it) is at a point
  function hit(x: number, y: number): { i: number; part: "body" | "corner" | "hx" | "hy" | "end0" | "end1" | "label" } | null {
    if (!rect) return null;
    const w = rect.width, h = rect.height;
    // the selected one's handles first
    const s = marks[sel];
    if (s?.t === "circle") {
      const cx = s.cx * w, cy = s.cy * h, rx = s.rx * w, ry = s.ry * h;
      const c = cornerAt(s, w, h);
      if (Math.hypot(x - c.x, y - c.y) < 28) return { i: sel, part: "corner" };
      if (Math.hypot(x - (cx + rx), y - cy) < 22 || Math.hypot(x - (cx - rx), y - cy) < 22) return { i: sel, part: "hx" };
      if (Math.hypot(x - cx, y - (cy + ry)) < 22 || Math.hypot(x - cx, y - (cy - ry)) < 22) return { i: sel, part: "hy" };
    }
    if (s && (s.t === "measure" || s.t === "arrow")) {
      if (Math.hypot(x - s.x0 * w, y - s.y0 * h) < 24) return { i: sel, part: "end0" };
      if (Math.hypot(x - s.x1 * w, y - s.y1 * h) < 24) return { i: sel, part: "end1" };
    }
    const g = canvasRef.current!.getContext("2d")!;
    for (let i = marks.length - 1; i >= 0; i--) {
      const m = marks[i];
      if (m.t === "circle") {
        const cx = m.cx * w, cy = m.cy * h, rx = m.rx * w, ry = m.ry * h;
        const d = ((x - cx) / (rx + 18)) ** 2 + ((y - cy) / (ry + 18)) ** 2;
        if (d <= 1) return { i, part: "body" };
      } else if (m.t === "measure" || m.t === "arrow") {
        if (m.t === "measure" && m.label.trim()) {
          g.save();
          const b = labelBox(g, m, w, h);
          g.restore();
          if (x > b.x - 8 && x < b.x + b.w + 8 && y > b.y - 8 && y < b.y + b.h + 8) return { i, part: "label" };
        }
        if (nearSegment(x, y, m.x0 * w, m.y0 * h, m.x1 * w, m.y1 * h) < 18) return { i, part: "body" };
      } else if (m.pts.some((p, k) => k > 0 && nearSegment(x, y, m.pts[k - 1][0] * w, m.pts[k - 1][1] * h, p[0] * w, p[1] * h) < 16)) {
        return { i, part: "body" };
      }
    }
    return null;
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!rect) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      // pinch: size the selected circle (or the one being dragged)
      const i = drag.current && "i" in drag.current ? drag.current.i : sel;
      const m = marks[i];
      drag.current = null;
      setDraft(null);
      if (m?.t === "circle") {
        const [a, b] = [...pointers.current.values()];
        pinch.current = { dist: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), i, start: m };
        setHistory((h) => [...h, marks]);
      }
      return;
    }
    if (pointers.current.size > 2) return;
    finishLabel();
    const { x, y } = local(e);
    const fx = x / rect.width, fy = y / rect.height;
    const found = hit(x, y);
    if (found) {
      const m = marks[found.i];
      setSel(found.i);
      if (found.part === "corner" && m.t === "circle")
        drag.current = { kind: "corner", i: found.i, start: m, dist: Math.max(10, Math.hypot(x - m.cx * rect.width, y - m.cy * rect.height)) };
      else if (found.part === "hx" || found.part === "hy") drag.current = { kind: "handle", i: found.i, h: found.part === "hx" ? "x" : "y" };
      else if (found.part === "end0" || found.part === "end1") drag.current = { kind: "end", i: found.i, end: found.part === "end0" ? 0 : 1 };
      else drag.current = { kind: "move", i: found.i, start: m, px: x, py: y, moved: false };
      setHistory((h) => [...h, marks]);
      return;
    }
    if (tool === "measure" || tool === "arrow") drag.current = { kind: "draw", t: tool, x0: fx, y0: fy, moved: false };
    else if (tool === "pen") drag.current = { kind: "pen", pts: [[fx, fy]] };
    else if (!tool) drag.current = { kind: "tap", px: x, py: y };
    else drag.current = { kind: "tap", px: x, py: y };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!pointers.current.has(e.pointerId) || !rect) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pinch.current;
    if (p) {
      if (pointers.current.size < 2) return;
      const [a, b] = [...pointers.current.values()];
      const k = Math.hypot(a.x - b.x, a.y - b.y) / p.dist;
      setMarks((ms) => ms.map((m, i) => (i === p.i ? sizeCircle(p.start, k, rect) : m)));
      return;
    }
    const d = drag.current;
    if (!d) return;
    const { x, y } = local(e);
    const fx = clamp(x / rect.width), fy = clamp(y / rect.height);
    if (d.kind === "move") {
      if (!d.moved && Math.hypot(x - d.px, y - d.py) < 6) return;
      d.moved = true;
      const dx = (x - d.px) / rect.width, dy = (y - d.py) / rect.height;
      setMarks((ms) => ms.map((m, i) => (i === d.i ? shift(d.start, dx, dy) : m)));
    } else if (d.kind === "corner") {
      const k = Math.hypot(x - d.start.cx * rect.width, y - d.start.cy * rect.height) / d.dist;
      setMarks((ms) => ms.map((m, i) => (i === d.i ? sizeCircle(d.start, k, rect) : m)));
    } else if (d.kind === "handle") {
      setMarks((ms) =>
        ms.map((m, i) => {
          if (i !== d.i || m.t !== "circle") return m;
          return d.h === "x" ? { ...m, rx: Math.max(12 / rect.width, Math.abs(fx - m.cx)) } : { ...m, ry: Math.max(12 / rect.height, Math.abs(fy - m.cy)) };
        }),
      );
    } else if (d.kind === "end") {
      setMarks((ms) => ms.map((m, i) => (i === d.i && (m.t === "measure" || m.t === "arrow") ? (d.end ? { ...m, x1: fx, y1: fy } : { ...m, x0: fx, y0: fy }) : m)));
    } else if (d.kind === "draw") {
      if (!d.moved && Math.hypot(fx * rect.width - d.x0 * rect.width, fy * rect.height - d.y0 * rect.height) < 8) return;
      d.moved = true;
      setDraft(d.t === "measure" ? { t: "measure", x0: d.x0, y0: d.y0, x1: fx, y1: fy, label: "" } : { t: "arrow", x0: d.x0, y0: d.y0, x1: fx, y1: fy });
    } else if (d.kind === "pen") {
      d.pts.push([fx, fy]);
      setDraft({ t: "pen", pts: [...d.pts] });
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    const d = drag.current;
    drag.current = null;
    if (!d || !rect) return;
    if (d.kind === "move") {
      // a tap on a measurement's number: type it again
      const m = marks[d.i];
      if (!d.moved) {
        setHistory((h) => h.slice(0, -1));
        if (m?.t === "measure") setEditing(d.i);
      }
    } else if (d.kind === "draw") {
      setDraft(null);
      if (!d.moved) {
        setSel(-1);
        return;
      }
      const { x, y } = local(e);
      const x1 = clamp(x / rect.width), y1 = clamp(y / rect.height);
      const mark: Mark = d.t === "measure" ? { t: "measure", x0: d.x0, y0: d.y0, x1, y1, label: "" } : { t: "arrow", x0: d.x0, y0: d.y0, x1, y1 };
      commit([...marks, mark]);
      setSel(marks.length);
      if (d.t === "measure") setEditing(marks.length);
    } else if (d.kind === "pen") {
      setDraft(null);
      if (d.pts.length > 1) {
        commit([...marks, { t: "pen", pts: d.pts }]);
        setSel(-1);
      }
    } else if (d.kind === "tap") {
      if (sel >= 0 || !tool) {
        // a tap off the selected mark just lets go of it (and with no
        // tool, nothing is added)
        setSel(-1);
        return;
      }
      const r = NEW_CIRCLE;
      commit([...marks, { t: "circle", cx: d.px / rect.width, cy: d.py / rect.height, rx: r / rect.width, ry: r / rect.height }]);
      setSel(marks.length);
    }
  }

  function onWheel(e: ReactWheelEvent<HTMLCanvasElement>) {
    const m = marks[sel];
    if (m?.t !== "circle" || !rect) return;
    const k = Math.exp(-e.deltaY / 400);
    setMarks((ms) => ms.map((x, i) => (i === sel ? sizeCircle(m, k, rect) : x)));
  }

  // tapping the tool that's on turns it off
  function pickTool(t: Tool) {
    finishLabel();
    setTool(tool === t ? null : t);
    setSel(-1);
  }

  const editingMark = marks[editing];
  // the typing box sits where the label will be drawn (bumped below a short line)
  const labelAt = (() => {
    if (editingMark?.t !== "measure" || !rect) return null;
    const g = measureCtx();
    if (!g) return { left: rect.left + ((editingMark.x0 + editingMark.x1) / 2) * rect.width, top: rect.top + ((editingMark.y0 + editingMark.y1) / 2) * rect.height };
    const b = labelBox(g, { ...editingMark, label: editingMark.label.trim() || "00 cm" }, rect.width, rect.height);
    return { left: rect.left + b.x + b.w / 2, top: rect.top + b.y + b.h / 2 };
  })();

  return (
    <div className="mk-ed" data-testid="markup-editor">
      <div className="mk-top">
        <button onClick={onCancel}>Cancel</button>
        <span className="t">Mark up</span>
        <button
          className="go"
          onClick={() => void finish()}
        >
          Done
        </button>
      </div>
      <div className="mk-area" ref={areaRef} style={{ marginBottom: editing >= 0 ? `max(0px, calc(${PAD_H}px + var(--sa-bottom) - ${toolsH}px))` : 0 }}>
        <img
          key={shownUrl ?? ""}
          src={shownUrl ?? undefined}
          alt=""
          onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          style={rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : { opacity: 0 }}
        />
        {rect && (
          <canvas
            ref={canvasRef}
            data-testid="markup-canvas"
            style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          />
        )}
        {rect && (
          <button
            className="mk-rotate"
            aria-label="Rotate"
            style={{ left: rect.left + rect.width - 52, top: rect.top + rect.height - 52 }}
            onClick={rotate}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12a8 8 0 1 0 2.4-5.7" />
              <path d="M4 4v4.5h4.5" />
            </svg>
          </button>
        )}
        {labelAt && editingMark?.t === "measure" && (
          <div className="mk-label" data-testid="measure-label" style={{ left: labelAt.left, top: labelAt.top }} onPointerDown={placeCaret}>
            {[...editingMark.label].map((ch, i) => (
              <span key={i} data-i={i}>
                {i === caret && <i className="mk-caret" />}
                {ch}
              </span>
            ))}
            {caret >= editingMark.label.length && <i className="mk-caret" />}
          </div>
        )}
      </div>
      <div ref={toolsRef} className="mk-bottom">
      <div className="mk-tools">
        <div className="mk-big">
          <button className={`mk-bt${tool === "circle" ? " on" : ""}`} aria-pressed={tool === "circle"} onClick={() => pickTool("circle")}>
            <svg viewBox="0 0 32 32" fill="none" stroke={RED} strokeWidth="3">
              <ellipse cx="16" cy="16" rx="12" ry="10" />
            </svg>
            <span>
              <b>Circle</b>
              <i>Tap to add · pinch to size</i>
            </span>
          </button>
          <button className={`mk-bt${tool === "measure" ? " on" : ""}`} aria-pressed={tool === "measure"} onClick={() => pickTool("measure")}>
            <svg viewBox="0 0 32 32" fill="none" stroke={YELLOW} strokeWidth="2.6" strokeLinecap="round">
              <path d="M5 22 27 10" />
              <path d="M5 22l6.5-.6M5 22l3.4-5.6M27 10l-6.5.6M27 10l-3.4 5.6" />
            </svg>
            <span>
              <b>Measure</b>
              <i>Drag between two points</i>
            </span>
          </button>
        </div>
        <div className="mk-row">
          <button className={`mk-small${tool === "arrow" ? " on" : ""}`} aria-pressed={tool === "arrow"} onClick={() => pickTool("arrow")}>
            ↗ Arrow
          </button>
          <button className={`mk-small${tool === "pen" ? " on" : ""}`} aria-pressed={tool === "pen"} onClick={() => pickTool("pen")}>
            ✎ Pen
          </button>
          <span className="sp" />
          <button className={`mk-act${sel < 0 ? " off" : ""}`} disabled={sel < 0} onClick={remove}>
            🗑 Delete
          </button>
          <button className={`mk-act${history.length ? "" : " off"}`} disabled={!history.length} onClick={undo}>
            ↶ Undo
          </button>
        </div>
      </div>
    </div>
      <MeasurePad open={editing >= 0} onKey={padKey} onDone={finishLabel} />
    </div>
  );
}

// the number pad's height (above the phone's own bottom bar)
const PAD_H = 340;

// After drawing a measurement: a yellow number pad in place of the phone's
// keyboard (mm / cm / m, < >, the numbers, ⌫), sliding up over the markup
// tools like the flow test keypad. Every key types at the cursor in the
// measurement's box on the photo.
function MeasurePad({ open, onKey, onDone }: { open: boolean; onKey: (k: string) => void; onDone: () => void }) {
  // each key presses in (and springs back) however quickly it's tapped
  function press(e: ReactPointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    const el = e.currentTarget;
    el.classList.remove("pressed");
    void el.offsetWidth;
    el.classList.add("pressed");
  }
  const key = (k: string, label: string = k, cls = "") => (
    <button
      key={k}
      type="button"
      tabIndex={-1}
      className={`mp-key${cls}`}
      data-key={k}
      onPointerDown={(e) => {
        press(e);
        if (k === "ok") onDone();
        else onKey(k);
      }}
    >
      {label}
    </button>
  );
  return (
    <div className={open ? "mp" : "mp off"} style={{ height: `calc(${PAD_H}px + var(--sa-bottom))` }} aria-hidden={!open} data-testid="measure-pad">
      <div className="mp-units">{["mm", "cm", "m"].map((u) => key(u, u, " unit"))}</div>
      <div className="mp-keys">
        {key("7")}
        {key("8")}
        {key("9")}
        {key("<", "<", " ins")}
        {key("4")}
        {key("5")}
        {key("6")}
        {key(">", ">", " ins")}
        {key("1")}
        {key("2")}
        {key("3")}
        {key("bs", "⌫", " fn bs")}
        {key(".", ".", " fn")}
        {key("0")}
        {key("ok", "Done ✓", " ok")}
      </div>
    </div>
  );
}

function clamp(v: number) {
  return Math.min(1, Math.max(0, v));
}

function nearSegment(x: number, y: number, x0: number, y0: number, x1: number, y1: number) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len)) : 0;
  return Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy));
}

function shift(m: Mark, dx: number, dy: number): Mark {
  if (m.t === "circle") return { ...m, cx: m.cx + dx, cy: m.cy + dy };
  if (m.t === "pen") return { ...m, pts: m.pts.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
  return { ...m, x0: m.x0 + dx, y0: m.y0 + dy, x1: m.x1 + dx, y1: m.y1 + dy };
}

function sizeCircle(m: Extract<Mark, { t: "circle" }>, k: number, rect: Rect): Mark {
  const min = 12;
  return { ...m, rx: Math.max(min / rect.width, m.rx * k), ry: Math.max(min / rect.height, m.ry * k) };
}

// a scratch canvas just for measuring label text
let scratch: CanvasRenderingContext2D | null | undefined;
function measureCtx() {
  if (scratch === undefined) scratch = document.createElement("canvas").getContext("2d");
  return scratch;
}

// where a circle's corner handle goes: on its edge, bottom-right, or the
// next corner round that's still on the photo (so a thumb can reach it)
function cornerAt(m: Extract<Mark, { t: "circle" }>, w: number, h: number) {
  const cx = m.cx * w, cy = m.cy * h, dx = m.rx * w * Math.SQRT1_2, dy = m.ry * h * Math.SQRT1_2, pad = 16;
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const x = cx + sx * dx, y = cy + sy * dy;
    if (x > pad && x < w - pad && y > pad && y < h - pad) return { x, y };
  }
  return { x: Math.min(Math.max(cx + dx, pad), w - pad), y: Math.min(Math.max(cy + dy, pad), h - pad) };
}
