# M01-D1：保留草稿重新选择的实际证据审核

**限定PASS：取消与同原件重新授权保留既有草稿；无新增P1/P2。不是M01整书通过。** 仅只读本run隔离证据，未启动/操作应用、连接DB、读取私有journal或调用模型。原生chooser取消/成功和新进程20934均为主代理实际观察，本审核只独立核算冻结数据。

session `439f1633-9d21-40f5-9d8b-7f165cc66265`保持。rev4→5完整递归差异仅revision/updatedAt；27个其它顶层字段均相等，取消没有更改files、epoch、373单元、9章、选择、目标、推断设置、预算、模型或产物。退出前rev2至rev4的16项保留字段也相等（原legacy预算仍缺省）；正常退出exit0/非LIFE来自主代理记录。

rev4→7完整递归差异只有revision/updatedAt、epoch 3→4和`files[0].proof.ctime`。ctime由`1792956433090205354`更新为`1793036774035998784`；device/inode/size/mtime及其余全部快照值不变。新proof精确等于主代理同期currentFileProof。成功断言27项均true；snapshot文件id、md/utf-8、included和源hash保持。祖先、同原路径、撤销两类grant/checkpoint、0AI与未丢弃/编辑原件由主代理同期断言提供；安全projection不含这些私有对象或完整调用历史，因此本审核不冒称独立读取或live stat。

重选前后373个unit.text顺序拼接均为27279字符/79156 UTF-8字节，SHA `03d44b6d8e94b4e1beed1c77113664f7d2469c612546644114f2783dc1c09267`，严格等于run冻结源hash。事前正文范围[13,23270)的23257字符SHA仍`b06de8a2b8ac2e8e2561f6b4fb39d6f15e866001f4af6d3c24e929cb7f87c397`。章节和单元对象全文、几何、身份均相等；这证明保留，不预判后续正文边界/文学质量。rev7仍source，steps/coverage/artifacts/decisions/conflicts/patches为空、workingRevision 0，未生成workingProse/originalProse。

| 冻结快照 | SHA-256 |
| --- | --- |
| source-reselect-before-native-rev4.json | `ecbba35a5ed1d8900fc88e905203b49d133bfabe3db3ef449f973177a7f6355f` |
| source-reselect-native-cancel-rev5.json | `cde08cdf099bf75fb6a1a6c19608256d8d022e23cf04739be4277e7672a1257f` |
| source-reselect-native-success-rev7.json | `bc28bb6f250de9b475e1aad24c97b733dfe8c60badc177aa97f184b41c597ee8` |

主代理首次验算误将预期更新的proof也纳入files整体不变，失败及`source-reselect-verifier-premise-correction.json`均保留；现独立递归结果证实只改授权字段，修正验算前提没有掩盖额外变化，也不计为产品重试。

输入及断言完整SHA、独立差异、来源与归属限制见`../evidence/M01-D1-source-reselection-actual-review.json`。只完成本次入口后验；真实分类、全部目标、语义QA、发布与LIFE仍需另验，既有S02文学FAIL和旧失败记录不变。
