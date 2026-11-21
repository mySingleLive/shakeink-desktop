/** docs/580 §7.2 (R4, N4): the worldline timeline window lives in one small external store per panel instance.
 * `ContentTabs` keeps hidden tabs mounted, so a module-level singleton would let two worldline tabs move each other.
 * `PlanningWorkspace` creates one store in a ref and passes it through context; only subscribers re-render.
 * docs/584 R1: `y` is the plane's vertical offset in px (y = −old scrollTop: larger y moves the content down). It is
 * unbounded, like `start`, so the canvas has no edge in any direction. */
export interface ViewportWindow {readonly start:number;readonly span:number;readonly y:number}
export interface ViewportStore {
 subscribe(listener:()=>void):()=>void
 /** Same object until the window changes, as `useSyncExternalStore` requires. */
 getSnapshot():ViewportWindow
 /** The only way to move the window. Equal values are a no-op and notify nobody. */
 setWindow(next:Partial<ViewportWindow>):void
 /** docs/584: a one-shot request to centre the packed cards once the next layout is known (first open only). */
 requestCenter():void
 cancelCenterRequest():void
 /** True once after requestCenter; a locate cancels it so the located card is not moved away. */
 takeCenterRequest():boolean
}
function check(w:ViewportWindow):ViewportWindow{
 if(!Number.isFinite(w.start))throw new RangeError('视窗起点必须是有限数')
 if(!Number.isFinite(w.span)||w.span<=0)throw new RangeError('视窗跨度必须是正的有限数')
 if(!Number.isFinite(w.y))throw new RangeError('视窗纵向偏移必须是有限数')
 return w
}
export function createViewportStore(initial:{start:number;span:number;y?:number}):ViewportStore{
 let current:ViewportWindow=Object.freeze(check({start:initial.start,span:initial.span,y:initial.y??0}))
 let center=false
 const listeners=new Set<()=>void>()
 return {
  subscribe(listener){listeners.add(listener);return()=>{listeners.delete(listener)}},
  getSnapshot:()=>current,
  setWindow(next){
   const w=check({start:next.start??current.start,span:next.span??current.span,y:next.y??current.y})
   if(w.start===current.start&&w.span===current.span&&w.y===current.y)return
   current=Object.freeze(w)
   for(const listener of [...listeners])listener()
  },
  requestCenter(){center=true},
  cancelCenterRequest(){center=false},
  takeCenterRequest(){const c=center;center=false;return c},
 }
}

/** docs/592 §2.4: the status-line note of the timeline zoom levels. One store per panel (like the viewport store):
 * EventTimeline writes it in a layout effect and registers the button actions; the status line subscribes, so
 * PlanningWorkspace never re-renders on a zoom step. Equal notes notify nobody. */
export interface ZoomNote {readonly count:number;readonly important:boolean;readonly showAll:boolean}
export interface ZoomNoteStore {
 subscribe(listener:()=>void):()=>void
 getSnapshot():ZoomNote|null
 set(note:ZoomNote|null):void
 /** The current timeline's 显示为卡片 / 改回时间点 handler; null when no timeline is mounted. */
 actions:{toggleShowAll():void}|null
}
export function createZoomNoteStore():ZoomNoteStore{
 let current:ZoomNote|null=null
 const listeners=new Set<()=>void>()
 return {
  subscribe(listener){listeners.add(listener);return()=>{listeners.delete(listener)}},
  getSnapshot:()=>current,
  set(note){
   if(note===current||(note&&current&&note.count===current.count&&note.important===current.important&&note.showAll===current.showAll))return
   current=note?Object.freeze({...note}):null
   for(const listener of [...listeners])listener()
  },
  actions:null,
 }
}
