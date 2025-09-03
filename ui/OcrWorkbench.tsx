import { useEffect, useState } from "react";
import PdfCanvas, { Box } from "./PdfCanvas";
import { uploadDoc, search, lasso, audit, getMeta } from "../../lib/api";

type Match = { page:number; bbox:{x0:number;y0:number;x1:number;y1:number}; text:string; score:number };

const SERVER = "http://localhost:8000";        // root (for /data & /out)
const API    = "http://localhost:8000/ocr";    // router prefix

export default function OcrWorkbench(){
  const [doc, setDoc] = useState<any>(null);
  const [meta, setMeta] = useState<{pages:{page:number;width:number;height:number}[]} | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.5);

  const [matches, setMatches] = useState<Match[]>([]);
  const [selected, setSelected] = useState<number[]>([]);

  async function doUpload(e: React.ChangeEvent<HTMLInputElement>){
    const f = e.target.files?.[0]; if(!f) return;
    const res = await uploadDoc(API, f, "tesseract");
    const pdfUrl = `${SERVER}${res.annotated_tokens_url}?t=${Date.now()}`;
    setDoc({ ...res, pdfUrl });
    const m = await getMeta(API, res.doc_id);
    setMeta(m);
    setPage(1);
  }

  async function doSearch(q: string){
    if(!doc) return;
    const r = await search(API, doc.doc_id, q, 20);
    setMatches(r.matches || []);
    setSelected([]); // nothing selected initially
    // jump to first match page (if any)
    if (r.matches?.length) setPage(r.matches[0].page);
  }

  async function onLassoRect(rect:{x0:number;y0:number;x1:number;y1:number}){
    if(!doc) return;
    const out = await lasso(API, doc.doc_id, page, rect);
    // show non-blocking log (you can replace with a side panel)
    console.log("LASSO:", out.text);
    await audit(API, { event:"lasso", payload: { doc_id:doc.doc_id, page, rect, result: out }});
  }

  // map matches → boxes
  const boxes: Box[] = matches.map(m => ({ page:m.page, ...m.bbox }));

  const ocrSizeForPage = meta?.pages.find(p => p.page === page);
  const selectedIdxs = selected;

  return (
    <div style={{display:"grid", gridTemplateColumns:"300px 1fr", gap:16}}>
      <div>
        <input type="file" accept="application/pdf" onChange={doUpload} />
        <div style={{marginTop:12, display:"flex", gap:8}}>
          <input id="q" placeholder="Search (fuzzy)"/>
          <button onClick={()=>{
            const q = (document.getElementById("q") as HTMLInputElement).value;
            doSearch(q);
          }}>Search</button>
        </div>

        <div style={{marginTop:12}}>
          <div style={{fontWeight:600, marginBottom:6}}>Matches</div>
          <ol style={{maxHeight:250, overflow:"auto", paddingRight:8}}>
            {matches.map((m,i)=>(
              <li key={i} style={{cursor:"pointer", marginBottom:6}}
                  onClick={()=>{
                    setPage(m.page);
                    setSelected([i]);  // accent this one
                  }}>
                <span style={{fontFamily:"monospace"}}>[{m.score}]</span> {m.text.slice(0,90)}
              </li>
            ))}
          </ol>

          <div style={{marginTop:12}}>
            <div style={{fontWeight:600}}>Page</div>
            <div style={{display:"flex", gap:8, alignItems:"center"}}>
              <button onClick={()=> setPage(p=> Math.max(1, p-1))}>Prev</button>
              <span>{page}</span>
              <button onClick={()=> setPage(p=> p+1)}>Next</button>
            </div>
          </div>

          <div style={{marginTop:12}}>
            <div style={{fontWeight:600}}>Zoom</div>
            <div style={{display:"flex", gap:8, alignItems:"center"}}>
              <button onClick={()=> setScale(s=> Math.max(0.75, +(s-0.25).toFixed(2)))}>-</button>
              <span>{scale.toFixed(2)}x</span>
              <button onClick={()=> setScale(s=> +(s+0.25).toFixed(2))}>+</button>
            </div>
          </div>
        </div>
      </div>

      <div>
        {doc && ocrSizeForPage
          ? <PdfCanvas
              url={doc.pdfUrl}
              page={page}
              scale={scale}
              boxes={boxes}
              selected={selectedIdxs}
              ocrSize={{ width: ocrSizeForPage.width, height: ocrSizeForPage.height }}
              onLasso={onLassoRect}
            />
          : <div>Upload a PDF to begin.</div>}
      </div>
    </div>
  );
}
