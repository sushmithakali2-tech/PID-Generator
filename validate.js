// Process model and engineering rules. Mirrors the checks in the front end.
const PREFIX = { tank: "T", vessel: "V", pump: "P", hx: "E", valve: "HV", check: "CKV", cvT: "TV", cvF: "FV", cvP: "PV", cvL: "LV" };
export const NAMES = {
  tank: "Tank", vessel: "Vessel / reactor", pump: "Pump", hx: "Heat exchanger",
  valve: "Isolation valve", check: "Check valve",
  cvT: "Control valve (temp)", cvF: "Control valve (flow)", cvP: "Control valve (pressure)", cvL: "Control valve (level)",
};
const SERVICE = { T: "Temperature", F: "Flow", P: "Pressure", L: "Level" };
export const KINDS = Object.keys(PREFIX);
const typeOf = (k) => (k.startsWith("cv") ? "cv" : k);
const MEASURABLE = ["tank", "vessel", "hx", "pump"];

// Accepts [{k, psv}] and returns a clean list containing only known kinds.
export function sanitize(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((i) => i && KINDS.includes(i.k))
    .slice(0, 30)
    .map((i) => ({ k: i.k, psv: i.k === "vessel" && i.psv ? 1 : 0 }));
}

// Assigns tags (P-101, TV-101...) and derives instruments and control loops.
export function build(items) {
  const counters = {};
  const stream = items.map((it) => {
    const pf = PREFIX[it.k];
    counters[pf] = (counters[pf] || 100) + 1;
    const n = counters[pf];
    return { type: typeOf(it.k), tag: `${pf}-${n}`, num: n, letter: pf[0], psv: it.psv ? `PSV-${n}` : null, label: NAMES[it.k] };
  });
  const instruments = [];
  stream.forEach((s, i) => {
    if (s.type !== "cv") return;
    let j = -1;
    for (let q = i + 1; q < stream.length; q++) if (MEASURABLE.includes(stream[q].type)) { j = q; break; }
    if (j < 0) for (let q = i - 1; q >= 0; q--) if (MEASURABLE.includes(stream[q].type)) { j = q; break; }
    if (j >= 0) instruments.push({ tag: `${s.letter}T-${s.num}`, at: stream[j].tag, loop: `${s.letter}IC-${s.num}`, final: s.tag, service: SERVICE[s.letter] });
  });
  return { stream, instruments };
}

export function validate(items) {
  const { stream: S, instruments } = build(items);
  const out = [];
  S.forEach((it, i) => {
    const a = S[i - 1], b = S[i + 1], c = S[i + 2];
    if (it.type === "pump") {
      if (!a || a.type !== "valve") out.push({ level: "error", message: `${it.tag}: no isolation valve on suction` });
      if (!b || b.type !== "check") out.push({ level: "error", message: `${it.tag}: no check valve on discharge` });
      else if (!c || c.type !== "valve") out.push({ level: "error", message: `${it.tag}: no isolation valve on discharge` });
    }
    if (it.type === "vessel" && !it.psv) out.push({ level: "error", message: `${it.tag}: pressure vessel has no relief valve (PSV)` });
    if (it.type === "cv" && !instruments.some((n) => n.final === it.tag))
      out.push({ level: "warning", message: `${it.tag}: no equipment to measure, so no control loop was drawn` });
  });
  if (!S.length) out.push({ level: "warning", message: "Add equipment to start the drawing" });
  else if (!out.length) out.push({ level: "ok", message: "All checks passed." });
  return out;
}
