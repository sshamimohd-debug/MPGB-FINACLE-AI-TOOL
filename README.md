# Finacle AI Assistant (Static WebApp)

This repo is a **static** (no build) web app you can deploy on **GitHub Pages**.

## Features
- Ask in Hindi/English: **NEFT kaise kare**, **Account close**, **Account open**, **CIF kaise banaye** etc.
- Shows:
  - SOP template (Hindi + English)
  - Probable Finacle menu/command codes detected from matched PDF text
  - Top PDF sources with **Open (page)** + **Download**
- Full **PDF Library** tab with search, open, download.

## Folder structure
- `public/index.html` main app
- `public/viewer.html` PDF page viewer (pdf.js via CDN)
- `public/data/finacle_index.json` extracted page-text index
- `public/data/sops.json` SOP templates
- `public/pdfs/` 107 PDFs

## Deploy on GitHub Pages
1. Push this repo to GitHub.
2. Settings → Pages → Build and deployment:
   - Source: **Deploy from a branch**
   - Branch: **main** (or master)
   - Folder: **/public**
3. Open the GitHub Pages URL.

## Local run
Just open `public/index.html` in browser (or use any simple server).
