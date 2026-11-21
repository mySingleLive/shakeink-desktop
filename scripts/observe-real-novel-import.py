"""Freeze inputs and observe new or explicitly adopted corpus import journals.

No application actions, model calls, credentials, or database access are performed.
Full public-book assertions stay under the user-requested corpus directory.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import re
import os
import stat
import uuid

CORPUS = Path('/Users/dt_flys/Documents/拆书/真实小说导入测试-20261026')
REPO = Path(__file__).resolve().parents[1]
JOURNALS = Path('/Users/dt_flys/.shakeink/novel-imports')
NODE = Path('/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node')
RUNTIME_FIELDS = ('runtimeAiCall','runtimePauseProof','runtimeDiagnosticsStatus')
RUNTIME_INPUT_MAX_BYTES = 17408
ADOPTION_MAX_BYTES = 64 * 1024 * 1024
ADOPTION_MODE = 'source-before-first-ai'
BUILD_INPUTS = [
    'package.json','dist/main/index.cjs','dist/service/index.cjs',
    'dist/main/novel-import-pdf-worker.cjs','desktop/shared/novel-import.ts',
    'desktop/main/novel-import.ts','desktop/main/novel-import-files.ts',
    'desktop/main/novel-import-pdf-client.ts','desktop/main/novel-import-pdf-worker.ts',
    'desktop/main/novel-import-pdf-engine.ts','desktop/main/novel-import-pdf-source-text.ts',
    'desktop/core/novel-import.ts','desktop/core/novel-import-pdf.ts',
    'desktop/core/novel-import-pdf-source-text.ts','desktop/core/novel-import-semantics.ts',
    'desktop/core/novel-import-semantic-state.ts',
    'desktop/core/novel-import-runtime-proof.ts',
    'desktop/core/novel-import-chapters.ts','desktop/core/novel-import-budget-policy.ts',
    'desktop/core/novel-import-ai-payload.ts','desktop/core/novel-import-review-tasks.ts',
    'desktop/service/novel-import-ai.ts','desktop/service/novel-import-publish.ts',
    'src/components/desktop/NovelImportDialog.tsx','src/components/desktop/NovelImportRecord.tsx',
    'scripts/project-real-novel-import-runtime.ts','scripts/observe-real-novel-import.py',
]

def sha(data):
    return hashlib.sha256(data).hexdigest()

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def runtime_diagnostics(journal):
    """Only strictly validated private diagnostics leave this projection.

    A pending disk record is a locator, never an assertion of an active call.
    This does not operate the app or certify a LIFE result.
    """
    if type(journal.get('semanticVersion')) is not int or journal['semanticVersion'] != 1 or not any(key in journal for key in RUNTIME_FIELDS):
        return {}
    unavailable = dict(runtimeDiagnosticsStatus='unavailable')
    try:
        value = dict(sessionId=journal.get('id'),diagnostics={key:journal[key] for key in RUNTIME_FIELDS if key in journal})
        chunks, size = [], 0
        for part in json.JSONEncoder(ensure_ascii=False,separators=(',',':')).iterencode(value):
            if len(part) > RUNTIME_INPUT_MAX_BYTES-size:
                return unavailable
            data = part.encode('utf-8')
            if len(data) > RUNTIME_INPUT_MAX_BYTES-size:
                return unavailable
            chunks.append(data)
            size += len(data)
        result = subprocess.run([str(NODE),'--import','tsx',str(REPO/'scripts/project-real-novel-import-runtime.ts')],input=b''.join(chunks),stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,cwd=REPO,timeout=20,check=False)
        if result.returncode != 0 or len(result.stdout) > 16385:
            return unavailable
        projected = json.loads(result.stdout.decode('utf-8'))
        if type(projected) is not dict or not set(projected).issubset(RUNTIME_FIELDS):
            return unavailable
        return projected
    except Exception:
        return unavailable

def checked_directory(path, root):
    path, root = Path(path), Path(root)
    if not path.is_absolute() or not path.is_relative_to(root) or path.resolve() != path:
        raise ValueError('Evidence directory identity is outside the permitted root')
    value = path.lstat()
    if not stat.S_ISDIR(value.st_mode):
        raise ValueError('A regular evidence directory is required')
    return value

def opened_directory(path, root):
    before = checked_directory(path, root)
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    current = os.fstat(fd)
    if (before.st_dev,before.st_ino) != (current.st_dev,current.st_ino):
        os.close(fd)
        raise ValueError('Evidence directory changed')
    return fd

def regular_bytes(path, root):
    path = Path(path)
    directory = opened_directory(path.parent, root)
    try:
        fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory)
        try:
            before = os.fstat(fd)
            if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
                raise ValueError('A regular unlinked-alias-free evidence file is required')
            with os.fdopen(os.dup(fd), 'rb') as stream:
                value = stream.read()
            after = os.fstat(fd)
            leaf = os.stat(path.name, dir_fd=directory, follow_symlinks=False)
            if (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns) != (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns) or (after.st_dev,after.st_ino,after.st_nlink) != (leaf.st_dev,leaf.st_ino,1):
                raise ValueError('Evidence file changed during the read')
            checked_directory(path.parent,root)
            return value
        finally:
            os.close(fd)
    finally:
        os.close(directory)

def adoption_uuid(value):
    if type(value) is not str:
        raise ValueError('A canonical adoption UUID is required')
    try:
        canonical = str(uuid.UUID(value))
    except (ValueError,AttributeError):
        raise ValueError('A canonical adoption UUID is required') from None
    if canonical != value:
        raise ValueError('A canonical adoption UUID is required')
    return value

def adoption_file_identity(value):
    return dict(device=value.st_dev,inode=value.st_ino,size=value.st_size,mode=value.st_mode,
                links=value.st_nlink,uid=value.st_uid,gid=value.st_gid,
                mtimeNs=value.st_mtime_ns,ctimeNs=value.st_ctime_ns)

def adoption_directory_identity(value):
    return dict(device=value.st_dev,inode=value.st_ino,mode=value.st_mode,uid=value.st_uid,gid=value.st_gid)

def adoption_file_bytes(directory, name, limit):
    """Only adoption uses this bound. Ordinary journal reading is unchanged."""
    fd = os.open(name,os.O_RDONLY | os.O_NOFOLLOW,dir_fd=directory)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size > limit:
            raise ValueError('Adoption file is linked, non-regular or exceeds its read limit')
        with os.fdopen(os.dup(fd),'rb') as stream:
            value = stream.read(min(limit+1,before.st_size+1))
        after = os.fstat(fd)
        leaf = os.stat(name,dir_fd=directory,follow_symlinks=False)
        identity = adoption_file_identity(before)
        if len(value) > limit or len(value) != before.st_size or identity != adoption_file_identity(after) or identity != adoption_file_identity(leaf):
            raise ValueError('Adoption file changed during its bounded read')
        return value,identity
    finally:
        os.close(fd)

def read_adoption_session(session_id, expected_directory=None, source_binding=False):
    session_id = adoption_uuid(session_id)
    path = JOURNALS/session_id
    directory = opened_directory(path,JOURNALS)
    try:
        identity = adoption_directory_identity(os.fstat(directory))
        if expected_directory is not None and identity != expected_directory:
            raise ValueError('Adopted journal directory identity changed')
        owner,owner_identity = adoption_file_bytes(directory,'.owner',1024)
        if owner != ('shakeink-novel-import-v1\n'+session_id+'\n').encode():
            raise ValueError('Adopted journal owner does not match its UUID')
        if source_binding:
            data,file_identity = adoption_file_bytes(directory,'session.json',ADOPTION_MAX_BYTES)
        else:
            # After binding, keep the normal observer/application journal read
            # boundary. AI growth must not inherit the 64 MiB source-only cap.
            data,file_identity = regular_bytes(path/'session.json',JOURNALS),None
        for name,expected in [('.owner',owner_identity),*([('session.json',file_identity)] if source_binding else [])]:
            if adoption_file_identity(os.stat(name,dir_fd=directory,follow_symlinks=False)) != expected:
                raise ValueError('Adopted journal identity changed during the read')
        if identity != adoption_directory_identity(os.fstat(directory)) or identity != adoption_directory_identity(checked_directory(path,JOURNALS)):
            raise ValueError('Adopted journal directory changed during the read')
        journal = json.loads(data)
        if type(journal) is not dict or journal.get('id') != session_id:
            raise ValueError('Adopted journal id does not match its directory')
        return dict(journal=journal,data=data,owner=owner,directoryIdentity=identity,journalIdentity=file_identity,ownerIdentity=owner_identity)
    finally:
        os.close(directory)

def adoption_sources(journal, expected):
    files = journal.get('files')
    if type(files) is not list or not files or type(expected) is not list or not expected:
        raise ValueError('Adoption requires the complete frozen source set')
    if any(type(row) is not dict or type(row.get('path')) is not str or type(row.get('hash')) is not str or row.get('included') is not True for row in files):
        raise ValueError('Adopted source identity or inclusion is invalid')
    if any(type(row) is not dict or type(row.get('path')) is not str or type(row.get('sha256')) is not str for row in expected):
        raise ValueError('Frozen adoption source set is invalid')
    actual = sorted((row['path'],row['hash']) for row in files)
    frozen = sorted((row['path'],row['sha256']) for row in expected)
    if any(not Path(path).is_absolute() or not Path(path).is_relative_to(CORPUS) or Path(path).resolve() != Path(path) or not re.fullmatch(r'[a-f0-9]{64}',digest) for path,digest in [*actual,*frozen]):
        raise ValueError('Adopted source paths and hashes must remain corpus-bound')
    if len(set(path for path,_ in actual)) != len(actual) or len(set(path for path,_ in frozen)) != len(frozen) or actual != frozen:
        raise ValueError('Adopted journal differs from the exact frozen source set')

def adoption_source_only(journal, expected):
    adoption_sources(journal,expected)
    if type(journal.get('version')) is not int or journal['version'] != 1 or type(journal.get('semanticVersion')) is not int or journal['semanticVersion'] != 1 or journal.get('phase') != 'source':
        raise ValueError('Adoption requires a semantic source-only session')
    if type(journal.get('revision')) is not int or journal['revision'] < 0 or type(journal.get('createdAt')) is not str:
        raise ValueError('Adopted source creation identity is invalid')
    try:
        created = datetime.datetime.fromisoformat(journal['createdAt'].replace('Z','+00:00'))
        if created.tzinfo is None:
            raise ValueError()
    except ValueError:
        raise ValueError('Adopted source creation identity is invalid') from None
    if type(journal.get('workingRevision')) is not int or journal['workingRevision'] != 0 or journal.get('originalProse') != '' or journal.get('workingProse') != '' or 'workingUnits' in journal and journal['workingUnits'] != []:
        raise ValueError('Adoption requires an empty unmodified working copy')
    if any(type(journal.get(key)) is not list or journal[key] for key in ['artifacts','decisions','conflicts','patches','steps','notFound']):
        raise ValueError('Adoption refuses existing analysis or author data')
    coverage = journal.get('coverage')
    if type(coverage) is not dict or any(type(value) is not list or value for value in coverage.values()):
        raise ValueError('Adoption refuses existing coverage credit')
    if any(key in journal for key in ['classificationGrant','analysisGrant','classificationCheckpoint','analysisCheckpoint','publication','semanticState','mappingWarnings',*RUNTIME_FIELDS]):
        raise ValueError('Adoption refuses prior authorization, analysis or runtime records')

def run_directory(run, create=False):
    if not re.fullmatch(r'[A-Za-z0-9_-]+',run):
        raise ValueError('Run must be a simple identifier')
    root = CORPUS/'执行证据'
    directory = opened_directory(root,CORPUS)
    try:
        if create:
            os.mkdir(run, mode=0o700, dir_fd=directory)
        result = root/run
        checked_directory(result,root)
        return result
    finally:
        os.close(directory)

def corpus_bytes(path, expected=None):
    path = Path(path)
    if not path.is_absolute() or not path.is_relative_to(CORPUS) or path.resolve() != path or not path.is_file() or path.stat().st_nlink != 1:
        raise ValueError('A regular, corpus-bound input is required')
    value = regular_bytes(path,CORPUS)
    if expected is not None and sha(value) != expected:
        raise ValueError('Frozen input hash changed')
    return value

def frozen_input(sample):
    """Validate the independent oracle before choosing an exact source representation.

    Binary-document layout mapping is fixed before AI. Final chapters must still
    equal the selected production slices byte for byte; the independent semantic
    oracle is never rewritten to match model output.
    """
    base_sample = 'M01' if sample == 'M01-directory' else sample
    if base_sample not in ['S01','S02','M01','M02','L01','L02']:
        raise ValueError('Unknown corpus sample')
    oracle_path = CORPUS/'语义基线'/f'{base_sample}.json'
    oracle_bytes = corpus_bytes(oracle_path)
    oracle = json.loads(oracle_bytes)
    status = oracle['readCoverage']['status']
    if 'partial' in status or not status.startswith('complete'):
        raise ValueError('Full independent reading is required before this run')
    source = Path(oracle['sourcePath'])
    source_bytes = corpus_bytes(source, oracle['sourceHash'])
    independent_hash = oracle.get('independentTextHash') or oracle['sourceHashes']['independentTextUtf8']
    independent = corpus_bytes(oracle['independentTextPath'], independent_hash).decode('utf-8')
    region = oracle['selectedBodyRange']
    body = independent[region['start']:region['end']]
    files = [dict(path=str(source),name=source.name,sha256=sha(source_bytes))]
    representation = None
    selected_directory = None
    if sample == 'M01-directory':
        manifest_path = CORPUS/'directory-M01-manifest.json'
        manifest_bytes = corpus_bytes(manifest_path)
        manifest = json.loads(manifest_bytes)
        directory_oracle = json.loads(corpus_bytes(CORPUS/'语义基线/M01-directory.json'))
        if directory_oracle['baseOracleSha256'] != sha(oracle_bytes) or directory_oracle['expectedBodySha256'] != sha(body.encode()):
            raise ValueError('Directory oracle does not bind the complete base novel')
        selected_directory = manifest['selectedDirectory']
        if Path(selected_directory).resolve() != Path(selected_directory) or not Path(selected_directory).is_relative_to(CORPUS/'目录样本'):
            raise ValueError('Directory source is outside this corpus')
        files = []
        concatenated = b''
        for entry in sorted(manifest['files'], key=lambda row:row['order']):
            path = Path(entry['path'])
            if path.parent != Path(selected_directory):
                raise ValueError('Unexpected directory member')
            value = corpus_bytes(path,entry['sha256'])
            original_region = entry['sourceCodepointRange']
            if value != independent[original_region['start']:original_region['end']].encode():
                raise ValueError('A directory chapter differs from the original novel')
            concatenated += value
            files.append(dict(path=str(path),name=str(path.relative_to(Path(selected_directory).parent)),sha256=entry['sha256']))
        if len(files) != 9 or len(set(row['path'] for row in files)) != 9 or concatenated != body.encode() or sorted(str(p) for p in Path(selected_directory).iterdir()) != sorted(row['path'] for row in files):
            raise ValueError('The directory does not contain the exact nine frozen chapters')
        representation = dict(kind='directory-exact-concatenation',manifestPath=str(manifest_path),manifestSha256=sha(manifest_bytes))
    elif sample in ['L01','L02']:
        map_path = CORPUS/'输入核验'/f'{sample}-ui-source-map.json'
        map_bytes = corpus_bytes(map_path)
        mapping = json.loads(map_bytes)
        if sample == 'L01':
            if mapping['source']['sha256'] != sha(source_bytes) or mapping['oracle']['sha256'] != sha(oracle_bytes) or mapping['independentText']['sha256'] != sha(independent.encode()):
                raise ValueError('PDF representation map is not bound to the frozen inputs')
            production_bytes = corpus_bytes(mapping['production']['path'],mapping['production']['sha256'])
            production = json.loads(production_bytes)
            full = production['text']
            if len(full.encode('utf-16-le')) // 2 != len(full):
                raise ValueError('This frozen PDF map requires an explicit UTF-16 conversion')
            if sha(full.encode()) != mapping['production']['textSha256'] or full.translate({ord(c):None for c in full if c.isspace()}) != ''.join(independent.split()):
                raise ValueError('PDF full-container text differs from the independent text')
            ranges = mapping['includedRanges']
            body = ''.join(full[row['start']:row['end']] for row in ranges)
            expected = ''.join(ch for index,ch in enumerate(independent) if region['start'] <= index < region['end'] and not any(r['start'] <= index < r['end'] for r in oracle['layoutNonNarrativeRanges']))
            if ''.join(body.split()) != ''.join(expected.split()) or corpus_bytes(mapping['selectedProse']['path'],mapping['selectedProse']['sha256']) != body.encode():
                raise ValueError('PDF selected narrative differs from the frozen non-layout narrative')
            representation = dict(kind='verified-pdf-production-slices',coordinateSystem='zero-based UTF-16 half-open',mapPath=str(map_path),mapSha256=sha(map_bytes),productionTextSha256=sha(full.encode()),includedRanges=ranges,sourceTextProofHash=production['pdfInspection']['sourceTextDecoding']['proofHash'])
        else:
            sources = mapping['sources']
            if sources['originalDocx']['sha256'] != sha(source_bytes) or sources['frozenOracle']['sha256'] != sha(oracle_bytes) or sources['independentText']['sha256'] != sha(independent.encode()):
                raise ValueError('DOCX representation map is not bound to the frozen inputs')
            full = corpus_bytes(sources['actualProductionExtraction']['path'],sources['actualProductionExtraction']['sha256']).decode('utf-8')
            if len(full.encode('utf-16-le')) // 2 != len(full):
                raise ValueError('This frozen DOCX map requires an explicit UTF-16 conversion')
            selected = mapping['selectedNarrative']
            cut = selected['productionAbsoluteRange']['unicodeCodepoints']
            body = full[cut['start']:cut['end']]
            expected = independent[region['start']:region['end']]
            if corpus_bytes(selected['selectedProseFile']['path'],selected['selectedProseFile']['sha256']) != body.encode() or re.findall(r'\w+|[^\w\s]',body) != re.findall(r'\w+|[^\w\s]',expected):
                raise ValueError('DOCX selected words or punctuation differ from the independent narrative')
            if not mapping['contentCoverage']['allVisibleTextIncludingTablePreserved'] or not mapping['contentCoverage']['allWordAndPunctuationTokensEqual']:
                raise ValueError('Complete independent OOXML coverage is required')
            representation = dict(kind='verified-docx-production-slices',coordinateSystem='zero-based UTF-16 half-open',mapPath=str(map_path),mapSha256=sha(map_bytes),productionTextSha256=sha(full.encode()),includedRanges=[cut])
    return oracle_path,oracle_bytes,oracle,source,files,body,representation,selected_directory

def save_bytes(path, value, replace=True):
    path = Path(path)
    directory = opened_directory(path.parent,CORPUS/'执行证据')
    temporary = '.observer-'+uuid.uuid4().hex
    try:
        try:
            previous = os.stat(path.name,dir_fd=directory,follow_symlinks=False)
            if not stat.S_ISREG(previous.st_mode) or previous.st_nlink != 1:
                raise ValueError('Refusing to replace a linked evidence file')
            if not replace:
                raise FileExistsError('Evidence file already exists')
        except FileNotFoundError:
            pass
        fd = os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=directory)
        with os.fdopen(fd,'wb') as output:
            output.write(value)
            output.flush()
            os.fsync(output.fileno())
        checked_directory(path.parent,CORPUS/'执行证据')
        os.replace(temporary,path.name,src_dir_fd=directory,dst_dir_fd=directory)
        os.fsync(directory)
    finally:
        try:
            os.unlink(temporary,dir_fd=directory)
        except FileNotFoundError:
            pass
        os.close(directory)

def save(path, value, replace=True):
    save_bytes(path,(json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode('utf-8'),replace)

def record_build(run, label):
    if not re.fullmatch(r'[A-Za-z0-9_-]+',label):
        raise ValueError('Build label must be a simple identifier')
    destination = run_directory(run)
    paths = [name for name in BUILD_INPUTS if (REPO/name).is_file()]
    value = dict(recordedAt=now(), gitHead=subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip(),
                 resources={name:sha((REPO/name).read_bytes()) for name in paths},
                 scope='actual build before resuming this run; frozen source and oracle are unchanged')
    path = destination/(label+'-build.json')
    save(path,value,replace=False)
    print(json.dumps({'run':run,'label':label,'recordedAt':value['recordedAt'],'serviceSha256':value['resources']['dist/service/index.cjs']}))

def freeze(sample, run, adopt_source_session=None):
    if adopt_source_session is not None:
        adoption_uuid(adopt_source_session)
    oracle_path,oracle_bytes,oracle,source,source_files,body,representation,selected_directory = frozen_input(sample)
    source_hash = oracle['sourceHash']
    region = oracle['selectedBodyRange']
    adopted = None
    if adopt_source_session is not None:
        adopted = read_adoption_session(adopt_source_session,source_binding=True)
        adoption_source_only(adopted['journal'],source_files)
    destination = run_directory(run,create=True)
    save_bytes(destination/'expected-body.txt',body.encode('utf-8'),replace=False)
    save_bytes(destination/'oracle-frozen.json',oracle_bytes,replace=False)
    identity_files = BUILD_INPUTS
    resource_hashes = {name:sha((REPO/name).read_bytes()) for name in identity_files if (REPO/name).is_file()}
    ui_files = list((REPO/'out/_next').rglob('*.js'))
    ui_identity = sha('\n'.join(sorted(str(p.relative_to(REPO))+':'+sha(p.read_bytes()) for p in ui_files)).encode())
    metadata = dict(sample=sample, run=run, frozenAt=now(), sourcePath=str(source),
                    sourceSha256=source_hash, oracleSha256=sha(oracle_bytes),
                    oracleModifiedAt=datetime.datetime.fromtimestamp(oracle_path.stat().st_mtime, datetime.timezone.utc).isoformat(),
                    oracleAuthor=oracle['provenance']['reader'], expectedBodyRange=region,
                    expectedBodyCharacters=len(body), expectedBodySha256=sha(body.encode()),
                    existingJournalIds=sorted(p.name for p in JOURNALS.iterdir() if p.is_dir()) if JOURNALS.exists() else [],
                    electronPath=str(REPO/'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
                    electronVersion=(REPO/'node_modules/electron/dist/version').read_text().strip(),
                    gitHead=subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip(),
                    resourceHashes=resource_hashes, uiJavaScriptIdentity=ui_identity,
                    actions='Native UI via CUA; observer does not operate the application')
    if representation:
        metadata.update(sourceFiles=source_files,bodyRepresentation=representation)
    if selected_directory:
        metadata['selectedDirectory'] = selected_directory
    if adopted is not None:
        if adopt_source_session not in metadata['existingJournalIds']:
            raise ValueError('Adopted source was not in the complete existing journal list')
        metadata['sourceFiles'] = source_files
        metadata['adoptedExistingSession'] = dict(version=1,mode=ADOPTION_MODE,sessionId=adopt_source_session,
            createdAt=adopted['journal']['createdAt'],originalRevision=adopted['journal']['revision'],
            directoryIdentity=adopted['directoryIdentity'],journalIdentity=adopted['journalIdentity'],
            journalSha256=sha(adopted['data']),ownerSha256=sha(adopted['owner']))
        try:
            latest = read_adoption_session(adopt_source_session,adopted['directoryIdentity'],source_binding=True)
            adoption_source_only(latest['journal'],source_files)
            if any(latest[key] != adopted[key] for key in ['data','owner','directoryIdentity','journalIdentity','ownerIdentity']):
                raise ValueError('Adopted source changed')
        except (ValueError,OSError):
            raise ValueError('Adopted source could not be revalidated; partial evidence is retained, use a new run') from None
        save(destination/'run.json',metadata,replace=False)
    else:
        save(destination/'run.json',metadata)
    print(json.dumps({k:metadata[k] for k in ['sample','run','frozenAt','expectedBodyCharacters','expectedBodySha256']}, ensure_ascii=False))

def observe(run):
    destination = run_directory(run)
    metadata = json.loads(regular_bytes(destination/'run.json',CORPUS/'执行证据'))
    if metadata['run'] != run:
        raise ValueError('Run metadata does not belong to this evidence directory')
    if metadata['sample'] in ['L01','L02','M01-directory'] and (not metadata.get('bodyRepresentation') or not metadata.get('sourceFiles')):
        raise ValueError('Binary/directory runs require a frozen representation and exact source set')
    candidates = []
    if 'adoptedExistingSession' in metadata:
        binding = metadata['adoptedExistingSession']
        if type(binding) is not dict or type(binding.get('version')) is not int or binding['version'] != 1 or binding.get('mode') != ADOPTION_MODE or type(binding.get('createdAt')) is not str or not binding['createdAt'] or type(binding.get('originalRevision')) is not int or binding['originalRevision'] < 0 or type(binding.get('directoryIdentity')) is not dict or set(binding['directoryIdentity']) != {'device','inode','mode','uid','gid'} or any(type(value) is not int for value in binding['directoryIdentity'].values()) or binding.get('sessionId') not in metadata['existingJournalIds']:
            raise ValueError('Existing source adoption metadata is invalid')
        journal = read_adoption_session(binding.get('sessionId'),binding['directoryIdentity'])['journal']
        if journal.get('createdAt') != binding.get('createdAt'):
            raise ValueError('Adopted journal creation identity changed')
        expected_sources = metadata.get('sourceFiles')
        adoption_sources(journal,expected_sources)
        candidates.append(journal)
    else:
        for directory in JOURNALS.iterdir():
            if not directory.is_dir() or directory.name in metadata['existingJournalIds']:
                continue
            path = directory/'session.json'
            if not path.is_file():
                continue
            journal = json.loads(regular_bytes(path,JOURNALS))
            files = journal.get('files', [])
            if not files or not all(Path(f['path']).is_relative_to(CORPUS) for f in files):
                continue
            expected_sources = metadata.get('sourceFiles',[dict(path=metadata['sourcePath'],sha256=metadata['sourceSha256'])])
            if sorted(f['path'] for f in files) != sorted(f['path'] for f in expected_sources):
                continue
            candidates.append(journal)
    if not candidates:
        print(json.dumps({'run':run,'status':'no-matching-new-journal'}))
        return
    if len(candidates) != 1:
        raise ValueError('More than one new journal matches this frozen run; no evidence was overwritten')
    for journal in candidates:
        # Exclude endpoint/auth and authorization grants from copied evidence.
        safe = {k:journal[k] for k in ['version','id','revision','phase','title','createdAt','updatedAt','selected','targets','infer','steps','coverage','notFound','error','publication','decisions','originalProse','workingProse','workingRevision','epoch','resumePhase','artifacts','chapters','conflicts','patches','units','workingUnits','budgetPolicy','legacyBudget','pdfPageDecisionEvents','semanticVersion','semanticState','mappingWarnings','chapterDetection'] if k in journal}
        safe.update(runtime_diagnostics(journal))
        safe['analysisCheckpointHash'] = journal.get('analysisCheckpoint',{}).get('hash')
        safe['models'] = {role:{k:model[k] for k in ['id','name','modelId','provider','contextWindow'] if k in model} for role,model in journal.get('models',{}).items() if model}
        safe['files'] = [{k:f[k] for k in ['id','name','format','hash','included','error','encoding','parts','pages','proof','pdfInspection','pdfPageDecisions','pdfPreviewFailures','pdfSourceInvalidated'] if k in f} for f in journal['files']]
        save(destination/'latest-checkpoint.json',safe)
        summary = {k:safe.get(k) for k in ['id','revision','phase','title','updatedAt','selected','targets','steps','notFound','error','publication']}
        summary['coverage'] = {k:len(v) for k,v in safe.get('coverage',{}).items()}
        summary['artifactCounts'] = {kind:sum(a['kind']==kind for a in safe['artifacts']) for kind in safe['targets']}
        summary['artifactHashesByKind'] = {kind:sha(json.dumps([a for a in safe['artifacts'] if a['kind']==kind],sort_keys=True,ensure_ascii=False).encode()) for kind in safe['targets']}
        summary['workingRevision'] = safe.get('workingRevision')
        summary['analysisCheckpointHash'] = safe.get('analysisCheckpointHash')
        summary['pendingConflicts'] = sum(c['status']=='pending' for c in safe['conflicts'])
        summary['sourceHashesMatch'] = all(any(f['name']==e.get('name',Path(e['path']).name) and f['hash']==e['sha256'] for e in expected_sources) for f in safe['files'])
        summary['finalBodyMatchesIndependent'] = sha(safe['workingProse'].encode())==metadata['expectedBodySha256'] if safe['workingProse'] else None
        observations = destination/'observations.jsonl'
        previous = regular_bytes(observations,CORPUS/'执行证据').decode('utf-8') if observations.exists() or observations.is_symlink() else ''
        # Atomic replacement retains the append-only JSONL history without
        # following symlinks or mutating a hard-linked external file.
        for line in previous.splitlines():
            if line:
                json.loads(line)
        save_bytes(observations,(previous+json.dumps(dict(observedAt=now(),**summary),ensure_ascii=False)+'\n').encode('utf-8'))
        print(json.dumps(summary,ensure_ascii=False))

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('mode',choices=['freeze','observe','build'])
    parser.add_argument('--sample')
    parser.add_argument('--run',required=True)
    parser.add_argument('--label',default='current')
    parser.add_argument('--adopt-source-session')
    args=parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_-]+',args.run) or not re.fullmatch(r'[A-Za-z0-9_-]+',args.label):
        raise ValueError('Run and label must be simple identifiers')
    if args.adopt_source_session is not None and args.mode != 'freeze':
        raise ValueError('Existing source adoption is only available during freeze')
    if args.mode=='freeze':
        freeze(args.sample,args.run,args.adopt_source_session)
    elif args.mode=='observe':
        observe(args.run)
    else:
        record_build(args.run,args.label)
