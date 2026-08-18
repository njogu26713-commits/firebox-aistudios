from pathlib import Path

path = Path('/home/ubuntu/firebox-aistudios/FireboxAIStudio.jsx')
text = path.read_text()
start = text.index('                  <div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr" : "repeat(4, 1fr)"')
end_marker = '                  {errorMsg && <div style={{ marginTop:14'
end = text.index(end_marker, start)
text = text[:start] + text[end:]
path.write_text(text)
