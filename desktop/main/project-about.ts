import type {WebContents} from 'electron'
import {PROJECT_EXTERNAL_LINKS,PROJECT_REPOSITORY_URL,PROJECT_WEBSITE_URL,PROJECT_DOCS_URL,PROJECT_FAQ_URL,PROJECT_STAR_COPY,PROJECT_STAR_HINT} from '../shared/project-info'
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))

export function projectAboutHtml(version:string,theme:'paper'|'ink'):string {
 const ink=theme==='ink'
 return `<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>关于玄印写作</title><style>
html{color-scheme:${ink?'dark':'light'};background:${ink?'#1b1613':'#fffcf4'};color:${ink?'#ece1cf':'#342b23'}}body{font:14px/1.6 system-ui;text-align:center;margin:0;padding:24px;-webkit-user-select:none;user-select:none}h1{font-size:26px;margin:0 0 12px}p{margin:10px 0}.muted{color:${ink?'#b4a593':'#756959'}}.support{margin-top:22px;padding-top:16px;border-top:1px solid ${ink?'#45382e':'#ddd2bd'}}a{display:inline-block;border:1px solid ${ink?'#dfb471':'#8b5d26'};border-radius:8px;padding:8px 14px;color:${ink?'#dfb471':'#8b5d26'};text-decoration:none}a:hover{background:${ink?'#32271d':'#f4e9d6'}}a:focus-visible{outline:2px solid currentColor;outline-offset:3px}small{display:block;font-size:11px;margin-top:10px}.links a{border:0;border-radius:0;padding:0;text-decoration:underline;text-underline-offset:3px}.links a:hover{background:none}
.link-error{color:${ink?'#e59a8a':'#ae2e2e'}}</style><body><h1>玄印写作</h1><p>版本 ${escapeHtml(version)}</p><p class="muted">本地创作，由你的模型驱动</p><p class="muted">GPL-3.0 · ShakeInk</p><p class="links"><a href="${PROJECT_WEBSITE_URL}" target="_blank" rel="noopener noreferrer">官方网站</a> · <a href="${PROJECT_DOCS_URL}" target="_blank" rel="noopener noreferrer">帮助文档</a> · <a href="${PROJECT_FAQ_URL}" target="_blank" rel="noopener noreferrer">常见问题</a></p><div class="support"><p>${PROJECT_STAR_COPY.about.message}</p><a href="${PROJECT_REPOSITORY_URL}" target="_blank" rel="noopener noreferrer">☆ ${PROJECT_STAR_COPY.about.label} ↗</a><small class="muted">${PROJECT_STAR_HINT}</small></div><p id="link-error" class="link-error" role="alert" hidden>无法打开浏览器，请稍后重试。</p></body></html>`
}

/** Shown in the About page itself instead of a native error box. */
export const PROJECT_ABOUT_LINK_ERROR_SCRIPT='document.getElementById("link-error")?.removeAttribute("hidden")'

export function installProjectAboutLinks(contents:Pick<WebContents,'on'|'setWindowOpenHandler'>,open:(url:string)=>Promise<void>,onError:()=>void):void {
 // Chromium serializes bare-origin URLs with a trailing slash (https://shake.ink -> https://shake.ink/);
 // tolerate exactly that form and always open the canonical approved address.
 const forward=(url:string)=>{const match=(PROJECT_EXTERNAL_LINKS as readonly string[]).find(link=>url===link||url===link+'/');if(match)void open(match).catch(onError)}
 contents.setWindowOpenHandler(({url})=>{forward(url);return {action:'deny'}})
 contents.on('will-navigate',(event,url)=>{
  event.preventDefault()
  forward(url)
 })
}
