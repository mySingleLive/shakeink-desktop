# 真实小包进度及旧草稿文案治愈方案/用例

日期：2026-10-28。状态：待独审，未实施。范围仅主任务真实长书导入的进度显示，以及用户已要求的“导入正文”文案。

## 真实发现

B2实际rev32已有23个outline工作单元，界面仍0/5587；B3恢复后起点显示23/5587，但后续rev90已157个工作单元，semanticAnalyzeUnits每成功叶checkpoint只更新coverage，直到整个kind结束才更新步骤计数。截图`native-running-B3.png`与09/私有progress.jsonl证明两个状态。B3新确认页正确显示用户新文案，但历史steps中body.label仍为“拷贝正文”，运行页直接渲染持久化label，未按新文案显示。不能手改journal消除两问题。

## 最小改动

1. desktop/main/novel-import.ts：只在普通semanticAnalyzeUnits成功叶的既有原子checkpoint内，提交artifact/conflict/coverage后同步当前kind对应step.completed为已提交去重coverage长度、total为全工作单元数量。state继续原running/等待/失败/跳过协议，skip不改。失败父包、无关错误、单单元失败、epoch变化、暂停/取消及迟到结果仍不得产生虚增进度；不另加第二次checkpoint、不加请求、不改数据/预算/权限/模型/匹配/正文/几何。共享scene-item/settings步骤仍按既有当前kind含义，不能把多kind覆盖相加。
2. src/components/desktop/NovelImportDialog.tsx：ProgressScreen中body步骤显示固定当前名称“导入正文”，其它label不变；仅显示投影，历史步骤对象/journal不迁移或写回，确认计划仍“导入正文”“补全设定”。

## 定向用例/TDD

| ID | 复用现有定向用例 | 预期 |
|---|---|---|
| LOTM-PROG01 | E03左叶成功、右叶失败并正常重开 | 左叶checkpoint即coverage==step.completed，total==完整workingUnits；失败不回零、不虚增，重开保留。先补断言真实RED。 |
| LOTM-PROG02 | E05暂停/迟到右包 | 暂停前已提交左叶计数相等；迟到/取消后不变，未发布。先补断言真实RED。 |
| LOTM-PROG03 | E02/E04必要回归 | 二分失败父包不计，最终done等于全量，原白名单/错误/预算保持；不跑全仓。 |
| LOTM-PROG04 | NI-U05既有恢复流程及B4真实UI | 合成旧草稿body.label为旧值时显示新名称，暂停恢复/收起/取消行为不变；真实旧journal保持旧数据但UI显示新名，成功叶后UI计数实际增长。仅复用既有UI用例，不新增镜像文案测试。 |

先独审方案/用例→补现有断言并RED→最小实现→独立代码审核→定向GREEN。需要构建B4时，主代理通过正常UI暂停并正常退出B3、保留已有全部结果/覆盖/正文hash及真实exit证据；重新构建并追加B4静态/进程身份，通过真实恢复原session/目录/已有授权继续。生产源码一旦变更，就不能用旧B3 build绑定当前checkout假称最终审计通过，最终completed必须由实际完成所属构建产生。

这是显示正确性治愈，不能消除25及DREAM-*语义问题，也不能抵扣其余目标生成/全局复核/原生持久化/全书文学验收。26诊断方案继续作为尚未实施的备用，不夹带实施。
