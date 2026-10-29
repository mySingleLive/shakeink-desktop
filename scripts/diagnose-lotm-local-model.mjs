import {_electron as electron} from 'playwright'
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {join,resolve} from 'node:path'

const root='/private/tmp/shakeink-lotm-local-20261028',appRoot='/private/tmp/shakeink-lotm-runtime-20261027/app-data';await mkdir(root,{recursive:true})
let app
try{
 app=await electron.launch({executablePath:process.env.LOTM_ELECTRON_RUNTIME||undefined,args:[resolve('.')],env:{...process.env,SHAKEINK_TEST_ROOT:appRoot},timeout:60000})
 const page=await app.firstWindow({timeout:60000});await page.getByRole('button',{name:'导入作品',exact:true}).waitFor({timeout:60000})
 const boot=await page.evaluate(()=>window.desktop.bootstrap()),ids=[...new Set([boot.settings.agent.textModelId,boot.settings.agent.reviewModelId].filter(Boolean))]
 const results=[]
 for(const id of ids){const model=boot.models.find(row=>row.id===id);assert.ok(model);const draft={id:model.id,provider:model.provider,kind:model.kind,protocol:model.protocol,endpoint:model.endpoint,modelId:model.modelId,apiKey:''};const startedAt=new Date().toISOString();const result=await page.evaluate(({id,draft})=>window.desktop.testModel(id,draft),{id:crypto.randomUUID(),draft});results.push({modelId:model.modelId,provider:model.provider,endpoint:model.endpoint,startedAt,result})}
 await writeFile(join(root,process.env.LOTM_MODEL_DIAGNOSTIC_FILE??'model-diagnostic.json'),JSON.stringify({results},null,2)+'\n',{flag:'wx'})
 console.log(JSON.stringify(results))
 await app.evaluate(({app})=>app.quit())
}finally{if(app)await app.close().catch(()=>{})}
