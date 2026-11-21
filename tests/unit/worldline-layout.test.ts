import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import {civilDays,civilFromDays,ERA_YEAR_HOURS} from '../../src/lib/planning/era-calendar'
import {fitTimelineWindow,fitDenseTimelineWindow,formatTime,axisPrecision} from '../../src/lib/planning/timeline'
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
test('WU-19c: tableLayout tops increase, unmeasured expanded cards use the estimate, a scale k stretches roots to min(240, Δt × k)',()=>{
 const f=F885(),tree=treeOf(f.data),era=L.createCalendarAdapter(ERA_CAL)
 const open=new Set(['n10','n11','n12'])
 const heights={n10:120,n11:200}
 // docs/586: F885 roots are about 31 h apart, so k = 3 really stretches.
 for(const zoom of [0,3]){
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
   const extra=Math.max(0,Math.min(240,(roots[i+1].start!-roots[i].start!)*zoom)-a.height-L.CARD_GAP)
   assert.ok(Math.abs(b.top-(a.top+a.height+L.CARD_GAP)-extra)<1e-9,`${roots[i].id}→${roots[i+1].id}`)
   checked++
  }
  assert.ok(checked>800)
 }
 // A large gap is capped at 240 px between block starts; a small one stays stacked.
 const two=treeOf(plan([{id:'a',at:0},{id:'b',at:960},{id:'c',at:972}],FIXED24))
 const z=L.tableLayout(two,{},1,L.createCalendarAdapter(FIXED24))
 assert.equal(z.byId.get('b')!.top-z.byId.get('a')!.top,240)
 assert.equal(z.byId.get('c')!.top-z.byId.get('b')!.top,40)
})

test('WU-19j: layout constants: card 34, gap 6, group padding 10, child indent 18, break 46; docs/588 group header 36 + 4',()=>{
 assert.deepEqual([L.CARD_HEIGHT,L.CARD_GAP,L.GROUP_PADDING,L.TABLE_INDENT,L.TREE_INDENT,L.BREAK_HEIGHT],[34,6,10,18,16,46])
 // Roots 3 days apart, then one 5000 days later: a single break before 'far'.
 const d=plan([{id:'p',at:0,dur:48},{id:'c1',at:6,parent:'p'},{id:'c2',at:12,parent:'p'},{id:'q',at:3*24},{id:'r',at:6*24},{id:'far',at:5000*24}],FIXED24)
 const lay=L.tableLayout(treeOf(d),{},0,L.createCalendarAdapter(FIXED24))
 const c=(id:string)=>lay.byId.get(id)!
 for(const id of ['c1','c2','q','r','far'])assert.equal(c(id).height,34)
 assert.equal(c('p').height,36)
 const g=lay.groups.find(x=>x.id==='p')!
 assert.equal(c('p').top-g.top,0)
 assert.equal(c('c1').top-(c('p').top+36),4);assert.equal(c('c2').top-(c('c1').top+34),6)
 assert.equal(g.bottom-(c('c2').top+34),10)
 assert.equal(c('c1').left-c('p').left,18);assert.equal(c('c2').left,18);assert.equal(c('c1').depth,1)
 assert.equal(lay.breaks.length,1)
 const br=lay.breaks[0]
 assert.equal(c('q').top-g.bottom,6);assert.equal(c('r').top-(c('q').top+34),6)
 assert.equal(br.height,46);assert.equal(br.top,c('r').top+34);assert.equal(c('far').top,br.top+46)
 assert.equal(lay.height,c('far').top+34)
 // Folding drops the children from the layout; docs/592 R5: the parent is a stacked card (40 + 8 peek), no group box.
 const folded=L.tableLayout(treeOf(d),{},0,L.createCalendarAdapter(FIXED24),{folded:new Set(['p'])})
 assert.equal(folded.byId.has('c1'),false)
 assert.equal(folded.groups.length,0);assert.equal(folded.byId.get('p')!.height,48);assert.equal(folded.byId.get('p')!.stacked,true)
})

/** n roots one per `stepDays` days on FIXED24, plus extra events. */
const rowPlan=(n:number,stepDays:number,extra:Ev[]=[],cal:Cal=FIXED24)=>plan([...Array.from({length:n},(_,i)=>({id:`r${i}`,at:i*stepDays*24,precision:'day'})),...extra],cal)
function marksOf(d:PlanningData,cal:Cal,opts:Partial<L.RailOptions>={}){
 const tree=treeOf(d),a=L.createCalendarAdapter(cal)
 const lay=L.tableLayout(tree,{},0,a)
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

test('WU-21b: dimmedBy fades only events missed by the search (docs/591: hidden types are filtered out, not faded)',()=>{
 const d=plan([
  {id:'fight',at:0,title:'码头冲突',category:'冲突'},{id:'deal',at:24,title:'码头交易',category:'谋划'},
  {id:'walk',at:48,title:'街头散步',category:'其他'},{id:'fightFar',at:72,title:'山顶对决',category:'冲突'},
 ],FIXED24)
 const ctx:L.MatchContext={adapter:L.createCalendarAdapter(FIXED24),names:new Map()}
 const filter:L.DimFilter={terms:L.searchTerms('码头'),ctx}
 const dim=Object.fromEntries(d.events.map(e=>[e.id,L.dimmedBy(e,filter)]))
 assert.deepEqual(dim,{fight:false,deal:false,walk:true,fightFar:true})
 assert.equal(L.dimmedBy(d.events[0],{terms:[],ctx}),false)
})

/* docs/591 LF-01..LF-04: the legend filters events out of the views (type and importance). */
test('LF-01: with nothing hidden filterEvents returns the same array',()=>{
 const d=plan([{id:'a',at:0},{id:'b',at:24}],FIXED24)
 assert.equal(L.filterEvents(d.events,{hiddenTypes:new Set(),hiddenImportance:new Set()}),d.events)
})
test('LF-02: hidden types and hidden importance both drop events, together or alone',()=>{
 const d=plan([{id:'f1',at:0,category:'冲突',importance:1},{id:'f3',at:1,category:'冲突',importance:3},{id:'r1',at:2,category:'揭示',importance:1},{id:'r2',at:3,category:'揭示',importance:2}],FIXED24)
 const ids=(t:string[],i:number[])=>L.filterEvents(d.events,{hiddenTypes:new Set(t) as Set<never>,hiddenImportance:new Set(i)}).map(e=>e.id)
 assert.deepEqual(ids(['冲突'],[]),['r1','r2']);assert.deepEqual(ids([],[1]),['f3','r2']);assert.deepEqual(ids(['冲突'],[1]),['r2'])
})
test('LF-03: a hidden parent hides its whole group; a hidden child leaves the parent',()=>{
 const d=plan([{id:'p',at:0,category:'冲突'},{id:'c',at:1,parent:'p',category:'揭示'},{id:'g',at:2,parent:'c',category:'揭示'},{id:'q',at:3,category:'揭示'},{id:'k',at:4,parent:'q',category:'冲突'}],FIXED24)
 assert.deepEqual(L.filterEvents(d.events,{hiddenTypes:new Set(['冲突']),hiddenImportance:new Set()}).map(e=>e.id),['q'])
})
test('LF-04: a parent loop or a missing parent does not hang; such an event is judged on its own',()=>{
 const d=plan([{id:'a',at:0,parent:'b',category:'揭示'},{id:'b',at:1,parent:'a',category:'揭示'},{id:'o',at:2,parent:'gone',category:'揭示'},{id:'x',at:3,parent:'a',category:'冲突'}],FIXED24)
 assert.deepEqual(L.filterEvents(d.events,{hiddenTypes:new Set(['冲突']),hiddenImportance:new Set()}).map(e=>e.id),['a','b','o'])
})

test('LF-05: an event anchored to a hidden event keeps its start in the filtered tree',()=>{
 const anchored={id:'B',line:'w',title:'B',fact:'',parent:null,category:'揭示',importance:1,people:[],ongoing:false,duration:0,time:{kind:'exact',value:10,end:null,precision:'hour',label:'',anchor:'A',boundary:'start'}}
 const base=plan([{id:'A',at:100,category:'冲突'}],FIXED24),d=planningSchema.parse({...base,events:[...base.events,anchored]})
 const shown=L.filterEvents(d.events,{hiddenTypes:new Set(['冲突']),hiddenImportance:new Set()})
 assert.deepEqual(shown.map(e=>e.id),['B'])
 assert.equal(L.eventTree(shown,d).byId.get('B')!.start,L.eventTree(d.events,d).byId.get('B')!.start)
})
test('LF-06: a hidden placed parent also hides its pending child',()=>{
 const d=plan([{id:'p',at:0,category:'冲突'},{id:'c',at:null,parent:'p',category:'揭示'}],FIXED24)
 assert.deepEqual(L.filterEvents(d.events,{hiddenTypes:new Set(['冲突']),hiddenImportance:new Set()}).map(e=>e.id),[])
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

// ---------- docs/585: timeline card stamps one precision finer than the axis ----------
const Y24=8640,M24=720
const ST=(a:L.CalendarAdapter,v:number,axis:'year'|'month'|'day'|'hour',precision:string,kind:'exact'|'window'='exact')=>a.stamp(v,axis,{kind,precision:precision as any})
test('TS-01: axisPrecision boundaries per calendar',()=>{
 const ap=(s:number,c:Cal)=>axisPrecision(s,c)
 assert.equal(ap(3*ERA_YEAR_HOURS,ERA_CAL),'year');assert.equal(ap(3*ERA_YEAR_HOURS-1,ERA_CAL),'month')
 assert.equal(ap(2160,ERA_CAL),'month');assert.equal(ap(2159,ERA_CAL),'day')
 assert.equal(ap(48,ERA_CAL),'day');assert.equal(ap(47,ERA_CAL),'hour')
 assert.equal(ap(3*Y24+1,FIXED24),'year');assert.equal(ap(3*Y24,FIXED24),'month')
 assert.equal(ap(3*M24+1,FIXED24),'month');assert.equal(ap(3*M24,FIXED24),'day')
 assert.equal(ap(73,FIXED24),'day');assert.equal(ap(72,FIXED24),'hour')
 assert.equal(ap(10*Y24,{...FIXED24,monthsPerYear:null}),'month')
 assert.equal(ap(3*ERA_YEAR_HOURS,PLAIN_CAL),'year');assert.equal(ap(2160,PLAIN_CAL),'month');assert.equal(ap(2159,PLAIN_CAL),'day')
 assert.equal(ap(48,PLAIN_CAL),'day');assert.equal(ap(47,PLAIN_CAL),'hour')
 assert.equal(ap(1,{kind:'years',epoch:'',hoursPerDay:24,daysPerMonth:30,monthsPerYear:12,eras:[]}),'year')
})
test('TS-02: era-calendar labels are unchanged below 48 hours',()=>{
 assert.equal(formatTime(D5(1349,6,12)+5,ERA_CAL,24),'第五纪1349年6月12日')
 assert.equal(formatTime(D5(1349,6,12)+5,ERA_CAL,24*100),'第五纪1349年6月')
})
test('TS-03/04/05: era calendar stamps by axis and recorded precision',()=>{
 const a=L.createCalendarAdapter(ERA_CAL),d=D5(1349,6,12)
 assert.equal(ST(a,d,'year','year'),'约1349年6月');assert.equal(ST(a,d,'year','day'),'1349年6月')
 assert.equal(ST(a,d,'month','month'),'约1349年6月12日');assert.equal(ST(a,d,'month','day'),'1349年6月12日')
 assert.equal(ST(a,d+14,'day','hour'),'1349年6月12日 14:00');assert.equal(ST(a,d+14.5,'day','hour'),'1349年6月12日 14:30')
 assert.equal(ST(a,d,'day','day'),'1349年6月12日')
 assert.equal(ST(a,d+9,'day','day'),'约1349年6月12日上午');assert.equal(ST(a,d+15,'day','day'),'约1349年6月12日下午')
 assert.equal(ST(a,d,'day','month'),'约1349年6月12日')
 assert.equal(ST(a,d+3,'hour','hour'),'1349年6月12日 03:00')
})
test('TS-05b: noise, minute truncation and the era year cap',()=>{
 const a=L.createCalendarAdapter(ERA_CAL),d=D5(1349,6,12)
 assert.equal(ST(a,d+23+59.7/60,'day','hour'),'1349年6月12日 23:59')
 assert.equal(ST(a,d-1e-7,'day','day'),'1349年6月12日')
 const far=FIFTH+civilDays(1_000_001,1,1)*H
 assert.equal(ST(a,far,'year','year'),'第五纪1000000年后')
})
test('TS-06: fixed calendar halves and missing years',()=>{
 const f20=L.createCalendarAdapter({...FIXED24,hoursPerDay:20}),d=5*600+11*20
 assert.equal(ST(f20,d+9,'day','day'),'约1年6月12日上午');assert.equal(ST(f20,d+10,'day','day'),'约1年6月12日下午')
 const noYear=L.createCalendarAdapter({...FIXED24,monthsPerYear:null})
 assert.equal(ST(noYear,5*M24+11*24,'month','day'),'6月12日')
})
test('TS-07: a window event always reads 约',()=>{
 const a=L.createCalendarAdapter(ERA_CAL)
 assert.equal(ST(a,D5(1349,6,12)+14,'year','hour','window'),'约1349年6月')
})
test('TS-08: unmapped and years calendars keep the short() text',()=>{
 const un=L.createCalendarAdapter(FIXED24,{calendar:FIXED24,scale:1,zero:null})
 assert.equal(ST(un,100,'year','day'),'未映射')
 const yc:Cal={kind:'years',epoch:'',hoursPerDay:24,daysPerMonth:30,monthsPerYear:12,eras:[]},ya=L.createCalendarAdapter(yc)
 assert.equal(ST(ya,12.5,'year','day'),ya.short(12.5,'day'))
})
test('TS-09: a scaled time base matches the base calendar and absorbs float noise',()=>{
 // zero 0.4: month 5's start (1年6月1日, 3600 h) converts back to 3599.9999999999995; zero 0.7: 1年1月5日 14:00 (110 h)
 // converts back to 109.99999999999999. Both are asserted noisy first, so the case really tests the de-noising.
 const a=L.createCalendarAdapter(FIXED24,{calendar:FIXED24,scale:3,zero:0.4})
 for(const s of [10,100,3000,40000])assert.equal(a.axisPrecision(s),axisPrecision(3*s,FIXED24))
 const v=(3600-0.4)/3
 assert.ok(a.toDisplay(v)!<3600,'the conversion really is noisy')
 assert.equal(ST(a,v,'day','day'),'1年6月1日')
 const b=L.createCalendarAdapter(FIXED24,{calendar:FIXED24,scale:3,zero:0.7}),w=(110-0.7)/3
 assert.ok(b.toDisplay(w)!<110,'the conversion really is noisy')
 assert.equal(ST(b,w,'day','hour'),'1年1月5日 14:00')
})
test('TS-09b: a fixed-calendar month start minus noise reads the new month',()=>{
 assert.equal(ST(L.createCalendarAdapter(FIXED24),720-1e-7,'month','day'),'1年2月1日')
})
test('TS-10: familyStampEnd picks the node that gives the family end; ties go to the parent, then the finest',()=>{
 const t1=treeOf(plan([{id:'p',at:D5(1349,6,12),precision:'day'},{id:'c',at:D5(1349,6,12)+6,precision:'month',parent:'p'}]))
 const e1=L.familyStampEnd(t1.byId.get('p')!);assert.equal(e1.by.id,'c');assert.equal(e1.end,D5(1349,6,12)+6)
 const t2=treeOf(plan([{id:'p',at:D5(1349,6,1),dur:240,precision:'day'},{id:'c',at:D5(1349,6,5),dur:144,precision:'month',parent:'p'}]))
 assert.equal(L.familyStampEnd(t2.byId.get('p')!).by.id,'p')
 const t3=treeOf(plan([{id:'p',at:D5(1349,6,1),precision:'day'},{id:'a',at:D5(1349,6,1)+6,precision:'month',parent:'p'},{id:'b',at:D5(1349,6,1)+6,precision:'hour',parent:'p'}]))
 assert.equal(L.familyStampEnd(t3.byId.get('p')!).by.id,'b')
})
test('TS-11: a fractional hoursPerDay keeps whole minutes',()=>{
 const a=L.createCalendarAdapter({...FIXED24,hoursPerDay:24.31})
 assert.equal(ST(a,24.3,'day','hour'),'1年1月1日 24:18') // 24.3 h = 1458 min; the day holds 1458.6, so the last whole minute is 1458
 const b=L.createCalendarAdapter({...FIXED24,hoursPerDay:0.01})
 assert.match(ST(b,0.005,'day','hour'),/ 00:00$/)
})
test('TS-12: plain gregorian stamps',()=>{
 const a=L.createCalendarAdapter({...PLAIN_CAL,epoch:'2026-01-01T00:00:00Z'})
 assert.equal(ST(a,14,'day','hour'),'2026年1月1日 14:00')
 assert.equal(ST(a,24*9+15,'day','day'),'约2026年1月10日下午')
 assert.equal(ST(a,24*40,'year','day'),'2026年2月')
})
test('TS-13: an unmapped time base reads hour precision on the axis',()=>{
 assert.equal(L.createCalendarAdapter(FIXED24,{calendar:FIXED24,scale:1,zero:null}).axisPrecision(1e6),'hour')
})

// ---------- docs/586: event-table rail labels follow the zoom (time stretch) ----------
const RT=(a:L.CalendarAdapter,v:number,level:L.RailLevel,precision:string,o:{kind?:'exact'|'window';compact?:boolean}={})=>a.railText(v,level,{kind:o.kind??'exact',precision:precision as any},o.compact??false)
const gaps=(lay:L.TableLayout,ids:string[])=>ids.slice(1).map((id,i)=>lay.byId.get(id)!.top-lay.byId.get(ids[i])!.top)
test('RL-01: railLevel boundaries per calendar, with a float tolerance',()=>{
 const era=L.createCalendarAdapter(ERA_CAL),f=L.createCalendarAdapter(FIXED24)
 assert.equal(L.railLevel(18/744,era),'month');assert.equal(L.railLevel(18/744-1e-9,era),'year')
 assert.equal(L.railLevel(0.75,era),'day');assert.equal(L.railLevel(0.7499,era),'month')
 assert.equal(L.railLevel(1.5,era),'half');assert.equal(L.railLevel(1.4999,era),'day')
 assert.equal(L.railLevel(18,era),'minute');assert.equal(L.railLevel(17.99,era),'half')
 assert.equal(L.railLevel(18/720,f),'month');assert.equal(L.railLevel(0.75,f),'day')
 const noYear=L.createCalendarAdapter({...FIXED24,monthsPerYear:null})
 assert.equal(L.railLevel(0.75,noYear),'day');assert.equal(L.railLevel(1e-6,noYear),'month')
 assert.equal(L.railLevel(1,L.createCalendarAdapter({...FIXED24,daysPerMonth:null})),null)
 assert.equal(L.railLevel(1,L.createCalendarAdapter({kind:'years',epoch:'',hoursPerDay:24,daysPerMonth:30,monthsPerYear:12,eras:[]})),null)
 assert.equal(L.railLevel(1,L.createCalendarAdapter(FIXED24,{calendar:FIXED24,scale:1,zero:null})),null)
 const based=L.createCalendarAdapter(FIXED24,{calendar:ERA_CAL,scale:3,zero:FIFTH})
 for(const k of [0.001,0.05,0.3,2,4,9,40,80])assert.equal(L.railLevel(k,based),L.railLevel(k/3,era),`k ${k}`)
 assert.equal(L.railLevel(18/744*3,based),'month')
})
test('RL-02: the stretch layout takes max(stacked, previous block + min(240, Δt·k)) per block start',()=>{
 const a=L.createCalendarAdapter(FIXED24),ids=Array.from({length:20},(_,i)=>`r${i}`)
 const even=treeOf(rowPlan(20,2))
 assert.deepEqual(L.tableLayout(even,{},0,a),L.tableLayout(even,{},-1,a))
 for(const [k,gap] of [[0,40],[40/48,40],[80/48,80],[6,240],[20/48,40]] as const)
  assert.ok(gaps(L.tableLayout(even,{},k,a),ids).every(g=>Math.abs(g-gap)<1e-9),`k ${k}`)
 // Uneven: 18 gaps of 48 h, then 480 h (no break: the limit is max(720, 20 × 48)).
 const uneven=treeOf(plan([...Array.from({length:19},(_,i)=>({id:`r${i}`,at:i*48,precision:'day'})),{id:'r19',at:18*48+480,precision:'day'}],FIXED24))
 const fit=L.tableZoomBounds(uneven,a).fit
 assert.ok(Math.abs(fit-19*40/1344)<1e-12)
 const g=gaps(L.tableLayout(uneven,{},fit,a),ids)
 assert.ok(g.slice(0,18).every(x=>Math.abs(x-40)<1e-9));assert.equal(g[18],240)
  // A grouped root: p (0 h) with children at 6 h and 12 h is 124 px high (docs/588: 36 + 4 + 34 + 6 + 34 + 10); q at 72 h.
 const grouped=treeOf(plan([{id:'p',at:0,dur:24},{id:'c1',at:6,parent:'p'},{id:'c2',at:12,parent:'p'},{id:'q',at:72}],FIXED24))
 const qTop=(k:number)=>{const l=L.tableLayout(grouped,{},k,a);return l.byId.get('q')!.top-l.groups[0].top}
 assert.equal(L.tableLayout(grouped,{},0,a).groups[0].bottom-L.tableLayout(grouped,{},0,a).groups[0].top,124)
 assert.equal(qTop(1),130);assert.equal(qTop(3),216);assert.equal(qTop(4),240)
 // An expanded card measured at 120 px.
 const two=treeOf(plan([{id:'a',at:0},{id:'b',at:48}],FIXED24)),open={expanded:new Set(['a'])}
 assert.equal(L.tableLayout(two,{a:120},1,a,open).byId.get('b')!.top,126)
 assert.equal(L.tableLayout(two,{a:120},4,a,open).byId.get('b')!.top,192)
})
test('RL-03: tableZoomBounds gives the reset scale and the zoom range',()=>{
 const even=treeOf(rowPlan(20,2)),b=L.tableZoomBounds(even,L.createCalendarAdapter(FIXED24))
 assert.ok(Math.abs(b.fit-40/48)<1e-12);assert.equal(b.max,60);assert.ok(Math.abs(b.min-18/(8*8640))<1e-15)
 const s3=L.tableZoomBounds(even,L.createCalendarAdapter(FIXED24,{calendar:FIXED24,scale:3,zero:0}))
 assert.ok(Math.abs(s3.fit-40/48)<1e-12);assert.equal(s3.max,180);assert.ok(Math.abs(s3.min-3*18/(8*8640))<1e-15)
 const single=treeOf(plan([{id:'x',at:D5(1349,6,1),precision:'day'}]))
 const era=L.createCalendarAdapter(ERA_CAL),sb=L.tableZoomBounds(single,era)
 assert.equal(sb.fit,18/744);assert.equal(L.railLevel(sb.fit,era),'month')
 assert.ok(Math.abs(sb.min-18/(8*8784))<1e-15)
 const based=L.createCalendarAdapter(ERA_CAL,{calendar:ERA_CAL,scale:3,zero:0}),bb=L.tableZoomBounds(single,based)
 assert.ok(Math.abs(bb.fit-54/744)<1e-15);assert.equal(L.railLevel(bb.fit,based),'month')
 const un=L.tableZoomBounds(even,L.createCalendarAdapter(FIXED24,{calendar:FIXED24,scale:1,zero:null}))
 assert.ok(Math.abs(un.fit-40/48)<1e-12);assert.ok(Math.abs(un.min-un.fit/8)<1e-12);assert.ok(Math.abs(un.max-un.fit*8)<1e-12)
 const yc:Cal={kind:'years',epoch:'',hoursPerDay:24,daysPerMonth:30,monthsPerYear:12,eras:[]}
 const yb=L.tableZoomBounds(treeOf(plan([{id:'a',at:0},{id:'b',at:1},{id:'c',at:2}],yc)),L.createCalendarAdapter(yc))
 assert.ok(Math.abs(yb.fit-40)<1e-12);assert.ok(Math.abs(yb.min-5)<1e-12);assert.ok(Math.abs(yb.max-320)<1e-12)
 assert.deepEqual(L.tableZoomBounds(treeOf(plan([{id:'a',at:0}],yc)),L.createCalendarAdapter(yc)),{fit:0,min:0,max:0})
})
test('RL-04: railText per level, recorded precision, window and narrow rail',()=>{
 const a=L.createCalendarAdapter(ERA_CAL),d=D5(1349,6,12)
 assert.equal(RT(a,d,'year','year'),'1349年')
 assert.equal(RT(a,d,'month','year'),'约1349年6月');assert.equal(RT(a,d,'month','month'),'1349年6月')
 assert.equal(RT(a,d,'day','year'),'约6月12日');assert.equal(RT(a,d,'day','day'),'6月12日')
 assert.equal(RT(a,d+15,'half','day'),'约6月12日下午');assert.equal(RT(a,d+9,'half','day'),'约6月12日上午');assert.equal(RT(a,d,'half','day'),'6月12日')
 assert.equal(RT(a,d,'half','year'),'约6月12日');assert.equal(RT(a,d+14,'half','hour'),'6月12日下午')
 assert.equal(RT(a,d+14.5,'minute','hour'),'6月12日 14:30');assert.equal(RT(a,d+9,'minute','hour'),'6月12日 09:00')
 assert.equal(RT(a,d+23+59.7/60,'minute','hour'),'6月12日 23:59')
 assert.equal(RT(a,d+15,'minute','day'),'约6月12日下午');assert.equal(RT(a,d-1e-5,'minute','day'),'6月12日')
 assert.equal(RT(a,d+14,'day','hour',{kind:'window'}),'约6月12日')
 assert.equal(RT(a,d+15,'half','day',{compact:true}),'约12日下午');assert.equal(RT(a,d+14.5,'minute','hour',{compact:true}),'12日 14:30')
 assert.equal(RT(a,d,'half','year',{compact:true}),'约6月12日');assert.equal(RT(a,d,'day','day',{compact:true}),'6月12日')
 const f20=L.createCalendarAdapter({...FIXED24,hoursPerDay:20}),v=5*600+11*20
 assert.equal(RT(f20,v+9,'half','day'),'约6月12日上午');assert.equal(RT(f20,v+10,'half','day'),'约6月12日下午')
 const plain=L.createCalendarAdapter({...PLAIN_CAL,epoch:'2026-01-01T00:00:00Z'})
 assert.equal(RT(plain,24*9,'day','day'),'1月10日')
 assert.equal(RT(a,D4(80000,6,1),'day','era'),'第四纪')
 assert.equal(a.yearKey(d+5),'1349年');assert.equal(a.yearText(d+5),'第五纪1349年');assert.equal(L.createCalendarAdapter(FIXED24).yearKey(10),'1年')
})
test('RL-05: railVisibility drops repeats of the last visible key, keeps the 18 px rule and the selected label',()=>{
 const vis=(items:L.RailVisibilityItem[])=>L.railVisibility(items)
 assert.deepEqual(vis([{y:0,text:'1349年',badge:true},{y:22,text:'1349年'}]),[false,false])
 assert.deepEqual(vis([{y:0,text:'6月1日'},{y:10,text:'6月2日'},{y:30,text:'6月2日'}]),[true,false,true])
 assert.deepEqual(vis([{y:0,text:'6月'},{y:40,text:'6月',selected:true},{y:80,text:'6月'}]),[true,true,false])
 assert.deepEqual(vis([{y:0,text:''},{y:40,text:'6月'}]),[false,true])
 assert.deepEqual(vis([{y:0,text:'约6月1日'},{y:40,text:'6月1日'}]),[true,false])
 // End to end on a narrow rail: 1月12日下午 and 2月12日下午 share the compact text but not the key.
 const d=plan([{id:'a',at:11*24+15,precision:'day'},{id:'b',at:11*24+15+720,precision:'day'}],FIXED24),a=L.createCalendarAdapter(FIXED24)
 assert.equal(L.railLevel(2,a),'half')
 const lay=L.tableLayout(treeOf(d),{},2,a),m=L.railMarks(lay,lay.segments,a,{level:'half',compact:true})
 assert.deepEqual(m.labels.map(l=>[l.text,l.visible]),[['约12日下午',true],['约12日下午',true]])
})
test('RL-06: railMarks labels and visibility at each level',()=>{
 const a=L.createCalendarAdapter(FIXED24),tree=treeOf(rowPlan(20,2))
 const at=(k:number,level:L.RailLevel)=>{const lay=L.tableLayout(tree,{},k,a);return L.railMarks(lay,lay.segments,a,{level}).labels}
 const days=[...Array.from({length:15},(_,i)=>`1月${1+2*i}日`),...Array.from({length:5},(_,i)=>`2月${1+2*i}日`)]
 for(const [k,level] of [[40/48,'day'],[80/48,'half']] as const){
  assert.equal(L.railLevel(k,a),level)
  const ls=at(k,level);assert.deepEqual(ls.map(l=>l.text),days);assert.ok(ls.every(l=>l.visible&&l.level===level))
 }
 assert.equal(L.railLevel(20/48,a),'month')
 assert.deepEqual(at(20/48,'month').filter(l=>l.visible).map(l=>l.text),['1年1月','1年2月'])
 assert.equal(L.railLevel(0.8/48,a),'year')
 assert.deepEqual(at(0.8/48,'year').filter(l=>l.visible),[])
 const era=L.createCalendarAdapter(ERA_CAL),et=treeOf(plan(Array.from({length:20},(_,i)=>({id:`e${i}`,at:D5(1349,1,1)+i*48,precision:'day'}))))
 const el=L.tableLayout(et,{},0.01,era),em=L.railMarks(el,el.segments,era,{level:'year'})
 assert.equal(em.labels[0].text,'1349年');assert.deepEqual(em.labels.filter(l=>l.visible),[])
})
test('RL-07: without a level railMarks keeps the old labels; era records keep the era name',()=>{
 const d=plan([{id:'old',at:D4(80000,6,1),precision:'era'},{id:'o2',at:D4(80000,9,1),precision:'day'},{id:'new',at:D5(1349,1,1),precision:'day'}])
 const era=L.createCalendarAdapter(ERA_CAL),lay=L.tableLayout(treeOf(d),{},0,era)
 assert.ok(L.railMarks(lay,lay.segments,era).labels.every(l=>l.level===null))
 for(const level of ['year','month','day','half','minute'] as const)
  assert.equal(L.railMarks(lay,lay.segments,era,{level}).labels.find(l=>l.ids.includes('old'))!.text,'第四纪')
})
test('TT-01: directory time always shows month and day, 约 when finer than the record, no year under its header',()=>{
 const a=L.createCalendarAdapter(ERA_CAL),v=D5(1349,6,28)
 assert.equal(a.treeTime(v,'day',true),'6月28日')
 assert.equal(a.treeTime(v,'day',false),'1349年6月28日')
 assert.equal(a.treeTime(v,'month',true),'约6月28日')
 assert.equal(a.treeTime(v,'year',true),'约6月28日')
 assert.equal(a.treeTime(v,'year',false),'约1349年6月28日')
 assert.equal(a.treeTime(v+14+5/60,'hour',true),'6月28日 14:05')
 assert.equal(a.treeTime(v,'era',true),'第五纪')
 const f=L.createCalendarAdapter(FIXED24)
 assert.equal(f.treeTime(3*30*24+4,'day',true),'4月1日')
 const un=L.createCalendarAdapter(FIXED24,{calendar:FIXED24,scale:1,zero:null})
 assert.equal(un.treeTime(100,'day',true),'未映射')
})

/* docs/588 RM-01 … RM-08: group header layout and the aligned rail. Expected values are worked out by hand in docs/588. */
test('RM-01: the parent card is the group header: top of the box, 36 high, children 4px below, box bottom 10px',()=>{
 assert.deepEqual([L.GROUP_HEAD_HEIGHT,L.GROUP_HEAD_GAP,L.GROUP_PADDING],[36,4,10])
 const d=plan([{id:'p',at:0,dur:24},{id:'c1',at:6,parent:'p'},{id:'c2',at:12,parent:'p'},{id:'q',at:72}],FIXED24)
 const a=L.createCalendarAdapter(FIXED24),lay=L.tableLayout(treeOf(d),{},0,a)
 const c=(id:string)=>lay.byId.get(id)!,g=lay.groups[0]
 assert.equal(c('p').top,g.top);assert.equal(c('p').height,36);assert.equal(c('p').head,c('p').top+18);assert.equal(c('p').groupHead,true)
 assert.equal(c('c1').top-c('p').top,40);assert.equal(c('c1').head,c('c1').top+17);assert.equal(c('c1').groupHead,false)
 assert.equal(c('c2').top-c('c1').top,40);assert.equal(g.bottom-c('c2').top,44);assert.equal(g.bottom-g.top,124)
 assert.equal(c('q').top-g.bottom,6);assert.equal(c('q').head,c('q').top+17)
 assert.deepEqual(lay.segments[0].heads.map(h=>h.y),['p','c1','c2','q'].map(id=>c(id).head))
 const folded=L.tableLayout(treeOf(d),{},0,a,{folded:new Set(['p'])})
 // docs/592 R5: a folded parent is a stacked card, not a header box; its head is 20px down.
 assert.equal(folded.groups.length,0);assert.equal(folded.byId.get('p')!.height,48);assert.equal(folded.byId.get('p')!.head,folded.byId.get('p')!.top+20)
 const openP=L.tableLayout(treeOf(d),{p:120},0,a,{expanded:new Set(['p'])})
 assert.equal(openP.byId.get('c1')!.top-openP.byId.get('p')!.top,124);assert.equal(openP.byId.get('p')!.head,openP.byId.get('p')!.top+21)
 const openC=L.tableLayout(treeOf(d),{c1:90},0,a,{expanded:new Set(['c1'])})
 assert.equal(openC.byId.get('c1')!.head,openC.byId.get('c1')!.top+22)
})
test('RM-01b: nested groups keep every adjacent card head at least 39px apart',()=>{
 const d=plan([{id:'p',at:0,dur:24},{id:'c',at:1,dur:2,parent:'p'},{id:'g',at:2,parent:'c'},{id:'d',at:3,parent:'p'}],FIXED24)
 const a=L.createCalendarAdapter(FIXED24),lay=L.tableLayout(treeOf(d),{},0,a)
 const top=(id:string)=>lay.byId.get(id)!.top,head=(id:string)=>lay.byId.get(id)!.head
 assert.deepEqual(['p','c','g','d'].map(top),[0,40,80,130])
 assert.deepEqual(lay.groups.map(x=>[x.id,x.bottom]),[['p',174],['c',124]])
 assert.deepEqual(['p','c','g','d'].map(head),[18,58,97,147])
 const f=L.tableLayout(treeOf(d),{},0,a,{folded:new Set(['c'])})
 // docs/592 R5: folded 'c' is a stacked card at 40 (48 with its peek); 'd' follows after the 6px gap.
 assert.equal(f.groups.some(x=>x.id==='c'),false);assert.equal(f.byId.get('c')!.stacked,true);assert.equal(f.byId.get('c')!.height,48)
 assert.equal(f.byId.get('d')!.top,40+48+6);assert.equal(f.byId.get('d')!.head-f.byId.get('c')!.head,48+6+17-20)
})
const aligned=(d:PlanningData,cal:Cal=ERA_CAL,opts:Partial<L.RailOptions>={},folded?:Set<string>)=>{
 const a=L.createCalendarAdapter(cal),lay=L.tableLayout(treeOf(d),{},0,a,{folded})
 return {a,lay,m:L.alignedRailMarks(lay,a,opts)}
}
const labelOf=(m:L.AlignedRailMarks,id:string)=>m.labels.find(l=>l.ids.includes(id))!
test('RM-02: aligned dots sit on the card heads, one per placed card, no clusters, no ticks',()=>{
 const same=[0,1,2,3,4].map(h=>({id:`s${h}`,at:31*24+h,precision:'day'}))
 const {lay,m}=aligned(plan([...Array.from({length:10},(_,i)=>({id:`r${i}`,at:i*72,precision:'day'})),...same,{id:'u',at:null}],FIXED24),FIXED24)
 const placed=lay.cards.filter(c=>c.start!==null)
 assert.equal(m.dots.length,placed.length)
 for(const c of placed){assert.equal(m.points.get(c.id),c.head);assert.ok(m.dots.some(d=>d.lead===c.id&&d.y===c.head&&!d.cluster&&d.count===1))}
 assert.equal(m.points.has('u'),false);assert.deepEqual(m.ticks,[])
 assert.ok(m.labels.every(l=>l.level===null))
})
test('RM-03: aligned labels read like the event directory (treeTime) and every card shows its date (docs/588 验收); compact keeps months apart',()=>{
 const d=plan([
  {id:'y',at:D5(1340,1,1),precision:'year'},{id:'d1',at:D5(1340,3,2),precision:'day'},{id:'d2',at:D5(1340,3,2)+5,precision:'day'},
  {id:'h',at:D5(1340,4,5)+21,precision:'hour'},{id:'m',at:D5(1340,5,1),precision:'month'},{id:'w',at:D5(1340,6,1),precision:'day',kind:'window',end:D5(1340,6,9)},
 ])
 const {m}=aligned(d)
 assert.equal(labelOf(m,'y').text,'约1月1日');assert.equal(labelOf(m,'y').visible,true)
 assert.equal(labelOf(m,'d1').text,'3月2日');assert.equal(labelOf(m,'d1').visible,true)
 assert.equal(labelOf(m,'d2').text,'3月2日');assert.equal(labelOf(m,'d2').visible,true)
 assert.ok(m.labels.every(l=>l.visible))
 assert.equal(labelOf(m,'h').text,'4月5日 21:00');assert.equal(labelOf(m,'m').text,'约5月1日');assert.equal(labelOf(m,'w').text,'6月1日')
 // Same text as the directory for every card (the directory shows the year header, so yearShown).
 const a=L.createCalendarAdapter(ERA_CAL),dd=treeOf(d)
 for(const l of m.labels){const n=dd.byId.get(l.ids[0])!;assert.equal(l.text,a.treeTime(n.start!,n.event.time.precision??'hour',true),n.id)}
 const era=aligned(plan([{id:'old',at:D4(80000,6,1),precision:'era'},{id:'o2',at:D4(80000,9,1),precision:'day'}]))
 assert.equal(labelOf(era.m,'old').text,'第四纪')
 assert.deepEqual(era.m.badges.filter(b=>b.kind==='year').map(b=>b.text),['第四纪80000年'])
 const c=aligned(plan([{id:'a',at:D5(1340,3,5)+21,precision:'hour'},{id:'b',at:D5(1340,4,5)+21,precision:'hour'}]),ERA_CAL,{compact:true}).m
 assert.deepEqual(c.labels.map(l=>[l.text,l.visible]),[['5日 21:00',true],['5日 21:00',true]])
})
test('RM-04: a card earlier than the segment so far is a step back: ↺, always shown, hollow, one dashed run, no badge',()=>{
 const d=plan([
  {id:'A',at:D5(1340,4,1),dur:300*24,precision:'day'},{id:'A1',at:D5(1340,12,20),parent:'A',precision:'day'},
  {id:'B',at:D5(1340,6,1),dur:240*24,precision:'day'},{id:'B1',at:D5(1340,6,5),parent:'B',precision:'day'},{id:'B2',at:D5(1341,1,3),parent:'B',precision:'day'},
 ])
 const {lay,m}=aligned(d),head=(id:string)=>lay.byId.get(id)!.head
 assert.deepEqual(lay.cards.map(c=>c.id),['A','A1','B','B1','B2'])
 assert.deepEqual(['A','A1','B','B1','B2'].map(id=>labelOf(m,id).back),[false,false,true,true,false])
 assert.equal(labelOf(m,'B').text,'↺ 6月1日');assert.equal(labelOf(m,'B1').text,'↺ 6月5日')
 assert.ok(labelOf(m,'B').visible&&labelOf(m,'B1').visible)
 assert.deepEqual(m.dots.filter(x=>x.back).map(x=>x.lead),['B','B1'])
 assert.deepEqual(m.backs,[{segment:0,top:head('A1'),height:head('B1')-head('A1')}])
 const years=m.badges.filter(b=>b.kind==='year')
 assert.deepEqual(years.map(b=>b.text),['第五纪1340年','第五纪1341年'])
 assert.equal(years[1].y,(head('B1')+head('B2'))/2)
 assert.equal(labelOf(m,'B2').text,'1月3日')
 // A step back into an earlier year carries its year (with the era).
 const e=aligned(plan([{id:'P',at:D5(1339,8,1),dur:400*24,precision:'day'},{id:'P1',at:D5(1340,3,1),parent:'P',precision:'day'},{id:'Q',at:D5(1339,8,14),precision:'day'}])).m
 assert.equal(labelOf(e,'Q').text,'↺ 1339年8月14日')
 // A coarser record reads 约 before its year, as the directory.
 const wq=aligned(plan([{id:'P',at:D5(1339,8,1),dur:400*24,precision:'day'},{id:'P1',at:D5(1340,3,1),parent:'P',precision:'day'},{id:'Q',at:D5(1339,8,14),precision:'month'}])).m
 assert.equal(labelOf(wq,'Q').text,'↺ 约1339年8月14日')
 // Narrow rail (code review M1): a label carrying its year keeps the month and stops there (82px rail).
 const hq=plan([{id:'P',at:D5(1339,8,1),dur:400*24,precision:'day'},{id:'P1',at:D5(1340,3,1),parent:'P',precision:'day'},{id:'Q',at:D5(1339,8,14)+21,precision:'hour'}])
 assert.equal(labelOf(aligned(hq,ERA_CAL,{compact:true}).m,'Q').text,'↺ 1339年8月')
 assert.equal(labelOf(aligned(hq).m,'Q').text,'↺ 1339年8月14日 21:00')
 // A year record stepping back into another year.
 const yq=plan([{id:'P',at:D5(1339,1,1),dur:500*24,precision:'year'},{id:'P1',at:D5(1340,3,1),parent:'P',precision:'day'},{id:'Q',at:D5(1339,1,1),precision:'year'}])
 assert.equal(labelOf(aligned(yq).m,'Q').text,'↺ 约1339年1月1日')
})
test('RM-05b: a segment of era-precision cards only has no year badge',()=>{
 const {m}=aligned(plan([{id:'a',at:D4(80000,6,1),precision:'era'},{id:'b',at:D4(80000,6,1)+48,precision:'era'}]))
 assert.deepEqual(m.badges,[]);assert.deepEqual(m.labels.map(l=>l.text),['第四纪','第四纪']);assert.deepEqual(m.labels.map(l=>l.visible),[true,true])
})
test('RM-05: year badges: the first above the segment, a change of year between the card and the one right above it',()=>{
 const d=plan([{id:'a',at:D5(1340,12,20),precision:'day'},{id:'b',at:D5(1341,1,2),precision:'day'},{id:'c',at:D5(1341,3,1),precision:'year'}])
 const {lay,m}=aligned(d),head=(id:string)=>lay.byId.get(id)!.head
 const years=m.badges.filter(b=>b.kind==='year')
 assert.deepEqual(years.map(b=>[b.text,b.y]),[['第五纪1340年',head('a')-22],['第五纪1341年',(head('a')+head('b'))/2]])
 assert.equal(labelOf(m,'c').text,'约3月1日');assert.equal(labelOf(m,'c').visible,true)
})
test('RM-06: period bars join consecutive cards inside [start, end]; an outside card splits them',()=>{
 const d=plan([0,1,2,3,4,5].map(i=>({id:`r${i}`,at:i*72,precision:'day'})),FIXED24)
 const {lay,m}=aligned(d,FIXED24,{periods:[{id:'p',start:72,end:216},{id:'one',start:360,end:360}]}),head=(id:string)=>lay.byId.get(id)!.head
 assert.deepEqual(m.periods.map(p=>[p.id,p.y0,p.y1]),[['p',head('r1'),head('r3')],['one',head('r5'),head('r5')]])
 const split=aligned(plan([{id:'a',at:0},{id:'b',at:10,parent:'a'},{id:'x',at:5},{id:'c',at:20}],FIXED24),FIXED24,{periods:[{id:'p',start:0,end:30}]})
 assert.equal(split.m.periods.length,1)
 const gap=aligned(d,FIXED24,{periods:[{id:'p',start:72,end:144},{id:'p',start:288,end:null}]}).m
 assert.deepEqual(gap.periods.map(p=>[p.y0,p.y1]),[[head('r1'),head('r2')],[head('r4'),head('r5')]])
})
test('RM-07: two segments: one rail line each over the head range, breaks unchanged',()=>{
 const d=plan([{id:'a',at:0,precision:'day'},{id:'b',at:72,precision:'day'},{id:'far',at:5000*24,precision:'day'},{id:'far2',at:5003*24,precision:'day'}],FIXED24)
 const {lay,m}=aligned(d,FIXED24),head=(id:string)=>lay.byId.get(id)!.head
 assert.deepEqual(m.lines,[{segment:0,top:head('a')-22,height:head('b')-head('a')+44},{segment:1,top:head('far')-22,height:head('far2')-head('far')+44}])
 assert.equal(lay.breaks.length,1)
})
test('RM-08: calendars without months use railLabel; without years no year badge',()=>{
 const yc:Cal={kind:'years',epoch:'',hoursPerDay:24,daysPerMonth:30,monthsPerYear:12,eras:[]}
 const ya=L.createCalendarAdapter(yc),yd=plan([{id:'a',at:1,precision:'year'},{id:'b',at:3,precision:'year'}],yc)
 const ym=aligned(yd,yc).m
 assert.equal(labelOf(ym,'a').text,ya.railLabel(1,'year'))
 const noYear:Cal={...FIXED24,monthsPerYear:null}
 const nm=aligned(plan([{id:'a',at:0,precision:'day'},{id:'b',at:800*24,precision:'day'}],noYear),noYear).m
 assert.equal(nm.badges.filter(b=>b.kind==='year').length,0)
})

/* docs/592 ZP-01 … ZP-16: two-line titles, zoom levels, time points, stacked parents. Expected values follow the plan
 * (docs/592-worldline-card-zoom-stack-plan.md §0–§3), worked out by hand, not read from the implementation. */
const ci=(c:Partial<L.CollapsedCardInput>&{title:string}):L.CollapsedCardInput=>({depth:0,importance:1,avatars:0,more:0,kids:null,expandButton:true,...c})
test('ZP-01: collapsedTitleLines is 1 while the title fits the room, 2 beyond; table chrome differs by avatars, ⌄ and its gap',()=>{
 const tl=ci({title:'短标题'}),w=L.collapsedCardWidth(tl)
 assert.equal(L.collapsedTitleLines(tl,w,'timeline'),1)
 // docs/592 §8: 4px title slack (the real font runs up to 2px wider than the estimate).
 const room=340-L.collapsedHeadChrome(ci({title:''}),'timeline')-4
 const fits=ci({title:'国'.repeat(Math.floor(room/13))}),over=ci({title:'国'.repeat(Math.floor(room/13)+1)})
 assert.equal(L.collapsedTitleLines(fits,340,'timeline'),1)
 assert.equal(L.collapsedTitleLines(over,340,'timeline'),2)
 assert.equal(L.collapsedTitleLines(ci({title:'国'.repeat(30)}),340,'timeline'),2)
 // Table: 18px avatars (16 on the timeline) and no ⌄ expand button (24 + one 9px gap).
 const t2=ci({title:'x',avatars:2,expandButton:false}),l2=ci({title:'x',avatars:2})
 assert.equal(L.collapsedHeadChrome(l2,'timeline')-L.collapsedHeadChrome(t2,'table'),24+9-2*2)
})
test('ZP-01b: a card held at its cap wraps when it fits by less than 4px; a card sized from its own title is one line',()=>{
 const c=ci({title:'国'.repeat(10)}),need=L.collapsedHeadChrome(c,'timeline')+L.titleWidth(c.title)+4
 // Not capped: fits at its own width, wraps below it.
 assert.equal(L.collapsedTitleLines(c,Math.ceil(need),'timeline'),1)
 assert.equal(L.collapsedTitleLines(c,need-1,'timeline'),2)
 // Capped at need + 3 (fits by 3px < 4): wraps; capped at need + 5: one line.
 assert.equal(L.collapsedTitleLines(c,need+3,'timeline',true),2)
 assert.equal(L.collapsedTitleLines(c,need+5,'timeline',true),1)
})
test('ZP-02: collapsedCardHeight: 34/52 card, 40/58 stack, 36/54 group header',()=>{
 assert.deepEqual([L.collapsedCardHeight(1,'card'),L.collapsedCardHeight(2,'card'),L.collapsedCardHeight(1,'stack'),L.collapsedCardHeight(2,'stack'),L.collapsedCardHeight(1,'groupHead'),L.collapsedCardHeight(2,'groupHead')],[34,52,40,58,36,54])
 assert.deepEqual([L.TITLE_LINE,L.STACK_HEAD_HEIGHT,L.STACK_PEEK,L.POINT_HEIGHT],[18,40,8,18])
})
test('ZP-03: tableLayout without widths: every collapsed card 34, headers 36, heads at +17 / +18',()=>{
 const d=plan([{id:'p',at:0,title:'国'.repeat(40)},{id:'c',at:6,parent:'p',title:'国'.repeat(40)},{id:'q',at:72,title:'国'.repeat(40)}],FIXED24)
 const lay=L.tableLayout(treeOf(d),{},0,L.createCalendarAdapter(FIXED24))
 assert.deepEqual(['p','c','q'].map(id=>lay.byId.get(id)!.height),[36,34,34])
 assert.deepEqual(['p','c','q'].map(id=>lay.byId.get(id)!.head-lay.byId.get(id)!.top),[18,17,17])
})
test('ZP-04: tableWidths follows the CSS nesting (wide inset 36, narrow 22, plus the 18px indent per level)',()=>{
 const n=L.tableWidths(350,true)
 assert.deepEqual([n.slot(0),n.group(0),n.slot(1),n.group(1)],[328,328,288,288])
 const w=L.tableWidths(1200,false)
 assert.deepEqual([w.slot(0),w.group(0),w.slot(1),w.group(1)],[880,940,880,886])
})
test('ZP-05: with widths, a 2-line card is 52 and pushes the next 18 down; folded parent 48 stacked at +20; 2-line header 54',()=>{
 const long='国'.repeat(26),short='短'
 const d=plan([{id:'a',at:0,title:long},{id:'b',at:24,title:short},{id:'p',at:48,title:long},{id:'c',at:50,parent:'p',title:short},{id:'f',at:96,title:short},{id:'k',at:97,parent:'f',title:short}],FIXED24)
 const a=L.createCalendarAdapter(FIXED24),widths=L.tableWidths(350,true)
 const lay=L.tableLayout(treeOf(d),{},0,a,{widths,folded:new Set(['f'])})
 const c=(id:string)=>lay.byId.get(id)!
 assert.equal(c('a').height,52);assert.equal(c('b').top,52+6);assert.equal(c('b').height,34)
 assert.equal(c('p').height,54);assert.equal(c('p').head,c('p').top+18);assert.equal(c('c').top,c('p').top+54+4)
 assert.equal(c('f').stacked,true);assert.equal(c('f').height,48);assert.equal(c('f').head,c('f').top+20);assert.equal(lay.groups.some(g=>g.id==='f'),false)
 assert.equal(c('a').lines,2);assert.equal(c('b').lines,1)
})
test('ZP-06: zoomLevel thresholds 160 / 40 / 10 / 2.5 / 0.6 / 0.15 with a 15% way back (docs/593)',()=>{
 assert.deepEqual([200,100,30,5,1,0.3,0.1].map(d=>L.zoomLevel(d,0)),[0,1,2,3,4,5,6])
 assert.equal(L.zoomLevel(0.68,5),5);assert.equal(L.zoomLevel(0.7,5),4)
 assert.equal(L.zoomLevel(0.17,6),6);assert.equal(L.zoomLevel(0.175,6),5)
 assert.equal(L.zoomLevel(Infinity,6),0)
 assert.equal(L.zoomLevel(11,3),3);assert.equal(L.zoomLevel(11.6,3),2)
 assert.equal(L.zoomLevel(45,2),2);assert.equal(L.zoomLevel(46.1,2),1)
 assert.equal(L.zoomLevel(2.8,4),4);assert.equal(L.zoomLevel(2.9,4),3)
 assert.equal(L.zoomLevel(Infinity,4),0)
 assert.equal(L.medianRootGap(treeOf(plan([{id:'a',at:0}],FIXED24))),null)
 // Gaps 10, 30, 60 between roots (the child is not a root): median 30; an even count takes the lower middle (docs/592 research).
 assert.equal(L.medianRootGap(treeOf(plan([{id:'a',at:0},{id:'b',at:10},{id:'c',at:40},{id:'d',at:100},{id:'x',at:41,parent:'a'}],FIXED24))),30)
 assert.equal(L.medianRootGap(treeOf(plan([{id:'a',at:0},{id:'b',at:10},{id:'c',at:40}],FIXED24))),10)
})
test('ZP-07: cardScale: 1 at ≥ 160 and at level 0; 0.75 at ≤ 40; ln between, in 0.05 steps',()=>{
 const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-9,`${a} ≠ ${b}`)
 near(L.cardScale(160,1),1);near(L.cardScale(40,2),0.75);near(L.cardScale(100,1),0.9);near(L.cardScale(120,1),0.95);near(L.cardScale(60,1),0.8)
 near(L.cardScale(1000,0),1);near(L.cardScale(20,0),1)
 for(const d of [41,55,70,90,130,159])assert.ok(Math.abs(L.cardScale(d,1)*20-Math.round(L.cardScale(d,1)*20))<1e-9,`${d}`)
})
test('ZP-08: buildFamilies(scaleCard 0.75) shrinks collapsed cards and family insets; open cards and family gaps stay',()=>{
 const d=plan([{id:'p',at:0,title:'父事件'},{id:'c',at:2,parent:'p',title:'子事件'},{id:'solo',at:500,title:'独立事件'}],FIXED24)
 const tree=treeOf(d),scale=1,widthOf=(n:L.TreeNode)=>L.collapsedCardWidth(L.collapsedCardInput(n,[],tree))
 const piece=(f:L.FamilyBox[],id:string,kind='card')=>f.flatMap(x=>x.pieces).find(p=>p.kind===kind&&p.id===id)!
 const one=L.buildFamilies(tree.roots,{scale,widthOf}),q=L.buildFamilies(tree.roots,{scale,widthOf,scaleCard:0.75})
 assert.ok(Math.abs(piece(q,'solo').width-piece(one,'solo').width*0.75)<=1)
 assert.ok(Math.abs(piece(q,'solo').height-34*0.75)<=1)
 assert.ok(Math.abs(piece(q,'c').top-(piece(one,'c').top*0.75))<=1,'child row offset scales')
 const open=L.buildFamilies(tree.roots,{scale,widthOf,scaleCard:0.75,expanded:new Set(['solo']),heights:{solo:200}})
 assert.equal(piece(open,'solo').width,420);assert.equal(piece(open,'solo').height,200)
})
const zTree=()=>treeOf(plan([
 {id:'n',at:0,importance:1},{id:'m',at:10,importance:2},{id:'k',at:20,importance:3},
 {id:'p',at:30,importance:1},{id:'p1',at:31,parent:'p',importance:2},{id:'p2',at:32,parent:'p',importance:1},
 {id:'q',at:40,importance:1},{id:'q1',at:41,parent:'q',importance:1},
 {id:'r',at:50,importance:2},{id:'r1',at:51,parent:'r',importance:3},
],FIXED24))
const noKeep={cards:new Set<string>(),unfolded:new Set<string>(),showAll:false}
test('ZP-09: level 2: 一般 → points; a 一般 parent with a 重要 child stays a card; kept events and their ancestors are cards; only drawn events count',()=>{
 const t=zTree(),z=L.zoomPlan(t,2,0.75,noKeep)
 // q is a point, so its child q1 is not drawn and not counted (code review P1-1).
 assert.deepEqual([...z.points].sort(),['n','p2','q'])
 const kept=L.zoomPlan(t,2,0.75,{...noKeep,cards:new Set(['q1'])})
 assert.deepEqual([...kept.points].sort(),['n','p2'])
 assert.equal(z.autoFolded.size,0)
 // A family the user folded draws no children, so none of them is a point.
 assert.deepEqual([...L.zoomPlan(t,2,0.75,{...noKeep,folded:new Set(['p'])}).points].sort(),['n','q'])
})
const ids=(s:ReadonlySet<string>)=>[...s].sort()
test('ZP-10: docs/593 levels 4 / 5 / 6: 一般 hidden, then 重要 → points, then 重要 hidden; a parent shows for a shown child',()=>{
 const t=zTree()
 // Level 4: n, q (一般, no shown child) are hidden; p shows for its 重要 child p1 and is a card; card parents fold.
 const a=L.zoomPlan(t,4,0.75,noKeep)
 assert.deepEqual([ids(a.hidden),ids(a.points),ids(a.autoFolded)],[['n','q'],[],['p','r']])
 // Level 5: m and p (its child only 重要) become points; r stays a card for its 关键 child r1.
 const b=L.zoomPlan(t,5,0.75,noKeep)
 assert.deepEqual([ids(b.hidden),ids(b.points),ids(b.autoFolded)],[['n','q'],['m','p'],['r']])
 // Level 6: only 关键 and their ancestors are drawn.
 const c=L.zoomPlan(t,6,0.75,noKeep)
 assert.deepEqual([ids(c.hidden),ids(c.points),ids(c.autoFolded)],[['m','n','p','q'],[],['r']])
})
test('ZP-11: level 3 folds every card parent except unfolded ones and strict ancestors of kept events; folded descendants are not points',()=>{
 const t=zTree(),z=L.zoomPlan(t,3,0.75,noKeep)
 // q is a point (no card to stack), so only the card parents p and r fold.
 assert.deepEqual([...z.autoFolded].sort(),['p','r'])
 assert.deepEqual([...z.points].sort(),['n','q'])
 const u=L.zoomPlan(t,3,0.75,{...noKeep,unfolded:new Set(['q']),cards:new Set(['p2'])})
 assert.deepEqual([...u.autoFolded].sort(),['r'])
 assert.deepEqual([...u.points].sort(),['n','q'])
 // Code review P1-2: a selected parent is not its own ancestor, so it still folds.
 assert.deepEqual([...L.zoomPlan(t,3,0.75,{...noKeep,cards:new Set(['p'])}).autoFolded].sort(),['p','r'])
})
test('ZP-12: showAll empties the points at levels 2–6; below level 2 points, autoFolded, unfolded and showAll are moot',()=>{
 const t=zTree()
 // docs/593: from level 4 the hidden events stay hidden, so fewer parents are drawn to fold (4/5: p, r; 6: r).
 const folds={2:0,3:3,4:2,5:2,6:1} as const
 for(const lv of [2,3,4,5,6] as const){const z=L.zoomPlan(t,lv,0.75,{...noKeep,showAll:true});assert.equal(z.points.size,0,`${lv}`);assert.equal(z.autoFolded.size,folds[lv],`${lv}`)}
 const low=L.zoomPlan(t,1,0.9,{cards:new Set(),unfolded:new Set(['p']),showAll:true})
 assert.equal(low.points.size,0);assert.equal(low.autoFolded.size,0)
})
test('ZP-13: an unchanged plan keeps the previous set objects',()=>{
 const t=zTree(),a=L.zoomPlan(t,3,0.75,noKeep),b=L.zoomPlan(t,3,0.75,{cards:new Set(),unfolded:new Set(),showAll:false},a)
 assert.equal(b.points,a.points);assert.equal(b.autoFolded,a.autoFolded)
 const c=L.zoomPlan(t,2,0.75,noKeep,a)
 assert.notEqual(c.points,a.points)
 const h=L.zoomPlan(t,6,0.75,noKeep),h2=L.zoomPlan(t,6,0.75,noKeep,h)
 assert.equal(h2.hidden,h.hidden);assert.notEqual(L.zoomPlan(t,4,0.75,noKeep,h).hidden,h.hidden)
})
test('ZP-17: zoomBars per level; hide is capped by the highest importance, so a worldline never empties',()=>{
 const b=(lv:L.ZoomLevel,max=3)=>{const x=L.zoomBars(lv,max);return [x.hide,x.bar,x.pointClass]}
 assert.deepEqual([0,1,2,3,4,5,6].map(lv=>b(lv as L.ZoomLevel)),[[0,0,0],[0,0,0],[0,2,1],[0,2,1],[2,2,0],[2,3,2],[3,3,0]])
 assert.deepEqual(b(6,2),[2,3,2]);assert.deepEqual(b(4,2),[2,2,0])
 for(const lv of [4,5,6] as const)assert.deepEqual(b(lv,1),[1,lv===4?2:3,1])
 // Without 关键 (max 2), level 6 keeps the 重要 points of level 5.
 const t=treeOf(plan([{id:'a',at:0,importance:1},{id:'b',at:10,importance:2}],FIXED24))
 const z=L.zoomPlan(t,6,0.75,noKeep)
 assert.deepEqual([ids(z.hidden),ids(z.points)],[['a'],['b']])
})
test('ZP-18: kept events show with their ancestors at level 6; at level 4 an unfolded parent shows its direct children as cards (docs/593 review P1-3)',()=>{
 const t=zTree(),z=L.zoomPlan(t,6,0.75,{...noKeep,cards:new Set(['p2'])})
 assert.ok(!z.hidden.has('p')&&!z.hidden.has('p2')&&!z.points.has('p')&&!z.points.has('p2'))
 assert.ok(!z.autoFolded.has('p'));assert.ok(z.hidden.has('p1'))
 const u=L.zoomPlan(t,4,0.75,{...noKeep,unfolded:new Set(['p'])})
 assert.deepEqual([ids(u.hidden),ids(u.points)],[['n','q'],[]])
 // Level 5: p has no card child left (p1 is 重要), so p itself is a point and the unfold does not apply.
 const v=L.zoomPlan(t,5,0.75,{...noKeep,unfolded:new Set(['p'])})
 assert.deepEqual([ids(v.hidden),ids(v.points)],[['n','q'],['m','p']])
})
test('ZP-19: showAll turns points into cards and leaves the hidden ones hidden',()=>{
 const t=zTree(),z=L.zoomPlan(t,5,0.75,{...noKeep,showAll:true})
 assert.deepEqual([ids(z.hidden),ids(z.points)],[['n','q'],[]])
 assert.deepEqual(ids(L.zoomPlan(t,4,0.75,{...noKeep,showAll:true}).hidden),['n','q'])
})
test('ZP-20: buildFamilies(hidden) skips hidden roots and hidden children; timelineStep draws none of them',()=>{
 const d=plan([{id:'a',at:0,title:'甲'},{id:'b',at:5,title:'乙'},{id:'p',at:10,title:'父'},{id:'c1',at:11,parent:'p'},{id:'c2',at:12,parent:'p'}],FIXED24)
 const tree=treeOf(d),hidden=new Set(['a','c1'])
 const fams=L.buildFamilies(tree.roots,{scale:10,hidden})
 assert.deepEqual(fams.map(f=>f.id).sort(),['b','p'])
 assert.deepEqual(fams.find(f=>f.id==='p')!.pieces.filter(x=>x.kind==='card').map(x=>x.id).sort(),['c2','p'])
 const st=L.timelineStep({packed:null,base:0,build:null} as any,{tree,view:{start:-10,span:40},width:400,hidden})
 const drawn=st.elements.filter(e=>e.kind==='card'||e.kind==='point').map(e=>e.id)
 assert.ok(!drawn.includes('a')&&!drawn.includes('c1')&&drawn.includes('b')&&drawn.includes('c2'),drawn.join())
})
test('ZP-21: a located hidden parent the user unfolds at level 6 draws its children as cards (docs/593 review P1-3)',()=>{
 const t=zTree(),z=L.zoomPlan(t,6,0.75,{...noKeep,cards:new Set(['p']),unfolded:new Set(['p'])})
 assert.ok(!z.autoFolded.has('p'));assert.deepEqual(ids(z.points),[])
 assert.ok(!z.hidden.has('p1')&&!z.hidden.has('p2'))
 assert.ok(L.zoomPlan(t,6,0.75,{...noKeep,cards:new Set(['p'])}).autoFolded.has('p'),'folded again without the exception')
})
test('ZP-14: buildFamilies(points): a root point is its own family, 18 high, centred on its time; child points share rows without overlap',()=>{
 const d=plan([{id:'a',at:100,title:'一个时间点'},{id:'p',at:0,title:'父'},{id:'c1',at:1,parent:'p'},{id:'c2',at:1.5,parent:'p'},{id:'c3',at:2,parent:'p'}],FIXED24)
 const tree=treeOf(d),scale=10,pointWidth=()=>120
 const fams=L.buildFamilies(tree.roots,{scale,points:new Set(['a','c1','c2']),pointWidth})
 const fa=fams.find(f=>f.id==='a')!
 assert.equal(fa.point,true);assert.equal(fa.pieces.length,1)
 assert.deepEqual([fa.pieces[0].kind,fa.pieces[0].wx,fa.pieces[0].height,fa.pieces[0].width],['point',100*scale-6,18,120])
 const kids=fams.find(f=>f.id==='p')!.pieces.filter(p=>p.id.startsWith('c'))
 assert.deepEqual(kids.map(k=>k.kind),['point','point','card'])
 for(const x of kids)for(const y of kids)if(x!==y&&x.top===y.top)assert.ok(x.wx+x.width<=y.wx||y.wx+y.width<=x.wx,`${x.id}/${y.id} overlap`)
})
test('ZP-15: a folded parent is laid out as a leaf: own width, stacked height, no track; a duration bar stays',()=>{
 const d=plan([{id:'p',at:0,dur:600,title:'父事件'},{id:'c',at:500,parent:'p'}],FIXED24)
 const tree=treeOf(d),widthOf=(n:L.TreeNode)=>L.collapsedCardWidth(L.collapsedCardInput(n,[],tree))
 const f=L.buildFamilies(tree.roots,{scale:1,widthOf,folded:new Set(['p']),scaleCard:0.75})[0]
 const card=f.pieces.find(x=>x.kind==='card')!
 assert.ok(Math.abs(card.width-widthOf(tree.byId.get('p')!)*0.75)<=1,`${card.width}`)
 assert.ok(Math.abs(card.height-48*0.75)<=1,`${card.height}`)
 assert.equal(f.pieces.some(x=>x.kind==='track'),false);assert.equal(f.pieces.some(x=>x.kind==='frame'),false)
 assert.equal(f.pieces.some(x=>x.kind==='bar'),true)
})
test('ZP-16: packFamilies with 6 / 16 / 30 gaps: no overlap and the lowest free slot, also for side-by-side point and card columns',()=>{
 const gap=(a?:boolean,b?:boolean)=>a&&b?L.POINT_GAP:a||b?L.POINT_CARD_GAP:L.FAMILY_V_GAP
 assert.ok(L.POINT_HEIGHT+L.POINT_CARD_GAP<=L.CARD_HEIGHT*L.CARD_SCALE_MIN+L.FAMILY_V_GAP)
 assert.ok(L.POINT_HEIGHT+L.POINT_GAP<=L.CARD_HEIGHT*L.CARD_SCALE_MIN+L.POINT_CARD_GAP)
 let seed=11;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647
 const box=(i:number,point:boolean,left:number,w:number,h:number):L.FamilyBox=>({id:`f${i}`,start:left,left,right:left+w,h,point,pieces:[]})
 const sets:L.FamilyBox[][]=[]
 for(let k=0;k<20;k++)sets.push(Array.from({length:50},(_,i)=>{const p=rnd()<0.5;return box(i,p,Math.floor(rnd()*900),p?60+rnd()*80:150+rnd()*200,p?18:25.5+rnd()*35)}))
 // Review round 1 #14: a point column and a card column side by side, close in y, both under a wide card.
 sets.push([box(0,true,0,100,18),box(1,false,120,100,25.5),box(2,true,0,100,18),box(3,false,120,100,25.5),box(4,false,0,260,34)])
 for(const fams of sets){
  const packed=L.packFamilies(fams,null,{scale:1,width:1000})
  const placed:{f:L.FamilyBox;y:number}[]=[]
  for(const f of [...fams].sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id))){
   const y=packed.families.get(f.id)!.y
   const cols=placed.filter(o=>o.f.left<f.right&&o.f.right>f.left)
   const ok=(c:number)=>cols.every(o=>!(c<o.y+o.f.h+gap(f.point,o.f.point)&&c+f.h+gap(f.point,o.f.point)>o.y))
   assert.ok(ok(y),`${f.id} overlaps`)
   const cands=[L.PLANE_TOP,...cols.map(o=>o.y+o.f.h+gap(f.point,o.f.point))].filter(c=>c>=L.PLANE_TOP).sort((a,b)=>a-b)
   assert.equal(y,cands.find(ok),`${f.id} lowest slot`)
   placed.push({f,y})
  }
 }
})

/* docs/595 MM-01 … MM-03: the minimap with many rail segments. Synthetic data only. */
const MM_YEAR=8640
/** `n` segments on FIXED24, each 2000 years apart (far over the break limit), with 1 … 20 roots one year apart. */
function mmSegments(n:number,extra:(i:number,k:number,at:number)=>Partial<Ev>=()=>({})):Ev[]{
 const out:Ev[]=[]
 for(let i=0;i<n;i++){const c=1+((i*7)%20);for(let k=0;k<c;k++){const at=(i*2000+k)*MM_YEAR;out.push({id:`s${i}k${k}`,at,...extra(i,k,at)})}}
 return out
}
function mmCheck(m:L.MinimapModel,segs:L.RailSegment[],W:number,label:string){
 const n=segs.length,widths=m.segments.reduce((s,g)=>s+g.width,0)
 const gaps=n>1?m.segments[n-1].x0+m.segments[n-1].width-widths:0
 assert.ok(Math.abs(widths+gaps-W)<1e-6,`${label}: widths + gaps = W (${widths}+${gaps})`)
 assert.ok(gaps<=0.2*W+1e-9,`${label}: gaps ${gaps} ≤ 20%`)
 const min=Math.min(4,(W-gaps)/n)
 m.segments.forEach(g=>{assert.ok(Number.isFinite(g.width)&&g.width>=min-1e-9,`${label}: seg ${g.index} width ${g.width}`)})
 for(let i=1;i<n;i++)assert.ok(m.segments[i-1].t1<=m.segments[i].t0,`${label}: seg ${i-1} t1 ≤ seg ${i} t0`)
 segs.forEach((s,i)=>{const g=m.segments[i]
  for(const r of s.roots){const x=m.toX(r.start!);assert.ok(x>=g.x0-1e-9&&x<=g.x0+g.width+1e-9,`${label}: ${r.id} at ${x} not in seg ${i} [${g.x0}, ${g.x0+g.width}]`)
   assert.ok(Math.abs(m.toT(x)-r.start!)<1,`${label}: ${r.id} toT(toX) ${m.toT(x)} vs ${r.start}`)}
  const c=m.toT(g.x0+g.width/2);assert.ok(c>=g.t0-1e-9&&c<=g.t1+1e-9,`${label}: centre of seg ${i} → ${c} not in [${g.t0}, ${g.t1}]`)})
 let lx=-Infinity,lt=-Infinity
 for(let x=0;x<=W;x+=W/2000){const t=m.toT(x);assert.ok(t>=lt-1e-6,`${label}: toT monotonic at ${x}`);lt=t;const xx=m.toX(t);assert.ok(xx>=lx-1e-6,`${label}: toX monotonic`);lx=xx}
}

test('MM-01: 30 segments at 420 and 120px: gaps ≤ 20%, every segment ≥ MIN, every root in its own segment, toX / toT inverse and monotonic',()=>{
 const tree=treeOf(plan(mmSegments(30),FIXED24)),ad=L.createCalendarAdapter(FIXED24),segs=L.railSegments(tree.roots,ad)
 assert.equal(segs.length,30)
 for(const W of [420,120]){
  const m=L.minimapModel(tree.roots,W,ad)
  mmCheck(m,segs,W,`W=${W}`)
  if(W===420){const xs=new Set(tree.roots.map(r=>m.toX(r.start!).toFixed(2)));assert.ok(xs.size>=0.8*tree.roots.length,`distinct x ${xs.size} of ${tree.roots.length}`)}
 }
})

test('MM-02: a segment-2 event lasting past segment 20 does not pull later roots into segment 2, and segment 2 marks spread over ≥ 80% of it',()=>{
 const tree=treeOf(plan(mmSegments(30,(i,k)=>i===2&&k===0?{dur:45000*MM_YEAR}:{}),FIXED24)),ad=L.createCalendarAdapter(FIXED24),segs=L.railSegments(tree.roots,ad)
 assert.equal(segs.length,30)
 const m=L.minimapModel(tree.roots,420,ad)
 mmCheck(m,segs,420,'long')
 assert.ok(segs[2].roots.length>=10)
 const g=m.segments[2],xs=segs[2].roots.map(r=>m.toX(r.start!))
 assert.ok(Math.max(...xs)-Math.min(...xs)>=0.8*g.width,`segment 2 spread ${Math.max(...xs)-Math.min(...xs)} of ${g.width}`)
})

test('MM-03: no roots, one segment at one time, and 30 segments in 30px give finite widths that sum to W',()=>{
 const ad=L.createCalendarAdapter(FIXED24)
 const empty=L.minimapModel([],420,ad);assert.equal(empty.segments.length,0);assert.equal(empty.toX(5),0);assert.equal(empty.toT(5),0)
 const one=treeOf(plan([{id:'a',at:100},{id:'b',at:100},{id:'c',at:100}],FIXED24)),m1=L.minimapModel(one.roots,420,ad)
 assert.equal(m1.segments.length,1);assert.ok(Math.abs(m1.segments[0].width-420)<1e-9)
 for(const r of one.roots){const x=m1.toX(r.start!);assert.ok(x>=0&&x<=420);assert.ok(Math.abs(m1.toT(x)-100)<1)}
 const tree=treeOf(plan(mmSegments(30),FIXED24)),segs=L.railSegments(tree.roots,ad),m=L.minimapModel(tree.roots,30,ad)
 mmCheck(m,segs,30,'W=30')
 // Every segment is at the equal-share minimum here (the all-fixed branch): widths are equal.
 const w0=m.segments[0].width;assert.ok(m.segments.every(g=>Math.abs(g.width-w0)<1e-9),'equal shares')
})

/* docs/597 AO-01 … AO-06: auto-open fit on the all-open trial layout. Scale 1 px/h, so hours are px. */
const aoStep=(events:Ev[],open?:string[],view={start:0,span:2000})=>{
 const tree=treeOf(plan(events,FIXED24))
 const step=L.timelineStep(L.emptyTimeline(),{tree,view,width:2000,expanded:new Set(open??[...tree.byId.keys()])})
 return {tree,step,view:{dx:step.translateX,dy:0,w:2000,h:1000}}
}
test('AO-01: leaves 444px apart fit at gap 24 when open (420 wide); 443px apart do not',()=>{
 for(const [sp,fit] of [[444,true],[443,false]] as const){
  const {tree,step,view}=aoStep([0,1,2].map(i=>({id:`a${i}`,at:100+i*sp})))
  assert.equal(step.elements.filter(e=>e.kind==='card').every(e=>e.width===420),true)
  assert.equal(L.autoOpenFits(step.elements,tree,view,L.AUTO_OPEN_GAP),fit,`spacing ${sp}`)
 }
})
test('AO-02: a card crossing in x but below the view does not count',()=>{
 const {tree,step}=aoStep([{id:'a',at:100},{id:'b',at:300}])
 const b=step.elements.find(e=>e.id==='b'&&e.kind==='card')!,a=step.elements.find(e=>e.id==='a'&&e.kind==='card')!
 assert.ok(b.top>a.top+a.height,'b is packed below a')
 assert.equal(L.autoOpenFits(step.elements,tree,{dx:step.translateX,dy:0,w:2000,h:b.top-1},L.AUTO_OPEN_GAP),true)
 assert.equal(L.autoOpenFits(step.elements,tree,{dx:step.translateX,dy:0,w:2000,h:1000},L.AUTO_OPEN_GAP),false)
})
test('AO-03: one card in view fits; none in view gives null',()=>{
 const {tree,step,view}=aoStep([{id:'a',at:100}])
 assert.equal(L.autoOpenFits(step.elements,tree,view,L.AUTO_OPEN_GAP),true)
 assert.equal(L.autoOpenFits(step.elements,tree,{...view,dx:view.dx+5000},L.AUTO_OPEN_GAP),null)
})
test('AO-04: a parent is not compared with its children; two children 300px apart do not fit, 500px apart do',()=>{
 for(const [sp,fit] of [[300,false],[500,true]] as const){
  const {tree,step,view}=aoStep([{id:'p',at:100,dur:1200},{id:'k0',at:150,parent:'p'},{id:'k1',at:150+sp,parent:'p'}])
  assert.equal(L.autoOpenFits(step.elements,tree,view,L.AUTO_OPEN_GAP),fit,`children ${sp} apart`)
 }
})
test('AO-05: AUTO_OPEN_KEEP is the packer row gap: 440px apart fit and share a row, 439px do not',()=>{
 assert.equal(L.AUTO_OPEN_KEEP,L.FAMILY_PAD_LEFT+L.FAMILY_H_GAP)
 for(const [sp,fit] of [[440,true],[439,false]] as const){
  const {tree,step,view}=aoStep([{id:'a',at:100},{id:'b',at:100+sp}])
  assert.equal(L.autoOpenFits(step.elements,tree,view,L.AUTO_OPEN_KEEP),fit,`spacing ${sp}`)
  const [ca,cb]=['a','b'].map(id=>step.elements.find(e=>e.id===id&&e.kind==='card')!)
  assert.equal(ca.top===cb.top,fit,`same row at ${sp}`)
 }
})
test('AO-06: frames, tracks and bars do not count; a long bar under a lone card still fits',()=>{
 const {tree,step,view}=aoStep([{id:'a',at:100,dur:5000},{id:'b',at:2000}])
 assert.ok(step.elements.some(e=>e.kind==='bar'))
 assert.equal(L.autoOpenFits(step.elements,tree,{...view,w:1500},L.AUTO_OPEN_GAP),true)
})
