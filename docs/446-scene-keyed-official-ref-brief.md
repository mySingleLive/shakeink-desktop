# 官方引用编码的逐任务键兼容前提

R63 内联 A 实际通过，typed-ref/definitions B 返回400，441产品条件未满足（444）。[DeepSeek Tool Calls 文档](https://api-docs.deepseek.com/guides/tool_calls/)的复用示例采用单数 `$def` 与纯 `$ref`；[Responses 文档](https://api-docs.deepseek.com/api/create-response/)未在对应页明确此细节。因此本稿仅准新的合成兼容对照，不由工具调用文档推当前 Responses 必然支持，也不把 typed-ref 的失败称为所有引用都不支持。

新 C 必须从冻结 R63 B 的 flat typed-ref/完整严格三叶定义出发：将 definitions 与全部受控指针统一重命名为 `$def` 和 `#/$def/…`，且仅在目标自身已声明同一个 type 时移除 ref 上冗余 type。其余字段、上限、全部分支、0资格、逐任务键、见证与输入不变。不得移除仍有意义的字段、不合并选择域、不用已变 live schema 伪造旧 B。先对所有 ref 证明类型蕴含、严格 Ajv、独立诊断副本反命名再 inlining 与原内联 A canonical 深等、独立冻结 tuple/原 decoder/五任务见证全部通过。诊断反命名不是实际 wire 改写。

PRIVATE 新 namespace `scene-keyed-official-ref-probe`，复用443已审硬2/真实SDK/main gateway/hardtrue精确wire matcher/闭合161词投影/流上限/700600wx/readonly/正常退出/R62保护368及runtime、R63旧源/CJS/freeze保护。两例各一次：已冻结 R63内联 A 作control；新 C作candidate。除 schema 编码外，同 prompt、见证、strict=true、模型及全部其它参数；不发小说、不补试，不改产品或出站 model body。case IDs可沿原两ID并显式purpose区分。

控制与候选均实际HTTP2xx/stop/直接完整JSON、Native及原独立tuple/production decoder/见证全过，且delta=SDK、全部wire/readonly/保护/正常退出门全过，才替换441尚未满足的typed-ref前提，进入其余已审产品TDD。新 keyed Native 的实际编码仅用本轮已证 C 的 `$def`/纯refs；441的精确键反投原decoder、旧array/repairs兼容、原strict=true、闭合唯一replacement来源定位、原hasSource缺源资格、所有原接受门/四代/原预算/全书验收要求全部不变。失败或不确定不实施，不回写R63结果。

零接口字节测量仅用于预判可行性；产品修改后仍须130首轮及至少R46/R47/R61/R62的256实际捕获代，计新完整提示与schema、保持历史92/25原本地结果，不冒输入SHA相同或新供应商通过。不抬限、不裁资料。PRIVATE独审后仅root执行两次；真实前提通过后才产品先RED、独审、定向验证、冻结及fresh全书。
