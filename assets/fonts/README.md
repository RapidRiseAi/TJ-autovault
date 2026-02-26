# PDF font assets

This folder contains runtime fonts used by the inspection PDF generator route.

## Required files

- `DejaVuSans.ttf`
- `DejaVuSans-Bold.ttf`

The route fallback chain expects these exact filenames under `assets/fonts/`.

## Why these fonts

The checkbox symbols used in inspection results must render correctly:

- `☑`
- `☒`
- `☐`

`DejaVuSans` covers these glyphs, unlike the Latin-only Next.js OG fallback font.

## Runtime fallback order

The generator now probes candidate fonts and only accepts files that can encode all three checkbox glyphs. Candidates include:

1. `assets/fonts/DejaVuSans*.ttf`
2. repo root `DejaVuSans*.ttf`
3. common Linux system font locations (`/usr/share/fonts/...`, `/usr/local/share/fonts/...`)
4. Noto/Next fallback fonts (accepted only if they encode all glyphs)

Runtime logs include:

```txt
[inspection-pdf] Runtime font sources { regular, regularChecksum, bold, boldChecksum }
```

Use those checksums to confirm the deployed container is using the expected newly-deployed font files (not stale artifacts).

## Quick local verification

```bash
node - <<'NODE'
const fs=require('fs'); const {PDFDocument}=require('pdf-lib'); const fontkit=require('@pdf-lib/fontkit');
(async()=>{for(const p of ['assets/fonts/DejaVuSans.ttf','assets/fonts/DejaVuSans-Bold.ttf']){const pdf=await PDFDocument.create(); pdf.registerFontkit(fontkit); const f=await pdf.embedFont(fs.readFileSync(p),{subset:true}); for(const s of ['☑','☒','☐']){try{f.encodeText(s); console.log(`${p} ${s} OK`);}catch{console.log(`${p} ${s} MISSING`);}}}})();
NODE
```
