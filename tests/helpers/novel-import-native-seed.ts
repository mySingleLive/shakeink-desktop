// An isolated NI-N01 precondition; never imported by production.
import assert from 'node:assert/strict'
import {lstat,mkdir,realpath} from 'node:fs/promises'
import {basename,join,resolve} from 'node:path'
import {Workspaces} from '../../desktop/service/workspaces'
import {loadDatabaseSeed} from '../../desktop/service/database/seed'
import {VersionedStore} from '../../desktop/core/versioned-store'
import {defaultState,stateSchema} from '../../desktop/core/settings'
async function seed(){
const root=await realpath(process.argv[2])
assert.match(basename(root),/^shakeink-import-native-[A-Za-z0-9]+$/)
assert.ok(!(await lstat(root)).isSymbolicLink())
const data=join(root,'data');await mkdir(data)
const works=new Workspaces(data,resolve('prisma/migrations'),await loadDatabaseSeed(resolve('prisma/empty-database.json')))
try{await works.initialize();await works.run('inbox',async()=>{});assert.deepEqual(await works.list(),[]);const store=new VersionedStore(join(data,'state.json'),defaultState,stateSchema.parse),state=await store.read();state.value.onboarding={version:1,completed:true,step:'welcome',textModelId:null,imageModelId:null,receipt:null};await store.update(state.revision,state.value)}finally{await works.close()}
console.log(JSON.stringify({seeded:true,data,bootstrap:data+'-bootstrap',catalog:0,models:0}))

}
void seed().catch(error=>{console.error(error instanceof Error?error.message:"seed failed");process.exitCode=1})
