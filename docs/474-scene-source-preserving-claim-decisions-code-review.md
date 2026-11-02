# 474：来源保留的逐 claim 决定代码独审

结论：通过限定代码审核，可由主代理冻结后执行正常全文验收。此结论不是全文导入、七分钟、发布或重开通过；473 保留的原静态 R70 外层状态失败不改写。

## 冻结范围

| 产品源 | SHA-256 |
| --- | --- |
| `desktop/service/novel-import-ai.ts` | `dab9bfb8f18fe6e53fda259964ec02b042d47a89bc2e0c43ec343821f36453e1` |
| `desktop/service/novel-import-scene-roster-claim-patch.ts` | `880a07c7a1c5781578811ebb03bdbfc8c5b351fbed700493a4d3339104302f78` |
| `desktop/service/novel-import-scene-roster-bound-decisions.ts` | `18a322ecc6b638d216405f47eb050930394f1c337f378805fb18949e3da7d80b` |
| `desktop/service/novel-import-scene-roster-targeted-repair.ts` | `ddff060fd57b28134c7dd001726690284e99c255207d46c0d4f30e378caa818e` |

对照已审 470/471：闭合 `{ref:string}` 只扩大未证位置的分类；第一答、原 EF 正则、proof capture 和原引用恢复不接受坏 ref。使用真实冻结 draft 长度；无 owner/无目标证明的关系证据逐项待决定。自指和越界的 resolve 在真实 patch select 中也拒绝，不能绕显示空域；只有显式 reject 可去掉相应未证关系。

claims 任务保持完整 claim/domain/CF 绑定，以严格局部键和原数组上限恢复旧决定，再调用原 patch.apply、来源、关系重映射、owner 和 retention 门。重复、越域、空必选、混协议、未知键、稀疏数组、getter、Proxy 不触发协议回退。整行可拒仍走原 replacement/0；全部空决定不等于整行拒绝。

准备阶段单调 selection→claims→replacement，每行至多两次；激活后不可转换，原四代不增加。原 256/4096/65536 编译门不变。独立源码比较确认原完整编译器、provider 两处投影、AI 九段严格解析/证明/接受声明原文不变；旧 Native 函数逆去新增的“不支持 claims”拒绝及对应循环括号后精确等于旧体。新 Native claims 分支与已实测合成候选完整 schema 同值：19491 bytes，SHA-256 `e3b3997558bfc48b647b12b75c36dff3c9c50b12c83c36daa01370529eba9c52`。静态实测文本经本产品原全部门的 0API 复验成立，不外推任意供应商输出正确。

## 独立验证及根收据

- 独立新增/核心 97/97，加预算、Native、指导、保留回归 110/110；均无失败、取消或跳过。日志为私有 `scene-claims-474-independent-feature.txt`、`scene-claims-474-independent-regression.txt`。
- 根最终 47 文件 838/838、全类型检查、desktop build、diff check 均 exit 0；复核其 47 测试、25 helpers、57 产品源逐 SHA 与当前文件相符。首次 829/838 的旧预算表示假设及容量遮蔽失败记录保留。
- g2 未激活的 N−1 可以改用完整 claims 后合法容纳，属于批准的准备策略变化；相关夹具保完整材料/域/原结果，并实测新 prompt/schema 容量。g3/g4 激活后 N−1 拒绝与固定上限保留。不可再缩的旧预算夹具明确走完整 replacement；来源正控的独立容量扩大不替代 N±1 门测试。
- 历史预算 v2：300 请求、596 原捕获，345 使用＋251 未使用（32 合同改变、219 绑定未知），无盲用旧数字；507 个可达准备提示及新129/旧130首包全 fit，57 源 SHA 前后及本次复核相同。3 个指定首稿四代共12提示亦 fit。此为 0API 新提示测量，不重分类原实际成败或声称所有旧答案适用新任务。

## 新状态取证工具

独审发现并复现了两个 PRIVATE 缺口：未知 snapshot 内容可被误判内容相同；保存文件变化可沿用旧 receipt 哈希。修后严格闭合原 envelope/snapshot 字段、限制结构及大小，并先逐四文件重算 bytes/SHA 对 receipt；独立最终 6/6 通过（`scene-claims-474-independent-state-audit-final.txt`）。原始快照均仅私有 700/600、wx；正常 journal 元数据轮换可见，内容变化仍须逐项审核，不能自动豁免。launcher 保护模型/标记字节、失败导入 catalog，并保存 before/after 比较；实际完成后的 draft 内容和预期发布变化仍需主代理核验。

最终工具 SHA：audit `954b85e3041f291079d7dcf0127f6a1198e780b78b4117134cf217dd78016b5c`；其测试 `d3d9337aa9eceeda10dbea1322402b246c87854d54cd5fbc94e04344f3aff70f`；launcher `2b83c524760acf34bb1084c5e80b299d4a1a372ffcf0ef686f4b8efc6cd3162a`。原静态工具/receipt 未被本审核修写。本审核未启动 App/API，未修改产品或测试，未公开小说、回复正文或 Key。
