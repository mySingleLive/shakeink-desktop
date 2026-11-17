import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import {civilDays,civilFromDays,ERA_YEAR_HOURS} from '../../src/lib/planning/era-calendar'
import {fitTimelineWindow,fitDenseTimelineWindow,formatTime} from '../../src/lib/planning/timeline'
import {applyPlanningOperations,planningSchema,type PlanningData} from '../../src/lib/planning/domain'
import * as L from '../../src/lib/planning/worldline-layout'

/* docs/581 §2 (WU-10 … WU-21b): worldline layout pure functions. Synthetic data only. */
type Cal=PlanningData['worlds'][number]['calendar']
const H=24
const FIFTH=civilDays(200001,1,1)*H
const ERA_CAL:Cal={kind:'gregorian',epoch:'0001-01-01T00:00:00Z',hoursPerDay:24,daysPerMonth:30,monthsPerYear:12,eras:[{name:'第四纪',start:0},{name:'第五纪',start:FIFTH}]}
const PLAIN_CAL:Cal={kind:'gregorian',epoch:'0001-01-01T00:00:00Z',hoursPerDay:24,daysPerMonth:30,monthsPerYear:12,eras:[]}
const FIXED24:Cal={kind:'fixed',epoch:'故事开始',hoursPerDay:24,daysPerMonth:30,monthsPerYear:12,eras:[]}
/** Hour of 第五纪 y-m-d. */
const D5=(y:number,m:number,d:number)=>FIFTH+civilDays(y,m,d)*H
const D4=(y:number,m:number,d:number)=>civilDays(y,m,d)*H
type Ev={id:string;at:number|null;parent?:string;dur?:number;precision?:string;title?:string;fact?:string;category?:string;importance?:number;people?:string[];label?:string;ongoing?:boolean;kind?:'exact'|'window';end?:number}
function plan(events:Ev[],calendar:Cal=ERA_CAL,extra:Record<string,unknown>={}):PlanningData{
 return planningSchema.parse({worlds:[{id:'w',name:'主世界线',calendar,...extra}],characters:[],events:events.map(e=>({
  id:e.id,line:'w',title:e.title??e.id,fact:e.fact??'',parent:e.parent??null,category:e.category??'其他',importance:e.importance??1,people:e.people??[],ongoing:e.ongoing??false,
  duration:e.dur??0,time:e.at===null?{kind:'unknown'}:{kind:e.kind??'exact',value:e.at,end:e.end??null,precision:e.precision??'hour',label:e.label??''}}))})
}
const treeOf=(d:PlanningData)=>L.eventTree(d.events,d)

test('WU-10: eventTree sorts each level by start, lists pending events apart and lifts orphans to the root',()=>{
 const d=plan([
  {id:'r2',at:500},{id:'r1',at:100},
  {id:'c2',at:300,parent:'r1'},{id:'c1',at:200,parent:'r1'},
  {id:'g2',at:260,parent:'c1'},{id:'g1',at:210,parent:'c1'},
  {id:'p1',at:null},{id:'p2',at:null},
  {id:'orphan',at:50,parent:'missing'},
 ],FIXED24)
 const t=treeOf(d)
 assert.deepEqual(t.roots.map(n=>n.id),['orphan','r1','r2'])
 const r1=t.byId.get('r1')!
 assert.deepEqual(r1.children.map(n=>n.id),['c1','c2'])
 assert.deepEqual(r1.children[0].children.map(n=>n.id),['g1','g2'])
 assert.deepEqual(r1.children[0].children.map(n=>n.depth),[2,2])
 assert.deepEqual(t.pending.map(n=>n.id),['p1','p2'])
 assert.ok(t.pending.every(n=>n.start===null))
 assert.equal(t.byId.get('orphan')!.depth,0)
})

test('WU-11: familyEnd is the latest end over the parent and all descendants',()=>{
 const d=plan([{id:'p',at:10,dur:10},{id:'c',at:12,dur:2,parent:'p'},{id:'g',at:20,dur:5,parent:'c'}],FIXED24)
 const t=treeOf(d)
 assert.equal(L.familyEnd('p',t),25)
 assert.equal(L.familyEnd(t.byId.get('c')!),25)
})

test('WU-19d: CalendarAdapter boundaries, break thresholds and time bases per calendar kind',()=>{
 // ① gregorian with eras: month and year starts are civilFromDays boundaries inside each era.
 const era=L.createCalendarAdapter(ERA_CAL)
 const months=era.boundaries(D5(1349,1,15),D5(1350,3,2),'month')
 assert.equal(months.length,14)
 for(const b of months){const c=civilFromDays((b-FIFTH)/H);assert.equal(c.day,1);assert.ok(Number.isInteger((b-FIFTH)/H))}
 assert.deepEqual(months.slice(0,2),[D5(1349,2,1),D5(1349,3,1)])
 assert.deepEqual(era.boundaries(D5(1348,6,1),D5(1350,6,1),'year'),[D5(1349,1,1),D5(1350,1,1)])
 // The next era's start is year 1-01-01 of that era.
 assert.ok(era.boundaries(FIFTH-5*H,FIFTH+5*H,'year').includes(FIFTH))
 assert.equal(era.breakHours,720)
 assert.ok(era.hasYears&&era.hasMonths&&era.hasEras)
 // ② gregorian without eras: Date-free civil arithmetic from the epoch.
 const plain=L.createCalendarAdapter(PLAIN_CAL)
 const pm=plain.boundaries(D4(1349,1,15),D4(1349,6,2),'month')
 assert.deepEqual(pm,[2,3,4,5,6].map(m=>D4(1349,m,1)))
 for(const b of pm)assert.equal(civilFromDays(b/H).day,1)
 assert.deepEqual(plain.boundaries(D4(1999,2,1),D4(2001,2,1),'year'),[D4(2000,1,1),D4(2001,1,1)])
 assert.equal(plain.breakHours,720);assert.equal(plain.hasEras,false)
 // ③ fixed 20 h days, 30 days a month: a month every 600 h and a 600 h break threshold (not a hard-coded 720).
 const f20=L.createCalendarAdapter({...FIXED24,hoursPerDay:20})
 assert.deepEqual(f20.boundaries(0,3000,'month'),[0,600,1200,1800,2400,3000])
 assert.deepEqual(f20.boundaries(0,15000,'year'),[0,7200,14400])
 assert.equal(f20.breakHours,600)
 // ④ fixed without a day length: hours only, 720 h fallback.
 const fnull=L.createCalendarAdapter({...FIXED24,hoursPerDay:null})
 assert.equal(fnull.breakHours,720);assert.equal(fnull.hasYears,false);assert.equal(fnull.hasMonths,false)
 assert.deepEqual(fnull.boundaries(0,5000,'month'),[])
 // ⑤ years: 30 days in years, no year badges or month ticks.
 const yrs=L.createCalendarAdapter({...FIXED24,kind:'years'})
 assert.equal(yrs.breakHours,30/365.2425)
 assert.equal(yrs.hasYears,false);assert.equal(yrs.hasMonths,false)
 assert.deepEqual(yrs.boundaries(0,100,'year'),[]);assert.deepEqual(yrs.boundaries(0,100,'month'),[])
 // ⑥ time base: 30 base days = 720 base hours, divided by scale 24 = 30 worldline hours.
 const based=L.createCalendarAdapter(FIXED24,{calendar:FIXED24,scale:24,zero:0})
 assert.equal(based.breakHours,30)
 // Labels follow the base, segmentation does not change with it.
 const d=plan([{id:'a',at:0},{id:'b',at:1},{id:'c',at:2},{id:'far',at:5000}],FIXED24)
 const roots=treeOf(d).roots
 const own=L.createCalendarAdapter(FIXED24)
 assert.notEqual(own.label(48,1),based.label(48,1))
 const seg=(a:L.CalendarAdapter)=>L.railSegments(roots,a).map(s=>s.roots.map(r=>r.id))
 assert.deepEqual(seg(own),seg(based))
 assert.deepEqual(seg(own),[['a','b','c'],['far']])
 // adapterFor computes the base zero through timeBaseValue.
 const withBase=plan([{id:'a',at:0}],FIXED24,{timeBases:[{id:'tb',name:'外历',calendar:FIXED24,offset:240,scale:24}]})
 const fromData=L.adapterFor(withBase,'w','tb')
 assert.equal(fromData.toDisplay(1),264);assert.equal(fromData.breakHours,30)
 assert.equal(L.adapterFor(withBase,'w',null).breakHours,720)
})

test('WU-12: railSegments breaks only when a gap beats both 30 days and 20 × the median gap',()=>{
 // ① F885 distribution: ancient and recent split; 1348–1350 stays one segment; every segment has events.
 const f=F885()
 const tree=treeOf(f.data),era=L.createCalendarAdapter(ERA_CAL)
 const segs=L.railSegments(tree.roots,era)
 assert.ok(segs.length>=2)
 assert.ok(segs.every(s=>s.roots.length>=1))
 const recent=segs.filter(s=>s.roots.some(r=>r.start!>=FIFTH))
 assert.equal(recent.length,1);assert.equal(recent[0].roots.length,851)
 assert.ok(recent[0].t0>=D5(1348,1,1)&&recent[0].t1<D5(1351,1,1))
 assert.ok(segs.filter(s=>s!==recent[0]).every(s=>s.roots.every(r=>r.start!<FIFTH)))
 // ② gap of 40 days, median 5 days (limit 100 days): one condition only, no break.
 const fixed=L.createCalendarAdapter(FIXED24)
 const days=(gaps:number[])=>{let t=0;return [{id:'e0',at:0},...gaps.map((g,i)=>({id:`e${i+1}`,at:(t+=g*H)}))]}
 const two=treeOf(plan(days([5,5,5,5,5,40,5,5,5,5,5]),FIXED24))
 assert.equal(L.railSegments(two.roots,fixed).length,1)
 // ③ gap of 200 days with the same median: break.
 const three=treeOf(plan(days([5,5,5,5,5,200,5,5,5,5,5]),FIXED24))
 const s3=L.railSegments(three.roots,fixed)
 assert.deepEqual(s3.map(s=>s.roots.length),[6,6])
})


const leafRoots=(t:L.EventTree)=>t.roots.filter(r=>!r.children.length)
test('WU-19c: tableLayout tops increase, unmeasured expanded cards use the estimate, zoom adds min(240, Δdays × 6 × (zoom − 1))',()=>{
 const f=F885(),tree=treeOf(f.data),era=L.createCalendarAdapter(ERA_CAL)
 const open=new Set(['n10','n11','n12'])
 const heights={n10:120,n11:200}
 for(const zoom of [1,2.5]){
  const lay=L.tableLayout(tree,heights,zoom,era,{expanded:open})
  const tops=lay.cards.map(c=>c.top)
  for(let i=1;i<tops.length;i++)assert.ok(tops[i]>tops[i-1],`top ${i} at zoom ${zoom}`)
  assert.equal(lay.byId.get('n10')!.height,120);assert.equal(lay.byId.get('n11')!.height,200)
  assert.equal(lay.byId.get('n12')!.height,L.estimateCardHeight(tree.byId.get('n12')!.event))
  assert.ok(lay.byId.get('n12')!.height>L.CARD_HEIGHT)
  assert.equal(lay.byId.get('n13')!.height,L.CARD_HEIGHT)
  assert.deepEqual(L.tableLayout(tree,heights,zoom,era,{expanded:open}),lay,'pure: same input, same output')
  // Extra space between adjacent roots of one segment.
  const roots=leafRoots(tree)
  let checked=0
  for(let i=0;i+1<roots.length;i++){
   const a=lay.byId.get(roots[i].id)!,b=lay.byId.get(roots[i+1].id)!
   if(a.segment!==b.segment)continue
   const days=(roots[i+1].start!-roots[i].start!)/24
   const extra=zoom===1?0:Math.min(240,days*6*(zoom-1))
   assert.ok(Math.abs(b.top-(a.top+a.height+L.CARD_GAP)-extra)<1e-9,`${roots[i].id}→${roots[i+1].id}`)
   checked++
  }
  assert.ok(checked>800)
 }
 // A large gap is capped at 240.
 const two=treeOf(plan([{id:'a',at:0},{id:'b',at:40*24},{id:'c',at:40.5*24}],FIXED24))
 const z=L.tableLayout(two,{},2.5,L.createCalendarAdapter(FIXED24))
 assert.equal(z.byId.get('b')!.top-(z.byId.get('a')!.top+L.CARD_HEIGHT+L.CARD_GAP),240)
 assert.equal(z.byId.get('c')!.top-(z.byId.get('b')!.top+L.CARD_HEIGHT+L.CARD_GAP),0.5*6*1.5)
 // Zoom is clamped to 1–4.
 assert.deepEqual(L.tableLayout(two,{},9,L.createCalendarAdapter(FIXED24)),L.tableLayout(two,{},4,L.createCalendarAdapter(FIXED24)))
})

test('WU-19j: layout constants: card 34, gap 6, group padding 10, child indent 18, break 46',()=>{
 assert.deepEqual([L.CARD_HEIGHT,L.CARD_GAP,L.GROUP_PADDING,L.TABLE_INDENT,L.TREE_INDENT,L.BREAK_HEIGHT],[34,6,10,18,16,46])
 // Roots 3 days apart, then one 5000 days later: a single break before 'far'.
 const d=plan([{id:'p',at:0,dur:48},{id:'c1',at:6,parent:'p'},{id:'c2',at:12,parent:'p'},{id:'q',at:3*24},{id:'r',at:6*24},{id:'far',at:5000*24}],FIXED24)
 const lay=L.tableLayout(treeOf(d),{},1,L.createCalendarAdapter(FIXED24))
 const c=(id:string)=>lay.byId.get(id)!
 for(const id of ['p','c1','c2','q','r','far'])assert.equal(c(id).height,34)
 const g=lay.groups.find(x=>x.id==='p')!
 assert.equal(c('p').top-g.top,10)
 assert.equal(c('c1').top-(c('p').top+34),6);assert.equal(c('c2').top-(c('c1').top+34),6)
 assert.equal(g.bottom-(c('c2').top+34),10)
 assert.equal(c('c1').left-c('p').left,18);assert.equal(c('c2').left,18);assert.equal(c('c1').depth,1)
 assert.equal(lay.breaks.length,1)
 const br=lay.breaks[0]
 assert.equal(c('q').top-g.bottom,6);assert.equal(c('r').top-(c('q').top+34),6)
 assert.equal(br.height,46);assert.equal(br.top,c('r').top+34);assert.equal(c('far').top,br.top+46)
 assert.equal(lay.height,c('far').top+34)
 // Folding drops the children from the layout, the group keeps its padding.
 const folded=L.tableLayout(treeOf(d),{},1,L.createCalendarAdapter(FIXED24),{folded:new Set(['p'])})
 assert.equal(folded.byId.has('c1'),false)
 assert.equal(folded.groups[0].bottom-folded.byId.get('p')!.top,34+10)
})

/** n roots one per `stepDays` days on FIXED24, plus extra events. */
const rowPlan=(n:number,stepDays:number,extra:Ev[]=[],cal:Cal=FIXED24)=>plan([...Array.from({length:n},(_,i)=>({id:`r${i}`,at:i*stepDays*24,precision:'day'})),...extra],cal)
function marksOf(d:PlanningData,cal:Cal,opts:Partial<L.RailOptions>={}){
 const tree=treeOf(d),a=L.createCalendarAdapter(cal)
 const lay=L.tableLayout(tree,{},1,a)
 return {tree,lay,a,m:L.railMarks(lay,lay.segments,a,opts)}
}
test('WU-13: railMarks places dots strictly by time and merges dots within 4px into one cluster of 5 with one label',()=>{
 // Day 31 sits between roots r10 (day 30) and r11 (day 33), so the cluster holds only the five events.
 const same=[0,1,2,3,4].map(h=>({id:`s${h}`,at:31*24+h,precision:'day'}))
 const {lay,m}=marksOf(rowPlan(20,3,same),FIXED24)
 const seg=lay.segments[0]
 for(const card of lay.cards){
  const t=card.start!,y=seg.y0+((t-seg.t0)/(seg.t1-seg.t0))*(seg.y1-seg.y0)
  assert.ok(Math.abs(m.points.get(card.id)!-y)<1e-9,card.id)
 }
 const cluster=m.dots.filter(d=>d.ids.some(id=>id.startsWith('s')))
 assert.equal(cluster.length,1);assert.equal(cluster[0].count,5);assert.equal(cluster[0].cluster,true)
 assert.deepEqual([...cluster[0].ids].sort(),['s0','s1','s2','s3','s4'])
 assert.equal(m.labels.filter(l=>l.ids.some(id=>id.startsWith('s'))).length,1)
 for(let i=1;i<m.dots.length;i++)assert.ok(m.dots[i].y-m.dots[i-1].y>=L.CLUSTER_PX)
 assert.ok(m.dots.filter(d=>!d.cluster).every(d=>d.count===1))
})

test('WU-13b: rail labels follow the event precision on an era calendar',()=>{
 const d=plan([
  {id:'day',at:D5(1349,12,1),precision:'day'},{id:'month',at:D5(1349,12,20),precision:'month'},
  {id:'year',at:D5(1349,7,1),precision:'year'},{id:'n1',at:D5(1349,3,1),precision:'day'},{id:'n2',at:D5(1350,2,1),precision:'day'},
  {id:'era',at:D4(5,1,1),precision:'era'},
 ])
 const {m}=marksOf(d,ERA_CAL)
 const text=(id:string)=>m.labels.find(l=>l.ids.includes(id))!.text
 assert.equal(text('day'),'12月1日');assert.equal(text('month'),'1349年12月');assert.equal(text('year'),'1349年');assert.equal(text('era'),'第四纪')
 // A year-precision dot right on the badge of its own year does not repeat the year.
 const onBadge=plan([{id:'a',at:D5(1349,1,1),precision:'year'},{id:'b',at:D5(1349,3,1),precision:'day'}])
 const mb=marksOf(onBadge,ERA_CAL).m
 const badge=mb.badges.find(b=>b.kind==='year'&&b.text==='第五纪1349年')!
 assert.ok(Math.abs(badge.y-mb.points.get('a')!)<L.LABEL_MIN_GAP+L.SEGMENT_BADGE_OFFSET)
 const la=mb.labels.find(l=>l.ids.includes('a'))!
 assert.equal(la.text,'');assert.equal(la.visible,false)
})

test('WU-13c: month ticks closer than 44px drop their label; year badges are always drawn',()=>{
 // One root per month: heads 40px apart, so month ticks are ~40px apart.
 const d=plan(Array.from({length:14},(_,i)=>({id:`m${i}`,at:D5(1349,1,1)+civilDays(1349+Math.floor((i+2)/12),((i+2)%12)+1,1)*24-civilDays(1349,1,1)*24,precision:'day'})))
 const {m}=marksOf(d,ERA_CAL)
 const ticks=m.ticks
 assert.ok(ticks.length>=10)
 let last=-Infinity
 for(const t of ticks){
  if(t.label!==null){assert.ok(t.y-last>=L.TICK_LABEL_GAP);last=t.y}
 }
 assert.ok(ticks.some(t=>t.label===null),'some labels omitted')
 assert.ok(ticks.some(t=>t.label!==null))
 const years=m.badges.filter(b=>b.kind==='year').map(b=>b.text)
 assert.deepEqual(years,['第五纪1349年','第五纪1350年'])
 // The 1350 badge sits right next to the preceding tick yet is still drawn.
 const y1350=m.badges.find(b=>b.text==='第五纪1350年')!
 assert.ok(ticks.some(t=>Math.abs(t.y-y1350.y)<L.TICK_LABEL_GAP))
})

test('WU-14: a label closer than 18px to the previous one is hidden unless its event is selected',()=>{
 // y is 12 hours after x (x shares day 30 with r10): about 0.6px per hour, so 4–18px apart.
 const close=[{id:'x',at:30*24,precision:'day'},{id:'y',at:30*24+12,precision:'day'}]
 const {m}=marksOf(rowPlan(20,3,close),FIXED24)
 const gap=m.points.get('y')!-m.points.get('x')!
 assert.ok(gap>=L.CLUSTER_PX&&gap<L.LABEL_MIN_GAP,`gap ${gap}`)
 const ly=()=>m.labels.find(l=>l.ids.includes('y'))!
 assert.equal(ly().visible,false)
 const visible=m.labels.filter(l=>l.visible).map(l=>l.y)
 for(let i=1;i<visible.length;i++)assert.ok(visible[i]-visible[i-1]>=L.LABEL_MIN_GAP)
 const sel=marksOf(rowPlan(20,3,close),FIXED24,{selected:'y'}).m
 assert.equal(sel.labels.find(l=>l.ids.includes('y'))!.visible,true)
})

test('WU-19i: an era-precision event sits inside its era, and labels and the directory show the era name',()=>{
 const d=plan([{id:'old',at:D4(80000,6,1),precision:'era'},{id:'o2',at:D4(80000,9,1),precision:'day'},{id:'new',at:D5(1349,1,1),precision:'day'}])
 const {m,a}=marksOf(d,ERA_CAL)
 const dot=m.dots.find(x=>x.ids.includes('old'))!
 const era=a.eraOf(dot.t)!
 assert.equal(era.name,'第四纪');assert.ok(dot.t>=era.start&&dot.t<era.end!)
 assert.equal(m.labels.find(l=>l.ids.includes('old'))!.text,'第四纪')
 assert.equal(a.short(D4(80000,6,1),'era'),'第四纪')
 assert.equal(a.short(D5(1349,12,1),'day'),'12-01')
 assert.equal(a.label(D4(80000,6,1),1,'era'),'第四纪')
})


// ---------- timeline ----------
const VIEW_W=1100
const BOUND=1e6+7*VIEW_W
/** n families, a root every 2 days; every third root has two children (one long), every fifth a grandchild. */
function famEvents(n:number,offset=0,prefix='f'):Ev[]{
 const out:Ev[]=[]
 for(let i=0;i<n;i++){
  const at=offset+i*2*24+(i%4)*5,id=`${prefix}${i}`
  out.push({id,at,dur:i%3===0?6*24:0})
  if(i%3===0){out.push({id:`${id}c1`,at:at+12,parent:id},{id:`${id}c2`,at:at+30,dur:3*24,parent:id})
   if(i%5===0)out.push({id:`${id}g`,at:at+40,parent:`${id}c2`})}
 }
 return out
}
type Box={id:string;left:number;right:number;y:number;h:number}
const boxes=(st:L.TimelineState):Box[]=>[...st.packed!.families.values()].filter(f=>f.built).map(f=>({id:f.box.id,left:f.box.left,right:f.box.right,y:f.y,h:f.box.h}))
function noOverlap(list:Box[]){
 for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
  const a=list[i],b=list[j]
  const x=a.left<b.right&&b.left<a.right,y=a.y<b.y+b.h&&b.y<a.y+a.h
  assert.ok(!(x&&y),`${a.id} overlaps ${b.id}`)
 }
}
const ys=(st:L.TimelineState)=>new Map([...st.packed!.families.values()].map(f=>[f.box.id,f.y]))
function step(st:L.TimelineState,tree:L.EventTree,view:{start:number;span:number},extra:Partial<L.TimelineInput>={}){
 return L.timelineStep(st,{tree,view,width:VIEW_W,...extra})
}
const checkCss=(r:L.TimelineStep)=>{
 assert.ok(Math.abs(r.translateX)<BOUND,`translateX ${r.translateX}`)
 for(const e of r.elements){assert.ok(Math.abs(e.left)<BOUND,`${e.id} left ${e.left}`);assert.ok(Math.abs(e.left+e.width)<BOUND,`${e.id} right`)}
}

test('WU-15: packFamilies first pass: 30 families never intersect and take the lowest free slot in start order',()=>{
 const tree=treeOf(plan(famEvents(30),FIXED24))
 const scale=VIEW_W/(20*24)
 const fams=L.buildFamilies(tree.roots,{scale})
 assert.equal(fams.length,30)
 const packed=L.packFamilies(fams,null,{scale,width:VIEW_W})
 assert.equal(packed.mode,'full')
 const list=[...packed.families.values()].map(f=>({id:f.box.id,left:f.box.left,right:f.box.right,y:f.y,h:f.box.h,start:f.box.start}))
 noOverlap(list)
 const sorted=[...list].sort((a,b)=>a.start-b.start)
 assert.equal(sorted[0].y,L.PLANE_TOP)
 const hit=(y:number,f:typeof list[number],o:typeof list[number])=>f.left<o.right&&o.left<f.right&&y<o.y+o.h+L.FAMILY_V_GAP&&y+f.h+L.FAMILY_V_GAP>o.y
 sorted.forEach((f,i)=>{
  const earlier=sorted.slice(0,i).filter(o=>o.left<f.right&&f.left<o.right)
  const cands=[L.PLANE_TOP,...earlier.map(o=>o.y+o.h+L.FAMILY_V_GAP)]
  assert.ok(cands.includes(f.y),`${f.id} sits on a candidate`)
  for(const c of cands)if(c<f.y)assert.ok(earlier.some(o=>hit(c,f,o)),`${f.id} skipped a free slot at ${c}`)
  // Later families never push an earlier one: its slot is free of all earlier families.
  assert.ok(!earlier.some(o=>hit(f.y,f,o)))
 })
 assert.ok(new Set(list.map(f=>f.y)).size>2,'the fixture stacks families')
 assert.ok([...packed.families.values()].every(f=>f.home===f.y))
})

test('WU-16: panning at a fixed scale packs once and never moves a built family',()=>{
 const tree=treeOf(plan(famEvents(60),FIXED24))
 const span=20*24
 let r=step(L.emptyTimeline(),tree,{start:0,span})
 let full=r.packMode==='full'?1:0,incremental=0
 const home=ys(r.state)
 for(let k=1;k<=20;k++){
  r=step(r.state,tree,{start:k*0.15*span,span})
  if(r.packMode==='full')full++
  if(r.packMode==='incremental')incremental++
  for(const [id,y] of ys(r.state))if(home.has(id))assert.equal(y,home.get(id),`${id} at frame ${k}`)
  for(const [id,y] of ys(r.state))if(!home.has(id))home.set(id,y)
  noOverlap(boxes(r.state))
 }
 assert.equal(full,1)
 assert.ok(incremental>=1,'panning crossed the build range at least once')
})

/** Family A (index 9) overlaps neighbours on both sides; one of its cards grows by 160px. */
function expandFixture(){
 const tree=treeOf(plan(famEvents(30),FIXED24))
 const span=20*24,view={start:0,span}
 const r0=step(L.emptyTimeline(),tree,view)
 const A='f9',card='f9c1'
 const r1=step(r0.state,tree,view,{expanded:new Set([card]),heights:{[card]:L.CARD_HEIGHT+160},pinned:A,relayout:true})
 return {tree,view,r0,r1,A,card}
}
test('WU-17: expanding a card keeps its family, moves only families below it that overlap horizontally',()=>{
 const {r0,r1,A}=expandFixture()
 const before=ys(r0.state),after=ys(r1.state)
 const a0=[...r0.state.packed!.families.values()].find(f=>f.box.id===A)!
 const a1=[...r1.state.packed!.families.values()].find(f=>f.box.id===A)!
 assert.equal(a1.box.h,a0.box.h+160)
 assert.equal(after.get(A),before.get(A))
 const moved=[...after].filter(([id,y])=>y!==before.get(id)).map(([id])=>id)
 assert.ok(moved.length>=1,'a family below A moved down')
 for(const id of moved){
  const f=r1.state.packed!.families.get(id)!
  assert.ok(f.box.left<a1.box.right&&a1.box.left<f.box.right,`${id} overlaps A horizontally`)
  assert.ok(before.get(id)!>before.get(A)!,`${id} was below A`)
  assert.ok(after.get(id)!>before.get(id)!,`${id} moved down`)
 }
 noOverlap(boxes(r1.state))
 assert.equal(r1.packMode,'incremental')
})
test('WU-18: collapsing the card returns every family to its home y',()=>{
 const {tree,view,r0,r1,A}=expandFixture()
 const r2=step(r1.state,tree,view,{expanded:new Set(),heights:{},pinned:A,relayout:true})
 assert.deepEqual(ys(r2.state),ys(r0.state))
 for(const f of r2.state.packed!.families.values())assert.equal(f.y,f.home)
})

/** Ancient families 200 000 years before the modern ones. */
const ANCIENT=-200000*ERA_YEAR_HOURS
function farTree(){return treeOf(plan([...famEvents(12,ANCIENT,'a'),...famEvents(30,0,'m')],FIXED24))}
test('WU-19: across a 200 000-year gap CSS values stay below 10⁶ + 7 × viewport and new families leave old ones alone',()=>{
 const tree=farTree(),span=20*24
 let r=step(L.emptyTimeline(),tree,{start:0,span})
 checkCss(r)
 const home=ys(r.state)
 // Pan right past the build range in 10 steps of half a viewport.
 for(let k=1;k<=10;k++){
  r=step(r.state,tree,{start:k*span/2,span});checkCss(r)
  for(const [id,y] of home)if(r.state.packed!.families.get(id)?.built)assert.equal(ys(r.state).get(id),y)
 }
 // Jump to the ancient families and back: new families are packed incrementally.
 r=step(r.state,tree,{start:ANCIENT,span});checkCss(r)
 assert.ok(boxes(r.state).some(b=>b.id.startsWith('a')))
 r=step(r.state,tree,{start:0,span});checkCss(r)
 for(const [id,y] of home)assert.equal(ys(r.state).get(id),y,id)
 assert.ok(r.elements.length>0)
})

test('WU-19b: re-basing keeps every transform below 10⁶ px and brings families back to the same x and y',()=>{
 const tree=farTree(),span=20*24
 const screen=(r:L.TimelineStep)=>new Map(r.elements.filter(e=>e.kind==='card').map(e=>[e.id,{x:e.left+r.translateX,y:e.top}]))
 const transforms:number[]=[]
 const go=(st:L.TimelineState,view:{start:number;span:number})=>{const r=step(st,tree,view);transforms.push(r.translateX);checkCss(r);return r}
 const modern={start:3*24,span}
 const r0=go(L.emptyTimeline(),modern),s0=screen(r0)
 // ① minimap click: one frame to the ancient end and back; ② directory to ancient, search back to modern.
 for(const ancient of [ANCIENT,ANCIENT+5*24]){
  const far=go(r0.state,{start:ancient,span})
  assert.ok(far.rebased)
  assert.ok(far.elements.some(e=>e.family.startsWith('a')))
  noOverlap(boxes(far.state))
  const back=go(far.state,modern),s1=screen(back)
  for(const [id,p] of s0){const q=s1.get(id)!;assert.ok(Math.abs(q.x-p.x)<1,`${id} x`);assert.equal(q.y,p.y,`${id} y`)}
  noOverlap(boxes(back.state))
 }
 // ③ locateEvent narrows the window: a new scale repacks and re-bases at the window start.
 const far=go(r0.state,{start:ANCIENT+24,span})
 const narrow=go(far.state,{start:ANCIENT+24,span:span/4})
 assert.equal(narrow.packMode,'full');assert.equal(narrow.state.base,ANCIENT+24);assert.equal(narrow.translateX,0)
 noOverlap(boxes(narrow.state))
 for(const t of transforms)assert.ok(Math.abs(t)<1e6,`transform ${t}`)
 // Distinct families never share one x and y.
 const seen=new Set<string>()
 for(const e of narrow.elements.filter(e=>e.kind==='card'&&e.depth===0)){const k=`${Math.round(e.left)}:${e.top}`;assert.ok(!seen.has(k),k);seen.add(k)}
})

/** WU-19e data: a root from the ancient past to now, a parent across two eras, an open bar and a character lane. */
function clipTree(){
 const ERA2=0
 return treeOf(plan([
  {id:'long',at:ANCIENT,dur:-ANCIENT+30*24},
  {id:'cross',at:ERA2-10*24,dur:20*24},{id:'crossOld',at:ERA2-9*24,parent:'cross'},{id:'crossNew',at:ERA2+5*24,parent:'cross'},
  {id:'farChild',at:ANCIENT+24,parent:'long'},{id:'nowChild',at:2*24,parent:'long'},
  {id:'open',at:24,ongoing:true},
 ],FIXED24))
}
const lane=[{id:'lane1',start:ANCIENT,end:null,top:0,height:40},{id:'lane2',start:3*24,end:4*24,top:0,height:40}]
test('WU-19e: every element is converted and clipped on its own, with the clip labels',()=>{
 const tree=clipTree(),span=24*24 /* day-level zoom */
 const r=step(L.emptyTimeline(),tree,{start:-3*24,span},{lane})
 checkCss(r)
 const el=(id:string,kind?:string)=>r.elements.filter(e=>e.id===id&&(!kind||e.kind===kind))
 const longCard=el('long','card')[0],longTrack=el('long','track')[0]
 assert.ok(longTrack.clippedStart,'long track starts out of view')
 assert.equal(longTrack.startLabel,L.CLIP_START_LABEL)
 assert.ok(longCard.clippedStart)
 assert.equal(el('farChild').length,0,'a child far outside the build range is not rendered')
 assert.equal(el('nowChild','card').length,1)
 assert.ok(el('crossOld','card').length===1&&el('crossNew','card').length===1)
 const openBar=el('open','bar')[0]
 assert.ok(openBar.clippedEnd);assert.equal(openBar.endLabel,L.CLIP_END_LABEL)
 assert.equal(openBar.left+openBar.width,r.range.right,'an open bar ends at the right edge of R')
 const l1=r.elements.find(e=>e.id==='lane1')!,l2=r.elements.find(e=>e.id==='lane2')!
 assert.ok(l1.clippedStart&&l1.clippedEnd);assert.equal(l2.clippedStart,false)
 assert.ok(l1.top>=Math.max(...boxes(r.state).map(b=>b.y+b.h)),'the lane sits below all families')
 for(const e of r.elements){assert.ok(e.left>=r.range.left-1e-6&&e.left+e.width<=r.range.right+1e-6,`${e.id} inside R`)}
})
test('WU-19f: collisions use unclipped world boxes, so panning 3 viewports and back keeps every y',()=>{
 const tree=clipTree(),span=24*24
 let r=step(L.emptyTimeline(),tree,{start:-3*24,span},{lane})
 const before=ys(r.state)
 for(let k=1;k<=6;k++){r=step(r.state,tree,{start:-3*24+k*span/2,span},{lane});checkCss(r)}
 for(let k=5;k>=0;k--){r=step(r.state,tree,{start:-3*24+k*span/2,span},{lane});checkCss(r)}
 for(const [id,y] of before)assert.equal(ys(r.state).get(id),y,id)
})
test('WU-19g: a zero-width (hidden) panel never packs, and the restored panel keeps home y',()=>{
 const tree=treeOf(plan(famEvents(30),FIXED24)),view={start:0,span:20*24}
 const r0=step(L.emptyTimeline(),tree,view)
 let st=r0.state,packs=0
 for(let k=0;k<5;k++){const r=L.timelineStep(st,{tree,view:{start:k*24,span:view.span},width:0});if(r.packMode!==null)packs++;st=r.state}
 assert.equal(packs,0)
 const back=step(st,tree,view)
 assert.notEqual(back.packMode,'full')
 assert.deepEqual(ys(back.state),ys(r0.state))
 for(const f of back.state.packed!.families.values())assert.equal(f.y,f.home)
})

test('WU-19h: initial and reset windows use the dense fit only with eras; 全部时期 always fits everything',()=>{
 assert.equal(L.windowFitter(ERA_CAL,'initial'),fitDenseTimelineWindow)
 assert.equal(L.windowFitter(ERA_CAL,'reset'),fitDenseTimelineWindow)
 assert.equal(L.windowFitter(ERA_CAL,'all'),fitTimelineWindow)
 for(const c of [PLAIN_CAL,FIXED24])for(const m of ['initial','reset','all'] as const)assert.equal(L.windowFitter(c,m),fitTimelineWindow)
})


test('WU-20: minimapModel gives each segment width ∝ its count, a 14px gap, and inverse toX/toT',()=>{
 const f=F885(),tree=treeOf(f.data),era=L.createCalendarAdapter(ERA_CAL)
 // F885 roots in two segments: 34 ancient (in one year) and 851 recent.
 const m=L.minimapModel(tree.roots,420,era)
 assert.equal(m.segments.length,2)
 assert.deepEqual(m.segments.map(g=>g.count),[34,851])
 const N=885
 m.segments.forEach(g=>assert.ok(Math.abs(g.width-(420-14)*g.count/N)<=1,`width ${g.width}`))
 assert.ok(Math.abs(m.segments[1].x0-(m.segments[0].x0+m.segments[0].width)-14)<1e-9)
 assert.equal(m.segments[0].x0,0);assert.ok(Math.abs(m.segments[1].x0+m.segments[1].width-420)<1e-9)
 for(const e of f.events){const t=e.at!;assert.ok(Math.abs(m.toT(m.toX(t))-t)<1,`${e.id}`)}
 const viewSpan=20*24,first=Math.min(...f.events.map(e=>e.at!))
 assert.ok(Math.abs(m.toT(0)-first)<=viewSpan)
 // toX is monotonic and clamps to [0, 420].
 assert.equal(m.toX(-1e15),0);assert.equal(m.toX(1e15),420)
 let last=-1
 for(let x=0;x<=420;x+=3){const t=m.toT(x);assert.ok(t>=last);last=t}
})

test('WU-21: matchEvent needs every term somewhere in the title, fact, names, type, time.label or formatted time',()=>{
 const d=plan([
  {id:'a',at:D5(1349,6,1),precision:'day',title:'码头夜袭',fact:'艾伦带人冲上码头。',category:'冲突',people:['c1'],label:'Night Raid'},
  {id:'b',at:D5(1349,6,2),precision:'day',title:'码头交易',category:'谋划'},
  {id:'c',at:D5(1348,3,1),precision:'day',title:'旧事',fact:''},
 ])
 const era=L.createCalendarAdapter(ERA_CAL)
 const ctx:L.MatchContext={adapter:era,names:new Map([['c1','艾伦']])}
 const ev=(id:string)=>d.events.find(e=>e.id===id)!
 const hit=(id:string,q:string)=>L.matchEvent(ev(id),L.searchTerms(q),ctx)
 assert.deepEqual(L.searchTerms('  码头   冲突 '),['码头','冲突'])
 assert.equal(hit('a','码头 冲突'),true);assert.equal(hit('b','码头 冲突'),false,'both terms must appear')
 assert.equal(hit('b','码头'),true)
 const people=plan([{id:'p',at:0,title:'夜谈',people:['c1']}]).events[0]
 assert.equal(L.matchEvent(people,['艾伦'],ctx),true,'character name')
 assert.equal(hit('a','night raid'),true);assert.equal(hit('a','NIGHT'),true,'english ignores case')
 assert.equal(hit('a','raid 冲突'),true,'time.label plus category')
 assert.equal(hit('c','1348年'),true,'formatted time');assert.equal(hit('a','1348年'),false)
 assert.equal(hit('a','1349年6月1日'),true)
 assert.equal(L.matchEvent(ev('a'),[],ctx),true,'no terms match everything')
})

test('WU-21b: dimmedBy fades events hidden by type or missed by the search (either one)',()=>{
 const d=plan([
  {id:'fight',at:0,title:'码头冲突',category:'冲突'},{id:'deal',at:24,title:'码头交易',category:'谋划'},
  {id:'walk',at:48,title:'街头散步',category:'其他'},{id:'fightFar',at:72,title:'山顶对决',category:'冲突'},
 ],FIXED24)
 const ctx:L.MatchContext={adapter:L.createCalendarAdapter(FIXED24),names:new Map()}
 const filter:L.DimFilter={hidden:new Set(['冲突']),terms:L.searchTerms('码头'),ctx}
 const dim=Object.fromEntries(d.events.map(e=>[e.id,L.dimmedBy(e,filter)]))
 assert.deepEqual(dim,{fight:true,deal:false,walk:true,fightFar:true})
 assert.equal(L.dimmedBy(d.events[0],{hidden:new Set(),terms:[],ctx}),false)
 assert.equal(L.dimmedBy(d.events[2],{hidden:new Set(['冲突']),terms:[],ctx}),false)
})

test('CATEGORY_VAR maps every category to its own --event-* variable',()=>{
 const vars=Object.values(L.CATEGORY_VAR)
 assert.equal(new Set(vars).size,7)
 assert.ok(vars.every(v=>/^--event-[a-z]+$/.test(v)))
 assert.equal(L.CATEGORY_VAR['冲突'],'--event-conflict');assert.equal(L.CATEGORY_VAR['其他'],'--event-other')
 // The library file has no colour literals (WU-79b scope starts here).
 const src=readFileSync(new URL('../../src/lib/planning/worldline-layout.ts',import.meta.url),'utf8')
 assert.equal(/#[0-9a-f]{3,8}\b|rgb\(/i.test(src),false)
})

/** F885: 851 events over 第五纪1348–1350 and 34 ancient ones in 第四纪, about 200 000 years apart. */
function F885(){
 const events:Ev[]=[]
 const d0=civilDays(1348,1,1),span=civilDays(1351,1,1)-d0-1
 for(let i=0;i<851;i++)events.push({id:`n${i}`,at:FIFTH+(d0+Math.floor(i*span/851))*H+(i%3)*6,precision:'day',title:`近事${i}`,category:['冲突','揭示','其他'][i%3],importance:1+(i%7===0?2:i%5===0?1:0)})
 for(let i=0;i<34;i++)events.push({id:`a${i}`,at:D4(5,1,1)+i*10*H,precision:'year',title:`远古${i}`})
 return {data:plan(events,ERA_CAL),events}
}

/* docs/583 R1: collapsed timeline card width follows the title, from the rendered head (CW-01 … CW-05). */
const cw=(o:Partial<L.CollapsedCardInput>={})=>L.collapsedCardWidth({title:'',depth:0,importance:1,avatars:0,more:0,kids:null,...o})
test('CW-01: a longer title gives a wider card until the cap; a 4-character root title is narrower than 260',()=>{
 let last=0
 for(let n=1;n<=40;n++){const w=cw({title:'事'.repeat(n)});if(w>L.COLLAPSED_MIN_WIDTH&&w<L.ROOT_CARD_WIDTH)assert.ok(w>last,`n=${n} ${w}<=${last}`);else assert.ok(w===L.COLLAPSED_MIN_WIDTH||w===L.ROOT_CARD_WIDTH,`n=${n} ${w}`);assert.ok(w>=last);last=w}
 assert.ok(cw({title:'事'.repeat(10)})>L.COLLAPSED_MIN_WIDTH&&cw({title:'事'.repeat(10)})<L.ROOT_CARD_WIDTH,'10 characters lie between the bounds')
 assert.ok(cw({title:'王立大学'})<260)
 assert.ok(cw({title:'a'.repeat(16)})<cw({title:'事'.repeat(16)}),'latin is narrower than CJK')
})
test('CW-02: caps at 340 (root) and 300 (child); an empty title is the 150 minimum',()=>{
 assert.equal(L.ROOT_CARD_WIDTH,340);assert.equal(L.CHILD_CARD_WIDTH,300)
 assert.equal(cw({title:'长'.repeat(80)}),340)
 assert.equal(cw({title:'长'.repeat(80),depth:1}),300)
 assert.equal(cw({title:''}),L.COLLAPSED_MIN_WIDTH);assert.equal(L.COLLAPSED_MIN_WIDTH,150)
})
test('CW-03: head parts add their CSS widths plus one 9px gap each',()=>{
 const title='港口商会签下秘密契约'
 const base=cw({title})
 // fold button 20 + badge (14 padding + 2 border + ▸ 11 + space 3.5 + digits 6.2 each) + 2 gaps.
 assert.ok(Math.abs(cw({title,kids:5})-base-(20+9+(16+11+3.5+6.2)+9))<=1,`kids ${cw({title,kids:5})-base}`)
 const kidsW=cw({title,kids:5}),kids12=cw({title,kids:12})
 assert.ok(kids12>kidsW,'two digits are wider')
 // avatars: 4 left padding + 16 + 11 per extra, plus one gap.
 assert.equal(cw({title,avatars:1})-base,4+16+9)
 assert.equal(cw({title,avatars:3})-base,4+16+2*11+9)
 assert.equal(cw({title,avatars:3,more:2})-cw({title,avatars:3}),11)
 assert.equal(cw({title:'长'.repeat(80),avatars:3,more:2,kids:9}),340)
})
test('CW-04: buildFamilies uses widthOf for collapsed leaves; open 420; parents at least max(own, 260)',()=>{
 const d=plan([{id:'p',at:0,title:'父事件'},{id:'c',at:2,parent:'p',title:'很短'},{id:'solo',at:500,title:'一个独立的根事件'}],FIXED24)
 const tree=treeOf(d),scale=1
 const widthOf=(n:L.TreeNode)=>L.collapsedCardWidth(L.collapsedCardInput(n,[],tree))
 const fams=L.buildFamilies(tree.roots,{scale,widthOf})
 const card=(id:string)=>fams.flatMap(f=>f.pieces).find(p=>p.kind==='card'&&p.id===id)!
 assert.equal(card('c').width,widthOf(tree.byId.get('c')!))
 assert.equal(card('solo').width,widthOf(tree.byId.get('solo')!))
 assert.ok(card('p').width>=Math.max(widthOf(tree.byId.get('p')!),L.PARENT_BAR_MIN_WIDTH))
 const open=L.buildFamilies(tree.roots,{scale,widthOf,expanded:new Set(['solo'])})
 assert.equal(open.flatMap(f=>f.pieces).find(p=>p.kind==='card'&&p.id==='solo')!.width,L.OPEN_CARD_WIDTH)
})
test('CW-05: people missing from the character list are not counted',()=>{
 const d=plan([{id:'a',at:0,title:'事件',people:['x','y','gone']}],FIXED24)
 const tree=treeOf(d),n=tree.byId.get('a')!
 const chars=[{id:'x'},{id:'y'}]
 assert.deepEqual(L.collapsedCardInput(n,chars,tree),{title:'事件',depth:0,importance:1,avatars:2,more:0,kids:null,expandButton:true})
 assert.equal(L.collapsedCardInput(n,[],tree).avatars,0)
 const many=treeOf(plan([{id:'m',at:0,people:['1','2','3','4','5']}],FIXED24)).byId.get('m')!
 assert.deepEqual([L.collapsedCardInput(many,['1','2','3','4','5'].map(id=>({id})),tree).avatars,L.collapsedCardInput(many,['1','2','3','4','5'].map(id=>({id})),tree).more],[3,2])
})

/* docs/584: the timeline head gains an expand button; a multi-selection shifts by one Δ along anchor chains. */
test('IC-02: a timeline card with the expand button is 33px wider (24px .expand + 9px gap) until the cap',()=>{
 const title='港口商会签下秘密契约'
 assert.equal(cw({title,expandButton:true})-cw({title}),33)
 assert.equal(cw({title:'长'.repeat(80),expandButton:true}),340)
})
test('IC-03: shiftSelection moves only events not anchored (transitively) to another selected event',()=>{
 const anchored=(id:string,anchor:string,value:number)=>({id,line:'w',title:id,fact:'',parent:null,category:'其他',importance:1,people:[],ongoing:false,duration:0,time:{kind:'exact',value,end:null,precision:'hour',label:'',anchor,boundary:'start'}})
 const base=plan([{id:'A',at:100},{id:'P',at:500},{id:'K',at:520,parent:'P'},{id:'W',at:800,kind:'window',end:900,dur:0}],FIXED24)
 const d=planningSchema.parse({...base,events:[...base.events,anchored('B','A',10),anchored('C','B',5)]})
 const ids=(r:ReturnType<typeof L.shiftSelection>)=>r.moved.map(e=>e.id).sort()
 assert.deepEqual(ids(L.shiftSelection(d,['A','C'],24)),['A'])
 assert.deepEqual(ids(L.shiftSelection(d,['B','C'],24)),['B'])
 assert.deepEqual(ids(L.shiftSelection(d,['P','K'],24)),['K','P'])
 const w=L.shiftSelection(d,['W'],24).moved[0]
 assert.equal(w.time.value,824);assert.equal(w.time.end,924);assert.equal(w.duration,0)
 const ops=L.shiftSelection(d,['A','C','P','K','W'],24).moved.map(value=>({kind:'put',collection:'events',value}))
 applyPlanningOperations(d,ops)
 // The preview set: every moved event plus everything anchored to it, transitively.
 assert.deepEqual([...L.shiftSelection(d,['A','C'],24).follows].sort(),['A','B','C'])
})
