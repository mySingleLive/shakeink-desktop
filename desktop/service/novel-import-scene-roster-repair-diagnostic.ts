export type SceneRosterRepairReason='literal-window-missing'|'literal-window-repeated'|'old-mention'|'new-mention-duplicate'|'context-window-missing'|'old-context'|'group-window-duplicate'|'transaction'
export type SceneRosterRepairDiagnostic={reason:SceneRosterRepairReason;claimRef?:string;repairRef?:string;field?:'mentions';index?:number}
const reasons=new Set<SceneRosterRepairReason>(['literal-window-missing','literal-window-repeated','old-mention','new-mention-duplicate','context-window-missing','old-context','group-window-duplicate','transaction'])
const known=new WeakMap<object,Readonly<SceneRosterRepairDiagnostic>>()
/** Only actual application guard failures enter this private association.
 * No message, property or model-created error is used as diagnostic data. */
export function bindSceneRosterRepairDiagnostic(error:unknown,value:SceneRosterRepairDiagnostic):void{
 if(!(error instanceof Error)||!reasons.has(value.reason))return
 if(value.claimRef!==undefined&&(typeof value.claimRef!=='string'||!/^pc[0-9a-f]{16}$/u.test(value.claimRef)))return
 if(value.repairRef!==undefined&&(typeof value.repairRef!=='string'||!/^rr[0-9a-f]{16}$/u.test(value.repairRef)))return
 if(value.field!==undefined&&value.field!=='mentions'||value.index!==undefined&&(!Number.isSafeInteger(value.index)||value.index<0))return
 known.set(error,Object.freeze({...value}))
}
export function sceneRosterRepairDiagnostic(error:unknown):Readonly<SceneRosterRepairDiagnostic>|undefined{
 if(!error||typeof error!=='object')return
 const value=known.get(error);return value?Object.freeze({...value}):undefined
}
export function sceneRosterLiteralWindowReason(quote:string,literal:string):SceneRosterRepairReason|undefined{
 let count=0;for(let at=quote.indexOf(literal);literal&&at>=0;at=quote.indexOf(literal,at+1))count++
 return count===0?'literal-window-missing':count>1?'literal-window-repeated':undefined
}
