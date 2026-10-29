"""Only the approved 41/42 runtime projection cases; synthetic stdin, no journals."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('runtime_observer_under_test',REPO/'scripts/observe-real-novel-import.py')
observer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(observer)
SID = '11111111-1111-4111-8111-111111111111'
OTHER = '22222222-2222-4222-8222-222222222222'
UNAVAILABLE = dict(runtimeDiagnosticsStatus='unavailable')
SENTINEL = 'SYNTHETIC_SECRET_MUST_NEVER_LEAVE_INPUT'

def call(state='pending'):
    value = dict(version=1,processRunId=OTHER,sessionId=SID,operationId='33333333-3333-4333-8333-333333333333',epoch=2,phase='analyze',kind='character',workingRevision=0,scopeHash='a'*64,payloadHash='b'*64,startedAt='2026-10-26T00:00:00.000Z',state=state)
    if state == 'settled':
        value.update(outcome='fulfilled',settledObservedAt='2026-10-26T00:00:02.000Z')
    return value

def main(output):
    checks=[]
    def check(name,passed):
        assert passed,name
        checks.append(dict(name=name,passed=True))
    def cli(value):
        data=value if type(value) is bytes else json.dumps(value,separators=(',',':')).encode()
        result=subprocess.run([str(observer.NODE),'--import','tsx',str(REPO/'scripts/project-real-novel-import-runtime.ts')],input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,cwd=REPO,timeout=20,check=False)
        check('cli exits cleanly without stderr or secret echo',result.returncode==0 and result.stderr==b'' and SENTINEL.encode() not in result.stdout)
        return json.loads(result.stdout)
    pending=dict(runtimeAiCall=call())
    check('valid pending metadata retained exactly',cli(dict(sessionId=SID,diagnostics=pending))==pending)
    settled=call('settled')
    proof=dict(version=1,processRunId=OTHER,sessionId=SID,oldEpoch=2,newEpoch=3,capturedAt='2026-10-26T00:00:01.000Z',barrierAt='2026-10-26T00:00:03.000Z',state='drained',calls=[settled],remaining=dict(pendingCalls=0,operations=0,workflowJobs=0,pdfActive=0,pdfRequests=0))
    valid=dict(runtimeAiCall=settled,runtimePauseProof=proof)
    check('valid settled and drained metadata retained exactly',cli(dict(sessionId=SID,diagnostics=valid))==valid)
    bad=dict(call(),rawError=SENTINEL)
    check('unknown call key rejected without copying it',cli(dict(sessionId=SID,diagnostics=dict(runtimeAiCall=bad)))==UNAVAILABLE)
    check('unknown envelope key rejected',cli(dict(sessionId=SID,diagnostics=pending,rawError=SENTINEL))==UNAVAILABLE)
    check('cross session rejected',cli(dict(sessionId=OTHER,diagnostics=pending))==UNAVAILABLE)
    check('oversize stdin rejected',cli(dict(sessionId=SID,diagnostics=dict(runtimeAiCall=call(),rawError=SENTINEL+'x'*18000)))==UNAVAILABLE)
    check('invalid UTF8 rejected',cli(b'\xff')==UNAVAILABLE)
    check('invalid JSON rejected',cli(b'{')==UNAVAILABLE)
    native_run=subprocess.run
    captured=[]
    def bounded_run(*args,**kwargs):
        sent=json.loads(kwargs['input'])
        assert set(sent)=={'sessionId','diagnostics'}
        assert set(sent['diagnostics']).issubset(observer.RUNTIME_FIELDS)
        assert SENTINEL.encode() not in kwargs['input']
        captured.append(sent)
        return native_run(*args,**kwargs)
    with patch.object(observer.subprocess,'run',side_effect=bounded_run):
        journal=dict(id=SID,semanticVersion=1,**valid,originalProse=SENTINEL,models=dict(apiKey=SENTINEL),analysisGrant=SENTINEL)
        check('Python sends and retains only approved metadata',observer.runtime_diagnostics(journal)==valid and len(captured)==1)
    with patch.object(observer.subprocess,'run',side_effect=AssertionError('unexpected child process')) as child:
        check('legacy without fields is unchanged',observer.runtime_diagnostics(dict(id=SID,semanticVersion=1))=={} and child.call_count==0)
        check('non semantic session not projected',observer.runtime_diagnostics(dict(id=SID,**pending))=={} and child.call_count==0)
        check('boolean semantic version not accepted',observer.runtime_diagnostics(dict(id=SID,semanticVersion=True,**pending))=={} and child.call_count==0)
        check('Python oversize refused before child',observer.runtime_diagnostics(dict(id=SID,semanticVersion=1,runtimeAiCall=dict(rawError=SENTINEL+'x'*18000)))==UNAVAILABLE and child.call_count==0)
    for name in ['desktop/core/novel-import-runtime-proof.ts','scripts/project-real-novel-import-runtime.ts','scripts/observe-real-novel-import.py']:
        check('build identity includes '+name,name in observer.BUILD_INPUTS)
    names=['desktop/core/novel-import-runtime-proof.ts','scripts/project-real-novel-import-runtime.ts','scripts/observe-real-novel-import.py','scripts/verify-real-novel-runtime-observer.py']
    result=dict(scope='41/42 isolated synthetic runtime projection only; no app, journal, DB, model or LIFE result',checks=checks,sourceSha256={name:hashlib.sha256((REPO/name).read_bytes()).hexdigest() for name in names})
    with output.open('x',encoding='utf-8') as stream:
        json.dump(result,stream,ensure_ascii=False,indent=2)
        stream.write('\n')
    print(json.dumps(dict(passed=len(checks),failed=0,output=str(output))))

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,required=True)
    main(parser.parse_args().output)
