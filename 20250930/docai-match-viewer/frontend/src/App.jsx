import React, { useRef, useState } from "react";
import PdfCanvas from "./components/PdfCanvas.jsx";

function parseDocAI(text){
  let root = JSON.parse(text);
  if (Array.isArray(root)) root = root[0] || {};
  const doc = root.documents?.[0] || {};
  const props = Array.isArray(doc.properties) ? doc.properties[0] : (doc.properties || {});
  const metaMap = props?.metadata?.metaDataMap || {};
  const pinfo = metaMap.pageInfo || {};
  const dim = pinfo.dimension || {};
  const page = {
    number: Number(pinfo.page_number || 1),
    width: Number(dim.width || 0),
    height: Number(dim.height || 0),
    unit: String(dim.unit || "pixels")
  };

  const fields = [];
  Object.entries(props).forEach(([k,v]) => {
    if (k === "metadata") return;
    if (!v || typeof v !== "object") return;
    const nv = v?.bounding_poly?.normalized_vertices;
    if (Array.isArray(nv) && nv.length){
      const xs = nv.map(p=>Number(p.x||0)), ys = nv.map(p=>Number(p.y||0));
      const x0=Math.min(...xs), y0=Math.min(...ys), x1=Math.max(...xs), y1=Math.max(...ys);
      fields.push({ name:k, value: (typeof v.value==="string"?v.value:String(v.value||"")), page: page.number,
        norm:{x0,y0,x1,y1} });
    }
  });
  return { page, fields };
}

// simple normalization for string compare
function norm(s){
  return (s||"").toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}\s]/gu," ").replace(/\s+/g," ").trim();
}

export default function App(){
  const pdfRef = useRef(null);
  const [pdfData, setPdfData] = useState(null);
  const [rows, setRows] = useState([]);

  async function onPickPdf(e){
    const f=e.target.files?.[0]; if(!f) return;
    setPdfData(await f.arrayBuffer());
  }
  async function onPickDocAI(e){
    const f=e.target.files?.[0]; if(!f) return;
    const txt = await f.text();
    const { fields } = parseDocAI(txt);
    setRows(fields);
    // show all DocAI boxes in yellow
    pdfRef.current?.setDocAIBoxes(fields.map(r => ({ page:r.page, ...r.norm })));
  }

  async function onClickField(row){
    if (!row?.value) return;
    const tokens = pdfRef.current?.getOcrTokens(row.page) || [];
    if (!tokens.length){
      alert("No OCR tokens yet — click the page first so the viewer can run OCR, or ensure the OCR server is running on http://localhost:3001/ocr.");
      return;
    }
    const target = norm(row.value);
    // Greedy sliding-window best match by Jaccard over word sets; keep span
    const wordsT = target.split(" ").filter(Boolean);
    const byLine = [...tokens].sort((a,b)=> (a.y0===b.y0? a.x0-b.x0 : a.y0-b.y0));

    let best=null;
    for (let i=0;i<byLine.length;i++){
      const acc=[];
      let accText="";
      for (let w=0; w<12 && i+w<byLine.length; w++){
        acc.push(byLine[i+w]);
        accText = norm(acc.map(t=>t.text).join(" "));
        const wordsA = accText.split(" ").filter(Boolean);
        const setA = new Set(wordsA), setB = new Set(wordsT);
        const inter = wordsA.filter(x=>setB.has(x)).length;
        const union = new Set([...wordsA, ...wordsT]).size || 1;
        const score = inter / union;
        if (!best || score>best.score) best = { score, span:[...acc] };
      }
    }
    if (best){
      const rect = best.span.reduce((r,t)=> ({
        x0:Math.min(r.x0,t.x0), y0:Math.min(r.y0,t.y0),
        x1:Math.max(r.x1,t.x1), y1:Math.max(r.y1,t.y1)
      }), {x0:1e9,y0:1e9,x1:-1e9,y1:-1e9});

      // mark matched tokens (green) and pink highlight box
      pdfRef.current?.setMatchedTokens(row.page, best.span);
      pdfRef.current?.setHighlightBox(row.page, rect);
    }
  }

  return (
    <div className="wrap">
      <div className="left">
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <label className="btn">Choose PDF<input type="file" accept="application/pdf" onChange={onPickPdf}/></label>
          <label className="btn">Choose DocAI JSON<input type="file" accept=".json,.txt" onChange={onPickDocAI}/></label>
        </div>
        <div className="list">
          <h4>Fields ({rows.length})</h4>
          <small className="hint">Click a field to match via OCR (pink box). Yellow = DocAI, green = OCR tokens / match.</small>
          {rows.map((r,i)=>(
            <div key={i} className="row" onClick={()=>onClickField(r)}>
              <div className="key">{r.name}</div>
              <div className="dim">{r.value}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="right">
        <PdfCanvas ref={pdfRef} pdfData={pdfData} ocrEndpoint="http://localhost:3001/ocr"/>
      </div>
    </div>
  );
}
