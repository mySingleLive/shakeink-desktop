import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createViewportStore} from '../../src/lib/planning/worldline-viewport'

/* docs/580 §7.2 (R4, N4): one viewport store per panel; the store is the only writer of the window. */
test('WU-56f (store): each store is independent; subscribers hear only their own store',()=>{
 const a=createViewportStore({start:0,span:70}),b=createViewportStore({start:100,span:30})
 let heardA=0,heardB=0
 const ua=a.subscribe(()=>heardA++),ub=b.subscribe(()=>heardB++)
 a.setWindow({start:10})
 assert.deepEqual(a.getSnapshot(),{start:10,span:70});assert.deepEqual(b.getSnapshot(),{start:100,span:30})
 assert.equal(heardA,1);assert.equal(heardB,0)
 ua();ub()
})
test('WU-56g (store): snapshots are stable until a change; no-op writes do not notify',()=>{
 const s=createViewportStore({start:0,span:70});let heard=0;s.subscribe(()=>heard++)
 const first=s.getSnapshot();assert.equal(s.getSnapshot(),first,'same object for useSyncExternalStore')
 s.setWindow({start:0,span:70});assert.equal(heard,0);assert.equal(s.getSnapshot(),first)
 s.setWindow({span:35});assert.equal(heard,1);assert.notEqual(s.getSnapshot(),first);assert.deepEqual(s.getSnapshot(),{start:0,span:35})
})
test('WU-56g (store): invalid windows are rejected so the store never holds NaN or a zero span',()=>{
 const s=createViewportStore({start:0,span:70})
 for(const bad of [{start:Number.NaN},{span:0},{span:-5},{span:Number.POSITIVE_INFINITY}])assert.throws(()=>s.setWindow(bad),RangeError,JSON.stringify(bad))
 assert.deepEqual(s.getSnapshot(),{start:0,span:70})
})
