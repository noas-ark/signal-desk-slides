#!/usr/bin/env python3
"""Build Signal-Desk-Slides.pdf from index.html.

Injects print-only CSS/JS that turns the scroll-snap slide deck into one
fixed-size (13.333in x 7.5in, 16:9 widescreen) page per slide, then renders
it with headless Chrome. Used locally and by the GitHub Action that keeps
the PDF in sync with index.html on every push to main.
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE_HTML = REPO_ROOT / "index.html"
BUILD_HTML = REPO_ROOT / "_pdf-build.html"
OUTPUT_PDF = REPO_ROOT / "Signal-Desk-Slides.pdf"

PRINT_CSS = """
  /* ---- PDF export: one slide per widescreen (13.333in x 7.5in) page ---- */
  @page { size: 13.333in 7.5in; margin: 0; }
  html { scroll-snap-type: none; }
  .slide-num, .nav-btns { display: none !important; }
  .slide {
    width: 13.333in;
    height: 7.5in;
    min-height: 7.5in;
    max-height: 7.5in;
    padding: 0.55in 0.85in;
    border-bottom: none;
    page-break-after: always;
    break-after: page;
    overflow: hidden;
    align-items: flex-start;
  }
  .slide:last-of-type { page-break-after: auto; break-after: auto; }
  .slide-inner { animation: none !important; width: 100%; }
  table { font-size: 0.8rem; }
  .pipeline { flex-direction: row !important; flex-wrap: nowrap !important; }
  .pipe-arrow { transform: none !important; padding: 0 4px !important; }
  .pipe-step { min-width: 0 !important; }
"""

FIT_JS = """
  function fitSlides() {
    slides.forEach(function (slide) {
      var inner = slide.querySelector('.slide-inner');
      inner.style.transform = 'none';
      var available = slide.clientHeight -
        parseFloat(getComputedStyle(slide).paddingTop) -
        parseFloat(getComputedStyle(slide).paddingBottom);
      var needed = inner.scrollHeight;
      if (needed > available) {
        var scale = available / needed;
        inner.style.transform = 'scale(' + scale + ')';
        inner.style.transformOrigin = 'top center';
      }
    });
  }
  window.addEventListener('load', function () { setTimeout(fitSlides, 50); });
"""


def find_chrome() -> str:
    import os

    env_bin = os.environ.get("CHROME_BIN")
    if env_bin and shutil.which(env_bin):
        return env_bin
    candidates = [
        "google-chrome",
        "google-chrome-stable",
        "chromium",
        "chromium-browser",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ]
    for c in candidates:
        if shutil.which(c) or Path(c).exists():
            return c
    sys.exit("No Chrome/Chromium binary found. Set CHROME_BIN.")


def build_pdf_source(html: str) -> str:
    if "</style>\n</head>" not in html:
        sys.exit("Could not find '</style>\\n</head>' anchor in index.html")
    html = html.replace("</style>\n</head>", PRINT_CSS + "</style>\n</head>", 1)

    if "})();\n</script>" not in html:
        sys.exit("Could not find '})();\\n</script>' anchor in index.html")
    html = html.replace("})();\n</script>", FIT_JS + "})();\n</script>", 1)
    return html


def main() -> None:
    chrome = find_chrome()
    html = SOURCE_HTML.read_text(encoding="utf-8")
    BUILD_HTML.write_text(build_pdf_source(html), encoding="utf-8")

    try:
        subprocess.run(
            [
                chrome,
                "--headless",
                "--disable-gpu",
                "--no-sandbox",
                "--no-pdf-header-footer",
                "--print-to-pdf-no-header",
                f"--print-to-pdf={OUTPUT_PDF}",
                "--virtual-time-budget=6000",
                "--window-size=1280,720",
                f"file://{BUILD_HTML}",
            ],
            check=True,
        )
    finally:
        BUILD_HTML.unlink(missing_ok=True)

    print(f"Wrote {OUTPUT_PDF}")


if __name__ == "__main__":
    main()
