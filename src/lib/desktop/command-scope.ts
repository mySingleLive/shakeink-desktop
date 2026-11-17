export type DesktopCommandScope="none"|"markdown"|"composer"|"input"|"preview"|"worldline"|"worldline-search"
/** Monaco's find widgets and our comment ViewZones contain ordinary controls.
 * Only its real text surfaces own manuscript commands. */
export function commandScope(target:HTMLElement|null):DesktopCommandScope{
 if(target?.closest('.chat-composer-editable'))return "composer"
 // docs/580 §7.5 (N2): a dialog, even one inside the worldline panel, keeps the ordinary rules below.
 const inDialog=!!target?.closest('[role="dialog"],[role="alertdialog"]')
 const worldline=!inDialog&&!!target?.closest('[data-command-scope="worldline"]')
 if(worldline&&target?.closest('[data-worldline-search]'))return "worldline-search"
 const control=target?.closest('input,textarea,[contenteditable="true"]')
 if(control&&!control.matches('.inputarea,.native-edit-context,.ime-text-area'))return "input"
 if(target?.closest('.monaco-editor'))return "markdown"
 if(target?.closest('.desktop-markdown-editor'))return "preview"
 // Last: the worldline canvas, tree and cards. After markdown/preview so the event editor's Monaco keeps md.find.
 if(worldline)return "worldline"
 return "none"
}
