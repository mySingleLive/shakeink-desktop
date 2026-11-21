"""Download only the reviewed, public full-text corpus. Never transcode originals."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import tempfile
import time
import urllib.parse
import urllib.request
import zipfile

ROOT = Path('/Users/dt_flys/Documents/拆书/真实小说导入测试-20261026')
PIN = 'b859e5043211b9ead7417ba3f5776e81eaf9213c'
RAW = 'https://raw.githubusercontent.com/Ac-heron/luxun/' + PIN + '/'
SAMPLES = [
    dict(id='L01', title='老残游记', author='刘鹗', lengthClass='long', format='pdf', filename='L01-老残游记.pdf', url='https://www.hnwomen.com/_upload/article/files/fd/ac/75777b2d4097990b4e2bb5d01db1/d6abb0c1-841f-4ff9-b988-1926d602deef.pdf', landing='https://www.gutenberg.org/ebooks/25124', rights='公版原作；公开机构文本版本，保留原文件'),
    dict(id='L02', title='Warbreaker', author='Brandon Sanderson', version='4.2', lengthClass='long', format='docx', filename='L02-WarbreakerFull4.2.docx', url='https://cdn.shopify.com/s/files/1/0886/8082/5106/files/WarbreakerFull4.2.docx?v=1723755358', landing='https://www.brandonsanderson.com/blogs/blog/warbreaker-rights-and-downloads', rights='作者官方全文；CC BY-NC-ND 3.0 US；原文不改，不公开分发测试衍生内容'),
    dict(id='M01', title='阿Ｑ正传', author='鲁迅', version=PIN, lengthClass='medium', format='md', filename='M01-阿Ｑ正传.md', url=RAW+urllib.parse.quote('全集/呐喊/阿Ｑ正传.md'), landing='https://github.com/Ac-heron/luxun', rights='公版原作；项目现代注释另列为附属内容'),
    dict(id='M02', title='The Time Machine', author='H. G. Wells', lengthClass='medium', format='txt', filename='M02-The-Time-Machine.txt', url='https://raw.githubusercontent.com/GITenberg/The-Time-Machine_35/master/35-0.txt', originalUrl='https://www.gutenberg.org/cache/epub/35/pg35.txt', sourceChange='原站证书链错误，使用已核对的公开GITenberg原书镜像', landing='https://www.gutenberg.org/ebooks/35', rights='Gutenberg标明Public domain in the USA；保留原文许可'),
    dict(id='S01', title='孔乙己', author='鲁迅', version=PIN, lengthClass='short', format='md', filename='S01-孔乙己.md', url=RAW+urllib.parse.quote('全集/呐喊/孔乙己.md'), landing='https://github.com/Ac-heron/luxun', rights='公版原作；项目现代注释另列为附属内容'),
    dict(id='S02', title='狂人日记', author='鲁迅', lengthClass='short', format='txt', filename='S02-狂人日记.txt', url='https://raw.githubusercontent.com/GITenberg/----_25423/master/25423-0.txt', originalUrl='https://www.gutenberg.org/cache/epub/25423/pg25423.txt', sourceChange='原站证书链错误，使用已核对的公开GITenberg原书镜像', landing='https://www.gutenberg.org/ebooks/25423', rights='Gutenberg标明Public domain in the USA；保留原文许可'),
]

def validate(path, kind):
    with path.open('rb') as source:
        head = source.read(1024)
    if kind == 'pdf':
        if not head.startswith(b'%PDF-'):
            raise ValueError('响应不是PDF文件')
    elif kind == 'docx':
        with zipfile.ZipFile(path) as archive:
            info = archive.infolist()
            if len(info) > 10000 or sum(item.file_size for item in info) > 100*1024*1024:
                raise ValueError('DOCX容器超过预检容量')
            if not {'[Content_Types].xml','word/document.xml'}.issubset(archive.namelist()):
                raise ValueError('响应不是Word正文DOCX')
            if archive.testzip():
                raise ValueError('DOCX容器校验失败')
    else:
        text = path.read_text(encoding='utf-8-sig')
        if '\x00' in text or text.lstrip().lower().startswith(('<!doctype html', '<html')):
            raise ValueError('响应不是预期文本原文件')

def main():
    originals = ROOT/'原始小说'
    originals.mkdir(parents=True, exist_ok=True, mode=0o700)
    for parent in [ROOT, originals]:
        if parent.is_symlink():
            raise ValueError('目标目录不得是符号链接')
    manifest = ROOT/'corpus-manifest.json'
    previous = json.loads(manifest.read_text()) if manifest.exists() else {'samples':[]}
    known = {sample['id']:sample for sample in previous['samples']}
    records = []
    for sample in SAMPLES:
        target = originals/sample['filename']
        if target.exists():
            old = known.get(sample['id'])
            digest = hashlib.sha256(target.read_bytes()).hexdigest()
            if not old or old.get('sha256') != digest or old.get('url') != sample['url']:
                raise ValueError('已有文件不属于已核对的同一次下载，不覆盖')
            records.append(old)
            print(json.dumps({'id':sample['id'], 'status':'existing-verified','bytes':old['bytes']},ensure_ascii=False),flush=True)
            continue
        record = dict(sample)
        for attempt in range(3):
            temp_path = None
            try:
                request = urllib.request.Request(sample['url'],headers={'User-Agent':'ShakeInk-Import-QA/1.0 (personal full-text test; 6 files)'})
                with urllib.request.urlopen(request, timeout=90) as response:
                    if urllib.parse.urlparse(response.geturl()).scheme != 'https':
                        raise ValueError('不接受降级的非HTTPS下载')
                    fd, name = tempfile.mkstemp(prefix='.download-',dir=originals)
                    temp_path = Path(name)
                    digest = hashlib.sha256()
                    total = 0
                    with os.fdopen(fd,'wb') as dest:
                        while True:
                            chunk = response.read(64*1024)
                            if not chunk: break
                            total += len(chunk)
                            if total > 50*1024*1024:
                                raise ValueError('来源超过50MiB预检限制')
                            dest.write(chunk)
                            digest.update(chunk)
                    validate(temp_path,sample['format'])
                    os.link(temp_path,target)  # Atomic no-overwrite publication.
                    temp_path.unlink()
                    temp_path = None
                    record.update(path=str(target), finalUrl=response.geturl(), contentType=response.headers.get('Content-Type'), bytes=total, sha256=digest.hexdigest(), downloadedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), status='downloaded-container-verified')
                break
            except Exception as error:
                if temp_path is not None: temp_path.unlink(missing_ok=True)
                if attempt == 2:
                    record.update(status='download-failed',errorType=type(error).__name__)
                else: time.sleep(1+attempt)
        records.append(record)
        manifest.write_text(json.dumps({'downloadStage':'after-01-research','root':str(ROOT),'samples':records},ensure_ascii=False,indent=2)+'\n')
        os.chmod(manifest,0o600)
        print(json.dumps({key:record.get(key) for key in ['id','status','bytes','sha256','errorType']},ensure_ascii=False),flush=True)
    manifest.write_text(json.dumps({'downloadStage':'after-01-research','root':str(ROOT),'samples':records},ensure_ascii=False,indent=2)+'\n')
    if any(record.get('status') != 'downloaded-container-verified' for record in records):
        raise SystemExit(1)

if __name__ == '__main__': main()
