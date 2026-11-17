import assert from 'node:assert/strict'
import {test} from 'node:test'
import {civilDays,civilFromDays,isCivilDate,ERA_YEAR_HOURS,eraLabel} from '../../src/lib/planning/era-calendar'
import {formatTime,timelineTicks,fitTimelineWindow,fitDenseTimelineWindow} from '../../src/lib/planning/timeline'
import {planningSchema,validatePlanning,applyPlanningOperations,emptyPlanning} from '../../src/lib/planning/domain'
import {z} from 'zod'

/* docs/573 §一/§二. Synthetic era names only. */
const D=(y:number,m:number,d:number)=>civilDays(y,m,d)*24
test('EC-01: integer civil days round-trip from year 1',()=>{
 assert.equal(civilDays(1,1,1),0);assert.equal(civilDays(2,1,1),365);assert.equal(civilDays(5,1,1),365*4+1)
 for(const y of [1,99,100,400,1349,1000000])for(const [m,d] of [[1,1],[2,28],[12,31]] as const)assert.deepEqual(civilFromDays(civilDays(y,m,d)),{year:y,month:m,day:d},`${y}-${m}-${d}`)
 // Every day of a 401-year span maps back to itself.
 for(let n=civilDays(1300,1,1);n<civilDays(1701,1,1);n+=37){const c=civilFromDays(n);assert.equal(civilDays(c.year,c.month,c.day),n)}
})
test('EC-02: leap years and invalid dates',()=>{
 for(const ok of [[4,2,29],[400,2,29],[1,1,1],[1000000,12,31]] as const)assert.ok(isCivilDate(ok[0],ok[1],ok[2]),String(ok))
 for(const no of [[100,2,29],[1349,2,29],[0,1,1],[1000001,1,1],[1,13,1],[1,6,31],[1,0,1],[1.5,1,1]] as const)assert.ok(!isCivilDate(no[0],no[1],no[2]),String(no))
})
const cal={kind:'gregorian' as const,epoch:'0001-01-01T00:00:00Z',hoursPerDay:24,daysPerMonth:30,monthsPerYear:12,eras:[{name:'青石纪',start:-500*ERA_YEAR_HOURS},{name:'赤铜纪',start:0}]}
test('EC-03/EC-04/EC-05/EC-06: era labels by precision, earlier eras, before the first era, unnamed era',()=>{
 const v=D(1349,6,28)
 assert.equal(formatTime(v,cal,1,'day'),'赤铜纪1349年6月28日');assert.equal(formatTime(v,cal,1,'month'),'赤铜纪1349年6月')
 assert.equal(formatTime(v,cal,1,'year'),'赤铜纪1349年');assert.equal(formatTime(v,cal,1,'era'),'赤铜纪')
 assert.equal(formatTime(cal.eras[0].start+D(12,3,1),cal,1,'day'),'青石纪12年3月1日')
 assert.equal(formatTime(cal.eras[0].start-24,cal,1,'day'),'青石纪之前')
 assert.equal(formatTime(-24,{...cal,eras:[{name:'',start:0}]},1,'day'),'纪年之前')
 assert.equal(formatTime(v,{...cal,eras:[{name:'',start:0}]},1,'day'),'1349年6月28日')
 assert.equal(eraLabel(v+13,cal.eras,'day'),'赤铜纪1349年6月28日','hours inside the day stay on that day')
})
test('EC-07: without a precision the span decides',()=>{
 const v=D(1349,6,28)
 assert.equal(formatTime(v,cal,4*ERA_YEAR_HOURS),'赤铜纪1349年');assert.equal(formatTime(v,cal,100*24),'赤铜纪1349年6月');assert.equal(formatTime(v,cal,48),'赤铜纪1349年6月28日')
})
test('EC-08: calendars without eras format as before',()=>{
 const fixed={kind:'fixed' as const,epoch:'故事开始',hoursPerDay:24,daysPerMonth:30,monthsPerYear:12,eras:[]}
 assert.equal(formatTime(-432,fixed,1000),'前18天');assert.equal(formatTime(36,fixed,10),'后36小时');assert.equal(formatTime(9000,{...fixed,kind:'years' as const},1),'9000年')
 const iso={...fixed,kind:'gregorian' as const,epoch:'1349-06-26'}
 assert.equal(formatTime(48,iso,1),'1349-06-28 00:00');assert.equal(formatTime(48,iso,100),'1349-06-28');assert.equal(formatTime(48,{...iso,epoch:'x'},1),'48小时（未映射）')
})
test('EC-09/EC-10: huge spans and unsorted eras never fail',()=>{
 const far=-1e6*ERA_YEAR_HOURS
 for(const p of ['day','month','year','era',undefined] as const){const text=formatTime(far,cal,1,p);assert.doesNotMatch(text,/Invalid|NaN|未映射/u,text)}
 const reversed={...cal,eras:[...cal.eras].reverse()}
 assert.equal(formatTime(D(1349,6,28),reversed,1,'day'),'赤铜纪1349年6月28日')
})
test('EC-11: ticks over three thousand years stay bounded and land on whole years',()=>{
 const ticks=timelineTicks(-1500*ERA_YEAR_HOURS,3000*ERA_YEAR_HOURS,cal,1200)
 assert.ok(ticks.length>0&&ticks.length<=100);assert.ok(ticks.every(Number.isFinite))
 for(const t of ticks)assert.ok(Math.abs(t/ERA_YEAR_HOURS-Math.round(t/ERA_YEAR_HOURS))<1e-6,String(t))
})
test('EC-15/EC-16/EC-18: old data reads; read is lenient, validation strict; JSON schema still builds',()=>{
 const base=emptyPlanning()
 const old=planningSchema.parse({...base,worlds:[{id:'w',name:'线',calendar:{kind:'fixed'}}],events:[{id:'e',line:'w',title:'事',time:{kind:'exact',value:1,precision:'era'}}]})
 assert.deepEqual(old.worlds[0].calendar.eras,[]);assert.equal(old.events[0].time.precision,'era')
 const bad=planningSchema.parse({...base,worlds:[{id:'w',name:'线',calendar:{kind:'gregorian',eras:[{name:'乙',start:10},{name:'甲',start:0}]}}]})
 assert.equal(bad.worlds[0].calendar.eras.length,2)
 assert.throws(()=>validatePlanning(bad),/纪元/u)
 const json=JSON.stringify(z.toJSONSchema(planningSchema));assert.match(json,/eras/u);assert.match(json,/"era"/u)
})
test('EC-17: a partial calendar put keeps the eras',()=>{
 const data=planningSchema.parse({...emptyPlanning(),worlds:[{id:'w',name:'线',calendar:cal}]})
 const next=applyPlanningOperations(data,[{kind:'put',collection:'worlds',value:{id:'w',name:'线',calendar:{kind:'gregorian'}}}] as never)
 assert.deepEqual(next.worlds[0].calendar.eras,cal.eras)
})
test('EC-20: the dense window covers the crowded stretch, not far outliers',()=>{
 const items=[...Array.from({length:95},(_,i)=>({start:i*10,end:null})),...Array.from({length:5},(_,i)=>({start:-1e7-i,end:null}))]
 const w=fitDenseTimelineWindow(items,1000)
 assert.ok(w.start<=0&&w.start+w.span>=940,JSON.stringify(w));assert.ok(w.start>-1e6,JSON.stringify(w))
 const even=Array.from({length:20},(_,i)=>({start:i*100,end:null}));assert.deepEqual(fitDenseTimelineWindow(even,1000),fitTimelineWindow(even,1000))
})
