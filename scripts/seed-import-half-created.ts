// SD-52 seed: with the app closed, run the production publish for an existing import draft and stop it
// at before-initialize, leaving a real reservation and half-created work in the draft's target folder.
import assert from 'node:assert/strict'
import {readFile,realpath} from 'node:fs/promises'
import {basename,join,relative,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {Workspaces} from '../desktop/service/workspaces'
import {loadDatabaseSeed} from '../desktop/service/database/seed'
import {publishNovelImport} from '../desktop/service/novel-import-publish'
import type {ImportSession} from '../desktop/shared/novel-import'

async function main(){
 const directory=await realpath(resolve(process.argv[2]??'')),inside=relative(await realpath(tmpdir()),directory),id=process.argv[3]??''
 assert(inside&&!inside.startsWith('..')&&basename(directory).startsWith('shakeink-import-abandon-'),'Fresh shakeink-import-abandon-* temporary directory required')
 assert(/^[0-9a-f-]{36}$/u.test(id),'draft id required')
 const root=join(directory,'data'),session=JSON.parse(await readFile(join(root,'novel-imports',id,'session.json'),'utf8')) as ImportSession
 assert(session.publication?.hash&&session.target,'draft has a started save and a target')
 const works=new Workspaces(root,resolve('prisma/migrations'),await loadDatabaseSeed(resolve('prisma/empty-database.json')))
 try{
  await works.initialize()
  await assert.rejects(publishNovelImport(works,{session,selection:session.target,importHash:session.publication.hash},undefined,{phase:async at=>{if(at==='before-initialize')throw Error('SEEDED_FAULT')}}),/SEEDED_FAULT/)
 }finally{await works.close()}
}
void main().catch(error=>{console.error(error);process.exitCode=1})
