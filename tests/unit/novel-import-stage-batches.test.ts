import assert from 'node:assert/strict'
import {test} from 'node:test'
import {importStageBatches} from '../../desktop/core/novel-import-budget-policy'
import type {ImportUnit} from '../../desktop/shared/novel-import'

/* docs/239 SB: the greedy fast path yields exactly the batches of the per-unit planner. */
const unit=(i:number,length:number):ImportUnit=>({id:'u'+i,fileId:'f',start:i*2000,end:i*2000+length,text:'字'.repeat(length),kind:'body'})
/** The previous per-unit planner, kept here as the reference. */
function reference(units:ImportUnit[],fits:(batch:ImportUnit[])=>boolean){
 const out:ImportUnit[][]=[];let batch:ImportUnit[]=[]
 for(const u of units){const c=[...batch,u];if(fits(c)){batch=c;continue}if(batch.length)out.push(batch);batch=[u];if(!fits(batch))throw Error('单个导入任务及完整元数据超过模型预算，请核对设定后重试')}
 if(batch.length)out.push(batch);return out
}
const ids=(b:ImportUnit[][])=>b.map(x=>x.map(u=>u.id))
let seed=7;const rand=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648

test('SB-01: fast path equals the per-unit planner when only characters and unit count bind',()=>{
 for(let round=0;round<200;round++){
  const characters=500+Math.floor(rand()*3000),maxUnits=1+Math.floor(rand()*8),units=Array.from({length:1+Math.floor(rand()*60)},(_,i)=>unit(i,1+Math.floor(rand()*characters)))
  const fits=(b:ImportUnit[])=>b.length<=maxUnits&&b.reduce((n,u)=>n+u.text.length,0)<=characters
  let checks=0;const counted=(b:ImportUnit[])=>{checks++;return fits(b)}
  const got=importStageBatches(units,characters,maxUnits,counted)
  assert.deepEqual(ids(got),ids(reference(units,fits)),'round '+round);assert.ok(checks<=got.length,'one check per batch')
 }
})
test('SB-02: when metadata makes a batch too large it falls back to the per-unit planner',()=>{
 const units=Array.from({length:12},(_,i)=>unit(i,100)),fits=(b:ImportUnit[])=>b.reduce((n,u)=>n+u.text.length,0)<=1000&&b.length*100+b.length*b.length*20<=900
 assert.deepEqual(ids(importStageBatches(units,1000,300,fits)),ids(reference(units,fits)))
 assert.throws(()=>importStageBatches([unit(0,100)],1000,300,()=>false),/单个导入任务及完整元数据超过模型预算/)
})
