/** Record normal quit using one deadline for both evaluate and process exit.
 * Cleanup after a failure cannot change the returned frozen observation. */
export async function quitElectronNormally(application,{timeoutMs=15000}={}){
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw new RangeError('invalid normal quit timeout')
 const process=application.process(),started=performance.now(),deadline=started+timeoutMs
 let evaluation='pending',exit=null,settled=false,timer
 return new Promise(resolve=>{
  const finish=timedOut=>{
   if(settled)return
   settled=true;clearTimeout(timer);process.removeListener('exit',onExit)
   resolve(Object.freeze({normalQuit:!timedOut&&evaluation==='fulfilled'&&exit?.code===0&&exit?.signal===null,timedOut,evaluate:evaluation,exit:exit&&Object.freeze({...exit}),elapsedMs:Math.round(performance.now()-started),deadlineMs:timeoutMs}))
  }
  const observe=()=>{
   if(performance.now()>=deadline)return finish(true)
   if(evaluation==='rejected'||evaluation==='fulfilled'&&exit!==null)finish(false)
  }
  const onExit=(code,signal)=>{if(settled)return;exit={code,signal};observe()}
  const onDeadline=()=>{const remaining=deadline-performance.now();if(remaining>0){timer=setTimeout(onDeadline,Math.ceil(remaining));return}finish(true)}
  process.once('exit',onExit)
  timer=setTimeout(onDeadline,Math.max(1,Math.ceil(deadline-performance.now())))
  Promise.resolve().then(()=>application.evaluate(({app})=>app.quit())).then(()=>{if(settled)return;evaluation='fulfilled';observe()},()=>{if(settled)return;evaluation='rejected';observe()})
 })
}
