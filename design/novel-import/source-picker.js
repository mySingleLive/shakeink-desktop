'use strict';
// Review-only synthetic tree. No filesystem, network, model or production bridge.
const $=selector=>document.querySelector(selector);
const svg=body=>`<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const icons={folder:svg('<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>'),file:svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>'),close:svg('<path d="m6 6 12 12M6 18 18 6"/>'),up:svg('<path d="m6 12 6-6 6 6M12 6v14"/>'),chevron:svg('<path d="m9 5 7 7-7 7"/>'),search:svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>'),download:svg('<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>'),desktop:svg('<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M8 21h8m-4-5v5"/>'),drive:svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 14h18M7 17h.01M11 17h.01"/>'),spinner:svg('<path d="M21 12a9 9 0 1 1-6-8.5"/>'),lock:svg('<rect x="5" y="11" width="14" height="11" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),alert:svg('<path d="m10.3 3.7-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.3l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/>'),empty:svg('<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2ZM8 14h8"/>')};
const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const tree={
 computer:{name:'此电脑',path:'此电脑',type:'root',parent:null,children:['c','d']},
 c:{name:'本地磁盘 (C:)',path:'C:\\',type:'folder',parent:'computer',children:['documents','downloads','desktop','protected']},
 d:{name:'资料 (D:)',path:'D:\\',type:'folder',parent:'computer',children:['archive','empty','missing']},
 documents:{name:'文档',path:'C:\\Users\\作者\\Documents',type:'folder',parent:'c',children:['novel','character','outline','archive-shortcut','pdf','cover','locked']},
 downloads:{name:'下载',path:'C:\\Users\\作者\\Downloads',type:'folder',parent:'c',children:['draft','html','broken']},
 desktop:{name:'桌面',path:'C:\\Users\\作者\\Desktop',type:'folder',parent:'c',children:['notes','empty-shortcut']},
 novel:{name:'小说原稿',path:'C:\\Users\\作者\\Documents\\小说原稿',type:'folder',parent:'documents',children:['body','volume','world','novel-cover']},
 volume:{name:'卷一',path:'C:\\Users\\作者\\Documents\\小说原稿\\卷一',type:'folder',parent:'novel',children:['chapter1','chapter2']},
 archive:{name:'素材归档',path:'D:\\素材归档',type:'folder',parent:'d',children:['old-doc','style']},
 'archive-shortcut':{name:'旧稿',path:'C:\\Users\\作者\\Documents\\旧稿',type:'folder',parent:'documents',children:['old-outline']},
 empty:{name:'待整理',path:'D:\\待整理',type:'folder',parent:'d',children:[]},
 'empty-shortcut':{name:'新建文件夹',path:'C:\\Users\\作者\\Desktop\\新建文件夹',type:'folder',parent:'desktop',children:[]},
 locked:{name:'只读资料库',path:'C:\\Users\\作者\\Documents\\只读资料库',type:'folder',parent:'documents',children:[],state:'permission',disabled:'无访问权限'},
 missing:{name:'已移动的原稿',path:'D:\\已移动的原稿',type:'folder',parent:'d',children:[],state:'missing',disabled:'目录已不存在'},
 protected:{name:'应用数据',path:'C:\\玄印写作应用数据',type:'folder',parent:'c',children:[],disabled:'受保护目录'},
 character:{name:'角色设定.docx',path:'C:\\Users\\作者\\Documents\\角色设定.docx',type:'docx',parent:'documents',size:'24 KB'},
 outline:{name:'创作大纲.md',path:'C:\\Users\\作者\\Documents\\创作大纲.md',type:'md',parent:'documents',size:'8 KB'},
 pdf:{name:'世界资料.pdf',path:'C:\\Users\\作者\\Documents\\世界资料.pdf',type:'pdf',parent:'documents',size:'136 KB'},
 cover:{name:'封面.png',path:'C:\\Users\\作者\\Documents\\封面.png',type:'png',parent:'documents',size:'1.2 MB',disabled:'不支持'},
 body:{name:'正文.txt',path:'C:\\Users\\作者\\Documents\\小说原稿\\正文.txt',type:'txt',parent:'novel',size:'680 KB'},
 world:{name:'世界观.md',path:'C:\\Users\\作者\\Documents\\小说原稿\\世界观.md',type:'md',parent:'novel',size:'12 KB'},
 'novel-cover':{name:'参考图.jpg',path:'C:\\Users\\作者\\Documents\\小说原稿\\参考图.jpg',type:'jpg',parent:'novel',size:'640 KB',disabled:'不支持'},
 chapter1:{name:'第01章.txt',path:'C:\\Users\\作者\\Documents\\小说原稿\\卷一\\第01章.txt',type:'txt',parent:'volume',size:'14 KB'},
 chapter2:{name:'第02章.txt',path:'C:\\Users\\作者\\Documents\\小说原稿\\卷一\\第02章.txt',type:'txt',parent:'volume',size:'16 KB'},
 draft:{name:'来信.doc',path:'C:\\Users\\作者\\Downloads\\来信.doc',type:'doc',parent:'downloads',size:'62 KB'},
 html:{name:'小镇设定.html',path:'C:\\Users\\作者\\Downloads\\小镇设定.html',type:'html',parent:'downloads',size:'19 KB'},
 broken:{name:'下载中.zip',path:'C:\\Users\\作者\\Downloads\\下载中.zip',type:'zip',parent:'downloads',size:'240 KB',disabled:'不支持'},
 notes:{name:'人物笔记.txt',path:'C:\\Users\\作者\\Desktop\\人物笔记.txt',type:'txt',parent:'desktop',size:'6 KB'},
 'old-doc':{name:'旧稿.docx',path:'D:\\素材归档\\旧稿.docx',type:'docx',parent:'archive',size:'84 KB'},
 style:{name:'文风.md',path:'D:\\素材归档\\文风.md',type:'md',parent:'archive',size:'4 KB'},
 'old-outline':{name:'初版大纲.md',path:'C:\\Users\\作者\\Documents\\旧稿\\初版大纲.md',type:'md',parent:'archive-shortcut',size:'6 KB'},
};
let current='documents',selected=new Set(),confirmed=[],screen='picker',loading=false,loadSequence=0,changed=false,append=false,lastTrigger=null,folderClick=null;
const isFolder=item=>['folder','root'].includes(item.type);
const iconFor=item=>{if(isFolder(item))return icons.folder;const map={txt:'text',md:'markdown',doc:'word',docx:'word',pdf:'pdf',html:'html',htm:'html'};return map[item.type]?`<img src="assets/file-icons/${map[item.type]}.svg" alt="" data-format="${item.type}">`:icons.file};
const parentPath=item=>item.path.slice(0,Math.max(0,item.path.lastIndexOf('\\')))||item.path;
function breadcrumb(){const parents=[];for(let id=current;id;id=tree[id].parent)parents.unshift(id);return parents.map((id,index)=>`${index?'<span class="crumb-separator" aria-hidden="true">›</span>':''}<button data-navigate="${id}" ${id===current?'aria-current="location"':''}>${esc(tree[id].name)}</button>`).join('')}
function showToast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>{$('#toast').hidden=true},3200)}
function renderPlaces(){const places=[['documents','文档','folder'],['downloads','下载','download'],['desktop','桌面','desktop'],['c','本地磁盘 (C:)','drive'],['d','资料 (D:)','drive']];$('#places').innerHTML='<div class="place-group">常用位置</div>'+places.map(([id,name,icon],index)=>`${index===3?'<div class="place-group drives">此电脑</div>':''}<button class="place-button ${current===id?'active':''}" data-navigate="${id}" ${current===id?'aria-current="location"':''}>${icons[icon]}${name}</button>`).join('')}
function stateView(kind){const views={loading:['spinner','正在载入文件夹','正在读取当前文件夹中的项目。'],permission:['lock','无法访问这个文件夹','请检查访问权限，或选择其他位置。已经勾选的来源仍为你保留。'],missing:['alert','这个文件夹已不存在','它可能已被移动或删除。请返回上一级，重新选择来源。'],empty:['empty','这个文件夹是空的','可以选中当前文件夹，或返回上一级选择其他来源。'],search:['search','没有匹配的项目','试着换一个名称，或清空筛选查看当前文件夹。']};const [icon,title,copy]=views[kind];return `<div class="state-view" ${kind==='loading'?'role="status" aria-busy="true"':kind==='permission'||kind==='missing'?'role="alert"':''}>${icons[icon].replace('<svg ',`<svg class="${kind==='loading'?'spinner':''}" `)}<h3>${title}</h3><p>${copy}</p>${kind==='loading'?'<div class="state-actions"><button data-action="finish-loading">完成合成载入</button></div>':kind==='search'?'<div class="state-actions"><button data-action="clear-search">清空筛选</button></div>':kind==='permission'||kind==='missing'?'<div class="state-actions"><button data-action="go-up">返回上一级</button><button data-action="retry">重试</button></div>':''}</div>`}
function focusDirectory(){const target=$('#directory-content [data-entry]')||$('#directory-content');target.focus({preventScroll:true})}
function renderDirectory(){
 const active=document.activeElement,restoreFocus=$('#directory-content').contains(active)||$('#breadcrumbs').contains(active)||$('#places').contains(active),finish=()=>{if(restoreFocus)focusDirectory()};
 const directory=tree[current],query=$('#search').value.trim().toLocaleLowerCase(),ids=(directory.children||[]).filter(id=>tree[id].name.toLocaleLowerCase().includes(query));
 $('#breadcrumbs').innerHTML=breadcrumb();$('#up').disabled=!directory.parent;$('#current-folder').checked=selected.has(current);$('#current-folder').disabled=directory.type==='root'||!!directory.disabled||loading;$('#current-folder').setAttribute('aria-label',`选中当前文件夹 ${directory.name}`);
 $('#entry-count').textContent=loading?'':`${ids.length} 个项目`;renderPlaces();
 if(loading){$('#directory-content').innerHTML=stateView('loading');finish();return}if(directory.state){$('#directory-content').innerHTML=stateView(directory.state);finish();return}
 if(!ids.length){$('#directory-content').innerHTML=stateView(query?'search':'empty');finish();return}
 $('#directory-content').innerHTML=`<ul class="entries" aria-label="当前目录项目">${ids.map(id=>{const item=tree[id],folder=isFolder(item);return `<li class="entry ${selected.has(id)?'is-selected':''} ${item.disabled?'is-disabled':''}" data-entry="${id}" tabindex="0" aria-label="${esc(item.name)}，${folder?'文件夹':item.type.toUpperCase()+' 文件'}${item.disabled?'，'+item.disabled:''}" ${item.disabled?'aria-disabled="true"':''}><input type="checkbox" tabindex="-1" data-select="${id}" aria-label="选择 ${esc(item.name)}" ${selected.has(id)?'checked':''} ${item.disabled?'disabled':''}><span class="entry-icon">${iconFor(item)}</span><span class="entry-name" title="${esc(item.name)}">${esc(item.name)}</span><span class="entry-type">${item.disabled|| (folder?'文件夹':item.type.toUpperCase())}</span><span class="entry-size">${folder?'—':item.size}</span>${folder?`<button class="icon-button" data-navigate="${id}" aria-label="打开文件夹 ${esc(item.name)}" ${item.disabled==='受保护目录'?'disabled':''}>${icons.chevron}</button>`:'<span></span>'}</li>`}).join('')}</ul>`;finish();
}
function renderSelection(){const values=[...selected].map(id=>tree[id]),folders=values.filter(isFolder).length,files=values.length-folders;
 $('#selection-summary').textContent=values.length?`已选 ${files} 个文件 · ${folders} 个文件夹`:'尚未选择来源';$('#clear-selection').disabled=!values.length;$('#confirm-picker').disabled=!values.length||changed;
 $('#selection-content').className='selection-content';$('#selection-content').innerHTML=(values.length?`<ul class="selected-list" aria-label="全部已选来源">${[...selected].map(id=>{const item=tree[id];return `<li class="selected-item">${isFolder(item)?icons.folder:icons.file}<div class="selected-copy"><strong>${esc(item.name)}</strong><small title="${esc(item.path)}">${esc(parentPath(item))}</small></div><button class="icon-button" data-remove="${id}" aria-label="移除 ${esc(item.name)}">${icons.close}</button></li>`}).join('')}</ul>`:'<p class="selection-placeholder">在上方勾选文件或文件夹，跨目录选择也会保留在这里。</p>')+(changed?`<p class="selection-alert" role="alert">${icons.alert}<span>“创作大纲.md”已发生变化，请移除并重新选择。</span></p>`:'');
}
function render(){renderDirectory();renderSelection();$('#picker-title').textContent=append?'添加导入来源':'选择导入来源'}
function toggle(id){const item=tree[id];if(item.disabled||item.type==='root')return;selected.has(id)?selected.delete(id):selected.add(id);if(id==='outline'&&changed&&!selected.has(id))changed=false;$('#current-folder').checked=selected.has(current);document.querySelectorAll('[data-entry]').forEach(row=>{const checked=selected.has(row.dataset.entry);row.classList.toggle('is-selected',checked);row.querySelector('input').checked=checked});renderSelection();const row=$(`[data-entry="${id}"]`);row?.focus({preventScroll:true})}
function navigate(id,wait=false){if(!tree[id]||!isFolder(tree[id])||tree[id].disabled==='受保护目录')return;current=id;$('#search').value='';loading=wait;loadSequence++;render();$('#directory-content').scrollTop=0;focusDirectory();if(wait){const seq=loadSequence;setTimeout(()=>{if(seq===loadSequence){loading=false;renderDirectory()}},650)}}
function openPicker(){screen='picker';lastTrigger=document.activeElement;$('#picker').hidden=false;$('#result').hidden=true;$('#scrim').hidden=false;$('#workspace').inert=true;render();$('#close-picker').focus()}
function cancelPicker(){screen='entry';selected=new Set();changed=false;loading=false;loadSequence++;$('#picker').hidden=true;$('#result').hidden=true;$('#scrim').hidden=true;$('#workspace').inert=false;if(append&&confirmed.length)$('#workspace-message').innerHTML=`<span class="canvas-seal">印</span><h2>已保留 ${confirmed.length} 项导入来源</h2><p>取消添加不会改变已确认的来源。</p><button id="resume-source" class="primary">核对来源</button>`;else $('#workspace-message').innerHTML='<span class="canvas-seal">印</span><h2>把故事带到这里</h2><p>保留写下的每一段，再梳理故事里的世界。</p><button id="canvas-import" class="primary">导入作品</button>';(lastTrigger?.isConnected?lastTrigger:$('#import-entry')).focus();showToast(append?'已取消添加，原有来源保持不变。':'已取消选择，没有创建导入任务。')}
function showResult(){screen='result';$('#picker').hidden=true;$('#result').hidden=false;$('#scrim').hidden=false;$('#workspace').inert=true;
 $('#result').innerHTML=`<span class="eyebrow">导入作品 / 合成结果</span><h2 id="result-title">核对来源</h2><p class="result-note">以下仅演示所选项目如何进入来源核对。真实应用会在确认后读取文件，并展开文件夹中的文本。</p><ul class="result-list">${confirmed.map(id=>{const item=tree[id];return `<li>${iconFor(item)}<div><strong>${esc(item.name)}</strong><small>${esc(item.path)}${isFolder(item)?' · 将读取其中的支持文件':''}</small></div></li>`}).join('')}</ul><p class="result-note">合成预览没有读取文件，也没有执行内容识别。</p><div class="result-footer"><button data-action="review-selection">返回选择</button><button data-action="add-sources" class="primary">添加来源</button></div>`;
 $('#result [data-action="review-selection"]').focus();
}
function reset(scenario='normal'){selected=new Set();confirmed=[];current='documents';screen='picker';loading=false;loadSequence++;changed=false;append=false;$('#search').value='';$('#toast').hidden=true;
 if(scenario==='mixed'){selected=new Set(['novel','character','style']);current='archive'}
 if(scenario==='loading')loading=true;
 if(scenario==='permission'){selected=new Set(['outline']);current='locked'}
 if(scenario==='missing'){selected=new Set(['character']);current='missing'}
 if(scenario==='empty')current='empty';
 if(scenario==='changed'){selected=new Set(['outline','character']);changed=true}
 if(scenario==='append'){confirmed=['body'];append=true}
 openPicker();
}
$('#up').innerHTML=icons.up;$('#close-picker').innerHTML=icons.close;$('#search-icon').innerHTML=icons.search;
$('#theme').addEventListener('change',event=>document.documentElement.className=event.target.value);
$('#scenario').addEventListener('change',event=>reset(event.target.value));$('#reset').addEventListener('click',()=>reset($('#scenario').value));
$('#search').addEventListener('input',()=>renderDirectory());$('#current-folder').addEventListener('change',()=>toggle(current));$('#clear-selection').addEventListener('click',()=>{selected.clear();changed=false;render();focusDirectory()});
$('#close-picker').addEventListener('click',cancelPicker);$('#cancel-picker').addEventListener('click',cancelPicker);$('#up').addEventListener('click',()=>{if(tree[current].parent)navigate(tree[current].parent,true)});
$('#confirm-picker').addEventListener('click',()=>{if(!selected.size||changed)return;confirmed=append?[...new Set([...confirmed,...selected])]:[...selected];showResult()});
document.addEventListener('click',event=>{
 const target=event.target.closest('button,[data-entry],input');if(!target)return;
 if(target.matches('[data-navigate]')){navigate(target.dataset.navigate,true);return}
 if(target.matches('[data-remove]')){const id=target.dataset.remove,index=[...document.querySelectorAll('[data-remove]')].indexOf(target);selected.delete(id);if(id==='outline')changed=false;render();const remaining=[...document.querySelectorAll('[data-remove]')];if(remaining.length)remaining[Math.min(index,remaining.length-1)].focus();else focusDirectory();return}
 if(target.matches('[data-select]')){toggle(target.dataset.select);return}
 if(target.matches('[data-entry]')){const id=target.dataset.entry;if(isFolder(tree[id])){if(event.detail===1){folderClick={id,wasSelected:selected.has(id)};toggle(id)}}else toggle(id);return}
 if(['import-entry','canvas-import'].includes(target.id)){if(confirmed.length){showResult();return}append=false;selected=new Set();openPicker();return}
 if(target.id==='resume-source'){showResult();return}
 const action=target.dataset.action;
 if(action==='finish-loading'){loading=false;renderDirectory()}
 if(action==='clear-search'){$('#search').value='';renderDirectory();$('#search').focus()}
 if(action==='go-up'&&tree[current].parent)navigate(tree[current].parent,true);
 if(action==='retry'){loading=true;renderDirectory();const seq=++loadSequence;setTimeout(()=>{if(seq===loadSequence){loading=false;renderDirectory()}},650)}
 if(action==='review-selection'){append=false;selected=new Set(confirmed);openPicker()}
 if(action==='add-sources'){append=true;selected=new Set();openPicker()}
});
$('#directory-content').addEventListener('dblclick',event=>{const row=event.target.closest('[data-entry]');if(row&&isFolder(tree[row.dataset.entry])&&!event.target.closest('button,input')){const id=row.dataset.entry;if(folderClick?.id===id){folderClick.wasSelected?selected.add(id):selected.delete(id);folderClick=null}navigate(id,true)}});
document.addEventListener('keydown',event=>{
 const region=screen==='picker'?$('#picker'):screen==='result'?$('#result'):null;
 if(!region||!region.contains(event.target))return;
 if(event.key==='Escape'){event.preventDefault();if(screen==='picker')cancelPicker();else{screen='entry';$('#result').hidden=true;$('#scrim').hidden=true;$('#workspace').inert=false;$('#import-entry').focus()}return}
 const row=event.target.closest('[data-entry]');
 if(row&&event.target===row){if(event.key===' '){event.preventDefault();toggle(row.dataset.entry)}if(event.key==='Enter'){event.preventDefault();isFolder(tree[row.dataset.entry])?navigate(row.dataset.entry,true):toggle(row.dataset.entry)}if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();const rows=[...$('#directory-content').querySelectorAll('[data-entry]')],index=rows.indexOf(row);rows[event.key==='Home'?0:event.key==='End'?rows.length-1:Math.max(0,Math.min(rows.length-1,index+(event.key==='ArrowUp'?-1:1)))].focus()}}
 if(event.key==='Tab'){const focusable=[...region.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')].filter(element=>element.getClientRects().length);if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&event.target===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&event.target===last){event.preventDefault();first.focus()}}
});
// Exposes only synthetic state for scoped design checks; never a product bridge.
window.pickerReview={state:()=>({current,selected:[...selected],confirmed:[...confirmed],screen,loading,changed,append}),reset};
reset();
