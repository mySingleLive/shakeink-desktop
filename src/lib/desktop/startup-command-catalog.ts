"use client"
import generated from '@desktop/shared/command-catalogs.generated.json'
import type {DesktopCommand,DesktopPlatform} from '@desktop/shared/command-registry'
import {publishDesktopCommands} from './command-runtime'

/** This is the complete installed-editor snapshot, verified against the exact
 * assembly source hashes by both UI and desktop builds. Live editors retain
 * priority and still verify the installed runtime on their first mount. */
export function initializeStartupCommandCatalog(platform:DesktopPlatform):()=>void{
 // Linux reuses the win32 installed snapshot: same Ctrl-based bindings.
 const catalog=generated.platforms[platform==="linux"?"win32":platform]
 if(generated.schemaVersion!==1||generated.monacoVersion!=='0.56.0'||!catalog?.resolved||catalog.commands.length<200||new Set(catalog.commands.map(row=>row.id)).size!==catalog.commands.length)throw Error('INSTALLED_COMMAND_CATALOG_UNAVAILABLE')
 return publishDesktopCommands(Symbol('installed-editor-snapshot'),catalog.commands as DesktopCommand[],-1)
}
