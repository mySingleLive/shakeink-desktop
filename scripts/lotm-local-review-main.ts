import {resolve,join} from 'node:path'
import {lstat} from 'node:fs/promises'
import assert from 'node:assert/strict'
import {safeStorage} from 'electron'
import {ModelGateway} from '../desktop/core/model-authorization'
import {ModelRepository} from '../desktop/main/model-repository'
import {ModelService} from '../desktop/main/model-service'
import {configureModelTransport} from '../desktop/service/models'
import {runInDatabaseContext} from '../desktop/service/context'
import {runImportAi,readOnlyImportUsage} from '../desktop/service/novel-import-ai'
import type {ImportAiRequest} from '../desktop/shared/novel-import'

export async function review(input:{root:string;request:ImportAiRequest;role?:'text'|'review'}){
 const root=resolve(input.root)
 assert.ok(process.env.SHAKEINK_TEST_ROOT&&resolve(process.env.SHAKEINK_TEST_ROOT)===root,'只读审核根不匹配')
 const identity=await lstat(join(root,'state.json'));assert.ok(identity.isFile()&&!identity.isSymbolicLink(),'只读审核模型配置必须是真实文件')
 const gateway=new ModelGateway({keyFor:(id,revision)=>repository.keyFor(id,revision),fetch:globalThis.fetch})
 const repository=new ModelRepository(join(root,'state.json'),safeStorage,gateway,{withWrite:async()=>{throw Error('只读审核拒绝模型元数据写入')}})
 const models=new ModelService(repository,gateway)
 configureModelTransport((method,value)=>{
  if(method==='model.catalog')return repository.read()
  if(method==='model.defaults')return models.defaults()
  if(method==='model.resolve')return models.resolve(value)
  if(method==='model.assert')return models.assertAuthorization(value)
  if(method==='model.start')return models.start(value)
  if(method==='model.read')return models.read(value)
  if(method==='model.cancel')return models.cancel(value)
  throw Error('只读审核不接受其他主进程操作')
 })
 const controller=new AbortController()
 try{
  await repository.read();await repository.initialize()
  const database=new Proxy({}, {get(){throw Error('只读审核拒绝数据库访问')}}) as never
  return await runInDatabaseContext({workspaceId:'inbox',database},()=>runImportAi(input.request,controller.signal,undefined,{usage:readOnlyImportUsage,maxNetworkRetries:0,...(input.role?{role:input.role}:{})}))
 }finally{
  configureModelTransport(()=>{throw Error('只读审核模型通道已关闭')})
  await models.close()
 }
}
