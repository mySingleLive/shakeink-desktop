import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {transformSync} from 'esbuild'
import {promptInputSchema,promptReplySchema} from '../../desktop/shared/prompt'
import {RendererPrompts} from '../../desktop/main/renderer-prompts'

// RPM-01..10: the prompt definitions and IPC handlers are taken from the actual main source.
const file='desktop/main/index.ts',source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true)
type Ask={title:string;input:any;options:any}
// Every appPrompts.ask(...) literal, evaluated with its template values replaced by placeholders.
function asks():Ask[]{
 const found:Ask[]=[]
 const visit=(node:ts.Node)=>{
  if(ts.isCallExpression(node)&&node.expression.getText(source)==='appPrompts.ask'){
   const [input,options]=node.arguments
   const code=`return [${input.getText(source)},${options?options.getText(source):'undefined'}]`
   const preview={work:{path:'/isolated/work'},owner:{pid:7,host:'host'},requestId:'r'}
   const [value,extra]=new Function('preview','target','rootPath','message','signal',transformSync(code,{loader:'ts'}).code)(preview,{path:'/isolated/target'},'/isolated/root','结果',new AbortController().signal)
   found.push({title:value.title,input:value,options:extra})
  }
  ts.forEachChild(node,visit)
 }
 visit(source);return found
}
const all=asks(),byTitle=(title:string)=>{const match=all.filter(item=>item.title===title);assert.equal(match.length,1,title);return match[0]}
const values=(ask:Ask)=>ask.input.buttons.map((button:any)=>`${button.value}:${button.variant}`)

test('RPM-01..06: each workbench prompt keeps its former meaning and defaults to the safe choice',()=>{
 assert.equal(all.length,8)
 for(const ask of all)assert.equal(promptInputSchema.safeParse(ask.input).success,true,ask.title)
 const expected:Record<string,{buttons:string[];defaultValue:string;cancelValue:string}>={
  '仍有创作任务运行':{buttons:['cancel:outline','stop:destructive'],defaultValue:'cancel',cancelValue:'cancel'},
  '作品锁修复交接尚未完成':{buttons:['cancel:outline','retry:default'],defaultValue:'cancel',cancelValue:'cancel'},
  '尚不能关闭':{buttons:['cancel:outline','export:outline','discard:destructive','retry:default'],defaultValue:'cancel',cancelValue:'cancel'},
  '修复导入保存目录的异常退出锁':{buttons:['cancel:outline','repair:destructive'],defaultValue:'cancel',cancelValue:'cancel'},
  '修复异常退出锁':{buttons:['cancel:outline','repair:destructive'],defaultValue:'cancel',cancelValue:'cancel'},
  '作品锁恢复结果':{buttons:['ok:default'],defaultValue:'ok',cancelValue:'ok'},
  '迁移应用数据':{buttons:['cancel:outline','migrate:default'],defaultValue:'cancel',cancelValue:'cancel'},
  '配置数据无法自动修复':{buttons:['quit:outline','wipe:destructive'],defaultValue:'quit',cancelValue:'quit'},
 }
 for(const [title,want] of Object.entries(expected)){const ask=byTitle(title);assert.deepEqual(values(ask),want.buttons,title);assert.equal(ask.input.defaultValue,want.defaultValue,title);assert.equal(ask.input.cancelValue,want.cancelValue,title)}
 assert.equal(byTitle('修复异常退出锁').options.signal instanceof AbortSignal,true)
 assert.deepEqual(byTitle('配置数据无法自动修复').options,{persistent:true})
 assert.match(byTitle('配置数据无法自动修复').input.detail,/\/isolated\/root/u)
})

function handlers(prompts:RendererPrompts){
 const registered=new Map<string,any>()
 const visit=(node:ts.Node)=>{if(ts.isCallExpression(node)&&node.expression.getText(source)==='ipcMain.handle'){const name=node.arguments[0].getText(source);if(name==='"desktop:prompts"'||name==='"desktop:prompt-reply"'){const fn=new Function('trusted','appPrompts','promptReplySchema',transformSync(`return ${node.arguments[1].getText(source)}`,{loader:'ts'}).code);registered.set(JSON.parse(name),fn)}}ts.forEachChild(node,visit)}
 visit(source)
 const main={id:'main'},trusted=(event:any)=>{if(event.sender!==main)throw Error('不受信的桌面请求')}
 return{main,prompts:registered.get('desktop:prompts')!(trusted,prompts,promptReplySchema),reply:registered.get('desktop:prompt-reply')!(trusted,prompts,promptReplySchema)}
}
test('RPM-07: prompt IPC trusts only the main frame and parses replies strictly',async()=>{
 const prompts=new RendererPrompts(()=>true),h=handlers(prompts),own={sender:h.main},foreign={sender:{id:'child'}}
 const answer=prompts.ask({tone:'warning',title:'尚不能关闭',message:'m',buttons:[{value:'cancel',label:'取消关闭',variant:'outline'},{value:'retry',label:'重试',variant:'default'}],defaultValue:'cancel',cancelValue:'cancel'})
 const [pending]=await h.prompts(own)
 await assert.rejects(h.prompts(foreign),/不受信/u);await assert.rejects(h.reply(foreign,{id:pending.id,value:'retry'}),/不受信/u)
 for(const bad of [{id:pending.id},{id:pending.id,value:'retry',extra:1},{id:'not-a-uuid',value:'retry'},{id:pending.id,value:'RETRY'}])await assert.rejects(h.reply(own,bad))
 assert.equal(await h.reply(own,{id:pending.id,value:'wipe'}),false)
 assert.equal(await h.reply(own,{id:pending.id,value:'retry'}),true);assert.equal(await answer,'retry')
})
test('RPM-08: releaseOwner and a closed window end pending prompts',()=>{
 const text=readFileSync(file,'utf8')
 const release=text.slice(text.indexOf('const releaseOwner = () => {'),text.indexOf('current.webContents.on("render-process-gone", releaseOwner)'))
 assert.match(release,/appPrompts\.cancelAll\(\)/u)
 assert.match(text,/current\.on\("closed", \(\) => \{[^\n]*appPrompts\.cancelAll\(\{force:true\}\)/u)
 assert.match(text,/const appPrompts=new RendererPrompts\(prompts=>\{if\(!window\|\|window\.isDestroyed\(\)\|\|window\.webContents\.isCrashed\(\)\)return false;/u)
})
test('RPM-09/10: menu failure is a renderer notice and the About link error stays in its page',()=>{
 const text=readFileSync(file,'utf8')
 assert.match(text,/executeCommand\(command\.id\)\.catch\(\(\) => send\(\{type:"notice",tone:"error",message:"操作未完成，请检查当前窗口或任务状态后重试。"\}\)\)/u)
 assert.match(text,/about\.webContents\.executeJavaScript\(PROJECT_ABOUT_LINK_ERROR_SCRIPT\)/u)
})
