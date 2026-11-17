import assert from 'node:assert/strict'
import {test} from 'node:test'
import {commandScope} from '../../src/lib/desktop/command-scope'
import {bindingConflicts,type ShortcutCommand} from '../../desktop/core/shortcuts'
import {shortcutScopeEnables} from '../../desktop/core/shortcut-dispatch'

/* docs/580 §7.5 (R5, N2, P1), docs/581 WU-66/66d/66e. A fake element is a chain of nodes from the target up to the root;
 * each node has a tag, classes and attributes, and closest() walks the chain with a tiny selector matcher. */
type Node={tag:string;cls?:string[];attr?:Record<string,string>}
const one=(n:Node,sel:string)=>{
 const m=/^([a-z]*)((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/u.exec(sel.trim());if(!m)return false
 if(m[1]&&m[1]!==n.tag)return false
 for(const c of m[2].split('.').filter(Boolean))if(!n.cls?.includes(c))return false
 for(const a of m[3].match(/\[[^\]]+\]/gu)??[]){const [,k,v]=/^\[([\w-]+)(?:="([^"]*)")?\]$/u.exec(a)!;if(!n.attr||!(k in n.attr))return false;if(v!==undefined&&n.attr[k]!==v)return false}
 return true
}
const el=(chain:Node[]):HTMLElement=>{
 const at=(i:number):HTMLElement=>({
  closest(selector:string){for(let j=i;j<chain.length;j++)if(selector.split(',').some(s=>one(chain[j],s)))return at(j);return null},
  matches(selector:string){return selector.split(',').some(s=>one(chain[i],s))},
 }) as unknown as HTMLElement
 return at(0)
}
const panel:Node={tag:'section',attr:{'data-command-scope':'worldline'}}
const dialog:Node={tag:'div',attr:{role:'dialog'}}

test('WU-66: commandScope decides in order (composer, dialog, search box, input, markdown, preview, worldline, none)',()=>{
 assert.equal(commandScope(el([{tag:'div',cls:['chat-composer-editable']},panel])),'composer')
 assert.equal(commandScope(el([{tag:'button'},dialog,panel])),'none','a plain button in a dialog inside the panel')
 assert.equal(commandScope(el([{tag:'input'},dialog,panel])),'input','an input in a dialog inside the panel')
 assert.equal(commandScope(el([{tag:'input',attr:{'data-worldline-search':''}},panel])),'worldline-search')
 assert.equal(commandScope(el([{tag:'input',attr:{'data-worldline-search':''}},{tag:'div'}])),'input','a stray search attribute outside the panel')
 assert.equal(commandScope(el([{tag:'input'},{tag:'form'},panel])),'input','an editor form input inside the panel')
 assert.equal(commandScope(el([{tag:'textarea',cls:['inputarea']},{tag:'div',cls:['monaco-editor']},panel])),'markdown')
 assert.equal(commandScope(el([{tag:'div'},{tag:'div',cls:['desktop-markdown-editor']},panel])),'preview')
 for(const n of [{tag:'div',attr:{'aria-label':'世界时间线'}},{tag:'div',attr:{role:'treeitem'}},{tag:'article'}] as Node[])assert.equal(commandScope(el([n,panel])),'worldline',JSON.stringify(n))
 assert.equal(commandScope(el([{tag:'div'}])),'none')
})
test('WU-66d: the search box enables worldline/input/text/global; the canvas enables only worldline/global',()=>{
 for(const s of ['worldline','input','text','global'] as const)assert.ok(shortcutScopeEnables('worldline-search',s),s)
 for(const s of ['markdown','composer'] as const)assert.ok(!shortcutScopeEnables('worldline-search',s),s)
 for(const s of ['worldline','global'] as const)assert.ok(shortcutScopeEnables('worldline',s),s)
 for(const s of ['input','text','markdown','composer'] as const)assert.ok(!shortcutScopeEnables('worldline',s),s)
})
const cmd=(id:string,scope:ShortcutCommand['scope'],key:string):ShortcutCommand=>({id,label:id,scope,locked:false,defaults:[key]})
test('WU-66e: worldline overlaps global/text/input but not markdown/composer; rebinding onto input or global conflicts',()=>{
 const commands=[cmd('worldline.search','worldline','Cmd+F'),cmd('md.find','markdown','Cmd+F'),cmd('input.left','input','ArrowLeft'),cmd('app.palette','global','Cmd+Shift+P')]
 assert.deepEqual(bindingConflicts(commands,{},'worldline.search','Cmd+F',0).map(c=>c.command.id),[],'same default as md.find is not a conflict')
 assert.deepEqual(bindingConflicts(commands,{},'worldline.search','ArrowLeft',0).map(c=>c.command.id),['input.left'])
 assert.deepEqual(bindingConflicts(commands,{},'worldline.search','Cmd+Shift+P',0).map(c=>c.command.id),['app.palette'])
})
