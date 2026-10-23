import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'
import {createRequire} from 'node:module'
import {build, Platform} from 'electron-builder'
import {Arch} from 'builder-util'
import {inspectLocalRuntime} from './packaging-runtime.mjs'
import {preparePackageResources} from './prepare-package-resources.mjs'
import {inspectPackagedApp, verifyProjectResources, verifyPackagedDependencies} from './inspect-packaged-app.mjs'
import {writeFile} from 'node:fs/promises'
import {installMacMenuLocalization} from './macos-menu-localization.mjs'
import {prunePackagedDependencies,createPruneSession} from './runtime-dependencies.mjs'
import {mkdtemp, mkdir} from 'node:fs/promises'
import {rm} from 'node:fs/promises'
import {releaseMode, preflightMacRelease, createPackagingConfiguration, verifyMacSignature, finalizeMacRelease} from './macos-release.mjs'

// Chromium aborts when chrome-sandbox exists but is not root-owned with
// mode 4755; it falls back to the user-namespace sandbox only when the
// helper is absent. Unsigned local builds cannot create a setuid helper,
// so remove it and rely on unprivileged user namespaces (the same choice
// as flatpak/AppImage distributions).
async function removeChromeSandbox(path){
  await rm(path,{force:true})
}

const project = dirname(dirname(fileURLToPath(import.meta.url)))
const arguments_ = process.argv.slice(2)
const mode = releaseMode(process.platform, arguments_)
const target = arguments_[0]?.slice(2)
// Authenticate before touching output paths, resources, or previous installers.
const signing = mode === 'release' ? await preflightMacRelease() : null
const runtime = await inspectLocalRuntime(project, process.platform, process.arch)
let staging
{
  const stagingRoot = join(project, 'release/.staging')
  await mkdir(stagingRoot, {recursive: true})
  staging = await mkdtemp(join(stagingRoot, `${signing?'macos':'local'}-${process.arch}-`))
}
const pruneSession=await createPruneSession(project,staging)
await preparePackageResources(project)
const require = createRequire(import.meta.url)
const config = {
  ...createPackagingConfiguration(require(join(project, 'electron-builder.config.cjs')), {platform: process.platform, target, identity: signing?.identity, staging}),
  directories:{...require(join(project,'electron-builder.config.cjs')).directories,output:staging},
  electronDist: runtime.electronDist,
  // This hook completes before archive targets. A missing worker/resource or
  // package-external dependency must fail instead of producing an installer.
  afterPack: async context => {
    const application = context.electronPlatformName === 'darwin' ? join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`) : context.appOutDir
    const appRoot = context.electronPlatformName === 'darwin' ? join(application, 'Contents/Resources/app') : join(application, 'resources/app')
    if (context.electronPlatformName === 'linux') await removeChromeSandbox(join(context.appOutDir, 'chrome-sandbox'))
    const runtimeDependencies=await prunePackagedDependencies(project,appRoot,pruneSession)
    if(context.electronPlatformName==='darwin')await installMacMenuLocalization(application)
    const contents = context.electronPlatformName === 'darwin' ? await inspectPackagedApp(project, application) : await verifyProjectResources(project, appRoot)
    const dependencies = await verifyPackagedDependencies(appRoot)
    await writeFile(join(context.outDir, `package-static-${process.platform}-${process.arch}.json`), JSON.stringify({contents, dependencies, runtimeDependencies, scope: 'Packaged resources under Node, not Electron/native acceptance'}, null, 2) + '\n')
    console.log(JSON.stringify({stage: 'after-pack-resources-verified', projectResources: contents.projectResources, platform: process.platform, arch: process.arch, pgliteClosed: dependencies.pgliteClosed, publish: 'never'}))
  },
  afterSign: async context => {
    if (!signing || context.electronPlatformName !== 'darwin') return
    const application = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
    await verifyMacSignature(application, {teamId: signing.identity.teamId, arch: process.arch})
    console.log(JSON.stringify({stage: 'signed-app-verified', platform: process.platform, arch: process.arch}))
  },
}
const platform = process.platform === 'darwin' ? Platform.MAC : process.platform === 'linux' ? Platform.LINUX : Platform.WINDOWS
console.log(JSON.stringify({stage: 'native-preflight', ...runtime, publish: 'never', mode, signing: signing ? 'developer-id-required' : 'local-or-windows', target: target ?? 'configured'}, null, 2))
const artifacts = await build({projectDir: project, config, publish: 'never', targets: platform.createTarget(target, Arch[process.arch])})
if (signing) {
  const result = await finalizeMacRelease(project, staging, {...signing, arch: process.arch, artifacts, targets: target ? [target] : ['dmg', 'zip']})
  console.log(JSON.stringify({stage: 'release-verified', directory: result.directory, manifest: join(result.directory, 'release.json')}, null, 2))
} else {
  console.log(JSON.stringify({stage: mode === 'local' ? 'local-directory-only' : 'packaged', directory:staging, artifacts}, null, 2))
}
