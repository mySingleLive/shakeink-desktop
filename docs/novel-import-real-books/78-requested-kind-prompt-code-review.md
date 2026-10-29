# 普通分析唯一kind固定合同：独立代码审核

日期：2026-10-26。结论：**PASS，无 P1/P2**。仅覆盖76/77批准的两文件及两条定向命令；不代表真实模型服从、S02物品或文学质量通过。

## 冻结与完整差异

| 文件 | 最终 SHA-256 |
| --- | --- |
| `desktop/core/novel-import-ai-payload.ts` | `953d4a39701748dead1ee1e52e4a37306bc87f3d77fd012a0e0b58c499335298` |
| `tests/unit/novel-import-ai.test.ts` | `800a96245c22473cc83699711cbac74f173656308ab28eae903a28fce0e8eff8` |

对真实基线 `/private/tmp/requested-kind-76-baseline/` 独立重建完整差异，与 `evidence/requested-kind-baseline-delta.diff` 逐字相等，SHA-256：`8b05e03a208d627bf1ebc6be5e11be3411d0cf1a739a091d4a27d9ae5879bc4a`。反去唯一白名单import/lookup、固定kind合同及串接，payload整文件恢复75版基线；新增A08以前的整个AI测试文件（含A07）逐字保持。service仍为72冻结的 `c88cf7f8941edcb4ab97449d244687f254db22aad5d1348404ef25a6d16d29c6`。

## 代码与用例判断

requestedKind仅在semanticPrompt的普通analyze、非reconcile分支由IMPORT_TARGETS严格相等查找产生，固定合同仅JSON.stringify该合法常量及固定origin inferred。未直接拼接任意request.kind、自由指令或来源，未知/缺省目标不生成默认绑定、别名或新throw。原notFound合同保留，真正run仍由原factory先拒绝非法kind。

新增合同串接于普通analyze的phase-output-contract；legacy、classify、review、patch、reconcile及73指导未变。序列化、source/payload/上下文、schema/anchor/晚门、预算、网关、重试与信用路径均无新增行为。原通用native多类别说明保留，与本次唯一输出目标不冲突。

A08经真实runImportAi生成DI接点遍历12目标及短/长非BMP、转义资料。独立字面目标清单与共享白名单核对，固定输出合同中恰有该kind的一个JSON字符串绑定，origin、禁止翻译/子类型及notFound原合同有断言；资料和恶意自由要求不进入固定段。实际request、raw、输出、payload、模型/role/signal及原预算保持，未以模型输出合格作前提。

非法/缺省、大小写/中文别名、body、null/object/number反例验证helper原输出合同无绑定、不回显秘密，并验证runImportAi零resolve、零generate；无默认item/world或额外异常行为。8组未受影响分支prompt/payload独立字面hash及73指导hash与修改前基线metadata对应并通过；A07原有goldens、投影/锁边界继续执行。J01–03实际bridge与请求schema、一次纠正、证据定位及兼容门继续通过。

## 独立执行与历史

只执行76批准的两条精确命令，日志独占创建，未覆盖作者证据：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[78]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[123]:' tests/unit/novel-import-request-schema.test.ts
```

| 独立日志（`evidence/`下） | 结果 | SHA-256 |
| --- | --- | --- |
| `requested-kind-independent-a07-a08.txt` | 8/8，exit0，0skip | `4abb646cebba666c5948427fbd017cb97d45be68de54e9d3a91c0aa045525f24` |
| `requested-kind-independent-j01-j03.txt` | 7/7，exit0，0skip | `bc10b5ac941e49b1158899c8aea7a1af2a36ab53f309926d5d44b30a50f7b542` |

作者干净实施前 `evidence/requested-kind-baseline-red.txt` 保留：6 pass、2 fail（A08实际12目标路径的首个outline绑定断言及其父测试失败）；A07、非法目标及未变分支goldens通过。本审核读取该历史，未回滚冻结代码重演RED。

独立基线/最终hash、完整差异、旧golden对应和精确argv见 `evidence/requested-kind-independent-review.json`，SHA-256：`885b3dc9102b95906575ba2fe4149494d8d43490f1f479e02da8bdfb6bdbd764`。

本轮未改源码/测试、未扩大suite，未访问实际run、小说、journal、应用、模型或用户数据库；未自行构建或另跑类型。主代理须另记构建与真实同草稿授权恢复，原失败、12产物保留及文学待修均不得由本报告追溯改为通过。
