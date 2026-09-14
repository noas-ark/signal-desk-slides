# Signal Desk

A working problem-sensing and response pipeline: scan recurring AI-tooling complaints, rank them into an opportunity matrix, then draft (never auto-send) outreach to the people describing the pain.

Prepared for *AI Tools for Venture Workflows*, Session 1.

## 📄 Download the slides (PDF)

**[➡️ Signal-Desk-Slides.pdf](./Signal-Desk-Slides.pdf)** — the full 12-slide deck, exported as a widescreen (13.33" × 7.5", 16:9) PDF.

## Interactive version

[`index.html`](./index.html) is the source deck — open it in a browser for the scroll-snap slide navigation and the live "alert feed" demo on slide 10 (draft/approve/discard a simulated outreach message).

## 🔴 Live dashboard (the real workflow, running)

**[signal-desk-dashboard.vercel.app](https://signal-desk-dashboard.vercel.app)** — this is the actual pipeline, not a mockup. A scheduled job scans free public APIs (GitHub Issues, Hacker News, Reddit, Stack Overflow, dev.to) for the same complaint lexicon from the deck, clusters/scores the results with Claude, and drafts (never sends) outreach for the top items. See [`dashboard/README.md`](./dashboard/README.md) for architecture and setup.

## Keeping the PDF in sync

`index.html` is the source of truth. A [GitHub Action](./.github/workflows/build-pdf.yml) rebuilds `Signal-Desk-Slides.pdf` automatically on every push to `main` that touches `index.html`, using [`scripts/build-pdf.py`](./scripts/build-pdf.py) + headless Chrome, then commits the regenerated PDF back to the repo. To rebuild it locally:

```bash
python3 scripts/build-pdf.py
```

