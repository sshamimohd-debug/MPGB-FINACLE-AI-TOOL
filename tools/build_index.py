import os, re, json
from pathlib import Path

try:
    from pypdf import PdfReader
except Exception:
    print("ERROR: pypdf not installed. Run: pip install pypdf")
    raise

ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT / "pdfs"
OUT = ROOT / "data" / "finacle_index.json"

def clean_text(s: str) -> str:
    s = (s or "").replace("\x00", " ")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()

def chunk_text(text: str, max_chars=1200, overlap=150):
    text = clean_text(text)
    if not text:
        return []
    # split into paragraphs first
    parts = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks = []
    buf = ""
    for p in parts:
        if len(buf) + len(p) + 2 <= max_chars:
            buf = (buf + "\n\n" + p).strip()
        else:
            if buf:
                chunks.append(buf)
            # if paragraph too big, hard split
            if len(p) > max_chars:
                for i in range(0, len(p), max_chars - overlap):
                    chunks.append(p[i:i + max_chars])
                buf = ""
            else:
                buf = p
    if buf:
        chunks.append(buf)
    return chunks

def main():
    if not PDF_DIR.exists():
        print("ERROR: pdfs folder not found:", PDF_DIR)
        return

    pdf_files = sorted([p for p in PDF_DIR.glob("*.pdf")])
    if not pdf_files:
        print("ERROR: No PDFs found in:", PDF_DIR)
        return

    all_chunks = []
    pdf_meta = []

    for pdf_path in pdf_files:
        pdf_name = pdf_path.name
        print("Indexing:", pdf_name)
        try:
            reader = PdfReader(str(pdf_path))
        except Exception as e:
            print("  [SKIP] Cannot read:", pdf_name, "|", e)
            continue

        n_pages = len(reader.pages)
        pdf_meta.append({"pdf": pdf_name, "pages": n_pages})

        for i in range(n_pages):
            page_no = i + 1
            try:
                page = reader.pages[i]
                txt = page.extract_text() or ""
            except Exception:
                txt = ""

            txt = clean_text(txt)
            if not txt:
                continue

            # break into chunks
            chunks = chunk_text(txt, max_chars=1100, overlap=120)
            for ch in chunks:
                all_chunks.append({
                    "pdf": pdf_name,
                    "page": page_no,
                    "text": ch
                })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    obj = {
        "version": 1,
        "pdf_meta": pdf_meta,
        "chunks": all_chunks
    }

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)

    print("\nDONE")
    print("PDFs:", len(pdf_meta))
    print("Chunks:", len(all_chunks))
    print("Wrote:", OUT)

if __name__ == "__main__":
    main()
