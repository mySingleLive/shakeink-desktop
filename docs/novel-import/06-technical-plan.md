# 导入作品技术方案

> 2026-10-26 入口修订：用户取消文件/文件夹下拉；当前 macOS 使用统一原生选择框。下文原入口描述由 [14 方案](14-unified-source-picker.md) 覆盖，其他导入流程维持原契约。

日期：2026-10-25（Asia/Shanghai）。用户已明确批准 v4 UI，绑定 [approval-v4.json](../../design/novel-import/approval-v4.json)。依据 [产品契约](02-product.md) 与 [设计](04-ui-design.md)。技术方案独立审核通过（[最终复审](07-technical-review.md)）；下一步编写08正式定向测试用例并独立审核，再进入TDD实现。通过不表示实现或产品验收完成。

## 现有边界和复用点

- CodeGraph 工具当前未暴露；`.codegraph/` 已存在，不重复初始化。本次限量读取明确路径，证据包括 `desktop/main/index.ts` 的 trusted/businessHandle、原生目录选择及模型网关，`desktop/service/index.ts` 的 RpcPeer 和 Workspaces，`desktop/preload/index.ts` 的白名单 bridge。
- `Workspaces.create` 当前在 `createNovelOnce` 后立即把 manifest 标为 ready 并登记 catalog。导入必须在登记前完成领域事务，不能先建一本可见空书再慢慢覆盖。
- `createNovelOnce` 创建空 PlanningDocument；`assertLegacyOutlineWritable` 禁止直接写只读大纲投影。通过规划数据与卷章投影入库，保留原大纲全文，不能调用正向创作工作流重新生成正文。
- `ContentVersion` 支持任意 targetType/targetId 与 JSON snapshot，`ContentMutation` 提供 userId/operationId 幂等回执。用 `NOVEL_IMPORT` 导入记录保存选中原文、来源、决定与结果，避免新建无关业务面板和数据库迁移。
- AI 复用 `generateJSON`、`resolveLocalModel`/`instantiateModel`、主进程 ModelGateway。Key 只存在既有 vault/主进程授权出口；不给 renderer、解析器或导入记录。

## 模块划分和数据流

1. `desktop/shared/novel-import.ts`：13类、来源单元、实体、证据、冲突、阶段、view 和严格 action schema。source/target 分别表达“拷贝哪些原文”和“允许推断哪些内容”；正文不是可推断目标。
2. `desktop/main/novel-import-files.ts`：原生选择结果授权、递归扫描、只读快照、编码和七扩展名解析；其文件路径不由 renderer 提交。只在批准目录内读普通文件，不执行脚本、宏、外链或文件中的指令。
3. `desktop/core/novel-import.ts`：纯领域函数，完整文本分段/章节切分、覆盖检查、来源选择、证据校验、事实合并/冲突、决策失效和规划构建。单元保持原字符范围，不让模型重写来源。
4. `desktop/main/novel-import.ts`：持久会话控制器。保存 source snapshots、清单/范围、两个模型授权、各阶段 checkpoint 与冲突；后台识别/导入、暂停/取消、重试、恢复与已完成回执。只输出真实状态。
5. `desktop/service/novel-import-ai.ts`：worker 中有取消信号的结构化识别/推断/审核适配器；通过既有模型出口。每次请求绑定主进程确认的模型 ID、authRevision 和来源指纹。
6. `desktop/service/novel-import-publish.ts`：新作品领域事务、规划/卷章投影与幂等导入记录。`Workspaces.create` 新增仅内部使用的初始化回调，在 ready/catalog 之前执行；既有调用默认行为不变。
7. `src/components/desktop/NovelImportDialog.tsx`、`src/lib/desktop/novel-import.ts`：真实 React/现有 Dialog、原生 checkbox、原组件主题；不引用设计 HTML/合成资料。SidebarTree 加入口及任务恢复条，原生菜单两种导入命令、preload 严格动作通道。结果打开原作品概览和正文面板。
8. `NovelImportRecord` 只读组件/handler：从作品概览和原大纲面板访问导入记录、原始大纲和资料全文；复用现有 Dialog/文本展示，不注册第30个业务面板。

主进程负责选择/授权/会话与取消，service 负责模型和最终数据库事务；renderer 不可传路径给解析器或直接调用 worker 方法。AI 不可直接写库或触发已有创作工具。

## 来源、安全与提取

原生主入口 `openFile,multiSelections`，文件夹入口 `openDirectory`；Windows 不组合两种 properties。扩展名 txt/doc/docx/md/pdf/html/htm。相对路径数字自然排序，保留全部合格文件与子目录；跳过的符号链接、隐藏系统/应用内部文件和不支持格式逐项显示原因，不静默吞异常。

使用 lstat/realpath/文件描述符身份检查，在读前/读后验证 dev、ino、size、mtime；来源永远 O_RDONLY，不随链接跳出授权树。保留原字节 hash、提取文本 hash 与相对文件名。目标选择通过 DirectoryAuthority 的一次性 grant，不接受 UI 传入任意路径，源/目标不得相同或互为祖先；不得写入应用数据、已有作品或其他会话目录。

实际限制：每文件50MiB、整个选取100MiB、5000个文件、提取文本总计2500万UTF-16单元。压缩容器需先检查条目数、声明膨胀总量及实际提取长度，超限逐项报错，用户明确排除后再继续，禁止截断冒充成功。

| 格式 | 解析与保真 |
| --- | --- |
| TXT/MD | TextDecoder fatal，UTF-8/UTF-16 BOM/GB18030；不 trim、换行归一或繁简转换；疑似乱码须编码核对 |
| DOC | 生产依赖 word-extractor，先验证OLE签名、体积与输出长度；纯文本提取，不依赖Office |
| DOCX | JSZip + htmlparser2 的 XML 模式读取word/document.xml；保留段落、换行、制表与表格文字位置；限制ZIP膨胀，不跟外部relationship，不解析DTD外部实体 |
| PDF | pdfjs-dist 生产依赖，本地legacy模块、worker与资源；按页提取并提供页码；无文本页/加密/损坏不能当成功，不自动OCR |
| HTML | htmlparser2惰性提取标题/段落/表格可见文本；脚本、style不执行、不发外链请求；正文范围交用户核对 |

现有 JSZip/pdfjs-dist 为开发依赖，提升为生产依赖并更新锁文件/运行时打包；新增 word-extractor 与 htmlparser2 使用官方仓库/registry 的锁定版本。资源随安装包本地携带。开发/安装验证都离线启动，不增加HTTP监听。

DOCX还需读取包内脚注、尾注、批注、页眉/页脚等含文字部分，按来源部件单独标注待核对，不能只取document.xml就宣告全文提取完毕；不跟外部relationship。DOC相应提取footnotes/endnotes/headers/textboxes；非正文附属文字显示来源与明确归类/排除，不能静默遗漏或自动拼成正文。

依赖依据：[word-extractor官方registry（1.0.4）](https://www.npmjs.com/package/word-extractor)、[htmlparser2官方registry（12.0.0）](https://www.npmjs.com/package/htmlparser2)、[PDF.js官方API](https://mozilla.github.io/pdf.js/api/draft/api.js.html)。具体安装结果和锁文件另留命令证据，不把文档候选版本当作已安装。

解析 Word/PDF/HTML 的保真对象是用户核对后的提取正文，原字节与位置映射另存。正文以按源顺序的UTF-16范围拼接为准，章节所有切片拼接必须等于选定正文；标题、空白、跨文件边界均不能丢失。切点不能拆开代理对。用量/错误日志不得包含正文、模型原始输出或 Key。

## 覆盖与两次发送确认

把所有文本分为有稳定ID和原始起止位置的单元（段落/标题，过长段落按安全字符边界继续细分）。每一字符归属一个单元，每个单元必须标为13类之一、待归类或明确排除。AI返回 `unitId→kind`，不返回改写正文或自行计算偏移；响应必须恰好覆盖本批全部ID，不得重复、漏项或引入其他ID。保守本地标题/文件名分类可由用户逐段修正；没有证据的段落标为待归类而不是自动当正文。

分类前确认具体纳入文件/片段和文本模型；选项确定后再确认正文、已选资料、补全目标与文本/审核模型。确认绑定来源hash、选项hash、模型ID/端点/authRevision；模型改变、来源变动、扩大范围或语义修改后旧授权无效。仅本地分类/只拷贝路径不调用模型。识别等待直到请求真实返回；关闭仅收起，后台完成不抢焦点。

分批预算依据实际授权模型contextWindow及现有token估算，预留系统/结构输出/证据空间，单批最多约12000字、超预算继续切分；不能取前N字或头几章代替全文。阶段保存每批来源ID/hash/成功回执；任何未处理、未归类、错误或版本失效都阻止最终完成。

## 逆向分析、实体与冲突

执行顺序：正文拷贝→大纲→角色→场景/物品→世界观→主题/文风/伏笔/金手指/爽点泪点→世界线→叙事线→审核→发布。每类依据来源选择与补全目标独立标注 source/inferred/skipped/not-found/pending；不会默认运行所有类型。

来源已有则先保留原文与来源映射；语义结构化信息单独附带。正文推断实体必须给出本书有效单元ID和原文quote，quote须能在所指单元找到。证据不充分不生成事实，角色别名、同名不同人、倒叙和不可靠叙述不能静默合并。源设定与正文候选字段不同，或全书同一实体字段出现互斥值时生成冲突，争议值不能先进入下游。

角色/场景/物品/世界的原文分别保留在其原生长文本字段及导入记录；其他类型按现有真实映射：STYLE/GOLD_FINGER、Trope SATISFACTION/TEAR、Foreshadow。无模型本地拷贝只按明确标题/名字拆分，不假称语义全解析。

世界线保存客观事件/时间与证据，未知时间保持unknown；叙事卡片按原阅读顺序和实际章边界建立事件披露引用，不能以世界时间重排正文。规划数据走现有schema校验，所有引用必须指向本次实际入库的实体。

冲突绑定源hash/候选hash/决策版本，无默认答案。坚持原设定需解释并复核；采用推断展示设定差异后确认；修改正文必须先生成限定原文切片patch，再逐处勾选、二次确认，且原文匹配失败即拒绝。保留最初正文快照；应用patch后重建正文hash、覆盖台账并使受影响后续分析/决定失效。无正文只允许来源A/B/手动合并解释，不制造推断/改正文选项。

不可变source snapshot与working prose分开版本：patch引用workingRevision和准确before文本；应用后重新生成工作单元ID/偏移并保存到原始来源的映射，旧quote/offset/决定不能套在新正文。新增/扩大工作文本发送范围使analysis授权失效，回到确认范围页重新批准后才继续发送；不因曾经批准分类就自动重用授权。

最终审核分来源覆盖、实体事实索引与来源块进行，不把整个巨型JSON塞入单一模型窗口。审核模型按author明确配置调用，不后备到文本角色。局部与跨块冲突都必须有证据；未决/未覆盖不发布。系统不能保证文学逻辑绝对正确，记录按所选范围完成与人工决定，不伪造AI评分或正向工作流批准。

pure-copy（包括无正文）最终只做本地来源覆盖/结构/明确字段矛盾核对，模型调用数必须为0；不得复用需要review模型的最终审核路径。记录明确未执行全书推断，不宣称语义整书审核通过。

## 草稿、状态机与并发

会话保存在当前应用数据根下独立novel-imports目录，有自有schema/owner marker和原子JSON写入，快照文件0600。状态为source/recognizing/select/confirm/running/paused/conflicts/failed/publishing/completed/discarded。所有突变串行、校验会话revision；每个后台run有epoch与AbortController，旧回执在保存前检查epoch、源hash、状态和模型授权，避免取消后推进。

暂停先发取消并等待在途请求终止，再保存paused；恢复只重试未成功批次。窗口关闭中止请求并留检查点，应用重开从私有会话恢复；源文件变化要求重核，不能靠同名文件恢复权限。迁移/目录切换/业务关闭要先停止导入，不能让旧run写新根。继续未完成任务优先于启动新导入。

丢弃只删除本会话拥有的文件，遇到未知文件/链接保留并提示；不删除来源、既有空目录或其他作品。发布中不得主动取消一半事务；请求取消会等待明确提交/回滚结果，未知结果用相同requestId查询，不能新建另一本。

## 新作品事务与原文记录

扩展 `Workspaces.create` 的内部初始化选项包含不可变的 `importHash`、初始化与已有回执验证回调；初始化在 `createNovelOnce` 之后、manifest ready/catalog 写入之前执行。Workspaces的request fingerprint必须把importHash纳入，持久化到creation reservation、manifest及catalog。回调通过一个领域事务写 Theme/Setting/World/Character/Scene/Item/Trope/Foreshadow、Volume/Chapter/PlanningDocument，并写 `ContentVersion(targetType=NOVEL_IMPORT,targetId=novelId,version=1)` 和对应 ContentMutation 幂等回执。回调失败不登记catalog；重试沿用同一请求、目录与原始建书记录。

importHash覆盖最终选择、已确认正文、资料/规划、证据与冲突决定，不只书名。创建中重试和已ready但catalog未登记都要校验此hash；catalog的previous快速返回分支也必须读取该作品的导入回执，验证requestId/importHash和NOVEL_IMPORT记录后才能返回。已有ContentMutation只在同hash下复用，变化则拒绝，不调用初始化覆盖。UI在publishing之后锁定计划；未知结果先查询同requestId，不允许把编辑后的payload绑定到旧发布请求。既有普通建书调用不传初始化选项，保留原指纹与行为。

生成数据库ID后构建单一规划投影。正文content逐字来自已确认切片，章纲与原大纲区别保存：规划字段/卷简介可容纳已映射大纲，但完整原大纲始终保留在导入记录，原 OutlinePanel 增加“查看导入原大纲”链接；概览增加“导入记录”。原文不会被叙事线投影反向覆盖。

导入记录保留所选来源原文、最初正文、实际结果/修改/证据与相对文件名；未选资料只保留类别/排除原因等元数据，不把不导入的全文塞进正式作品。只读API先检查作品所有权，分页读取长文，不返回真实绝对源路径或Key。完成打开原业务组件；记录不是新的业务面板。

Workspaces既有目录身份、writer lease、创建reservation和串行catalog继续生效。准备/发布每个关键await前后检查owner/current root/目标身份。现有closedWorkLeaseTarget只接受已登记的ready作品，不能拿它冒充未登记creating目录可恢复。新增窄的导入锁恢复分支：以原import session/requestId/importHash、已有持久reservation和重新原生授权的同一目标目录为依据，验证manifest及dev/ino；只接受本机已退出进程的租约，复用原锁恢复底层原语与应用单实例锁，不能抢活进程/外机锁，也不能靠新建reservation获得修复权限。验证reservation需短暂读取inbox时，读完再次关闭连接后才进入主进程锁修复；worker须确认无活动任务/响应/导入job。修复后保留原session并重试原请求，不新建一本。

实施时须用故障注入证明初始化前失败、事务提交后manifest失败、ready写入后catalog失败、catalog已提交但回执丢失都能按同一请求恢复；每个恢复分支核对importHash，未完成作品不出现在列表。

## 关闭/迁移的显式任务接点

现有worker的task-status/stop-tasks/close只统计聊天请求，不能自动涵盖新增RPC。新增独立importJobs注册表，每个AI/发布调用有operationId、AbortController、done promise；开始前登记、finally移除。task-status把导入job合入active；stop-tasks先abort所有可取消job并等待done，close同样等待后才Workspaces.close。AI传入真实abortSignal，底层model.cancel随取消传播。发布事务不强行中断一半，关闭等待明确提交或回滚结果。

主进程controller的后台识别/分析/发布同样有active map：CloseCoordinator.busy计入；stop先暂停/取消controller并持久化检查点，再与worker.stop-tasks/modelService.close协同等待。businessGate关闭和迁移复制前必须先完成这一轮停止，不能先等gate排空再发abort造成死锁。service断连/窗口释放也使run epoch失效并保留草稿，旧worker回执不得写入新root。定向用例必须覆盖识别中、推断中、保存检查点中及发布中的close/stop/迁移路径。

## 实施顺序和独立范围

审核通过后编写08定向用例并独立审核，再并行分工实施：解析器与解析用例；共享契约/领域状态及AI；React/菜单/main integration与发布由主代理组合。文件范围不交叉，生产共享入口由主代理统一修改。先写并运行失败用例，再实现；代码完工单独子代理审核。

## 定向验证与限制

仅运行正式08用例文档列出的unit/integration/browser/真实Electron定向命令，以及本功能相关编译/打包资源检查。禁止 `npm test`、全量浏览器、全仓回归/验收脚本。DOC/真实DOCX/PDF/HTML使用合成夹具，输入输出不包含用户数据。模型mock只证明协议/状态，不计真实AI端点通过；macOS原生与Windows需各自真实目标，缺端点/Windows时如实记未执行，不用外观切换冲抵。

整个任务目标不因UI已批或定向测试通过而缩小；任何未完实现、未完成真实目标验证要在最终记录明确列出，不能宣称全部验收完成。
