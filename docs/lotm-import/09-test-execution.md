# 专项执行与治愈记录

日期：2026-10-27（Asia/Shanghai）。此记录随实际执行追加，未执行项目不得记为通过。

## 来源A与首次输入测试

顺序：01调研 → 02独审 → 网络下载A → 03输入独审 → 04专项用例 → 05用例独审 → 实际输入测试。原件下载清单与全文均在隔离目录，未进入仓库。

2026-10-27T13:53:22Z 使用 Python3 对实际原始文件严格GB18030解码，重算原件hash、独立元数据hash、1394个逐章范围/hash及八段主线拼接hash。1394个逐章断言和主线基线一致，原件未变。执行输出 `candidate-A-preflight-red.json`，命令真实退出码 **1**。

| 用例 | 此时结果 | 说明 |
|---|---|---|
| LOTM-IN01 | BLOCKED | 机械范围已核对；官方目录第六卷62位置的差异当时待补证 |
| LOTM-IN02 | FAIL | 来源既成乱码，独审记录22行候选及2596次独立拉丁k；不能靠正确解码或原件自比抹去 |
| LOTM-FLOW01至PERSIST01 | BLOCKED | 当前候选未获完整正确性基线资格；尚未发起本书真实模型分析或发布 |

原始失败结果保留，不因后续补证覆盖。随后输入独审取得阅文官方免费第62章，确认章身份，应保留；候选与官方仍有文字差异。补证文件 `input-independent-official-chapter62-review.json` SHA-256 `e56efe5dfb39e3fe95d7d3a80acf76fa3cdc27336dafaec738feb1e6141e15c1`，不代表IN02治愈。

## 来源治愈

- 起点原作品页由web访问返回403，联网直取返回202短响应，均非全文。
- noveless来源页200，原TXT压缩包链接403，未下载成功。
- zxcs TXT直链200，实际保存9,468,472字节候选A；发现来源质量失败后保留原件。
- 其它页出现403或超时；一次自动权限审核超时，工具未执行，按提示重试一次后成功读取sobqg公开下载页，无用户额外许可需求。
- 通过原博客公开链接与公开访问码查看城通候选B，使用普通下载；页面显示完成，但浏览器download事件未返回本地文件，未把UI状态当作实际落盘。改用该页面已观察到的同一限速文本资源直接保存，保留原限速参数。此处记录时仍在下载，不预填通过。

## 卷结构产品治愈

06方案及V01–05用例已完成07独审和补充复审，可进入RED/TDD。实现及真实命令结果单独记录于08；合成组件检查不抵扣本书真实全流程或八类语义验收。未运行全仓测试。

## B1正式流程已开始

B独审与派生准备独审完成；正文不改字、不改行尾，1394章映射相等。新会话 `586a62d6-3a5f-4e36-8561-93b9f39afe7a`，真实隔离Electron应用，独立app-data与独立空作品目录，原应用/作品/聊天/草稿未迁入。只将已有加密模型记录保留于私有测试应用配置，没有解密或输出Key；公开文本/审核模型均为当前DeepSeek-V4.1-Flash、1048576上下文。

源码/构建指纹见 `evidence/build-identity.json`，UI与desktop构建均exit0。首次受限Turbopack构建无进展，停止本次构建后在正常开发权限环境重建成功；没有切换webpack或启动HTTP监听服务。13独立代码复审通过，作者组合14/14与独审LOTM检查10/10的范围分别见08/13，不混作全书结果。

实际原生选择了冻结派生TXT，读取4,884,348字符、5588来源单元。本地分类把其中4个正文单元标成item，导致所选正文hash不等于基线，已保存 `flow01-classification-red.json`。经正式“查看正文来源”→“确认片段分类”将0..4884348全部标为body，原件不变、没有写入journal注入；`flow01-classification-green.json`证明5588单元全为body、1394章的范围/标题/卷名/内容hash全部与事前独立预期相等。此处是通过产品现有手动核对治愈，不冒称AI来源识别通过。

仅选择body与8项补全，确认界面截图见 `evidence/native-confirm-B1.png`；正式保存目录为隔离目录下本次新空作品文件夹。`before-analysis-consent.json`核对了精确targets、原件/正文hash、1394章和无先前模型结果。核对脚本初版误假设confirm时workingProse已经物化而exit1，实际设计在start才物化；修正检查为selected sourceBody后通过，未把该脚本假设当产品缺陷。

2026-10-27T14:29:07.182Z经真实“允许分析并导入”启动。rev13显示正文拷贝5588/5588完成，5587个working units进入大纲分析，第一个runtimeAiCall为analyze/outline；此时尚无大纲产物、未进入其它目标、复核、发布或持久化验收。只完成已列阶段，不预填最终通过。

首个大纲批次在rev14失败；经正式“重试导入”后14:33:08Z再次开始同一首批，于rev19再次因artifacts.N.evidence.M校验失败。两次均包含generateJSON现有的一次纠错重生成；没有采用无效产物、没有新增coverage。完整失败检查点及错误摘要分别留在私有run目录，仓库截图为 `evidence/native-evidence-failure-B1.png`。正文hash始终为冻结值。

第二次失败后停止盲目重试，17/18完成定向治愈方案/用例独审：严格来源证据门不变，明确诊断且仅对证据错误缩小原单元批次；未开始实施时不预填通过。随后经应用原生菜单正常退出隔离应用，进程实际exit0；私有失败快照rev19保留，应用生命周期另写入paused检查点rev20、正文未变。关闭记录脚本最初将phase硬编码为failed，已保留该脚本错误记录并按实际磁盘检查点纠正。早先cmd+q未导致退出，因此不计成功，最终以菜单退出及进程结束为据；此关闭发生在未完成阶段，不计最终发布/重开验收。

## B2修复后的真实复测授权门

证据批次修复通过20实施及21独立代码审核；作者最终新/旧直接回归组合63/63，独立E/J/R定向50/50，静态0诊断。保留旧异常类型的兼容RED与修复未隐藏，详见20/21。随后desktop重建exit0，B2启动身份/PID/源码与63项迁移指纹另存私有 `build-identity-B2.json`，未覆写原构建证据。

B2已实际正常重开同一session，经“导入已暂停”→“继续导入”→原生重新选择同一保存目录，进入confirm rev23。正文hash/1394章/8targets完整保留，analysisGrant为空，尚未重新发送模型请求。

重新点击“允许分析并导入”时，**自动审批拒绝**：认为现会话尚未明确授权这份完整小说及相关设定发送到具体DeepSeek目的地 `https://api.deepseek.com/`。该次点击未执行，没有通过其它入口绕过；主代理已异步请求人类明确授权，等待答复。私有 `B2-external-authorization-blocked.json`确认confirm、无analysisGrant、零artifact/coverage、正文未变。此前B1真实失败请求确已发生，不将本次拒绝表述为此前从未外发。

等待授权期间仅继续本地审计工具的独立审核。完整真实复测、八类语义、发布与最终持久化验收尚未通过。

## 授权门前本地工作收尾

19/22机械审计工具独审发现的required marker契约、scratch/output及内部链接替换、规划投影字段漏检均完成实际RED→修复→同组GREEN；最终作者及独立定向15/15，静态0诊断。该工具未在本书未完成数据库上运行，也未调用任何模型。

主代理最终执行`npm run typecheck` exit0，记录 `evidence/typecheck-final.txt`。独立审核通过后的安全`--describe-build`仅读取源码/构建/迁移及PGlite版本，exit0；其18项SHA及63项迁移与B2启动绑定完全相等。以新文件 `build-identity-B2-auditable.json`追加PGlite 0.5.8及原启动身份，不修改先前证据。正式审计仍要求completed及正常退出后的同PID/launchId关闭证明。

阶段产物与未通过验收的事实汇总见23；外发授权仍待答复，未再次尝试被拒动作或使用替代发送方式。

## B2明确授权后继续真实全书分析

2026-10-28（Asia/Shanghai）用户明确答复“同意发送给 DeepSeek，继续全书测试”，授权对象为完整主线正文约488万字符及生成设定，目的地为`https://api.deepseek.com/`，用于八类分析、复核和完整导入测试。原自动审批拒绝记录仍保留，此次继续依据新增的人类明确授权。

先核对同一session仍为confirm rev23、1394章、精确八targets、正文SHA未变、无analysisGrant/产物。原生界面重新选择同一隔离空目录，rev24；随后经“允许分析并导入”真实启动，2026-10-27T18:50:24.219Z进入analyze/outline，rev28/running、analysisGrant已建立。界面证据`evidence/native-analysis-B2-authorized.png`，私有运行目录保留`B2-explicit-human-authorization.json`。首次点击未推进；完成目录重新确认后成功，不把未推进点击记为已发送。

本次继续使用此前已冻结、正在运行的B2构建。用户随后要求的两处标题改为“导入正文”“补全设定”已在源码及两项既有UI测试通过，未热换进行中的B2构建；截图显示旧标题反映该冻结版本，不冒称新文案已进入本运行构建。尚不预填分析、发布或验收通过。

B2实际治愈进展：首包及二分首子包仍触发严格证据定位失败，控制器分别在18:52:03Z、18:54:52Z发起缩小后的独立请求，没有新增失败父包coverage。18:55:40Z前首个成功叶包提交：rev32含1项大纲（开篇六章），outline coverage为23/5587。此结果证明小包路径已在真实模型请求中开始推进，不能据此推断全书通过。

为让最终验收采用用户刚修改标题的同一实际构建，主代理通过真实“暂停”保留rev33，再经原生菜单退出B2，进程实际exit0（私有`process-exit-B2.json`）。私有`B2-paused-for-copy-build.json`保留23个已分析单元、1项大纲与不变正文hash。UI旧进度仍显示0/5587，不能据其否定检查点中已有23单元；这是显示刷新局限，本次以实际检查点记录进度。B2未完成，不记为最终关闭/重开验收。B3将正常重建、恢复同一检查点并在其实际完成进程内绑定最终审计，不回写B2构建/时间证据。

B3 UI构建及desktop构建均exit0，日志`evidence/build-ui-B3.txt`、`build-desktop-B3.txt`。18个源码/构建指纹、63迁移及PGlite版本在启动前新冻结于私有`build-B3-prelaunch.json`。B3真实启动18:59:10.891436Z，PID97710，launchId `ed252e3e-6c25-43c4-a15a-652da6fbe1c5`，新追加`build-identity-B3.json`；Python父进程等待实际退出并将独立写`process-exit-B3.json`，未预填退出结果。

原生入口恢复同session→继续导入→选择原目录→允许分析并导入，19:00:03.305Z rev40/running重新分析未完成单元；已有outline coverage23及1产物保留，正文hash不变。新确认页标题真实显示“导入正文”“补全设定”（`evidence/native-confirm-B3-new-labels.png`）。运行页从历史检查点保留旧body步骤label“拷贝正文”，当前大纲进度为23/5587；不能声称旧步骤数据已重命名。此前源码改动只改新步骤模板，未改本历史检查点的持久化label，未手工编辑会话。

已将B2首个成功叶包投影为私有稳定`B2-first-leaf-semantic-review.json`，hash `d0a5aa7617a4ce130751149ff16c335dbb941f9e239136e6904b80414e0d235f`，仅23units/20581字符/1大纲及绑定元数据，无模型配置与授权对象，交独立代理做首包逐事实审核。另一代理独立盲读冻结正文建立逐章来源清单，尚不把任何抽样/部分阅读记成全量语义验收通过。方法见24。

首叶独立语义审核25已实际完成，完整阅读23units和全部1项大纲/16引文。来源实际为前五章完整及第六章部分，非六章完整；前文“开篇六章”来自模型产物名，应按25精确范围解释。16条引文均字面命中，但LF-F01动作/对象错述、LF-S01a/b章归属错误、LF-V01视角范围过窄均使本叶语义不能通过；另保留范围、时点、引证覆盖的独立问题。未修改产物、oracle或向生产模型注入审核答案。B3后续正式review/repair尚未执行；待其生成修订产物后逐项重新核验，不以字面引文/计数消项。

19:11:28Z前B3接纳第二叶包，rev46共2项大纲、outline coverage28/5587。主代理完整阅读新增5units的4372字符和新产物全部text/facts/18条evidence，稳定投影`B3-second-leaf-semantic-review.json` SHA `b22fadc2c5b9535cfe71e18f1d0ffabe381519119d9390ca7d7b1a1c7f8de8ea`。新增范围是第六章剩余734字符及完整第七章。未发现概述事件中的明确硬事实错述，但范围标题、单一周明瑞限知归因过窄、占卜/22途径纸牌讨论的摘要粒度遗漏均保留待核对，私有`B3-second-leaf-review-notes.json`记录，未判本叶或全书语义PASS。未改实际产物，也未把审核答案送回生产生成器。

B3 rev56大纲累计11项、coverage58/5587。主代理对第十二章冻结全文[41030,44198)完整核对（hash606a46…42e65），发现真实产物`outline-ch12-again`的facts.temporalScope写为“清晨至半夜两点多梦醒后”，把梦中清晨和实际睡前/半夜混为同一现实时间框；text仅对后段逃亡显式加梦中，前段晨间上门/证词/枪源/专家提前到达也必须明确属于梦境。产物确实保留了最终噩梦揭露及醒后走廊再见邓恩，不能错误记录为完全没标梦。私有稳定投影及问题为`B3-chapter12-semantic-review.json`、`B3-chapter12-review-notes.json`；问题DREAM-TIME01/DREAM-SCOPE01开放，待实际全局review/repair后重验。世界线/叙事线尚未生成，不将本问题冒称为两线已发生错误。另核对session对应章范围/hash与expected-chapters相等：working unit可包含邻接章前的CRLF，不是正式章边界错误。

## B3真实显示缺陷治愈

28技术/定向用例及29独审→现有E03/E05/NI-U05真实RED→两处最小修复→作者12项核心/2项UI GREEN→30独立代码审核及E03/E05复验通过，详31。旧B3真实UI仍23/5587而检查点175，截图`native-progress-stale-B3.png`；旧正文名称来自历史step数据。原checkpoint原子同步计数及纯显示文案修复均未改变模型接纳规则，26仅方案未实施。

B3经真实暂停保留rev97/outline175/50大纲，正文SHA未变，随后原生菜单正常退出，真实PID97710 exit0、退出时间19:47:32.944833Z。B3原源码两文件保留并核其启动SHA，旧构建证据不覆写。最终审计须新的实际完成所属构建，不能把B3历史身份改成当前源hash。B4已开始正式构建，UI构建及类型检查exit0，恢复和运行后增长尚待实证。

B4已实际正常重开：PID52984/launchId346b8cfb-a1de-461e-b17c-d6e209399d55，构建及恢复证据详31。19:50:38.127Z同session继续分析未完成范围，原生UI新正文名称、175/5587起点已确认；1394章/八targets/正文hash/50大纲均保留。等待新叶提交后检查UI实际增长。外发授权沿用户明确答复持续有效，未改提供商、模型或目的地。

B4实际新叶已提交：175→198工作单元，50→56大纲。真实AX和`native-progress-B4-leaf.png`显示198/5587，checkpoint同一step.completed==coverage、total5587、正文hash不变，确认31的真实显示治愈GREEN。文学语义/其余目标/全局复核/发布尚未完成。

## B5真实未分类结构失败

B5 desktop build exit0，仅service源与dist/service变化；UI精确复用B4 BUILD_ID，63迁移不变。B5 PID72045/launchId50455734-8f17-4111-b7d1-2f559aca9f4c，20:07:31.697191Z启动，两个ANCHOR诊断门按计划隔离启用。原生恢复同session/原目录及授权，20:08:46.057Z开始分析。

20:14:37Z前rev118/failed：错误首6路径为artifacts.6.evidence.3、artifacts.12.evidence.4、artifacts.17.evidence.1、artifacts.22.evidence.4、artifacts.23.evidence.0、artifacts.23.evidence.1；完整原错误/快照留私有`B5-terminal-rev118.json`。覆盖198/5587、56大纲保持，无失败包虚增。固定纯证据诊断0行，控制器未二分；只凭6条路径不能认定所有issues都是纯证据。14:55资源快照在本UTC执行时间20:14:55附近显示隔离PID72045 CPU0.0%/RSS89728KB，单一瞬时值不证明provider故障。

停止盲重试，34制定完整safeParse元数据只读观察方案，仍不接纳无效响应、不扩大二分白名单；待独审。
