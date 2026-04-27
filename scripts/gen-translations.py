"""Generate translation JSON files for all languages using the-brain (Gemini)."""

import json
import subprocess
import sys
import re
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

BRAIN = Path("C:/Claude/git/the-brain")
LOCALES = Path(__file__).parent.parent / "src/renderer/src/i18n/locales"
SOURCE = LOCALES / "en-US.json"

LANGUAGES = [
    ("en-GB", "British English"),
    ("es-ES", "Spanish (Spain)"),
    ("es-MX", "Spanish (Mexico)"),
    ("fr-FR", "French"),
    ("de-DE", "German"),
    ("it-IT", "Italian"),
    ("pt-BR", "Brazilian Portuguese"),
    ("pt-PT", "European Portuguese"),
    ("nl-NL", "Dutch"),
    ("pl-PL", "Polish"),
    ("ru-RU", "Russian"),
    ("uk-UA", "Ukrainian"),
    ("tr-TR", "Turkish"),
    ("ar-SA", "Arabic"),
    ("he-IL", "Hebrew"),
    ("hi-IN", "Hindi"),
    ("zh-CN", "Simplified Chinese"),
    ("zh-TW", "Traditional Chinese"),
    ("ja-JP", "Japanese"),
    ("ko-KR", "Korean"),
    ("th-TH", "Thai"),
    ("vi-VN", "Vietnamese"),
    ("id-ID", "Indonesian"),
    ("sv-SE", "Swedish"),
    ("da-DK", "Danish"),
    ("fi-FI", "Finnish"),
    ("nb-NO", "Norwegian Bokmål"),
]

source_json = SOURCE.read_text(encoding="utf-8")

PROMPT_TEMPLATE = (
    "Translate all string values in the JSON below into {lang_name} ({code}). "
    "Rules: (1) Keep the exact JSON structure and all keys unchanged. "
    "(2) Translate only the string values. "
    "(3) Keep placeholders like '→', '+', '…' as-is. "
    "(4) Keep proper nouns like 'ManyAI' untranslated. "
    "(5) Return ONLY valid JSON — no explanation, no markdown code fences, no extra text. "
    "Source JSON:\n{json}"
)

def extract_json(text: str) -> str:
    """Strip delegate.py header line and markdown fences, return raw JSON."""
    lines = text.splitlines()
    # Skip the [provider / model | ...] header line emitted by delegate.py
    lines = [l for l in lines if not l.startswith("[") or l.startswith("[{")]
    text = "\n".join(lines).strip()
    # Remove ```json ... ``` or ``` ... ```
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()

def translate(code: str, lang_name: str) -> tuple[str, bool, str]:
    out_path = LOCALES / f"{code}.json"
    if out_path.exists():
        return code, True, "already exists - skipped"

    prompt = PROMPT_TEMPLATE.format(lang_name=lang_name, code=code, json=source_json)

    raw = ""
    try:
        result = subprocess.run(
            [sys.executable, "delegate.py", "--provider", "gemini",
             "--type", "translation", "--tokens", "4096",
             "--prompt", prompt],
            cwd=str(BRAIN),
            capture_output=True, timeout=120
        )
        # Decode bytes; Gemini responses are UTF-8 but Windows console may add BOM
        raw = result.stdout.decode("utf-8", errors="replace").strip()
        if not raw:
            err = result.stderr.decode("utf-8", errors="replace")[:200]
            return code, False, f"empty output - stderr: {err}"

        cleaned = extract_json(raw)
        parsed = json.loads(cleaned)
        out_path.write_text(json.dumps(parsed, ensure_ascii=False, indent=2), encoding="utf-8")
        return code, True, "ok"
    except json.JSONDecodeError as e:
        return code, False, f"JSON parse error: {e} - raw[:200]: {raw[:200]}"
    except Exception as e:
        return code, False, str(e)

def safe_print(text: str) -> None:
    """Print to stdout, replacing unencodable chars so cp1252 consoles don't crash."""
    sys.stdout.buffer.write((text + "\n").encode(sys.stdout.encoding or "utf-8", errors="replace"))

def main():
    LOCALES.mkdir(parents=True, exist_ok=True)
    safe_print(f"Generating {len(LANGUAGES)} translations via Gemini...\n")

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(translate, code, name): code for code, name in LANGUAGES}
        for fut in as_completed(futures):
            code, ok, msg = fut.result()
            status = "OK" if ok else "FAIL"
            # Truncate msg to avoid flooding console with garbled chars
            safe_print(f"  [{status}] {code}: {msg[:120]}")

    safe_print("\nDone.")

if __name__ == "__main__":
    main()
