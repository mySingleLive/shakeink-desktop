import test from "node:test"
import assert from "node:assert/strict"
import {platformCommands} from "../../desktop/shared/command-registry"
import {bindingConflicts} from "../../desktop/core/shortcuts"
import {composerBindingHint} from "../../src/lib/desktop/composer-shortcuts"
for(const platform of ["darwin","win32"] as const)test(`CSO-06: ${platform} defaults to Enter send / Shift+Enter newline`,()=>{
 const commands=platformCommands(platform)
 assert.deepEqual(commands.find(command=>command.id==="ai.send")!.defaults,["Enter"])
 assert.deepEqual(commands.find(command=>command.id==="ai.newline")!.defaults,["Shift+Enter"])
 assert.equal(composerBindingHint(commands,{}),"Enter 发送，Shift+Enter 换行")
})
test("CSO-06: committed custom/additional bindings remain accurate and unchanged",()=>{
 const commands=platformCommands("darwin"),overrides={"ai.send":["Cmd+Enter","F8"],"ai.newline":["Enter"]},before=structuredClone(overrides)
 assert.equal(composerBindingHint(commands,overrides),"Cmd+Enter、F8 发送，Enter 换行")
 assert.deepEqual(overrides,before)
 assert.equal(composerBindingHint(commands,{"ai.send":[],"ai.newline":[]}),"点击发送按钮，换行快捷键未设置")
})
test("mention selection and send/stop are distinct contexts, while same-context binding conflicts remain visible",()=>{
 const commands=platformCommands("darwin")
 assert.deepEqual(commands.find(command=>command.id==="ai.mentionConfirm")!.defaults,["Tab","Enter"])
 assert.deepEqual(commands.find(command=>command.id==="ai.mentionClose")!.defaults,["Escape"])
 assert.equal(bindingConflicts(commands,{},"ai.send","Enter",0).length,0)
 assert(bindingConflicts(commands,{},"ai.clear","Enter").some(row=>row.command.id==="ai.send"))
})

// docs/599 §12.3 / §15.13 (CE-76): worldline.escape shares Escape with ai.stop in a distinct context; the input / markdown /
// mention Escape commands still conflict with it, as they do with ai.stop.
test("CE-76: worldline.escape and ai.stop are distinct contexts; other Escape commands conflict",()=>{
 const commands=platformCommands("darwin")
 const row=commands.find(command=>command.id==="worldline.escape")!
 assert.equal(row.scope,"global");assert.deepEqual(row.defaults,["Escape"]);assert.deepEqual(row.contexts,{worldlineEdit:true})
 const ids=bindingConflicts(commands,{},"worldline.escape","Escape",0).map(r=>r.command.id)
 assert(!ids.includes("ai.stop"),ids.join())
 for(const id of ["input.cancel","md.selectionCancel","ai.mentionClose"])assert(ids.includes(id),id)
})
