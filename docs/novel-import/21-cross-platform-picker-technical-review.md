# 跨平台统一来源选择器 · 技术方案独立审核

日期：2026-10-26。审核者：独立子代理 `unified_picker_review`。范围：20技术方案、已批准17/18/19产物，以及现有 `chooseNovelSources`、`NovelImportController.choose/pauseAll/close`、`BusinessGate`、`CloseCoordinator` 与 main 的生命周期接线。只读审核，不编生产代码或测试，不运行测试。

**最终结论：独立技术复审通过，可进入本轮定向用例设计与独立审核。** CP-TR01、CP-TR02 已在当前20方案中关闭。以下保留初审依据与修订闭环。

## 初审结论

**暂待修订 CP-TR01、CP-TR02 后复审。** 统一选择界面、严格语义IPC、主进程能力ID、同owner校验、只读元数据浏览及 Windows 无shell盘符探测的总体方向符合已批准产品/UI；以下两个接点需在实施前具体化。

## CP-TR01 · P1 · 确认身份必须持续绑定至实际来源读取

20方案写 confirm 重新检查全部已选项目及祖先，随后“只返回主进程已登记路径给既有 controller/scanNovelSources”。现有 controller 在 `options.choose()` 返回后才调用 `scanNovelSources`；扫描器用收到的裸路径重新建立 `pathIdentity`/文件 proof。若文件或其祖先恰在 confirm 校验完成到 scanner 开始之间被替换，scanner 会将替换后的对象当成新合法对象，不能再知道它并非用户在选择列表看到的原对象。

需要将已选文件/目录及祖先 proof 作为仅主进程持有、绑定当前 picker/owner 的可信 grant 持续传递到扫描边界。首次访问/提取来源前后须对照原 grant，或采用等价的封闭读取方案，不能确认一次后丢掉原 proof、仅凭路径建立新身份。renderer 仍只发送能力ID，不能提交或更改 proof。父目录递归的授权根与文件来源应保留对应根身份。

定向用例应在“确认已经校验/choose即将返回”和“scanner首次取身份/读取”之间注入文件、目录或祖先替换，断言拒绝且不导入新目标；不能只测试 confirm 前变化。

## CP-TR02 · P1 · cancel 必须绕过目录队列且不能受迟到 revision 阻止

方案同时要求“除 current 外绑定 id/revision”“前端串行动作”和“cancel 立即撤销会话、不等待在途目录枚举”。若 navigate 尚未返回，renderer 取消仍排在原变更队列之后，就无法即时解除选择器/原 controller 的等待。即使单独发 cancel，loading 视图 revision 在 main 已更新但尚未送达 renderer 时，最新界面也可能发出旧 revision，严格版本拒绝会使取消失效。

需要明确：cancel 在 renderer 和 main 均走队列外的窄入口，校验受信主frame、当前owner与当前picker ID；对相同有效会话的取消不因旧 revision 失败。生命周期直接cancel不依赖renderer动作。cancel先封闭会话/递增epoch并解除choose等待，旧navigate/confirm回执不能恢复其视图或重新开放能力。其他可变动作仍严格版本校验。

选择取消、关闭开始或 owner 撤销时也要避免 `chooseNovelSources` 在 null 结果后再执行会失败的 owner/closingFlow断言，将无结果的纯取消转换成导入错误；null 没有可消费的文件能力，可以直接沿取消路径返回。实际选择结果仍须执行全部归属检查。

## 生命周期接线核对

现有 `NovelImportController.pauseAll()` 首先 `await this.tail`，choose 正处于该 tail 内等待用户选择；`BusinessGate.close()` 等待全部 admitted promise，原 choose IPC 也属于其中。因此20已要求在 `beginClose`、stopTasks、closeData、失联/releaseOwner/主frame导航、根切换与窗口销毁中先cancel选择器，再暂停/关闭controller或排空gate，此时序正确且必要。实施用例应覆盖关闭、迁移、失联以及旧会话回执，不能只断言调用过cancel。

## 实施与定向用例须落实的有界性

- 方案中的目录项上限、能力ID淘汰、5000项选择上限须落到明确常量与计数，不静默截断清单。当前目录即使项目过多仍可选择，真正递归扫描沿既有5000项上限报告。
- A–Z 探测和目录读取应有并发/在途预算；Promise.race 超时仅停止等待，不会取消底层 fs 调用。超时后仍要计入未完成IO，迟到返回的目录句柄需关闭，不能反复导航/取消时无界积累挂起操作或句柄。取消无需等待这些IO，但收敛责任须由选择器自身持有。
- 目录和项目读取前后核对祖先身份，拒绝symlink/junction，不将原始异常或堆栈发送renderer；不读取正文、不调用模型、不启动shell/PowerShell。
- Windows组件/固定平台分支可以在当前macOS上验证，但真实Windows运行须单列未执行；静态HTML批准不能替代真实权限、文件身份或生产界面验收。

修订后仅针对 CP-TR01/02 及上述约束复审即可，不需要扩大架构或运行全量测试。

## 最终针对性复审

同日复读当前20方案，**独立技术复审通过**，没有必须退回的新接点：

- **CP-TR01 已关闭**：自定义选择结果改为仅主进程产生的 `ImportSourceGrant[]`，携选中项目及祖先 proof 进入扫描器；直接文件在 open 前、handle读取前后验证原proof，目录沿原root chain 在扫描前后核对，不能以新对象重新建立授权。renderer 不接触可信proof。macOS原生结果保持原兼容路径，不扩大AI或发布协议。
- **CP-TR02 已关闭**：cancel 明确不要求revision，前后端均绕过目录变更队列；同owner+picker ID负责授权，epoch封闭旧请求，旧navigate/confirm/view均不能重新开放。navigate已发但loading尚未到达的竞态有明确处理。main/controller 在null/空选择时先返回，避免生命周期owner撤销把取消变成导入错误。
- Windows盘符探测改为串行、短超时后停止后续根探测，保留home所在根及已有根；这避免一次枚举同时创建26个不能取消的fs等待。目录枚举/能力/选择数量均有明确有界要求，无shell或新增依赖。

定向用例仍应落实本审核列出的在途预算约束：跨会话统计尚未真正完成的fs操作，超时不提前释放预算，迟到目录句柄关闭，取消后的旧回执不持有活动能力。此为已通过“in-flight IO有界等待并收敛”的具体实现约束，不扩展本轮目标，也不允许只靠Promise.race声称底层IO已取消。

下一阶段只编写及审核该选择器、归属、授权连续性、取消/排空接线和真实React交互的定向用例；不得运行全量测试，不将模拟Windows分支或静态UI批准标为真实Windows验收。
