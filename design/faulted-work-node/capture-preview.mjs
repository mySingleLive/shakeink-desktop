// Offline design artifact only: renders synthetic review scenes with local headless Chrome.
import { chromium } from 'playwright-core'
const b = await chromium.launch({ headless: true, executablePath: process.env.CH })
const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 })
const errors=[]; p.on('pageerror', e => errors.push(e.message)); p.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
await p.route(/^https?:/, r => r.abort())
await p.goto('file://' + process.cwd() + '/design/faulted-work-node/index.html')
for (const [theme, scene] of [['paper','overview'],['ink','overview'],['ink','more'],['paper','context-lease'],['ink','hover'],['ink','delete-lease'],['paper','settings-view'],['ink','before'],['ink','context-ok']]) {
  await p.evaluate(([t,s]) => { state.theme=t; state.scene=s; render() }, [theme, scene])
  await p.locator('#win').screenshot({ path: `design/faulted-work-node/preview-${theme}-${scene}.png` })
  if (scene==='overview') await p.locator('#spec').screenshot({ path: `design/faulted-work-node/preview-${theme}-icon-spec.png`, scale:'device' })
}
console.log('errors', errors)
await b.close()
