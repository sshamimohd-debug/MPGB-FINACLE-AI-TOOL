let SOPs = [];
let INDEX = [];

async function loadData(){
  SOPs = await fetch("data/sops.json").then(r=>r.json());
  INDEX = await fetch("data/finacle_index.json").then(r=>r.json());
}
loadData();

function runQuery(){
  const q = document.getElementById("query").value.toLowerCase();
  const out = document.getElementById("output");
  out.innerHTML = "";

  // SOP detection
  const sop = SOPs.find(s =>
    s.keywords.some(k => q.includes(k))
  );

  if(sop){
    out.innerHTML += `
      <div class="card">
        <h2>${sop.title}</h2>
        <h3>Step-by-Step SOP</h3>
        <ol>${sop.steps.map(s=>`<li>${s}</li>`).join("")}</ol>
        <h3>Finacle Menus / Commands</h3>
        <ul>${sop.commands.map(c=>`<li><code>${c}</code></li>`).join("")}</ul>
      </div>
    `;
  }

  // PDF retrieval
  const hits = INDEX.filter(i =>
    sop && sop.related_tags.some(t => i.tag?.includes(t))
  ).slice(0,6);

  if(hits.length){
    out.innerHTML += `<div class="card"><h3>📄 Related PDFs</h3>`;
    hits.forEach(h=>{
      const pdfUrl = `pdfs/${h.pdf}`;
      const viewUrl = `viewer.html?file=${pdfUrl}&page=${h.page}`;
      out.innerHTML += `
        <div class="pdf">
          <b>${h.pdf}</b> (Page ${h.page})
          <br>
          <a href="${viewUrl}" target="_blank">Open</a>
          <a href="${pdfUrl}" download>Download</a>
        </div>
      `;
    });
    out.innerHTML += `</div>`;
  }

  if(!sop){
    out.innerHTML = `<div class="card">❌ Is query ka SOP nahi mila</div>`;
  }
}
