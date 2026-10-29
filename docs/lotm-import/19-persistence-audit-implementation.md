# 最终持久化机械审计脚本实施

日期：2026-10-27（Asia/Shanghai）。实施者：子代理 `lotm_research_review`。依据 `15-persistence-audit-plan.md`、`16-persistence-audit-plan-review.md` 及主代理明确RED授权。**仅新增脚本、合成定向测试和专项证据，未修改生产/旧审计器、小说原件、真实journal或数据库，未操作真实应用/模型。**

## 交付状态

新增 `scripts/audit-lotm-import.ts`、`tests/unit/lotm-import-audit.test.ts`。AUD01–08实际8/8通过，0失败。代码已冻结，待独立代码审核后才能由主代理执行真实本书审计。本次测试不是本书实际持久化验收，也不证明文学语义正确。

### 只读原件与受控上下文

正式CLI固定LOTM-B1的run、appRoot、workRoot、session及冻结run.json SHA；不能传任意数据库路径/SQL或旧书样本编号。导出函数无正式上下文缺省回退，测试必须显式提供自己的隔离根。source/expected/oracle文件只能来自同一冻结corpus/run；完整源文和业务行仅输出到新的私有审计子目录，排他创建、不覆盖。

正常关闭声明之外，必须提供同run/session/launchId/appPid的正常退出证据，退出时间不早于所审completed.updatedAt，并与显式追加的最终build绑定；旧build-identity.json不能用作最终绑定。未completed、错误版本或关闭证据不足时在读取目标数据库前阻塞。

不导入/调用Workspaces或migrateDatabase。原始数据库仅使用O_RDONLY/O_NOFOLLOW读取、单链接检查和包含祖先目录身份的稳定闭包；从同一打开句柄取得文件字节及身份，再复制到run下独立scratch。source/scratch及run/app/work根不得重叠。复制前后及最终输出前重验源闭包，所有冻结文件/manifest/journal/存储控制按hash和打开句柄身份重验。目录链接、硬链接、特殊文件、writer lock、原件变化、混合品牌控制及非法指针均阻塞。

storage指针按完整strict state/envelope、checksum、workId、revision、active/previous解释；candidate路径必须精确位于本work的`.shakeink-restores/<candidate-id>`，并匹配记录的device/inode。required存在但指针缺失不允许猜回原库。没有initialize、activate、清锁、修复或迁移动作。

PGlite只打开scratch，查询在REPEATABLE READ + READ ONLY事务内执行，并用SHOW检查只读状态。首先精确比较`_desktop_migrations`全集，不补DDL；业务SQL仅为编译期固定表/列与novelId参数，ContentVersion按NOVEL_IMPORT+targetId限定，不读取model/User/聊天/global/inbox。引擎关闭后才重验原件并输出结果，scratch自身的WAL/关闭写入不冒称文件系统只读。

### 内容与协议检查

- 从冻结B原件及独立sourceStart/sourceEnd/章hash重建全部1394章；仅插入八个冻结标题块。派生输入、expected-body、每章原始slice与派生hash必须一致。
- 原生8卷的顺序、名称、卷内章号和1394章title/content/hash/status/Unicode码点wordCount逐项比较；卷/章源序拼接与派生正文相等；再仅去掉冻结新增前缀，与B原件主线拼接进行第二次等值比较。
- completed的semanticVersion1/chapterVersion2、来源、正文、八targets、无正文修改/未决冲突、plan/语义input/decision/result绑定、全部分析coverage和逐facts审核任务完整性均须满足。
- 通过纯消费方helper检查角色完整受支持档案/关系、场景/世界层级及设定归属，以及两线所有完整分片、可靠性/归属、视角、人物/事件/章引用与全书顺序。物品/伏笔采用完整名称/文本多重集，重名不配错；完整大纲在首卷保存，其余卷不重复插入；原生及规划的八卷/1394章ID逐项对齐。
- 单ContentVersion/ContentMutation的会话、来源/plan hash、全部材料/facts/evidence、coverage/decisions、semanticAudit/importBudget及回执版本/result逐项绑定。输出的session/记录使用允许字段投影，models/grants及未知快照配置字段不导出。错误只返回固定代码，不打印原始异常或source文本。

本书没有实际重试过程证据时明确输出`retryExerciseStatus=not-exercised`。一个回执不等于实际发生过重试；脚本本身绝不调用发布动作补证。24项最低清单仅核对冻结绑定，机械映射通过不能证明模型未遗漏或错述。

## RED → GREEN 实际记录

1. 建立新脚本初始未实现审计面和AUD01–08。合成fixture已真正以生产发布器创建8卷1394个短章、八类资料、跨卷叙事引用及长文本分片，实际执行同请求重试，再正常关闭自己的临时Workspaces。初始审计函数返回NOT_IMPLEMENTED，exit1、8项失败，见 `evidence/persistence-auditor-red.txt`。
2. 最小实现首轮为7/8；AUD07的失败是测试准备的inbox陷阱与自己的fixture初始化目录同名，见 `persistence-auditor-green-attempt1.txt`。修正仅销毁本临时fixture的inbox后布置陷阱，没有接触真实目录。
3. 补充迁移缺/多/变checksum、关闭证据、稳定树和锁负例，先执行AUD05/06实际RED，见 `persistence-schema-stability-red.txt`，然后实现独立迁移/稳定闭包校验。另修正负例对Node Buffer结构化clone后的解码方式，确保测试真的改变CRLF。
4. 第二轮AUD01–08为8/8，见 `persistence-auditor-green-attempt2.txt`。随后补强同句柄文件身份证明、祖先身份、只读源/输出根不重叠、指针文件身份、审计脚本/helper自身指纹、构建PGlite版本及快照安全投影，再运行最终同组用例。

最终命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^LOTM-AUD0[1-8]:' tests/unit/lotm-import-audit.test.ts
```

实际exit0、tests8/pass8/fail0/cancelled0/skipped0，duration29299.913958ms。证据：`evidence/persistence-auditor-final-green.txt`。1394章实际合成发布只在fixture准备中执行一次，第二次是同请求真实重试；负例以既有结果纯变异或元数据/小文件树验证，不反复新建大库。两个正例在稳定副本上运行审计，其中一个在global/model/其他journal路径布置不可读取的链接陷阱，并检查原作品不变及导出不含合成secret trap。

针对两个新增入口及项目已有ambient声明执行TypeScript `createProgram`，noEmit/incremental:false；检查记录见 `evidence/persistence-auditor-typecheck-final.txt`。仅上述定向用例，未运行全仓测试。

## 给主代理的正式执行接口

安全静态描述命令已实际exit0；它仅读取项目构建/源码/迁移及已安装PGlite版本，不读取真实应用目录：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx scripts/audit-lotm-import.ts --describe-build
```

返回`sha256`（强制源文件/schema/dist/BUILD_ID全集）、`migrations:{sha256,files:[{id,checksum,rawSha256}]}`及`pgliteVersion`。最终构建后将这些字段原样存入本run的新追加文件，并绑定`run/sessionId/launchId/appPid/launchedAt`；不能将旧文件改名或回写旧冻结build来掩盖构建变化。记录本次实际启动身份、正常退出结果与时间，形成同目录的关闭证据。

**以下正式命令尚未运行，仅供主代理在completed及正常退出、独审通过后使用：**

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx scripts/audit-lotm-import.ts --label <新label> --app-closed --build-identity <本run内追加的最终构建绝对路径> --shutdown-evidence <本run内关闭证据绝对路径>
```

输出`checkpoint-public.json`、`business-records.json`、`ordered-body.txt`、`assertions.json`及scratch仅在本run私有子目录；stdout只有状态/数量/重试覆盖状态。CLI退出1包括阻塞或机械断言失败，不能将部分结果计入PASS。

脚本及测试冻结SHA见 `evidence/persistence-auditor-frozen-sha256.txt`。本轮结束时仍等待最终代码独审及主代理真实执行，不作本书最终成功结论。

## 独立代码审核后的定向治愈

主代理授权在原15/16范围修复三项审核发现；仍只修改本轮新增审计脚本/测试及证据，没有操作真实应用或数据。

1. **required marker严格校验。** 审计器原来仅将required文件作为存在性见证；合法pointer配空对象或错误workId会被放行。新增AUD06组合先实际RED，再按 `desktop/service/workspace-storage.ts` 的markerSchema形状，严格检查`{schemaVersion:1,workId,required:true}`及workId一致性。此项依据本审计15/16契约及合成RED；生产WorkStorage.resolve在pointer存在时会短路required读取，未宣称已实测生产每次拒绝该组合。
2. **scratch/output身份及完整内部闭包。** 新增合成替换窗口，分别将scratch、其output父目录、内部pg_wal目录、内部PG_VERSION文件替换为指向合成源的链接；RED阶段factory实际被调用1次，违背必须为0的要求。修复后在创建时捕获父/叶及source身份，复制每步守护根与已创建父目录，复制完成时按相对路径/类型/大小/hash核对源与副本（不比较复制必然不同的inode），再保存scratch自身身份闭包。engine前重验全scratch闭包且禁止链接/硬链接，随后立即重验顶层锚点；任一规定替换均在factory调用前拒绝。输出前后继续守护顶层身份；engine启动后的正常scratch写入不要求保持启动前内部文件hash。
3. **阅读线及非空章纲卡完整字段。** 新增真实合成非空chapter.outline正例，生产发布器确实产生对应卡；有效但错误的reading-line名称/数量、wordBudget、卷/章line、章纲card.title/line、telling.id/source均作为负例。补齐这些字段的消费方断言，保持原生产映射含义，没有降低正文或原生映射要求。

三项初次RED见 `evidence/persistence-review-findings-red.txt`；内部目录/文件补充RED见 `persistence-internal-scratch-red.txt`。修复后运行同一AUD01–08名称范围，连同新增子项，实际exit0、**tests15/pass15/fail0/cancelled0/skipped0**，duration39421.890667ms，见 `persistence-review-final-green.txt`。四类替换负例均验证factory调用次数为0。

本轮定向静态检查实际exit0、diagnostics0，见 `persistence-review-typecheck.txt`。重新冻结脚本SHA为`12c3a00e43f2f525dadbe40d1bb49b7fb536989bc29eae585fcfe856ef560c62`，测试SHA为`7d855e7e520b1f30df39e68886064da8d6eaf9f62500839bb0dedd1bef44aa04`；当前冻结清单已更新，仍待独立复审后由主代理决定是否满足正式运行条件。本轮没有运行正式本书审计。
