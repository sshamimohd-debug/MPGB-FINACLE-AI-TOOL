const $ = (s, el=document)=>el.querySelector(s);
const $$ = (s, el=document)=>Array.from(el.querySelectorAll(s));
const norm = (s)=> (s||"").toString().trim();

let DATA=null, SOP=null;

function tokenize(q){
  q = norm(q).toLowerCase();
  // quick Hindi -> translit-ish keyword mapping (minimal but useful)
  const map = [
    ["खाता बंद","account close"],["khata band","account close"],["account close","account close"],
    ["खाता खोल","account open"],["khata khol","account open"],["account open","account open"],
    ["cif","cif"],["सीआईएफ","cif"],["ग्राहक","customer"],
    ["neft","neft"],["एनईएफटी","neft"],["rtgs","rtgs"],["आरटीजीएस","rtgs"],
    ["क्लोजर","closure"],["ओपनिंग","opening"],["बनाये","create"],["बनाना","create"]
  ];
  for(const [a,b] of map) q = q.replaceAll(a,b);
  return q.split(/[^a-z0-9]+/g).filter(Boolean);
}

function scoreChunk(tokens, text){
  const t = (text||"").toLowerCase();
  let s = 0;
  for(const tok of tokens){
    if(!tok) continue;
    if(t.includes(tok)) s += 1;
  }
  // tiny boost for menu-like tokens presence
  if(/\b[A-Z]{4,10}\b/.test(text)) s += 0.5;
  return s;
}

function topSources(query, limit=6){
  const tokens = tokenize(query);
  const scored = [];
  for(const c of DATA.chunks){
    const sc = scoreChunk(tokens, c.text);
    if(sc>0) scored.push({sc, c});
  }
  scored.sort((a,b)=>b.sc-a.sc);
  return scored.slice(0, limit).map(x=>x.c);
}

function extractMenus(sources){
  const menus = new Set();
  for(const s of sources){
    const m = (s.text||"").match(/\b[A-Z]{3,10}\b/g) || [];
    for(const x of m){
      // skip obvious words
      if(["THE","AND","FOR","WITH","FROM","THIS","THAT"].includes(x)) continue;
      // some Finacle menus are 3-8 chars
      if(x.length>=3 && x.length<=10) menus.add(x);
    }
  }
  return Array.from(menus).slice(0, 24);
}

function detectSop(query){
  // Very simple: match by keywords in SOP templates
  if(!SOP || !Array.isArray(SOP.items)) return null;
  const q = norm(query).toLowerCase();
  let best=null, bestScore=0;
  for(const it of SOP.items){
    const k = (it.keywords||[]).join(" ").toLowerCase();
    let s=0;
    if(k && q) {
      for(const w of q.split(/\s+/)) if(w && k.includes(w)) s++;
    }
    if(s>bestScore){ bestScore=s; best=it; }
  }
  return bestScore>0 ? best : null;
}

function normalizeLine(s){
  return norm(s).replace(/\s+/g," ").trim();
}

function buildStepsFromSources(query, sources, maxSteps=8){
  const tokens = tokenize(query);
  const cand = [];
  for(const s of sources){
    const raw = (s.text||"");
    // split on bullets / newlines first
    const parts = raw.split(/\r?\n|•|\u2022|\t|\s{2,}/g);
    for(let p of parts){
      p = normalizeLine(p);
      if(!p) continue;
      // ignore very short/very long fragments
      if(p.length < 18 || p.length > 220) continue;
      // ignore obvious noise
      if(/^page\s*\d+/i.test(p)) continue;
      const sc = scoreChunk(tokens, p);
      if(sc <= 0) continue;
      cand.push({sc, line:p});
    }
  }
  cand.sort((a,b)=>b.sc-a.sc);

  const out = [];
  const seen = new Set();
  for(const c of cand){
    const k = c.line.toLowerCase();
    if(seen.has(k)) continue;
    seen.add(k);
    out.push(c.line);
    if(out.length >= maxSteps) break;
  }
  return out;
}

function uniqueTopSources(query, limit=8){
  const src = topSources(query, Math.max(limit*2, 12));
  const out = [];
  const seen = new Set();
  for(const s of src){
    const key = `${s.pdf}::${s.page}`;
    if(seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if(out.length >= limit) break;
  }
  return out;
}

function renderAnswer(query){
  const sources = uniqueTopSources(query, 8);
  const menus = extractMenus(sources);
  const steps = buildStepsFromSources(query, sources, 8);

  // template fallback ONLY if PDF text couldn't produce enough steps
  const sop = (steps.length >= 3) ? null : detectSop(query);

  const ans = $("#answer");
  ans.innerHTML = "";

  // Title
  const title = document.createElement("div");
  title.className="card";
  title.innerHTML = `
    <h2>SOP / Steps <span class="small">• ${steps.length ? "PDF-based" : (sop ? "template + PDFs" : "no PDF text match")}</span></h2>
    <div class="small">Query: <b>${escapeHtml(query)}</b></div>
  `;
  ans.appendChild(title);

  // PDF-based steps
  const stepCard = document.createElement("div");
  stepCard.className="card";
  stepCard.innerHTML = `<h2>PDF-based Steps</h2><div class="small">Steps are auto-picked from matching PDF pages.</div>`;
  if(steps.length){
    const ol = document.createElement("ol");
    ol.className="steps";
    ol.innerHTML = steps.map(x=>`<li>${escapeHtml(x)}</li>`).join("");
    stepCard.appendChild(ol);
  }else{
    const p = document.createElement("div");
    p.className="small";
    p.innerHTML = `No matching text found in indexed PDFs for this query (some PDFs may be scanned/images). Use <b>PDF Library</b> tab to open PDFs manually.`;
    stepCard.appendChild(p);
  }
  ans.appendChild(stepCard);

  // Template steps (fallback)
  if(sop){
    const t = document.createElement("div");
    t.className="card";
    t.innerHTML = `
      <h2>Quick Template (Verify with PDFs) <span class="small">• fallback</span></h2>
      <div class="small"><b>${escapeHtml(sop.title_hi)}</b> <span class="small">/ ${escapeHtml(sop.title_en)}</span></div>
      <div class="hr"></div>
      <ol class="steps">${(sop.steps_hi||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ol>
      <div class="small">Tip: नीचे दिए PDF references से exact SOP verify करें।</div>
    `;
    ans.appendChild(t);
  }

  // Menus / commands
  const menuCard = document.createElement("div");
  menuCard.className="card";
  menuCard.innerHTML = `<h2>Finacle Menus / Commands</h2><div class="small">Auto-extracted from matched pages (best effort).</div>`;
  if(menus.length){
    const wrap = document.createElement("div");
    wrap.className="menuWrap";
    wrap.innerHTML = menus.slice(0,18).map(m=>`<span class="menu">${escapeHtml(m)}</span>`).join("");
    menuCard.appendChild(wrap);
  }else{
    const p = document.createElement("div");
    p.className="small";
    p.textContent = "No menu codes detected in matching chunks.";
    menuCard.appendChild(p);
  }
  ans.appendChild(menuCard);

  // Sources
  const srcWrap = document.createElement("div");
  srcWrap.id="sources";
  const srcCard = document.createElement("div");
  srcCard.className="card";
  srcCard.innerHTML = `<h2>Sources (PDF pages)</h2><div class="small">Open exact page or download the PDF.</div>`;
  srcWrap.appendChild(srcCard);
  ans.appendChild(srcWrap);

  if(!sources.length){
    const none = document.createElement("div");
    none.className="src";
    none.innerHTML = `<div class="small">No PDF page matched. Try different keywords (e.g., menu code) or open PDF Library.</div>`;
    srcCard.appendChild(none);
    return;
  }

  for(const s of sources){
    const fileEnc = encodeURIComponent(s.pdf);
    const openUrl = `viewer.html?file=pdfs/${fileEnc}&page=${encodeURIComponent(s.page)}`;
    const dlUrl = `pdfs/${fileEnc}`;
    const box = document.createElement("div");
    box.className="src";
    box.innerHTML = `
      <div class="srcTop">
        <div><b>${escapeHtml(s.pdf)}</b> <span class="small">• Page ${escapeHtml(s.page)}</span></div>
        <div class="btns">
          <a class="btn" href="${openUrl}" target="_blank" rel="noopener">Open page</a>
          <a class="btn" href="${dlUrl}" download>Download</a>
        </div>
      </div>
      <div class="snippet">${escapeHtml(snippet(s.text, query))}</div>
    `;
    srcCard.appendChild(box);
  }
}

function renderPdfLibrary(filter=""){
  const q = norm(filter).toLowerCase();
  const rows = $("#pdfRows");
  rows.innerHTML = "";
  const list = DATA.pdf_meta
    .filter(x=>!q || x.pdf.toLowerCase().includes(q))
    .sort((a,b)=>a.pdf.localeCompare(b.pdf));
  $("#pdfCount").textContent = `${list.length} PDFs`;

  for(const p of list){
    const file = encodeURIComponent(p.pdf);
    const openUrl = `viewer.html?file=pdfs/${file}&page=1`;
    const dlUrl = `pdfs/${file}`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.pdf}</td>
      <td>${p.pages}</td>
      <td class="btns">
        <a class="btn" href="${openUrl}" target="_blank" rel="noopener">Open</a>
        <a class="btn" href="${dlUrl}" download>Download</a>
      </td>`;
    rows.appendChild(tr);
  }
}

function setQuery(q){
  $("#q").value = q;
  $("#q").focus();
  renderAnswer(q);
}

async function init(){
  const [d,s] = await Promise.all([
    fetch("data/finacle_index.json").then(r=>r.json()),
    fetch("data/sops.json").then(r=>r.json())
  ]);
  DATA=d; SOP=s;

  // Quick chips
  const chips = [
    "NEFT kaise kare",
    "RTGS kaise kare",
    "Account close kaise kare",
    "Account open kaise kare",
    "CIF kaise banaye",
    "HACM menu kya hai",
    "FORM 60",
    "DNS removal"
  ];
  $("#chips").innerHTML = chips.map(c=>`<span class="pill" onclick="setQuery('${c.replace(/'/g,"\\'")}')">${c}</span>`).join("");

  // initial render
  renderPdfLibrary("");
}

$("#ask").addEventListener("click", ()=>{
  const q = $("#q").value;
  if(!norm(q)) return;
  renderAnswer(q);
});

$("#q").addEventListener("keydown", (e)=>{
  if(e.key==="Enter"){ e.preventDefault(); $("#ask").click(); }
});

$("#tabAssistant").addEventListener("click", ()=>switchTab("assistant"));
$("#tabLibrary").addEventListener("click", ()=>switchTab("library"));

$("#pdfSearch").addEventListener("input", (e)=>renderPdfLibrary(e.target.value));

function escapeHtml(s){
  return (s??"").toString().replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function snippet(text, query){
  const t = (text||"").toString().replace(/\s+/g," ").trim();
  if(!t) return "";
  const q = norm(query).toLowerCase();
  const i = t.toLowerCase().indexOf(q.split(/\s+/)[0] || "");
  if(i>=0){
    const a = Math.max(0, i-80);
    const b = Math.min(t.length, i+260);
    return (a>0?"…":"") + t.slice(a,b) + (b<t.length?"…":"");
  }
  return t.slice(0, 320) + (t.length>320?"…":"");
}

window.copyText = async (t)=>{
  try{ await navigator.clipboard.writeText(t); toast(`Copied: ${t}`); }
  catch{ toast(`Copy failed. ${t}`); }
};

let toastTimer=null;
function toast(msg){
  const el = $("#toast");
  el.textContent = msg;
  el.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{el.style.opacity="0";}, 1400);
}

function switchTab(id){
  $$(".tab").forEach(x=>x.classList.toggle("active", x.dataset.tab===id));
  $$(".tabPage").forEach(x=>x.style.display = (x.id===id ? "block" : "none"));
}

init();
