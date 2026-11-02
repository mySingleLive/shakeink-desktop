import {createHash} from 'node:crypto'
/** Compare complete rooted scene forests without treating equal display names
 * as one identity. IDs bind edges locally; generated database IDs need not match. */
export function sceneForestFingerprint(rows,fields){
 const nodes=new Map(),roots=[],queue=[]
 for(const row of rows){if(!row||typeof row.id!=='string'||!row.id.length||nodes.has(row.id))throw Error('Duplicate or invalid persisted scene ID');nodes.set(row.id,{row,children:[],remaining:0})}
 for(const node of nodes.values()){
  const parent=node.row.parentId
  if(parent===null){roots.push(node);continue}
  if(typeof parent!=='string'||!parent.length)throw Error('Persisted scene parent is invalid')
  const p=nodes.get(parent);if(!p||p===node)throw Error('Persisted scene parent is invalid');p.children.push(node);p.remaining++
 }
 for(const node of nodes.values())if(!node.remaining)queue.push(node)
 let visited=0
 for(let at=0;at<queue.length;at++){
  const node=queue[at];node.hash=createHash('sha256').update(JSON.stringify({fields:fields(node.row),children:node.children.map(c=>c.hash).sort()})).digest('hex');visited++
  const parent=nodes.get(node.row.parentId);if(parent&&--parent.remaining===0)queue.push(parent)
 }
 if(visited!==rows.length)throw Error('Persisted scene hierarchy contains a cycle')
 return {count:rows.length,roots:roots.map(n=>n.hash).sort()}
}
