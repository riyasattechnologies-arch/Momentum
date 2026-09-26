"""Bundle index.html + style.css + planner.js + app.js into one self-contained file (dist/momentum.html)."""
from pathlib import Path

root = Path(__file__).parent
css = (root / "style.css").read_text()
js = (root / "planner.js").read_text() + "\n" + (root / "app.js").read_text()
fonts = ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700'
         '&family=Bricolage+Grotesque:opsz,wght@12..96,600..800&family=JetBrains+Mono:wght@500;700&display=swap">')
page = f"""<title>Momentum</title>
{fonts}
<style>
{css}
</style>
<div id="app"></div>
<script>
{js}
</script>
"""
(root / "dist").mkdir(exist_ok=True)
(root / "dist" / "momentum.html").write_text(page)
print("wrote dist/momentum.html", len(page), "bytes")
