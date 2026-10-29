# 叙事线native与引用schema前置：独立代码审核

日期：2026-10-26。结论：**PASS，无 P1/P2**。覆盖91/92批准的两文件及两条定向命令；不是实际叙事线、角色/两线完整性或旧失败原因的通过结论。

## 冻结与完整差异

| 文件 | 最终 SHA-256 |
| --- | --- |
| `desktop/service/novel-import-ai.ts` | `20b80cc24c14bde0d50e93d2521c129524aa82730805c665695aed10e7edc1ea` |
| `tests/unit/novel-import-request-schema.test.ts` | `4485611f4f5262fabf8f8bc142aa822e5fff8a32f6d8a1d5353e645b50fbbfa6` |

对真实基线 `/private/tmp/narrative-schema-91-baseline/` 独立重建完整差异，与 `evidence/narrative-schema-baseline-delta.diff` 逐字相等，SHA-256：`ecb09dda81ba713ceab19c52ca313b2d086401a049179899238cfe8a81d4b578`。反去唯一narrative native/响应预检并还原共用array变量，service整文件恢复基线。原worldline native/图分支和反馈、原helper及全部late调用逐字保持。

J01–03逐字保持；J04/J05/J06逐项反向还原下述事前批准适配后分别逐字等于基线。控制文件main仍为 `fee1997f…b63543d`、payload `239cac9b…187ab55`、AItest `663097fb…f9c9903`，均未变。

## 代码与新增用例判断

新分支只作用于semanticVersion1普通analyze/narrative，完整artifact非变换复用原严格native helper，非空响应再复用原完整本地catalog/章节link helper。已有schema问题不追加无关图issue；空结果/notFound保留原late检查。两固定issue分别定位facts与artifacts，实际完整指导均<=250字符，无catch、ID/姓名、未知键、源文或动态目录回显；bridge、原一次纠正、权限、预算及输出结构未改。

J07通过实际生产bridge和真实generateJSON、仅既有generateText DI，分别对native和图反例验证首坏次好2次、持续坏2次停止、首好1次。覆盖chapter/order整数及安全范围、refs JSON类型/字符/枚举/知识归属，narrator未知/歧义/非角色，eventId未知/非事件，refs.character未知/非角色/仅姓名，章节越界和身份冲突；native与图问题固定路径分开。

合法响应保持前导零、JSON排版和原归属/时间字符串；narrator唯一name可用而refs.character仍只用角色ID。完整10章仅向provider发送index9，产物仍用全书9；完整本地角色/事件虽被provider过滤仍可合法引用，未造目录产物。省略无法链接narrator、保留称谓归属及空refs沿用原接受集，但不证明完整。坏本地catalog加空结果仍在原late门拒绝。signal/role/action/模型、request/raw及原wrapper预算有实际断言。

## 旧前提适配与真实late通路

- J04仅将原仅含reliability的badNarrative明确为native非法/schema早拒；worldline、legacy、spaced-name局部目录及其它原断言保留。
- J05保原worldline与普通narrative早拒反例；完整可信narrative target的reconcile字段编辑实际经过原applyImportArtifactFieldEdits及validateSemanticLinks，patched值native合法、生成1次、零有效结果，取得两个确切原角色Error并交main.prototype.safeError。没有手造Error或绕过hash、锁、证据/身份门。
- J06将普通narrative改早拒，原worldline empty/notFound坏catalog晚拒不动，另用同一真实reconcile路径保留角色晚拒。J07另以unset order实际取得原native晚门错误，确保新增schema没有替代提交/修订的原校验。

## 独立执行与历史

只执行91批准的两条精确命令，日志独占创建，未覆盖作者证据：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[1234567]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[789]:' tests/unit/novel-import-ai.test.ts
```

| 独立日志（`evidence/`下） | 结果 | SHA-256 |
| --- | --- | --- |
| `narrative-schema-independent-j01-j07.txt` | 28/28，exit0，0skip | `e6c1e740d068ae9079f4ee4caef1f4028566bbae3b39ec6ca326b1f2aa344518` |
| `narrative-schema-independent-a07-a09.txt` | 12/12，exit0，0skip | `19fe6f86e28a3bbdcf5d8a54bd3fc2910f00cd330b5c6c789f26a21245b2147e` |

作者 `evidence/narrative-schema-baseline-red.txt` 保留：旧J01–06通过，新J07缺chapter及未知narrator被原bridge直接接受，24 pass/3 fail（含父测试）；合法完整上下文及真实reconcile晚门已通过。生产变更后旧前提冲突另存 `narrative-schema-old-premise-red.txt`，不冒充新增产品缺陷。本审读取这些记录，未回滚冻结代码重演RED。

独立基线/最终hash、完整差异、原分支/晚门及批准适配反向核对、控制文件身份与精确argv见 `evidence/narrative-schema-independent-review.json`，SHA-256：`e7c676775ec0444ce86ca36bf1ca4bc4e1ce2dea1060ab333ee99ca6de741652`。

本轮未改生产/测试、未扩大suite，未访问实际run、小说、journal、应用、模型或用户数据库；未自行构建或另跑类型。主代理真实同草稿授权恢复、50产物/信用、正文/manual14章/预算保持另记。框架人物、角色、trope等文学待修及最终语义/落库/重开/LIFE均另验，不由本报告追溯升级通过。
