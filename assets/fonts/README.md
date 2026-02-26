# PDF font assets

This folder contains runtime fonts used by the inspection PDF generator route.

## Required files

- `DejaVuSans.ttf`
- `DejaVuSans-Bold.ttf`

The route fallback chain supports both project-root (`./`) and `assets/fonts/` locations for these exact filenames, but `assets/fonts/` is the preferred canonical location.

## Why these fonts

The checkbox symbols used in inspection results must render correctly:

- `☑`
- `☒`
- `☐`

`DejaVuSans` covers these glyphs, unlike the Latin-only Next.js OG fallback font.

## Quick local verification

```bash
node - <<'NODE'
const fs=require('fs'); const {PDFDocument}=require('pdf-lib'); const fontkit=require('@pdf-lib/fontkit');
(async()=>{for(const p of ['assets/fonts/DejaVuSans.ttf','assets/fonts/DejaVuSans-Bold.ttf']){const pdf=await PDFDocument.create(); pdf.registerFontkit(fontkit); const f=await pdf.embedFont(fs.readFileSync(p),{subset:true}); for(const s of ['☑','☒','☐']){try{f.encodeText(s); console.log(`${p} ${s} OK`);}catch{console.log(`${p} ${s} MISSING`);}}}})();
NODE
```
