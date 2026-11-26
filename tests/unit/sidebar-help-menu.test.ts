import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const read=(path:string)=>readFile(path,'utf8')

test('SH-01: user guide URL is the exact approved address and the About whitelist set is unchanged',async()=>{
 const {PROJECT_GUIDE_URL,PROJECT_WEBSITE_URL,PROJECT_DOCS_URL,PROJECT_FAQ_URL,PROJECT_EXTERNAL_LINKS,PROJECT_REPOSITORY_URL}=await import('../../desktop/shared/project-info')
 assert.equal(PROJECT_GUIDE_URL,'https://shake.ink/docs/guide')
 assert.deepEqual([...PROJECT_EXTERNAL_LINKS],[PROJECT_REPOSITORY_URL,PROJECT_WEBSITE_URL,PROJECT_DOCS_URL,PROJECT_FAQ_URL])
})
test('SH-02: command catalog registers help.guide while the native help menu keeps its approved four entries',async()=>{
 const catalog=JSON.parse(await read('desktop/shared/commands.json'))
 const command=catalog.commands.find((command:{id:string})=>command.id==='help.guide')
 assert.deepEqual(command,{id:'help.guide',label:'用户指南',group:'应用菜单',scope:'global',mac:'',win:'',locked:false,platform:null})
 assert.deepEqual(catalog.menus.help,['help.website','help.docs','help.faq','help.feedback'])
})
test('SH-03: main process routes help.guide to the guide URL over the trusted channel',async()=>{
 const main=await read('desktop/main/index.ts'),preload=await read('desktop/preload/index.ts')
 assert.match(main,/ipcMain\.handle\("desktop:command", async \(event, id\) => \{ trusted\(event\)/)
 assert.match(preload,/command:\s*id\s*=>\s*ipcRenderer\.invoke\("desktop:command", id\)/)
 assert.match(main,/PROJECT_GUIDE_URL/)
 assert.match(main,/"help\.guide"\) \{ await shell\.openExternal\(PROJECT_GUIDE_URL\); return \}/)
})
test('SH-04: sidebar account menu wires settings, the help submenu and feedback in order to their commands',async()=>{
 const source=await read('src/components/layout/SidebarTree.tsx')
 const settings=source.indexOf('command("app.settings")'),sub=source.indexOf('<DropdownMenuSub>',settings),feedback=source.indexOf('command("help.feedback")')
 assert.ok(settings>0&&sub>settings&&feedback>sub,'账号菜单顺序应为 设置 → 帮助子菜单 → 问题反馈')
 assert.ok(source.includes('<DropdownMenuSubTrigger>')&&source.includes('<DropdownMenuSubContent>'))
 const section=source.slice(sub,feedback)
 const order=['command("help.website")','command("help.docs")','command("help.guide")','command("help.faq")'].map(marker=>section.indexOf(marker))
 assert.ok(order.every(index=>index>=0),'帮助子菜单缺少链接项')
 assert.deepEqual([...order].sort((a,b)=>a-b),order,'子菜单顺序应为 官网 → 产品介绍 → 用户指南 → 常见问题')
 for(const label of ['帮助','官网','产品介绍','用户指南','常见问题','问题反馈'])assert.ok(source.includes(label),label)
})
