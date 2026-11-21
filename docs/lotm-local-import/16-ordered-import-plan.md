# 用户修订：结构先行、叙事线后补细纲的方案

日期：2026-10-28。依据用户最新三条修改及独立审核补强，覆盖此前早期细纲顺序。状态：实现、结构/性能自愈及独立代码复审已完成；真实整书流程执行中，尚未完成发布和文学验收。

## 新工作流

1. 正文逐字导入。
2. **结构大纲**：仅确认卷/章元数据，不生成outline artifact（包括来源细纲）、不写Volume.summary细纲。
3. 角色、场景、物品、世界观、主题、文风、伏笔、按选择的其他设定、爽点/泪点、世界线、叙事线。
4. 叙事线成功后，最后引入来源outline并分析推断细纲，再执行全量review/repair。
5. 以最终outline artifacts为canonical，在发布前一次性投影章级细纲；之后复核、发布。

`importSteps`新增独立`outline-structure`步骤；`outline`只表示最后的细纲。语义与legacy工作流的outline分析都移到narrative之后、review之前。启动和策略迁移同样延迟来源outline，不得只移动AI ordered数组。

## 细纲 canonical、投影与发布门槛

- 扩展`outline.facts.chapterIndex`，使用全书0-based索引，绑定当前冻结章节快照。非法/重复index、同ID改绑章节、空细纲和错误证据均拒绝；artifact merge、coverage和章归属校验先于任何提交。
- 章级artifact的review/repair只修改canonical artifact。发布前投影时仅填空Chapter.outline，并记录`detailedOutlineIds[chapterIndex]=artifactId`；已有非空值不自动覆盖。repair完成后按该映射同步，恢复/重开一致。
- 每章须有有效细纲才能发布；coverage.outline完整仍不足以通过。review前和`assertPlan`发布前均验证canonical/Chapter映射、全部章细纲、非法/重复归属及最终hash。
- 第一卷Volume.summary只聚合**不含chapterIndex**的卷级/来源大纲；章级细纲进入Chapter.outline及对应cards/tellings，不在第一卷重复。导入记录仍保留全部材料。03验收按此修订。
- `importPlanHash`包含最终Chapter.outline与detailedOutlineIds；canonical artifacts和语义verifiedHash继续绑定，不能只写Chapter而丢失依据。

## 结构识别：层级而非称呼

- 本地明确规则继续使用；不把“部/卷/册/编”等字面当唯一判据。两层结构第一层为卷、第二层为章；三层结构第二层为卷、第三层为章，依次取实际叙事父层与叶层。
- 单文件（TXT/Markdown/DOCX/PDF/HTML）优先标题层级、邻接空行、编号与全文结构；多文件优先目录层级，其次文件名，最后文件内标题。不能按扩展名猜卷章。
- 本地无法确定或存在未归属卷时，已授权AI分类流程可追加`intent='structure'`请求。structure独立stage只接受`chapterCuts`与`ignoredStarts`，不得混入classifications/artifacts/conflicts/patches或输出细纲。
- 每个候选都必须有决定：成为cut或列入ignoredStarts；并额外要求所有本地已确认的强制边界都成为cut。删除中间真实章界、未决定候选或遗漏强制边界均失败，连续覆盖全文不能单独证明无缺章。
- 候选DTO复用ImportUnit但part携带受限JSON元数据：相对路径/目录、格式、Markdown级别、空行、文件首尾。start/title仅指真实候选，文件名只作元数据，不插入正文。
- 坐标固定为当前sourceBody的JS字符串UTF-16 code-unit offset：按session.files顺序拼接所选body units，无自动分隔符；排除区不进入坐标，跨文件接缝和astral字符不拆分。structure阶段不使用workingRevision文本。
- structure仅限phase=classify；请求/结果类型、strict schema、服务端/主进程白名单、专用prompt/result hash及runtime `(structure,classify)`逐层独立。普通classify的prompt/hash/golden不变，structure使用专用候选序列化。

## 授权、提交与恢复

- 沿用classificationGrant模型快照/预算/取消，但structure有独立候选几何与result hash，不复用classification coverage。暂停同进程可恢复；进程重开撤销授权，必须重新确认。
- `set-chapters`使structure授权/候选失效，不影响普通分类既有保留规则。任何模型/范围变化、invalid_json/incomplete/network/取消均无部分采纳。
- 各批结果先累计在私有候选中，全书合并验证通过后复用正式`set-chapters` candidate+invalidate一次提交；不逐批写正式chapters。
- 旧H05已停止且未发布，rev953/13个早期outline artifacts/139 coverage已隔离保存。新构建后通过正式`set-chapters`重确认，清空旧coverage/artifacts/analysisGrant/语义状态及旧Chapter细纲，不直接编辑journal。已完成/已发布会话不走此路径。

## 定向用例

| ID | 必须满足 |
|---|---|
| LOTM-L-ORD01 | body后仅outline-structure完成，早期无来源/推断outline artifact；narrative后最后outline，随后review/publish |
| LOTM-L-ORD02 | 章级细纲按chapterIndex只填空Chapter.outline；已有内容不覆盖；repair后同步；卷级/来源summary不重复；最终1402章细纲齐全 |
| LOTM-L-ORD03 | 非法/重复index、同ID改绑、空细纲、错误证据、review前缺失及publish前篡改均失败；最终hash/恢复一致 |
| LOTM-L-STR01 | 两层/三层标题及不同称呼按实际层级切分；本地明确结构/仅本地分类零AI |
| LOTM-L-STR02 | TXT/Markdown/DOCX/PDF/HTML及astral候选offset正确；多文件按目录、文件名、文件内标题，跨文件排除区/接缝不变 |
| LOTM-L-STR03 | 非classify、混返回、伪造/重叠/越界offset、重复卷名、忽略候选、删除强制章界、非法JSON、取消均拒绝且无部分采纳 |
| LOTM-L-STR04 | structure独立grant/hash/runtime，暂停恢复与重开再授权分离；普通classify与legacy hash不回归 |

先独立方案/用例审核，再TDD、代码审核、定向回归和真实同一整书恢复。最终仍按用户原始全部目标验收。
