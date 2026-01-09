// app.js — FINAL (Hard Enquiry Templates + PDF-based Search + Clean Menus + Collapsible Sources)

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const norm = (s) => (s || "").toString().trim();

let DATA = null, SOP = null;

/* =========================
   Query tokenization + normalization
========================= */
function tokenize(q) {
  q = norm(q).toLowerCase();

  // Hindi/Hinglish normalization (expand freely)
  const map = [
    // Account open/close
    ["खाता बंद", "account close"],
    ["khata band", "account close"],
    ["account band", "account close"],
    ["account close", "account close"],

    ["खाता खोल", "account open"],
    ["khata khol", "account open"],
    ["account open", "account open"],

    // CIF
    ["सीआईएफ", "cif"],
    ["cif", "cif"],
    ["ग्राहक", "customer"],

    // NEFT/RTGS
    ["एनईएफटी", "neft"],
    ["neft", "neft"],
    ["आरटीजीएस", "rtgs"],
    ["rtgs", "rtgs"],

    // UTR/inquiry
    ["यूटीआर", "utr"],
    ["utr", "utr"],
    ["inquiry", "inquire"],
    ["inquire", "inquire"],
    ["पूछताछ", "inquire"],

    // Nominee/Nomination (IMPORTANT)
    ["nominee", "nomination"],
    ["nomination", "nomination"],
    ["registered nominee", "nomination"],
    ["नामिनी", "nomination"],
    ["नॉमिनी", "nomination"],
    ["नामांकन", "nomination"],

    // Balance / status (helpful)
    ["बैलेंस", "balance"],
    ["उपलब्ध राशि", "balance"],
    ["खाता स्थिति", "account status"],
    ["डॉर्मेंट", "dormant"],
    ["फ्रीज", "freeze"],

    // Transfer
    ["फंड ट्रांसफर", "fund transfer"],
    ["fund transfer", "fund transfer"],
    ["transfer", "fund transfer"],

    ["क्लोजर", "closure"],
    ["ओपनिंग", "opening"],
    ["बनाये", "create"],
    ["बनाना", "create"],
    ["कैसे", "how"],
    ["करना", "do"],
  ];

  for (const [a, b] of map) q = q.replaceAll(a, b);

  return q.split(/[^a-z0-9]+/g).filter(Boolean);
}

function topicHints(tokens) {
  const set = new Set(tokens);
  return {
    neft: set.has("neft"),
    rtgs: set.has("rtgs"),
    utr: set.has("utr") || set.has("inquire"),
    cif: set.has("cif"),
    close: set.has("close") || set.has("closure"),
    open: set.has("open") || set.has("opening"),
    hacm: set.has("hacm"),
    dns: set.has("dns"),
    form60: set.has("form60") || (set.has("form") && set.has("60")),
    nominee: set.has("nomination"),
    balance: set.has("balance"),
    status:
      (set.has("status") || set.has("dormant") || set.has("freeze")) ||
      (tokens.join(" ").includes("account") && tokens.join(" ").includes("status")),
  };
}

function isMatch(q, arr) {
  q = (q || "").toLowerCase();
  return arr.some((x) => q.includes(x));
}

function openPdfLink(pdfFile, page) {
  const fileEnc = encodeURIComponent(pdfFile);
  return {
    openUrl: `viewer.html?file=pdfs/${fileEnc}&page=${encodeURIComponent(page || 1)}`,
    dlUrl: `pdfs/${fileEnc}`,
  };
}

// Auto-detect booklet PDF name (so you don't worry about exact filename)
function detectBookletPdf() {
  if (!DATA?.pdf_meta) return null;
  const candidates = DATA.pdf_meta
    .map((x) => x.pdf)
    .filter(Boolean)
    .filter((n) => {
      const s = n.toLowerCase();
      // detect Finacle booklet names
      return (
        (s.includes("booklet") || s.includes("job card") || s.includes("menu")) &&
        (s.includes("finacle") || s.includes("10x") || s.includes("10."))
      );
    });
  if (candidates.length) return candidates[0];
  // fallback: any pdf containing 'booklet'
  const c2 = DATA.pdf_meta.map((x) => x.pdf).find((n) => (n || "").toLowerCase().includes("booklet"));
  return c2 || null;
}

function isPdfRelevant(pdfName, hints) {
  const n = (pdfName || "").toLowerCase();

  // NOMINATION: Prefer booklet strongly
  if (hints.nominee) {
    if (n.includes("booklet") || n.includes("job card") || n.includes("menu")) return true;
    if (n.includes("nomination") || n.includes("nominee")) return true;
    // avoid mixing with unrelated SOPs
    return false;
  }

  // If user asked NEFT/RTGS:
  if (hints.neft || hints.rtgs) {
    // Strong allow
    if (n.includes("hpordm")) return true;
    if (n.includes("neft") || n.includes("rtgs")) return true;
    if (n.includes("fund") || n.includes("transfer") || n.includes("payment") || n.includes("ord")) return true;
    if (hints.utr && (n.includes("utr") || n.includes("inquire"))) return true;

    // Block obvious unrelated categories (to stop list spam)
    const block = [
      "acctpani",
      "pan",
      "adcreq",
      "card",
      "debit",
      "rupay",
      "atm",
      "locker",
      "loan",
      "cibil",
      "dns",
      "tds",
      "hacm",
      "form60",
      "cif",
    ];
    if (block.some((x) => n.includes(x))) return false;

    // Otherwise allow (neutral)
    return true;
  }

  // CIF
  if (hints.cif) {
    if (n.includes("cif") || n.includes("corporate") || n.includes("kyc")) return true;
    // block unrelated noise for cif query
    const block = ["hpordm", "neft", "rtgs", "acctpani", "pan", "card", "adcreq"];
    if (block.some((x) => n.includes(x))) return false;
    return true;
  }

  // Account close/open
  if (hints.close) {
    if (n.includes("close") || n.includes("closure") || n.includes("hcaac") || n.includes("acclose")) return true;
    const block = ["hpordm", "neft", "rtgs", "acctpani", "pan", "card", "adcreq"];
    if (block.some((x) => n.includes(x))) return false;
    return true;
  }
  if (hints.open) {
    if (n.includes("open") || n.includes("opening") || n.includes("account")) return true;
    const block = ["hpordm", "neft", "rtgs", "acctpani", "pan", "card", "adcreq"];
    if (block.some((x) => n.includes(x))) return false;
    return true;
  }

  // HACM
  if (hints.hacm) {
    if (n.includes("hacm")) return true;
    const block = ["hpordm", "neft", "rtgs", "acctpani", "pan", "card", "adcreq"];
    if (block.some((x) => n.includes(x))) return false;
    return true;
  }

  // DNS removal
  if (hints.dns) {
    if (n.includes("dns")) return true;
    return true;
  }

  // FORM 60
  if (hints.form60) {
    if (n.includes("form60") || n.includes("form 60") || n.includes("form_60")) return true;
    return true;
  }

  // Default: allow
  return true;
}

/* =========================
   Scoring + Ranking
========================= */
function scoreChunk(tokens, text, metaPdf = "") {
  const t = (text || "").toLowerCase();
  const pdf = (metaPdf || "").toLowerCase();
  let s = 0;

  // keyword match in text
  for (const tok of tokens) {
    if (!tok) continue;
    if (t.includes(tok)) s += 1;
  }

  // boost if keyword appears in filename
  for (const tok of tokens) {
    if (tok && pdf.includes(tok)) s += 0.6;
  }

  // SOP/process pattern boost
  if (
    /\binvoke menu\b|\bmenu\b|\bfunction code\b|\bselect\b|\benter\b|\bfetch\b|\bauthoris|\bsubmit\b|\bdebit\b|\bcredit\b|\bbeneficiary\b/i.test(
      t
    )
  ) {
    s += 1.2;
  }

  // penalize boilerplate headers
  if (/madhya pradesh gramin bank|a joint venture|govt of india|bank of india/i.test(t)) s -= 1.8;

  return s;
}

/* =========================
   Get top matching unique PDF pages (filtered + boosted)
========================= */
function uniqueTopSources(query, limit = 10) {
  const tokens = tokenize(query);
  const hints = topicHints(tokens);

  const scored = [];
  for (const c of DATA.chunks) {
    if (!isPdfRelevant(c.pdf, hints)) continue;

    let sc = scoreChunk(tokens, c.text, c.pdf);
    if (sc <= 0) continue;

    const pdf = (c.pdf || "").toLowerCase();
    const txt = (c.text || "").toLowerCase();

    // Topic boosts
    if (hints.neft || hints.rtgs) {
      if (pdf.includes("hpordm")) sc += 3.5;
      if (pdf.includes("neft") || pdf.includes("rtgs")) sc += 2.0;
      if (pdf.includes("fund") || pdf.includes("transfer") || pdf.includes("payment") || pdf.includes("ord")) sc += 1.2;
      if (hints.utr && (pdf.includes("utr") || pdf.includes("inquire"))) sc += 2.0;
    }

    if (hints.nominee) {
      if (pdf.includes("booklet") || pdf.includes("job card") || pdf.includes("menu")) sc += 3.0;
      if (txt.includes("haci")) sc += 4.0;
      if (txt.includes("nomination")) sc += 2.5;
    }

    if (hints.cif) {
      if (pdf.includes("cif") || pdf.includes("corporate") || pdf.includes("kyc")) sc += 2.0;
    }
    if (hints.close) {
      if (pdf.includes("close") || pdf.includes("closure") || pdf.includes("hcaac") || pdf.includes("acclose")) sc += 2.0;
    }
    if (hints.open) {
      if (pdf.includes("open") || pdf.includes("opening") || pdf.includes("account")) sc += 1.0;
    }

    scored.push({ sc, c });
  }

  scored.sort((a, b) => b.sc - a.sc);

  // unique by pdf+page
  const out = [];
  const seen = new Set();
  for (const x of scored) {
    const s = x.c;
    const key = `${s.pdf}::${s.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= limit) break;
  }

  return out;
}

/* =========================
   Menu extraction (remove junk, prefer MENU context)
========================= */
function extractMenus(sources, queryTokens = []) {
  const stop = new Set([
    // junk english
    "SNM",
    "CLICK",
    "SUBMIT",
    "THEN",
    "SYSTEM",
    "WILL",
    "DISPLAY",
    "DETAILS",
    "ENTERED",
    "INWARD",
    "INQUIRE",
    "REMOVE",
    "PREFILLED",
    "FIELD",
    "SOL",
    "KEEP",
    "BLANK",
    "ENTER",
    "NEXT",
    "SELECT",
    "AMOUNT",
    "CUSTOMER",
    "ACCOUNT",
    "CREDIT",
    "DEBIT",
    "OPTION",
    "TAB",
    "NO",
    "YES",
    "ADD",
    "FETCH",
    "CHARGE",
    "OUR",
    "LINE",
    "THE",
    "AND",
    "FOR",
    "WITH",
    "FROM",
    "THIS",
    "THAT",
    "WHEN",
    "WHAT",
    "WHERE",
    "WHY",
    "HOW",
    "MUST",
    "SHALL",
    "NOTE",
    "ONLY",
    "PLEASE",
    "DONE",
    "DO",
    "TO",
    "IN",
    "ON",
    "OF",
    "AS",
    // topic words that are not menu codes
    "NEFT",
    "RTGS",
    "UTR",
  ]);

  const count = new Map();

  for (const s of sources) {
    const txt = s.text || "";
    const m = txt.match(/\b[A-Z]{3,10}\b/g) || [];

    for (const x of m) {
      if (stop.has(x)) continue;
      if (x.length < 3 || x.length > 10) continue;

      let w = 1;

      // strong preference if "menu" nearby
      if (new RegExp(`menu[^A-Z]{0,15}${x}|${x}[^A-Z]{0,15}menu`, "i").test(txt)) w += 3;

      // small boost if query tokens exist in same chunk
      const low = txt.toLowerCase();
      for (const tok of queryTokens) {
        if (tok && low.includes(tok)) {
          w += 0.3;
          break;
        }
      }

      count.set(x, (count.get(x) || 0) + w);
    }
  }

  return Array.from(count.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k]) => k);
}

/* =========================
   SOP template fallback (only if PDF steps weak)
========================= */
function detectSopFallback(query) {
  if (!SOP || !Array.isArray(SOP.items)) return null;
  const q = norm(query).toLowerCase();

  let best = null,
    bestScore = 0;

  for (const it of SOP.items) {
    const k = (it.keywords || []).join(" ").toLowerCase();
    let s = 0;
    for (const w of q.split(/\s+/)) if (w && k.includes(w)) s++;
    if (s > bestScore) {
      bestScore = s;
      best = it;
    }
  }

  return bestScore > 0 ? best : null;
}

function normalizeLine(s) {
  return norm(s).replace(/\s+/g, " ").trim();
}

/* =========================
   Build clean SOP steps from matched pages
========================= */
function buildStepsFromSources(query, sources, maxSteps = 8) {
  const tokens = tokenize(query);
  const hints = topicHints(tokens);
  const qlow = (query || "").toLowerCase();

  const isNoise = (line) => {
    const l = line.toLowerCase();
    if (/madhya pradesh gramin bank|a joint venture|govt of india|bank of india/i.test(l)) return true;
    if (/copyright|all rights reserved|page\s*\d+/i.test(l)) return true;
    if (/pan inquiry|acctpani/i.test(l)) return true;
    return false;
  };

  const looksLikeStep = (line) => {
    const l = line.toLowerCase();
    return (
      /\bmenu\b|\binvoke\b|\bfunction\b|\bselect\b|\benter\b|\bfetch\b|\bsubmit\b|\bauthoris|\bdebit\b|\bcredit\b|\bbeneficiary\b|\bcharge\b|\boption\b|\btab\b/.test(
        l
      ) || /\bHPORDM\b|\bNEFT\b|\bRTGS\b/i.test(line)
    );
  };

  // For hard enquiry types, do not generate SOP steps from PDFs (we show templates)
  if (hints.nominee || hints.balance || hints.status) return [];

  // Prefer top sources only (avoid unrelated SOP mixing)
  const orderedLimited = sources.slice(0, 4);

  const cand = [];
  for (const s of orderedLimited) {
    const raw = s.text || "";
    const parts = raw.split(/\r?\n|•|\u2022/g);

    for (let p of parts) {
      p = normalizeLine(p);
      if (!p) continue;

      if (p.length < 18 || p.length > 220) continue;
      if (isNoise(p)) continue;

      const low = p.toLowerCase();
      const hasToken = tokens.some((t) => t && low.includes(t));
      const stepLike = looksLikeStep(p);

      if (!hasToken && !stepLike) continue;

      // extra relevance for NEFT/RTGS words when asked
      let extra = 0;
      if ((hints.rtgs || qlow.includes("rtgs")) && low.includes("rtgs")) extra += 1.2;
      if ((hints.neft || qlow.includes("neft")) && low.includes("neft")) extra += 1.2;
      if (hints.utr && (low.includes("utr") || low.includes("inward") || low.includes("outward") || low.includes("inquire"))) extra += 1.0;

      // avoid clearly unrelated step-lines for NEFT/RTGS
      if ((hints.neft || hints.rtgs) && /(pan|acctpani|rupay|debit card|atm|adcreq)/i.test(p)) continue;

      const sc = scoreChunk(tokens, p, s.pdf) + extra;
      if (sc <= 0) continue;

      cand.push({ sc, line: p });
    }
  }

  cand.sort((a, b) => b.sc - a.sc);

  const out = [];
  const seen = new Set();
  for (const c of cand) {
    const k = c.line.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c.line);
    if (out.length >= maxSteps) break;
  }

  return out;
}

/* =========================
   UI helpers
========================= */
function escapeHtml(s) {
  return (s ?? "").toString().replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function snippet(text, query) {
  const t = (text || "").toString().replace(/\s+/g, " ").trim();
  if (!t) return "";
  const first = norm(query).toLowerCase().split(/\s+/)[0] || "";
  const i = first ? t.toLowerCase().indexOf(first) : -1;
  if (i >= 0) {
    const a = Math.max(0, i - 80);
    const b = Math.min(t.length, i + 260);
    return (a > 0 ? "…" : "") + t.slice(a, b) + (b < t.length ? "…" : "");
  }
  return t.slice(0, 320) + (t.length > 320 ? "…" : "");
}

function toast(msg) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = "1";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    el.style.opacity = "0";
  }, 1400);
}

function switchTab(id) {
  $$(".tab").forEach((x) => x.classList.toggle("active", x.dataset.tab === id));
  $$(".tabPage").forEach((x) => (x.style.display = x.id === id ? "block" : "none"));
}

/* =========================
   Render Enquiry Template Card (Hard Rules)
========================= */
function renderEnquiryCard({ queryRaw, title, menu, steps, pdf, page, note }) {
  const ans = $("#answer");
  const { openUrl, dlUrl } = openPdfLink(pdf, page);

  ans.innerHTML = `
    <div class="card">
      <h2>${escapeHtml(title)}</h2>
      <div class="small">Query: <b>${escapeHtml(queryRaw)}</b></div>
      <div class="hr"></div>

      <h3>⭐ Finacle Menu / Command</h3>
      <div class="menuWrap">
        <span class="menu">⭐ ${escapeHtml(menu)}</span>
      </div>

      <h3>Step-by-step</h3>
      <ol class="steps">
        ${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}
      </ol>

      ${note ? `<div class="small">${escapeHtml(note)}</div>` : ""}

      <div class="hr"></div>
      <h3>Reference (PDF)</h3>
      <div class="src">
        <div class="srcTop">
          <div><b>${escapeHtml(pdf)}</b> <span class="small">• Page ${escapeHtml(page)}</span></div>
          <div class="btns">
            <a class="btn" href="${openUrl}" target="_blank" rel="noopener">Open page</a>
            <a class="btn" href="${dlUrl}" download>Download</a>
          </div>
        </div>
        <div class="snippet small">Official reference from booklet/SOP. Use this to verify fields/tabs.</div>
      </div>
    </div>
  `;
}

/* =========================
   Render Answer (Hard Rules first, else PDF-based)
========================= */
function renderAnswer(query) {
  const ans = $("#answer");
  if (!ans) return;

  if (!DATA) {
    ans.innerHTML = `<div class="card"><h2>Loading…</h2><div class="small">Please wait.</div></div>`;
    return;
  }

  const qRaw = norm(query);
  const q = qRaw.toLowerCase();
  const tokens = tokenize(qRaw);
  const hints = topicHints(tokens);

  // Detect booklet for references
  const BOOKLET = detectBookletPdf();

  // ---------- HARD ENQUIRY ROUTES (always step-by-step templates) ----------
  // 1) Nominee / Nomination
  if (hints.nominee || isMatch(q, ["nominee", "nomination", "नामिनी", "नामांकन", "registered nominee"])) {
    if (!BOOKLET) {
      ans.innerHTML = `<div class="card"><h2>Nominee Details</h2><div class="small">Booklet PDF not detected in pdfs/ folder.</div></div>`;
      return;
    }
    renderEnquiryCard({
      queryRaw: qRaw,
      title: "Registered Nominee Details (SB/CA)",
      menu: "HACI",
      steps: [
        "Menu invoke करें: HACI",
        "SB/CA Account Number enter करें और Submit/Enter करें",
        "Tabs में जाएँ: Nomination",
        "Nominee Name, Relationship, Nomination % और (अगर minor) Guardian details देखें",
      ],
      pdf: BOOKLET,
      page: 107, // if your booklet page differs, adjust here
      note: "Nominee/Nomination enquiry account-level होती है, इसलिए यह fixed enquiry template है (PDF mixing नहीं).",
    });
    return;
  }

  // 2) Balance enquiry
  if (
    hints.balance ||
    isMatch(q, ["balance", "bal", "baki", "available", "withdrawable", "बैलेंस", "उपलब्ध राशि", "kitna balance"])
  ) {
    if (!BOOKLET) {
      ans.innerHTML = `<div class="card"><h2>Balance Enquiry</h2><div class="small">Booklet PDF not detected in pdfs/ folder.</div></div>`;
      return;
    }
    renderEnquiryCard({
      queryRaw: qRaw,
      title: "Account Balance Enquiry (SB/CA)",
      menu: "HACI",
      steps: [
        "Menu invoke करें: HACI",
        "Account Number enter करें और Submit करें",
        "General/Balance details देखें (Available/Withdrawable balance)",
        "अगर hold/lien है तो Lien tab भी check करें",
      ],
      pdf: BOOKLET,
      page: 103, // placeholder: adjust if you want exact page
      note: "Role-based view में tabs अलग दिख सकते हैं—लेकिन enquiry approach same रहेगा।",
    });
    return;
  }

  // 3) Account status / Dormant / Freeze
  if (hints.status || isMatch(q, ["account status", "status", "dormant", "inactive", "freeze", "stop", "खाता स्थिति", "डॉर्मेंट", "फ्रीज"])) {
    if (!BOOKLET) {
      ans.innerHTML = `<div class="card"><h2>Account Status Enquiry</h2><div class="small">Booklet PDF not detected in pdfs/ folder.</div></div>`;
      return;
    }
    renderEnquiryCard({
      queryRaw: qRaw,
      title: "Account Status Enquiry (SB/CA)",
      menu: "HACI",
      steps: [
        "Menu invoke करें: HACI",
        "Account Number enter करें और Submit करें",
        "General tab में account status देखें (Active/Dormant/Inactive/Freeze आदि)",
        "अगर debit/credit restrictions हों तो remarks/flags भी देखें",
      ],
      pdf: BOOKLET,
      page: 103, // placeholder: adjust if you want exact page
      note: "Status enquiry account-level होती है; CIF enquiry menus में status अलग तरीके से दिख सकता है।",
    });
    return;
  }

  // 4) CIF details enquiry (template)
  if (hints.cif || isMatch(q, ["cif details", "customer details", "ग्राहक विवरण", "सीआईएफ details"])) {
    // CIF booklet page might differ; we still provide template with booklet link at page 1
    if (!BOOKLET) {
      ans.innerHTML = `<div class="card"><h2>CIF Enquiry</h2><div class="small">Booklet PDF not detected in pdfs/ folder.</div></div>`;
      return;
    }
    renderEnquiryCard({
      queryRaw: qRaw,
      title: "CIF / Customer Details Enquiry",
      menu: "HCUDET",
      steps: [
        "Menu invoke करें: HCUDET",
        "CIF ID / Customer ID enter करें और Submit करें",
        "Name, DOB/DOI, PAN/Aadhaar, Address, KYC status देखें",
        "अगर multiple CIF/merge issue हो तो remarks/links check करें",
      ],
      pdf: BOOKLET,
      page: 1,
      note: "Nominee details account-level enquiry (HACI) में आता है, CIF enquiry अलग है।",
    });
    return;
  }
  // ---------- END HARD ENQUIRY ROUTES ----------

  // ---------- PDF-based answer for all other queries ----------
  const sources = uniqueTopSources(qRaw, 10);
  const menus = extractMenus(sources, tokens);
  const steps = buildStepsFromSources(qRaw, sources, 8);
  const sop = steps.length >= 3 ? null : detectSopFallback(qRaw);

  ans.innerHTML = "";

  // Header
  const head = document.createElement("div");
  head.className = "card";
  head.innerHTML = `
    <h2>SOP / Steps <span class="small">• ${steps.length ? "PDF-based" : sop ? "template + PDFs" : "no PDF match"}</span></h2>
    <div class="small">Query: <b>${escapeHtml(qRaw)}</b></div>
  `;
  ans.appendChild(head);

  // Menus FIRST
  const menuCard = document.createElement("div");
  menuCard.className = "card";
  menuCard.innerHTML = `<h2>Suggested Finacle Menu / Command</h2><div class="small">Top matched from relevant PDF pages.</div>`;
  if (menus.length) {
    const wrap = document.createElement("div");
    wrap.className = "menuWrap";
    wrap.innerHTML = menus
      .slice(0, 10)
      .map((m, idx) => `<span class="menu">${idx === 0 ? "⭐ " : ""}${escapeHtml(m)}</span>`)
      .join("");
    menuCard.appendChild(wrap);

    const tip = document.createElement("div");
    tip.className = "small";
    tip.innerHTML = `Tip: ⭐ वाला menu पहले try करें। नीचे Sources में exact PDF page open करें।`;
    menuCard.appendChild(tip);
  } else {
    const p = document.createElement("div");
    p.className = "small";
    p.textContent = "No strong menu code detected for this query. Check Sources / PDF Library.";
    menuCard.appendChild(p);
  }
  ans.appendChild(menuCard);

  // Steps
  const stepCard = document.createElement("div");
  stepCard.className = "card";
  stepCard.innerHTML = `<h2>PDF-based Steps</h2><div class="small">Clean SOP lines picked from matching PDF pages.</div>`;
  if (steps.length) {
    const ol = document.createElement("ol");
    ol.className = "steps";
    ol.innerHTML = steps.map((x) => `<li>${escapeHtml(x)}</li>`).join("");
    stepCard.appendChild(ol);
  } else {
    const p = document.createElement("div");
    p.className = "small";
    p.innerHTML = `No matching step text found in indexed PDFs (some PDFs may be scanned/images). Try keywords like menu code or use <b>PDF Library</b>.`;
    stepCard.appendChild(p);
  }
  ans.appendChild(stepCard);

  // Template fallback (rare)
  if (sop) {
    const t = document.createElement("div");
    t.className = "card";
    t.innerHTML = `
      <h2>Quick Template (Verify with PDFs) <span class="small">• fallback</span></h2>
      <div class="small"><b>${escapeHtml(sop.title_hi || "")}</b> <span class="small">/ ${escapeHtml(sop.title_en || "")}</span></div>
      <div class="hr"></div>
      <ol class="steps">${(sop.steps_hi || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ol>
      <div class="small">Tip: नीचे दिए PDF references से exact SOP verify करें।</div>
    `;
    ans.appendChild(t);
  }

  // Sources
  const srcCard = document.createElement("div");
  srcCard.className = "card";
  srcCard.innerHTML = `<h2>Sources (PDF pages)</h2><div class="small">Open exact page or download the PDF.</div>`;
  ans.appendChild(srcCard);

  if (!sources.length) {
    const none = document.createElement("div");
    none.className = "small";
    none.textContent = "No PDF pages matched. Try different keywords (menu code) or open PDF Library.";
    srcCard.appendChild(none);
    return;
  }

  const topShow = sources.slice(0, 4);
  const moreShow = sources.slice(4);

  function srcBox(s) {
    const fileEnc = encodeURIComponent(s.pdf);
    const openUrl = `viewer.html?file=pdfs/${fileEnc}&page=${encodeURIComponent(s.page)}`;
    const dlUrl = `pdfs/${fileEnc}`;
    const box = document.createElement("div");
    box.className = "src";
    box.innerHTML = `
      <div class="srcTop">
        <div><b>${escapeHtml(s.pdf)}</b> <span class="small">• Page ${escapeHtml(s.page)}</span></div>
        <div class="btns">
          <a class="btn" href="${openUrl}" target="_blank" rel="noopener">Open page</a>
          <a class="btn" href="${dlUrl}" download>Download</a>
        </div>
      </div>
      <div class="snippet">${escapeHtml(snippet(s.text, qRaw))}</div>
    `;
    return box;
  }

  for (const s of topShow) srcCard.appendChild(srcBox(s));

  if (moreShow.length) {
    const details = document.createElement("details");
    details.className = "moreBox";
    details.innerHTML = `<summary class="small">More results (${moreShow.length})</summary>`;
    for (const s of moreShow) details.appendChild(srcBox(s));
    srcCard.appendChild(details);
  }
}

/* =========================
   PDF Library
========================= */
function renderPdfLibrary(filter = "") {
  if (!DATA) return;
  const q = norm(filter).toLowerCase();
  const rows = $("#pdfRows");
  if (!rows) return;
  rows.innerHTML = "";

  const list = DATA.pdf_meta
    .filter((x) => !q || x.pdf.toLowerCase().includes(q))
    .sort((a, b) => a.pdf.localeCompare(b.pdf));

  const pc = $("#pdfCount");
  if (pc) pc.textContent = `${list.length} PDFs`;

  for (const p of list) {
    const file = encodeURIComponent(p.pdf);
    const openUrl = `viewer.html?file=pdfs/${file}&page=1`;
    const dlUrl = `pdfs/${file}`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(p.pdf)}</td>
      <td>${escapeHtml(p.pages)}</td>
      <td class="btns">
        <a class="btn" href="${openUrl}" target="_blank" rel="noopener">Open</a>
        <a class="btn" href="${dlUrl}" download>Download</a>
      </td>`;
    rows.appendChild(tr);
  }
}

function setQuery(q) {
  const el = $("#q");
  if (el) el.value = q;
  renderAnswer(q);
}

/* =========================
   Init
========================= */
async function init() {
  // Load indices
  const [d, s] = await Promise.all([
    fetch("data/finacle_index.json").then((r) => r.json()),
    fetch("data/sops.json").then((r) => r.json()).catch(() => ({ items: [] })),
  ]);
  DATA = d;
  SOP = s;

  const chips = [
    "Nominee details",
    "Nomination",
    "SB account nominee",
    "Balance check",
    "Account status dormant",
    "CIF details",
    "RTGS karna hai",
    "NEFT kaise kare",
    "NEFT/RTGS UTR inquiry",
    "Account close",
    "Account open",
    "FORM 60",
    "DNS removal",
    "HACM",
  ];

  const chipEl = $("#chips");
  if (chipEl) {
    chipEl.innerHTML = chips.map((c) => `<span class="pill">${escapeHtml(c)}</span>`).join("");
    $$(".pill", chipEl).forEach((p) => p.addEventListener("click", () => setQuery(p.textContent)));
  }

  renderPdfLibrary("");
  switchTab("assistant");
  toast("Index loaded");
}

document.addEventListener("DOMContentLoaded", () => {
  const ask = $("#ask");
  const q = $("#q");

  if (ask)
    ask.addEventListener("click", () => {
      const v = q ? q.value : "";
      if (!norm(v)) return;
      renderAnswer(v);
    });

  if (q)
    q.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        ask && ask.click();
      }
    });

  const ta = $("#tabAssistant");
  const tl = $("#tabLibrary");
  if (ta) ta.addEventListener("click", () => switchTab("assistant"));
  if (tl) tl.addEventListener("click", () => switchTab("library"));

  const ps = $("#pdfSearch");
  if (ps) ps.addEventListener("input", (e) => renderPdfLibrary(e.target.value));

  init().catch((err) => {
    console.error(err);
    const ans = $("#answer");
    if (ans) {
      ans.innerHTML = `<div class="card"><h2>Error loading data</h2>
        <div class="small">Check that <b>data/finacle_index.json</b> exists, and GitHub Pages is serving it.</div>
        <div class="small">Open DevTools Console for details.</div></div>`;
    }
  });
});
