/* Study runtime: renders one course as Compendium | Drill (Practice, Mock exam,
   Flashcards). Shared by the builder page and by exported standalone files,
   so it depends on nothing outside this script. */
(function(){
"use strict";

/* ---------- utilities ---------- */
const U = {};
U.esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const OK_TAGS = new Set(["B","STRONG","EM","I","CODE","SUB","SUP","BR","P","UL","OL","LI","SPAN","DIV","U"]);
const OK_CLASS = new Set(["mono","eg","why","al"]);
/* Generated text comes from Claude reading the user's files, so it is never
   trusted as markup: rebuild it from an allowlist of inline tags. */
U.san = function(html){
  if (html == null) return "";
  html = String(html);
  if (!/[<&]/.test(html)) return U.mathText(html);
  const doc = new DOMParser().parseFromString("<body>" + html + "</body>", "text/html");
  const walk = node => {
    let out = "";
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) { out += U.mathText(n.nodeValue); return; }
      if (n.nodeType !== 1) return;
      const t = n.tagName;
      if (t === "SCRIPT" || t === "STYLE" || t === "TEMPLATE") return;
      if (!OK_TAGS.has(t)) { out += walk(n); return; }
      if (t === "BR") { out += "<br>"; return; }
      const cls = (n.getAttribute("class") || "").split(/\s+/).filter(c => OK_CLASS.has(c)).join(" ");
      const tag = t.toLowerCase();
      out += "<" + tag + (cls ? ' class="' + cls + '"' : "") + ">" + walk(n) + "</" + tag + ">";
    });
    return out;
  };
  return walk(doc.body);
};
/* A small, safe calculator: numbers, + - * / ^, brackets, the usual functions
   and constants, and named variables. No access to anything else. Used to
   check Claude's numbers, to grade numeric answers and to draw plots. */
U.calc = function(expr, vars){
  const s = String(expr == null ? "" : expr).replace(/\s+/g, "").replace(/[×·⋅]/g, "*").replace(/[−–]/g, "-").replace(/\*\*/g, "^").replace(/÷/g, "/");
  if (!s || s.length > 600) throw new Error("bad expression");
  const FN = { sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, sqrt: Math.sqrt, cbrt: Math.cbrt, exp: Math.exp, ln: Math.log, log: Math.log10,
    log10: Math.log10, log2: Math.log2, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, min: Math.min, max: Math.max, pow: Math.pow };
  const K = { pi: Math.PI, "π": Math.PI, e: Math.E, deg: Math.PI / 180 };
  const V = vars || {};
  let i = 0, depth = 0;
  const peek = () => s[i];
  const num = () => { const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i)); if (!m) return null; i += m[0].length; return parseFloat(m[0]); };
  const ident = () => { const m = /^[A-Za-zα-ωΑ-Ωπ_][A-Za-z0-9α-ωΑ-Ω_]*/.exec(s.slice(i)); if (!m) return null; i += m[0].length; return m[0]; };
  const startsPrimary = () => { const c = peek(); return c != null && /[0-9.A-Za-zα-ωΑ-Ωπ_(]/.test(c); };
  function primary(){
    if (++depth > 200) throw new Error("too deep");
    const c = peek();
    if (c === "(") { i++; const v = sum(); if (peek() !== ")") throw new Error("missing )"); i++; depth--; return v; }
    let v = num(); if (v != null) { depth--; return v; }
    const id = ident(); if (id == null) throw new Error("unexpected " + (c || "end"));
    if (peek() === "(" && Object.prototype.hasOwnProperty.call(FN, id)) {
      i++; const args = [sum()]; while (peek() === ",") { i++; args.push(sum()); }
      if (peek() !== ")") throw new Error("missing )"); i++; depth--; return FN[id](...args);
    }
    if (Object.prototype.hasOwnProperty.call(V, id)) { depth--; return +V[id]; }
    if (Object.prototype.hasOwnProperty.call(K, id)) { depth--; return K[id]; }
    throw new Error("unknown name " + id);
  }
  function power(){ const b = primary(); if (peek() === "^") { i++; return Math.pow(b, unary()); } return b; }
  function unary(){ const c = peek(); if (c === "-") { i++; return -unary(); } if (c === "+") { i++; return unary(); } return power(); }
  function term(){
    let v = unary();
    for (;;) {
      const c = peek();
      if (c === "*") { i++; v *= unary(); } else if (c === "/") { i++; v /= unary(); }
      else if (startsPrimary()) v *= unary();     // implicit: 2pi, 3(x+1)
      else return v;
    }
  }
  function sum(){ let v = term(); for (;;) { const c = peek(); if (c === "+") { i++; v += term(); } else if (c === "-") { i++; v -= term(); } else return v; } }
  const v = sum();
  if (i !== s.length) throw new Error("unexpected " + s[i]);
  return v;
};
/* A number as a person would write it: 4 significant figures, ×10ⁿ when needed. */
U.fmtNum = (x, sig) => {
  if (!isFinite(x)) return String(x);
  sig = sig || 4;
  const a = Math.abs(x);
  if (a !== 0 && (a >= 1e6 || a < 1e-3)) {
    const [m, e] = x.toExponential(sig - 1).split("e");
    return `${String(+m).replace(".", ".")} × 10<sup>${+e}</sup>`;
  }
  return String(+x.toPrecision(sig));
};
/* Read what a student typed: 1,5 · 1.5e3 · 1.5×10^3 · 3/4 · 2pi */
U.parseNum = str => {
  let t = String(str || "").trim().replace(/[ \s]+/g, "");
  if (!t) return NaN;
  t = t.replace(/^([-+0-9.,eE*^/()×·x]+?)[A-Za-zΩ°%µμ²³/]*$/, "$1");   // drop a unit typed after the number
  if (/^-?\d+,\d+$/.test(t)) t = t.replace(",", ".");
  t = t.replace(/(\d),(\d{3})(?!\d)/g, "$1$2").replace(/[×·x]10\^?/i, "*10^");
  try { const v = U.calc(t); return isFinite(v) ? v : NaN; } catch(e){ return parseFloat(t); }
};
U.close = (got, want, tol) => {
  if (!isFinite(got) || !isFinite(want)) return false;
  const rel = tol == null ? 0.01 : +tol;
  if (want === 0) return Math.abs(got) <= Math.max(1e-9, rel);
  return Math.abs(got - want) <= Math.abs(want) * rel + 1e-12;
};

/* Formulas: \( … \) inline, \[ … \] or $$ … $$ on their own line. KaTeX turns them
   into MathML, which browsers draw natively, so no fonts or stylesheet are needed.
   It is loaded only once a page actually contains a formula. */
const MATH_RX = /\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$|\\\(([\s\S]+?)\\\)/g;
U._mathCbs = [];
U.onMath = fn => { U._mathCbs.push(fn); };
U.loadMath = () => {
  if (window.katex || U._mathLoading) return;
  U._mathLoading = true;
  const sc = document.createElement("script");
  sc.src = window.TP_KATEX_URL || "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js";
  sc.onload = () => { U._mathCbs.forEach(fn => { try { fn(); } catch(e){} }); };
  sc.onerror = () => { U._mathLoading = false; };
  document.head.append(sc);
};
U.mathText = raw => {
  raw = String(raw == null ? "" : raw);
  if (!/\\\(|\\\[|\$\$/.test(raw)) return U.esc(raw);
  if (!window.katex) { U.loadMath(); return U.esc(raw); }
  let out = "", last = 0;
  raw.replace(MATH_RX, (m, d1, d2, inl, at) => {
    out += U.esc(raw.slice(last, at)); last = at + m.length;
    const tex = d1 != null ? d1 : d2 != null ? d2 : inl, display = inl == null;
    try { out += `<span class="${display ? "mathd" : "math"}">${window.katex.renderToString(tex, { displayMode: display, output: "mathml", throwOnError: false, strict: "ignore", trust: false, maxSize: 20, maxExpand: 300 })}</span>`; }
    catch(e){ out += U.esc(m); }
    return m;
  });
  return out + U.esc(raw.slice(last));
};
U.plain = s => String(s || "").replace(/\\\(|\\\)|\\\[|\\\]|\$\$/g, "");

/* Plots are drawn by the page from the formula, so the curve is exact. */
U.plotSVG = function(p){
  const W = 640, Hh = 360, L = 56, R = 24, T = 18, B = 46, pw = W - L - R, ph = Hh - T - B;
  const fns = (p.fns || []).slice(0, 4), pts = (p.points || []).filter(a => Array.isArray(a) && isFinite(a[0]) && isFinite(a[1])).slice(0, 200);
  let [x0, x1] = Array.isArray(p.x) && isFinite(p.x[0]) && isFinite(p.x[1]) && p.x[1] > p.x[0] ? p.x.map(Number) : [-5, 5];
  const N = 240, series = fns.map(f => { const out = []; for (let k = 0; k <= N; k++) { const x = x0 + (x1 - x0) * k / N; let y; try { y = U.calc(f.expr, Object.assign({ x }, p.params || {})); } catch(e){ y = NaN; } out.push([x, y]); } return out; });
  let y0, y1;
  if (Array.isArray(p.y) && isFinite(p.y[0]) && isFinite(p.y[1]) && p.y[1] > p.y[0]) [y0, y1] = p.y.map(Number);
  else {
    const ys = series.flat().map(a => a[1]).concat(pts.map(a => a[1])).filter(isFinite).sort((a, b) => a - b);
    if (!ys.length) return "";
    y0 = ys[Math.floor(ys.length * 0.02)]; y1 = ys[Math.ceil(ys.length * 0.98) - 1];
    if (y0 === y1) { y0 -= 1; y1 += 1; }
    const pad = (y1 - y0) * 0.08; y0 -= pad; y1 += pad;
    if (y0 > 0 && y0 < (y1 - y0) * 0.5) y0 = 0; if (y1 < 0 && -y1 < (y1 - y0) * 0.5) y1 = 0;
  }
  const sx = x => L + (x - x0) / (x1 - x0) * pw, sy = y => T + (1 - (y - y0) / (y1 - y0)) * ph;
  const nice = (a, b) => { const span = b - a, raw = span / 6, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag; const st = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag; const out = []; for (let v = Math.ceil(a / st) * st; v <= b + st * 1e-9; v += st) out.push(+v.toPrecision(12)); return out; };
  const fmt = v => Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(1) : String(+v.toPrecision(6));
  let g = "";
  nice(x0, x1).forEach(v => { g += `<line class="l-muted" x1="${sx(v)}" y1="${T}" x2="${sx(v)}" y2="${T + ph}" stroke-width="0.6"></line><text class="t-small t-muted" x="${sx(v)}" y="${T + ph + 16}" text-anchor="middle">${fmt(v)}</text>`; });
  nice(y0, y1).forEach(v => { g += `<line class="l-muted" x1="${L}" y1="${sy(v)}" x2="${L + pw}" y2="${sy(v)}" stroke-width="0.6"></line><text class="t-small t-muted" x="${L - 6}" y="${sy(v)}" text-anchor="end" dominant-baseline="middle">${fmt(v)}</text>`; });
  if (y0 < 0 && y1 > 0) g += `<line x1="${L}" y1="${sy(0)}" x2="${L + pw}" y2="${sy(0)}"></line>`;
  if (x0 < 0 && x1 > 0) g += `<line x1="${sx(0)}" y1="${T}" x2="${sx(0)}" y2="${T + ph}"></line>`;
  g += `<rect class="s-none" x="${L}" y="${T}" width="${pw}" height="${ph}"></rect>`;
  const cls = ["acc", "good", "warn", "bad"];
  series.forEach((ser, k) => {
    let d = "", pen = false, prev = null;
    ser.forEach(([x, y]) => {
      const ok = isFinite(y) && y >= y0 - (y1 - y0) * 2 && y <= y1 + (y1 - y0) * 2 && !(prev != null && Math.abs(y - prev) > (y1 - y0) * 1.5);
      if (ok) { d += `${pen ? "L" : "M"}${sx(x).toFixed(1)} ${Math.max(T - 40, Math.min(T + ph + 40, sy(y))).toFixed(1)}`; pen = true; } else pen = false;
      prev = isFinite(y) ? y : null;
    });
    g += `<path class="l-${cls[k]} l-thick" d="${d}"></path>`;
    const lab = fns[k].label; if (lab) { const end = ser.filter(a => isFinite(a[1]) && a[1] >= y0 && a[1] <= y1).pop(); if (end) g += `<text class="t-small t-${cls[k]} t-bold" x="${Math.min(sx(end[0]) - 4, L + pw - 4)}" y="${Math.max(T + 12, sy(end[1]) - 8)}" text-anchor="end">${U.esc(lab)}</text>`; }
  });
  pts.forEach(([x, y]) => { g += `<circle class="s-acc" cx="${sx(x).toFixed(1)}" cy="${sy(y).toFixed(1)}" r="3.5"></circle>`; });
  if (p.xlabel) g += `<text class="t-small" x="${L + pw / 2}" y="${Hh - 8}" text-anchor="middle">${U.esc(p.xlabel)}</text>`;
  if (p.ylabel) g += `<text class="t-small" x="14" y="${T + ph / 2}" text-anchor="middle" transform="rotate(-90 14 ${T + ph / 2})">${U.esc(p.ylabel)}</text>`;
  return `<svg viewBox="0 0 ${W} ${Hh}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${U.esc(p.title || p.ylabel || "Graph")}"><defs><clipPath id="pc"></clipPath></defs>${g}</svg>`;
};
U.text = html => { const d = new DOMParser().parseFromString("<body>" + String(html || "") + "</body>", "text/html"); return (d.body.textContent || "").trim(); };
U.hash = s => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
U.shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
U.norm = s => String(s || "").toLowerCase().replace(/<[^>]*>/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
U.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
U.toast = (msg, ms = 2600) => {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); document.body.append(el); }
  el.textContent = msg; el.hidden = false;
  clearTimeout(U._tt); U._tt = setTimeout(() => { el.hidden = true; }, ms);
};
U.qtype = q => q.vars ? "var" : q.num ? "num" : q.pick ? "pick" : (q.opts && q.opts.length ? "mc" : "free");
U.isNumQ = q => !!(q && (q.vars || q.num));
U.flashFrom = topics => {
  const out = [], seen = new Set();
  topics.forEach(t => (t.sections || []).forEach(s => (s.blocks || []).forEach(b => {
    if (b.t !== "defs" || !Array.isArray(b.v)) return;
    b.v.forEach(([term, def]) => {
      const k = t.id + "|" + U.norm(term);
      if (!term || !def || seen.has(k)) return; seen.add(k);
      out.push({ id: "f" + U.hash(k), tid: t.id, term, def });
    });
  })));
  return out;
};
/* Figures are SVG that Claude draws. Like the text, they are rebuilt from an
   allowlist: shapes, lines, text and arrow markers only, no styles, links,
   images or scripts. Colour comes from classes mapped to the theme tokens, so
   every figure follows light and dark mode. */
const SVG_EL = new Set(["svg", "g", "defs", "marker", "rect", "circle", "ellipse", "line", "polyline", "polygon", "path", "text", "tspan", "title"]);
const SVG_AT = new Set(["x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "d", "points", "transform", "width", "height",
  "text-anchor", "dominant-baseline", "font-size", "font-weight", "font-style", "dx", "dy", "letter-spacing",
  "stroke-dasharray", "stroke-width", "stroke-linecap", "stroke-linejoin", "opacity",
  "refX", "refY", "markerWidth", "markerHeight", "orient", "markerUnits", "viewBox"]);
const MARKERS = { "arrow": "mk", "arrow-acc": "mk-acc", "arrow-good": "mk-good", "arrow-bad": "mk-bad" };
U.svg = function(src, uid, label){
  if (!src || typeof src !== "string" || src.length > 60000) return "";
  let doc;
  try { doc = new DOMParser().parseFromString(src.trim().replace(/^```\w*|```$/g, ""), "image/svg+xml"); } catch(e){ return ""; }
  const root = doc.documentElement;
  if (!root || root.localName !== "svg" || doc.getElementsByTagName("parsererror").length) return "";
  const pre = uid ? uid + "-" : "";
  const own = new Set(Array.from(root.querySelectorAll("[id]")).map(e => e.getAttribute("id")));
  const mapId = id => pre + String(id).replace(/[^\w-]/g, "");
  const safe = v => /^[\w\s.,()#%+\-:]*$/.test(v) && !/url|script|expression/i.test(v);
  const attrs = el => {
    let out = "", cls = (el.getAttribute("class") || "").split(/\s+/).filter(c => /^[a-z][a-z0-9-]{0,20}$/.test(c));
    Array.from(el.attributes).forEach(a => {
      const n = a.localName, v = a.value.trim();
      if (n === "class") return;
      if (n === "id") { out += ` id="${mapId(v)}"`; return; }
      if (/^marker-(end|start|mid)$/.test(n)) { const m = /^url\(#([\w-]+)\)$/.exec(v); if (m) out += ` ${n}="url(#${mapId(m[1])})"`; return; }
      // a literal "none" becomes a class, because the theme rules would override the attribute
      if (n === "fill") { if (v === "none") cls.push("s-none"); return; }
      if (n === "stroke") { if (v === "none") cls.push("nostroke"); return; }
      if (!SVG_AT.has(n) || (n === "viewBox" && el.localName !== "marker") || !safe(v) || v.length > 4000) return;
      if ((n === "width" || n === "height") && el.localName === "svg") return;
      out += ` ${n}="${U.esc(v)}"`;
    });
    return (cls.length ? ` class="${cls.join(" ")}"` : "") + out;
  };
  let count = 0;
  const walk = node => {
    let out = "";
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) { if (/^(text|tspan|title)$/.test(node.localName)) out += U.esc(n.nodeValue); return; }
      if (n.nodeType !== 1 || !SVG_EL.has(n.localName) || n.localName === "svg" || ++count > 600) return;
      out += `<${n.localName}${attrs(n)}>${walk(n)}</${n.localName}>`;
    });
    return out;
  };
  let vb = root.getAttribute("viewBox");
  if (!vb || !/^\s*-?[\d.]+([\s,]+-?[\d.]+){3}\s*$/.test(vb)) vb = `0 0 ${parseFloat(root.getAttribute("width")) || 640} ${parseFloat(root.getAttribute("height")) || 320}`;
  const inner = walk(root);
  if (!inner) return "";
  let defs = "";
  if (uid) {
    const need = Object.keys(MARKERS).filter(k => !own.has(k));
    defs = `<defs>${need.map(k => `<marker id="${mapId(k)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="${MARKERS[k]}"></path></marker>`).join("")}</defs>`;
  }
  return `<svg viewBox="${U.esc(vb.trim())}" xmlns="http://www.w3.org/2000/svg" role="img"${label ? ` aria-label="${U.esc(label)}"` : ""}>${defs}${inner}</svg>`;
};
/* Grow the viewBox to take in anything drawn outside it, so a long label is
   never clipped. Needs the svg to be laid out (it may be invisible). */
U.fitSvg = function(el){
  try {
    const vb = el.viewBox.baseVal, b = el.getBBox();
    if (!vb || !b.width || !b.height) return null;
    const pad = 8;
    const x0 = Math.min(vb.x, b.x - pad), y0 = Math.min(vb.y, b.y - pad);
    const x1 = Math.max(vb.x + vb.width, b.x + b.width + pad), y1 = Math.max(vb.y + vb.height, b.y + b.height + pad);
    const next = [x0, y0, x1 - x0, y1 - y0].map(n => Math.round(n * 10) / 10).join(" ");
    if (x0 < vb.x || y0 < vb.y || x1 > vb.x + vb.width || y1 > vb.y + vb.height) el.setAttribute("viewBox", next);
    return el.getAttribute("viewBox");
  } catch(e){ return null; }
};
U.figHTML = (f, uid) => {
  const svg = f.plot ? U.plotSVG(f.plot) : U.svg(f.svg, uid, U.text(f.cap));
  if (!svg) return "";
  return `<figure class="fig gfig">${svg}${f.cap || f.ref ? `<figcaption>${U.san(f.cap)}${f.ref ? `<span class="r">${U.esc(f.ref)}</span>` : ""}</figcaption>` : ""}</figure>`;
};
window.TPU = U;

/* ---------- the study tool ---------- */
function mount(root, course, opts){
  opts = opts || {};
  const H = U.esc, san = U.san;
  const marks = course.marks || {};
  marks.q = marks.q || {}; marks.f = marks.f || {};
  const saveMarks = U.debounce(() => { try { opts.onMarks && opts.onMarks(marks); } catch(e){} }, 1500);

  let T, Q, QID, FL, FID;
  function index(){
    T = course.topics.filter(t => t.ready !== false || (t.qs && t.qs.length) || (t.sections && t.sections.length));
    Q = []; QID = {};
    T.forEach(t => (t.qs || []).forEach(q => { const x = Object.assign({ tid: t.id }, q); Q.push(x); QID[x.id] = x; }));
    FL = U.flashFrom(T); FID = {}; FL.forEach(f => FID[f.id] = f);
  }
  index();
  const topicOf = id => course.topics.find(t => t.id === id) || {};

  const S = {
    mode: opts.mode || "comp", fmt: "practice", scopes: null, len: 20, order: "weak",
    queue: [], i: 0, g: null, sel: new Set(), typed: "", optCache: {},
    mock: null, fq: [], fi: 0, flipped: false, picker: false, cur: null
  };
  S.scopes = new Set(T.map(t => t.id));

  root.innerHTML = `
  <header class="top"><div class="top-in">
    ${opts.onBack ? '<button class="back" data-a="back">← Library</button>' : ""}
    <div class="brand"><h1>${H(course.title)}</h1><span class="sub">${H(course.sub || "")}</span></div>
    <nav class="modes" aria-label="Mode"><button data-mode="comp">Compendium</button><button data-mode="drill">Drill</button></nav>
    <div class="topright">${(opts.actions || []).map((a, i) => `<button class="btn xs ghost" data-act="${i}">${H(a.label)}</button>`).join("")}</div>
  </div></header>
  <main class="wrap"><div id="pv"></div></main>`;
  const pv = root.querySelector("#pv");
  const top = root.querySelector(".top");
  const setGap = () => root.style.setProperty("--topgap", Math.floor(top.getBoundingClientRect().height) + "px");
  setGap(); if (window.ResizeObserver) new ResizeObserver(setGap).observe(top);

  root.querySelector(".top").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.mode) setMode(b.dataset.mode);
    else if (b.dataset.a === "back") opts.onBack();
    else if (b.dataset.act) opts.actions[+b.dataset.act].onClick();
  });
  const toTop = () => { try { window.scrollTo(0, 0); root.scrollIntoView({ block: "start" }); } catch(e){} };

  function setMode(m){
    S.mode = m;
    root.querySelectorAll(".modes button").forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === m));
    if (m === "comp") renderComp(); else { buildQueue(); renderDrill(); }
    toTop();
  }

  /* ===== compendium ===== */
  function blockHTML(b){
    switch (b.t) {
      case "p": return `<p>${san(b.v)}</p>`;
      case "note": return `<div class="note">${san(b.v)}</div>`;
      case "trap": return `<div class="trap">${san(b.v)}</div>`;
      case "defs": return `<dl class="defs">${(b.v || []).map(d => `<div><dt>${san(d[0])}</dt><dd>${san(d[1])}</dd></div>`).join("")}</dl>`;
      case "table": return `<div class="tbl"><table>${b.head ? `<thead><tr>${b.head.map(c => `<th>${san(c)}</th>`).join("")}</tr></thead>` : ""}<tbody>${(b.rows || []).map(r => `<tr>${r.map(c => `<td>${san(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      case "steps": return `${b.title ? `<div class="steps-t">${san(b.title)}</div>` : ""}<ol class="steps">${(b.v || []).map(s => `<li>${san(s)}</li>`).join("")}</ol>`;
      default: return b.v ? `<p>${san(b.v)}</p>` : "";
    }
  }
  function topicHTML(t){
    const n = (t.qs || []).length, fc = FL.filter(f => f.tid === t.id).length;
    const extra = opts.topicExtra ? opts.topicExtra(t.id) : [];
    const body = (t.sections && t.sections.length)
      ? (t.lede ? `<div class="lede">${san(t.lede)}</div>` : "") + t.sections.map((s, si) => `
          <h3>${san(s.h)}</h3>${s.intro ? `<p>${san(s.intro)}</p>` : ""}
          ${(t.figs || []).map((f, fi) => f.sec === si ? U.figHTML(f, "g" + U.hash(t.id) + fi) : "").join("")}
          ${(s.blocks || []).map(blockHTML).join("")}
          ${s.deep ? `<details class="deep"><summary>Explain this properly<span class="more">+</span></summary><div class="deep-b">${/<p|<div|<ul|<ol/i.test(s.deep) ? san(s.deep) : `<p>${san(s.deep)}</p>`}</div></details>` : ""}`).join("")
      : `<div class="pending">${t.pendingNote ? H(t.pendingNote) : "This topic has not been written yet."}</div>`;
    return `<section class="topic" id="t-${H(t.id)}" data-tid="${H(t.id)}">
      <div class="thead"><span class="tnum">${H(t.num)}</span><h2>${H(t.title)}</h2></div>
      ${t.src ? `<div class="tsrc">${H(t.src)}</div>` : ""}
      ${body}
      <div class="jump"><span class="lbl">This topic</span>
        <button class="drillbtn" data-drill="${H(t.id)}" ${n ? "" : "disabled"}>Drill ${n} question${n === 1 ? "" : "s"}</button>
        <button class="drillbtn quiet" data-flash="${H(t.id)}" ${fc ? "" : "disabled"}>${fc} flashcard${fc === 1 ? "" : "s"}</button>
        ${extra.map((x, i) => `<button class="drillbtn quiet" data-extra="${i}" ${x.disabled ? "disabled" : ""}>${H(x.label)}</button>`).join("")}
      </div></section>`;
  }
  function renderComp(){
    const list = course.topics;
    pv.innerHTML = `<div class="comp">
      <nav class="rail" aria-label="Topics"><div class="rail-h">Topics</div><div class="rail-in">${list.map(t => `<a href="#t-${H(t.id)}" data-go="${H(t.id)}"><span class="n">${H(t.num)}</span><span>${H(t.title)}</span><span class="qc">${(t.qs || []).length}</span></a>`).join("")}</div>
        <select class="railsel" id="railsel" aria-label="Jump to topic">${list.map(t => `<option value="${H(t.id)}">${H(t.num)} · ${H(t.title)}</option>`).join("")}</select></nav>
      <div class="doc">${list.map(topicHTML).join("")}</div></div>`;
    const go = id => { const el = pv.querySelector(`#t-${CSS.escape(id)}`); if (el) el.scrollIntoView({ block: "start" }); };
    pv.querySelector(".comp").addEventListener("click", e => {
      const a = e.target.closest("[data-go]"); if (a) { e.preventDefault(); go(a.dataset.go); return; }
      const b = e.target.closest("button"); if (!b) return;
      const tid = b.closest("[data-tid]") && b.closest("[data-tid]").dataset.tid;
      if (b.dataset.drill) { S.scopes = new Set([b.dataset.drill]); S.fmt = "practice"; setMode("drill"); }
      else if (b.dataset.flash) { S.scopes = new Set([b.dataset.flash]); S.fmt = "flash"; setMode("drill"); }
      else if (b.dataset.extra != null && opts.topicExtra) opts.topicExtra(tid)[+b.dataset.extra].onClick(b);
    });
    pv.querySelector("#railsel").addEventListener("change", e => go(e.target.value));
    requestAnimationFrame(() => pv.querySelectorAll(".gfig svg").forEach(U.fitSvg));
    // highlight the topic in view
    if (window.IntersectionObserver) {
      const io = new IntersectionObserver(es => es.forEach(en => {
        if (!en.isIntersecting) return;
        pv.querySelectorAll(".rail a").forEach(a => a.classList.toggle("on", a.dataset.go === en.target.dataset.tid));
      }), { rootMargin: "-20% 0px -70% 0px" });
      pv.querySelectorAll("section.topic").forEach(s => io.observe(s));
    }
  }

  /* ===== drill: queues ===== */
  const inScope = x => S.scopes.has(x.tid);
  function rankWeak(items, store){
    const sc = x => { const m = store[x.id]; if (!m) return 0.45; if (store === marks.f) return m.k ? 0.9 : 0.1; if (m.last === 0) return 0.05 + (m.ok / Math.max(1, m.n)) * 0.2; return 0.5 + (m.ok / Math.max(1, m.n)) * 0.5; };
    return U.shuffle(items).sort((a, b) => sc(a) - sc(b));
  }
  function buildQueue(){
    S.g = null; S.sel = new Set(); S.typed = "";
    if (S.fmt === "flash") {
      let items = FL.filter(inScope);
      items = S.order === "random" ? U.shuffle(items) : S.order === "inorder" ? items : rankWeak(items, marks.f);
      S.fq = (S.len ? items.slice(0, S.len) : items).map(f => f.id); S.fi = 0; S.flipped = false; return;
    }
    if (S.fmt === "mock") { if (!S.mock || S.mock.stale) newPaper(); return; }
    let items = Q.filter(inScope);
    items = S.order === "random" ? U.shuffle(items) : S.order === "inorder" ? items : rankWeak(items, marks.q);
    S.queue = (S.len ? items.slice(0, S.len) : items).map(q => q.id); S.i = 0;
  }
  function newPaper(){
    const n = opts.mockSize || 30;
    const ts = T.filter(t => S.scopes.has(t.id) && (t.qs || []).length);
    const tot = ts.reduce((a, t) => a + (t.weight || 2), 0) || 1;
    let picks = [];
    ts.forEach(t => {
      const share = Math.max(1, Math.round(n * (t.weight || 2) / tot));
      picks = picks.concat(U.shuffle(Q.filter(q => q.tid === t.id)).slice(0, share));
    });
    picks = U.shuffle(picks).slice(0, n);
    const order = {}; course.topics.forEach((t, i) => order[t.id] = i);
    picks.sort((a, b) => order[a.tid] - order[b.tid]);
    S.mock = { ids: picks.map(q => q.id), i: 0, st: {}, start: Date.now(), done: false };
  }
  function record(q, ok){
    const m = marks.q[q.id] || { n: 0, ok: 0 };
    m.n++; if (ok) m.ok++; m.last = ok ? 1 : 0; m.t = Date.now();
    marks.q[q.id] = m; saveMarks();
  }

  /* ===== drill: rendering ===== */
  function scopeLabel(){
    const n = S.scopes.size;
    if (n === T.length) return "All topics";
    if (n === 1) { const t = topicOf([...S.scopes][0]); return t.title || "1 topic"; }
    return n + " topics";
  }
  function poolCount(){ return S.fmt === "flash" ? FL.filter(inScope).length : Q.filter(inScope).length; }
  function renderDrill(){
    const isMock = S.fmt === "mock", isFlash = S.fmt === "flash";
    pv.innerHTML = `<div class="drill"><div class="dmain">
      <div class="dbar" id="dbar">
        <div class="seg" role="group" aria-label="Format">
          <button data-fmt="practice" aria-pressed="${S.fmt === "practice"}">Practice</button>
          <button data-fmt="mock" aria-pressed="${isMock}">Mock exam</button>
          <button data-fmt="flash" aria-pressed="${isFlash}">Flashcards</button></div>
        <div class="picker"><button class="picker-btn" id="scopebtn" aria-expanded="${S.picker}" aria-haspopup="true"><span class="pl">Topics</span><span class="pv">${H(scopeLabel())}</span><span class="pn">${poolCount()}</span></button>${S.picker ? pickerHTML() : ""}</div>
        ${isMock ? `<span class="mockpos" id="mockpos"></span><span class="clock" id="clock"></span>`
          : `<label class="olabel" for="lensel">Length</label><select class="dsel" id="lensel">${[0, 10, 20, 30, 50].map(v => `<option value="${v}" ${S.len === v ? "selected" : ""}>${v || "All"}</option>`).join("")}</select>
             <select class="dsel" id="ordsel" aria-label="Order">${[["weak", "Weakest first"], ["random", "Random"], ["inorder", "In order"]].map(([v, l]) => `<option value="${v}" ${S.order === v ? "selected" : ""}>${l}</option>`).join("")}</select>`}
      </div>
      <div id="cardwrap"></div></div>
      <aside class="side" id="side"></aside></div>`;
    const bar = pv.querySelector("#dbar");
    bar.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.fmt) { if (S.fmt !== b.dataset.fmt) { S.fmt = b.dataset.fmt; S.picker = false; buildQueue(); renderDrill(); } }
      else if (b.id === "scopebtn") { S.picker = !S.picker; renderDrill(); }
      else if (b.dataset.tp) { const id = b.dataset.tp; S.scopes.has(id) ? S.scopes.delete(id) : S.scopes.add(id); if (!S.scopes.size) S.scopes.add(id); refreshPicker(); }
      else if (b.dataset.pall) { S.scopes = new Set(T.map(t => t.id)); refreshPicker(); }
      else if (b.dataset.pclear) { S.scopes = new Set([T[0].id]); refreshPicker(); }
      else if (b.dataset.pdone) { S.picker = false; if (S.mock) S.mock.stale = true; buildQueue(); renderDrill(); }
    });
    const ls = bar.querySelector("#lensel"); if (ls) ls.onchange = () => { S.len = +ls.value; buildQueue(); renderCard(); renderSide(); };
    const os = bar.querySelector("#ordsel"); if (os) os.onchange = () => { S.order = os.value; buildQueue(); renderCard(); };
    renderCard(); renderSide();
  }
  function pickerHTML(){
    const store = S.fmt === "flash" ? FL : Q;
    return `<div class="picker-panel" role="dialog" aria-label="Choose topics"><div class="picker-list">${T.map(t => {
      const items = store.filter(x => x.tid === t.id);
      const st = S.fmt === "flash" ? marks.f : marks.q;
      const done = items.filter(x => st[x.id] && (S.fmt === "flash" ? st[x.id].k : st[x.id].last)).length;
      return `<button class="popt" data-tp="${H(t.id)}" role="menuitemcheckbox" aria-checked="${S.scopes.has(t.id)}"><span class="box">✓</span><span>${H(t.num)} · ${H(t.title)}</span><span class="pn">${items.length}</span><span class="pb"><i style="width:${items.length ? Math.round(100 * done / items.length) : 0}%"></i></span></button>`;
    }).join("")}</div><div class="picker-foot"><span class="sum">${poolCount()} ${S.fmt === "flash" ? "cards" : "questions"}</span><button class="btn xs" data-pall="1">All</button><button class="btn xs" data-pclear="1">Clear</button><button class="btn xs primary" data-pdone="1">Done</button></div></div>`;
  }
  function refreshPicker(){
    const p = pv.querySelector(".picker"); if (!p) return;
    p.querySelector(".pv").textContent = scopeLabel(); p.querySelector(".pn").textContent = poolCount();
    const panel = p.querySelector(".picker-panel"), sc = panel.scrollTop;
    panel.outerHTML = pickerHTML(); p.querySelector(".picker-panel").scrollTop = sc;
  }

  function curQ(){ return S.fmt === "mock" ? QID[S.mock.ids[S.mock.i]] : QID[S.queue[S.i]]; }
  function optionsFor(q){
    if (S.optCache[q.id]) return S.optCache[q.id];
    const a = String(q.a).trim(), seen = new Set([U.norm(a)]), list = [a];
    (q.opts || []).forEach(o => { const k = U.norm(o); if (k && !seen.has(k)) { seen.add(k); list.push(String(o)); } });
    return S.optCache[q.id] = U.shuffle(list);
  }
  /* numbers for a repeatable problem: kept per question until "New numbers" */
  S.vv = {};
  function varsFor(q, fresh){
    if (S.vv[q.id] && !fresh) return S.vv[q.id];
    const pickOne = spec => {
      if (Array.isArray(spec) && spec.length === 3 && spec.every(isFinite) && spec[1] >= spec[0] && spec[2] > 0) {
        const n = Math.floor((spec[1] - spec[0]) / spec[2] + 1e-9) + 1; return +(spec[0] + spec[2] * Math.floor(Math.random() * n)).toPrecision(12);
      }
      if (Array.isArray(spec) && spec.length) return +spec[Math.floor(Math.random() * spec.length)];
      return 1;
    };
    let vals, ans;
    for (let k = 0; k < 25; k++) {
      vals = {}; Object.keys(q.vars).forEach(n => vals[n] = pickOne(q.vars[n]));
      try { ans = U.calc(q.calc, vals); } catch(e){ ans = NaN; }
      if (isFinite(ans)) break;
    }
    return S.vv[q.id] = { vals, ans };
  }
  function numTarget(q){
    if (q.vars) { const v = varsFor(q); return { v: v.ans, unit: q.unit || "", tol: q.tol }; }
    return { v: +q.num.v, unit: q.num.unit || "", tol: q.num.tol };
  }
  function qText(q){
    if (!q.vars) return q.q;
    const v = varsFor(q).vals;
    return String(q.q).replace(/\[\[(\w+)\]\]/g, (m, n) => n in v ? String(+(+v[n]).toPrecision(6)) : m);
  }
  function picksFor(q){
    if (S.optCache["p" + q.id]) return S.optCache["p" + q.id];
    return S.optCache["p" + q.id] = U.shuffle(q.pick.map((p, i) => i));
  }

  function renderCard(){
    const cw = pv.querySelector("#cardwrap"); if (!cw) return;
    if (S.fmt === "flash") return renderFlash(cw);
    if (S.fmt === "mock" && S.mock && S.mock.done) return renderResult(cw);
    const q = curQ();
    const isMock = S.fmt === "mock";
    if (!q) {
      cw.innerHTML = `<div class="card"><div class="qtext">${Q.filter(inScope).length ? "That's the end of this round." : "No questions in the chosen topics yet."}</div>
        <p style="color:var(--ink2);margin:0 0 16px">${Q.filter(inScope).length ? "Start another round, or change the topics or the length above." : "Pick other topics above, or add questions to these from the Compendium."}</p>
        <div class="cact">${Q.filter(inScope).length ? '<button class="btn primary" data-k="again">Another round</button>' : ""}</div></div>`;
      const b = cw.querySelector("[data-k=again]"); if (b) b.onclick = () => { buildQueue(); renderCard(); renderSide(); };
      return;
    }
    S.cur = q.id;
    const st = isMock ? (S.mock.st[q.id] || (S.mock.st[q.id] = { seen: true })) : null;
    if (isMock) { S.g = st.g || null; S.sel = st.sel || (st.sel = new Set()); S.typed = st.typed || ""; }
    const type = U.qtype(q), t = topicOf(q.tid), m = marks.q[q.id];
    const pos = isMock ? `${S.mock.i + 1} / ${S.mock.ids.length}` : `${S.i + 1} / ${S.queue.length}`;
    let body = "";
    if (type === "mc") {
      const os = optionsFor(q);
      body = `<div class="opts">${os.map((o, i) => {
        let cls = "";
        if (S.g) { if (o === String(q.a).trim()) cls = "right"; else if (S.g.picked === o) cls = "wrong"; }
        return `<button class="opt ${cls}" data-o="${i}" ${S.g ? "disabled" : ""}><span class="k">${i < 9 ? i + 1 : ""}</span><span>${san(o)}</span></button>`;
      }).join("")}</div>`;
    } else if (type === "pick") {
      const order = picksFor(q);
      body = `<div class="multihint">Tick every statement that fits${S.g ? "" : ", then check"}</div><div class="opts multi">${order.map((pi, i) => {
        const [txt, ok] = q.pick[pi]; let cls = "", note = "";
        const on = S.sel.has(pi);
        if (S.g) {
          if (on && ok) cls = "right"; else if (!on && ok) { cls = "missed"; note = "this one counts too"; }
          else if (on && !ok) { cls = "wrong"; note = "not this one"; } else cls = "muted";
        } else if (on) cls = "sel";
        return `<button class="opt ${cls}" data-p="${pi}" aria-pressed="${on}" ${S.g ? "disabled" : ""}><span class="tick">✓</span><span>${san(txt)}${note ? `<span class="optnote">${note}</span>` : ""}</span></button>`;
      }).join("")}</div>`;
    } else if (type === "num" || type === "var") {
      const tg = numTarget(q);
      body = S.g ? `<div class="yours ${S.g.ok ? "match" : ""}"><span class="al">Your answer</span>${H(S.typed || "—")}${tg.unit ? " " + H(tg.unit) : ""}</div>`
        : `<div class="numrow"><input id="numin" class="numin" inputmode="decimal" autocomplete="off" placeholder="Your answer" aria-label="Your answer" value="${H(S.typed)}">${tg.unit ? `<span class="unit">${U.mathText(tg.unit)}</span>` : ""}</div>
           <div class="numhint">Decimals with . or , · powers of ten as 1.5e3 or 1.5×10^3 · counted right within ${Math.round((tg.tol == null ? 0.01 : tg.tol) * 1000) / 10}%</div>`;
    } else {
      body = S.g ? `${S.typed ? `<div class="yours"><span class="al">Your answer</span>${H(S.typed)}</div>` : ""}`
        : `<div class="typed"><textarea id="typed" placeholder="Write your answer, then show the key" aria-label="Your answer">${H(S.typed)}</textarea></div>`;
    }
    let ansBlock = S.g && type !== "pick" ? `<div class="ans"><span class="al">Answer</span>${san(q.a)}</div>` : "";
    if (S.g && (type === "num" || type === "var")) { const tg = numTarget(q); ansBlock = `<div class="ans"><span class="al">Answer</span><b>${U.fmtNum(tg.v)}${tg.unit ? " " + U.mathText(tg.unit) : ""}</b>${q.a ? `<div class="sv">${san(q.a)}</div>` : ""}</div>`; }
    const ctx = S.g && q.x && q.x.h ? `<div class="ctx ${S.g.ok ? "" : "hold"}"><div class="ctx-h"><span class="ctx-k">${S.g.ok ? "Why this is right" : "How to get it right"}</span>${q.x.r ? `<span class="ctx-ref">${H(q.x.r)}</span>` : ""}</div><div class="ctx-b">${/<p/i.test(q.x.h) ? san(q.x.h) : `<p>${san(q.x.h)}</p>`}</div></div>` : "";
    let acts = "";
    if (!S.g) {
      if (type === "pick") acts = `<button class="btn primary" data-k="check" ${S.sel.size ? "" : "disabled"}>Check these<span class="kbd">space</span></button>`;
      else if (type === "free") acts = `<button class="btn primary" data-k="reveal">Show answer<span class="kbd">enter</span></button>`;
      else if (type === "num" || type === "var") acts = `<button class="btn primary" data-k="numcheck">Check<span class="kbd">enter</span></button>`;
      if (!isMock) acts += `<button class="btn ghost" data-k="skip">Skip</button>`;
    } else if (type === "free" && S.g.self == null) {
      acts = `<button class="btn good" data-k="got">Got it<span class="kbd">1</span></button><button class="btn bad" data-k="not">Not yet<span class="kbd">2</span></button>`;
    } else if (!isMock) acts = `<button class="btn primary" data-k="next">Next<span class="kbd">enter</span></button>${type === "var" ? `<button class="btn" data-k="newnums">Same problem, new numbers</button>` : ""}`;
    if (isMock) acts += `<span class="navpair"><button class="btn sm" data-k="prev" ${S.mock.i ? "" : "disabled"}>← Back</button>${S.mock.i < S.mock.ids.length - 1 ? `<button class="btn sm ${S.g ? "primary" : ""}" data-k="mnext">Next →</button>` : `<button class="btn sm primary" data-k="finish">Finish paper</button>`}</span>`;
    const tags = [`<span class="tag">${H(t.num)} · ${H(t.title)}</span>`];
    if (q.sub) tags.push(`<span class="tag t2">${H(q.sub)}</span>`);
    if (!isMock && m) tags.push(m.last ? `<span class="tag seen">Right last time</span>` : `<span class="tag weak">Missed last time</span>`);
    cw.innerHTML = `<div class="card" id="card"><div class="cmeta">${tags.join("")}<span class="cpos">${pos}</span></div>
      <div class="qtext">${san(qText(q))}</div>${body}${ansBlock}${ctx}<div class="cact">${acts}</div></div>
      ${isMock ? navHTML() : ""}`;
    const card = cw.querySelector("#card");
    card.addEventListener("click", onCardClick);
    const ta = card.querySelector("#typed");
    if (ta) ta.addEventListener("input", () => { S.typed = ta.value; if (isMock) S.mock.st[q.id].typed = ta.value; });
    const ni = card.querySelector("#numin");
    if (ni) { ni.addEventListener("input", () => { S.typed = ni.value; if (isMock) S.mock.st[q.id].typed = ni.value; }); ni.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); act("numcheck"); } }); }
    if (isMock) {
      cw.querySelector(".mocknav").addEventListener("click", e => { const b = e.target.closest("[data-qn]"); if (b) goMock(+b.dataset.qn); });
      updMockBar();
    }
  }
  function navHTML(){
    return `<div class="mocknav"><span class="olabel">Jump to a question</span><div class="grid">${S.mock.ids.map((id, i) => {
      const st = S.mock.st[id]; let c = "";
      if (st && st.g && st.g.ok != null) c = st.g.ok ? "ok" : "no"; else if (st && st.seen) c = "seen";
      return `<button class="qn-btn ${c} ${i === S.mock.i ? "cur" : ""}" data-qn="${i}" aria-label="Question ${i + 1}">${i + 1}</button>`;
    }).join("")}</div></div>`;
  }
  function updMockBar(){
    const p = pv.querySelector("#mockpos"); if (!p || !S.mock) return;
    const g = Object.values(S.mock.st).filter(s => s.g && s.g.ok != null), ok = g.filter(s => s.g.ok).length;
    p.innerHTML = `Score <b>${ok}</b> / ${g.length} answered`;
  }
  function grade(q, ok, extra){
    S.g = Object.assign({ ok }, extra || {});
    if (S.fmt === "mock") { const st = S.mock.st[q.id]; st.g = S.g; st.sel = S.sel; }
    if (U.qtype(q) !== "free" || S.g.self != null) record(q, ok);
    renderCard(); renderSide();
  }
  function onCardClick(e){
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    const q = curQ();
    if (b.dataset.o != null) { const o = optionsFor(q)[+b.dataset.o]; grade(q, o === String(q.a).trim(), { picked: o }); return; }
    if (b.dataset.p != null) { toggleTick(+b.dataset.p, b); return; }
    act(b.dataset.k);
  }
  function toggleTick(pi, b){
    S.sel.has(pi) ? S.sel.delete(pi) : S.sel.add(pi);
    if (S.fmt === "mock") S.mock.st[S.cur].sel = S.sel;
    b = b || pv.querySelector(`[data-p="${pi}"]`);
    if (b) { b.classList.toggle("sel", S.sel.has(pi)); b.setAttribute("aria-pressed", S.sel.has(pi)); }
    const c = pv.querySelector("[data-k=check]"); if (c) c.disabled = !S.sel.size;
  }
  function act(k){
    const q = curQ(); if (!k) return;
    if (k === "check") { const want = new Set(q.pick.map((p, i) => p[1] ? i : -1).filter(i => i >= 0)); const ok = want.size === S.sel.size && [...want].every(i => S.sel.has(i)); grade(q, ok); }
    else if (k === "numcheck") { if (S.g) return; const got = U.parseNum(S.typed); if (!isFinite(got)) { U.toast("Type a number first, like 12.5 or 3.2e-4."); return; } const tg = numTarget(q); grade(q, U.close(got, tg.v, tg.tol)); }
    else if (k === "newnums") { varsFor(q, true); S.g = null; S.typed = ""; renderCard(); }
    else if (k === "reveal") { if (S.g) return; S.g = { ok: null, self: null }; if (S.fmt === "mock") S.mock.st[q.id].g = S.g; renderCard(); }
    else if (k === "got" || k === "not") { S.g = { ok: k === "got", self: k === "got" }; if (S.fmt === "mock") { S.mock.st[q.id].g = S.g; } record(q, k === "got"); if (S.fmt === "mock") renderCard(); else next(); renderSide(); }
    else if (k === "next" || k === "skip") next();
    else if (k === "prev") goMock(S.mock.i - 1);
    else if (k === "mnext") goMock(S.mock.i + 1);
    else if (k === "finish") { S.mock.done = true; S.mock.end = Date.now(); renderCard(); toTop(); }
  }
  function next(){ S.i++; S.g = null; S.sel = new Set(); S.typed = ""; renderCard(); renderSide(); toTop(); }
  function goMock(i){
    if (!S.mock || i < 0 || i >= S.mock.ids.length) return;
    S.mock.i = i; renderCard(); toTop();
  }
  function renderResult(cw){
    const ids = S.mock.ids, st = S.mock.st;
    const ok = ids.filter(id => st[id] && st[id].g && st[id].g.ok).length;
    const miss = ids.map((id, i) => [id, i]).filter(([id]) => !(st[id] && st[id].g && st[id].g.ok));
    const mins = Math.max(1, Math.round((S.mock.end - S.mock.start) / 60000));
    cw.innerHTML = `<div class="result"><div class="big">${ok}<span> / ${ids.length}</span></div>
      <div class="sub">${Math.round(100 * ok / ids.length)}% in ${mins} min. ${miss.length ? "Questions you missed or skipped:" : "Every question right."}</div>
      <div class="misslist">${miss.map(([id, i]) => `<button data-qn="${i}">${i + 1}. ${H(U.plain(U.text(QID[id].q)).slice(0, 140))}</button>`).join("")}</div>
      <div class="cact"><button class="btn primary" data-k="paper">Another paper</button><button class="btn" data-k="review">Go back through this one</button><button class="btn ghost" data-k="prac">Back to practice</button></div></div>`;
    cw.querySelector(".result").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.qn) { S.mock.done = false; goMock(+b.dataset.qn); }
      else if (b.dataset.k === "paper") { newPaper(); renderDrill(); }
      else if (b.dataset.k === "review") { S.mock.done = false; goMock(0); }
      else if (b.dataset.k === "prac") { S.fmt = "practice"; buildQueue(); renderDrill(); }
    });
  }
  setInterval(() => {
    const c = pv.querySelector("#clock"); if (!c || !S.mock || S.mock.done) return;
    const s = Math.floor((Date.now() - S.mock.start) / 1000);
    c.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }, 1000);

  /* flashcards */
  function renderFlash(cw){
    const f = FID[S.fq[S.fi]];
    if (!f) {
      cw.innerHTML = `<div class="card"><div class="qtext">${FL.filter(inScope).length ? "That's the whole set." : "No flashcards in the chosen topics."}</div><p style="color:var(--ink2);margin:0 0 16px">Flashcards are made from the terms each topic defines in the compendium.</p><div class="cact">${FL.filter(inScope).length ? '<button class="btn primary" data-k="again">Go again</button>' : ""}</div></div>`;
      const b = cw.querySelector("[data-k=again]"); if (b) b.onclick = () => { buildQueue(); renderCard(); };
      return;
    }
    const t = topicOf(f.tid);
    cw.innerHTML = `<div class="cmeta" style="margin:1.125rem 0 0"><span class="tag">${H(t.num)} · ${H(t.title)}</span><span class="cpos">${S.fi + 1} / ${S.fq.length}</span></div>
      <div class="fc-card ${S.flipped ? "flipped" : ""}" id="fc" tabindex="0" role="button" aria-label="Flip card"><div class="fc-inner">
        <div class="fc-face"><div class="fc-k">Term</div><div class="fc-term">${san(f.term)}</div><div class="fc-hint">Tap or press space to turn over</div></div>
        <div class="fc-face fc-back"><div class="fc-k">${san(f.term)}</div><div class="fc-def">${san(f.def)}</div></div></div></div>
      <div class="cact" style="margin-top:16px"><button class="btn good" data-k="knew" ${S.flipped ? "" : "hidden"}>Knew it<span class="kbd">1</span></button><button class="btn bad" data-k="learn" ${S.flipped ? "" : "hidden"}>Still learning<span class="kbd">2</span></button>
        <span class="navpair"><button class="btn sm" data-k="fprev" ${S.fi ? "" : "disabled"}>←</button><button class="btn sm" data-k="fnext">→</button></span></div>`;
    cw.querySelector("#fc").onclick = flip;
    cw.querySelector(".cact").addEventListener("click", e => { const b = e.target.closest("button"); if (b && !b.disabled) fact(b.dataset.k); });
  }
  function flip(){ S.flipped = !S.flipped; const c = pv.querySelector("#fc"); if (c) c.classList.toggle("flipped", S.flipped); pv.querySelectorAll("[data-k=knew],[data-k=learn]").forEach(b => b.hidden = !S.flipped); }
  function fact(k){
    const f = FID[S.fq[S.fi]];
    if (k === "knew" || k === "learn") { marks.f[f.id] = { k: k === "knew" ? 1 : 0, t: Date.now() }; saveMarks(); renderSide(); }
    if (k === "fprev") S.fi = Math.max(0, S.fi - 1); else S.fi++;
    S.flipped = false; renderCard();
  }

  /* side panel */
  function renderSide(){
    const side = pv.querySelector("#side"); if (!side) return;
    if (S.fmt === "flash") {
      const items = FL.filter(inScope), k = items.filter(f => marks.f[f.id] && marks.f[f.id].k).length, l = items.filter(f => marks.f[f.id] && !marks.f[f.id].k).length;
      side.innerHTML = `<div class="scard"><h4>Cards in these topics</h4><div class="bignum">${k}<span>of ${items.length} known</span></div>
        <div class="meter"><i class="m-ok" style="width:${items.length ? 100 * k / items.length : 0}%"></i><i class="m-bad" style="width:${items.length ? 100 * l / items.length : 0}%"></i></div>
        <div class="legend"><span><b>${k}</b> knew</span><span><b>${l}</b> still learning</span><span><b>${items.length - k - l}</b> not seen</span></div></div>`;
      return;
    }
    const items = Q.filter(inScope);
    const right = items.filter(q => marks.q[q.id] && marks.q[q.id].last === 1).length, wrong = items.filter(q => marks.q[q.id] && marks.q[q.id].last === 0).length;
    const weak = items.filter(q => marks.q[q.id] && marks.q[q.id].last === 0).slice(0, 30);
    side.innerHTML = `<div class="scard"><h4>Questions in these topics</h4><div class="bignum">${right}<span>of ${items.length} right last time</span></div>
      <div class="meter"><i class="m-ok" style="width:${items.length ? 100 * right / items.length : 0}%"></i><i class="m-bad" style="width:${items.length ? 100 * wrong / items.length : 0}%"></i></div>
      <div class="legend"><span><b>${right}</b> right</span><span><b>${wrong}</b> missed</span><span><b>${items.length - right - wrong}</b> not tried</span></div></div>
      <div class="scard"><h4>By topic</h4><div class="tprog">${T.filter(t => (t.qs || []).length).map(t => {
        const qs = Q.filter(q => q.tid === t.id), r = qs.filter(q => marks.q[q.id] && marks.q[q.id].last === 1).length;
        return `<div class="row"><span>${H(t.num)} · ${H(t.title)}</span><span class="pct">${r}/${qs.length}</span><div class="bar"><i style="width:${100 * r / qs.length}%"></i></div></div>`;
      }).join("")}</div></div>
      ${S.fmt === "practice" ? `<div class="scard"><h4>Missed last time</h4>${weak.length ? `<div class="weaklist">${weak.map(q => `<button data-wq="${H(q.id)}">${H(U.plain(U.text(q.q)).slice(0, 110))}</button>`).join("")}</div>` : `<div class="empty">Nothing yet. Questions you miss collect here.</div>`}</div>` : ""}`;
    side.onclick = e => {
      const b = e.target.closest("[data-wq]"); if (!b) return;
      const at = S.queue.indexOf(b.dataset.wq);
      if (at >= 0) S.i = at; else { S.queue.splice(S.i, 0, b.dataset.wq); }
      S.g = null; S.sel = new Set(); S.typed = ""; renderCard(); toTop();
    };
  }

  /* keyboard */
  const onKey = e => {
    if (S.mode !== "drill" || !root.isConnected) return;
    if (e.target.closest && e.target.closest("textarea,input,select")) { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); act("reveal"); } return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (S.fmt === "flash") {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); }
      else if (S.flipped && (e.key === "1" || e.key === "2")) fact(e.key === "1" ? "knew" : "learn");
      else if (e.key === "ArrowRight") fact("fnext"); else if (e.key === "ArrowLeft" && S.fi) fact("fprev");
      return;
    }
    const q = S.fmt === "mock" && S.mock && S.mock.done ? null : curQ(); if (!q) return;
    const type = U.qtype(q);
    if (S.fmt === "mock" && (e.key === "ArrowRight" || e.key === "ArrowLeft")) { goMock(S.mock.i + (e.key === "ArrowRight" ? 1 : -1)); return; }
    if (/^[1-9]$/.test(e.key)) {
      const n = +e.key - 1;
      if (!S.g && type === "mc") { const b = pv.querySelector(`[data-o="${n}"]`); if (b) b.click(); }
      else if (!S.g && type === "pick") { const order = picksFor(q); if (n < order.length) toggleTick(order[n]); }
      else if (S.g && type === "free" && S.g.self == null && (n === 0 || n === 1)) act(n === 0 ? "got" : "not");
      return;
    }
    if (e.key === " " && type === "pick" && !S.g) { e.preventDefault(); if (S.sel.size) act("check"); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      if (!S.g && type === "free") act("reveal");
      else if (!S.g && (type === "num" || type === "var")) act("numcheck");
      else if (S.g && S.fmt === "practice" && !(type === "free" && S.g.self == null)) act("next");
      else if (S.g && S.fmt === "mock") act(S.mock.i < S.mock.ids.length - 1 ? "mnext" : "finish");
    }
  };
  document.addEventListener("keydown", onKey);

  U.onMath(() => { if (!root.isConnected) return; if (S.mode === "comp") { const y = window.scrollY; renderComp(); window.scrollTo(0, y); } else renderCard(); });
  setMode(S.mode);
  return {
    refresh(newCourse){ if (newCourse) course = newCourse; course.marks = marks; index(); if (S.mode === "comp") { const y = window.scrollY; renderComp(); window.scrollTo(0, y); } else { buildQueue(); renderDrill(); } },
    destroy(){ document.removeEventListener("keydown", onKey); root.innerHTML = ""; },
    setTitle(t, sub){ root.querySelector(".brand h1").textContent = t; if (sub != null) root.querySelector(".brand .sub").textContent = sub; }
  };
}
window.StudyTool = { mount };

/* exported standalone copy: boot straight into the course */
if (window.__COURSE__) {
  const key = "tp-marks-" + (window.__COURSE__.id || "x");
  let marks = {};
  try { marks = JSON.parse(localStorage.getItem(key) || "{}"); } catch(e){}
  window.__COURSE__.marks = marks;
  const boot = () => mount(document.getElementById("app"), window.__COURSE__, {
    onMarks: m => { try { localStorage.setItem(key, JSON.stringify(m)); } catch(e){} }
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
}
})();
