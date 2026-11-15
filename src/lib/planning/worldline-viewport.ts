/** docs/580 §7.2 (R4, N4): the worldline timeline window lives in one small external store per panel instance.
 * `ContentTabs` keeps hidden tabs mounted, so a module-level singleton would let two worldline tabs move each other.
 * `PlanningWorkspace` creates one store in a ref and passes it through context; only subscribers re-render. */
export interface ViewportWindow {readonly start:number;readonly span:number}
export interface ViewportStore {
 subscribe(listener:()=>void):()=>void
 /** Same object until the window changes, as `useSyncExternalStore` requires. */
 getSnapshot():ViewportWindow
 /** The only way to move the window. Equal values are a no-op and notify nobody. */
 setWindow(next:Partial<ViewportWindow>):void
}
function check(w:ViewportWindow):ViewportWindow{
 if(!Number.isFinite(w.start))throw new RangeError('视窗起点必须是有限数')
 if(!Number.isFinite(w.span)||w.span<=0)throw new RangeError('视窗跨度必须是正的有限数')
 return w
}
export function createViewportStore(initial:ViewportWindow):ViewportStore{
 let current:ViewportWindow=Object.freeze(check({start:initial.start,span:initial.span}))
 const listeners=new Set<()=>void>()
 return {
  subscribe(listener){listeners.add(listener);return()=>{listeners.delete(listener)}},
  getSnapshot:()=>current,
  setWindow(next){
   const w=check({start:next.start??current.start,span:next.span??current.span})
   if(w.start===current.start&&w.span===current.span)return
   current=Object.freeze(w)
   for(const listener of [...listeners])listener()
  },
 }
}
