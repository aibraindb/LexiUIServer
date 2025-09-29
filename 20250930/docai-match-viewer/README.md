# DocAI Match Viewer

**Colors**
- **Yellow** = Google DocAI boxes (from `normalized_vertices`)
- **Green (thin)** = all Tesseract OCR tokens
- **Green (thick)** = the matched token span
- **Pink** = your final highlight box

## Run backend
```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python server.py
```

The OCR endpoint will be at `http://localhost:3001/ocr`.

## Run frontend
```bash
cd frontend
npm i
npm run dev
```
Open the printed localhost URL.

1. Click **Choose PDF** and select a PDF.
2. Click **Choose DocAI JSON** (new format). Boxes will appear in **yellow**.
3. Click a field in the list to run OCR-based matching → **pink** box, with contributing OCR tokens in **thick green** (others thin green).

> Matching approach: simple greedy sliding-window Jaccard overlap over normalized word sets; window size 12 by default. Easy to swap for BM25 or embeddings later.
