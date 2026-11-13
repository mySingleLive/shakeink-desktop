/** docs/557 §3: author-facing names for import artifact fields shown on the step-21 conflict screen. */
export const IMPORT_FIELD_LABELS:Readonly<Record<string,string>>={
 text:'内容',roleType:'角色类型',aliases:'别名',age:'年龄',gender:'性别',occupation:'职业',personality:'性格',appearance:'外观',clothing:'衣着',catchphrase:'口头禅',growthArc:'成长弧线',relationships:'人物关系',
 reliability:'可靠性',attribution:'信息来源',temporalScope:'适用时段',characterId:'关联角色',sceneId:'关联地点',itemId:'关联物品',
 entityType:'资料类别',parentId:'上级',coordinates:'位置',worldId:'所属世界',settingType:'设定类型',content:'设定内容',
 lineId:'所属线',lineName:'线名称',timeKind:'时间类型',timeValue:'时间',timeEnd:'结束时间',time:'时间',people:'相关人物',eventId:'关联事件',
 chapterIndex:'所在章节',order:'顺序',narrator:'讲述者',refs:'引用事件',setup:'铺设',payoff:'回收',trigger:'触发条件',limitation:'限制',tropeKind:'类型',
 height:'身高',weight:'体重',build:'体型',faceShape:'脸型',tastes:'喜好',habits:'习惯',dialogueStyle:'说话风格',sampleDialogue:'对话示例',personalityTags:'性格标签',motivations:'动机',desires:'渴望',fears:'恐惧',beliefs:'信念',bigFive:'大五人格',abilities:'能力',backstory:'背景',arcStages:'成长阶段',
 exteriorDescription:'外部描述',interiorDescription:'内部描述',entryMethod:'进入方式',acquisition:'获取方式',effects:'作用',tags:'标签',status:'状态',touches:'触点',
 channel:'频道',genre:'类型',sellingPoints:'卖点',targetAudience:'目标读者',synopsis:'简介',
}
export function importFieldLabel(field:string):string{return IMPORT_FIELD_LABELS[field]??`其他字段（${field}）`}
