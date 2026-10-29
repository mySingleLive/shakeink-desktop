# 已有来源草稿观察绑定独立代码审核

日期：2026-10-26。审核者：`remaining_books_oracle`。依据61／62，仅审observer与新增隔离adoption verifier。

**最终限定PASS，无本范围必须修订的P1/P2。** 允许主代理随后对用户明确选择的S02草稿执行真实绑定；本报告不代表实际绑定、首次AI、文学质量或整书流程已经通过。

没有修改源码／测试，没有读取实际小说／oracle／用户journal／DB，没有操作应用或模型。独立执行仅两个批准verifier，所有corpus／journal均为其临时合成fixture；output换为独占新路径，未运行全suite。

## 冻结身份与完整差异

| 文件 | SHA-256 |
| --- | --- |
| `scripts/observe-real-novel-import.py` | `138767ccdf6fc6cfc479fe3736a72435e689b9da80bbcfacefd5e833603acfca` |
| `scripts/verify-real-novel-source-adoption.py` | `d4b2253f60c8d914bda93ddae637e32ff0e518baadc20eda92e23ac8d769c37e` |
| 旧`verify-real-novel-runtime-observer.py`（未改） | `e0ab69b0c80e8637200e7412b59c919bf3ce05a274e4298d0a739ab45edf2032` |

执行前后匹配交付。真实旧observer基线`/private/tmp/adoption-61-baseline/observe-real-novel-import.py`完整SHA为`2f7db9e979798b888c9e5be1c186800d3135a43478ee13a04726db1987051a4e`。独立从基线及新增文件重生成完整453行差异，与作者diff逐字节一致，SHA=`e258a09f6e6546dab06a6570c9cb44712af76cafa1e6f991baa4a2ae23772abb`。

独立静态比较确认regular_bytes、runtime_diagnostics、record_build及原frozen_input／保存／目录等10个helper源码完全相同；原默认新journal扫描AST未变，`for journal in candidates`之后的safe projection／summary／history尾部原字节相同。没有把新增verifier自报相同当作唯一证据。

详见[source-adoption-independent-review.json](evidence/source-adoption-independent-review.json)，SHA=`40e3f36a53d4017c0dcba3bf989065020883140000744902d7f33a6b1437b20c`，含旧／新身份、不可变helper、默认扫描／投影比较及独立结果hash。

## 绑定与读取门控

新选项只允许freeze；UUID必须canonical，非法值在frozen_input之前拒绝。采用现有安全目录打开方式，再以dir_fd／O_NOFOLLOW打开regular单链接owner及journal。64MiB只用于首次source绑定两次journal读取：fstat先拒超限，read最多limit+1且随原size收紧，读后比较长度、dev／inode／size／mode／links／uid／gid／mtime／ctime及leaf，目录fd与当前路径身份复核。没有把旧regular_bytes改为新容量或先无界读完再检查。

owner必须精确匹配marker＋指定UUID，journal.id同目录。源集合按唯一绝对、无路径别名且corpus内的path／hash严格相等，included必须真实布尔true，重复／多余／排除源拒绝。source-only要求严格整数版本／revision／workingRevision、带时区createdAt、source phase和空正文／产物／作者数据；任何grant／检查点／publication／semanticState／mappingWarnings／runtime字段存在均拒绝，未以pending为空代替无AI证据。

创建run前完成资格检查；写run.json前再次读取并比较完整data、owner及文件／目录身份，不仅mtime。完整existingJournalIds保留所接续ID，接续模式另存原createdAt／revision、原journal hash和身份；sourceFiles新增仅限显式adopt分支。最终run.json独占保存，失败／partial不覆盖旧run、journal或oracle，不偷偷复用旧排除列表。

observe只进入已pin目录，继续检查目录身份、UUID／journal.id、原createdAt、owner及冻结源集合；缺失或变更不扫描／回退decoy。后续读取复用原regular_bytes，允许真实应用正常原子rename、journal增长、revision／phase及AI状态推进，不比较永恒初始file inode／hash，也不再次施加source0AI条件。初始64MiB上限没有继承到后续AI journal。

默认freeze不增加adoption／sourceFiles字段，默认新建扫描逻辑保持。安全投影／严格runtime parser及build identity路径未放宽；新增元数据不复制endpoint／Key／grant或其它作品。工具不授予发送、应用操作或journal注入能力，文学erratum仍是独立sidecar，不进入此代码范围。

## 隔离验证与历史

新增verifier执行实际observer函数及从其源码提取的真实CLI guard，只将文件系统roots重绑至临时合成corpus／journal；没有复制另一套adoption判定。合成oracle／源实际经原frozen_input及hash链，链接、hardlink、替换、文件增长和owner均使用真实临时文件。后续runtime投影调用既有纯parser CLI，不连模型／用户库。

作者[首RED](evidence/source-adoption-red.txt)只证明旧CLI不接受接续模式，独立hash=`1d3f96c3c7786f231aebd22dd5abe489dff0de3b8392751a77a38fca00e2a062`；它是功能缺口，不声称所有130项安全检查原版均RED。实施中的spy误拦普通corpus读取等历史另保留，不冒充产品缺陷或全部首次即绿。

本代理仅执行61／62两命令，按许可只换exclusive output路径：

```sh
python3 scripts/verify-real-novel-source-adoption.py --output /private/tmp/novel-import-adoption-independent-63.json
python3 scripts/verify-real-novel-runtime-observer.py --output /private/tmp/novel-import-adoption-runtime-independent-63.json
```

| 范围 | 独立实际结果 | 独立证据 |
| --- | --- | --- |
| source adoption | exit0，130检查通过／0失败 | [日志](evidence/source-adoption-independent-final.txt)，SHA=`4631cb4553e1ef9136d2794209ad2253953d15741fea82a90637d4a46604025c`；[完整结果](evidence/source-adoption-independent-result.json)，SHA=`972a88158f6abd6f544da1f9f16b6bfd28d35b5ef888041e9b3d4f879d4de762` |
| 旧runtime observer | exit0，24检查通过／0失败 | [日志](evidence/source-adoption-runtime-independent-final.txt)，SHA=`ee35643fcfdd4aabfa3aa7a807c569c30cc897f00381d180e78aef18985f389e`；[完整结果](evidence/source-adoption-runtime-independent-result.json)，SHA=`788a6b913cf9fd0ca1b2514c9acac95f81172394914327729e43a4b67ab0b70d` |

130是检查计数，不是130个独立端到端用例。包含真实CLI、完整existing IDs、坏UUID／owner／链接／源／纳入状态、各类非source0AI数据、64MiB前限和边界／limit+1、原子同字节替换及恢复mtime仍拒、partial／旧run不覆盖；后续降低cap至1仍观察正常增长、只pin指定session／不追decoy、血缘／源变更不覆盖证据、秘密不泄漏及默认新建路径。旧24项完整保留，verifier源码未改。

输出使用exclusive创建；完整结果仅含合成检查元数据，已另以exclusive方式复制入repo证据，未覆盖/tmp原输出。作者pycompile0只作作者证据，本代理未额外运行编译或其它检查矩阵。

## 真实任务边界

主代理须实际freeze成功后才能称已绑定该已有S02；run应明确adopt既有会话而不是新建，保留原existing IDs及首次AI前快照身份。若实际前后变化则保留失败并换新run名，不改期望／journal来过门。sidecar按独立文学勘误流程另行wx复制，不覆盖原oracle或body hash。

其后仍须真实UI识别、确认正文范围、12目标、复核／作者决定、发布／业务审计／重开及独立文学质量验收；工具检查不代表供应商费用／调用次数或任何真实小说流程通过。两个旧S02记录及原失败保持原判定，整批标准不降。
