import assert from 'node:assert/strict'
import {test} from 'node:test'
import {sceneForestFingerprint} from '../../scripts/lib/scene-import-persistence.mjs'
type Row={id:string;parentId:string|null;name:string;text?:string}
const fingerprint=(rows:Row[])=>sceneForestFingerprint(rows,(r:Row)=>({name:r.name,text:r.text??''}))
test('scene persistence keeps equal labels as distinct nodes and binds actual parent IDs',()=>{
 const a=[{id:'a',parentId:null,name:'书房'},{id:'b',parentId:null,name:'书房'},{id:'c',parentId:'a',name:'密室'}]
 const b:Row[]=[{id:'z',parentId:'y',name:'密室'},{id:'x',parentId:null,name:'书房'},{id:'y',parentId:null,name:'书房'}]
 assert.deepEqual(fingerprint(a),fingerprint(b));assert.notDeepEqual(fingerprint(a),fingerprint(a.slice(0,1)))
 const changed=structuredClone(b);changed[0].text='different';assert.notDeepEqual(fingerprint(a),fingerprint(changed))
})
test('scene persistence detects redistributed children, missing parents, cycles and duplicate IDs',()=>{
 const a=[{id:'a',parentId:null,name:'房间'},{id:'b',parentId:null,name:'房间'},{id:'c',parentId:'a',name:'窗'},{id:'d',parentId:'a',name:'窗'}]
 const b=structuredClone(a);b[3].parentId='b';assert.notDeepEqual(fingerprint(a),fingerprint(b))
 assert.throws(()=>fingerprint([{id:'a',parentId:'missing',name:'房间'}]));assert.throws(()=>fingerprint([{id:'a',parentId:'b',name:'房间'},{id:'b',parentId:'a',name:'房间'}]));assert.throws(()=>fingerprint([{id:'a',parentId:null,name:'房间'},{id:'a',parentId:null,name:'房间'}]))
})
test('scene persistence rejects empty IDs and accepts only explicit null roots',()=>{
 assert.throws(()=>fingerprint([{id:'',parentId:null,name:'房间'}]))
 assert.throws(()=>fingerprint([{id:'a',parentId:'',name:'房间'}]))
 assert.throws(()=>sceneForestFingerprint([{id:'a',name:'房间'}],(r:{name:string})=>({name:r.name})))
})
