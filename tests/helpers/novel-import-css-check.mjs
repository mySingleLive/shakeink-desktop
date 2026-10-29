import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {join} from 'node:path'

export function verifyImportPopupPosition(css,label){
 const rules=[...css.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([,selector])=>/(?:^|,)\s*(?:\[data-slot=(?:"dialog-content"|dialog-content)\])?\.ni-dialog(?:\.ni-dialog)?\s*(?:,|$)/.test(selector))
 assert.ok(rules.length,`${label}: import popup rules must exist`)
 for(const [,selector,body] of rules)assert.doesNotMatch(body,/(?:^|;)\s*(?:translate|transform)\s*:/,`${label}: ${selector.trim()} must reuse the shared DialogContent translation`)
 return rules.length
}

async function verifyBuild(){
 const source=await readFile('src/components/desktop/novel-import.css','utf8')
 const sourceRules=verifyImportPopupPosition(source,'source')
 const directory='out/_next/static/chunks',files=(await readdir(directory,{recursive:true})).filter(path=>path.endsWith('.css'))
 const assets=[];let sharedTranslation=false
 for(const file of files){const css=await readFile(join(directory,file),'utf8');sharedTranslation ||= css.includes('translate:var(--tw-translate-x)');if(css.includes('.ni-dialog'))assets.push({file,css})}
 assert.ok(assets.length,'built CSS containing the real import dialog must exist')
 const product=assets.map(asset=>asset.css).join('\n'),builtRules=verifyImportPopupPosition(product,'production')
 assert.ok(sharedTranslation,'built CSS must retain the shared Tailwind popup translation')
 console.log(JSON.stringify({sourceRules,builtRules,productionAssets:assets.map(asset=>join(directory,asset.file)),ownTranslation:false,sharedTranslation:true},null,2))
}
if(process.argv[1]?.endsWith('novel-import-css-check.mjs'))void verifyBuild().catch(error=>{console.error(error);process.exitCode=1})
