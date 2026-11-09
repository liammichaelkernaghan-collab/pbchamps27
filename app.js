/* NZ Pipe Band Championships 2027 – live companion
   Plain JS, no build step.
   Data: data/config.json, data/bands.json, data/draws.json, data/live.json (circles)
   Announcements: the <section id="announcements"> block in index.html */
(() => {
"use strict";

const S = { config:null, bands:[], comps:[], live:null, liveSig:"", ann:[], annSig:"", byBand:{}, byComp:{} };
const $app = document.getElementById("app");
const LS = { get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}}, set:(k,v)=>localStorage.setItem(k,JSON.stringify(v)) };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fav = () => LS.get("nzpb-fav", []);
const isFav = n => fav().includes(n);
const toggleFav = n => { const f = fav(); const i = f.indexOf(n); i<0 ? f.push(n) : f.splice(i,1); LS.set("nzpb-fav", f); toast(i<0 ? `★ Following ${n}` : `Unfollowed ${n}`); };
const gradeLabel = g => /^\d/.test(g) ? "Grade " + g : g;
const circleName = k => k == "1" ? "Circle One" : k == "2" ? "Circle Two" : "Circle " + k;
const circleColor = k => k == "2" ? "var(--c2)" : "var(--c1)";

function toast(msg){ const t=document.getElementById("toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove("show"),2600); }
async function getJSON(u){ const r = await fetch(u + (u.includes("?")?"&":"?") + "t=" + Date.now(), {cache:"no-store"}); if(!r.ok) throw new Error(u+" "+r.status); return r.json(); }

/* ---------- theme + clock ---------- */
document.getElementById("theme").onclick = () => {
  const d = document.documentElement.dataset.theme === "dark" ? "" : "dark";
  if(d) document.documentElement.dataset.theme = d; else delete document.documentElement.dataset.theme;
  LS.set("nzpb-theme", d || "light"); localStorage.setItem("nzpb-theme", d || "light");
};
function clock(){
  const n = new Date();
  document.getElementById("clock").textContent = n.toLocaleDateString("en-NZ",{weekday:"short",day:"numeric",month:"short",timeZone:"Pacific/Auckland"}).toUpperCase()
    + " · " + n.toLocaleTimeString("en-NZ",{hour:"numeric",minute:"2-digit",timeZone:"Pacific/Auckland"}).toUpperCase();
}
clock(); setInterval(clock, 15000);

/* ---------- announcements (from index.html) ---------- */
const TYPES = { important:["Important","red"], update:["Update","blue"], schedule:["Schedule","green"], info:["Info","grey"] };
function nzDate(s){
  // "YYYY-MM-DD HH:MM" in NZ time. Offset is +13:00 in summer (NZDT); override with config.tzOffset.
  const m = String(s||"").trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/);
  if(!m) return new Date(NaN);
  return new Date(`${m[1]}T${m[2].padStart(2,"0")}:${m[3]}:00${S.config?.tzOffset || "+13:00"}`);
}
function parseAnnouncements(root){
  const sec = root.querySelector("#announcements"); if(!sec) return [];
  return [...sec.querySelectorAll("article")].map((a,i) => ({
    i, time: nzDate(a.dataset.time), raw: a.dataset.time || "",
    type: TYPES[a.dataset.type] ? a.dataset.type : "info",
    title: a.dataset.title || "", circle: a.dataset.circle || "",
    html: a.innerHTML.trim()
  })).filter(a => !isNaN(a.time) && a.time <= Date.now())
     .sort((a,b) => b.time - a.time);
}
async function refreshAnnouncements(first){
  try{
    let list;
    if(first) list = parseAnnouncements(document);
    else {
      const r = await fetch("index.html?t=" + Date.now(), {cache:"no-store"});
      list = parseAnnouncements(new DOMParser().parseFromString(await r.text(), "text/html"));
    }
    const sig = JSON.stringify(list.map(a => [a.raw,a.title,a.html]));
    if(sig === S.annSig) return false;
    const prevTop = S.ann[0]; S.ann = list; S.annSig = sig;
    renderSide(!first);
    if(!first && list[0] && (!prevTop || list[0].raw+list[0].title !== prevTop.raw+prevTop.title)){
      toast("📣 " + list[0].title);
      if("Notification" in window && Notification.permission === "granted") new Notification("NZ Pipe Band Champs", {body:list[0].title, icon:"icon.svg"});
    }
    return true;
  }catch{ return false; }
}
function ago(t){
  const s = (Date.now() - t)/1000;
  if(s < 60) return "just now";
  if(s < 3600) return Math.floor(s/60) + "m ago";
  if(s < 86400) return Math.floor(s/3600) + "h ago";
  return Math.floor(s/86400) + "d ago";
}
const hm = t => t.toLocaleTimeString("en-NZ",{hour:"numeric",minute:"2-digit",timeZone:"Pacific/Auckland"});
function annItem(a, compact, fresh){
  const [lab, col] = TYPES[a.type];
  const circ = a.circle ? ` <span class="tag ${a.circle=="2"?"blue":"red"}">${esc(circleName(a.circle))}</span>` : "";
  if(compact) return `<div class="fi ${a.type} ${fresh?"fresh":""}"><h3>${esc(a.title)}</h3><span class="tag ${col}">${lab}</span>
    ${a.html?`<div class="tx">${a.html}</div>`:""}<div class="mt">${hm(a.time)} · ${ago(a.time)}</div></div>`;
  return `<div class="fi ${a.type} ${fresh?"fresh":""}"><div class="k">${lab}${circ}</div><h3>${esc(a.title)}</h3>${a.html?`<div class="tx">${a.html}</div>`:""}</div>`;
}
function renderSide(fresh){
  const el = document.getElementById("side-feed");
  el.innerHTML = S.ann.length ? S.ann.slice(0,15).map((a,i) => annItem(a, true, fresh && i===0)).join("")
    : `<div class="fi info"><div class="tx mute">No announcements yet.</div></div>`;
}

/* ---------- data ---------- */
async function boot(){
  try{
    const [config, bands, draws] = await Promise.all([getJSON("data/config.json"), getJSON("data/bands.json"), getJSON("data/draws.json")]);
    S.config = config; S.bands = bands.bands; S.comps = draws.competitions;
    S.bands.forEach(b => S.byBand[b.name] = b);
    S.comps.forEach(c => S.byComp[c.id] = c);
    await refreshAnnouncements(true);
    await refreshLive(true);
    setInterval(tick, (config.refreshSeconds || 20) * 1000);
    document.addEventListener("visibilitychange", () => { if(!document.hidden) tick(); });
    window.addEventListener("hashchange", () => route());
    route();
  }catch(e){ $app.innerHTML = `<div class="empty">Couldn't load championship data. ${esc(e.message)}</div>`; }
}
async function tick(){
  const a = await refreshAnnouncements(false);
  const l = await refreshLive(false);
  const r = curRoute().name;
  if((a || l) && ["live","feed","draws","mine"].includes(r)) route(true);
  else renderSide(false); // keeps the "x m ago" labels fresh
}
async function refreshLive(first){
  try{
    const live = await getJSON(S.config.liveUrl || "data/live.json");
    const sig = JSON.stringify(live);
    if(sig === S.liveSig) { stamp(); return false; }
    const prev = S.live; S.live = live; S.liveSig = sig; stamp();
    if(!first) notifyFavs(prev, live);
    return !first;
  }catch{ document.getElementById("updated").textContent = "Offline – retrying"; return false; }
}
const stamp = () => document.getElementById("updated").textContent = "Last checked " + new Date().toLocaleTimeString("en-NZ",{hour:"numeric",minute:"2-digit",second:"2-digit"});

function notifyFavs(prev, live){
  if(!prev) return;
  const f = fav();
  for(const k of Object.keys(live.circles||{})){
    const now = live.circles[k], was = prev.circles?.[k] || {};
    for(const b of [now.now, (now.next||[])[0]]){
      if(!b || !f.includes(b)) continue;
      if([was.now, (was.next||[])[0]].includes(b)) continue;
      const msg = b === now.now ? `${b} is on now – ${circleName(k)}` : `${b} is up next – ${circleName(k)}`;
      toast("★ " + msg);
      if("Notification" in window && Notification.permission === "granted") new Notification("NZ Pipe Band Champs", {body: msg, icon:"icon.svg"});
    }
  }
}

/* ---------- helpers ---------- */
const people = name => { const b = S.byBand[name]; if(!b) return ""; const p=[]; if(b.pipeMajor) p.push("PM "+b.pipeMajor); if(b.drumSergeant) p.push("L/D "+b.drumSergeant); if(b.drumMajor) p.push("DM "+b.drumMajor); return p.join(" · "); };
const setsHTML = sets => (sets||[]).map(s => `<div>${s.label?`<b>${esc(s.label)}</b>`:""}${s.tunes.map(esc).join(" · ")}</div>`).join("");
const isIndividual = c => (c.type||"").toLowerCase().startsWith("individual");
function liveState(c){
  const out = { now:null, done:new Set(), circle:null };
  for(const k of Object.keys(S.live?.circles||{})){
    const L = S.live.circles[k]; if(L.event !== c.id) continue;
    out.now = L.now || null; out.circle = k;
    const idx = c.draw.findIndex(d => d.band === L.now);
    const nIdx = L.next?.length ? c.draw.findIndex(d => d.band === L.next[0]) : -1;
    const cut = idx >= 0 ? idx : (nIdx >= 0 ? nIdx : (String(L.status).toLowerCase()==="finished" ? c.draw.length : -1));
    c.draw.forEach((d,i) => { if(cut >= 0 && i < cut) out.done.add(d.band); });
  }
  return out;
}
const pageH = (title, sub, right="") => `<div class="page-h"><div><h1>${title}</h1></div>${right || (sub?`<div class="sub">${sub}</div>`:"")}</div>`;
function bindStars(root=$app){ root.querySelectorAll("[data-fav]").forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); toggleFav(b.dataset.fav); b.classList.toggle("on"); }); }

/* ---------- router ---------- */
function curRoute(){
  const h = location.hash.replace(/^#\/?/, "") || "live";
  const [path, qs] = h.split("?"); const parts = path.split("/");
  return { name: parts[0], arg: decodeURIComponent(parts[1]||""), q: new URLSearchParams(qs||"") };
}
function route(soft){
  const r = curRoute();
  document.querySelectorAll("#tabs a[data-route]").forEach(a => a.classList.toggle("on", a.dataset.route === (r.name==="band"?"bands":r.name)));
  const y = soft ? scrollY : 0;
  const views = { live:viewLive, draws:viewDraws, bands:viewBands, band:viewBand, feed:viewFeed, pick:viewPick, mine:viewMine, admin:viewAdmin };
  (views[r.name] || viewLive)(r, soft);
  scrollTo(0, y);
}

/* ---------- CIRCLES (home) ---------- */
function viewLive(){
  const L = S.live || {}; const cfg = S.config;
  const circles = Object.keys(L.circles || {"1":{}, "2":{}});
  const playing = circles.filter(k => String(L.circles?.[k]?.status).toLowerCase()==="playing").length;
  const start = new Date(cfg.start); const pre = Date.now() < start;
  const slots = S.comps.reduce((n,c) => n + c.draw.length, 0);
  $app.innerHTML = `
    ${pageH("On the Circles", "", `<div class="sub">${L.headline?esc(L.headline):esc(cfg.venue)}</div>`)}
    <div class="stats">
      <div><span class="label">Bands entered</span><b>${S.bands.length}</b></div>
      <div><span class="label">Competitions</span><b>${S.comps.length}</b></div>
      <div><span class="label">Performances</span><b>${slots}</b></div>
      <div><span class="label">${pre?"Starts in":"Circles live"}</span><b id="cd">${pre?"":playing+" / "+circles.length}</b></div>
    </div>
    <div class="circles">${circles.map(k => circleCard(k, L.circles?.[k]||{})).join("")}</div>
    <div class="sec-h"><h2>Live Streams</h2>
      ${"Notification" in window && Notification.permission==="default" ? `<button class="btn sm" id="notif">🔔 Turn on alerts</button>`:""}</div>
    <div class="streams ${cfg.streams.length<2?"one":""}">${cfg.streams.map(streamCard).join("")}</div>
    <div class="only-narrow"><div class="sec-h"><h2>Latest Announcements</h2><a class="btn sm" href="#/feed">All →</a></div>
      ${S.ann.slice(0,3).map(a => annItem(a,false)).join("") || `<div class="empty">No announcements yet.</div>`}</div>`;
  if(pre) countdown(start);
  $app.querySelectorAll("[data-yt]").forEach(b => b.onclick = () => { b.parentElement.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(b.dataset.yt)}?autoplay=1&mute=1" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="Live stream"></iframe>`; });
  $app.querySelectorAll("[data-fav]").forEach(b => b.onclick = e => { e.preventDefault(); toggleFav(b.dataset.fav); route(true); });
  const n = document.getElementById("notif"); if(n) n.onclick = () => Notification.requestPermission().then(p => { toast(p==="granted"?"Alerts on – follow bands with ★":"Alerts blocked"); route(true); });
}
function circleCard(k, L){
  const c = S.byComp[L.event];
  const st = String(L.status||"").toLowerCase();
  const pill = st==="playing" ? `<span class="tag live">● Playing</span>` : st ? `<span class="tag grey">${esc(L.status)}</span>` : `<span class="tag grey">Idle</span>`;
  const slot = c?.draw.find(d => d.band === L.now);
  const pos = c && slot ? c.draw.indexOf(slot) + 1 : 0;
  const next = (L.next||[]).map((b,i) => { const s = c?.draw.find(d=>d.band===b);
    return `<tr><td class="o">${String(pos+i+1).padStart(2,"0")}</td><td>${esc(b)} ${isFav(b)?"<span style='color:var(--gold)'>★</span>":""}</td><td class="t">${esc(s?.time||"")}</td></tr>`; }).join("");
  return `<article class="circle" style="--cc:${circleColor(k)}">
    <div class="hd"><h2><span class="sq" style="background:${circleColor(k)}"></span>${circleName(k)}</h2>${pill}</div>
    <div class="ev">${c ? `<a href="#/draws?c=${c.id}">${esc(c.name)}</a>` : "No competition running"}</div>
    <div class="now">
      <span class="label">${st==="playing"?"Now playing":L.now?"On the line":"Waiting"}</span>
      ${L.now ? `<div class="band">${esc(L.now)} <button class="star ${isFav(L.now)?"on":""}" data-fav="${esc(L.now)}" aria-label="Follow">★</button></div>
        ${people(L.now)?`<div class="who">${esc(people(L.now))}</div>`:""}
        ${slot?.sets?.length?`<div class="tl">${setsHTML(slot.sets)}</div>`:""}` : `<div class="band mute">—</div>`}
    </div>
    ${c ? `<div class="progress"><div class="bar"><span style="width:${c.draw.length?pos/c.draw.length*100:0}%"></span></div><span class="mono">${pos||"–"} of ${c.draw.length}</span></div>`:""}
    ${next ? `<div class="next"><span class="label">Coming up</span><table>${next}</table></div>`:""}
  </article>`;
}
function streamCard(s){
  const has = s.youtubeId && !s.youtubeId.startsWith("REPLACE");
  return `<article class="stream"><div class="vid">
    ${has ? `<button data-yt="${esc(s.youtubeId)}" aria-label="Play ${esc(s.label)} stream"><span class="play">▶</span><span>Watch ${esc(s.label)}</span></button>` : `<span>Stream link coming soon</span>`}
    </div><div class="cap"><span>${esc(s.label)}</span>
    ${has ? `<a class="btn sm" href="https://www.youtube.com/watch?v=${encodeURIComponent(s.youtubeId)}" target="_blank" rel="noopener">Open in YouTube</a>`:""}</div></article>`;
}
function countdown(start){
  const el = document.getElementById("cd"); if(!el) return;
  const t = () => {
    if(!document.body.contains(el)) return clearInterval(h);
    let s = Math.max(0, (start - Date.now())/1000|0);
    const d = s/86400|0; s%=86400; const hh = s/3600|0; s%=3600; const m = s/60|0;
    el.textContent = `${d}d ${String(hh).padStart(2,"0")}h ${String(m).padStart(2,"0")}m`;
  };
  const h = setInterval(t, 30000); t();
}

/* ---------- FEED ---------- */
function viewFeed(r){
  const f = r.q.get("t") || "all";
  const counts = Object.fromEntries(Object.keys(TYPES).map(k => [k, S.ann.filter(a => a.type===k).length]));
  const list = S.ann.filter(a => f==="all" || a.type===f);
  let lastDay = "";
  const items = list.map(a => {
    const day = a.time.toLocaleDateString("en-NZ",{weekday:"long",day:"numeric",month:"long",timeZone:"Pacific/Auckland"});
    const head = day !== lastDay ? `<div class="feed-day">${esc(day.toUpperCase())}</div>` : ""; lastDay = day;
    return head + `<div class="feed-day" style="margin-top:14px">${ago(a.time).toUpperCase()}<span>${hm(a.time)}</span></div>` + annItem(a,false);
  }).join("");
  $app.innerHTML = `${pageH("Feed")}
    <div class="chips" style="margin-bottom:6px">
      <a class="chip ${f==="all"?"on":""}" href="#/feed">All<small>${S.ann.length}</small></a>
      ${Object.entries(TYPES).map(([k,[lab]]) => `<a class="chip ${f===k?"on":""}" href="#/feed?t=${k}">${lab}${counts[k]?`<small>${counts[k]}</small>`:""}</a>`).join("")}
    </div>
    ${items || `<div class="empty" style="margin-top:20px">Nothing here yet.</div>`}`;
}

/* ---------- DRAWS ---------- */
function viewDraws(r, soft){
  const grades = [...new Set(S.comps.map(c => c.grade))];
  const g = r.q.get("g") || "All"; const focus = r.q.get("c");
  const list = S.comps.filter(c => g==="All" || c.grade===g);
  const open = LS.get("nzpb-open", null);
  $app.innerHTML = `${pageH("Draws", `${S.comps.length} competitions · ${S.bands.length} bands`)}
    ${S.comps.some(c => c.provisional) ? `<div class="notice">Provisional. Entries are listed alphabetically until the official draw is published. Playing order, times and judges will appear here once confirmed.</div>`:""}
    <div class="toolbar">
      <input type="search" id="dq" placeholder="Search band, Pipe Major, Drum Sergeant or tune…" value="${esc(r.q.get("q")||"")}">
      <div class="chips">${["All",...grades].map(x => `<a class="chip ${x===g?"on":""}" href="#/draws${x==="All"?"":"?g="+encodeURIComponent(x)}">${esc(x)}</a>`).join("")}</div>
    </div>
    <div id="comps"></div>`;
  const draw = q => {
    document.getElementById("comps").innerHTML = list.map(c => compBlock(c, q, focus ? c.id===focus : (q || !open || open.includes(c.id)))).join("") || `<div class="empty">No matches</div>`;
    bindStars();
    document.querySelectorAll(".comp-h").forEach(h => h.onclick = e => { if(e.target.closest("a,button")) return;
      const el = h.parentElement; el.classList.toggle("closed");
      LS.set("nzpb-open", [...document.querySelectorAll(".comp:not(.closed)")].map(x => x.id.slice(5))); });
  };
  const inp = document.getElementById("dq"); inp.oninput = () => draw(inp.value.toLowerCase()); draw(inp.value.toLowerCase());
  if(focus && !soft){ const el = document.getElementById("comp-"+focus); if(el) setTimeout(()=>el.scrollIntoView({behavior:"smooth",block:"start"}),60); }
}
function compBlock(c, q, open){
  const st = liveState(c);
  const match = d => !q || [d.band, people(d.band), ...(d.sets||[]).flatMap(s=>s.tunes)].join(" ").toLowerCase().includes(q);
  const rows = c.draw.filter(match);
  if(q && !rows.length) return "";
  const running = Object.values(S.live?.circles||{}).some(L => L.event===c.id);
  const j = c.judges || {};
  const jv = v => (Array.isArray(v) ? v.join(", ") : v) || `<span class="mute">TBC</span>`;
  const judges = isIndividual(c)
    ? `<div><span class="label">Judges</span>${jv([...(j.piping||[]), j.drumming, j.ensemble].filter(Boolean))}</div>`
    : `<div><span class="label">Piping</span>${jv(j.piping)}</div><div><span class="label">Drumming</span>${jv(j.drumming)}</div><div><span class="label">Ensemble</span>${jv(j.ensemble)}</div>`;
  const when = [c.day, c.start].filter(Boolean).join(" · ");
  return `<section class="comp ${open?"":"closed"}" id="comp-${c.id}">
    <div class="comp-h"><h2>${esc(c.name)}</h2>
      <div class="meta">${running?`<span class="tag live">● Live</span>`:""}
        ${c.circle?`<span class="tag ${c.circle=="2"?"blue":"red"}">${esc(circleName(c.circle))}</span>`:""}
        ${when?`<span class="tag grey">${esc(when)}</span>`:""}
        <span class="tag grey">${c.draw.length} ${isIndividual(c)?"entries":"bands"}</span>
        <a class="btn sm" href="#/pick/${c.id}">Pick 'em</a><span class="caret">${open?"▲":"▼"}</span></div></div>
    <div class="body">
      <div class="judges">${judges}</div>
      <table class="tbl"><thead><tr><th style="width:56px">#</th><th>Band</th><th>Tunes</th><th class="num" style="width:90px">Time</th></tr></thead><tbody>
      ${rows.map(d => `<tr class="${d.band===st.now?"is-now":""} ${st.done.has(d.band)?"is-done":""}">
        <td class="num">${c.provisional?"–":d.order}</td>
        <td><div class="nm"><a href="#/band/${S.byBand[d.band]?.id||""}">${esc(d.band)}</a> <button class="star ${isFav(d.band)?"on":""}" data-fav="${esc(d.band)}" aria-label="Follow">★</button></div>
          <div class="sub">${esc(people(d.band) || "PM / L-D to be confirmed")}</div></td>
        <td class="tunes">${setsHTML(d.sets) || `<span class="mute">Tunes TBC</span>`}</td>
        <td class="num">${esc(d.time||"")}${d.circle&&d.circle!==c.circle?`<div class="sub">C${esc(d.circle)}</div>`:""}</td></tr>`).join("")}
      </tbody></table>
    </div></section>`;
}

/* ---------- BANDS ---------- */
function viewBands(r){
  const q = (r.q.get("q")||"").toLowerCase();
  const rows = v => S.bands.filter(b => !v || [b.name,b.grade,b.centre,b.pipeMajor,b.drumSergeant].join(" ").toLowerCase().includes(v))
    .map(b => `<tr><td><div class="nm"><a href="#/band/${b.id}">${esc(b.name)}</a></div><div class="sub">${esc(people(b.name) || (b.centre||""))}</div></td>
      <td class="hide-m">${esc(gradeLabel(b.grade))}</td><td class="num hide-m">${b.events.length}</td>
      <td class="num"><button class="star ${isFav(b.name)?"on":""}" data-fav="${esc(b.name)}" aria-label="Follow">★</button></td></tr>`).join("")
    || `<tr><td colspan="4" class="mute">No bands match</td></tr>`;
  $app.innerHTML = `${pageH("Bands", `${S.bands.length} entered · tap ★ to follow`)}
    <input type="search" id="bq" placeholder="Search bands, people or centres…" value="${esc(q)}" style="margin-bottom:18px">
    <table class="tbl bands"><thead><tr><th>Band</th><th class="hide-m">Grade</th><th class="num hide-m">Events</th><th class="num">Follow</th></tr></thead><tbody id="bl">${rows(q)}</tbody></table>`;
  const i = document.getElementById("bq"); i.oninput = () => { document.getElementById("bl").innerHTML = rows(i.value.toLowerCase()); bindStars(); };
  bindStars();
}
function viewBand(r){
  const b = S.bands.find(x => x.id === r.arg); if(!b) return viewBands(r);
  const comps = S.comps.filter(c => c.draw.some(d => d.band === b.name));
  $app.innerHTML = `<a class="btn sm" href="#/bands">← All bands</a><div style="height:18px"></div>
    ${pageH(esc(b.name), "", `<button class="btn ${isFav(b.name)?"primary":""}" id="fb">${isFav(b.name)?"★ Following":"☆ Follow"}</button>`)}
    <div class="stats">
      <div><span class="label">Grade</span><b>${esc(b.grade)}</b></div>
      <div><span class="label">Pipe Major</span><b style="font-family:var(--serif-d);font-size:22px">${esc(b.pipeMajor||"TBC")}</b></div>
      <div><span class="label">Drum Sergeant</span><b style="font-family:var(--serif-d);font-size:22px">${esc(b.drumSergeant||"TBC")}</b></div>
      <div><span class="label">Events</span><b>${comps.length}</b></div>
    </div>
    <div class="sec-h"><h2>Events & Tunes</h2></div>
    <table class="tbl"><thead><tr><th>Competition</th><th>Tunes</th><th class="num">Order</th></tr></thead><tbody>
    ${comps.map(c => { const d = c.draw.find(x=>x.band===b.name);
      return `<tr><td><div class="nm"><a href="#/draws?c=${c.id}">${esc(c.name)}</a></div><div class="sub">${esc([c.day, d.time||c.start, c.circle&&circleName(c.circle)].filter(Boolean).join(" · "))}</div></td>
      <td class="tunes">${setsHTML(d.sets) || `<span class="mute">Tunes TBC</span>`}</td>
      <td class="num">${c.provisional?"TBC":d.order+" / "+c.draw.length}</td></tr>`; }).join("")}
    </tbody></table>`;
  document.getElementById("fb").onclick = () => { toggleFav(b.name); route(true); };
}

/* ---------- PICK 'EM ---------- */
function encodePick(c, order){ return order.map(b => c.draw.findIndex(d => d.band===b).toString(36)).join("."); }
function decodePick(c, s){ try{ const o = s.split(".").map(x => c.draw[parseInt(x,36)]?.band).filter(Boolean); return o.length===c.draw.length && new Set(o).size===o.length ? o : null; }catch{ return null; } }
function podium(pl){ return `<div class="podium">${(pl||[]).map((b,i) => `<div><span class="p">${i+1}</span><span>${esc(b)}</span></div>`).join("")}</div>`; }

function viewPick(r){
  if(!r.arg){
    const picks = LS.get("nzpb-picks", {});
    $app.innerHTML = `${pageH("Pick 'em", "Drag the bands into your predicted finishing order")}
      <div class="notice">${esc(S.config.pickDeadlineNote||"")} Submit your picks to go in the draw, or share them and challenge your mates.</div>
      <div class="pick-list">${S.comps.filter(c=>c.draw.length>1).map(c => `<a href="#/pick/${c.id}">
        <span><h3>${esc(c.name)}</h3><span class="mute" style="font-size:14px">${c.draw.length} ${isIndividual(c)?"entries":"bands"}</span></span>
        ${picks[c.id]?.submitted?`<span class="tag green">Submitted</span>`:picks[c.id]?`<span class="tag blue">Draft</span>`:`<span class="tag grey">Pick →</span>`}</a>`).join("")}</div>`;
    return;
  }
  const c = S.byComp[r.arg]; if(!c){ location.hash="#/pick"; return; }
  const picks = LS.get("nzpb-picks", {});
  const friend = r.q.get("p") ? decodePick(c, r.q.get("p")) : null;
  const friendName = r.q.get("n") || "A friend";
  let order = picks[c.id]?.order?.length===c.draw.length ? picks[c.id].order.slice() : c.draw.map(d=>d.band);
  const me = LS.get("nzpb-me", {name:"", email:""});

  $app.innerHTML = `<a class="btn sm" href="#/pick">← All competitions</a><div style="height:18px"></div>
    ${pageH(esc(c.name), "Drag ☰ or use ▲▼")}
    ${friend ? `<div class="panel" style="margin-bottom:22px"><span class="label">${esc(friendName)}'s prediction</span>${podium(friend.slice(0,5))}
      <button class="btn sm" id="copyfriend" style="margin-top:10px">Start from their order</button></div>` : ""}
    <div class="pick-wrap">
      <ol class="sortable" id="sortable"></ol>
      <div>
        <div class="panel"><h3>Lock it in</h3>
          <div class="field"><label class="label" for="pn">Your name</label><input type="text" id="pn" value="${esc(me.name)}" autocomplete="name"></div>
          <div class="field"><label class="label" for="pe">Email</label><input type="email" id="pe" value="${esc(me.email)}" autocomplete="email"></div>
          <div class="share-row"><button class="btn primary" id="submit">Submit prediction</button><button class="btn" id="shuffle">Shuffle</button></div>
        </div>
        <div class="panel" style="margin-top:18px"><h3>Share with friends</h3>
          <div class="share-row">
            <button class="btn" id="native">Share…</button>
            <a class="btn" id="sh-fb" target="_blank" rel="noopener">Facebook</a>
            <a class="btn" id="sh-x" target="_blank" rel="noopener">X</a>
            <a class="btn" id="sh-wa" target="_blank" rel="noopener">WhatsApp</a>
            <button class="btn" id="copy">Copy link</button>
          </div></div>
      </div>
    </div>`;

  const ol = document.getElementById("sortable");
  const save = submitted => { const p = LS.get("nzpb-picks", {}); p[c.id] = { order, at:new Date().toISOString(), submitted: submitted || p[c.id]?.submitted || false }; LS.set("nzpb-picks", p); };
  const shareURL = () => { const base = (S.config.siteUrl || location.origin + location.pathname).replace(/\/$/,""); const n = document.getElementById("pn").value.trim();
    return `${base}/#/pick/${c.id}?p=${encodePick(c, order)}${n?"&n="+encodeURIComponent(n):""}`; };
  const shareText = () => `My ${c.name} prediction for the 2027 NZ Pipe Band Champs: 🥇 ${order[0]}${order[1]?" 🥈 "+order[1]:""}${order[2]?" 🥉 "+order[2]:""}. Think you can do better?`;
  const updateShare = () => { const u = encodeURIComponent(shareURL()), t = encodeURIComponent(shareText());
    document.getElementById("sh-fb").href = `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    document.getElementById("sh-x").href = `https://twitter.com/intent/tweet?text=${t}&url=${u}&hashtags=NZPipeBands`;
    document.getElementById("sh-wa").href = `https://wa.me/?text=${t}%20${u}`; };
  const draw = () => {
    ol.innerHTML = order.map((b,i) => `<li data-band="${esc(b)}"><span class="pos">${i+1}</span><span class="nm">${esc(b)}</span>
      <span class="mv"><button data-up="${i}" aria-label="Move up">▲</button><button data-dn="${i}" aria-label="Move down">▼</button></span><span class="handle" aria-hidden="true">☰</span></li>`).join("");
    ol.querySelectorAll("[data-up]").forEach(x => x.onclick = () => move(+x.dataset.up, -1));
    ol.querySelectorAll("[data-dn]").forEach(x => x.onclick = () => move(+x.dataset.dn, 1));
    updateShare(); save(false);
  };
  const move = (i, d) => { const j = i+d; if(j<0||j>=order.length) return; [order[i],order[j]]=[order[j],order[i]]; draw(); };
  enableDrag(ol, () => { order = [...ol.children].map(li => li.dataset.band); draw(); });
  draw();

  document.getElementById("pn").oninput = updateShare;
  document.getElementById("shuffle").onclick = () => { for(let i=order.length-1;i>0;i--){ const j=Math.random()*(i+1)|0; [order[i],order[j]]=[order[j],order[i]]; } draw(); };
  const cf = document.getElementById("copyfriend"); if(cf) cf.onclick = () => { order = friend.slice(); draw(); toast("Copied their order. Now make it better"); };
  document.getElementById("copy").onclick = async () => { try{ await navigator.clipboard.writeText(shareURL()); toast("Link copied"); }catch{ prompt("Copy this link", shareURL()); } };
  const nb = document.getElementById("native"); if(!navigator.share) nb.style.display = "none";
  nb.onclick = () => navigator.share({ title:"My NZ Pipe Band Champs prediction", text:shareText(), url:shareURL() }).catch(()=>{});
  document.getElementById("submit").onclick = async () => {
    const name = document.getElementById("pn").value.trim(), email = document.getElementById("pe").value.trim();
    if(!name){ toast("Add your name first"); document.getElementById("pn").focus(); return; }
    LS.set("nzpb-me", {name, email});
    const list = order.map((b,i)=>`${i+1}. ${b}`).join("\n");
    const code = encodePick(c, order);
    if(S.config.pickFormEndpoint){
      try{
        const res = await fetch(S.config.pickFormEndpoint, { method:"POST", headers:{"Content-Type":"application/json","Accept":"application/json"},
          body: JSON.stringify({ name, email, competition:c.name, order:list, code, submittedAt:new Date().toISOString(), _subject:`Pick 'em: ${c.name} – ${name}` }) });
        if(!res.ok) throw 0; save(true); toast("Prediction submitted ✓"); return;
      }catch{ toast("Couldn't submit online. Opening email instead"); }
    }
    save(true);
    location.href = `mailto:${S.config.pickEmail}?subject=${encodeURIComponent("Pick 'em: "+c.name+" – "+name)}&body=${encodeURIComponent(`${name}${email?" <"+email+">":""}\n${c.name}\n\n${list}\n\nCode: ${code}`)}`;
  };
}
function enableDrag(list, onDrop){
  list.addEventListener("pointerdown", e => {
    const h = e.target.closest(".handle"); if(!h) return;
    const li = h.closest("li"); e.preventDefault();
    const rect = li.getBoundingClientRect(); const offset = e.clientY - rect.top;
    const ph = li.cloneNode(true); ph.classList.add("ph"); li.after(ph);
    li.classList.add("dragging"); Object.assign(li.style, {position:"fixed", width:rect.width+"px", left:rect.left+"px", top:rect.top+"px"});
    h.setPointerCapture(e.pointerId);
    h.onpointermove = ev => {
      li.style.top = (ev.clientY - offset) + "px";
      const after = [...list.children].filter(x => x!==li && x!==ph).find(x => { const r = x.getBoundingClientRect(); return ev.clientY < r.top + r.height/2; });
      after ? list.insertBefore(ph, after) : list.appendChild(ph);
      if(ev.clientY < 80) scrollBy(0,-12); else if(ev.clientY > innerHeight-80) scrollBy(0,12);
    };
    h.onpointerup = h.onpointercancel = () => {
      h.onpointermove = h.onpointerup = h.onpointercancel = null;
      li.removeAttribute("style"); li.classList.remove("dragging"); ph.replaceWith(li);
      if(navigator.vibrate) navigator.vibrate(10);
      onDrop();
    };
  });
}

/* ---------- MY BANDS ---------- */
function viewMine(){
  const f = fav();
  if(!f.length){ $app.innerHTML = `${pageH("My Bands")}<div class="empty">Tap ★ next to any band to follow it. You'll get your own running order here, plus an alert when they're about to play.<br><br><a class="btn" href="#/bands">Browse bands</a></div>`; return; }
  const slots = [];
  S.comps.forEach(c => c.draw.forEach(d => { if(f.includes(d.band)) slots.push({c, d}); }));
  slots.sort((a,b) => (a.c.day+(a.d.time||a.c.start||"99")).localeCompare(b.c.day+(b.d.time||b.c.start||"99")));
  $app.innerHTML = `${pageH("My Bands", `${f.length} followed`)}
    <div class="chips" style="margin-bottom:18px">${f.map(b => `<a class="chip on" href="#/band/${S.byBand[b]?.id||""}">★ ${esc(b)}</a>`).join("")}</div>
    <table class="tbl"><thead><tr><th style="width:80px">Time</th><th>Band</th><th class="num">Order</th></tr></thead><tbody>
    ${slots.map(({c,d}) => { const st = liveState(c);
      return `<tr class="${d.band===st.now?"is-now":""} ${st.done.has(d.band)?"is-done":""}"><td class="num">${esc(d.time||"–")}</td>
      <td><div class="nm">${esc(d.band)} ${d.band===st.now?`<span class="tag live">Now</span>`:""}</div><div class="sub"><a href="#/draws?c=${c.id}">${esc(c.name)}</a>${c.circle?" · "+esc(circleName(c.circle)):""}${c.day?" · "+esc(c.day):""}</div></td>
      <td class="num">${c.provisional?"TBC":d.order}</td></tr>`; }).join("")}
    </tbody></table>
    <div style="margin-top:18px"><button class="btn" id="ics">Add to calendar</button></div>`;
  document.getElementById("ics").onclick = () => downloadICS(slots);
}
function downloadICS(slots){
  const day0 = new Date(S.config.start); const pad = n => String(n).padStart(2,"0");
  const ev = [];
  slots.filter(s => s.d.time || s.c.start).forEach(({c,d},i) => {
    const di = parseInt(c.day?.match(/\d+/)?.[0] || "1",10) - 1; const [hh,mm] = (d.time||c.start).split(":").map(Number);
    const t = new Date(day0); t.setDate(t.getDate()+di); t.setHours(hh,mm,0,0); const e = new Date(t.getTime()+15*60000);
    const f = x => `${x.getFullYear()}${pad(x.getMonth()+1)}${pad(x.getDate())}T${pad(x.getHours())}${pad(x.getMinutes())}00`;
    ev.push("BEGIN:VEVENT",`UID:nzpb27-${i}-${c.id}`,`DTSTART:${f(t)}`,`DTEND:${f(e)}`,`SUMMARY:${d.band} – ${c.name}`,`LOCATION:${S.config.venue}${c.circle?" "+circleName(c.circle):""}`,"END:VEVENT");
  });
  if(!ev.length){ toast("Times aren't published yet"); return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//NZPB Champs 2027//EN",...ev,"END:VCALENDAR"].join("\r\n")],{type:"text/calendar"}));
  a.download = "nzpb-2027-my-bands.ics"; a.click();
}

/* ---------- STEWARD CONSOLE (#/admin) – builds live.json ---------- */
function viewAdmin(){
  const L = JSON.parse(JSON.stringify(S.live || {circles:{}}));
  L.circles = L.circles || {}; ["1","2"].forEach(k => L.circles[k] = L.circles[k] || {event:"", now:"", status:"", next:[]});
  const opt = sel => `<option value="">— none —</option>` + S.comps.map(c => `<option value="${c.id}" ${c.id===sel?"selected":""}>${esc(c.name)}</option>`).join("");
  const out = () => ({ updated:new Date().toISOString().slice(0,16), headline:L.headline||"", circles:L.circles });
  const render = () => {
    $app.innerHTML = `<div class="admin">${pageH("Steward Console", "Builds data/live.json")}
    <div class="notice">This page only builds the file. Publish it by uploading it over <b>data/live.json</b> on your host, or use Publish if a save URL is set in config. Announcements are edited in index.html.</div>
    <div class="circles" style="margin-top:0">${["1","2"].map(k => { const C = L.circles[k];
      return `<div class="circle" style="--cc:${circleColor(k)}"><h2><span class="sq" style="background:${circleColor(k)}"></span>${circleName(k)}</h2>
      <div class="field"><label class="label">Competition</label><select data-k="${k}" data-f="event">${opt(C.event)}</select></div>
      <div class="field"><label class="label">Status</label><select data-k="${k}" data-f="status">${["","tuning","on the line","playing","between bands","break","finished"].map(s=>`<option ${s===C.status?"selected":""}>${s}</option>`).join("")}</select></div>
      <div class="now"><span class="label">Now</span><div class="band" style="font-size:24px">${esc(C.now||"—")}</div></div>
      <div class="share-row"><button class="btn primary" data-adv="${k}">Next band ▶</button><button class="btn" data-back="${k}">◀ Back</button></div>
      <div class="sub mute" style="margin-top:10px">Up next: ${esc((C.next||[]).join(", ")||"—")}</div></div>`; }).join("")}</div>
    <div class="panel" style="margin-top:22px"><div class="field" style="margin-top:0"><label class="label">Headline (top right of Circles page)</label><input type="text" id="hl" value="${esc(L.headline||"")}"></div></div>
    <div class="panel" style="margin-top:22px"><div class="share-row" style="margin-top:0"><button class="btn primary" id="dl">Download live.json</button><button class="btn" id="cp">Copy JSON</button>${S.config.adminSaveUrl?`<button class="btn red" id="pub">Publish now</button>`:""}</div><pre id="out"></pre></div></div>`;
    const show = () => document.getElementById("out").textContent = JSON.stringify(out(), null, 1); show();
    $app.querySelectorAll("select[data-k]").forEach(s => s.onchange = () => { const C = L.circles[s.dataset.k]; C[s.dataset.f] = s.value;
      if(s.dataset.f==="event"){ const c = S.byComp[s.value]; C.now = ""; C.status = c ? "tuning" : ""; C.next = c ? c.draw.slice(0,3).map(d=>d.band) : []; } render(); });
    $app.querySelectorAll("[data-adv],[data-back]").forEach(b => b.onclick = () => { const k = b.dataset.adv || b.dataset.back; const C = L.circles[k]; const c = S.byComp[C.event]; if(!c) return toast("Choose a competition first");
      let i = c.draw.findIndex(d => d.band === C.now); i += b.dataset.adv ? 1 : -1; i = Math.max(-1, Math.min(c.draw.length, i));
      C.now = c.draw[i]?.band || ""; C.status = C.now ? "playing" : (i>=c.draw.length ? "finished" : "tuning"); C.next = c.draw.slice(i+1, i+4).map(d=>d.band); render(); });
    document.getElementById("hl").oninput = e => { L.headline = e.target.value; show(); };
    document.getElementById("dl").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(out(),null,1)],{type:"application/json"})); a.download="live.json"; a.click(); };
    document.getElementById("cp").onclick = () => navigator.clipboard.writeText(JSON.stringify(out(),null,1)).then(()=>toast("Copied"));
    const pub = document.getElementById("pub"); if(pub) pub.onclick = async () => { const key = sessionStorage.getItem("nzpb-key") || prompt("Admin key"); if(!key) return; sessionStorage.setItem("nzpb-key", key);
      try{ const r = await fetch(S.config.adminSaveUrl, {method:"POST", headers:{"Content-Type":"application/json","X-Admin-Key":key}, body:JSON.stringify(out())}); if(!r.ok) throw new Error(r.status); toast("Published ✓"); refreshLive(false); }
      catch(e){ sessionStorage.removeItem("nzpb-key"); toast("Publish failed: "+e.message); } };
  };
  render();
}

if("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(()=>{}));
boot();
})();
