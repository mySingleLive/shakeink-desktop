import './generate-routes.mjs'
import { build } from 'esbuild'
import {rmSync} from 'node:fs'
import {verifyCommandCatalogs} from './verify-command-catalogs.mjs'
import {bundleNextServer,writeRuntimeDependencyManifest} from './runtime-dependencies.mjs'
import {generateDatabaseSeed} from './database-seed.mjs'
await verifyCommandCatalogs()
await generateDatabaseSeed(process.cwd())
// Generated entries from the withdrawn backup feature must not survive rebuilds.
for(const entry of ['service/application-restore-worker','preload/application-restore'])for(const suffix of ['.cjs','.cjs.map'])rmSync(`dist/${entry}${suffix}`,{force:true})
const results=[]
const common = { bundle: true, platform: 'node', target: 'node24', format: 'cjs', sourcemap: true, metafile:true, packages: 'external', define: { 'import.meta.url': '__desktopImportMetaUrl' }, banner: { js: 'var __desktopImportMetaUrl = require("node:url").pathToFileURL(__filename).href;' } }
results.push(await build({ ...common, entryPoints: ['desktop/main/index.ts'], outfile: 'dist/main/index.cjs' }))
results.push(await build({ ...common, plugins:[bundleNextServer(process.cwd())], entryPoints: ['desktop/service/index.ts'], outfile: 'dist/service/index.cjs' }))
results.push(await build({ bundle: true, platform: 'node', target: 'node24', format: 'cjs', metafile:true, external: ['electron'], entryPoints: ['desktop/preload/index.ts'], outfile: 'dist/preload/index.cjs' }))

results.push(await build({ bundle: true, platform: 'node', target: 'node24', format: 'cjs', metafile:true, external: ['electron'], entryPoints: ['desktop/preload/maintenance.ts'], outfile: 'dist/preload/maintenance.cjs' }))
results.push(await build({ bundle: true, platform: 'node', target: 'node24', format: 'cjs', metafile:true, external: ['electron'], entryPoints: ['desktop/preload/root-relocation.ts'], outfile: 'dist/preload/root-relocation.cjs' }))
results.push(await build({ ...common, entryPoints: ['desktop/main/novel-import-pdf-worker.ts'], outfile: 'dist/main/novel-import-pdf-worker.cjs' }))
await writeRuntimeDependencyManifest(process.cwd(),results)
