# 世界线目录引用schema前置：独立代码审核

日期：2026-10-26。结论：**PASS，无 P1/P2**。覆盖88/89及主代理明确批准的局部spaced-name fixture适配，两文件、两条定向命令。引用门通过不证明角色/两线完整，也不追溯旧实际失败原因。

## 冻结与完整差异

| 文件 | 最终 SHA-256 |
| --- | --- |
| `desktop/service/novel-import-ai.ts` | `f29c2c6003c6aa513471ff3fa5acfa132ae9cade1ce7ed9baf1860950aeb1d68` |
| `tests/unit/novel-import-request-schema.test.ts` | `5e44faf4e835a8a9102c5ab6492cfc2b468f4b9d22146af67e2c296a62690471` |

对真实基线 `/private/tmp/worldline-references-88-baseline/` 独立重建完整差异，与 `evidence/worldline-references-baseline-delta.diff` 逐字相等，SHA-256：`7c7ea5d366e509f207b6ae663d96c161cc31e354f918eaa9d5f1a7bca53343dd`。将唯一响应级precheck还原为原return后，service整文件恢复基线，validateSemanticLinks原文、所有late调用及其它kind/phase均未改。

J01–03逐字保持；J04/J05反向恢复下述已批准局部适配后，分别逐字等于基线。控制文件main仍为 `fee1997f…b63543d`、payload `239cac9b…187ab55`、AItest `663097fb…f9c9903`。

## 代码与测试判断

新响应级refine仅在semanticVersion1普通analyze/worldline启用；已有schema问题或无非空artifacts即返回，否则对完整request与本批items非变换调用原validateSemanticLinks。使用原本地完整catalog，没有采用过滤后的provider目录、追加别名回退、制造人物或替换引用。固定artifacts issue在原250字符反馈界内，不传播catch/raw消息、动态ID/姓名/源文。

J06八类纯native可通过的坏引用（未知/歧义角色、非角色ID、错误/未知父级、批内循环、类型/姓名身份冲突）均通过实际bridge/真实generateJSON DI得到首坏次好2次、持续坏2次停止；六种合法响应首好1次且原值不变。合法角色id/唯一name、批内及既有父节点、空people并保留描述等均覆盖。明确验证某本地角色被provider过滤后仍能通过完整本地校验，且不把catalog人物造为产物。signal/role/action/模型、固定安全反馈及原wrapper预算有实际断言。

空artifacts/notFound不运行新precheck，但格式错误的本地catalog仍被原late门拒绝；narrative非法角色仍schema通过、在原同一late helper拒绝。没有将空响应或校验失败吞为成功，没有移除完整图门。

## 批准的旧用例适配

- J04非法worldline引用由schema通过改为早拒，纯native通过及真实run拒绝均保留；native其它例、legacy及其它phase原断言不减。
- J04 `people-raw-strings`原值带姓名前后空格，纯native合法但原目录没有逐字同名。现仅该行局部input增加独立ID的逐字带空格character元数据，保留原catalog、原facts、原空白、无变换断言和全局r。未trim或按别名回退，不删该合法行，符合主代理追加授权。
- J05原两个worldline fixture保留为schema/native时点变化后的早拒反例；新增合法narrative narrator两路径实际过schema/native、各生成1次，取得同一原helper的两个确切角色Error并交实际main.safeError，保持零结果及安全通路。不是手造Error或弱化晚门。

## 独立执行与历史

只执行88批准的两条精确命令，日志独占创建，未覆盖作者证据：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[123456]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[789]:' tests/unit/novel-import-ai.test.ts
```

| 独立日志（`evidence/`下） | 结果 | SHA-256 |
| --- | --- | --- |
| `worldline-references-independent-j01-j06.txt` | 22/22，exit0，0skip | `5bb2f1f0008f4118cc9953d9b985326eb535e0a7a46c524fa5333b4191a075ae` |
| `worldline-references-independent-a07-a09.txt` | 12/12，exit0，0skip | `0bf79d3eb623f8781556338582f53fba6aa2d66388c18aedb31b87c38b85d81c` |

作者干净 `evidence/worldline-references-baseline-red.txt` 显示旧J01–05通过、新J06未知角色被原bridge直接接受，19 pass/2 fail（子例及父测试）；此前未改旧前提。生产变更后旧前提冲突另存 `worldline-references-old-premise-red.txt`，包括spaced-name目录前提，未冒充新的产品缺陷或抹去历史。本审读取这些记录，未回滚冻结代码重演RED。

独立基线/最终hash、完整差异、各批准适配的反向核对、控制文件身份及精确argv见 `evidence/worldline-references-independent-review.json`，SHA-256：`2c16669d853ce8380e2a2f9d3cd2755ef591651bf0a295ac6e93bc898cc87caf`。

本轮未改生产/测试、未扩大suite，未访问实际run、小说、journal、应用、模型或用户数据库；未自行构建或另跑类型。主代理同草稿授权恢复及43产物/信用、正文/14章/预算保持另验。角色遗漏、两线及其它文学FAIL仍需完整性修订和独立最终审核，不能由本报告改为通过。
