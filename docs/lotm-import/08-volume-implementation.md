# LOTM-BODY02 卷结构治愈实施与定向验证

日期：2026-10-27（Asia/Shanghai）。实施者：子代理 `lotm_research_review`。范围遵循 `06-volume-healing-plan.md` 和 `07-volume-plan-review.md` 及追加复审。主代理明确通知允许进入RED后才修改生产代码。

## 本轮结果与限制

**卷结构定向组件验证通过：14项通过、0失败；目标入口TypeScript检查0诊断。** 尚待主代理安排最终独立代码复审、当前构建的真实小说/UI验收。没有启动应用、调用模型、读取真实配置/数据库，未改小说原件。本文件不声称《诡秘之主》全书导入或八类文学语义验收通过。

## 实施内容

- `desktop/core/novel-import-chapters.ts`：默认检测行为保持原样；显式 `{volumes:true}` 启用独立中文卷/部标题识别。卷元数据使用标题中的纯卷名，完整卷标题字符仍留在本卷首章正文。真正的正文前言保留独立章。重复章号保留全部章节；没有明确卷标题的章号1重启撤销此前归属并给出诊断，不臆造新卷名。
- `desktop/core/novel-import.ts`：新会话的自动/手动分章按来源重新派生卷归属；手动确认删除/移动明确卷界、提供不匹配卷名会拒绝。元数据通过 `toImportView` 保留。新版未解决的卷归属诊断在手动确认后仍显示，旧版保留原显隐行为。analyze scope只在有实际volume时绑定该字段，版本标记单独参与授权和计划身份。
- `desktop/shared/novel-import.ts`：新增可选 `chapterVersion:2` 和set-chapters/view中的可选volume；卷名须非空、无首尾空白、不超过300个UTF-16单元且Unicode良构，无控制字符。无字段的旧会话不补版本或默认卷名。
- `desktop/main/novel-import.ts`：仅新建会话设置chapterVersion2。journal保存、恢复、hash及发布路径拒绝未知版本。手动确认先在候选副本校验，校验失败不改变原会话/检查点；成功后正常失效旧分析授权与检查点。旧会话仍走原检测算法。
- `desktop/service/novel-import-publish.ts`：在创建作品前校验连续卷分组与来源归属。拒绝A→B→A、A→默认→A、默认→A→默认及两个独立同名卷标题；不通过跨全书Map聚合改变顺序。按源序创建原生Volume及规划卷，卷内Chapter.index从1开始，规划章节order和叙事chapterIndex继续使用全书顺序。未归属章明确使用“导入内容”默认卷。完整原大纲继续保存在首卷summary和既有导入记录，不复制到全部卷。旧无卷/仅大纲会话保留原单卷行为；回执重试不重复创建。新发布记录保存chapterVersion。
- `src/components/desktop/NovelImportDialog.tsx`：现有核对卷章页面的初始cuts保留可选volume，沿用原控件和确认动作。

没有修改原生数据库schema、其它业务实体、模型结果/提示词或旧六书脚本。

## 实际RED与治愈记录

1. 在改生产前固定两种旧输入（无卷、有明确卷标题但无volume元数据）的classify/analyze/plan黄金值，见 `evidence/volume-legacy-golden-before.jsonl`。
2. 新增LOTM-V01/02/03/05单测后，原实现实际exit1、7项失败；包括17章代替16章、卷标题错误归入序言、元数据丢失、scope不绑定volume以及协议拒绝合法volume，见 `volume-unit-red.txt`。这是真实组件失败，不是手工填写结果。
3. 仅追加临时PGlite V04/V05后，原发布器实际exit1、2项失败：原生只创建1卷而非8卷，且异常分组没有拒绝，见 `volume-publish-red.txt`。
4. 首轮实现后单测曾剩4项失败，见 `volume-unit-green-attempt1.txt`。其中两个旧会话手动确认预期错误地忽略了原有chapterDetection审计和controller原有正文缓存失效行为；依据既有 `importSemanticAudit` 和invalidate行为纠正测试预期，保留原始静态黄金值，另记 `volume-legacy-manual-golden-correction.jsonl`，没有修改legacy产品行为迎合测试。首轮修订后的单测7/7、PGlite2/2通过。
5. 自查增加无空格章名重启负例，实际exit1、V02失败，见 `volume-compact-restart-red.txt`；将重启识别与已有中文章/节/回前缀解析对齐，不要求标题后有空白。
6. 独立审核发现手动确认隐藏新版缺归属警告。先增加V03精确manual→view→序列化恢复断言并实际exit1，见 `volume-manual-diagnostic-red.txt`；只调整新版view诊断显隐，正文、授权和旧版行为不变。
7. 独立审核发现“上一章也是第一章”豁免会使缺标题的新章错误继承旧卷。增加相邻两个第一章缺标题负例并实际exit1，见 `volume-adjacent-restart-red.txt`；删除该豁免，不猜测重复编号还是新卷。V01合成夹具仍为八卷各两章，末卷两个章均使用第2章编号以明确测试重复编号保留；所有16个章节均保留，没有删除章节求通过。

## 最终定向验证

命令（Node 24.18.0）：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^(LOTM-V0[1-5]:|NI-CH0[1-5]:)' tests/unit/novel-import-volumes.test.ts tests/unit/novel-import-chapters.test.ts tests/integration/novel-import-publish.test.ts
```

实际exit0，**tests14/pass14/fail0/cancelled0/skipped0**，duration13876.685667ms。含LOTM-V01–05、V03四个子项和既有NI-CH01–04最小分章回归。证据：`evidence/volume-final-directed-green.txt`。

覆盖要点：八卷16章及逐字拼接；重复编号保留；真正前言与普通句子不作卷名；缺标题及紧邻章号重启；scope/plan绑定与旧黄金值；手动确认和实际controller保存/关闭/重开；旧journal恢复及手动确认；未知版本拒绝；警告在新版手动确认及恢复后可见；两个原生叙事分别关联第二卷首章及第八卷末章；每卷原生编号与规划全书序号对齐；出版重试幂等；默认/仅大纲/混合组；非法及非连续分组在作品创建前拒绝。

静态检查以六个改动生产入口、两个测试入口及项目已有ambient声明/next-env为根，使用TypeScript `createProgram`，`incremental:false/noEmit:true`。最终exit0、diagnostics0，见 `volume-targeted-typecheck-final.txt`。首次遗漏ambient声明造成36条环境诊断，记录在 `volume-targeted-typecheck.txt`；补足已有声明后通过，没有为消除这些诊断修改其它源码。

全部组件输入为合成文本、临时隔离文件/PGlite。仅执行上述专项及直接分章回归，未运行全仓测试。六个生产文件的最终SHA见 `evidence/volume-production-frozen-sha256.txt`；供独立审核和主代理当前构建核对。

## 后续验收

主代理仍须以当前构建、完整且已独立核验的本书来源经过真实UI导入，核对八卷原生结构、所有正文章节及文学八类数据。候选原文本身的缺卷标题/乱码/番外范围属于独立输入问题，本轮组件通过不能消除或抵扣这些问题。
