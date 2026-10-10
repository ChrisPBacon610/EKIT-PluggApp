/* Opens one course in the study tool. #<name> loads courses/<name>.json;
   #local:<key> loads a course opened from a file on this device. */
(function(){
"use strict";
const app = document.getElementById("app");
const fail = msg => { app.innerHTML = `<header class="top"><div class="top-in"><a class="back" href="./">← All courses</a><div class="brand"><h1>Tentaplugg</h1></div></div></header><main class="wrap"><div class="banner bad">${TPU.esc(msg)}</div></main>`; };
try { const th = localStorage.getItem("idsv-theme"); if (th) document.documentElement.setAttribute("data-theme", th); } catch(e){}

async function load(){
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h) return fail("No course was chosen. Go back and pick one.");
  if (h.startsWith("local:")) {
    const all = await TPLDB.all().catch(() => []);
    const c = all.find(x => x.key === h.slice(6));
    if (!c) throw new Error("This course isn't on this device any more. Open its file again from the course list.");
    return c.data;
  }
  if (!/^[\w.-]+$/.test(h)) throw new Error("That course link isn't valid.");
  const r = await fetch("courses/" + h + ".json");
  if (!r.ok) throw new Error("That course couldn't be found on this site.");
  const d = await r.json();
  if (!d || !Array.isArray(d.topics)) throw new Error("That course file is damaged.");
  return d;
}

function download(name, text){
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "application/json" })); a.download = name;
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function merge(a, b){ // newest mark per question wins
  const out = { q: Object.assign({}, a.q || {}), f: Object.assign({}, a.f || {}) };
  ["q", "f"].forEach(k => Object.entries((b && b[k]) || {}).forEach(([id, m]) => { if (!out[k][id] || (m.t || 0) > (out[k][id].t || 0)) out[k][id] = m; }));
  return out;
}

load().then(d => {
  const key = "tp-marks-" + (d.id || location.hash);
  let marks = {}; try { marks = JSON.parse(localStorage.getItem(key) || "{}"); } catch(e){}
  d.marks = marks;
  document.title = (d.title || "Course") + " · Tentaplugg";
  const save = m => { try { localStorage.setItem(key, JSON.stringify({ q: m.q, f: m.f })); } catch(e){} };
  const input = document.createElement("input"); input.type = "file"; input.accept = ".json"; input.hidden = true; document.body.append(input);
  input.onchange = async () => {
    const f = input.files[0]; input.value = ""; if (!f) return;
    try {
      const got = JSON.parse(await f.text());
      if (!got || got.course !== (d.id || "") || !got.marks) throw new Error("That progress file belongs to another course.");
      const m = merge(JSON.parse(localStorage.getItem(key) || "{}"), got.marks);
      localStorage.setItem(key, JSON.stringify(m)); location.reload();
    } catch(e){ TPU.toast(e.message || "That file couldn't be read.", 5000); }
  };
  StudyTool.mount(app, d, {
    onBack: () => { location.href = "./"; },
    onMarks: save,
    actions: [
      { label: "Save progress", onClick: () => { download((d.title || "course").replace(/[^\w]+/g, "-").toLowerCase() + "-progress.json", JSON.stringify({ course: d.id || "", saved: new Date().toISOString(), marks: JSON.parse(localStorage.getItem(key) || "{}") })); TPU.toast("Progress saved to a file. Load it on another device to carry on there."); } },
      { label: "Load progress", onClick: () => input.click() }
    ]
  });
}).catch(e => fail(e.message || "The course couldn't be opened."));
window.addEventListener("hashchange", () => location.reload());
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
