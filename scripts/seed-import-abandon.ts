// IA-R seed: production settings schema only, in a fresh owned temporary root. Guide done, zero models.
import assert from 'node:assert/strict'
import {realpath,writeFile} from 'node:fs/promises'
import {basename,join,relative,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {defaultState,stateSchema} from '../desktop/core/settings'
import {Workspaces} from '../desktop/service/workspaces'

async function main(){
 const directory=await realpath(resolve(process.argv[2]??'')),inside=relative(await realpath(tmpdir()),directory)
 assert(inside&&!inside.startsWith('..')&&basename(directory).startsWith('shakeink-import-abandon-'),'Fresh shakeink-import-abandon-* temporary directory required')
 const root=join(directory,'data'),works=new Workspaces(root,resolve('prisma/migrations'))
 try{await works.initialize()}finally{await works.close()}
 const state=structuredClone(defaultState)
 state.settings.user={penName:'隔离导入作者',email:'',avatarAssetId:null}
 state.onboarding={version:1,completed:true,step:'welcome',textModelId:null,imageModelId:null,receipt:null}
 stateSchema.parse(state);assert.equal(state.models.length,0)
 await writeFile(join(root,'state.json'),JSON.stringify({schemaVersion:1,revision:0,value:state})+'\n')
}
void main().catch(error=>{console.error(error);process.exitCode=1})
