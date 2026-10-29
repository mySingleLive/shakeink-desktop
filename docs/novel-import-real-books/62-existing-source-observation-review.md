# 已有来源草稿观察绑定方案独立审核

日期：2026-10-26。审核者：`remaining_books_oracle`。只审61及已知observer／隔离runtime verifier源码；没有读取真实journal、小说、应用、模型或用户库，没有编码或运行测试。

首审61 SHA-256：`1119cb757c410b9e9e87e8a1d7bc5fc86fe095747ce5b98ee5c219a43ee54603`。

**当前生效结论：技术方案PASS，定向用例PASS，无剩余方案级P1/P2。** 绑定最终61 SHA `4f2643c7906f2eb7cc9f84fd6c928ca2434652357863a2d86ded84ed9b1bae74`，首审P2已关闭，详见文末。

**首审历史：技术方案PASS，无方案级P1；定向用例范围认可，但执行命令有一项P2须补正——既有runtime verifier要求`--output`，裸命令会被argparse拒绝。** 未建议修改旧verifier默认行为，仅需独占新输出路径；未授权扩大为额外suite或实际journal探针。以下保留该历史。

## 显式绑定与证据真实性

explicit `--adopt-source-session`仅用于freeze，须为canonical UUID并锁定唯一目录；不冒充freeze后新建。原existingJournalIds仍完整记录且包含该ID，另记录接续身份、原createdAt／revision及绑定时journal hash／身份，不修改旧B2证据、排除列表或真实journal。

严格来源集合／hash／included、目录UUID与journal.id、精确owner、semanticVersion1／source／空工作正文版本、无产物／作者决定／publication／非空coverage／grant／semanticState／runtime记录等门共同限定首次AI前来源状态。不能只以pending为空或当前没有在途推定从未调用模型，也不从全局usage补填证明。实际S02身份与状态是主代理已报告事实，本代理没有再次读取验证或作实际通过宣称。

64MiB仅作用于新接续候选读取：须先按打开文件的size拒绝超限，并使用有界读取，防止先无上限读完再判断；增长／替换、链接、hardlink alias、owner错配及并发变化都拒绝。来源／oracle继续原完整校验，既有新建路径不因此增减容量或字段。

在创建run前完成资格校验，写run.json前再次安全确认指定journal的字节及身份不变；不能仅比较mtime。输出独占、旧run拒绝覆盖，部分新证据只记录失败并换新run名，不回写原件／oracle／journal。绑定完成才可通过真实UI开始AI，不能把已有会话createdAt改成新建或事后重写期望。

## 持续观察与兼容边界

adopt模式只读所pin的UUID，继续核对owner、journal.id、原createdAt及冻结的精确源集合／hash／纳入状态；缺失或不符就固定拒绝，不扫描／回退到同名同源decoy。不得仅因路径相同就接受不同源版本。

前后字节／身份相等是**freeze绑定窗口**要求。后续真实UI会原子rename journal并推进revision／phase，因此observe不能永久要求初始journal inode／hash，也不能再次要求source／0AI；目录／会话血缘与owner／源绑定保持，合法后续状态交原safe projection观察。初始绑定证据永久保留，不能把后续journal当作最初状态。

默认未接续分支保持原逻辑和字段，不附null／默认adoption字段，不改safe projection、严格runtime parser、build identity或旧结果口径。新身份元数据不导出原授权／endpoint／Key／其它作品内容。新选项若误用于非freeze模式，应明确拒绝，不能静默忽略造成用户以为已pin。

## 用例与P2命令补正

新增隔离verifier使用临时合成corpus／journal，覆盖合法已有ID、完整existing列表、不合法UUID／owner／链接／来源／hash／纳入状态、已AI／分析／作者数据、容量及绑定期间并发变化；持续观察只pin指定ID且不追decoy，允许正常后续rename／revision／phase，错误身份不出证据。再保护默认新建路径、旧run不覆盖及秘密不泄漏。runtime原24项仅是脱敏／状态投影回归，不是模型质量或LIFE验收。

唯一P2来自真实源码：`scripts/verify-real-novel-runtime-observer.py`末尾声明`--output`为required，61列出的`python3 scripts/verify-real-novel-runtime-observer.py`会exit2而非执行24项。请将两条获准命令的输出参数／exclusive路径写实；保持既有verifier源码不变，不能把启动拒绝算RED或通过。新增adoption verifier若也要求输出，须一并写明。

本审核未执行任何命令。先保留原版无接续功能的真实RED，明确其是CLI／功能尚无模式，不夸称已验证所有安全反例；再最小实现GREEN、冻结后独立代码审核。仅两脚本检查，不改产品／模型／UI、不运行全suite。

审核及工具实现通过后，由主代理在用户明确选择的当前S02草稿上创建全新run绑定，再经原UI识别／核对正文边界／12目标／复核／发布／查库／重开。当前来源接续不算新建成功，两个旧S02结果不回溯改判，整批真实小说标准保持。

## 最终增量复审

最终61 SHA-256：`4f2643c7906f2eb7cc9f84fd6c928ca2434652357863a2d86ded84ed9b1bae74`。**技术方案PASS；限定用例PASS；首审P2关闭，无剩余必须修订项。**

修订已给两个verifier准确的required output参数，输出必须exclusive；每次RED／GREEN／独审只允许更换独占输出路径，脚本及其它参数范围不变。没有为修命令修改旧runtime verifier源码／默认值，也未将启动拒绝当TDD行为通过。

补充的设备／inode及字节双读、读取前stat预限／limit+1有界读取、UUID＝journal.id／精确owner／源集合核对，以及后续原子rename／revision／phase推进的区别与持续目录／createdAt pin均符合原限定目标。默认freeze字段／路径、安全投影／runtime parser维持原行为，完整existing IDs不手改；没有授予工具操作应用或注入journal的能力。

最终仅认可：

```sh
python3 scripts/verify-real-novel-source-adoption.py --output /private/tmp/novel-import-adoption-author-final.json
python3 scripts/verify-real-novel-runtime-observer.py --output /private/tmp/novel-import-adoption-runtime-author-final.json
```

独审可将两个output分别换为新的独占路径；不增加其它脚本或suite。本轮没有执行这些命令、读取真实journal或原小说。允许按61进入原版无接续功能RED、最小实现及冻结后独立代码审核；不能提前将真实当前S02绑定、首次AI或全流程记通过。首审P2及原哈希历史完整保留。
