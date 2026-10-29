"""Synthetic public-domain PDF fixtures. No Office, web requests, or user content.
Run with python3, then use the Ghostscript command in provenance.json for password.pdf.
"""
from pathlib import Path

root = Path(__file__).parent
texts = ['第一章  渡口\n原句不改。', '第二章  城门\n人物沈砚。']
glyphs = sorted(set(''.join(texts).replace('\n', '')))
mapping = '\n'.join(f'<{ord(c):04X}> <{ord(c):04X}>' for c in glyphs)
cmap = f'''/CIDInit /ProcSet findresource begin
12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Synthetic-UCS def /CMapType 2 def
1 begincodespacerange <0000> <FFFF> endcodespacerange
{len(glyphs)} beginbfchar
{mapping}
endbfchar endcmap CMapName currentdict /CMap defineresource pop end end'''

def stream(text):
    return f'<< /Length {len(text.encode())} >>\nstream\n{text}\nendstream'

objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 9 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 10 0 R >>',
    '<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 8 0 R >>',
    '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /FontDescriptor 7 0 R /DW 1000 >>',
    '<< /Type /FontDescriptor /FontName /STSong-Light /Flags 4 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 900 /Descent -200 /CapHeight 700 /StemV 80 >>',
    stream(cmap),
]
for text in texts:
    lines = text.split('\n')
    content = 'BT /F1 14 Tf 50 700 Td\n' + '\n0 -20 Td\n'.join('<' + line.encode('utf-16-be').hex() + '> Tj' for line in lines) + '\nET'
    objects.append(stream(content))
pdf = bytearray(b'%PDF-1.7\n')
offsets = [0]
for number, obj in enumerate(objects, 1):
    offsets.append(len(pdf))
    pdf += f'{number} 0 obj\n{obj}\nendobj\n'.encode()
xref = len(pdf)
pdf += f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode()
for offset in offsets[1:]:
    pdf += f'{offset:010d} 00000 n \n'.encode()
pdf += f'trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
(root / 'chinese-two-pages.pdf').write_bytes(pdf)
