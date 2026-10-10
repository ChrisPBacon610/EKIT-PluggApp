/* Tentaplugg library: the courses on this site, plus any opened from a file
   on this device. Built-in courses are listed in courses/courses.json; on
   GitHub Pages, any other .json file in the courses folder is found too, so a
   new course is added by uploading its file. */
(function(){
"use strict";
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const toast = (m, ms) => { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms || 3500); };

const LDB = window.TPLDB;

/* Accept the Studio's website file (.json) or its standalone page (.html). */
function parseCourse(text){
  let data = null;
  try { data = JSON.parse(text); } catch(e){
    const m = /window\.__COURSE__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/.exec(text);
    if (m) { try { data = JSON.parse(m[1]); } catch(e2){} }
  }
  if (!data || !Array.isArray(data.topics) || !data.topics.length) throw new Error("This isn't a Tentaplugg course file. Export it from Tentaplugg Studio with “Export for website”.");
  return data;
}
const stats = d => {
  const ts = d.topics || [], q = ts.reduce((a, t) => a + ((t.qs || []).length), 0), f = ts.reduce((a, t) => a + ((t.figs || []).length), 0);
  return `${ts.length} topics · ${q} questions${f ? ` · ${f} figures` : ""}`;
};
function progressOf(id){
  try { const m = JSON.parse(localStorage.getItem("tp-marks-" + id) || "{}"); const q = Object.values(m.q || {}); return q.length ? `${q.filter(x => x.last === 1).length} right last time` : ""; } catch(e){ return ""; }
}

function card(c){
  const prog = c.progressId ? progressOf(c.progressId) : "";
  return `<div class="course"><h3>${esc(c.title)}</h3>
    <div class="meta">${c.meta ? `<span>${esc(c.meta)}</span>` : ""}${prog ? `<span>${esc(prog)}</span>` : ""}${c.where ? `<span>${esc(c.where)}</span>` : ""}</div>
    ${c.desc ? `<p class="cdesc">${esc(c.desc)}</p>` : ""}
    <div class="row"><a class="btn sm primary" href="${esc(c.href)}">Open</a>${c.removeKey ? `<button class="btn xs ghost" data-remove="${esc(c.removeKey)}">Remove from this device</button>` : ""}</div></div>`;
}

async function siteCourses(){
  let list = [];
  try { const r = await fetch("courses/courses.json", { cache: "no-cache" }); if (r.ok) list = (await r.json()).courses || []; } catch(e){}
  const known = new Set(list.filter(c => c.file).map(c => c.file.toLowerCase()));
  // GitHub Pages: pick up any other course file in the folder
  const gh = /^([^.]+)\.github\.io$/i.exec(location.hostname);
  if (gh) {
    const repo = location.pathname.split("/").filter(Boolean)[0];
    const api = repo ? `https://api.github.com/repos/${gh[1]}/${repo}/contents/courses` : `https://api.github.com/repos/${gh[1]}/${gh[1]}.github.io/contents/courses`;
    try {
      const r = await fetch(api, { headers: { Accept: "application/vnd.github+json" } });
      if (r.ok) for (const f of await r.json()) {
        if (f.type !== "file" || !/\.json$/i.test(f.name) || f.name === "courses.json" || known.has(f.name.toLowerCase())) continue;
        list.push({ file: f.name, discovered: true });
      }
    } catch(e){}
  }
  // fill in titles and counts from the files that didn't say
  await Promise.all(list.map(async c => {
    if (!c.file || (c.title && c.meta && c.progressId)) return;
    try { const r = await fetch("courses/" + c.file); const d = parseCourse(await r.text()); c.title = c.title || d.title; c.meta = c.meta || stats(d); c.progressId = d.id; }
    catch(e){ c.broken = true; }
  }));
  return list.filter(c => !c.broken).map(c => c.href ? c : Object.assign(c, { href: "course.html#" + encodeURIComponent(c.file.replace(/\.json$/i, "")) }));
}

async function render(){
  const [site, local] = await Promise.all([siteCourses(), LDB.all().catch(() => [])]);
  $("#site").innerHTML = site.length ? site.map(card).join("") : `<div class="emptylib">No courses found. Check that the courses folder was uploaded.</div>`;
  $("#localwrap").hidden = !local.length;
  $("#local").innerHTML = local.map(c => card({ title: c.data.title, meta: stats(c.data), progressId: c.data.id, where: "Only on this device", href: "course.html#local:" + encodeURIComponent(c.key), removeKey: c.key })).join("");
}

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-remove]"); if (!b) return;
  if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Press again to remove"; setTimeout(() => { b.dataset.confirm = ""; b.textContent = "Remove from this device"; }, 4000); return; }
  await LDB.del(b.dataset.remove); toast("Removed from this device. Progress is kept if you add it again."); render();
});
$("#pick").onclick = () => $("#filein").click();
$("#filein").onchange = async () => {
  const f = $("#filein").files[0]; $("#filein").value = ""; if (!f) return;
  try {
    const data = parseCourse(await f.text());
    await LDB.put({ key: String(data.id || f.name), name: f.name, added: Date.now(), data });
    toast(`Added ${data.title} on this device.`); render();
  } catch(err){ toast(err.message || "That file couldn't be read.", 6000); }
};
try { const th = localStorage.getItem("idsv-theme"); if (th) document.documentElement.setAttribute("data-theme", th); } catch(e){}
render();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
