import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

const PdfCanvas = forwardRef(function PdfCanvas({ pdfData, ocrEndpoint }, ref){
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const pdfRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [pageNum, setPageNum] = useState(1);

  // overlays
  const docaiBoxesRef = useRef([]); // [{page,x0,y0,x1,y1}] in normalized 0..1
  const ocrTokensRef = useRef([]);  // tokens in CANVAS pixels for each page [{page,text,x0,y0,x1,y1}]
  const matchedTokensRef = useRef([]); // tokens for current match (subset of ocrTokensRef)
  const highlightRef = useRef(null);   // {page,x0,y0,x1,y1} in CANVAS pixels

  useEffect(()=>{
    let cancelled = false;
    (async ()=>{
      clear();
      if (!pdfData) return;
      try { await renderTaskRef.current?.cancel?.(); } catch {}
      const doc = await getDocument({ data: pdfData }).promise;
      if (cancelled) return;
      pdfRef.current = doc;
      setPageNum(1);
      await renderPage(1);
      await runOcrForPage(1);
    })();
    return ()=>{ cancelled = true; };
  }, [pdfData]);

  useEffect(()=>{
    if (!pdfRef.current) return;
    (async()=>{
      await renderPage(pageNum);
      await runOcrForPage(pageNum);
    })();
  }, [pageNum]);

  useEffect(()=>{
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver(()=>drawOverlay());
    ro.observe(c);
    return ()=> ro.disconnect();
  }, []);

  async function renderPage(p){
    try { await renderTaskRef.current?.cancel?.(); } catch {}
    const page = await pdfRef.current.getPage(p);
    const vp1 = page.getViewport({ scale: 1 });
    const maxW = 1200;
    const scale = Math.min(1.8, Math.max(0.7, maxW/Math.max(vp1.width, vp1.height)));
    const vp = page.getViewport({ scale });
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = Math.floor(vp.width);
    canvas.height= Math.floor(vp.height);
    canvas.style.width = canvas.width + "px";
    canvas.style.height= canvas.height + "px";
    renderTaskRef.current = page.render({ canvasContext: ctx, viewport: vp });
    await renderTaskRef.current.promise;
    renderTaskRef.current = null;
    drawOverlay();
  }

  async function runOcrForPage(p){
    if (!ocrEndpoint) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
    const fd = new FormData();
    fd.append("page", blob, `p${p}.png`);
    fd.append("pageNumber", String(p));
    try {
      const r = await fetch(ocrEndpoint, { method: "POST", body: fd });
      if (!r.ok) return;
      const js = await r.json();
      const tokens = (js.tokens || []).map(t => ({...t, page: p}));
      // replace tokens for this page
      ocrTokensRef.current = ocrTokensRef.current.filter(t => t.page !== p).concat(tokens);
      drawOverlay();
    } catch {}
  }

  function pxRectToCss(r){
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const sx = rect.width / c.width;
    const sy = rect.height/ c.height;
    const x = Math.min(r.x0, r.x1) * sx;
    const y = Math.min(r.y0, r.y1) * sy;
    const w = Math.abs(r.x1 - r.x0) * sx;
    const h = Math.abs(r.y1 - r.y0) * sy;
    return { x, y, w, h };
  }

  function normRectToCss(r){
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const x = Math.min(r.x0, r.x1) * rect.width;
    const y = Math.min(r.y0, r.y1) * rect.height;
    const w = Math.abs(r.x1 - r.x0) * rect.width;
    const h = Math.abs(r.y1 - r.y0) * rect.height;
    return { x, y, w, h };
  }

  function drawOverlay(){
    const overlay = overlayRef.current, canvas = canvasRef.current;
    if (!overlay || !canvas) return;
    overlay.innerHTML = "";
    const fragment = document.createDocumentFragment();

    // 1) DocAI boxes (yellow)
    for (const b of docaiBoxesRef.current){
      if (b.page !== pageNum) continue;
      const { x,y,w,h } = normRectToCss(b);
      const d = document.createElement("div");
      d.className = "docai-box";
      Object.assign(d.style, { position:"absolute", left:`${x}px`, top:`${y}px`, width:`${w}px`, height:`${h}px` });
      fragment.appendChild(d);
    }
    // 2) OCR tokens (green thin)
    for (const t of ocrTokensRef.current){
      if (t.page !== pageNum) continue;
      const { x,y,w,h } = pxRectToCss(t);
      const d = document.createElement("div");
      d.className = "ocr-token";
      Object.assign(d.style, { position:"absolute", left:`${x}px`, top:`${y}px`, width:`${w}px`, height:`${h}px` });
      fragment.appendChild(d);
    }
    // 3) Matched span (thicker green)
    for (const t of matchedTokensRef.current){
      if (t.page !== pageNum) continue;
      const { x,y,w,h } = pxRectToCss(t);
      const d = document.createElement("div");
      d.className = "ocr-match";
      Object.assign(d.style, { position:"absolute", left:`${x}px`, top:`${y}px`, width:`${w}px`, height:`${h}px` });
      fragment.appendChild(d);
    }
    // 4) Final highlight (pink)
    if (highlightRef.current && highlightRef.current.page === pageNum){
      const { x,y,w,h } = pxRectToCss(highlightRef.current);
      const d = document.createElement("div");
      d.className = "highlight";
      Object.assign(d.style, { position:"absolute", left:`${x}px`, top:`${y}px`, width:`${w}px`, height:`${h}px` });
      fragment.appendChild(d);
    }

    overlay.appendChild(fragment);
  }

  function clear(){
    const c = canvasRef.current;
    if (c) c.getContext("2d").clearRect(0,0,c.width,c.height);
    if (overlayRef.current) overlayRef.current.innerHTML = "";
    docaiBoxesRef.current = [];
    ocrTokensRef.current = [];
    matchedTokensRef.current = [];
    highlightRef.current = null;
  }

  useImperativeHandle(ref, ()=> ({
    setDocAIBoxes: (normBoxes) => { // [{page,x0,y0,x1,y1}]
      docaiBoxesRef.current = Array.isArray(normBoxes) ? normBoxes.slice() : [];
      drawOverlay();
    },
    getOcrTokens: (page) => ocrTokensRef.current.filter(t => !page || t.page===page),
    setMatchedTokens: (page, tokens) => {
      matchedTokensRef.current = (tokens||[]).map(t => ({...t, page}));
      drawOverlay();
    },
    setHighlightBox: (page, rectPx) => {
      highlightRef.current = rectPx ? { page, ...rectPx } : null;
      drawOverlay();
    }
  }));

  return (
    <div className="canvas-stage" style={{position:"relative"}}>
      <div className="pagebar">
        <button className="btn" onClick={()=>setPageNum(p=>Math.max(1,p-1))}>Prev</button>
        <button className="btn" onClick={()=>setPageNum(p=>Math.min((pdfRef.current?.numPages||1),p+1))}>Next</button>
        <span style={{marginLeft:8}}>Page {pageNum}{pdfRef.current?` / ${pdfRef.current.numPages}`:""}</span>
      </div>
      <canvas ref={canvasRef}/>
      <div ref={overlayRef} className="overlay" style={{position:"absolute",left:0,top:0,right:0,bottom:0}}/>
    </div>
  );
});

export default PdfCanvas;
