# 跨批次同实体字段自动合并：独立代码复核

日期：2026-10-29。范围：`desktop/core/novel-import.ts:199-283`（新增helper与`mergeImportArtifacts`）、`desktop/main/novel-import.ts:652,702`、`tests/unit/novel-import-merge-reconcile.test.ts`、`tests/unit/novel-import-semantic-session.test.ts:193-210`。依据：23号方案末节“24独审后的冻结补充”（以此为准）及24号审核。

已执行：`node --import tsx --test tests/unit/novel-import-merge-reconcile.test.ts`，11项全部通过；另用临时探针（已删除）验证下述场景。未运行全量用例。

## 结论：有条件接受

B1原子性、锁定、可靠性降级、relationships身份规则和调用点范围都与冻结规则一致。修复下面2项阻断后可以接受。

## 阻断问题

1. 片段包含判定违反整值规则，会丢失信息（`desktop/core/novel-import.ts:203-209`）。
   冻结补充把规则定为“NFKC+trim后相等，或旧值包含新值→保留旧值；新值包含旧值→取新值”，指的是整值子串包含。实现按`、；;，,`和空白拆分后做集合包含，两个方向都会丢内容：
   - 旧`对乙 忠诚；对丙 怀疑`、新`对乙 怀疑`：新值的片段{对乙,怀疑}都在旧值中，于是保留旧值，“对乙怀疑”这条信息被静默丢弃。整值规则下新值不是旧值的子串，结果应为`旧；新`。
   - 反方向：旧`对乙 怀疑`、新`对乙 忠诚；对丙 怀疑`，结果直接取新值，旧值表达的“对乙怀疑”就没了。
   - 拆分时也拆空白，英文或带空格的描述（如`not loyal to X`）会被拆成单词做比较，丢失风险更大。探针已确认：旧`不 喜欢 乙；喜欢 丙`、新`喜欢 乙`时返回旧值，没有冲突（这个例子按整值规则也是子串，但能说明空白拆分确实生效）。
   修复：改成`normalizeFact(previous).includes(normalizeFact(value))`和反向`includes`，删掉`factSegments`。同时补一条用例，断言上面第1个场景的结果为`旧；新`。

2. 方案要求的MG12没有实现（`tests/unit/novel-import-semantic-session.test.ts:202`）。
   冻结补充要求MG12验证“锁定字段在两个控制器调用点（652遗漏补全、702普通分析）产生冲突，而不是抛`导入作者锁定字段发生变化`”。现在的`MG12/MG16`测试只覆盖age身份冲突暂停和select重置，没有设置任何lock，也没有走652路径。如果调用点漏传locks，单测和这个测试都还是绿的，回归防线缺失。需要补充：在`semanticState.locks`中锁定一个可合并字段（如personality），分别经普通分析和遗漏补全返回不同措辞，断言phase为conflicts、锁定值不变、没有抛锁错误。

## 非阻断意见

- 上限判断的是“并集结果”，没有区分“结果等于旧值”的情况（`:246`、`:229-233`）。探针确认：旧值已超过1500字符时，新值与旧值NFKC等价（比如只多了首尾空格）或被旧值包含，也会判冲突。旧值超限是可能发生的：首个批次通过补空路径写入，不受1500限制。之后同实体每个措辞不同的批次都会暂停整个运行。字面上这符合B2（不比改前更差），但违背了“无新增内容就不需要作者决定”的初衷。建议在`merged===previous`时直接接受，不受上限约束；relationships在合并结果与旧集合语义相同时也一样处理。如果不改，请在真实运行记录中注明这一触发原因。
- relationships的description按整值规则合并，修复第1项后会自动一致。空description由`||`处理，能正确取非空一侧。
- relationships身份规则已逐项核对，都正确：两侧有characterId时按ID匹配，否则按target匹配；target不一致或characterId不一致时冲突；一侧缺失时补上；补上后若与其他项的characterId重复，`uniqueRelationships`会失败闭合；输出键序固定（探针确认重排键序后输出稳定）。`relationshipFacts`没有检查`isWellFormed`，不过后续的`validateImportSemanticArtifact`和`importNativeMappings`会兜底。
- B1：并集值和降级值只在`if(!conflict)`内写入；补空和别名照旧在循环内写入，与冻结说明“保留原有补空与别名行为”一致。MG11已覆盖。evidence、sourceUnitIds、text追加逻辑与改前相同。
- 锁定判断按`current.id+field`进行，锁定后直接走冲突路径；attribution被锁时reliability不会单独降级（MG11第二段已覆盖）。NFKC等价但字面不同的锁定值也判冲突，符合“值不同即判冲突”。
- 冲突hash的输入没有变化，已有冲突的id保持稳定。给定输入顺序，结果是确定的；A→B和B→A的拼接顺序不同，属于预期。幂等性：`旧；新`再与`新`合并，在整值规则下同样幂等。
- source、setting-body、旧版调用（`:506,531,714,750`）都不传semanticVersion=1，或origin不满足条件，不会进入新分支（MG08已覆盖）。`origin==='confirmed'`不参与合并，与方案一致。
- 测试缺口（建议补）：relationships的JSON超过8000字符的分支；旧值超过1500且新值被包含的情况（见上面第一条）；遗漏补全路径（652）的并集合并端到端用例；MG15只验证了一组幂等，可以加上“并集结果再合并一次”的断言。MG13中`40+30`个关系项能正确触发60项上限。

## 复审

结论：接受。两项阻断已解决，未发现新增阻断问题。

已执行（Node 24，单文件）：`tests/unit/novel-import-merge-reconcile.test.ts` 13/13通过；`tests/unit/novel-import-semantic-session.test.ts --test-name-pattern=MG` 中MG09、MG12a、MG12b、MG16共4项通过。“每个用例在对应调用点漏传locks时才失败”为协调者自测结论，本次未复现。

- 阻断1已解决：`desktop/core/novel-import.ts:204-210` 改为NFKC+trim后整值`includes`双向判断，`factSegments`已删除，全仓无残留引用。MG17覆盖`对乙 忠诚；对丙 怀疑`的两种顺序，结果均为拼接，不丢子句。仅含空白的值归一化后为空串，按包含处理（保留非空一侧），不产生异常。
- 阻断2已解决：MG12a（遗漏补全，经作者决定产生锁后再触发missingTargets）与MG12b（普通分析，checkpoint中带occupation锁）均断言phase=conflicts、锁定值不变、存在pending occupation冲突，且没有因锁错误进入failed。
- 上限调整（`:246`）：只在`merged!==previous`时检查1500上限，MG17已覆盖“超长旧值吸收被包含的新值”与“超长旧值再增长仍冲突”。新值包含旧值且超过1500时仍判冲突，正确。

非阻断：
- 整值子串包含是冻结规则本身的取舍：旧`不谨慎`、新`谨慎`时保留旧值，新值的单独含义被吸收。这符合规范，记录为已知风险，不要求修改。
- relationships的60项/8000字符上限仍未对“合并结果与旧值相同”作豁免，与文本字段口径不一致。只有旧值已超限才会触发，概率低，可以后续统一处理。8000字符分支仍没有用例。
