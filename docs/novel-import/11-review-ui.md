# 导入界面、主进程入口与记录读取独立审核

日期：2026-10-26（Asia/Shanghai）。审核者：导入领域/会话实现子代理；未编写本次审核的 React、样式、preload、main/worker 接线和记录读取路由。领域实现另由 `11-review-engine.md` 独立审核，本文不替代该审核。

## 结论

代码复审通过，无尚未处理的阻断发现。主代理仍须执行最终指定用例和真实桌面验证；本文不把浏览器受控 bridge 或静态代码审核称为真实供应商、原生选择器或安装包验证。

## 范围与依据

核读 `NovelImportDialog.tsx`、`NovelImportRecord.tsx`、`novel-import.css`、`src/lib/desktop/novel-import.ts`，以及 SidebarTree、DesktopApp、NovelOverview、PlanningWorkspace 中新增入口；核读 `desktop/main/index.ts`、`desktop/preload/index.ts`、`desktop/service/index.ts` 的导入接线与 `desktop/handlers/novels/[id]/import-record/route.ts`、`readNovelImportRecord` 的归属和分页处理。

对照已批准 v4、08 定向用例，并核读 `evidence/ui-green.txt`（NI-U01..07）、UI 定向测试源码和 NI-L01..04 对实际宿主函数的测试源码。没有运行全仓测试，没有读取真实用户小说或 Key。

## 已确认

- 来源用本地真实文件类型 SVG；直接导入使用普通 checkbox，补全用整张 label 卡片，鼠标/键盘均可操作；12 张补全卡片固定展开，关闭补全只禁用，不丢失目标选择。实际分类不支持的来源项禁用；13 来源与12目标独立。
- 导入计划位于确认页；“根据正文补全以下内容”、文风、爽点/泪点等来自真实协议目录，无泛化的“其他设定”。
- 第一次发送先列文件与模型、等待明确允许；识别动画由真实 recognizing 状态驱动。第二次发送列正文/资料/补全目标及独立审核模型。后台通知更新数据，不自动打开窗口或夺取焦点。
- 冲突无默认决定；采用推断显示字段前后差异并需勾选确认；原设定需解释；正文修改先展示逐处 diff、再选择和确认。存在返回确认范围的重新授权入口。
- 使用既有 Dialog、Button、tab store 和业务页面；导入结果打开真实作品标签，原始大纲及资料通过只读记录查看，未加载设计 HTML 或示例作品。
- main 严格校验可信主 frame、就绪 owner、动作 schema 和业务 gate。路径只从原生文件/目录选择产生；preload 仅转发语义动作。文件与文件夹 picker 分开。
- worker 的 AbortSignal 保留在本地 ImportAiJobs；取消只传 operationId。active、stop 和 close 包含导入任务，等待真实 done 后再关数据库；发布等明确回执，不强行中断事务。
- 记录路由先验证作品归属，服务再次验证本地作者；按本作品 material ID 读取，返回文本由 React pre 转义呈现，不执行原文中的 HTML/脚本。公开元数据不包含来源绝对路径或密钥。

## 发现与复审

| 发现 | 修复及核验 |
| --- | --- |
| 资料分页直接 slice 会在 emoji 边界显示孤立代理项；来源上一页减固定长度可能落入低代理项。 | 记录服务及 Controller 均正规化起点、终点并返回实际 offset；UI 按实际 offset 翻页。NI-S01 增加低代理项 offset 的定向断言。 |
| 切换作品时记录组件保留旧 material/offset。 | `NovelImportRecordContent` 用 novelId 与 outlineOnly 作为 key，切换同步卸载旧状态；NI-U07 增加不同作品不请求旧 material 的断言。 |
| 冲突中模型变更后重新授权可能重置已生成结果或无法抵达确认页。 | 冲突页增加“重新确认分析范围”；start 遇未解冲突只更新授权并回到原冲突，保留结果、决定和提案。NI-S06 验证原 conflict ID 及正文提案仍在。 |
| 普通失败无返回来源入口，资料歧义/容量失败只能原样重试。 | 非冻结发布失败提供“返回核对来源”；已开始发布的计划继续冻结。 |
| 重启待发布任务后无可达的原目录重新授权路径。 | resume 转到确认页，冻结标题与选项，重新原生授权相同目录后仅重试原 publication/hash。NI-S08 使用已完成 AI 分析、保存回执失败、重开后模型移除的受控场景，确认无新 AI 调用且同请求同 hash 完成。 |
| 真实桌面首次验证发现弹窗和控件偏出视口：共享 DialogContent 的 Tailwind 独立 `translate` 与导入弹窗自己的 `transform: translate(-50%,-50%)` 叠加，原浏览器夹具缺少共享位移属性，未暴露问题。 | 初次 `translate:none` 尝试随后被真实构建否定；最终去掉导入自身全部位移，完全复用共享 DialogContent。源与实际 Next 产物断言均通过，见下节生产 CSS 复核。 |
| 真实桌面核对发现编辑标题后首次点击“选择目录”被吞掉：input 的 onBlur 异步提交标题先触发 busy，将同次点击目标禁用。 | 删除 onBlur 提交，将标题提交和选择目录放在同一次 onClick 的有序流程中；保存成功后才发 choose-target，开始导入复用同一标题提交门控。下述独立复核通过。 |
| 保存完成后仅关闭导入窗口，侧栏仍显示旧作品列表：原缓存失效只放在“打开作品”动作内。 | 按 completed session ID 在组件 effect 中统一失效作品列表，直接关闭或后台收起完成均不再依赖打开作品动作；下述独立复核通过。 |

待发布任务的恢复修复在 Controller 范围，由本审核者实现，定向红灯见 `evidence/engine-publication-restore-red.txt`、`evidence/engine-publication-model-red.txt`，最终会话绿灯见 `evidence/engine-session-final-green.txt`；其组合验收仍由主代理负责。UI 代理独立补充了冻结计划的禁改标题和对应 NI-U04 断言；NI-U03/U04 的最后一次定向复验 2/2 通过，见 `evidence/ui-recovery-green.txt`，已核读对应生产分支。

## 首轮样式单点复审（历史尝试，已由后续产物复核取代）

已独立核读 `src/components/ui/dialog.tsx` 的共享 `desktop-dialog-surface`、`-translate-x-1/2`、`-translate-y-1/2` 类，`src/components/desktop/novel-import.css` 的 `[data-slot="dialog-content"].ni-dialog` 规则，以及 `tests/browser/novel-import.test.ts` 对共享独立位移属性的注入和视口断言。生产规则现在同时声明 `translate:none` 与 `transform:translate(-50%,-50%)`，前者清除共享独立位移，后者保留导入弹窗本身所需的居中位移。该选择器比单个 Tailwind utility 类更具体，且仅作用于导入/记录弹窗，不改变其他共享 Dialog。

核读实际证据：`evidence/ui-translation-red.txt` 的 NI-U02 先失败，弹窗边界为 `x=-280,y=-368,width=920,height=768`；修复后 `evidence/ui-translation-green.txt` 的 NI-U02/U04 为 2/2 通过。主代理最后仅运行本功能 UI 文件，`evidence/ui-final.txt` 的 NI-U01..07 为 7/7 通过、0 失败。夹具保留共享位移注入，修复不能再依赖测试环境漏载该属性而通过。

实际复审结论：这一生产样式修复正确，覆盖了真实桌面发现的叠加位移根因，原阻断关闭。此次补充没有改动其他生产代码，也没有重新运行全量或扩大测试范围；重建后的原生桌面最终验证仍由主代理记录，浏览器绿灯不替代该项证据。

## 生产 CSS 优化后的定位复核

主代理后续真实桌面验证推翻了前一轮 `translate:none` 关闭结论：源码有 reset，但 Next/Lightning CSS 将默认值 reset 删除，最终产物仍叠加共享独立 translate 与导入自己的 transform。前一轮独立夹具的绿灯只证明源码样式，不足以证明构建产物。

最终最小修订从 `.ni-dialog` 删除自有 translate 和 transform，仅保留 top/left；完全复用共享 DialogContent 的 `-translate-x/y-1/2`，无 CSS 变量兼容补丁。夹具统一保留共享 translate，NI-U02 增加源规则禁止自有位移断言（包含注释前缀的防漏检回归），NI-U02/U04 定向2/2通过，见 `evidence/ui-shared-position-green.txt`。

只读 `tests/helpers/novel-import-css-check.mjs` 对真实旧 Next 产物也得到明确红灯，见 `evidence/ui-built-position-red.txt`。它检查源与真实 CSS 产物的导入弹窗规则均没有自有 transform/translate，同时扫描所有 CSS chunk 确认共享 Tailwind 位移仍存在（共享规则可能位于另一个 chunk）。

主代理已完成真实 Next 构建（exit0），并实际运行产物检查。本代理已读取 `evidence/ui-built-position-green.txt`：3条源规则、3条编译规则，`ownTranslation:false`、`sharedTranslation:true`，实际导入样式位于 `out/_next/static/chunks/07htfn2yqpmyr.css`；旧产物红灯→新产物绿灯成立。也已读取本轮 `evidence/ui-final.txt`：NI-U01..07为7/7通过、0失败、0跳过。**源码及实际构建产物中的双重位移阻断已关闭**；主代理正在继续唯一隔离 Electron 的实际界面全流程复验，尚不把该流程写为完成。此段由 UI 实施者记录实际证据与修订经过，不冒充独立代理执行。

## 标题提交与目录选择单点独立复核

已只读核对最新 `ConfirmScreen`、`mutateNovelImport` 的串行执行与错误返回，以及 NI-U04 的 `deferredTitle` 用例和 `ui-title-picker-red/green.txt` 实际证据，未修改生产代码或重新运行测试。

结论：修复通过，原首次点击被吞掉的问题关闭。标题 input 已没有 onBlur 保存；`chooseTarget` 在同一次点击中先 await `commitTitle`，只有成功才调用 `choose-target`。`mutateNovelImport` 在每条排队命令开始执行时取得当前 authoritative view 的 id/revision，因此保存标题后的目录动作使用新 revision，而非事件闭包里的旧 revision。红灯中释放延迟标题回执后仍等不到 choose-target；绿灯 1/1 通过（约3.11秒），断言动作恰好为 `[set-title, choose-target]`、标题为输入值、后者 revision 等于前者加1。

保存失败分支也已静态核对：bridge 调用失败会返回 null，`commitTitle` 转成 false，目录选择不继续；`start` 同样先检查该结果，失败不会继续导入。此次绿灯实际执行的是延迟成功分支，没有把静态核对写为保存失败的已执行测试。

冻结发布仍保持：publication 存在时标题 input 禁用，`commitTitle` 直接成功且不会发 set-title；恢复路径继续以 consent:false 重试原保存请求。最终开始按钮仍要求非空标题、来源 ready、目标 ready；需要新分析时仍要求文本与审核模型，start 的 consent 表达式未放宽。没有新增自动允许 AI 或跳过原目录授权的入口。

本次只追加此独立结论，保留前节“最终复用共享 DialogContent、真实 Next 产物检查通过”的最新定位事实，不恢复已被真实产物推翻的 translate reset 尝试。

## 完成后作品列表缓存单点独立复核

已只读核对 `NovelImportDialog`、`DesktopApp` 的持久挂载位置、后台通知的 adopt 行为、`useNovelList` 的实际查询键，以及 NI-U05/U07 的 QueryClient 夹具和 `ui-completion-cache-red/green.txt`。未改生产代码或重复运行测试。

结论：修复通过，完成后未打开作品而侧栏保留旧列表的问题关闭。新增 effect 位于 `if (!view) return null` 之前，所有渲染的 hook 顺序一致；`completedId` 仅在真实 view.phase 为 completed 时取 session ID，以 `[completedId, query]` 为依赖，不受 open、suspended 或是否点击“打开作品”限制。同一完成会话的无关重渲染不改变该依赖，新完成会话会触发新的失效。实际侧栏 `useNovelList` 使用同一 `['novels']` 查询键，缓存失效覆盖正确列表。

effect 仅调用 `invalidateQueries`，不调用 reopen、focus 或 openTab；后台通知仍以 show=false 采用结果，原 open=false 不变。`openWork` 只是移除重复的失效调用，仍保留原 novel ID 校验、真实 tab ID、作品类型/标题和收起动作，打开作品逻辑未回退。

证据中的夹具使用真实 QueryClient，预置未失效的作品列表缓存，并读取 `getQueryState(['novels']).isInvalidated`。红灯 NI-U05 在未执行 openWork 的情况下等待失效超时；修复后 NI-U05/U07 为2/2通过、0失败（约4.37秒）。断言覆盖完成页无需打开作品即可失效、随后关闭窗口，以及先收起后后台完成时缓存失效且弹窗仍隐藏；NI-U07 同时保留原作品标签打开断言。该证据验证 React 与真实缓存行为，不冒充实际侧栏联网/本地数据库重新读取结果，重建后原生端到端结论仍由主代理记录。

## 验证边界

当前浏览器用例证明真实 React 控件与 bridge 协议行为，使用受控桌面响应，不代表 Electron 原生 picker 已执行。真实数据库发布及锁恢复证据由 NI-W 组负责。真实 AI 供应商调用未在此审核中执行；没有用受控响应替代该结论。
