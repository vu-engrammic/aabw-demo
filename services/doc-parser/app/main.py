"""FastAPI document parser service."""

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse

from app.parser import parse_document

app = FastAPI(
    title="Doc Parser",
    description="Hackathon MVP — extract text from PDF, DOCX, PPTX, text, and images.",
    version="0.1.0",
)


@app.get("/health")
def health():
    return {"ok": True, "service": "doc-parser"}


@app.post("/parse")
async def parse(file: UploadFile = File(...)):
    if not file.filename:
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "text": "",
                "markdown": "",
                "meta": {
                    "filename": "",
                    "mime": file.content_type or "application/octet-stream",
                    "sha256": "",
                    "pages": 0,
                    "ocrUsed": False,
                    "parser": "unknown",
                },
                "error": "Missing filename on uploaded file",
            },
        )

    data = await file.read()
    if not data:
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "text": "",
                "markdown": "",
                "meta": {
                    "filename": file.filename,
                    "mime": file.content_type or "application/octet-stream",
                    "sha256": "",
                    "pages": 0,
                    "ocrUsed": False,
                    "parser": "unknown",
                },
                "error": "Uploaded file is empty",
            },
        )

    result = parse_document(data, file.filename)
    if result.get("meta", {}).get("mime") == "application/octet-stream" and file.content_type:
        result["meta"]["mime"] = file.content_type

    status = 200 if result.get("ok") else 422
    return JSONResponse(status_code=status, content=result)
