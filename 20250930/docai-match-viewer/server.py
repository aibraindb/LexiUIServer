import io, os
import numpy as np
from PIL import Image
import cv2
import pytesseract
from flask import Flask, request, jsonify
from flask_cors import CORS

OCR_LANG = os.getenv("OCR_LANG", "eng")
TESSERACT_CONFIG = os.getenv("TESSERACT_CONFIG", "--oem 3 --psm 6")
TARGET_DPI = int(os.getenv("TARGET_DPI", "300"))
THRESH = int(os.getenv("THRESH", "0"))

app = Flask(__name__)
CORS(app, supports_credentials=True)

@app.get("/health")
def health():
    return jsonify({"ok": True})

@app.route("/ocr", methods=["POST", "OPTIONS", "GET"])
def ocr():
    if request.method == "OPTIONS":
        return ("", 204)
    if request.method == "GET":
        return jsonify({"ok": True, "msg": "POST an image/png as field 'page'."})
    if "page" not in request.files:
        return jsonify({"error": "missing file field 'page'"}), 422

    f = request.files["page"]
    page_num = int(request.form.get("pageNumber") or "1")

    image = Image.open(io.BytesIO(f.read())).convert("RGB")
    w0, h0 = image.size

    scale = max(1.0, TARGET_DPI / 96.0)
    if scale > 1.01:
        image = image.resize((int(w0*scale), int(h0*scale)), Image.BICUBIC)

    cv = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)

    if THRESH == 0:
        gray = cv2.cvtColor(cv, cv2.COLOR_BGR2GRAY)
        cv = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                   cv2.THRESH_BINARY, 41, 11)
    else:
        gray = cv2.cvtColor(cv, cv2.COLOR_BGR2GRAY)
        _, cv = cv2.threshold(gray, THRESH, 255, cv2.THRESH_BINARY)

    data = pytesseract.image_to_data(
        cv, lang=OCR_LANG, config=TESSERACT_CONFIG, output_type=pytesseract.Output.DICT
    )

    tokens = []
    n = len(data["text"])
    for i in range(n):
        txt = (data["text"][i] or "").strip()
        conf = int(data["conf"][i]) if data["conf"][i] not in ("", "-1") else -1
        if not txt or conf < 50:
            continue
        x = int(data["left"][i]); y = int(data["top"][i])
        w = int(data["width"][i]); h = int(data["height"][i])
        tokens.append({
            "page": page_num,
            "text": txt,
            "x0": x, "y0": y, "x1": x+w, "y1": y+h
        })

    H, W = cv.shape[:2]
    return jsonify({"page": page_num, "width": int(W), "height": int(H), "tokens": tokens})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3001, debug=False)
