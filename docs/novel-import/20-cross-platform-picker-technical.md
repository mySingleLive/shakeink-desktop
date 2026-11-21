# 跨平台统一来源选择器技术方案

日期：2026-10-26。17产品独审、19 UI静态复审已通过；用户明确批准新增UI并要求继续实现。仅扩展来源选择阶段，不改正文识别、推断或发布工作流。

## 连接方式

macOS 的 `chooseNovelSources` 继续调用支持文件/目录混选的原生框。Windows 改为等待主进程 `NovelImportSourcePicker.choose()`；其视图通过 `novel-import-picker` DesktopEvent 发送，既有主窗口内挂载真实 React `NovelImportSourcePickerDialog`。所有入口及“添加来源”统一为无 mode 的 choose；旧 `file.import-folder` 命令ID保留以兼容快捷键，所有平台菜单隐藏冗余项，旧显式 mode 也转向统一选择界面。

选择器独立 IPC `desktop:novel-import-sources` 使用严格 schema，包含 current / navigate / toggle / clear / confirm / cancel 等语义动作；普通变更绑定 picker id、revision，项目用主进程随机ID引用。**cancel例外：只校验同owner和picker id，不要求revision，并绕过renderer变更队列及main目录串行队列。** renderer 不传可导入绝对路径。取消 resolve null，与原生取消相同。

确认向controller传递仅主进程产生的可信 `ImportSourceGrant[]`（path + 文件/目录 proof + 祖先目录身份），而非裸路径丢失授权。原生框仍可返回原路径数组；自定义列表必须保留用户勾选时的proof直到扫描边界。`scanNovelSources` 增加内部grant选项：首次读取前核对选中目录及祖先原身份；直接选择的文件在open前及handle读取前后与原文件proof比较，扫描完再次验证原祖先链。目录内子文件继续使用现有逐文件读取前后校验；原目录被替换即拒绝整项，不把替换对象建立成新授权。该grant不进入renderer动作，不影响AI/发布协议。

## 主进程临时会话

接口约定：`SourcePickerView` 包含 id/revision、phase(loading/ready/checking)、current、breadcrumbs、places、entries、selected、error；项目字段 id/name/displayPath/kind(file/directory)/format?/bytes/selectable/navigable/reason?。`novelImportSources(action)` 返回 view|null。current不带ID；cancel只带ID；navigate/toggle携 entryId 与 id/revision；clear/confirm携 id/revision。列表上限2000项、已选上限5000项；超限明确显示，绝不静默截断后声称完整。

服务 `choose(assertOwner):Promise<ImportSourceGrant[]|null>` 由主进程调用并捕获owner断言，`act(input)` 严格验证上述动作，`cancel()` 提供生命周期直接撤销。places/protectedRoots/changed作为构造注入；真实文件系统用于生产，测试可注入有界IO等待点但不替换原生picker来冒充平台验证。

- 新文件 `desktop/shared/novel-import-source-picker.ts` 定义视图、动作schema/bridge；`desktop/main/novel-import-source-picker.ts` 管理内存目录授权与选择集合，不落盘、不读正文。
- choose 捕获已有导入 owner(window + draftSession)；在受信同主frame、同owner及业务可用时才允许操作。开始即发loading视图，以后动作串行；每次读盘后再次校验会话/epoch/owner。重复触发恢复当前视图，不创建第二个 picker。
- 常用位置来自 `app.getPath(home/documents/downloads/desktop)`，初始文档目录不可读时显示就地错误并保留可用位置；Windows 盘符由有界的 A–Z 根目录元数据探测产生。探测串行、每项有短超时，首次超时即停止后续探测并保留home所属根和已发现根，避免无法取消的离线映射盘IO耗尽线程池；取消以epoch即时撤销结果。无HTTP、无shell/PowerShell、无新依赖。
- 已知项目ID绑定可信路径、文件类型、device/inode；文件还绑定 size/mtime/ctime。所有路径沿祖先检查目录身份，不沿符号链接/junction，不进入当前appData/bootstrap/已登记作品目录。不可读/受保护/不支持项禁用并返回固定错误文案，不泄漏底层错误堆栈。
- 初次grant捕获先固定原始 `resolve(path)` 的链与身份，再要求其realpath仍是原路径，不能先realpath解引用后给链接目标生成新授权；新grant严格拒绝原路径链接，旧native scanner的macOS系统别名处理保持原逻辑。
- 目录浏览只使用 `opendir`/`lstat` 元数据；自然排序、同目录筛选在renderer完成。列表以明确的有界上限防止无界枚举；超过上限显示“目录项目过多”的错误，不假装展示完整清单。主目录本身仍可选，扫描阶段沿用既有5000项/容量约束。
- 对当前目录、面包屑、常用位置和已选项保留能力ID；切换目录淘汰无用旧项目映射，防止无限积累。选择数量沿用5000项硬上限；跨目录选择保持。toggle只处理可选ID，目录导航独立于选择。confirm重新检查全部已选项目及祖先身份，变化则禁用/移除对应项并提示重新选择，不自动改目标；确认成功后使全部ID失效。
- cancel立即撤销会话并解除等待，不等待在途目录枚举；旧枚举回执通过epoch检查丢弃。in-flight IO采用有界等待并收敛，不持有数据库租约。超时不是底层fs取消：未settle IO计入跨选择会话共享的在途预算，真实settle后才释放；迟到opendir句柄必须关闭，反复cancel/重开不能绕过预算耗尽线程池。
- 生产默认未settle预算为2，给Node默认线程池保留保存/关闭IO余量；不使用等于默认线程池全部容量的4。测试可显式设更小预算验证耗尽后的拒绝。

## 关闭、迁移和失联

选择器正在等待时，controller 的 choose 位于其串行队列中。必须在任何 `pauseAll/close` 或 businessGate 排空前先 `sourcePicker.cancel()`，否则会互等。接入 beginClose/stopTasks/closeData、worker disconnected、releaseOwner/主frame导航、根切换与窗口销毁。cancel先resolve null，再撤销owner；`chooseNovelSources` 与controller在null/空选择时直接按取消返回，放在尾部owner/closingFlow断言之前，不把生命周期撤销后的纯取消转换成错误。IPC不能在不同窗口或旧draftSession恢复能力。

例如navigate已发出但loading事件尚未抵达时点取消，renderer立即发送不带revision的cancel，main直接撤销并resolve原choose；无需等待旧navigate。旧目录读取、旧confirm、旧view回执均按id/epoch丢弃，不能重新打开已取消界面。关闭流程直接调用cancel，不依赖正在销毁的renderer发包。

业务gate不在新source picker动作中等待原controller的串行队列。确认/取消要能解除原 choose 等待；取消不得要求原choose revision。关闭中不再接收navigate/toggle；生命周期直接cancel而非依赖renderer回包。

## React 与无障碍

在 DesktopApp 的现有全局对话框层挂载，重用 Dialog/Button 和现有主题；独立 Zustand store订阅 picker view，初次current只恢复视图、不新建会话。Native选择器不产生此事件。

渲染真实列表/复选框、文件SVG、当前目录选择、常用位置、面包屑、已选清单及取消/确认。筛选不改变选中集合。navigation/删除重绘后恢复焦点，目录载入时聚焦稳定容器，完成后移到第一项；Esc和关闭按钮都发送cancel。按钮禁用随真实pending/可选状态变化，不用合成定时器表示IO完成。短窗口内部列表/已选区滚动，底部操作可达。

列表的单击选择与文件夹双击导航按已批准稿保留首击前勾选状态，双击恢复后导航；有独立“打开文件夹”按钮供触控/键盘使用。左右/上下/Tab/Space/Enter遵循批准交互。前端串行动作始终使用最新revision，目录切换期间只取消可用，避免迟到响应覆盖新目录。

## 验证边界

先由独立代理审技术方案，再写并审核本次定向用例，TDD实现与独立code review。范围只涉及新选择器及接线、生命周期和既有统一入口。macOS实际原生行为已在UP-06验证；Windows本机不可得时，固定平台分支及受控React测试仅记模拟属性/组件验证，真实Windows运行单列未执行。HTML预览被策略拦截，不通过其他浏览器或HTTP规避；不把静态复审视作视觉实测。不运行全仓/完整导入或打包测试。
