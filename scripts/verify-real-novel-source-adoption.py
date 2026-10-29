"""61/62 isolated source-session adoption checks. No real corpus/app/model/DB."""
import argparse
import ast
from contextlib import redirect_stdout, redirect_stderr
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[1]
SCRIPT = REPO/'scripts/observe-real-novel-import.py'
spec = importlib.util.spec_from_file_location('source_adoption_under_test',SCRIPT)
observer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(observer)
SID = '11111111-1111-4111-8111-111111111111'
OTHER = '22222222-2222-4222-8222-222222222222'
DECOY = '33333333-3333-4333-8333-333333333333'
SECRET = 'SYNTHETIC_SECRET_MUST_NOT_BE_PROJECTED'
# Captured from the genuine pre-implementation baseline, not current output.
UNCHANGED_FUNCTION_SHA256 = dict(regular_bytes='a1e52b1ade3284b0919af3f2f85732c73752b9b174d8e68fae9b60de46092284',runtime_diagnostics='df3b10fd922533f7fb7cb8e0c657f08803ac203496f52921af2df3042cdfbd4e',record_build='b4c82a0412b74de02d4f56c8a67f15f83cba87ba8a05f3a8dd1bd23cc1d6bbfd')

def cli(arguments):
    # Execute the actual production CLI guard with only its filesystem roots
    # rebound to this process's synthetic corpus. Never invoke the real roots.
    guard = next(node for node in ast.parse(SCRIPT.read_text()).body if isinstance(node,ast.If) and isinstance(node.test,ast.Compare) and isinstance(node.test.left,ast.Name) and node.test.left.id=='__name__')
    namespace = dict(observer.__dict__,__name__='__main__')
    stdout, stderr = io.StringIO(), io.StringIO()
    with patch.object(sys,'argv',[str(SCRIPT),*arguments]),redirect_stdout(stdout),redirect_stderr(stderr):
        try:
            exec(compile(ast.Module(body=[guard],type_ignores=[]),str(SCRIPT),'exec'),namespace)
        except SystemExit as error:
            return error.code or 0,stdout.getvalue(),stderr.getvalue()
    return 0,stdout.getvalue(),stderr.getvalue()

class Fixture:
    def __init__(self,root):
        self.root=root
        self.corpus=root/'corpus';self.journals=root/'journals';self.repo=root/'repo'
        for directory in [self.corpus/'执行证据',self.corpus/'语义基线',self.corpus/'sources',self.repo/'node_modules/electron/dist',self.journals]:
            directory.mkdir(parents=True,exist_ok=True)
        self.source=self.corpus/'sources/synthetic.md';self.text='合成独立正文。\n末句。'
        self.source.write_text(self.text);independent=self.corpus/'independent.txt';independent.write_text(self.text)
        oracle=dict(readCoverage=dict(status='complete-synthetic'),sourcePath=str(self.source),sourceHash=observer.sha(self.source.read_bytes()),independentTextPath=str(independent),independentTextHash=observer.sha(independent.read_bytes()),selectedBodyRange=dict(start=0,end=len(self.text)),provenance=dict(reader='isolated-synthetic'))
        (self.corpus/'语义基线/S02.json').write_text(json.dumps(oracle))
        (self.repo/'package.json').write_text('{"name":"synthetic"}')
        (self.repo/'node_modules/electron/dist/version').write_text('0.0.0-synthetic')
        self.initial=dict(version=1,semanticVersion=1,id=SID,createdAt='2026-10-26T00:00:00.000Z',updatedAt='2026-10-26T00:00:01.000Z',revision=4,phase='source',title='合成来源',files=[dict(id='source-one',name=self.source.name,path=str(self.source),hash=oracle['sourceHash'],included=True,format='md')],units=[],selected=['body'],targets=['character'],infer=True,coverage={},steps=[],notFound=[],artifacts=[],decisions=[],conflicts=[],patches=[],originalProse='',workingProse='',workingRevision=0,epoch=0,chapters=[],models=dict(text=dict(id='synthetic',name='合成模型',modelId='synthetic',endpoint=SECRET,apiKey=SECRET)))
        self.write(SID,self.initial)
        self.write(OTHER,dict(self.initial,id=OTHER))
    def write(self,sid,value,atomic=False):
        directory=self.journals/sid;directory.mkdir(exist_ok=True)
        owner=directory/'.owner'
        if not owner.exists():owner.write_text('shakeink-novel-import-v1\n'+sid+'\n')
        path=directory/'session.json';data=(json.dumps(value,ensure_ascii=False)+'\n').encode()
        if atomic:
            temp=directory/'synthetic-next';temp.write_bytes(data);os.replace(temp,path)
        else:path.write_bytes(data)
        return path
    def run(self,name):return self.corpus/'执行证据'/name

def main(output):
    checks=[];failure=None
    def check(name,value):
        checks.append(dict(name=name,passed=bool(value)))
        assert value,name
    def reject(name,operation):
        try:
            with redirect_stdout(io.StringIO()),redirect_stderr(io.StringIO()):operation()
        except (ValueError,OSError,SystemExit):check(name,True)
        else:check(name,False)
    with output.open('x',encoding='utf-8') as report:
        try:
            with tempfile.TemporaryDirectory(prefix='novel-import-adoption-') as temporary:
                f=Fixture(Path(temporary).resolve())
                with patch.object(observer,'CORPUS',f.corpus),patch.object(observer,'JOURNALS',f.journals),patch.object(observer,'REPO',f.repo),patch.object(observer.subprocess,'check_output',return_value='0'*40+'\n'):
                    code,stdout,stderr=cli(['freeze','--sample','S02','--run','adopt-valid','--adopt-source-session',SID])
                    check('real freeze CLI accepts explicit existing source adoption (old CLI has no such mode)',code==0)
                    metadata=json.loads((f.run('adopt-valid')/'run.json').read_bytes())
                    check('existing IDs remain complete and retain the adopted ID',metadata['existingJournalIds']==sorted([SID,OTHER]))
                    check('adoption is explicit rather than pretending this was a new journal',metadata['adoptedExistingSession']['sessionId']==SID)
                    path=f.journals/SID/'session.json';owner=f.journals/SID/'.owner';original=path.read_bytes();owner_bytes=owner.read_bytes();binding=metadata['adoptedExistingSession']
                    check('original revision creation time and bytes are recorded',binding['originalRevision']==4 and binding['createdAt']==f.initial['createdAt'] and binding['journalSha256']==observer.sha(original))
                    check('mode stores bounded-read identity and directory pin',binding['mode']=='source-before-first-ai' and binding['directoryIdentity']['inode']==(f.journals/SID).stat().st_ino and binding['journalIdentity']['inode']==path.stat().st_ino)
                    check('freeze never rewrites journal owner source or independent oracle',path.read_bytes()==original and owner.read_bytes()==owner_bytes and f.source.read_text()==f.text)
                    check('adoption metadata never contains model credentials',SECRET not in json.dumps(metadata))
                    check('new mode limit is exactly 64 MiB',observer.ADOPTION_MAX_BYTES==64*1024*1024)
                    reject('exclusive verifier output cannot be reused',lambda:main(output))
                    for value in ['../escape',SID.upper(),SID+'x','not-a-uuid','']:
                        # SID consists of digits; use an alphabetic canonical ID
                        # to distinguish uppercase from canonical lowercase.
                        if value==SID.upper():value='ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF'
                        with patch.object(observer,'frozen_input',side_effect=AssertionError('invalid UUID must fail before source IO')):
                            reject('invalid adoption UUID rejected before input read',lambda value=value:observer.freeze('S02','invalid-uuid',value))
                    reject('adoption option on observe is not silently ignored',lambda:cli(['observe','--run','adopt-valid','--adopt-source-session',SID]))
                    reject('adoption option on build is not silently ignored',lambda:cli(['build','--run','adopt-valid','--adopt-source-session',SID]))
                    def freeze_bad(name,value):
                        f.write(SID,value)
                        reject(name,lambda:observer.freeze('S02','reject-'+str(len(checks)),SID))
                        check(name+' does not create a run',not f.run('reject-'+str(len(checks)-1)).exists())
                        f.write(SID,f.initial)
                    for key,value in [('id',OTHER),('semanticVersion',True),('semanticVersion',2),('phase','paused'),('workingRevision',1),('workingRevision',False),('workingProse','started'),('originalProse','started'),('workingUnits',[{}]),('artifacts',[{}]),('decisions',[{}]),('conflicts',[{}]),('patches',[{}]),('steps',[{}]),('notFound',['character']),('coverage',{'character':['done']}),('coverage',{'classify':['done']}),('coverage',{'classify':False}),('classificationGrant',{}),('analysisGrant',None),('classificationCheckpoint',{}),('analysisCheckpoint',{}),('publication',{}),('semanticState',{}),('mappingWarnings',[]),('runtimeAiCall',{}),('runtimePauseProof',{}),('runtimeDiagnosticsStatus','unavailable')]:
                        bad=copy.deepcopy(f.initial);bad[key]=value;freeze_bad('source-only refuses '+key+' '+str(len(checks)),bad)
                    for name,edit in [('wrong-source',lambda value:value['files'][0].update(path=str(f.corpus/'sources/other.md'))),('wrong-hash',lambda value:value['files'][0].update(hash='f'*64)),('not-included',lambda value:value['files'][0].update(included=False)),('boolean-inclusion-only',lambda value:value['files'][0].update(included=1)),('duplicate-source',lambda value:value['files'].append(copy.deepcopy(value['files'][0]))),('extra-excluded-source',lambda value:value['files'].append(dict(value['files'][0],path=str(f.corpus/'other.md'),included=False)))]:
                        bad=copy.deepcopy(f.initial);edit(bad);freeze_bad(name,bad)
                    owner.write_text('wrong-owner\n')
                    reject('wrong owner rejected before creating run',lambda:observer.freeze('S02','wrong-owner',SID));check('wrong-owner run absent',not f.run('wrong-owner').exists());owner.write_bytes(owner_bytes)
                    for target in [path,owner]:
                        data=target.read_bytes();target.unlink();target.symlink_to(f.source)
                        reject('symlink journal or owner rejected',lambda:observer.freeze('S02','symlink-'+str(len(checks)),SID));target.unlink();target.write_bytes(data)
                        alias=target.with_name(target.name+'.alias');os.link(target,alias)
                        reject('hardlinked journal or owner rejected',lambda:observer.freeze('S02','hardlink-'+str(len(checks)),SID));alias.unlink()
                    directory=f.journals/SID;held=f.journals/'held-original';directory.rename(held);directory.symlink_to(held,target_is_directory=True)
                    reject('symlink session directory rejected',lambda:observer.freeze('S02','symlink-directory',SID));directory.unlink();held.rename(directory)
                    fdopen=observer.os.fdopen
                    def no_oversize_read(fd,mode,*args,**kwargs):
                        assert mode!='rb' or os.fstat(fd).st_ino!=path.stat().st_ino or os.fstat(fd).st_size<=observer.ADOPTION_MAX_BYTES,'must stat-reject before reading oversized bytes'
                        return fdopen(fd,mode,*args,**kwargs)
                    with path.open('wb') as stream:stream.truncate(observer.ADOPTION_MAX_BYTES+1)
                    with patch.object(observer.os,'fdopen',side_effect=no_oversize_read):reject('64 MiB sparse oversize rejected before stream read',lambda:observer.freeze('S02','oversize',SID))
                    f.write(SID,f.initial);data=path.read_bytes();read_sizes=[]
                    class Reader:
                        def __init__(self,stream,change=False):self.stream=stream;self.change=change
                        def __enter__(self):self.stream.__enter__();return self
                        def __exit__(self,*args):return self.stream.__exit__(*args)
                        def read(self,size=-1):
                            assert 0<=size<=observer.ADOPTION_MAX_BYTES+1,'adoption read must always be bounded'
                            read_sizes.append(size);value=self.stream.read(size)
                            if self.change:path.write_bytes(data.replace(b'"revision": 4',b'"revision": 5'))
                            return value
                    def bounded(fd,mode,*args,**kwargs):
                        adopted=os.fstat(fd).st_ino in [path.stat().st_ino,owner.stat().st_ino];stream=fdopen(fd,mode,*args,**kwargs)
                        return Reader(stream) if mode=='rb' and adopted else stream
                    with patch.object(observer,'ADOPTION_MAX_BYTES',len(data)),patch.object(observer.os,'fdopen',side_effect=bounded),redirect_stdout(io.StringIO()):observer.freeze('S02','exact-boundary',SID)
                    check('exact byte boundary accepted with limit+1 read requests',bool(read_sizes) and max(read_sizes)==len(data)+1)
                    with patch.object(observer,'ADOPTION_MAX_BYTES',len(data)-1):reject('one byte above configured bound rejected',lambda:observer.freeze('S02','above-boundary',SID))
                    def growing(fd,mode,*args,**kwargs):
                        adopted=os.fstat(fd).st_ino in [path.stat().st_ino,owner.stat().st_ino];is_journal=os.fstat(fd).st_ino==path.stat().st_ino;stream=fdopen(fd,mode,*args,**kwargs)
                        return Reader(stream,is_journal) if mode=='rb' and adopted else stream
                    with patch.object(observer.os,'fdopen',side_effect=growing):reject('in-place change during bounded read rejected',lambda:observer.freeze('S02','during-read',SID))
                    f.write(SID,f.initial)
                    save_bytes=observer.save_bytes
                    for method in ['atomic-identical-bytes','same-size-with-restored-mtime']:
                        changed=[];previous=path.read_bytes();before_stat=path.stat()
                        def replace_after_preflight(destination,value,replace=True):
                            result=save_bytes(destination,value,replace)
                            if Path(destination).name=='expected-body.txt' and not changed:
                                changed.append(True)
                                if method=='atomic-identical-bytes':
                                    temporary=path.with_name('synthetic-replacement');temporary.write_bytes(previous);os.replace(temporary,path)
                                else:
                                    path.write_bytes(previous.replace(b'"revision": 4',b'"revision": 5'));os.utime(path,ns=(before_stat.st_atime_ns,before_stat.st_mtime_ns))
                            return result
                        run='changed-'+method
                        with patch.object(observer,'save_bytes',side_effect=replace_after_preflight):reject('second freeze read detects '+method,lambda:observer.freeze('S02',run,SID))
                        check('partial evidence retained without run.json '+method,(f.run(run)/'expected-body.txt').exists() and not (f.run(run)/'run.json').exists())
                        partial=(f.run(run)/'expected-body.txt').read_bytes();f.write(SID,f.initial)
                        reject('partial run cannot be reused '+method,lambda:observer.freeze('S02',run,SID));check('partial bytes unchanged '+method,(f.run(run)/'expected-body.txt').read_bytes()==partial)
                    frozen_metadata=(f.run('adopt-valid')/'run.json').read_bytes()
                    reject('existing successful run cannot be overwritten',lambda:observer.freeze('S02','adopt-valid',SID))
                    check('original successful freeze remains immutable',(f.run('adopt-valid')/'run.json').read_bytes()==frozen_metadata)
                    # Directory stayed fixed while the journal inode changed many
                    # times above. Later normal analysis no longer needs source/0AI.
                    progressed=copy.deepcopy(f.initial);progressed.update(revision=20,phase='running',workingRevision=1,originalProse=f.text,workingProse=f.text,coverage={'character':['unit']},artifacts=[],analysisGrant={'endpoint':SECRET},runtimeAiCall={'rawError':SECRET})
                    previous_inode=path.stat().st_ino;f.write(SID,progressed,atomic=True);check('synthetic app replacement really changed journal inode',path.stat().st_ino!=previous_inode)
                    f.write(DECOY,dict(progressed,id=DECOY,revision=999))
                    def observe(run):
                        with patch.object(observer,'REPO',REPO),redirect_stdout(io.StringIO()):observer.observe(run)
                    bounded_reader=observer.adoption_file_bytes
                    def after_binding_reader(directory,name,limit):
                        assert name!='session.json','later observation must use original journal reading, not the source cap'
                        return bounded_reader(directory,name,limit)
                    with patch.object(observer,'ADOPTION_MAX_BYTES',1),patch.object(observer,'adoption_file_bytes',side_effect=after_binding_reader):observe('adopt-valid')
                    safe=json.loads((f.run('adopt-valid')/'latest-checkpoint.json').read_bytes())
                    check('progress and atomic journal replacement follow only pinned session',safe['id']==SID and safe['revision']==20 and safe['phase']=='running')
                    check('later observation does not inherit the source-only capacity cap',path.stat().st_size>1 and safe['revision']==20)
                    check('safe projection still excludes grants credentials and bad runtime',SECRET not in json.dumps(safe) and 'analysisGrant' not in safe and safe['runtimeDiagnosticsStatus']=='unavailable')
                    check('freeze binding metadata remains unchanged after progress',(f.run('adopt-valid')/'run.json').read_bytes()==frozen_metadata)
                    good_latest=(f.run('adopt-valid')/'latest-checkpoint.json').read_bytes();good_history=(f.run('adopt-valid')/'observations.jsonl').read_bytes()
                    for key,value in [('id',DECOY),('createdAt','2026-10-26T00:00:02.000Z')]:
                        bad=copy.deepcopy(progressed);bad[key]=value;f.write(SID,bad,atomic=True);reject('observe rejects changed '+key,lambda:observe('adopt-valid'));check('rejection leaves evidence unchanged '+key,(f.run('adopt-valid')/'latest-checkpoint.json').read_bytes()==good_latest and (f.run('adopt-valid')/'observations.jsonl').read_bytes()==good_history)
                    for edit in [lambda value:value['files'][0].update(hash='a'*64),lambda value:value['files'][0].update(included=False),lambda value:value['files'].append(dict(value['files'][0],path=str(f.corpus/'other.md')))]:
                        bad=copy.deepcopy(progressed);edit(bad);f.write(SID,bad,atomic=True);reject('observe rejects source set hash or inclusion drift',lambda:observe('adopt-valid'))
                    corrupt_metadata=copy.deepcopy(metadata);outside=str(f.root/'outside/synthetic.md');corrupt_metadata['sourceFiles'][0]['path']=outside;(f.run('adopt-valid')/'run.json').write_text(json.dumps(corrupt_metadata));bad=copy.deepcopy(progressed);bad['files'][0]['path']=outside;f.write(SID,bad,atomic=True)
                    reject('even matching metadata cannot bind an outside-corpus source',lambda:observe('adopt-valid'));check('outside-corpus rejection writes no checkpoint',(f.run('adopt-valid')/'latest-checkpoint.json').read_bytes()==good_latest);(f.run('adopt-valid')/'run.json').write_bytes(frozen_metadata)
                    f.write(SID,progressed,atomic=True);owner.write_text('wrong-owner');reject('observe still requires exact owner',lambda:observe('adopt-valid'));owner.write_bytes(owner_bytes)
                    directory.rename(held);reject('missing pinned session never falls back to decoy',lambda:observe('adopt-valid'));directory.mkdir();(directory/'.owner').write_bytes(owner_bytes);f.write(SID,progressed);reject('same UUID in a replacement directory is rejected',lambda:observe('adopt-valid'))
                    import shutil
                    shutil.rmtree(directory);held.rename(directory)
                    check('decoys never overwrite the pinned evidence',(f.run('adopt-valid')/'latest-checkpoint.json').read_bytes()==good_latest)
                    with redirect_stdout(io.StringIO()):observer.freeze('S02','default-new')
                    default=json.loads((f.run('default-new')/'run.json').read_bytes());check('default freeze has no new adoption fields','adoptedExistingSession' not in default and 'sourceFiles' not in default)
                    expected_keys={'sample','run','frozenAt','sourcePath','sourceSha256','oracleSha256','oracleModifiedAt','oracleAuthor','expectedBodyRange','expectedBodyCharacters','expectedBodySha256','existingJournalIds','electronPath','electronVersion','gitHead','resourceHashes','uiJavaScriptIdentity','actions'}
                    check('default freeze metadata field set is unchanged',set(default)==expected_keys)
                    with redirect_stdout(io.StringIO()) as text:observer.observe('default-new')
                    check('default observe still excludes preexisting sessions',json.loads(text.getvalue())['status']=='no-matching-new-journal')
                    fresh='44444444-4444-4444-8444-444444444444';f.write(fresh,dict(f.initial,id=fresh));observe('default-new');check('default new-journal path remains operational',json.loads((f.run('default-new')/'latest-checkpoint.json').read_bytes())['id']==fresh)
                    baseline=(REPO/'scripts/observe-real-novel-import.py').read_text();tree=ast.parse(baseline)
                    for name in ['regular_bytes','runtime_diagnostics','record_build']:
                        node=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name==name)
                        check('existing '+name+' implementation is byte-identical',hashlib.sha256(ast.get_source_segment(baseline,node).encode()).hexdigest()==UNCHANGED_FUNCTION_SHA256[name])
        except Exception as error:
            failure=type(error).__name__+': '+str(error)
        result=dict(scope='61/62 isolated synthetic adoption only; no real app/corpus/journal/model/DB',passed=sum(row['passed'] for row in checks),failed=sum(not row['passed'] for row in checks) or int(bool(failure)),checks=checks,sourceSha256={str(path.relative_to(REPO)):hashlib.sha256(path.read_bytes()).hexdigest() for path in [SCRIPT,Path(__file__).resolve()]})
        if failure:result['failure']=failure
        json.dump(result,report,ensure_ascii=False,indent=2);report.write('\n')
    print(json.dumps(dict(passed=result['passed'],failed=result['failed'] or int(bool(failure)),output=str(output),**({'failure':failure} if failure else {}))))
    return int(bool(failure))

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,required=True)
    sys.exit(main(parser.parse_args().output))
