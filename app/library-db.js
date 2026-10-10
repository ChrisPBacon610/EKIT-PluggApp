/* Courses opened from a file are kept on this device in IndexedDB. */
(function(){
"use strict";
const LDB = {
  open(){ return this.p || (this.p = new Promise((res, rej) => { const r = indexedDB.open("tentaplugg", 1); r.onupgradeneeded = () => r.result.createObjectStore("courses"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); },
  async tx(mode, fn){ const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction("courses", mode); const st = t.objectStore("courses"); const out = fn(st); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); }); },
  all(){ return this.tx("readonly", st => st.getAll()); },
  put(c){ return this.tx("readwrite", st => st.put(c, c.key)); },
  del(k){ return this.tx("readwrite", st => st.delete(k)); }
};
window.TPLDB = LDB;
})();
