/* 导入作品分步向导审核稿。所有数据为本地合成示例（见 03-ui-design.md"示例值"），不访问文件、网络或模型。 */
'use strict'
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)]
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const icon=(n,c='')=>`<i data-lucide="${n}" class="${c}" aria-hidden="true"></i>`,sr=t=>`<span class="sr">${t}</span>`
const KINDS=['正文','大纲','角色','场景','物品','世界观','主题','文风','金手指','爽点/泪点','伏笔','世界线','叙事线']
const FOUND={正文:'4 个片段',大纲:'识别到 1 处',角色:'识别到 12 处',世界观:'识别到 3 处'}
const TARGETS=KINDS.filter(k=>k!=='正文')
function cn(n){const d='零一二三四五六七八九';if(n<10)return d[n];if(n<20)return '十'+(n%10?d[n%10]:'');return d[Math.floor(n/10)]+'十'+(n%10?d[n%10]:'')}
const VOLS=[['第一部 灯塔',24],['第二部 面具',30],['第三部 远航',28],['第四部 不眠',22],['第五部 赤潮',20],['第六部 追光',12],['第七卷 倒影',14]].map(([t,n],v)=>({id:'v'+v,title:t,chapters:Array.from({length:n},(_,i)=>({id:`v${v}c${i}`,title:`第${cn(i+1)}章 ${['雾港','夜钟','旧信','钥匙','回声','潮汐','灰烬','铜灯','星图','暗门'][(i+v)%10]}`}))}))
VOLS.push({id:'tail',title:'未分卷',loose:true,chapters:[{id:'t0',title:'完本感言（上）'},{id:'t1',title:'完本感言（下）'},{id:'t2',title:'番外 · 寻常日子（一）'},{id:'t3',title:'番外 · 寻常日子（二）'}]})
const NO_CHAPTERS=[{id:'tail',title:'未分卷',loose:true,chapters:[{id:'all',title:'正文（未识别到章节标题）'}]}]
const CHARS=[['林默','主角','资料 + 正文',203,'灯塔看守、守夜人'],['艾琳','配角','正文',121,'艾琳·温特'],['老约翰','配角','正文',88,'约翰叔'],['白鸦','反派','资料 + 正文',64,'无名者'],['薇拉','配角','正文',59,''],['卡尔文','配角','正文',41,'卡尔'],['灰袍主教','反派','正文',37,'主教'],['小汤姆','配角','正文',22,''],['莫莉','配角','正文',18,''],['哈罗德','配角','正文',9,'']]
const SCENES=[['雾港城',null,140],['灯塔区','雾港城',96],['钟楼街','雾港城',51],['旧码头','雾港城',33],['北境要塞',null,40],['镜海',null,27],['海底神殿','镜海',12]]
const ITEMS=[['铜灯',58,'封印物'],['星图残页',31,'线索'],['黑羽怀表',24,'封印物'],['银钥匙',12,'信物'],['灰烬戒指',7,'封印物']]
const worldsSeed=()=>[{id:'w0',name:'雾海世界',items:[['等级体系','非凡序列（九级）'],['力量体系','途径与仪式'],['社会环境','王国议会与教会'],['人文环境','雾港民俗与信仰'],['地理','北大陆与镜海'],['势力','守夜人、灰袍会']],children:[{id:'w1',name:'梦境层',items:[['概念','梦境与灵性'],['地理','七层梦境']],children:[]}]}].map(function norm(w){return {...w,items:w.items.map(([type,name],k)=>({id:w.id+':'+k,type,name,on:true})),children:w.children.map(norm)}})
const FAIL_ID='c4'
const STEPS=[['entry','选择来源',0,'list'],['files','确认文件',0,'list'],['work','作品与目录',0,'list'],['kinds','选择内容',0,'list'],['detect-struct','识别卷章',1,'auto'],['tree','选择卷章',1,'list'],['import-struct','导入大纲结构',1,'auto'],['import-body','导入正文',1,'auto'],['detect-char','识别角色',2,'detect'],['import-char','导入角色',2,'import'],['detect-scene','识别场景',2,'detect'],['import-scene','导入场景',2,'import'],['detect-item','识别物品',2,'detect'],['import-item','导入物品',2,'import'],['detect-world','识别世界观',3,'detect'],['import-world','导入世界观',3,'import'],['worldline','导入世界线',4,'auto'],['narrative','导入叙事线',4,'auto'],['outline','补充细纲',4,'auto'],['foreshadow','导入伏笔',4,'auto'],['verify','校验',5,'final'],['done','完成',5,'final']].map(([id,title,stage,type])=>({id,title,stage,type}))
const STAGES=['准备','结构与正文','角色 · 场景 · 物品','世界观','剧情','校验与完成']
let S,timers=[]
const at=id=>STEPS.findIndex(s=>s.id===id),step=()=>STEPS[S.i]
function fresh(scenario='normal',fail=true){
 const vols=scenario==='nochapters'?NO_CHAPTERS:VOLS
 return {i:0,scenario,fail,vols,files:[{name:'雾港夜行.txt',chars:'4,803,440',enc:'GB18030',inc:true},{name:'人物设定.md',chars:'18,240',enc:'UTF-8',inc:true}],encOpen:null,
  source:new Set(Object.keys(FOUND)),targets:new Set(TARGETS),open:new Set(['v0','tail']),wopen:new Set(['w0','w1']),chapters:new Set(vols.flatMap(v=>v.chapters.map(c=>c.id))),q:'',composing:false,
  chars:CHARS.map(([name,role,from,n,alias],i)=>({id:'c'+i,name,role,from,n,alias,on:true})),scenes:SCENES.map(([name,parent,n],i)=>({id:'s'+i,name,parent,n,on:true})),items:ITEMS.map(([name,n,type],i)=>({id:'i'+i,name,n,type,on:true})),
  worlds:worldsSeed(),gen:{avatar:false,portrait:false,exterior:false,interior:false,icon:false},runs:{},skippedItems:[],detecting:false,detectFailed:false,detectRetried:false,title:'雾港夜行',dir:'',paused:false,collapsed:false,railOpen:false,modal:null,sub:null,details:new Set(),editRole:null,returnTo:null,conflictResolved:false,brokenFixed:false}
}
const hasModel=()=>S.scenario!=='nomodel',hasImageModel=()=>S.scenario!=='nomodel',imgKinds=kind=>GEN[kind].filter(t=>S.gen[t]),body=()=>S.source.has('正文')
const infer=k=>hasModel()&&body()&&S.targets.has(k)
const uses=k=>S.source.has(k)||infer(k)
function skipped(s){if(s.id==='outline')return !infer('大纲');const map={'detect-char':'角色','import-char':'角色','detect-scene':'场景','import-scene':'场景','detect-item':'物品','import-item':'物品','detect-world':'世界观','import-world':'世界观',worldline:'世界线',narrative:'叙事线',foreshadow:'伏笔'};return !!map[s.id]&&!uses(map[s.id])}
const charList=()=>hasModel()?S.chars:S.chars.filter(c=>c.from.includes('资料'))
/* 每类实体可自动生成的图像，与现有业务面板的图像类型一致。 */
const GEN={char:['avatar','portrait'],scene:['exterior','interior'],item:['icon']}
const IMG={avatar:'头像',portrait:'立绘',exterior:'外景图',interior:'内景图',icon:'物品图标'}
const IMG_ICON={avatar:'circle-user-round',portrait:'image',exterior:'mountain',interior:'house',icon:'gem'}
const IMG_DESC={char:'角色外观描述',scene:'场景外观与内部描述',item:'物品外观描述'}
const ENT={char:{list:charList,label:'角色',icon:'user-round',hint:'只列名称与类型。导入时包含身份、外观、心理、能力、弧线与人物关系。'},scene:{list:()=>S.scenes,label:'场景',icon:'map-pin',hint:'按地点层级列出。'},item:{list:()=>S.items,label:'物品',icon:'gem',hint:'只列重要物品：模型判定重要，或在所选章节出场不少于 3 章。'}}
const walk=(ws,fn,depth=0,parent=null)=>ws.forEach(w=>{fn(w,depth,parent);walk(w.children,fn,depth+1,w)})
const worldItems=w=>[...w.items,...w.children.flatMap(worldItems)]
function post(m){parent!==window&&parent.postMessage(m,'*')}
function clear(){timers.forEach(t=>{clearInterval(t);clearTimeout(t)});timers=[]}
function go(i){clear();S.i=Math.max(0,Math.min(STEPS.length-1,i));S.q='';S.paused=false;S.modal=null;S.sub=null;S.detectFailed=false;const s=step()
 S.detecting=(s.type==='detect'||s.id==='detect-struct')&&!skipped(s)
 if(S.detecting)timers.push(setTimeout(()=>{S.detecting=false;if(s.id==='detect-char'&&S.fail&&!S.detectRetried){S.detectFailed=true;render();return}if(s.id==='detect-struct')go(at('tree'));else render()},1000))
 render();post({type:'at',step:s.id})}
const next=()=>go(S.i+1)
/* 重渲染后把焦点还给同一控件，避免勾选后焦点回到 body。 */
function focusKey(){const a=document.activeElement;if(!a||a===document.body)return null;for(const k of Object.keys(a.dataset??{}))return `[data-${k.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())}="${CSS.escape(a.dataset[k])}"]`;return a.id?'#'+a.id:null}
function render(){
 const key=focusKey(),s=step()
 $('#title').textContent=s.title;$('#desc').textContent=desc(s.id)
 $('#stages').innerHTML=STAGES.map((t,i)=>`<li ${i===s.stage?'aria-current="step"':''} ${i<s.stage?'data-done':''}><span>${i+1}</span>${t}</li>`).join('')
 $('#stage-now').textContent=`阶段 ${s.stage+1} / 6 · ${STAGES[s.stage]} · 第 ${S.i+1} / ${STEPS.length} 步`
 const v=S.modal?MODALS[S.modal]():VIEWS[s.id]();$('#body').innerHTML=v.body;$('#foot').innerHTML=v.foot;const af=$('#after');af.innerHTML=v.after??'';af.hidden=!v.after
 $('#overlay').hidden=S.collapsed;const task=$('#task');task.hidden=!S.collapsed
 const waiting=!S.modal&&['list','detect'].includes(s.type)&&!S.detecting&&s.id!=='entry'||S.sub==='conflict'
 task.textContent=`导入作品 · 第 ${S.i+1} 步 ${s.title}${S.paused?' · 已暂停':waiting?' · 等待确认':''} · ${S.title}`
 bind();window.lucide?.createIcons({attrs:{'stroke-width':1.7}})
 if(key){const el=$(key);if(el)el.focus()}
}
function desc(id){return {entry:'选择要导入的小说文件或文件夹。',files:'确认要导入的文件。文本编码已自动识别。',work:'填写作品名称，选择保存新作品的空目录。',kinds:'选择从文件导入的内容，以及根据正文补充推断的内容。','detect-struct':'快速识别卷章结构。',tree:'取消不需要导入的卷或章。未选中的卷章不会进入后续任何步骤。','import-struct':'写入所选卷章的结构，不含细纲。','import-body':'逐字拷贝所选章节正文。','detect-char':'快速列出所选章节中的角色。','import-char':'多个代理同时导入所选角色。','detect-scene':'快速列出场景。','import-scene':'同时导入所选场景。','detect-item':'只列出重要物品。','import-item':'同时导入所选物品。','detect-world':'按世界列出等级、力量、社会、人文等设定。','import-world':'同时导入所选世界观与其他设定。',worldline:'整理事件发生顺序。',narrative:'整理讲述顺序。',outline:'为所选章节补充章级细纲。',foreshadow:'识别伏笔并关联触点。',verify:'检查导入结果的完整性与一致性。',done:'作品已保存。'}[id]??''}

/* 步骤总览默认收起为一行；展开后显示全部步骤状态。 */
function rail(){const list=STEPS.map((x,k)=>{const st=skipped(x)?'skip':k<S.i?'done':k===S.i?'now':'wait';return `<li data-s="${st}"><b>${k+1}</b>${st==='done'?icon('check'):st==='now'?icon('loader-circle','sp'):''}${x.title}${sr({skip:'，已跳过',done:'，已完成',now:'，进行中',wait:''}[st])}</li>`}).join('')
 return `<div class="railbox"><button class="railtoggle" data-rail aria-expanded="${S.railOpen}">${icon('list-checks')}第 ${S.i+1} / ${STEPS.length} 步 · ${step().title}<span>${S.railOpen?'收起全部步骤':'查看全部步骤'}</span></button>${S.railOpen?`<ol class="rail">${list}</ol>`:''}</div>`}
const backBtn=(label='上一步')=>`<button class="btn ghost" data-act="back">${label}</button>`
const nextBtn=(label='继续',dis=false)=>`<button class="btn primary" data-act="next" ${dis?'disabled':''}>${label}</button>`
const reviseBtn=()=>`<button class="btn ghost" data-act="revise">返回修改选择</button>`
function pauseFoot(extra=''){return `<button class="btn ghost" data-act="stop">停止导入</button>${reviseBtn()}<span class="note">可以收起窗口，导入在后台继续</span>${extra}<button class="btn" data-act="collapse">收起</button><button class="btn" data-act="pause">${S.paused?icon('play')+'继续导入':icon('pause')+'暂停'}</button>`}
const skipNote=t=>({body:rail()+`<div class="notice"><strong>已跳过</strong>${t}</div>`,foot:''})
const progress=(done,total,label)=>`<div class="prog"><div class="bar" role="progressbar" aria-label="${esc(step().title)}进度" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><i style="width:${total?done/total*100:0}%"></i></div><span aria-live="polite" id="live">${label}</span></div>`
function detecting(t){return {body:`<div class="hero">${icon('loader-circle','sp')}<h3>${t}</h3><p>只返回名称清单，不在此步骤导入。</p></div>`,foot:`<button class="btn ghost" data-act="stop">停止导入</button>${S.i>at('tree')?reviseBtn():backBtn()}<span class="note">识别完成后可逐项选择</span><button class="btn" data-act="collapse">收起</button>`}}
function detectFailed(label){return {body:rail()+`<div class="notice err" role="alert"><strong>${icon('circle-alert')}${label}识别失败</strong>模型服务返回请求频率限制提示。已识别的内容没有丢失。</div>`,foot:`${reviseBtn()}<span class="note"></span><button class="btn" data-skip-step>跳过此步骤</button><button class="btn primary" data-redetect>重新识别</button>`}}
const VIEWS={
 entry:()=>({body:`<div class="hero">${icon('book-up-2')}<h3>导入已有作品</h3><p>支持 txt、md、doc、docx、pdf、html。来源文件只读，导入到新的空目录。</p><div class="row-c"><button class="btn primary" data-act="next">${icon('file')}选择文件</button><button class="btn" data-act="next">${icon('folder-open')}选择文件夹</button></div></div>`,foot:`<span class="note">系统选择器为示意，本稿不读取文件</span>`}),
 files:()=>({body:`<h3>选中的文件</h3><p class="m">按下列顺序合并。</p><div class="files">${S.files.map((f,i)=>`<div class="file"><input type="checkbox" aria-label="纳入 ${esc(f.name)}" data-file="${i}" ${f.inc?'checked':''}><span class="ficon" aria-hidden="true">${f.name.split('.').pop().toUpperCase()}</span><div class="meta"><strong>${esc(f.name)}</strong><span>${f.chars} 字符 · ${f.enc}（自动识别）${S.encOpen===i?'':` <button class="lk" data-encopen="${i}">编码不对？</button>`}</span>${S.encOpen===i?`<label class="enc">改用<select aria-label="${esc(f.name)} 编码" data-encsel="${i}">${['UTF-8','UTF-16 LE','UTF-16 BE','GB18030'].map(e=>`<option ${e===f.enc?'selected':''}>${e}</option>`).join('')}</select></label>`:''}</div><button class="btn sm ghost">核对原文</button></div>`).join('')}</div><div class="notice"><strong>正文逐字拷贝</strong>来源文件不会被修改。编码按文件内容自动识别，无需确认；只有识别结果不对时才需要改。</div>`,foot:`<button class="btn ghost" data-act="stop">取消</button><button class="btn ghost">添加来源</button><span class="note">${S.files.filter(f=>f.inc).length} 个文件纳入导入</span>${nextBtn('继续',!S.files.some(f=>f.inc))}`}),
 work:()=>({body:`<div class="form"><label>作品名称<input data-title value="${esc(S.title)}" maxlength="100"></label></div><p class="m" style="margin-top:6px">默认取第一个文件名，可修改。</p><div class="dir"><div><h3>保存到新的空目录</h3><p class="m" style="margin:0">${S.dir||'请选择用来保存新作品的空目录。目录不能与来源文件重叠。'}</p></div><button class="btn" data-dir>${icon('folder-open')}选择目录</button></div><p class="m" style="margin-top:12px">作品在全部导入并校验通过后才写入此目录；中途停止只保留草稿。</p>`,foot:`${backBtn()}<span class="note"></span>${nextBtn('继续',!S.dir||!S.title.trim())}`}),
 kinds:()=>{const b=body(),m=hasModel(),can=b&&m;return {body:`<h3>从文件导入</h3><p class="m">已在文件中识别到的内容默认勾选。</p><div class="kinds">${KINDS.map(k=>`<label class="kind ${FOUND[k]?'':'off'}"><input type="checkbox" data-src="${k}" ${S.source.has(k)?'checked':''} ${FOUND[k]?'':'disabled'}>${k}<small>${FOUND[k]??'未识别到'}</small></label>`).join('')}</div><div class="sep"></div><h3>根据正文补充推断</h3><p class="m">${!m?'尚未配置模型，只能按原文拷贝。':b?'缺少的内容根据所选章节推断；资料与正文矛盾时由你决定。':'未选择正文，无法推断。'}</p>${!m?`<button class="btn sm" style="margin-bottom:12px">${icon('settings')}配置模型</button>`:''}<div class="cards">${TARGETS.map(k=>`<label class="card ${S.targets.has(k)&&can?'on':''} ${can?'':'dis'}"><input type="checkbox" data-tgt="${k}" ${S.targets.has(k)&&can?'checked':''} ${can?'':'disabled'}><span><strong>${k}</strong><small>${k==='大纲'?'补充章级细纲':k==='世界线'||k==='叙事线'?'根据整书整理':k==='伏笔'?'关联正文、大纲与线索':FOUND[k]?'核对并补全资料':'根据正文分析'}</small></span></label>`).join('')}</div>`,foot:`${backBtn()}${body()?'':`<span class="note">${hasModel()?'未选正文：只拷贝所选资料，不发送正文':'仅拷贝原文'}</span>`}${nextBtn(body()?'识别卷章':'开始导入',!S.source.size)}`}},
 'detect-struct':()=>!body()?(timers.push(setTimeout(()=>go(at('import-struct')),500)),skipNote('未选择正文，不需要卷章。')):{body:`<div class="hero">${icon('loader-circle','sp')}<h3>正在识别卷章结构</h3><p>按"第X部""第X卷""第X章"等标题识别；无法确定时使用模型核对。</p></div>`,foot:`<button class="btn ghost" data-act="stop">停止导入</button>${backBtn()}<span class="note"></span><button class="btn" data-act="collapse">收起</button>`},
 tree:()=>tree(),
 'import-struct':()=>auto(`写入 ${volsOn()} 卷 ${S.chapters.size} 章的卷名、章名与顺序（不含细纲）`),
 'import-body':()=>auto(`逐字拷贝所选 ${S.chapters.size} 章正文`),
 'detect-char':()=>skipped(step())?(timers.push(setTimeout(()=>go(S.i+2),600)),skipNote('未选择导入或推断角色。')):S.detecting?detecting('正在识别角色'):S.detectFailed?detectFailed('角色'):pick('char'),
 'import-char':()=>run('char'),
 'detect-scene':()=>skipped(step())?(timers.push(setTimeout(()=>go(S.i+2),600)),skipNote('未选择导入或推断场景。')):S.detecting?detecting('正在识别场景'):pick('scene'),'import-scene':()=>run('scene'),
 'detect-item':()=>skipped(step())?(timers.push(setTimeout(()=>go(S.i+2),600)),skipNote('未选择导入或推断物品。')):S.detecting?detecting('正在识别重要物品'):pick('item'),'import-item':()=>run('item'),
 'detect-world':()=>skipped(step())?(timers.push(setTimeout(()=>go(S.i+2),600)),skipNote('未选择世界观。')):S.detecting?detecting('正在识别世界观'):worldPick(),'import-world':()=>run('world'),
 worldline:()=>auto('结合所选章节与已导入设定整理世界事件'),narrative:()=>auto('按章节整理讲述卡与视角'),outline:()=>auto(`为所选 ${S.chapters.size} 章补充细纲`),
 foreshadow:()=>foreshadow(),verify:()=>verify(),done:()=>done(),
}
const volsOn=()=>S.vols.filter(v=>v.chapters.some(c=>S.chapters.has(c.id))).length
/* 发送范围与授权放在选择卷章页底部，点"允许分析并导入"即一次授权第 7–21 步。 */
function scope(n){return hasModel()?`<details class="scope"><summary>${icon('send')}发送范围：所选 ${n} 章正文及资料文件 · 文本模型与审核模型（读取已配置的模型）</summary><p class="m">用于识别角色、场景、物品、世界观，推断世界线、叙事线、细纲与伏笔，并复核一致性。一次授权覆盖后续全部步骤；暂停或重开应用后需要重新允许。同时进行的导入数：4。</p></details>`:`<div class="scope">${icon('info')}尚未配置模型：仅拷贝所选 ${n} 章正文、卷章结构和资料文件中的设定，不向模型发送内容。<button class="lk">配置模型</button></div>`}
function tree(){
 const all=S.vols.flatMap(v=>v.chapters),n=all.filter(c=>S.chapters.has(c.id)).length,q=S.q.trim()
 if(S.scenario==='nochapters')return {body:`<div class="notice"><strong>${icon('circle-alert')}没有识别到卷章标题</strong>全部正文将作为一章导入。可以手动调整卷章，按字符位置添加章节起点。</div><div class="tree"><ul aria-label="卷章"><li aria-expanded="true"><div class="node vol"><input type="checkbox" checked disabled aria-label="未分卷"><span class="name">未分卷</span><span class="sub">1 / 1 章</span></div><ul><li><div class="node ch"><input type="checkbox" checked disabled aria-label="正文"><span class="name">正文（未识别到章节标题）</span></div></li></ul></li></ul></div>`,foot:`${backBtn()}<span class="note"></span><button class="btn">${icon('sliders-horizontal')}手动调整卷章</button>${nextBtn(hasModel()?'作为一章，允许分析并导入':'作为一章开始导入')}`,after:scope(1)}
 const list=S.vols.map(v=>{const vis=v.chapters.filter(c=>!q||c.title.includes(q)),scope=q?vis:v.chapters,on=scope.filter(c=>S.chapters.has(c.id)).length,allOn=v.chapters.filter(c=>S.chapters.has(c.id)).length,mixed=on>0&&on<scope.length,open=S.open.has(v.id)||!!q;if(q&&!vis.length)return ''
  return `<li aria-expanded="${open}"><div class="node vol"><button class="tw" data-tw="${v.id}" aria-expanded="${open}" aria-label="${open?'收起':'展开'} ${esc(v.title)}">${icon('chevron-down')}</button><input type="checkbox" data-vol="${v.id}" ${on===scope.length?'checked':''} ${mixed?'data-mixed':''} aria-label="${q?'选择匹配的章节：':'选择 '}${esc(v.title)}"><span class="name">${esc(v.title)}</span>${v.loose?'<span class="tag">无卷标题</span>':''}<span class="sub">${allOn} / ${v.chapters.length} 章</span></div>${open?`<ul>${vis.map(c=>`<li><div class="node ch ${S.chapters.has(c.id)?'':'off'}"><input type="checkbox" data-ch="${c.id}" ${S.chapters.has(c.id)?'checked':''} aria-label="选择 ${esc(c.title)}"><span class="name">${esc(c.title)}</span><button class="lk">查看</button></div></li>`).join('')}</ul>`:''}</li>`}).join('')
 return {body:`<div class="toolbar"><input class="search" data-q placeholder="搜索章名" value="${esc(S.q)}" aria-label="搜索章名"><button class="btn sm" data-all="1">全选</button><button class="btn sm" data-all="0">全不选</button><button class="btn sm ghost" data-expand="${S.open.size?0:1}">${icon('chevrons-down-up')}${S.open.size?'全部收起':'全部展开'}</button><button class="btn sm ghost">${icon('sliders-horizontal')}手动调整卷章</button><span class="count" aria-live="polite">已选 ${n} / ${all.length} 章 · ${volsOn()} 卷</span></div>${q?'<p class="m">搜索时，卷复选框只作用于匹配的章节。</p>':''}<div class="tree"><ul aria-label="卷章">${list||'<li class="empty">没有匹配的章节</li>'}</ul></div>`,foot:`${backBtn()}<span class="note">${n?'未选中的卷章，其正文、细纲、推断设定与伏笔均不导入':'请至少选择一章'}</span>${nextBtn(hasModel()?'允许分析并导入':'开始导入',!n)}`,after:scope(n)}
}
function auto(text){
 if(skipped(step())){timers.push(setTimeout(next,600));return skipNote(step().id==='outline'?'未选择补充细纲。':'此内容未选择导入或推断。')}
 const id=step().id,r=S.runs[id]??={p:0};if(r.p<100&&!S.paused)timers.push(setInterval(()=>{r.p=Math.min(100,r.p+(id.startsWith('import')?25:9));const b=$('.bar');if(b){b.setAttribute('aria-valuenow',r.p);b.firstChild.style.width=r.p+'%'}const t=$('#live');if(t&&r.p%27<10)t.textContent=r.p+'%';if(r.p>=100){clear();timers.push(setTimeout(next,400))}},260))
 return {body:rail()+`<h3>${step().title}</h3><p class="m">${text}</p>${progress(r.p,100,S.paused?`已暂停 · ${r.p}%`:r.p+'%')}`,foot:pauseFoot()}
}
const ROLE_TAG={主角:'p',配角:'',反派:'a'}
function pick(kind){
 const e=ENT[kind],list=e.list(),n=list.filter(x=>x.on).length,q=S.q.trim()
 if(!list.length)return {body:`<div class="notice"><strong>未识别到${e.label}</strong>所选章节和资料中没有找到可导入的${e.label}。</div>`,foot:`${reviseBtn()}<span class="note"></span><button class="btn" data-redetect>重新识别</button>${nextBtn('跳过')}`}
 const row=x=>{if(q&&!(x.name+(x.alias??'')).includes(q))return ''
  const open=S.details.has(x.id),detail=kind==='char'?[x.alias&&'别名：'+x.alias,`出场 ${x.n} 章`,'来源：'+x.from]:kind==='scene'?[x.parent&&'上级：'+x.parent,`出场 ${x.n} 章`]:[`出场 ${x.n} 章`]
  const tag=kind==='char'?(S.editRole===x.id?`<select class="role" data-role="${x.id}" aria-label="${esc(x.name)} 类型">${['主角','配角','反派'].map(r=>`<option ${r===x.role?'selected':''}>${r}</option>`).join('')}</select>`:`<button class="tag ${ROLE_TAG[x.role]} tagbtn" data-edit-role="${x.id}" aria-label="${esc(x.name)}：${x.role}，点击修改类型">${x.role}</button>`):kind==='item'?`<span class="tag">${esc(x.type)}</span>`:''
  return `<div class="node ${kind==='scene'&&x.parent?'ch':''} ${x.on?'':'off'}"><input type="checkbox" data-pick="${x.id}" ${x.on?'checked':''} aria-label="选择 ${esc(x.name)}"><span class="name">${esc(x.name)}</span>${tag}<button class="lk ml" data-detail="${x.id}" aria-expanded="${open}">${open?'收起':'详情'}</button></div>${open?`<div class="detail">${detail.filter(Boolean).join(' · ')}</div>`:''}`}
 const back=S.i-1>at('tree')?reviseBtn():backBtn()
 const im=hasImageModel(),gen=`<fieldset class="genopts"><legend>导入后自动生成</legend>${GEN[kind].map(t=>`<label class="${im?'':'off'}"><input type="checkbox" data-gen="${t}" ${S.gen[t]?'checked':''} ${im?'':'disabled'}>${icon(IMG_ICON[t])}生成${IMG[t]}</label>`).join('')}<small>${im?`为每个导入成功的${e.label}各生成一张。勾选并开始导入即允许把${IMG_DESC[kind]}发送给图像模型（读取已配置的图像模型）；之后可在${e.label}面板重新生成。`:'尚未配置图像模型。'}</small>${im?'':'<button class="lk">配置模型</button>'}</fieldset>`
 const what=imgKinds(kind).length?`并生成${imgKinds(kind).map(k=>IMG[k]).join('与')}`:''
 return {body:`<p class="m">${e.hint}${!hasModel()?' 未配置模型，清单只来自资料文件。':''}</p>${gen}<div class="toolbar"><input class="search" data-q placeholder="搜索名称或别名" value="${esc(S.q)}" aria-label="搜索名称或别名"><button class="btn sm" data-pall="1">全选</button><button class="btn sm" data-pall="0">全不选</button>${kind==='char'?'<button class="btn sm ghost" disabled title="勾选两项后可合并">合并为同一角色</button>':''}<span class="count" aria-live="polite">已选 ${n} / ${list.length}</span></div><div class="tree list">${list.map(row).join('')||'<div class="empty">没有匹配的名称</div>'}</div>`,foot:`${back}<span class="note">${n?'':'未选择任何'+e.label+'，将跳过导入'}</span>${nextBtn(n?`导入 ${n} 个${e.label}${what}`:'跳过')}`}
}
function worldPick(){
 const items=S.worlds.flatMap(worldItems),n=items.filter(x=>x.on).length
 const nodes=(ws,depth)=>ws.map(w=>{const all=worldItems(w),on=all.filter(x=>x.on).length,open=S.wopen.has(w.id)
  return `<li aria-expanded="${open}"><div class="node vol" style="padding-left:${12+depth*28}px"><button class="tw" data-wtw="${w.id}" aria-expanded="${open}" aria-label="${open?'收起':'展开'} ${esc(w.name)}">${icon('chevron-down')}</button><input type="checkbox" data-world="${w.id}" ${on===all.length?'checked':''} ${on&&on<all.length?'data-mixed':''} aria-label="选择 ${esc(w.name)} 及其下全部设定">${icon('globe')}<span class="name">${esc(w.name)}</span><span class="sub">${on} / ${all.length}</span></div>${open?`<ul>${w.items.map(x=>`<li><div class="node ${x.on?'':'off'}" style="padding-left:${42+depth*28}px"><input type="checkbox" data-witem="${x.id}" ${x.on?'checked':''} aria-label="选择 ${esc(x.type)}：${esc(x.name)}"><span class="tag">${x.type}</span><span class="name">${esc(x.name)}</span></div></li>`).join('')}${nodes(w.children,depth+1)}</ul>`:''}</li>`}).join('')
 return {body:`<p class="m">世界下列出识别到的设定类型。取消世界将取消其下全部设定与子世界。</p><div class="toolbar"><button class="btn sm" data-wall="1">全选</button><button class="btn sm" data-wall="0">全不选</button><span class="count" aria-live="polite">已选 ${n} / ${items.length} 项</span></div><div class="tree"><ul aria-label="世界观">${nodes(S.worlds,0)}</ul></div>`,foot:`${reviseBtn()}<span class="note">主题、文风、金手指、爽点/泪点在世界观之后单独成组导入</span>${nextBtn(n?`导入 ${n} 项世界观`:'跳过')}`}
}
function entities(kind){
 if(kind==='world'){const out=[];walk(S.worlds,(w,d,p)=>w.items.filter(x=>x.on).forEach(x=>out.push({id:x.id,name:x.name,grp:(p?p.name+' · ':'')+w.name,ic:'globe'})));['主题','文风','金手指','爽点/泪点'].filter(uses).forEach(k=>out.push({id:'o'+k,name:k,grp:'其他设定',ic:'sparkles'}));return out}
 return ENT[kind].list().filter(x=>x.on).map(x=>({id:x.id,name:x.name,grp:null,ic:ENT[kind].icon}))
}
const STATE_TEXT={waiting:'等待',running:'导入中',done:'已完成',failed:'失败',paused:'已暂停',skipped:'已跳过'}
function run(kind){
 if(skipped(step())){timers.push(setTimeout(next,600));return skipNote('')}
 const key='run-'+kind,list=entities(kind),kinds=GEN[kind]?imgKinds(kind):[],r=S.runs[key]??={st:Object.fromEntries(list.map(x=>[x.id,'waiting'])),retried:{},img:Object.fromEntries(list.map(x=>[x.id,Object.fromEntries(kinds.map(k=>[k,'waiting']))]))}
 const imgAll=()=>list.flatMap(x=>kinds.map(k=>r.img[x.id][k])),imgCount=(k,v)=>list.filter(x=>r.img[x.id][k]===v).length
 if(!list.length){timers.push(setTimeout(next,500));return skipNote('没有选中项。')}
 const count=v=>list.filter(x=>r.st[x.id]===v).length
 const label=()=>{const d=count('done'),f=count('failed'),k=count('skipped');return `${S.paused?'已暂停 · ':''}已完成 ${d} / ${list.length}${kinds.map(t=>` · ${IMG[t]} ${imgCount(t,'done')} / ${list.length}`).join('')}${f+imgAll().filter(v=>v==='failed').length?` · ${f+imgAll().filter(v=>v==='failed').length} 项失败`:''}${k?` · ${k} 项已跳过`:''}`}
 const finished=()=>list.every(x=>['done','skipped'].includes(r.st[x.id]))&&imgAll().every(v=>['done','skipped'].includes(v))
 const tick=()=>{if(S.paused)return;for(const x of list){if(count('running')>=4)break;if(r.st[x.id]!=='waiting')continue;r.st[x.id]='running';const fail=S.fail&&x.id===FAIL_ID&&!r.retried[x.id];timers.push(setTimeout(()=>{if(S.paused||r.st[x.id]!=='running')return;r.st[x.id]=fail?'failed':'done';paint()},700+((x.name.length*397)%900)))}
  /* 实体资料导入完成后才生成它的图像；图像任务单独限流 2 个。 */
  for(const x of list){if(r.st[x.id]!=='done')continue;for(const t of kinds){if(imgAll().filter(v=>v==='running').length>=2)break;if(r.img[x.id][t]!=='waiting')continue;r.img[x.id][t]='running';const fail=S.fail&&['c2','s1','i1'].includes(x.id)&&t===kinds.at(-1)&&!r.retried[x.id+t];timers.push(setTimeout(()=>{if(S.paused||r.img[x.id][t]!=='running')return;r.img[x.id][t]=fail?'failed':'done';paint()},900+((x.name.length*211)%700)))}}
  if(!count('running')&&!imgAll().includes('running')&&finished()){clear();timers.push(setTimeout(next,700))}}
 const chip=(x,t)=>{const v=r.img[x.id][t];return `<span class="chip" data-s="${v}">${v==='done'?`<span class="thumb ${t}" aria-hidden="true">${esc(x.name[0])}</span>`:icon(IMG_ICON[t])}${IMG[t]}${v==='running'?icon('loader-circle','sp'):v==='done'?icon('check','okc'):v==='failed'?`<button class="lk" data-imgretry="${x.id}:${t}">重试</button><button class="lk" data-imgskip="${x.id}:${t}">跳过</button>`:`<small>${STATE_TEXT[v]==='等待'&&r.st[x.id]==='done'?'排队':STATE_TEXT[v]}</small>`}${sr('，'+IMG[t]+STATE_TEXT[v])}</span>`}
 const cell=x=>{const st=r.st[x.id];return `<div class="ent" data-s="${st}"><span class="quill">${icon(x.ic)}</span><div class="nm"><span>${esc(x.name)}</span>${st==='done'?icon('check','ok'):''}${sr('，'+STATE_TEXT[st])}</div><span class="st" aria-hidden="${st==='done'}">${st==='running'?icon('loader-circle','sp')+'<span class="rm">导入中</span>':st==='failed'?'':st==='done'?'':STATE_TEXT[st]}</span>${st==='failed'?`<span class="acts"><button class="btn sm" data-retry="${x.id}">${icon('rotate-ccw')}重试</button><button class="btn sm ghost" data-skipent="${x.id}">跳过</button></span>`:''}${kinds.length&&st!=='skipped'?`<span class="chips">${kinds.map(t=>chip(x,t)).join('')}</span>`:''}</div>`}
 const cells=()=>{if(kind!=='world')return `<div class="grid">${list.map(cell).join('')}</div>`;const groups=[...new Set(list.map(x=>x.grp))];return groups.map(g=>`<section class="wgroup"><h4>${icon(g==='其他设定'?'sparkles':'globe')}${esc(g)}</h4><div class="grid">${list.filter(x=>x.grp===g).map(cell).join('')}</div></section>`).join('')}
 const paint=()=>{const box=$('#ents');if(!box||step().id!=='import-'+kind||S.modal)return;box.innerHTML=cells();const bar=$('.bar'),d=doneTasks();bar.setAttribute('aria-valuenow',d);bar.setAttribute('aria-valuemax',totalTasks());bar.firstChild.style.width=d/totalTasks()*100+'%';const live=$('#live'),t=label();if(live.textContent!==t)live.textContent=t;$('#foot').innerHTML=foot();window.lucide?.createIcons();bindRun();tick()}
 const totalTasks=()=>list.length*(1+kinds.length),doneTasks=()=>count('done')+count('skipped')+imgAll().filter(v=>['done','skipped'].includes(v)).length
 const failed=()=>count('failed')+imgAll().filter(v=>v==='failed').length,foot=()=>pauseFoot(failed()?`<button class="btn" data-skipfail>跳过失败项并继续（${failed()}）</button>`:'')
 const bindRun=()=>{$$('[data-retry]').forEach(b=>b.onclick=()=>{r.retried[b.dataset.retry]=true;r.st[b.dataset.retry]='waiting';paint()});const skipEnt=id=>{r.st[id]='skipped';for(const t of kinds)r.img[id][t]='skipped';S.skippedItems.push(list.find(x=>x.id===id).name)}
  $$('[data-skipent]').forEach(b=>b.onclick=()=>{skipEnt(b.dataset.skipent);paint()})
  $$('[data-imgretry]').forEach(b=>b.onclick=()=>{const [id,t]=b.dataset.imgretry.split(':');r.retried[id+t]=true;r.img[id][t]='waiting';paint()})
  $$('[data-imgskip]').forEach(b=>b.onclick=()=>{const [id,t]=b.dataset.imgskip.split(':');r.img[id][t]='skipped';S.skippedItems.push(list.find(x=>x.id===id).name+'的'+IMG[t]);paint()})
  const sf=$('[data-skipfail]');if(sf)sf.onclick=()=>{list.forEach(x=>{if(r.st[x.id]==='failed')skipEnt(x.id);for(const t of kinds)if(r.img[x.id][t]==='failed'){r.img[x.id][t]='skipped';S.skippedItems.push(x.name+'的'+IMG[t])}});paint()};bind()}
 if(S.paused)list.forEach(x=>{if(r.st[x.id]==='running')r.st[x.id]='paused';for(const t of kinds)if(r.img[x.id][t]==='running')r.img[x.id][t]='paused'});else list.forEach(x=>{if(r.st[x.id]==='paused')r.st[x.id]='waiting';for(const t of kinds)if(r.img[x.id][t]==='paused')r.img[x.id][t]='waiting'})
 timers.push(setTimeout(()=>{bindRun();tick()},0));timers.push(setInterval(tick,300))
 const intro=kind==='char'?'每个角色由一个代理导入：身份、外观、心理、能力、弧线与人物关系。原文没有依据的字段留空。'+(kinds.length?`角色资料完成后自动生成${kinds.map(t=>IMG[t]).join('与')}；图像失败不影响角色资料。`:''):kind==='world'?'每个世界下的设定单独导入；主题、文风等其他设定单独成组。':kinds.length?`${ENT[kind].label}资料完成后自动生成${kinds.map(t=>IMG[t]).join('与')}；图像失败不影响${ENT[kind].label}资料。`:''
 return {body:rail()+(intro?`<p class="m">${intro}</p>`:'')+progress(doneTasks(),totalTasks(),label())+`<div id="ents">${cells()}</div>`,foot:foot()}
}
function foreshadow(){
 if(skipped(step())){timers.push(setTimeout(next,600));return skipNote('未选择伏笔。')}
 const r=S.runs.fs??={p:0};if(r.p<100&&!S.paused)timers.push(setInterval(()=>{r.p=Math.min(100,r.p+10);if(r.p>=100){clear();render()}else{const b=$('.bar');if(b){b.setAttribute('aria-valuenow',r.p);b.firstChild.style.width=r.p+'%'}}},260))
 const items=[['铜灯的来历','已回收',[['埋入','第一部 第三章','第 3 章细纲','事件：灯塔初燃','讲述卡：雾夜'],['回收','第六部 第九章','第 141 章细纲','事件：铜灯苏醒','讲述卡：真相']]],['星图残页','已埋入',[['埋入','第二部 第五章','第 29 章细纲','事件：残页出现','讲述卡：拍卖会'],['提及','第三部 第一章','第 55 章细纲','事件：航线推演','讲述卡：远航']]]]
 return {body:rail()+progress(r.p,100,r.p<100?(S.paused?'已暂停 · ':'')+'正在定位触点':'识别到 6 条伏笔、23 个触点')+(r.p<100?'':items.map(([t,st,touches])=>`<div class="fs"><div class="head">${icon('check','g')}<strong>${t}</strong><span class="tag p">${st}</span><span class="sub">${touches.length} 个触点</span></div>${touches.map(([k,ch,ol,ev,nar])=>`<div class="touch"><b>${k}</b><div class="links"><span>正文 · ${ch}</span><span>大纲 · ${ol}</span><span>世界线 · ${ev}</span><span>叙事线 · ${nar}</span></div></div>`).join('')}</div>`).join('')+'<p class="m">另有 4 条伏笔。无法定位原文的触点不写入，记入导入记录。</p>'),foot:r.p<100?pauseFoot():`${reviseBtn()}<span class="note"></span>${nextBtn('开始校验')}`}
}
function verify(){
 if(S.sub==='conflict')return conflict()
 const conflictOpen=S.scenario==='conflict'&&!S.conflictResolved,broken=S.scenario==='broken'&&!S.brokenFixed
 const rows=[['卷章与正文完整',`${S.chapters.size} 章，逐字一致`],['所选范围一致','未选卷章没有出现在任何结果中'],broken?['角色关系引用','“薇拉”的关系指向未导入的角色“哈罗德”','w','角色']:['角色关系引用','关系全部可解析'],['世界观归属','设定均归属到已导入的世界'],['世界线与叙事线引用','讲述卡引用的事件均存在'],['细纲覆盖',`${S.chapters.size} / ${S.chapters.size} 章`],['伏笔触点','触点均可定位'],conflictOpen?['一致性复核','1 处资料与正文矛盾','w']:['一致性复核','资料与正文无未处理矛盾']]
 const r=S.runs.verify??={n:0};if(r.n<rows.length)timers.push(setInterval(()=>{r.n++;clear();render()},260))
 const doneAll=r.n>=rows.length,bad=doneAll&&rows.some(x=>x[2])
 const skippedNote=S.skippedItems.length?`<div class="notice"><strong>已跳过 ${S.skippedItems.length} 项</strong>${S.skippedItems.map(esc).join('、')}。这些项不会保存，记入导入记录。</div>`:''
 return {body:`<div class="checks">${rows.map(([t,d,w,fix],i)=>`<div class="check">${i<r.n?icon(w?'triangle-alert':'circle-check',w?'w':'g'):icon('loader-circle','sp')}<span>${t}${i<r.n?sr(w?'，有问题':'，通过'):''}</span><span class="r">${i<r.n?d:'检查中'}</span>${i<r.n&&w?(fix?`<button class="btn sm" data-fix>${icon('rotate-ccw')}重试导入${fix}</button>`:`<button class="btn sm" data-conflict>处理矛盾</button>`):''}</div>`).join('')}</div>${doneAll?skippedNote:''}`,foot:`${reviseBtn()}<span class="note" aria-live="polite">${!doneAll?'':bad?'请先处理标出的问题':'全部通过'}</span>${nextBtn('保存作品',!doneAll||bad)}`}
}
function conflict(){return {body:`<p class="eyebrow-s">原设定与正文存在差异</p><h3>林默 · 年龄</h3><div class="cols"><section><h4>导入的原设定</h4><p>二十五岁</p></section><section><h4>根据正文推断</h4><p>二十二岁</p></section></div><blockquote>"我二十二岁那年接下了灯塔的钥匙……"<small>第一部 第三章</small></blockquote><fieldset class="decide"><legend>由你决定如何处理</legend><label><input type="radio" name="d" checked>坚持导入原设定</label><label><input type="radio" name="d">使用正文推断的设定</label><label><input type="radio" name="d">保持原设定，但修改正文</label></fieldset><p class="m">沿用现有冲突决定界面；提交后重新校验受影响的项目。</p>`,foot:`<button class="btn ghost" data-act="collapse">稍后处理</button><span class="note"></span><button class="btn primary" data-resolve>提交决定并重新校验</button>`}}
function done(){const worlds=S.worlds.flatMap(worldItems).filter(x=>x.on).length
 return {body:`<div class="hero">${icon('circle-check')}<h3>${esc(S.title)}</h3><p>作品已保存，可以在工作台继续编辑。${(()=>{const parts=Object.entries(GEN).flatMap(([k,ts])=>ts.filter(t=>S.gen[t]).map(t=>`${IMG[t]} ${ENT[k].list().filter(c=>c.on).length} 张`));return parts.length?`已生成${parts.join('、')}（不含跳过项）。`:''})()}</p></div><div class="sum"><div><strong>${S.chapters.size}</strong><span>章节</span></div><div><strong>${charList().filter(c=>c.on).length}</strong><span>角色</span></div><div><strong>${S.scenes.filter(c=>c.on).length}</strong><span>场景</span></div><div><strong>${S.items.filter(c=>c.on).length}</strong><span>物品</span></div><div><strong>${worlds}</strong><span>世界观设定</span></div><div><strong>6</strong><span>伏笔</span></div></div>`,foot:`<button class="btn ghost" data-act="collapse">关闭</button><button class="btn">查看导入记录</button><button class="btn primary">打开作品</button>`}}
const MODALS={
 stop:()=>({body:`<h3>保留草稿，稍后继续</h3><p class="m">停止后保留已确认的来源、选择、进度和已完成项。丢弃草稿会移除这次未完成的导入；原始文件不会更改。</p>`,foot:`<button class="btn danger" data-act="discard-ask">丢弃导入草稿</button><span class="note"></span><button class="btn" data-modal-close>继续导入</button><button class="btn primary" data-keep>停止并保留草稿</button>`}),
 discard:()=>({body:`<h3>丢弃这次导入？</h3><p class="m">将移除这次未完成导入的全部选择、进度和已完成项，不能恢复。原始文件不会更改。</p>`,foot:`<span class="note"></span><button class="btn" data-modal-close>取消</button><button class="btn danger-fill" data-discard>丢弃导入草稿</button>`}),
 revise:()=>{const opts=STEPS.slice(0,S.i).filter(x=>['files','work','kinds','tree','detect-char','detect-scene','detect-item','detect-world'].includes(x.id)&&!skipped(x)).reverse()
  return {body:`<h3>返回修改选择</h3><p class="m">选择要回到的步骤。该步骤之后的导入结果将被丢弃，确认后重新导入；之前已完成的步骤保留。</p><div class="revise">${opts.map((x,k)=>`<label><input type="radio" name="rv" value="${x.id}" ${k===0?'checked':''}><span><strong>第 ${at(x.id)+1} 步 · ${x.title}</strong><small>将丢弃${at(x.id)+2===S.i+1?`第 ${S.i+1} 步`:`第 ${at(x.id)+2}–${S.i+1} 步`}的结果</small></span></label>`).join('')}</div>`,foot:`<span class="note"></span><button class="btn" data-modal-close>取消</button><button class="btn primary" data-revise-go>丢弃后续结果并返回</button>`}},
}
function findWorld(id){let hit;walk(S.worlds,w=>{if(w.id===id)hit=w});return hit}
const on=(sel,ev,fn)=>$$(sel).forEach(el=>el['on'+ev]=()=>fn(el))
function bind(){
 on('[data-act]','click',b=>{const a=b.dataset.act
  if(a==='next')next();if(a==='back')go(S.i-1);if(a==='collapse'){S.collapsed=true;render()}if(a==='pause'){S.paused=!S.paused;clear();render()}
  if(a==='stop'){S.modal='stop';render()}if(a==='revise'){S.modal='revise';render()}if(a==='discard-ask'){S.modal='discard';render()}})
 /* 保留草稿：停止后台工作、收起窗口，状态原样保留，任务条可恢复。 */
 on('[data-keep]','click',()=>{clear();S.modal=null;S.paused=true;S.collapsed=true;render();$('#task').focus()})
 on('[data-modal-close]','click',()=>{S.modal=null;render()})
 on('[data-discard]','click',()=>{clear();S=fresh(S.scenario,S.fail);S.collapsed=true;go(0)})
 on('[data-revise-go]','click',()=>{const id=$('input[name=rv]:checked')?.value;if(!id)return;const k=at(id);STEPS.slice(k).forEach(x=>{delete S.runs[x.id];delete S.runs['run-'+x.id.replace('import-','')]});delete S.runs.fs;delete S.runs.verify;S.skippedItems=[];S.conflictResolved=false;go(k)})
 on('[data-rail]','click',()=>{S.railOpen=!S.railOpen;render()})
 on('[data-file]','change',b=>{S.files[+b.dataset.file].inc=b.checked;render()})
 on('[data-encopen]','click',b=>{S.encOpen=+b.dataset.encopen;render();$(`[data-encsel="${b.dataset.encopen}"]`)?.focus()})
 on('[data-encsel]','change',b=>{S.files[+b.dataset.encsel].enc=b.value;S.encOpen=null;render()})
 on('[data-src]','change',b=>{b.checked?S.source.add(b.dataset.src):S.source.delete(b.dataset.src);render()})
 on('[data-tgt]','change',b=>{b.checked?S.targets.add(b.dataset.tgt):S.targets.delete(b.dataset.tgt);render()})
 $$('[data-mixed]').forEach(b=>b.indeterminate=true)
 on('[data-tw]','click',b=>{const id=b.dataset.tw;S.open.has(id)?S.open.delete(id):S.open.add(id);render()})
 on('[data-expand]','click',b=>{S.open=new Set(b.dataset.expand==='1'?S.vols.map(v=>v.id):[]);render()})
 on('[data-vol]','change',b=>{const v=S.vols.find(x=>x.id===b.dataset.vol),q=S.q.trim();v.chapters.filter(c=>!q||c.title.includes(q)).forEach(c=>b.checked?S.chapters.add(c.id):S.chapters.delete(c.id));render()})
 on('[data-ch]','change',b=>{b.checked?S.chapters.add(b.dataset.ch):S.chapters.delete(b.dataset.ch);render()})
 on('[data-all]','click',b=>{S.vols.forEach(v=>v.chapters.forEach(c=>b.dataset.all==='1'?S.chapters.add(c.id):S.chapters.delete(c.id)));render()})
 const q=$('[data-q]');if(q){q.addEventListener('compositionstart',()=>S.composing=true);q.addEventListener('compositionend',()=>{S.composing=false;S.q=q.value;render();caret()});q.oninput=()=>{if(S.composing)return;S.q=q.value;render();caret()}}
 const kind=step().id.replace('detect-',''),list=ENT[kind]?.list()
 on('[data-gen]','change',b=>{S.gen[b.dataset.gen]=b.checked;render()})
 on('[data-pick]','change',b=>{list.find(x=>x.id===b.dataset.pick).on=b.checked;render()})
 on('[data-pall]','click',b=>{list.forEach(x=>x.on=b.dataset.pall==='1');render()})
 on('[data-detail]','click',b=>{const id=b.dataset.detail;S.details.has(id)?S.details.delete(id):S.details.add(id);render()})
 on('[data-edit-role]','click',b=>{S.editRole=b.dataset.editRole;render();$(`[data-role="${b.dataset.editRole}"]`)?.focus()})
 on('[data-role]','change',b=>{S.chars.find(x=>x.id===b.dataset.role).role=b.value;S.editRole=null;render();$(`[data-edit-role="${b.dataset.role}"]`)?.focus()})
 on('[data-world]','change',b=>{worldItems(findWorld(b.dataset.world)).forEach(x=>x.on=b.checked);render()})
 on('[data-witem]','change',b=>{S.worlds.flatMap(worldItems).find(x=>x.id===b.dataset.witem).on=b.checked;render()})
 on('[data-wtw]','click',b=>{const id=b.dataset.wtw;S.wopen.has(id)?S.wopen.delete(id):S.wopen.add(id);render()})
 on('[data-wall]','click',b=>{S.worlds.flatMap(worldItems).forEach(x=>x.on=b.dataset.wall==='1');render()})
 const t=$('[data-title]');if(t)t.oninput=()=>{S.title=t.value;$('#foot [data-act=next]').disabled=!S.dir||!S.title.trim()}
 on('[data-dir]','click',()=>{S.dir='~/作品/'+(S.title||'未命名')+'（示意空目录）';render()})
 on('[data-redetect]','click',()=>{S.detectRetried=true;go(S.i)})
 on('[data-skip-step]','click',()=>go(S.i+2))
 on('[data-conflict]','click',()=>{S.sub='conflict';render()})
 on('[data-resolve]','click',()=>{S.conflictResolved=true;S.sub=null;delete S.runs.verify;clear();render()})
 on('[data-fix]','click',()=>{S.brokenFixed=true;delete S.runs.verify;clear();render()})
}
function caret(){const n=$('[data-q]');if(n){n.focus();n.setSelectionRange(n.value.length,n.value.length)}}
$('#close').onclick=()=>{S.collapsed=true;render()};$('#task').onclick=()=>{S.collapsed=false;render();$('#close').focus()}
/* Esc 只收起窗口，不停止导入；对话框打开时 Tab 留在对话框内。 */
document.addEventListener('keydown',e=>{if(S.collapsed)return
 if(e.key==='Escape'){e.preventDefault();if(S.modal){S.modal=null;render()}else{S.collapsed=true;render();$('#task').focus()}}
 if(e.key==='Tab'){const f=$$('.dialog button:not(:disabled),.dialog input:not(:disabled),.dialog select,.dialog [tabindex="0"]');if(!f.length)return;const first=f[0],last=f.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}})
window.addEventListener('message',e=>{const d=e.data||{}
 if(d.type==='theme'){document.documentElement.className=d.theme;S&&render()}
 if(d.type==='reset'){clear();S=fresh(d.scenario??S?.scenario??'normal',d.fail??S?.fail??true);go(0)}
 if(d.type==='fail'){S.fail=d.fail}
 if(d.type==='jump'){const i=at(d.step);if(i<0)return;if(i>at('work')&&!S.dir)S.dir='~/作品/雾港夜行（示意空目录）';S.collapsed=false;go(i)}})
S=fresh();post({type:'steps',steps:STEPS.map((s,i)=>({id:s.id,title:s.title,n:i+1}))});go(0)
