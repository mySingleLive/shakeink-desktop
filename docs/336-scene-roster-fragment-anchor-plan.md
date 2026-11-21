# 具体地点清单：片段索引与提及名称编码

2026-11-01。332—335之后的当前单包探针仍两代stop失败；context及根形状问题未再出现，但仍有逐字quote不匹配、literal/名称/别名重复填写不一致。该探针不是历史R28的exact raw，尚未启动新鲜R29全文。本方案不放宽原门，不承诺索引能替代语义复核。

## 精确范围与材料合同

仅`semanticVersion:1 / phase:analyze / intent:roster / kind:scene / sceneIdentity:{version:1,mode:roster}`。改动限新增`desktop/core/novel-import-scene-roster-fragments.ts`、现payload/service及新定向测试；不改core身份validator、shared schema、main、ledger、来源、coverage或其它目标。

新纯helper从当前`request.units`生成发送副本：保留每个单位的其它原字段，删除发送副本的`text`，增加当前数组0-based `unitIndex`与`fragments:[{index,text}]`。原request及工作单位不变。fragments按原顺序、非重叠且非空，index从0连续；concat逐字等于原unit.text。按句/分句标点`。！？!?；;，,、：:.`及换行之后切分，CRLF作为一个边界，遍历完整Unicode码点；不trim、不改标点/空白、不吞尾部，全空白也保留。原text为空时保留该单位且fragments=[]，不会凭空生成引文。算法固定，无模型切分，无自适应截短。发送和还原共用同一纯函数；不缓存旧ID、排序或文字下的目录。

最小纯API：`sceneRosterFragmentRequest(request):boolean`；`sceneRosterFragments(text):{index:number,text:string}[]`；`sceneRosterFragmentUnits(units):(Omit<ImportUnit,'text'>&{unitIndex:number,fragments:{index:number,text:string}[]})[]`；`restoreSceneRosterFragmentAnchor(reference:{unitIndex:number,fromFragment:number,toFragment:number},units):Anchor`。还原只读当前units与同一算法，拒绝不完整/额外键及不安全索引；错误固定不含资料。

## 仅generation wire的两个互斥编码

每个evidence允许严格union：原`{unitId,quote}`，或新`{unitIndex,fromFragment,toFragment}`。新索引均为非负安全整数，范围是当前unit的半开连续片段`[fromFragment,toFragment)`，至少一片，不能越界/跨unit或选空单位。应用从当前表恢复该unit真实ID及片段拼接的连续原quote。模型不得带fragments、text或任何目录控制字段。合法索引只是当前材料引用，不证明literal唯一或语义正确；同样索引在其它包的意图无法推断，一律只解释为本包。旧raw错quote/错unit不fallback、不改字、不改绑。

每条record允许严格union：原`{name,aliases,mentions,context,links}`，或新`{primaryMentionIndex,mentions,context,links}`。primaryMentionIndex只选本记录mentions中的有效0-based安全整数。仅新分支由所选mention.literal生成canonical name，按原mentions顺序收集其它不同literal为aliases；仅按exact literal首次出现去重并排除name，不trim、normalize或跨记录收集。所有mentions、context、links完整保留，重复literal的mentions不删。其它不同literal超过20时仍由原canonical/schema门拒绝，不能截断别名或证据。原完整record分支绝不派生或修复name/aliases。两种record可在同一回复逐项选用，每项与每个anchor均严格互斥，混合键、own undefined、缺字段/多字段拒绝。新编码不推断同一地点；是否应放同record仍由原有据分组/身份审核负责。

先strict解析整份wire，再在副本中恢复索引anchor、仅新record派生名称，随后用原canonical record schema及`validateSceneRosterRecords`完整重验，包括精确quote唯一、literal在quote唯一、全部名称/别名提及覆盖、context/links及总容量。成功后沿原一次canonical编译及service-final/main门；外部canonical仅原Anchor/name/aliases，不出现新索引控制字段。显式坏raw不可切换分支获救，只有下一代真正返回合法完整新wire才可通过。

## 提示、纠错、预算与验证

提示优先选显示的unitIndex与片段边界、primaryMentionIndex，给明确JSON对象合成例；保留原raw精确引用备选，供需要在片段内部取更窄唯一引文时使用。所有literal仍必须是quote内唯一原文写法，不能合成。新增静态索引/primary说明沿332安全known路径、最多6项、每message最多250 UTF-16字符；派生后的canonical name/aliases问题须映射回该record实际wire的primaryMentionIndex/mentions，不要求新record填写不存在的字段。索引quote非唯一时固定指导扩展连续片段至quote唯一且literal仍恰一次；不能放宽唯一门或改取首项。无法分类仍安全静态fallback，说明当前合法两种编码。完整原full validator始终是接受门，诊断不修raw、不删项。

全部fragment文字及index metadata进入原`serializeImportAiPayload`、stageRequests fits及worker原完整预算；只去除同一发送单位重复text表示，不去重/删单位/删片段，不人工缩包或改原预算。metadata可能令原planner得到不同首包，实际探针必须由最新stageRequests重建并记录当前包，不强塞旧94单位或声称原payload同hash。原工作材料、role、thinking、输出cap、两代、并发与固定16KiB wrapper reserve不变。非scope payload/prompt/wire及canonical byte合同不变。

337独审后TDD，独立code review后主代理再做当前单包与新鲜全文。实际仍不满足原门必须拒绝，不能以合成Mock或单包代替完整导入、发布及重开验收。
