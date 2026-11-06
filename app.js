/* NZ Pipe Band Championships 2027 – live companion
   Plain JS, no build step. Data lives in /data/*.json. */
(() => {
"use strict";

const S = { config:null, bands:[], comps:[], live:null, liveSig:"", byBand:{}, byComp:{} };
const $app = document.getElementById("app");
const LS = { get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}}, set:(k,v)=>localStorage.setItem(k,JSON.stringify(v)) };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fav = () => LS.get("nzpb-fav", []);
const isFav = n => fav().includes(n);
const toggleFav = n => { const f = fav(); const i = f.indexOf(n); i<0 ? f.push(n) : f.splice(i,1); LS.set("nzpb-fav", f); toast(i<0 ? `★ Following ${n}` : `Unfollowed ${n}`); };

function toast(msg){ const t=document.getElementById("toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove("show"),2600); }
async function getJSON(u){ const r = await fetch(u + (u.includes("?")?"&":"?") + "t=" + Date.now(), {cache:"no-store"}); if(!r.ok) throw new Error(u+" "+r.status); return r.json(); }

/* ---------- data ---------- */
async function boot(){
  try{
    const [config, bands, draws] = await Promise.all([getJSON("data/config.json"), getJSON("data/bands.json"), getJSON("data/draws.json")]);
    S.config = config; S.bands = bands.bands; S.comps = draws.competitions;
    S.bands.forEach(b => S.byBand[b.name] = b);
    S.comps.forEach(c => S.byComp[c.id] = c);
    await refreshLive(true);
    setInterval(() => refreshLive(false), (config.refreshSeconds || 20) * 1000);
    document.addEventListener("visibilitychange", () => { if(!document.hidden) refreshLive(false); });
    window.addEventListener("hashchange", route);
    route();
  }catch(e){ $app.innerHTML = `<div class="empty">Couldn't load championship data. ${esc(e.message)}</div>`; }
}

async function refreshLive(first){
  try{
    const live = await getJSON(S.config.liveUrl || "data/live.json");
    const sig = JSON.stringify(live);
    const changed = sig !== S.liveSig;
    const prev = S.live; S.live = live; S.liveSig = sig;
    renderTicker();
    document.getElementById("updated").textContent = "Updated " + new Date().toLocaleTimeString("en-NZ",{hour:"numeric",minute:"2-digit"});
    if(!first && changed){
      notifyFavs(prev, live);
      const r = curRoute().name;
      if(["live","results","draws","mine"].includes(r)) route(true);
    }
  }catch(e){ document.getElementById("updated").textContent = "Offline – retrying"; }
}

function notifyFavs(prev, live){
  if(!prev) return;
  const f = fav();
  for(const k of Object.keys(live.circles||{})){
    const now = live.circles[k], was = prev.circles?.[k] || {};
    const watch = [now.now, ...(now.next||[]).slice(0,1)];
    for(const b of watch){
      if(!b || !f.includes(b)) continue;
      const wasNear = [was.now, ...(was.next||[]).slice(0,1)].includes(b);
      if(wasNear) continue;
      const msg = b === now.now ? `${b} is on now – Circle ${k}` : `${b} is up next – Circle ${k}`;
      toast("★ " + msg);
      if("Notification" in window && Notification.permission === "granted") new Notification("NZ Pipe Band Champs", {body: msg, icon:"icon.svg"});
    }
  }
}

function renderTicker(){
  const items = S.live?.ticker || [];
  const el = document.getElementById("ticker");
  el.classList.toggle("hide", !items.length);
  document.getElementById("ticker-track").innerHTML = items.map(t => `<span>${esc(t)}</span>`).join("");
}

/* ---------- helpers ---------- */
const people = b => { b = S.byBand[b]; if(!b) return ""; const p=[]; if(b.pipeMajor) p.push("PM "+b.pipeMajor); if(b.drumSergeant) p.push("L/D "+b.drumSergeant); if(b.drumMajor) p.push("DM "+b.drumMajor); return p.join(" · "); };
const setsHTML = sets => (sets||[]).map(s => `<div>${s.label?`<b>${esc(s.label)}</b>`:""}${s.tunes.map(esc).join(" · ")}</div>`).join("");
function judgesHTML(c){
  const j = c.judges || {}; const cell = (l,v) => `<div><b>${l}</b>${v ? esc(Array.isArray(v)?v.join(", "):v) : "<span class='mute'>TBC</span>"}</div>`;
  if(c.type && c.type.toLowerCase().startsWith("individual")) return `<div class="judges">${cell("Judges", [...(j.piping||[]), j.drumming, j.ensemble].filter(Boolean))}</div>`;
  return `<div class="judges">${cell("Piping", j.piping)}${cell("Drumming", j.drumming)}${cell("Ensemble", j.ensemble)}</div>`;
}
function liveState(c){
  // returns {now, done:Set} for a competition based on live.json
  const out = { now:null, done:new Set() };
  for(const k of Object.keys(S.live?.circles||{})){
    const L = S.live.circles[k]; if(L.event !== c.id) continue;
    out.now = L.now || null; out.circle = k;
    const idx = c.draw.findIndex(d => d.band === L.now);
    const nextIdx = L.next?.length ? c.draw.findIndex(d => d.band === L.next[0]) : -1;
    const cut = idx >= 0 ? idx : (nextIdx >= 0 ? nextIdx : -1);
    c.draw.forEach((d,i) => { if(cut >= 0 && i < cut) out.done.add(d.band); });
  }
  if((S.live?.results||[]).some(r => r.event === c.id)) c.draw.forEach(d => out.done.add(d.band));
  return out;
}
const circleColor = k => k == "2" ? "var(--c2)" : "var(--c1)";

/* ---------- router ---------- */
function curRoute(){
  const h = location.hash.replace(/^#\/?/, "") || "live";
  const [path, qs] = h.split("?");
  const parts = path.split("/");
  return { name: parts[0], arg: decodeURIComponent(parts[1]||""), q: new URLSearchParams(qs||"") };
}
function route(soft){
  const r = curRoute();
  document.querySelectorAll("#tabs a").forEach(a => a.classList.toggle("on", a.dataset.route === (r.name==="band"?"bands":r.name)));
  const keepY = soft ? scrollY : 0;
  const open = soft ? [...document.querySelectorAll("details[open]")].map(d=>d.id) : null;
  const views = { live:viewLive, draws:viewDraws, bands:viewBands, band:viewBand, results:viewResults, pick:viewPick, mine:viewMine, admin:viewAdmin };
  (views[r.name] || viewLive)(r);
  if(soft){ open.forEach(id => { const d=document.getElementById(id); if(d) d.open=true; }); scrollTo(0,keepY); }
  else { scrollTo(0,0); }
}

/* ---------- LIVE ---------- */
function viewLive(){
  const L = S.live || {}; const cfg = S.config;
  const start = new Date(cfg.start); const pre = Date.now() < start;
  const circles = Object.keys(L.circles || {"1":{}, "2":{}});
  $app.innerHTML = `
  <section class="hero">
    <div><div class="kicker">${esc(cfg.venue)} · Live</div>
      <h1>NZ Pipe Band <span>Championships</span> 2027</h1>
      ${L.headline ? `<div class="headline">${esc(L.headline)}</div>`:""}</div>
    ${pre ? `<div class="countdown" id="cd"></div>` : ""}
  </section>
  <div class="section-h"><h2>On the circles</h2><span class="kicker">Auto-updates every ${cfg.refreshSeconds||20}s</span></div>
  <div class="grid g2">${circles.map(k => circleCard(k, L.circles?.[k]||{})).join("")}</div>
  <div class="section-h"><h2>Live streams</h2>
    ${"Notification" in window && Notification.permission==="default" ? `<button class="btn sm" id="notif">🔔 Alert me when my bands are up</button>`:""}</div>
  <div class="streams ${cfg.streams.length<2?"one":""}">${cfg.streams.map((s,i) => streamCard(s,i)).join("")}</div>
  ${latestResult()}
  `;
  if(pre) countdown(start);
  $app.querySelectorAll("[data-yt]").forEach(b => b.onclick = () => { b.parentElement.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(b.dataset.yt)}?autoplay=1&mute=1" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="Live stream"></iframe>`; });
  $app.querySelectorAll("[data-fav]").forEach(b => b.onclick = e => { e.preventDefault(); toggleFav(b.dataset.fav); route(true); });
  const n = document.getElementById("notif"); if(n) n.onclick = () => Notification.requestPermission().then(p => { toast(p==="granted"?"Alerts on – follow bands with ★":"Alerts blocked"); route(true); });
}
function circleCard(k, L){
  const c = S.byComp[L.event];
  const color = circleColor(k);
  const status = (L.status||"").toLowerCase();
  const statusPill = status==="playing" ? `<span class="pill live">● Playing</span>` : status ? `<span class="pill">${esc(L.status)}</span>` : `<span class="pill">Idle</span>`;
  const slot = c?.draw.find(d => d.band === L.now);
  const pos = c && slot ? c.draw.indexOf(slot) + 1 : 0;
  const nextHTML = (L.next||[]).map((b,i) => {
    const s = c?.draw.find(d=>d.band===b);
    return `<li><span class="n">${i+1}</span><span>${esc(b)}</span>${isFav(b)?"<span style='color:var(--gold)'>★</span>":""}<span class="t">${esc(s?.time||"")}</span></li>`;
  }).join("");
  return `<article class="panel circle" style="--cc:${color}"><div class="bar"></div><div class="in">
    <div class="head"><h2><i></i>Circle ${k===1||k==="1"?"One":k==="2"?"Two":esc(k)}</h2>${statusPill}</div>
    <div class="event">${c ? `<a href="#/draws?c=${c.id}">${esc(c.name)}</a>` : "No event running"}</div>
    ${L.now ? `<div class="now">
        <div class="label">${status==="playing"?"Now playing":"On the line"}</div>
        <div class="band">${esc(L.now)} <button class="star ${isFav(L.now)?"on":""}" data-fav="${esc(L.now)}" aria-label="Follow">★</button></div>
        <div class="who">${esc(people(L.now))}</div>
        ${slot?.sets?.length ? `<div class="tunes-inline">${setsHTML(slot.sets)}</div>`:""}
      </div>` : `<div class="now"><div class="label">Waiting</div><div class="band mute">—</div></div>`}
    ${c ? `<div class="progress" title="${pos} of ${c.draw.length}"><span style="width:${c.draw.length?pos/c.draw.length*100:0}%"></span></div>
           <div class="kicker" style="margin-top:6px">Band ${pos||"–"} of ${c.draw.length}</div>`:""}
    ${nextHTML ? `<div class="next"><div class="kicker">Coming up</div><ol>${nextHTML}</ol></div>`:""}
  </div></article>`;
}
function streamCard(s,i){
  const has = s.youtubeId && !s.youtubeId.startsWith("REPLACE");
  return `<article class="panel stream"><div class="vid">
    ${has ? `<button data-yt="${esc(s.youtubeId)}" aria-label="Play ${esc(s.label)} stream"><span class="play">▶</span><span>Watch ${esc(s.label)}</span></button>`
          : `<div class="mute">Stream link coming soon</div>`}
    </div><div class="cap"><b>${esc(s.label)}</b>
    ${has ? `<a class="btn sm red" href="https://www.youtube.com/watch?v=${encodeURIComponent(s.youtubeId)}" target="_blank" rel="noopener">Open in YouTube</a>`:""}</div></article>`;
}
function latestResult(){
  const r = (S.live?.results||[]).slice(-1)[0]; if(!r) return "";
  const c = S.byComp[r.event];
  return `<div class="section-h"><h2>Latest result</h2><a class="btn sm" href="#/results">All results →</a></div>
    <div class="panel"><div class="kicker">${esc(c?.name||r.event)}</div>${podium(r.placings)}</div>`;
}
function countdown(start){
  const el = document.getElementById("cd"); if(!el) return;
  const tick = () => {
    if(!document.body.contains(el)) return clearInterval(h);
    let s = Math.max(0, (start - Date.now())/1000|0);
    const d = s/86400|0; s%=86400; const h2 = s/3600|0; s%=3600; const m = s/60|0; s%=60;
    el.innerHTML = [[d,"days"],[h2,"hrs"],[m,"min"],[s,"sec"]].map(([v,l]) => `<div><b>${String(v).padStart(2,"0")}</b><small>${l}</small></div>`).join("");
  };
  const h = setInterval(tick, 1000); tick();
}

/* ---------- DRAWS ---------- */
function viewDraws(r){
  const grades = [...new Set(S.comps.map(c => c.grade))];
  const g = r.q.get("g") || "All"; const focus = r.q.get("c"); const q = (r.q.get("q")||"").toLowerCase();
  const list = S.comps.filter(c => (g==="All" || c.grade===g) && (!focus || c.id===focus || g!=="All" || !r.q.has("c") ));
  const anyProv = S.comps.some(c => c.provisional);
  $app.innerHTML = `
    <div class="section-h" style="margin-top:0"><h2>Draws & judges</h2><span class="kicker">${S.comps.length} competitions · ${S.bands.length} bands</span></div>
    ${anyProv ? `<div class="notice">Provisional — entries listed alphabetically until the official draw is published. Playing order, times and judges will appear here once confirmed.</div>`:""}
    <div style="display:grid;gap:10px;margin-bottom:16px">
      <input type="search" id="dq" placeholder="Search band, Pipe Major, Drum Sergeant or tune…" value="${esc(q)}">
      <div class="chips">${["All",...grades].map(x => `<button class="chip ${x===g?"on":""}" data-g="${esc(x)}">${esc(x)}</button>`).join("")}</div>
    </div>
    <div id="comps">${list.map(c => compBlock(c, q, c.id===focus)).join("") || `<div class="empty">No competitions</div>`}</div>`;
  $app.querySelectorAll("[data-g]").forEach(b => b.onclick = () => location.hash = "#/draws" + (b.dataset.g==="All"?"":"?g="+encodeURIComponent(b.dataset.g)));
  const inp = document.getElementById("dq");
  inp.oninput = () => { const v = inp.value.toLowerCase(); document.getElementById("comps").innerHTML = list.map(c => compBlock(c, v, !!v)).join(""); bindStars(); };
  bindStars();
  if(focus){ const el = document.getElementById("comp-"+focus); if(el) setTimeout(()=>el.scrollIntoView({behavior:"smooth",block:"start"}),50); }
}
function compBlock(c, q, open){
  const st = liveState(c);
  const matches = d => !q || [d.band, people(d.band), ...(d.sets||[]).flatMap(s=>s.tunes)].join(" ").toLowerCase().includes(q);
  const rows = c.draw.filter(matches);
  if(q && !rows.length) return "";
  const running = !!st.now || Object.values(S.live?.circles||{}).some(L => L.event===c.id);
  const done = (S.live?.results||[]).some(x => x.event === c.id);
  const when = [c.day, c.start, c.circle && "Circle "+c.circle].filter(Boolean).join(" · ");
  return `<details class="panel comp" id="comp-${c.id}" ${open||running?"open":""}>
    <summary><h3>${esc(c.name)}</h3>
      <span class="meta">${running?`<span class="pill live">● Live</span>`:""}${done?`<span class="pill gold">Result in</span>`:""}
      ${c.circle?`<span class="pill c${esc(c.circle)}">Circle ${esc(c.circle)}</span>`:""}
      <span class="pill">${when?esc(when)+" · ":""}${c.draw.length} ${c.type.startsWith("Individual")?"entries":"bands"}</span>
      <a class="btn sm" href="#/pick/${c.id}" onclick="event.stopPropagation()">Pick</a></span></summary>
    ${judgesHTML(c)}
    ${rows.map(d => `<div class="draw-row ${d.band===st.now?"is-now":""} ${st.done.has(d.band)?"is-done":""} ${isFav(d.band)?"is-mine":""}">
      <div class="ord">${c.provisional?"–":d.order}</div>
      <div><div class="nm"><a href="#/band/${S.byBand[d.band]?.id||""}" style="text-decoration:none">${esc(d.band)}</a></div>
        ${people(d.band)?`<div class="ppl">${esc(people(d.band))}</div>`:""}
        ${d.sets?.length?`<div class="sets">${setsHTML(d.sets)}</div>`:""}</div>
      <div class="tm">${esc(d.time||"")}${d.circle&&d.circle!==c.circle?`<br>C${esc(d.circle)}`:""}<br><button class="star ${isFav(d.band)?"on":""}" data-fav="${esc(d.band)}" aria-label="Follow">★</button></div>
    </div>`).join("")}
  </details>`;
}
function bindStars(){ $app.querySelectorAll("[data-fav]").forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); toggleFav(b.dataset.fav); b.classList.toggle("on"); }); }

/* ---------- BANDS ---------- */
function viewBands(r){
  const q = (r.q.get("q")||"").toLowerCase();
  const draw = v => S.bands.filter(b => !v || [b.name,b.grade,b.centre,b.pipeMajor,b.drumSergeant].join(" ").toLowerCase().includes(v))
    .map(b => `<article class="panel band-card"><div class="top-row"><a href="#/band/${b.id}"><h3>${esc(b.name)}</h3></a>
      <button class="star ${isFav(b.name)?"on":""}" data-fav="${esc(b.name)}">★</button></div>
      <div class="chips"><span class="pill">${esc(b.grade.match(/^\d/)?"Grade "+b.grade:b.grade)}</span>${b.centre?`<span class="pill">${esc(b.centre)}</span>`:""}<span class="pill">${b.events.length} events</span></div>
      ${people(b.name)?`<div class="mute" style="font-size:13px">${esc(people(b.name))}</div>`:""}</article>`).join("") || `<div class="empty">No bands match</div>`;
  $app.innerHTML = `<div class="section-h" style="margin-top:0"><h2>Bands</h2><span class="kicker">${S.bands.length} entered · tap ★ to follow</span></div>
    <input type="search" id="bq" placeholder="Search bands…" value="${esc(q)}" style="margin-bottom:14px"><div class="grid g3" id="bl">${draw(q)}</div>`;
  const i = document.getElementById("bq"); i.oninput = () => { document.getElementById("bl").innerHTML = draw(i.value.toLowerCase()); bindStars(); };
  bindStars();
}
function viewBand(r){
  const b = S.bands.find(x => x.id === r.arg); if(!b) return viewBands(r);
  const comps = S.comps.filter(c => c.draw.some(d => d.band === b.name));
  $app.innerHTML = `<a class="btn sm" href="#/bands">← All bands</a>
    <div class="hero" style="margin-top:16px"><div><div class="kicker">${esc(b.grade.match(/^\d/)?"Grade "+b.grade:b.grade)}${b.centre?" · "+esc(b.centre):""}</div>
    <h1 style="font-size:clamp(24px,4vw,40px)">${esc(b.name)}</h1><div class="headline">${esc(people(b.name)) || "Band leadership TBC"}</div></div>
    <button class="btn ${isFav(b.name)?"primary":""}" id="fb">${isFav(b.name)?"★ Following":"☆ Follow"}</button></div>
    <div class="section-h"><h2>Events</h2></div>
    ${comps.map(c => { const d = c.draw.find(x=>x.band===b.name); const res = (S.live?.results||[]).find(x=>x.event===c.id); const place = res ? res.placings.indexOf(b.name)+1 : 0;
      return `<div class="panel" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
      <a href="#/draws?c=${c.id}" style="text-decoration:none"><h3>${esc(c.name)}</h3></a>
      <span class="chips">${place?`<span class="pill gold">${ordinal(place)} place</span>`:""}<span class="pill">${c.provisional?"Order TBC":"#"+d.order+" of "+c.draw.length}${d.time?" · "+esc(d.time):""}</span></span></div>
      ${d.sets?.length?`<div class="draw-row" style="padding:8px 0 0;border:0;display:block"><div class="sets">${setsHTML(d.sets)}</div></div>`:""}</div>`; }).join("")}`;
  document.getElementById("fb").onclick = () => { toggleFav(b.name); route(true); };
}
const ordinal = n => n + (["th","st","nd","rd"][(n%100-20)%10] || ["th","st","nd","rd"][n%100] || "th");

/* ---------- RESULTS ---------- */
function podium(pl){ return `<div class="podium">${(pl||[]).map((b,i) => `<div><span class="p">${i+1}</span><span>${esc(b)}</span>${isFav(b)?"<span style='color:var(--gold)'>★</span>":""}</div>`).join("")}</div>`; }
function viewResults(){
  const res = S.live?.results || [];
  const picks = LS.get("nzpb-picks", {});
  $app.innerHTML = `<div class="section-h" style="margin-top:0"><h2>Results</h2><span class="kicker">${res.length} of ${S.comps.length} events decided</span></div>
    ${res.length ? `<div class="grid g3">${res.slice().reverse().map(r => { const c = S.byComp[r.event]; const mine = picks[r.event];
      const sc = mine ? scorePick(mine.order, r.placings) : null;
      return `<article class="panel"><div class="kicker">${esc(c?.name||r.event)}</div>${podium(r.placings)}
      ${r.drumming?`<div class="mute" style="margin-top:10px;font-size:13px">🥁 Best drum corps: <b style="color:var(--ink)">${esc(r.drumming)}</b></div>`:""}
      ${r.notes?`<div class="mute" style="margin-top:6px;font-size:13px">${esc(r.notes)}</div>`:""}
      ${sc?`<div style="margin-top:10px" class="pill gold">Your pick scored ${sc.points} pts</div>`:""}</article>`; }).join("")}</div>`
    : `<div class="empty">No results yet — they'll appear here the moment they're announced.</div>`}`;
}

/* ---------- PICK 'EM ---------- */
// Scoring: 10 for correct winner, 5 per exact position, 2 per band within one place.
function scorePick(order, actual){
  let points = 0, exact = 0;
  order.forEach((b,i) => { const a = actual.indexOf(b); if(a<0) return; if(a===i){ points += 5; exact++; } else if(Math.abs(a-i)===1) points += 2; });
  if(order[0] && order[0] === actual[0]) points += 10;
  return { points, exact };
}
function encodePick(c, order){ return order.map(b => c.draw.findIndex(d => d.band===b)).map(i => i.toString(36)).join("."); }
function decodePick(c, s){ try{ const o = s.split(".").map(x => c.draw[parseInt(x,36)]?.band).filter(Boolean); return o.length===c.draw.length && new Set(o).size===o.length ? o : null; }catch{ return null; } }

function viewPick(r){
  if(!r.arg){
    const picks = LS.get("nzpb-picks", {});
    $app.innerHTML = `<div class="section-h" style="margin-top:0"><h2>Pick 'em</h2><span class="kicker">Drag bands into your predicted finishing order</span></div>
      <div class="panel" style="margin-bottom:16px;font-size:14px;line-height:1.6">Scoring: <b>10 pts</b> for the winner, <b>5 pts</b> for every band in its exact spot, <b>2 pts</b> if you're one place out. ${esc(S.config.pickDeadlineNote||"")}</div>
      <div class="grid g3">${S.comps.filter(c=>c.draw.length>1).map(c => `<a class="panel" href="#/pick/${c.id}" style="text-decoration:none;display:flex;justify-content:space-between;align-items:center;gap:8px">
        <span><b>${esc(c.name)}</b><br><span class="mute" style="font-size:13px">${c.draw.length} ${c.type.startsWith("Individual")?"entries":"bands"}</span></span>
        ${picks[c.id]?`<span class="pill gold">Picked ✓</span>`:`<span class="pill">Pick →</span>`}</a>`).join("")}</div>`;
    return;
  }
  const c = S.byComp[r.arg]; if(!c) { location.hash="#/pick"; return; }
  const picks = LS.get("nzpb-picks", {});
  const friend = r.q.get("p") ? decodePick(c, r.q.get("p")) : null;
  const friendName = r.q.get("n") || "A friend";
  let order = picks[c.id]?.order?.length===c.draw.length ? picks[c.id].order.slice() : c.draw.map(d=>d.band);
  const result = (S.live?.results||[]).find(x => x.event===c.id);
  const me = LS.get("nzpb-me", {name:"", email:""});

  $app.innerHTML = `<a class="btn sm" href="#/pick">← All competitions</a>
    <div class="section-h"><div><div class="kicker">Pick 'em</div><h2>${esc(c.name)}</h2></div><span class="kicker">Drag ☰ or use ▲▼</span></div>
    ${friend ? `<div class="panel friend"><div class="kicker">${esc(friendName)}'s prediction</div>${podium(friend.slice(0,6))}
      ${result?`<div style="margin-top:8px">They scored <b>${scorePick(friend,result.placings).points}</b> pts.</div>`:""}
      <button class="btn sm" id="copyfriend" style="margin-top:10px">Start from their order</button></div>` : ""}
    <div class="pick-wrap">
      <div><ol class="sortable" id="sortable"></ol></div>
      <div>
        ${result ? `<div class="panel" style="margin-bottom:14px"><div class="kicker">Official result</div>${podium(result.placings)}
           <div style="margin-top:12px">Your order scores</div><div class="score" id="score"></div></div>` : ""}
        <div class="panel">
          <div class="kicker">Lock it in</div>
          <div class="field"><label for="pn">Your name</label><input type="text" id="pn" value="${esc(me.name)}" autocomplete="name"></div>
          <div class="field"><label for="pe">Email (for the leaderboard)</label><input type="email" id="pe" value="${esc(me.email)}" autocomplete="email"></div>
          <div class="share-row"><button class="btn primary" id="submit">Submit prediction</button><button class="btn" id="shuffle">🎲 Shuffle</button></div>
          <div class="kicker" style="margin-top:18px">Share with friends</div>
          <div class="share-row">
            <button class="btn" id="native">📤 Share</button>
            <a class="btn" id="sh-fb" target="_blank" rel="noopener">Facebook</a>
            <a class="btn" id="sh-x" target="_blank" rel="noopener">X</a>
            <a class="btn" id="sh-wa" target="_blank" rel="noopener">WhatsApp</a>
            <button class="btn" id="copy">🔗 Copy link</button>
          </div>
        </div>
      </div>
    </div>`;

  const ol = document.getElementById("sortable");
  const draw = () => {
    ol.innerHTML = order.map((b,i) => `<li data-band="${esc(b)}"><span class="pos">${i+1}</span><span class="nm">${esc(b)}</span>
      <span class="mv"><button data-up="${i}" aria-label="Move up">▲</button><button data-dn="${i}" aria-label="Move down">▼</button></span><span class="handle" aria-hidden="true">☰</span></li>`).join("");
    ol.querySelectorAll("[data-up]").forEach(x => x.onclick = () => move(+x.dataset.up, -1));
    ol.querySelectorAll("[data-dn]").forEach(x => x.onclick = () => move(+x.dataset.dn, 1));
    if(result) document.getElementById("score").textContent = scorePick(order, result.placings).points + " pts";
    updateShare(); save(false);
  };
  const move = (i, d) => { const j = i+d; if(j<0||j>=order.length) return; [order[i],order[j]]=[order[j],order[i]]; draw(); };
  const save = (submitted) => { const p = LS.get("nzpb-picks", {}); p[c.id] = { order, at: new Date().toISOString(), submitted: submitted || p[c.id]?.submitted || false }; LS.set("nzpb-picks", p); };
  const shareURL = () => { const base = (S.config.siteUrl || location.origin + location.pathname).replace(/\/$/,""); const n = document.getElementById("pn").value.trim();
    return `${base}/#/pick/${c.id}?p=${encodePick(c, order)}${n?"&n="+encodeURIComponent(n):""}`; };
  const shareText = () => `My ${c.name} prediction for the 2027 NZ Pipe Band Champs: 🥇 ${order[0]} 🥈 ${order[1]||""}${order[2]?" 🥉 "+order[2]:""}. Think you can do better?`;
  function updateShare(){
    const u = encodeURIComponent(shareURL()), t = encodeURIComponent(shareText());
    document.getElementById("sh-fb").href = `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    document.getElementById("sh-x").href = `https://twitter.com/intent/tweet?text=${t}&url=${u}&hashtags=NZPipeBands`;
    document.getElementById("sh-wa").href = `https://wa.me/?text=${t}%20${u}`;
  }
  enableDrag(ol, () => { order = [...ol.children].map(li => li.dataset.band); draw(); });
  draw();

  document.getElementById("pn").oninput = updateShare;
  document.getElementById("shuffle").onclick = () => { for(let i=order.length-1;i>0;i--){ const j=Math.random()*(i+1)|0; [order[i],order[j]]=[order[j],order[i]]; } draw(); };
  const cf = document.getElementById("copyfriend"); if(cf) cf.onclick = () => { order = friend.slice(); draw(); toast("Copied their order — now make it better"); };
  document.getElementById("copy").onclick = async () => { try{ await navigator.clipboard.writeText(shareURL()); toast("Link copied"); }catch{ prompt("Copy this link", shareURL()); } };
  const nb = document.getElementById("native");
  if(!navigator.share) nb.style.display = "none";
  nb.onclick = () => navigator.share({ title:"My NZ Pipe Band Champs prediction", text: shareText(), url: shareURL() }).catch(()=>{});
  document.getElementById("submit").onclick = async () => {
    const name = document.getElementById("pn").value.trim(), email = document.getElementById("pe").value.trim();
    if(!name){ toast("Add your name first"); document.getElementById("pn").focus(); return; }
    LS.set("nzpb-me", {name, email});
    const payload = { name, email, competition: c.name, competitionId: c.id, order, code: encodePick(c, order), submittedAt: new Date().toISOString() };
    const body = `${name}${email?" <"+email+">":""}\n${c.name}\n\n${order.map((b,i)=>`${i+1}. ${b}`).join("\n")}\n\nCode: ${payload.code}`;
    if(S.config.pickFormEndpoint){
      try{
        const r = await fetch(S.config.pickFormEndpoint, { method:"POST", headers:{"Content-Type":"application/json","Accept":"application/json"}, body: JSON.stringify({...payload, order: order.map((b,i)=>`${i+1}. ${b}`).join("\n"), _subject:`Pick: ${c.name} – ${name}`}) });
        if(!r.ok) throw 0; save(true); toast("Prediction submitted ✓"); return;
      }catch{ toast("Couldn't submit online — opening email instead"); }
    }
    save(true);
    location.href = `mailto:${S.config.pickEmail}?subject=${encodeURIComponent("Pick 'em: "+c.name+" – "+name)}&body=${encodeURIComponent(body)}`;
  };
}

/* Pointer-based drag (mouse + touch + pen), handle only so the page still scrolls on phones */
function enableDrag(list, onDrop){
  let li=null, startY=0, ph=null, offset=0;
  list.addEventListener("pointerdown", e => {
    const h = e.target.closest(".handle"); if(!h) return;
    li = h.closest("li"); e.preventDefault();
    const rect = li.getBoundingClientRect(); offset = e.clientY - rect.top; startY = e.clientY;
    ph = li.cloneNode(true); ph.classList.add("ph"); li.after(ph);
    li.classList.add("dragging"); li.style.position="fixed"; li.style.width=rect.width+"px"; li.style.left=rect.left+"px"; li.style.top=rect.top+"px"; li.style.zIndex=30;
    h.setPointerCapture(e.pointerId);
    h.onpointermove = ev => {
      li.style.top = (ev.clientY - offset) + "px";
      const sib = [...list.children].filter(x => x!==li && x!==ph);
      const after = sib.find(x => { const r = x.getBoundingClientRect(); return ev.clientY < r.top + r.height/2; });
      after ? list.insertBefore(ph, after) : list.appendChild(ph);
      if(ev.clientY < 80) scrollBy(0,-12); else if(ev.clientY > innerHeight-80) scrollBy(0,12);
    };
    h.onpointerup = h.onpointercancel = () => {
      h.onpointermove = h.onpointerup = h.onpointercancel = null;
      li.removeAttribute("style"); li.classList.remove("dragging"); ph.replaceWith(li); ph=null;
      if(navigator.vibrate) navigator.vibrate(10);
      onDrop();
    };
  });
}

/* ---------- MY BANDS ---------- */
function viewMine(){
  const f = fav();
  if(!f.length){ $app.innerHTML = `<div class="section-h" style="margin-top:0"><h2>My bands</h2></div><div class="empty">Tap ★ next to any band to follow it. You'll get a personal running order here, plus a pop-up when they're about to play.<br><br><a class="btn" href="#/bands">Browse bands</a></div>`; return; }
  const slots = [];
  S.comps.forEach(c => c.draw.forEach(d => { if(f.includes(d.band)) slots.push({c, d}); }));
  slots.sort((a,b) => (a.c.day+(a.d.time||a.c.start||"99")).localeCompare(b.c.day+(b.d.time||b.c.start||"99")));
  const picks = LS.get("nzpb-picks", {});
  const pts = (S.live?.results||[]).reduce((s,r) => s + (picks[r.event] ? scorePick(picks[r.event].order, r.placings).points : 0), 0);
  $app.innerHTML = `<div class="section-h" style="margin-top:0"><h2>My bands</h2><span class="kicker">${f.length} followed · Pick 'em total ${pts} pts</span></div>
    <div class="chips" style="margin-bottom:14px">${f.map(b => `<a class="chip on" href="#/band/${S.byBand[b]?.id||""}" style="text-decoration:none">★ ${esc(b)}</a>`).join("")}</div>
    <div class="panel" style="padding:0">${slots.map(({c,d}) => { const st = liveState(c);
      return `<div class="draw-row ${d.band===st.now?"is-now":""} ${st.done.has(d.band)?"is-done":""}"><div class="ord">${esc(d.time||"–")}</div>
      <div><div class="nm">${esc(d.band)}</div><div class="ppl"><a href="#/draws?c=${c.id}">${esc(c.name)}</a>${c.provisional?"":" · #"+d.order}${c.circle?" · Circle "+esc(c.circle):""}${c.day?" · "+esc(c.day):""}</div></div>
      <div class="tm">${d.band===st.now?`<span class="pill live">Now</span>`:""}</div></div>`; }).join("")}</div>
    <div style="margin-top:14px"><button class="btn" id="ics">📅 Add my bands to calendar</button></div>`;
  document.getElementById("ics").onclick = () => downloadICS(slots);
}
function downloadICS(slots){
  const day0 = new Date(S.config.start); const pad = n => String(n).padStart(2,"0");
  const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//NZPB Champs 2027//EN"];
  slots.filter(s => s.d.time || s.c.start).forEach(({c,d},i) => {
    const di = parseInt(c.day?.match(/\d+/)?.[0] || "1",10) - 1; const [hh,mm] = (d.time||c.start).split(":").map(Number);
    const t = new Date(day0); t.setDate(t.getDate()+di); t.setHours(hh,mm,0,0); const e = new Date(t.getTime()+15*60000);
    const f = x => `${x.getFullYear()}${pad(x.getMonth()+1)}${pad(x.getDate())}T${pad(x.getHours())}${pad(x.getMinutes())}00`;
    lines.push("BEGIN:VEVENT",`UID:nzpb27-${i}-${c.id}`,`DTSTART:${f(t)}`,`DTEND:${f(e)}`,`SUMMARY:${d.band} – ${c.name}`,`LOCATION:${S.config.venue}${c.circle?" Circle "+c.circle:""}`,"END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  if(lines.length < 5){ toast("Times aren't published yet"); return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\r\n")],{type:"text/calendar"})); a.download = "nzpb-2027-my-bands.ics"; a.click();
}

/* ---------- ADMIN (live.json builder) ---------- */
function viewAdmin(){
  const L = JSON.parse(JSON.stringify(S.live || {circles:{}}));
  L.circles = L.circles || {}; ["1","2"].forEach(k => L.circles[k] = L.circles[k] || {event:"", now:"", status:"", next:[], stream:+k-1});
  L.results = L.results || []; L.ticker = L.ticker || [];
  const opt = (sel) => `<option value="">— none —</option>` + S.comps.map(c => `<option value="${c.id}" ${c.id===sel?"selected":""}>${esc(c.name)}</option>`).join("");
  const render = () => {
    $app.innerHTML = `<div class="admin"><div class="section-h" style="margin-top:0"><h2>Steward console</h2><span class="kicker">Builds live.json</span></div>
    <div class="notice">Changes here only build the file. Publish it by replacing <b>data/live.json</b> on your host (or use the save URL in config). See README.</div>
    <div class="grid g2">${["1","2"].map(k => { const C = L.circles[k]; const c = S.byComp[C.event];
      return `<div class="panel" style="--cc:${circleColor(k)}"><h3>Circle ${k}</h3>
      <div class="field"><label>Event</label><select data-k="${k}" data-f="event">${opt(C.event)}</select></div>
      <div class="field"><label>Status</label><select data-k="${k}" data-f="status">${["","tuning","on the line","playing","between bands","break","finished"].map(s=>`<option ${s===C.status?"selected":""}>${s}</option>`).join("")}</select></div>
      <div class="field"><label>Now: ${esc(C.now||"—")}</label></div>
      <div class="share-row"><button class="btn primary" data-adv="${k}">Next band ▶</button><button class="btn" data-back="${k}">◀ Back</button></div>
      ${c?`<div class="kicker" style="margin-top:10px">Up next: ${esc((C.next||[]).join(", ")||"—")}</div>`:""}</div>`; }).join("")}</div>
    <div class="panel" style="margin-top:14px"><div class="field"><label>Headline</label><input type="text" id="hl" value="${esc(L.headline||"")}"></div>
      <div class="field"><label>Ticker (one per line)</label><textarea id="tk">${esc(L.ticker.join("\n"))}</textarea></div></div>
    <div class="panel" style="margin-top:14px"><h3>Add result</h3><div class="field"><label>Event</label><select id="re">${opt("")}</select></div>
      <div class="field"><label>Placings — one band per line, winner first</label><textarea id="rp"></textarea></div>
      <div class="field"><label>Best drum corps (optional)</label><input type="text" id="rd"></div>
      <div class="share-row"><button class="btn" id="radd">Add result</button></div>
      <div class="kicker" style="margin-top:10px">${L.results.length} results recorded</div></div>
    <div class="panel" style="margin-top:14px"><div class="share-row"><button class="btn primary" id="dl">⬇ Download live.json</button><button class="btn" id="cp">Copy JSON</button>${S.config.adminSaveUrl?`<button class="btn red" id="pub">Publish now</button>`:""}</div><pre id="out"></pre></div></div>`;
    document.getElementById("out").textContent = JSON.stringify(out(), null, 1);
    $app.querySelectorAll("select[data-k]").forEach(s => s.onchange = () => { const C = L.circles[s.dataset.k]; C[s.dataset.f] = s.value;
      if(s.dataset.f==="event"){ const c = S.byComp[s.value]; C.now = ""; C.next = c ? c.draw.slice(0,3).map(d=>d.band) : []; } render(); });
    $app.querySelectorAll("[data-adv],[data-back]").forEach(b => b.onclick = () => { const k = b.dataset.adv || b.dataset.back; const C = L.circles[k]; const c = S.byComp[C.event]; if(!c) return;
      let i = c.draw.findIndex(d => d.band === C.now); i += b.dataset.adv ? 1 : -1; i = Math.max(-1, Math.min(c.draw.length, i));
      C.now = c.draw[i]?.band || ""; C.status = C.now ? "playing" : (i>=c.draw.length ? "finished" : "tuning"); C.next = c.draw.slice(i+1, i+4).map(d=>d.band); render(); });
    document.getElementById("hl").oninput = e => { L.headline = e.target.value; document.getElementById("out").textContent = JSON.stringify(out(),null,1); };
    document.getElementById("tk").oninput = e => { L.ticker = e.target.value.split("\n").map(x=>x.trim()).filter(Boolean); document.getElementById("out").textContent = JSON.stringify(out(),null,1); };
    document.getElementById("radd").onclick = () => { const ev = document.getElementById("re").value; const pl = document.getElementById("rp").value.split("\n").map(x=>x.trim()).filter(Boolean);
      if(!ev||!pl.length) return toast("Pick an event and add placings"); const c = S.byComp[ev]; const bad = pl.filter(b => !c.draw.some(d=>d.band===b)); if(bad.length) return toast("Not in this draw: "+bad[0]);
      L.results = L.results.filter(r=>r.event!==ev).concat([{event:ev, placings:pl, drumming:document.getElementById("rd").value.trim()}]); render(); toast("Result added"); };
    const out = () => ({...L, updated: new Date().toISOString().slice(0,16)});
    document.getElementById("dl").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(out(),null,1)],{type:"application/json"})); a.download="live.json"; a.click(); };
    document.getElementById("cp").onclick = () => navigator.clipboard.writeText(JSON.stringify(out(),null,1)).then(()=>toast("Copied"));
    const pub = document.getElementById("pub"); if(pub) pub.onclick = async () => { const key = sessionStorage.getItem("nzpb-key") || prompt("Admin key"); if(!key) return; sessionStorage.setItem("nzpb-key", key);
      try{ const r = await fetch(S.config.adminSaveUrl, {method:"POST", headers:{"Content-Type":"application/json","X-Admin-Key":key}, body: JSON.stringify(out())}); if(!r.ok) throw new Error(r.status); toast("Published ✓"); refreshLive(false); }
      catch(e){ sessionStorage.removeItem("nzpb-key"); toast("Publish failed: "+e.message); } };
  };
  render();
}

if("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(()=>{}));
boot();
})();
