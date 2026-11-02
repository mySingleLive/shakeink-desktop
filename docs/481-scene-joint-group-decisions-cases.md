# 481 · 联合选择组与无损展示用例

状态：待480量化及方案独审后再审核，尚未准入TDD。

1. 原multi-claim组完整编译：相同literal的两个mention不得重复occurrence；同context/link多个位置不得重复完整窗口。手写完整合法组合oracle与原compiler结果逐值一致，原256/4096/65536边界不变，超限不保partial。singleton及超限组的每个原claim完整进入按原索引排序的remainder。跨row同名不因此合并地点。
2. 混合同slot任务的精确分区与合并：稀疏slot、非连续claimIndexes、多个joint组与一个remainder并存；逐claim恰一次。缺失/重复/越界/跨slot/重叠/selection与replacement混用必须拒，且不能部分apply、覆盖先答或由后答补救。最后仍经原来源、旧事实保留、所有owner与目标remap门；各组单独合法的跨组冲突也必须原门拒。
3. Fresh selection Native精确闭合selection对象；旧显式策略同deck Native原golden不变。合法wrapper到原局部option路径；本地裸整数旧兼容保持。明确claimChoices仅键恰局部1..K且数组位置/次序/数值完整唯一匹配一个原冻结option才接受；0匹配、多匹配、缺/多/全局key、[3]、混字段、string/NaN/fraction/unsafe、排序或去重后才相同均拒。getters/Proxy/holes/额外数组键/坏原型零执行，不回退猜数字。
4. Provider列式claims独立手写inverse：mention/context/link所有列和存在性、claimRef、0/false/[]、literal/label含控制字样、targetIndex/relation、原数组顺序与完整eligible域逐值还原原rows。未知key/kind/column/错误列长/类型拒，不能strip。完整8列CF目录、candidates/keep不变。省略task.domains后从唯一slot及claimIndexes还原原private tasks深等，缺row/重复slot/越界或重叠索引不得当空域。输入与私有deck不变。
5. 准备只编译一次，fallback不刷新原row/request枚举计数。每group最多selection→remainder一次，每row一次terminal replacement，转移数≤G+R；整行替换原子移除该row全部task和state，其它row保持；旧版本/激活后不能变更或复活。候选按完整显示/Native前后成本与确定tie-break选择，不是单看旧task大小；穷尽只标本策略，无全局无解承诺。5000B软目标：首hard-fit保留；仅下一非破坏preview完整hard-fit且fixed实际下降才commit，余量不足但无可fit更小候选仍保当前hard-fit，不新增第四硬cap。preview失败/不节约/无候选均停，commit前版本改变或重commit拒；丢弃preview不能decode/activate；peek/render不得改变current boundData/boundSchema/text/focus/retention/version/计数，完整bundle在commit时原子采用，丢弃不得泄漏preview schema；不能回拨旧deck或重抓retention。g3/g4不得继续准备。
6. 原三桶N/N-1及固定桶N/N+1：完整source、原首稿、当前失败答、全部rows/keep/CF/域/options在SDK实际prompt中可逆深等。第二轮准备可变、激活后第三/四轮不得变deck；later超限在SDK前拒，不能删current、换更小域或恢复旧数字。source/retention focus仍互斥、完整≤16KiB且不能挤掉基础资料；usage/auth/abort/HTTP/输出上限及四代保持。
7. 两份R72真实首稿在PRIVATE 0 API下重建新明确回答，经当前完整runImportAi及source/owner/retention成功；另用原实际g2仅作完整失败负载，g2/g3/g4均测三桶。目标mention/context联合组仍完整selection，不能靠降级丢组或自动删重取得成功。原actual输入SHA匹配、投影inverse、全部368保护哈希保存；不称供应商成功。
8. 全历史368请求/719捕获互斥记账，旧actual前缀和完整source/首稿/row/分区/域/options/CF窗/Native/wire编码匹配才用后代旧答，未知/变化在SDK前停。202相同payload的R70与R72按run+operation+首稿SHA分别追踪，不能合并。新129/旧130首轮、已知首稿准备及5个run+payload完整四代20prompt均测原三桶，无意外budget漏账。旧baseline的1预算拒绝、1invalid_schema和旧实际失败永久保留。
9. 真RED→GREEN及独立code review；原49定向文件扩必要新用例、typecheck/desktop build/diff，不跑全仓。原Native能力静态收据及outer false限定保留；新格式仅既有语法不自动重复API probe。完整正常fresh全文从原按钮计时420000ms，无skip/drop，全部场景/完整资料与grounded正常UI复核、发布、正常关闭重开及离线全DB深等实际通过才完成。
10. R73验收工具只改已识别基础设施绑定：driver/final同R72；snapshot只2处evidence+1处work R69→R73，实际核session/work/novelId一致。严格before/after四文件bytes+hash、draft envelope/schema/未知键/hash篡改负控保持；内容变化逐值审核，不能用metadata规则自动豁免。小说原bytes/body/1402章与恢复的独立语义基线一致；不能拿本轮结果生成预期。
