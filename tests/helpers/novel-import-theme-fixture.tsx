import React from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import {ArrowUp,X} from 'lucide-react'
import {Button} from '../../src/components/ui/button'
import './novel-import-ui-fixture'

declare global {interface Window {mountNovelImportThemeReference(theme:'ink'|'paper'):void}}
// A separate page mounts these real shared components, never beneath ni-dialog.
// Both pages receive the same compiled production CSS from the browser test.
window.mountNovelImportThemeReference=theme=>{
 document.documentElement.className=theme
 const root=createRoot(document.getElementById('app')!)
 flushSync(()=>root.render(<main className="chatpane" aria-label="共享按钮参照" style={{padding:32,display:'flex',gap:16,flexWrap:'wrap'}}>
  <Button data-reference="primary">识别内容</Button>
  <Button data-reference="outline" variant="outline">添加来源</Button>
  <Button data-reference="icon" variant="ghost" size="icon-sm" aria-label="参照关闭"><X/></Button>
  <Button data-reference="disabled-icon" variant="ghost" size="icon-sm" disabled aria-label="参照上移"><ArrowUp/></Button>
  <Button data-reference="disabled-primary" disabled>允许分析并导入</Button>
 </main>))
}
