"""Bundle the geometry table into a single self-contained web page: web/index.html"""
from pathlib import Path

here = Path(__file__).parent
geo = (here.parent / "ephemeris" / "geometry.json").read_text()
html = (here / "app.template.html").read_text().replace("__GEOMETRY__", geo)
(here / "index.html").write_text(html)
print(f"wrote {here / 'index.html'} ({len(html) / 1e3:.0f} kB)")
