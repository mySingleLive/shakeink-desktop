import assert from 'node:assert/strict'
import {test} from 'node:test'
import {RendererPrompts} from '../../desktop/main/renderer-prompts'
import type {AppPrompt,PromptInput} from '../../desktop/shared/prompt'

const input=(over:Partial<PromptInput>={}):PromptInput=>({tone:'warning',title:'尚不能关闭',message:'部分修改尚未确认保存。',detail:'窗口和原草稿已保留。',buttons:[{value:'cancel',label:'取消关闭',variant:'outline'},{value:'retry',label:'重试',variant:'default'}],defaultValue:'cancel',cancelValue:'cancel',...over})
function rig(available=true){const snapshots:AppPrompt[][]=[];let up=available;const prompts=new RendererPrompts(list=>{snapshots.push(list);return up});return{prompts,snapshots,down(){up=false}}}
const settled=async<T>(promise:Promise<T>)=>{let done=false;void promise.then(()=>{done=true});await new Promise(setImmediate);return done}

test('RP-01: ask publishes the prompt and resolves with the replied value',async()=>{
 const r=rig(),answer=r.prompts.ask(input());const [prompt]=r.snapshots.at(-1)!
 assert.equal(prompt.title,'尚不能关闭');assert.match(prompt.id,/^[0-9a-f-]{36}$/u);assert.deepEqual(r.prompts.list(),[prompt])
 assert.equal(r.prompts.reply(prompt.id,'retry'),true);assert.equal(await answer,'retry');assert.deepEqual(r.snapshots.at(-1),[]);assert.deepEqual(r.prompts.list(),[])
})
test('RP-02: unknown ids, undeclared values and repeated replies are refused',async()=>{
 const r=rig(),answer=r.prompts.ask(input()),id=r.prompts.list()[0].id
 assert.equal(r.prompts.reply('00000000-0000-4000-8000-000000000000','retry'),false);assert.equal(r.prompts.reply(id,'wipe'),false);assert.equal(await settled(answer),false)
 assert.equal(r.prompts.reply(id,'cancel'),true);assert.equal(r.prompts.reply(id,'retry'),false);assert.equal(await answer,'cancel')
})
test('RP-03: without a window to show it the prompt resolves to its cancel value',async()=>{
 const r=rig(false);assert.equal(await r.prompts.ask(input()),'cancel');assert.deepEqual(r.prompts.list(),[])
})
test('RP-04: an aborted signal withdraws the prompt as cancelled',async()=>{
 const r=rig(),controller=new AbortController(),answer=r.prompts.ask(input(),{signal:controller.signal})
 controller.abort();assert.equal(await answer,'cancel');assert.deepEqual(r.prompts.list(),[]);assert.deepEqual(r.snapshots.at(-1),[])
 const before=r.snapshots.length;assert.equal(await r.prompts.ask(input(),{signal:AbortSignal.abort()}),'cancel');assert.equal(r.snapshots.length,before)
})
test('RP-05: cancelAll keeps persistent prompts until forced',async()=>{
 const r=rig(),plain=r.prompts.ask(input()),kept=r.prompts.ask(input({title:'配置数据无法自动修复'}),{persistent:true})
 r.prompts.cancelAll();assert.equal(await plain,'cancel');assert.equal(await settled(kept),false);assert.deepEqual(r.prompts.list().map(p=>p.title),['配置数据无法自动修复'])
 r.prompts.cancelAll({force:true});assert.equal(await kept,'cancel');assert.deepEqual(r.prompts.list(),[])
})
test('RP-06: invalid prompts are rejected before publishing',async()=>{
 const r=rig()
 for(const bad of [input({buttons:[]}),input({buttons:Array.from({length:5},(_,i)=>({value:`b${'abcde'[i]}`,label:String(i),variant:'outline' as const}))}),input({buttons:[{value:'cancel',label:'a',variant:'outline'},{value:'cancel',label:'b',variant:'default'}]}),input({defaultValue:'wipe'}),input({cancelValue:'wipe'})])
  await assert.rejects(r.prompts.ask(bad))
 assert.equal(r.snapshots.length,0)
})
test('RP-07: concurrent prompts are listed in order and answered independently',async()=>{
 const r=rig(),first=r.prompts.ask(input({title:'一'})),second=r.prompts.ask(input({title:'二'}))
 const [a,b]=r.prompts.list();assert.deepEqual([a.title,b.title],['一','二'])
 r.prompts.reply(b.id,'retry');assert.equal(await second,'retry');assert.equal(await settled(first),false);assert.deepEqual(r.prompts.list().map(p=>p.title),['一'])
 r.prompts.reply(a.id,'cancel');assert.equal(await first,'cancel')
})
test('RP-08: list returns copies that cannot alter pending prompts',()=>{
 const r=rig();void r.prompts.ask(input());const [copy]=r.prompts.list();copy.buttons.length=0;copy.title='x'
 assert.equal(r.prompts.list()[0].title,'尚不能关闭');assert.equal(r.prompts.list()[0].buttons.length,2)
})

test('RPM-12: native message boxes remain only where no window can show a React prompt',async()=>{
 const {readFile,readdir}=await import('node:fs/promises')
 const found:string[]=[]
 for(const name of await readdir('desktop/main'))if(name.endsWith('.ts')){const text=await readFile(`desktop/main/${name}`,'utf8');for(const line of text.split('\n'))if(/dialog\.show(MessageBox|ErrorBox)\(/u.test(line))found.push(`${name}:${/showErrorBox/u.test(line)?'error':'message'}`)}
 // inbox-lease-recovery runs before any BrowserWindow; index.ts error boxes are fatal startup exits.
 assert.deepEqual([...new Set(found)].sort(),['inbox-lease-recovery-window.ts:message','index.ts:error'])
 const main=await readFile('desktop/main/index.ts','utf8')
 for(const line of main.split('\n').filter(line=>/dialog\.showErrorBox\(/u.test(line)))assert.match(line,/app\.exit\(1\)|fatal\(|whenReady|showErrorBox\("玄印写作无法启动",legacy/u,line.slice(0,120))
})

test('RP-09: a publisher that throws is treated as no window',async()=>{
 const prompts=new RendererPrompts(()=>{throw Error('window gone')})
 assert.equal(await prompts.ask(input()),'cancel');assert.deepEqual(prompts.list(),[])
})
test('RP-10: a close prompt over a persistent prompt is listed last and answered first',async()=>{
 const r=rig(),reset=r.prompts.ask(input({title:'配置数据无法自动修复'}),{persistent:true}),close=r.prompts.ask(input({title:'仍有创作任务运行'}))
 assert.deepEqual(r.prompts.list().map(p=>p.title),['配置数据无法自动修复','仍有创作任务运行'])
 r.prompts.reply(r.prompts.list()[1].id,'cancel');assert.equal(await close,'cancel');assert.equal(await settled(reset),false);assert.deepEqual(r.prompts.list().map(p=>p.title),['配置数据无法自动修复'])
})
