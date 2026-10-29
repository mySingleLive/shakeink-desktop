"""Independent read-only input inspection. Full text remains outside the repository."""
from pathlib import Path
import hashlib
import json
import re
import zipfile
from docx import Document
from pypdf import PdfReader
from lxml import etree

ROOT=Path('/Users/dt_flys/Documents/拆书/真实小说导入测试-20261026')
QA=ROOT/'输入核验'
QA.mkdir(mode=0o700,exist_ok=True)
manifest=json.loads((ROOT/'corpus-manifest.json').read_text())
rows=[]
for sample in manifest['samples']:
    path=Path(sample['path'])
    assert hashlib.sha256(path.read_bytes()).hexdigest()==sample['sha256']
    result={key:sample[key] for key in ['id','title','format','lengthClass','bytes','sha256']}
    if sample['format']=='pdf':
        reader=PdfReader(path)
        pages=[page.extract_text() or '' for page in reader.pages]
        text='\n'.join(pages)
        result.update(pages=len(pages),textPages=sum(bool(x.strip()) for x in pages),emptyTextPages=[i+1 for i,t in enumerate(pages) if not t.strip()],imagesPerPage=[len(page.images) for page in reader.pages])
        (QA/(sample['id']+'-pages.json')).write_text(json.dumps(pages,ensure_ascii=False))
    elif sample['format']=='docx':
        document=Document(path)
        with zipfile.ZipFile(path) as archive:
            names=archive.namelist()
            ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            main=etree.fromstring(archive.read('word/document.xml'))
            nodes=main.xpath('//w:body//w:p',namespaces=ns)
            paragraphs=[''.join(t.text or '' for t in p.xpath('.//w:t',namespaces=ns) if next(t.iterancestors('{'+ns['w']+'}p')) is p) for p in nodes]
            text='\n'.join(paragraphs)
            text_parts={name:'\n'.join(''.join(p.itertext()) for p in etree.fromstring(archive.read(name)).xpath('//w:p',namespaces=ns)) for name in names if re.match(r'word/(?:footnotes|endnotes|comments|header\d+|footer\d+)\.xml$',name)}
            result.update(paragraphs=len(paragraphs),tables=len(document.tables),textParts=[name for name in names if re.match(r'word/(?:footnotes|endnotes|comments|header\d+|footer\d+)\.xml$',name)],hasMacros=any('vbaProject' in name for name in names),revisions=archive.read('word/document.xml').count(b'<w:ins'))
            (QA/(sample['id']+'-text-parts.json')).write_text(json.dumps(text_parts,ensure_ascii=False))
        result['chapterHeadings']=len(re.findall(r'(?im)^chapter\s',text))
        (QA/(sample['id']+'-paragraphs.json')).write_text(json.dumps(paragraphs,ensure_ascii=False))
    else:
        # newline='' preserves source CRLF for the independent TXT/MD baseline.
        with path.open(encoding='utf-8-sig',newline='') as handle: text=handle.read()
        result.update(utf8=True,bom=path.read_bytes().startswith(b'\xef\xbb\xbf'),crlf=text.count('\r\n'))
    result.update(characters=len(text),han=len(re.findall(r'[\u3400-\u9fff]',text)),latinWords=len(re.findall(r"[A-Za-z]+(?:['’-][A-Za-z]+)*",text)),independentTextSha256=hashlib.sha256(text.encode()).hexdigest())
    target=QA/(sample['id']+'-independent-text.txt')
    with target.open('w',encoding='utf-8',newline='') as handle: handle.write(text)
    result['independentText']=str(target)
    rows.append(result)
(QA/'inspection.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(rows,ensure_ascii=False,indent=2))
