import assert from 'node:assert/strict'
import { test } from 'node:test'
import { importActionSchema, IMPORT_KINDS, IMPORT_TARGETS } from '../../desktop/shared/novel-import'

test('NI-P01: import protocol preserves independent source and inference categories and rejects unsafe actions',()=>{
 assert.equal(IMPORT_KINDS.length,13);assert.equal(IMPORT_TARGETS.length,12);assert.ok(!IMPORT_TARGETS.includes('body' as never))
 const base={id:'0c6b0b58-05f7-44d9-b749-af0f46ac7daa',revision:2}
 const selected=importActionSchema.parse({type:'select',...base,selected:['body','character'],targets:['character'],infer:true});assert.equal(selected.type,'select');if(selected.type==='select')assert.deepEqual(selected.selected,['body','character'])
 for(const value of [
  {type:'select',...base,selected:['body'],targets:['body'],infer:true},
  {type:'select',...base,selected:['body','body'],targets:[],infer:false},
  {type:'select',...base,selected:['body'],targets:['character','character'],infer:true},
  {type:'select',...base,selected:['unknown'],targets:[],infer:false},
  {type:'start',id:base.id,consent:true},
  {type:'set-range',...base,fileId:'file',start:-1,end:4,kind:'body'},
 ])assert.equal(importActionSchema.safeParse(value).success,false)
})
test('NI-P02: native grants and worker dispatch are never renderer-controlled paths or methods',()=>{
 assert.equal(importActionSchema.safeParse({type:'choose',mode:'files',path:'/private/user-secret.txt'}).success,false)
 assert.equal(importActionSchema.safeParse({type:'publish-import',method:'create-work',path:'/tmp/arbitrary'}).success,false)
 assert.equal(importActionSchema.safeParse({type:'read-source',id:'not-a-session',fileId:'f'}).success,false)
 assert.equal(importActionSchema.safeParse({type:'choose-target',id:'0c6b0b58-05f7-44d9-b749-af0f46ac7daa',revision:1,path:'/tmp/other'}).success,false)
})
