"""Bundle the geometry table into the self-contained pages: web/index.html (Planner) and web/game.html (Race the Shadow)"""
from pathlib import Path

here = Path(__file__).parent
geo = (here.parent / "ephemeris" / "geometry.json").read_text()
for src, dst in [("app.template.html", "index.html"), ("game.template.html", "game.html")]:
    html = (here / src).read_text().replace("__GEOMETRY__", geo)
    (here / dst).write_text(html)
    print(f"wrote {here / dst} ({len(html) / 1e3:.0f} kB)")
