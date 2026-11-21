# 本书最终持久化机械审计最小方案

日期：2026-10-27（Asia/Shanghai）。状态：**方案/定向用例待独审，尚未实施脚本，未读取运行中数据库或最终journal。** 本轮只新增方案及后续新脚本/测试，不修改旧工具或生产代码。

## 固定对象及产物

- run：`LOTM-20261027-B1`；冻结目录：`/private/tmp/shakeink-lotm-import-20261027/LOTM-20261027-B1`。
- 唯一允许的应用根：`/private/tmp/shakeink-lotm-runtime-20261027/app-data`；唯一session：`586a62d6-3a5f-4e36-8561-93b9f39afe7a`。
- 唯一作品目录：`/private/tmp/shakeink-lotm-runtime-20261027/works/LOTM-20261027-B1`。workId/novelId最终从该session的完成回执取得，再与此目录manifest交叉绑定，不从全局catalog枚举其他作品。
- 拟新增 `scripts/audit-lotm-import.ts`、`tests/integration/lotm-persistence-audit.test.ts`。脚本导出可在合成隔离上下文使用的函数；正式CLI固定上述本书上下文，仅接收安全label、正常关闭声明及同schema指纹，不接收任意SQL、任意数据库/作品路径或旧书样本编号。测试注入自己的临时上下文，不得触及正式上下文默认值。
- 完整检查点投影、查询业务记录和审计副本仅写冻结run下新的排他创建审计子目录，权限0700/0600；不覆盖已有证据。仓库只记录脱敏统计、断言ID、hash与退出码。

## 原件只读边界

必须由主代理先正常关闭本次真实app，提供关闭证据及`--app-closed`。脚本检查作品writer lock不存在，复制前后及输出前重新检查身份和稳定性；声明或“未见锁”单独均不足以证明正常关闭。若没有关闭证据、锁仍存在、文件改变或目录身份不一致，停止，不杀进程、不清锁、不打开原始数据库。

允许读取范围：冻结run的确定输入文件、候选B原件及其已绑定独立核验文件；本session的`app-data/novel-imports/<固定session>/session.json`和owner标记；指定作品的manifest、存储指针元数据及其**本作品活跃数据库**。不读取app模型state/密钥、inbox/global数据库、其他journal、其他作品、图片/附件或用户目录。

不复用旧审计器的执行入口：`scripts/audit-real-novel-import.ts`硬编码旧六书且调用`Workspaces.initialize/connect`；`desktop/service/workspaces.ts:315`起会在打开原数据库时进行lease、引擎启动和迁移。即使SQL设置READ ONLY，该路径也不满足本轮不写原件的要求。

采用**只读源文件复制 → 副本SQL审计**：

1. 所有输入/目录须canonical、无符号链接；读取文件用O_NOFOLLOW并核对打开前/后device、inode、size、mtime、ctime与单链接。固定session之外的journal不枚举。
2. 验证作品manifest为ready、requestId等于固定session、workId/novelId与完成回执一致，requestHash与`requestHash({title,importHash})`一致。存储指针若存在，必须验checksum/workId及活跃目录身份；仅允许该作品根或其合法后代。指针缺失但required存在、候选目录越界或状态不明均停止，不猜原数据库位置、不调用会初始化指针的方法。
3. 对仅此活跃database目录建立排序文件闭包清单和逐文件hash/身份；拒绝符号链接、硬链接、特殊文件及目录越界。按同一打开句柄复制到审计scratch。复制后重读源闭包，要求文件集合、身份、大小及hash完全一致；源和副本路径必须不重合。
4. PGlite**只打开副本**。不导入Workspaces/Prisma工作区启动、不调用migrateDatabase、不创建作者/作品/迁移记录，不向原路径取得lease或写WAL。PGlite启动/关闭可以改变审计scratch；输出不称副本文件系统也只读。
5. 在副本使用`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`（或PGlite transaction内等价设置）及固定参数化SELECT。完成后关副本，再复核原件、journal、manifest、指针、来源和冻结输入未变化。任何变化都使本次审计失败，不能发布部分PASS。

临时审计副本是验证手段，不新增/恢复产品备份功能；它不作为可供应用打开的作品注册或加入catalog。

## 同版本与完成状态门控

先校验run.json、expected-body.txt、expected-chapters.json、added-volume-headers.json、独立B核验和最低语义清单的冻结hash；读取冻结build-identity.json。校验当前审计所用schema、生产分章/发布/语义协议文件及运行构建身份匹配；记录本审计脚本hash和已安装PGlite版本。若导入期间主代理有修复重建，应另提供追加的实际最终构建绑定，不回写旧run来抹平差异；不能静默用更新schema解释旧数据库。

使用`loadMigrations`仅计算当前迁移集合及其原始文件/规范化SQLchecksum。副本首先只读查询`SELECT id,checksum FROM "_desktop_migrations" ORDER BY id`，与绑定构建的完整集合严格相等：缺项、多项、checksum不同或schema文件不符均阻塞，不自动补迁移。

固定session须`phase=completed`、`semanticVersion=1`、`chapterVersion=2`、来源精确等于冻结派生输入、selected为正文、infer=true、targets精确为本次八类。要求publication.hash等于重新计算的importPlanHash，未决冲突/正文patch为空；正文保持冻结基线且workingRevision=0。完整语义状态须ready且input/decision/result hash吻合，repair和omission任务均完成。重新核对所有分析目标的全文单元coverage、review和逐facts任务覆盖，不把某一步done当作全书覆盖。

读取session后只保留本次机械验证必需字段；models、grants中的端点/模型配置及运行诊断不进入导出。未完成session只返回固定“未完成”错误码，不读取其目标数据库。

## 固定SQL及作品范围

全部业务查询使用`$1=receipt.novelId`，不拼接小说内容、实体ID或外来SQL。只允许以下表及必要列；无AIModel/User/聊天或全局表查询。副本内可读Novel总数以确认此作品库只有一个作品，但不导出其他作品内容。

```sql
SELECT id,"userId",title FROM "Novel" WHERE id=$1;
SELECT id,"novelId",index,title,summary FROM "Volume"
 WHERE "novelId"=$1 ORDER BY index,id;
SELECT c.id,c."volumeId",c.index,c.title,c.outline,c.content,c."wordCount",c.status
 FROM "Chapter" c JOIN "Volume" v ON v.id=c."volumeId"
 WHERE v."novelId"=$1 ORDER BY v.index,c.index,c.id;
SELECT "novelId",version,data FROM "PlanningDocument" WHERE "novelId"=$1;
SELECT id,"targetType","targetId",version,snapshot FROM "ContentVersion"
 WHERE "targetType"='NOVEL_IMPORT' AND "targetId"=$1 ORDER BY version,id;
SELECT id,"userId","novelId","targetType","targetId","operationId",
 "requestHash","beforeHash","afterHash","beforeVersion","afterVersion",result
 FROM "ContentMutation"
 WHERE "novelId"=$1 AND "targetType"='NOVEL_IMPORT' AND "targetId"=$1;
```

此外按`WHERE "novelId"=$1 ORDER BY id`查询Character、Scene、Item、World、Setting、Foreshadow所需原生字段。Character包含完整受支持档案、aliases/relationships/extra/bio；Scene/World包含parentId及完整文本；Setting包含type/worldId/parentId/content；Item及Foreshadow包含完整名称和文本。每行再次核对所属novelId，Chapter通过已查Volume集核对归属。ContentVersion没有novelId列，必须按NOVEL_IMPORT+targetId限定，不能写错过滤字段。

## 机械断言

### 来源→派生→原生正文双重等值

1. 候选B原字节hash为run.downloadedSourceSha256；按GB18030严格解码，不转换CRLF。逐章按冻结sourceStart/sourceEnd提取，验证1394个sourceDecodedUtf8Sha256及八卷计数。
2. 只在冻结的八个起点插入added-volume-headers声明的确切文本；重建结果逐字节等于派生来源及expected-body.txt，所有输入hash/addedHeadersSha256/expectedChaptersSha256一致。不得用生产分章器生成自己的预期。
3. 实际原生Volume恰好8个，index=1..8，名称按冻结卷名顺序；Chapter恰好1394个，卷内index分别覆盖`213/269/250/214/204/116/87/41`，无洞、重复或串卷。按原生卷/章索引重建正文，逐章title/content/hash与独立expected-chapters完全相等，最终UTF-8字节等于派生基线。
4. 再从原生各卷首章移除**仅冻结的新增标题前缀**，与候选B逐章原始slice拼接及run.mainNarrativeUtf8Sha256比较；不按正则删除所有类似标题的文字。此第二等值独立验证没有趁补卷名改写正文。wordCount按Unicode码点核对，全部status=WRITTEN。

### 八类原生映射与两线

大纲：完整outline材料按既定限定语义拼接等于首卷summary，其他七卷不重复塞入全书大纲；每章outline及对应大纲卡按已确认session核对，PlanningDocument八卷/1394章ID与原生行一一对应，order保持全书顺序。

角色、场景、世界/设定可复用`realNovelSemanticAssertions`的**纯消费方断言**，不调用旧审计器入口或发布器生成期望；该helper本身无IO、无旧样本身份。另独立比较物品及伏笔名称/完整知识限定文本的多重集、数量与来源artifact，不能按非唯一名称随意配对。角色关系、场景父级、世界/设定归属和父级都必须指向本作品真实行，排除未声明原生对象/重复映射。

世界线/叙事线检查规划JSON内部契约、全部事件及分片完整文本、时间范围、people/parent、知识可靠性/归属、叙事视角、全书chapterIndex/order、事件refs及其kind/character/reliability；每个引用必须指向同一规划中的实际事件/角色/章节，不能仅验证非空。允许导入器合法分片，但重组文本必须全量等值。24项最低文学清单只做绑定及定位辅助，仍不是穷尽文学语义正确性的证明。

### 导入记录、回执与重试边界

必须只有一条本session的NOVEL_IMPORT ContentVersion(version1)及一条ContentMutation，operationId精确为`novel-import:<session>`，request/afterHash与publication.hash一致，beforeHash/版本/result符合协议。snapshot中的chapterVersion2、来源hash、原始/工作正文、八类targets、全部materials/facts/evidence、coverage、decisions、notFound及semanticAudit必须与同一完成检查点一致，不能只比较摘要。

机械查询证明“目前一套实体/单回执”；**不能仅据一个回执宣称本书实际执行过重试。** 合成脚本测试会真正构造同请求重试并验证计数不变。实际本书若曾重试，主代理须提供同session/同hash的正常产品重试前后证据，审计再比对；否则报告`retryExerciseStatus=not-exercised`，不伪造重试PASS，也不让审计脚本调用发布动作来补证。

## 定向合成用例与执行顺序

- LOTM-AUD01：正例使用8卷/1394个短合成章、冻结原件/派生标题/章节基线、八类完整原生映射和跨卷叙事引用，审计逐项通过；正式上下文不被测试读取。
- LOTM-AUD02：来源hash、派生章/新增标题、字节/CRLF各自被篡改时失败；编码成功不等于正文一致。
- LOTM-AUD03：仅一章缺失/重复/换序/串卷、卷内index不连续、章节文本或wordCount变化分别失败，不能用总字符数相同蒙混。
- LOTM-AUD04：关系/场景父级/世界归属/两线事件引用越界、一个字段丢失、实体多重集多/少行、知识限定或分片文本被截断分别失败。
- LOTM-AUD05：未completed、错误session/workId/novelId、缺失/多余回执、snapshot材料变更、chapterVersion缺失/未知版本、同schema不同checksum均阻塞，缺迁移时不执行DDL。
- LOTM-AUD06：作品lock存在、源目录/文件替换或复制期间变化、符号链接/硬链接/越界存储指针、label已存在均阻塞，且不触碰原件。
- LOTM-AUD07：审计前后原database闭包/journal/manifest/冻结来源hash及身份不变；引擎只收到scratch路径、只执行固定SELECT/READ ONLY事务；原global目录放置读取陷阱以证明不会访问。
- LOTM-AUD08：合成发布器同请求重试前后仅一套8卷1394章及单回执，审计通过；没有本书实际重试过程证据时只输出not-exercised，不能把合成结果算成本书重试通过。

先方案及上述定向用例独审 → 允许后新增测试实际RED → 新审计脚本最小GREEN → 独立代码审核 → 主代理正常关闭真实app → 本书机械审计 → 真实重开与文学独审。任何真实阶段条件不满足据实阻塞，不将机械PASS等同于九项最终验收全部通过。
