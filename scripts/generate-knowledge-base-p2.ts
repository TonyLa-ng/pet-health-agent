/**
 * 知识库补充脚本 — 补全到各 ~100 种
 */
import fs from 'fs'
import path from 'path'

const BASE = path.resolve(process.cwd(), 'data', 'knowledge', 'species')

interface DDef {
  id: string; disease: string; species: string[]; category: string
  primary: string[]; secondary: string[]; urgency: string
  diagnosis: string; homeCare: string[]; forbidden: string[]
  differential: { disease: string; differentiator: string; questions: string[] }[]
}
function entry(d: DDef) { return {
  id: d.id, disease: d.disease, species: d.species, category: d.category,
  symptoms: { primary: d.primary, secondary: d.secondary, detail: {} },
  urgency: d.urgency, diagnosis_basis: d.diagnosis,
  home_care: d.homeCare.join('\n'),
  forbidden_care: d.forbidden.map(f => ({ rule: f, condition: 'default' })),
  medication: ['需兽医处方'], vet_threshold: '症状加重或出现急症请立即就医',
  confidence: 'high',
  differential_diagnosis: d.differential.map(dd => ({ disease: dd.disease, differentiator: dd.differentiator, key_questions: dd.questions })),
  references: ['小动物医学参考'], version: 1, status: 'active', created_at: '2026-06-14', updated_at: '2026-06-14', reviewed_by: null
}}

// ======== 犬补充 (~65 种) ========
const DOG_MORE: DDef[] = [
  // 眼科
  {id:'canine-oph-001',disease:'干眼症(KCS)',species:['犬'],category:'眼科',primary:['黏液性眼分泌物','结膜充血','频繁眨眼'],secondary:['角膜混浊','视力下降','反复角膜溃疡'],urgency:'medium',diagnosis:'干眼症是泪液分泌不足导致的慢性角膜结膜炎。免疫介导性最常见，某些品种（可卡/西施/约克夏）高发。泪液量测试(STT)<15mm/min可确诊。需终身用药。',homeCare:['人工泪液频繁点眼','环孢素眼膏（遵医嘱）','定期眼科复查','保持眼部清洁'],forbidden:['禁止自行停药','禁止使用含激素眼药水（除非兽医处方）'],differential:[{disease:'结膜炎',differentiator:'结膜炎泪液量正常(STT>15)，无角膜病变',questions:['有无做过泪液量测试？']}]},
  {id:'canine-oph-002',disease:'白内障',species:['犬'],category:'眼科',primary:['晶状体混浊（白瞳）','视力下降'],secondary:['碰撞家具','步态改变'],urgency:'medium',diagnosis:'白内障是晶状体蛋白变性导致混浊。可为遗传性（贵宾/可卡/波士顿梗）、糖尿病性、老年性或外伤性。裂隙灯检查可确诊并分级。唯一有效治疗为超声乳化手术。',homeCare:['定期眼科检查','控制糖尿病（如有）','抗氧化剂补充','严重者考虑手术'],forbidden:['禁止使用宣称可"溶解"白内障的眼药水（无效）'],differential:[{disease:'核硬化',differentiator:'核硬化是老年犬正常老化，晶状体呈淡蓝色但不影响视力',questions:['犬年龄多大？视力是否明显下降？']}]},
  {id:'canine-oph-003',disease:'青光眼',species:['犬'],category:'眼科',primary:['眼压升高','眼球突出','角膜水肿（蓝眼）'],secondary:['瞳孔散大','视力丧失','疼痛（眯眼/流泪）'],urgency:'critical',diagnosis:'青光眼是眼压升高导致视神经损伤的致盲性急症。分为原发性和继发性。眼压计测量（>25mmHg为异常）。急性青光眼需在数小时内降眼压，否则永久失明。',homeCare:['⚠️ 眼科急症，需在数小时内就医','降眼压药物（遵医嘱）','严重者需手术（激光/引流阀）'],forbidden:['禁止延误治疗（数小时可致永久失明）','禁止使用阿托品（升眼压）'],differential:[{disease:'葡萄膜炎',differentiator:'葡萄膜炎眼压降低（<10mmHg），瞳孔缩小；青光眼眼压升高',questions:['眼压多少？']}]},
  {id:'canine-oph-004',disease:'结膜炎',species:['犬'],category:'眼科',primary:['结膜充血','眼分泌物增多','频繁眨眼'],secondary:['眼睑痉挛','第三眼睑突出'],urgency:'low',diagnosis:'犬结膜炎病因多样：过敏、感染（细菌/病毒）、异物、干眼症、眼睑内翻等。需确定原发病因。',homeCare:['保持眼部清洁','按医嘱使用抗生素/抗过敏眼药水','戴伊丽莎白圈防搔抓'],forbidden:['禁止使用人用眼药水','禁止不排查原发病因'],differential:[{disease:'干眼症',differentiator:'干眼症以黏性分泌物为主+STT<15；结膜炎泪液量正常',questions:['眼分泌物是水性还是黏性？']}]},

  // 耳科
  {id:'canine-oto-001',disease:'外耳炎',species:['犬'],category:'耳科',primary:['耳道红肿','耳分泌物','频繁摇头/挠耳'],secondary:['耳臭','耳廓脱毛','疼痛'],urgency:'medium',diagnosis:'犬外耳炎最常见，垂耳犬（可卡/金毛/拉布拉多）高发。病因包括细菌/酵母菌感染、过敏、耳螨、异物（草芒）。耳镜检查+耳分泌物细胞学可诊断。',homeCare:['定期耳道清洁（兽医推荐洗耳液）','按医嘱使用耳药','治疗全身性过敏（如有）','保持耳道干燥'],forbidden:['禁止用棉签掏耳（将分泌物推入更深）','禁止使用酒精类清洁剂（刺激耳道）'],differential:[{disease:'耳螨',differentiator:'耳螨分泌物呈咖啡渣样，显微镜可见虫体；幼犬/群居多发',questions:['耳分泌物是什么颜色和性状？']}]},
  {id:'canine-oto-002',disease:'耳血肿',species:['犬'],category:'耳科',primary:['耳廓肿胀（软性肿块）','耳廓变形'],secondary:['疼痛','频繁甩头'],urgency:'medium',diagnosis:'耳血肿是耳廓软骨和皮肤间血管破裂积血，通常由外耳炎导致的剧烈甩头/挠耳引起。触诊波动感+穿刺抽出血液可诊断。需同时治疗外耳炎。',homeCare:['外科引流或手术修复','同时治疗外耳炎（根本原因）','戴伊丽莎白圈防进一步损伤'],forbidden:['禁止自行穿刺（可能导致感染和复发）','禁止不处理外耳炎'],differential:[{disease:'耳廓脓肿',differentiator:'脓肿穿刺为脓液（非血液），细胞学可见大量中性粒细胞',questions:['有无耳炎病史？']}]},

  // 口腔
  {id:'canine-dent-001',disease:'牙周病',species:['犬'],category:'口腔',primary:['口臭','牙龈红肿','牙结石'],secondary:['牙齿松动','牙龈萎缩','食欲下降'],urgency:'medium',diagnosis:'犬牙周病是牙菌斑→牙结石→牙龈炎→牙周炎的渐进性疾病。小型犬和老年犬高发。牙科探诊+X光可分期。严重者可导致菌血症和心内膜炎。',homeCare:['每日刷牙（犬用牙膏）','定期洗牙（兽医操作）','洁牙零食/咬胶','定期口腔检查'],forbidden:['禁止使用人用牙膏（氟化物对犬有毒）','禁止不处理严重牙周病（可影响全身健康）'],differential:[{disease:'口腔肿瘤',differentiator:'肿瘤呈肿块状生长，X光可见骨溶解；牙周病为弥漫性',questions:['口内有无明显肿块？']}]},
  {id:'canine-dent-002',disease:'牙龈炎',species:['犬'],category:'口腔',primary:['牙龈红肿','口臭','牙龈易出血'],secondary:['食欲下降','流涎'],urgency:'low',diagnosis:'牙龈炎是牙周病的早期阶段，仅累及牙龈，未破坏牙周膜和牙槽骨。牙菌斑是主要原因。及时治疗可完全逆转。',homeCare:['每日刷牙','定期洗牙','洁牙零食'],forbidden:['禁止使用人用牙膏','禁止不处理（会进展为牙周病）'],differential:[{disease:'口腔溃疡',differentiator:'溃疡有凹陷、疼痛明显；牙龈炎为弥漫性红肿无溃疡',questions:['牙龈有无明显溃疡？']}]},
  {id:'canine-dent-003',disease:'口腔肿瘤',species:['犬'],category:'口腔',primary:['口腔肿块','口臭','流涎带血'],secondary:['牙齿松动','面部肿胀','吞咽困难'],urgency:'high',diagnosis:'犬口腔肿瘤常见类型为恶性黑色素瘤、鳞状细胞癌、纤维肉瘤、牙龈瘤。活检病理可确诊。',homeCare:['尽早就医检查','根治性手术切除（下颌骨或上颌骨切除术）','术后可能需放化疗'],forbidden:['禁止拖延——早期切除范围小，功能影响小'],differential:[{disease:'牙龈增生',differentiator:'牙龈增生为良性过度生长，质地较硬，无破溃和骨溶解',questions:['肿块质地如何？有无破溃？']}]},

  // 神经
  {id:'canine-neuro-001',disease:'癫痫',species:['犬'],category:'神经系统',primary:['抽搐','意识丧失','四肢划动'],secondary:['流涎','排尿失禁','发作后定向力障碍'],urgency:'high',diagnosis:'犬癫痫可为特发性（遗传，1-5岁首次发作）或继发性（脑肿瘤/脑炎/代谢病/中毒）。发作频率>1次/月或集群发作需抗癫痫治疗。排除其他病因后诊断。',homeCare:['发作时保持环境安静安全','记录发作时间和持续时间','苯巴比妥/溴化钾（遵医嘱，需监测血药浓度）','定期复查血常规+肝功能'],forbidden:['禁止发作时将手放入犬口中','禁止自行停药（可诱发严重癫痫持续状态）','禁止不监测血药浓度'],differential:[{disease:'晕厥',differentiator:'晕厥无典型的强直-阵挛动作，恢复较快；心电图可鉴别心源性晕厥',questions:['发作前有无诱因？发作后恢复速度？']}]},
  {id:'canine-neuro-002',disease:'椎间盘疾病(IVDD)',species:['犬'],category:'神经系统',primary:['背部疼痛','后肢无力','不愿走动'],secondary:['后肢瘫痪','排尿失禁','深部痛觉丧失'],urgency:'critical',diagnosis:'IVDD是椎间盘突出压迫脊髓导致神经功能障碍。软骨营养障碍品种（腊肠犬/柯基/法斗/京巴）高发。Hansen I型（急性髓核突出）和II型（慢性纤维环突出）。MRI/CT+神经学检查可定位和分级。',homeCare:['⚠️ 需立即就医（尤其是瘫痪）','严格笼养限制活动4-6周','止痛+抗炎（遵医嘱）','严重者需手术减压（24小时内最佳）','物理治疗'],forbidden:['禁止不限制活动（会加重压迫）','禁止对瘫痪犬延误手术（超过24-48小时预后差）'],differential:[{disease:'退行性脊髓病',differentiator:'DM多见于老年大型犬（德牧），慢性渐进性，无疼痛，MRI无椎间盘突出',questions:['犬有无疼痛表现？']}]},
  {id:'canine-neuro-003',disease:'前庭综合征',species:['犬'],category:'神经系统',primary:['头倾斜','眼球震颤','共济失调'],secondary:['呕吐（晕动症）','转圈','无法站立'],urgency:'high',diagnosis:'前庭综合征分为外周性（内耳/前庭神经）和中枢性（脑干/小脑）。老年犬特发性前庭综合征（外周性）最常见，俗称"老狗前庭病"。神经学检查可定位。',homeCare:['支持治疗（防摔伤/辅助进食饮水）','止晕药（遵医嘱）','寻找并治疗原发病因（中耳炎/甲减/肿瘤）','大多数外周性前庭病在数天至数周内自行改善'],forbidden:['禁止不做神经学检查就放弃','禁止不排查中耳炎等可治疗病因'],differential:[{disease:'脑干肿瘤',differentiator:'中枢性前庭病变常伴其他脑神经异常和本体感觉障碍',questions:['有无其他神经症状（意识改变/其他脑神经异常）？']}]},

  // 更多内分泌
  {id:'canine-endo-004',disease:'Addison病（肾上腺皮质功能减退）',species:['犬'],category:'内分泌',primary:['反复呕吐','腹泻','精神萎靡'],secondary:['体重下降','脱水','心率减慢'],urgency:'critical',diagnosis:'Addison病是肾上腺皮质功能减退导致糖皮质激素和盐皮质激素分泌不足。可急性发作（Addison危象：休克+高钾+低钠+低血糖）。ACTH刺激试验可确诊。',homeCare:['终身激素替代治疗（泼尼松+氟氢可的松/DOCP）','定期电解质监测','应激时增加激素剂量'],forbidden:['禁止自行停药（可致死）','禁止应激时不增加剂量'],differential:[{disease:'肾衰竭',differentiator:'Addison病钾高钠低，肾衰钾可高可正常；ACTH刺激试验可区分',questions:['有无做过电解质检查？']}]},
  {id:'canine-endo-005',disease:'胰岛瘤（低血糖）',species:['犬'],category:'内分泌',primary:['反复虚弱/昏厥','抽搐','嗜睡'],secondary:['食欲增加','体重增加','运动不耐受'],urgency:'high',diagnosis:'胰岛瘤是胰腺β细胞肿瘤导致胰岛素过度分泌→顽固性低血糖。胰岛素/血糖比值>0.3支持诊断。B超/CT可定位肿瘤。手术治疗是首选。',homeCare:['少量多餐（高蛋白低碳水）','避免长时间空腹','严重者需泼尼松控制低血糖','手术切除（如有明确肿瘤）'],forbidden:['禁止长时间禁食','禁止喂食高糖食物（刺激胰岛素释放→反跳性低血糖）'],differential:[{disease:'肝功能衰竭',differentiator:'肝衰竭伴黄疸+肝酶升高，餐前餐后血糖均偏低',questions:['血糖最低降到多少？']}]},

  // 更多皮肤
  {id:'canine-derm-004',disease:'跳蚤过敏性皮炎',species:['犬'],category:'皮肤科',primary:['剧烈瘙痒','脱毛','红色丘疹'],secondary:['皮肤破损','继发细菌感染','腰荐部脱毛'],urgency:'medium',diagnosis:'跳蚤过敏性皮炎(FAD)是犬对跳蚤唾液过敏的一种超敏反应。即使少量跳蚤叮咬也可导致严重瘙痒。梳毛见跳蚤粪便（黑色碎屑遇水变红）可诊断。',homeCare:['每月使用高效体外驱虫药（全年不间断）','环境灭蚤（吸尘/杀虫剂/生长调节剂）','控制继发感染','抗组胺药/激素（遵医嘱，短期）'],forbidden:['禁止不定期驱虫','禁止仅治疗不处理环境（跳蚤90%在环境中）'],differential:[{disease:'疥螨病',differentiator:'疥螨瘙痒更剧烈，耳缘/肘部好发，皮肤刮片可见虫体',questions:['驱虫药是否覆盖跳蚤？','家中其他宠物或人有无瘙痒？']}]},
  {id:'canine-derm-005',disease:'皮脂腺炎',species:['犬'],category:'皮肤科',primary:['被毛干枯无光泽','脱毛','皮屑（大量银白色）'],secondary:['毛囊角栓','皮肤增厚'],urgency:'low',diagnosis:'皮脂腺炎是皮脂腺免疫介导性破坏导致的角化异常病。秋田犬、贵宾、萨摩耶等品种高发。皮肤活检可确诊。',homeCare:['角化调节洗发水定期药浴','Omega-3脂肪酸补充','维A酸类药物（遵医嘱）','环孢素（遵医嘱）'],forbidden:['禁止频繁洗澡（加重皮脂流失）','禁止使用干燥性香波'],differential:[{disease:'原发性皮脂溢',differentiator:'皮脂溢可以为油性或干性，无免疫介导的皮脂腺破坏；活检可区分',questions:['皮肤是偏油性还是干性？']}]},
  {id:'canine-derm-006',disease:'急性湿性皮炎（湿疹/hot spot）',species:['犬'],category:'皮肤科',primary:['局部急性红肿','渗出','剧痛'],secondary:['瘙痒','脱毛（边界清晰）'],urgency:'medium',diagnosis:'急性湿性皮炎是皮肤继发性细菌感染和自我损伤的恶性循环。常在过敏/外寄生虫/毛结/潮湿基础上发生。患处剧痛湿润。',homeCare:['患处剃毛清洗','外用抗生素+激素药膏','戴伊丽莎白圈防舔舐','查找并处理原发病因'],forbidden:['禁止不处理原发病因（易复发）','禁止让犬舔舐患处'],differential:[{disease:'脓皮症',differentiator:'脓皮症为弥漫性脓疱和结痂，hot spot为局限性急性湿性皮损',questions:['皮损是局部还是全身？有无脓疱？']}]},
  {id:'canine-derm-007',disease:'马拉色菌皮炎',species:['犬'],category:'皮肤科',primary:['瘙痒','皮肤油腻','红斑','异味'],secondary:['苔藓化','色素沉着','慢性耳炎'],urgency:'medium',diagnosis:'马拉色菌是皮肤正常菌群，过度增殖时致病。常在过敏/皮脂溢/潮湿基础上发生。皮肤细胞学可见特征性"花生样"酵母菌。',homeCare:['抗真菌香波定期洗澡','治疗原发过敏','保持皮肤干燥','严重者口服抗真菌药'],forbidden:['禁止仅抗真菌不处理原发病','禁止不保持干燥'],differential:[{disease:'细菌性脓皮症',differentiator:'脓皮症以脓疱为主，细胞学见球菌；马拉色菌见酵母菌',questions:['皮肤细胞学检查结果？']}]},

  // 更多传染
  {id:'canine-inf-004',disease:'犬冠状病毒感染',species:['犬'],category:'传染病',primary:['呕吐','腹泻（黄色至橙色）','食欲下降'],secondary:['精神萎靡','脱水'],urgency:'medium',diagnosis:'犬冠状病毒(CCoV)感染小肠绒毛上皮导致吸收不良性腹泻。症状较轻但合并细小病毒感染时加重。粪便PCR可确诊。',homeCare:['对症支持治疗（补液/易消化食物）','隔离病犬','环境消毒'],forbidden:['禁止与其他犬接触'],differential:[{disease:'细小病毒感染',differentiator:'细小以血便+白细胞骤降为特征；冠状多为黄色水样便',questions:['腹泻有无带血？血常规白细胞多少？']}]},
  {id:'canine-inf-005',disease:'犬疱疹病毒感染',species:['犬'],category:'传染病',primary:['幼犬急性死亡','精神萎靡','不吃奶'],secondary:['腹泻','呼吸困难','尖叫'],urgency:'critical',diagnosis:'犬疱疹病毒(CHV)对新生幼犬（<3周龄）致命，因幼犬体温调节不成熟，病毒在低温下复制活跃。>3周龄犬通常无症状。PCR可确诊。',homeCare:['保温（提高环境温度至35-38℃）','抗病毒治疗','支持治疗'],forbidden:['禁止让新生幼犬受凉'],differential:[{disease:'新生幼犬细菌性败血症',differentiator:'细菌性败血症血培养阳性，抗生素治疗有效',questions:['幼犬多大日龄？']}]},
  {id:'canine-inf-006',disease:'犬传染性肝炎',species:['犬'],category:'传染病',primary:['高热','精神萎靡','呕吐'],secondary:['腹痛','角膜水肿（蓝眼）','黄疸','出血倾向'],urgency:'critical',diagnosis:'犬传染性肝炎（ICH）由犬腺病毒1型(CAV-1)引起，侵害肝脏和血管内皮。疫苗接种可有效预防。PCR+血清学可确诊。',homeCare:['⚠️ 需住院治疗','对症支持（输液+护肝+抗出血）','隔离病犬'],forbidden:['禁止未接种疫苗','禁止与其他犬接触'],differential:[{disease:'钩端螺旋体病',differentiator:'钩端以黄疸+肾衰竭为主，有鼠类/污水接触史',questions:['犬有无接触鼠类或污水？']}]},

  // 更多寄生虫
  {id:'canine-par-004',disease:'疥螨病',species:['犬'],category:'寄生虫',primary:['剧烈瘙痒（夜间加重）','脱毛','皮肤红斑'],secondary:['结痂（耳缘/肘部）','皮肤增厚'],urgency:'high',diagnosis:'犬疥螨(Sarcoptes scabiei)高度传染，人畜共患（人表现为暂时性瘙痒性丘疹）。耳缘-足肘反射阳性。浅层皮肤刮片镜检可确诊（但检出率仅30%）。',homeCare:['杀螨药物治疗（伊维菌素/塞拉菌素/氟雷拉纳）','环境清洁','同舍宠物同时治疗','避免人接触（人畜共患）'],forbidden:['禁止仅治疗有症状犬（无症状带虫者也需治疗）'],differential:[{disease:'过敏性疾病',differentiator:'过敏通常无耳缘-足肘反射，对杀螨治疗无反应',questions:['家中其他犬或人有无瘙痒？']}]},
  {id:'canine-par-005',disease:'跳蚤感染',species:['犬'],category:'寄生虫',primary:['瘙痒','皮肤丘疹','可见跳蚤或跳蚤粪便'],secondary:['脱毛（尾根部和后腿）','继发感染'],urgency:'medium',diagnosis:'犬常见外寄生虫。成虫仅占跳蚤种群的5%，其余95%（卵+幼虫+蛹）在环境中。梳毛检查跳蚤粪便（黑色碎屑→湿后变红）可确诊。',homeCare:['每月高效体外驱虫（全年）','环境灭蚤（吸尘+生长调节剂）','同舍所有宠物同时驱虫'],forbidden:['禁止仅治疗不处理环境','禁止不定期驱虫'],differential:[{disease:'食物过敏',differentiator:'食物过敏多伴消化道症状，驱虫无效',questions:['有无看到跳蚤或跳蚤粪便？']}]},
  {id:'canine-par-006',disease:'犬绦虫病',species:['犬'],category:'寄生虫',primary:['肛周可见白色节片（米粒样）','舔舐肛周'],secondary:['轻度腹泻','体重下降（严重感染）'],urgency:'low',diagnosis:'犬常见绦虫为犬复孔绦虫（经跳蚤传播）和棘球绦虫（经生肉/内脏传播，人畜共患）。粪便中可见蠕动节片。粪便漂浮法可能漏检。',homeCare:['吡喹酮驱虫','控制跳蚤（阻断犬复孔绦虫传播）','不喂生肉（阻断棘球绦虫）','定期驱虫'],forbidden:['禁止喂食生肉/内脏','禁止不控制跳蚤'],differential:[{disease:'蛲虫',differentiator:'犬无蛲虫感染（蛲虫是人的寄生虫）；肛周瘙痒需检查绦虫节片或肛门腺',questions:['肛周有无白色米粒状节片？']}]},

  // 更多骨骼
  {id:'canine-msk-004',disease:'肘关节发育不良',species:['犬'],category:'骨骼肌肉',primary:['前肢跛行','运动后加重','不愿运动'],secondary:['关节肿胀','肌肉萎缩'],urgency:'medium',diagnosis:'肘关节发育不良是肘关节吻合不良导致的继发性骨关节炎，大型犬（德牧/金毛/拉布拉多/罗威纳）高发。X光+CT可确诊。',homeCare:['控制体重','适度运动','关节营养补充','严重者考虑关节置换'],forbidden:['禁止过度运动','禁止肥胖'],differential:[{disease:'全骨炎',differentiator:'全骨炎为幼犬（5-18月龄）自限性骨痛，X光见骨髓腔密度增高',questions:['犬年龄多大？']}]},
  {id:'canine-msk-005',disease:'关节炎（骨关节炎）',species:['犬'],category:'骨骼肌肉',primary:['慢性跛行','起立困难','运动后僵硬'],secondary:['关节肿胀','肌肉萎缩','行为改变（不愿玩耍）'],urgency:'medium',diagnosis:'骨关节炎是关节软骨退行性变+继发性炎症，老年犬常见。可为原发性（老化）或继发性（髋肘发育不良/十字韧带断裂后）。X光可见关节间隙变窄+骨赘。',homeCare:['控制体重（最重要）','适度低冲击运动（游泳）','关节营养品（葡萄糖胺/软骨素）','NSAIDs止痛（遵医嘱，监测肝肾）','物理治疗'],forbidden:['禁止使用人用止痛药','禁止不控制体重'],differential:[{disease:'骨肿瘤',differentiator:'骨肿瘤疼痛剧烈、持续加重、X光见溶骨/成骨性病变',questions:['疼痛是否持续加重，休息也不缓解？']}]},
  {id:'canine-msk-006',disease:'骨肉瘤',species:['犬'],category:'骨骼肌肉',primary:['持续性跛行','肢体肿胀','剧痛'],secondary:['食欲下降','体重下降'],urgency:'critical',diagnosis:'骨肉瘤是犬最常见原发性恶性骨肿瘤，大型犬（大丹/罗威纳/金毛）高发。好发于长骨干骺端（桡骨远端/肱骨近端）。X光+活检可确诊。早期截肢+化疗可延长生存期。',homeCare:['尽早就医确诊','截肢+化疗（主要治疗）','疼痛管理','姑息放疗（不适合手术者）'],forbidden:['禁止拖延（转移率高，早期手术预后较好）','禁止仅止痛不治疗原发病'],differential:[{disease:'骨髓炎（真菌性）',differentiator:'骨髓炎X光见骨膜反应而非溶骨，真菌培养阳性',questions:['犬有无去过真菌疫区（美国西南部）？']}]},

  // 更多生殖
  {id:'canine-repro-003',disease:'假孕',species:['犬'],category:'产科',primary:['乳腺发育','泌乳','筑巢行为'],secondary:['腹部胀大','食欲改变','焦虑'],urgency:'low',diagnosis:'假孕是母犬发情后黄体期孕酮下降、催乳素升高导致的类妊娠综合征。未经配种也可发生。通常2-3周自愈。反复发作需考虑绝育。',homeCare:['减少液体摄入（减少乳汁分泌）','避免乳腺刺激','观察乳腺有无硬块（排除乳腺炎或肿瘤）','严重或反复发作者考虑绝育'],forbidden:['禁止挤奶（刺激更多泌乳）','禁止对反复发作者不做绝育'],differential:[{disease:'乳腺炎',differentiator:'乳腺炎有红肿热痛+发热+脓性乳汁；假孕乳汁清亮无炎症',questions:['乳腺有无红肿热痛？乳汁什么颜色？']}]},
  {id:'canine-repro-004',disease:'乳腺炎',species:['犬'],category:'产科',primary:['乳腺红肿热痛','乳汁异常（脓性/血性）'],secondary:['发热','精神萎靡','母犬拒绝哺乳'],urgency:'high',diagnosis:'乳腺炎是哺乳期乳腺细菌感染。乳汁淤积+细菌逆行感染是主因。乳汁细胞学+细菌培养可确诊。',homeCare:['抗生素治疗（遵医嘱，需考虑哺乳幼犬安全）','热敷','挤出感染乳汁','严重者需手术引流','幼犬改用代乳品'],forbidden:['禁止不处理感染乳汁（幼犬吸食可能中毒）'],differential:[{disease:'乳腺肿瘤',differentiator:'乳腺肿瘤无发热红肿，为无痛性肿块',questions:['犬是否在哺乳期？']}]},

  // 更多中毒
  {id:'canine-tox-004',disease:'木糖醇中毒',species:['犬'],category:'中毒',primary:['呕吐','嗜睡','共济失调'],secondary:['抽搐','低血糖','急性肝衰竭'],urgency:'critical',diagnosis:'木糖醇（口香糖/无糖糖果/牙膏/花生酱中常见）刺激犬胰岛素大量释放→严重低血糖→肝坏死。0.1g/kg可致低血糖，>0.5g/kg可致肝衰竭。血糖检测+肝功能检查可诊断。',homeCare:['⚠️ 立即就医','监测血糖（可能需要葡萄糖静脉输注）','保肝治疗','监测凝血功能'],forbidden:['禁止给犬任何含木糖醇的产品','禁止喂食人类口香糖/无糖食品'],differential:[{disease:'其他原因低血糖',differentiator:'依靠摄入史区分',questions:['犬有无吃口香糖或无糖食品？']}]},
  {id:'canine-tox-005',disease:'防冻液（乙二醇）中毒',species:['犬'],category:'中毒',primary:['共济失调（类似醉酒）','呕吐','嗜睡'],secondary:['多饮多尿（早期）','少尿无尿（晚期）','口腔溃疡','抽搐'],urgency:'critical',diagnosis:'防冻液中乙二醇对犬剧毒，甜味吸引犬舔食。乙二醇代谢产物（草酸钙结晶）导致急性肾衰竭。Wood灯检查尿液荧光+血液乙二醇检测+肾功可诊断。4小时内使用甲吡唑或乙醇治疗可挽救。',homeCare:['⚠️ 此为致命急症，4小时内治疗效果最佳','立即就医','甲吡唑（4-MP）或乙醇竞争性抑制（兽医操作）','静脉输液','血液透析'],forbidden:['禁止等待观察（错过4小时黄金窗口，预后极差）','禁止存放防冻液在犬能接触到的地方'],differential:[{disease:'急性肾衰竭（其他原因）',differentiator:'依靠摄入史+尿液草酸钙结晶+Wood灯检查区分',questions:['犬有无可能接触防冻液？']}]},
]

// ======== 猫补充 (~84 种) ========
const CAT_MORE: DDef[] = [
  // 眼科
  {id:'feline-oph-001',disease:'猫结膜炎',species:['猫'],category:'眼科',primary:['结膜充血','眼分泌物','频繁眨眼'],secondary:['眼睑痉挛','第三眼睑突出'],urgency:'medium',diagnosis:'猫结膜炎常见病原为猫疱疹病毒(FHV-1)、猫衣原体(Chlamydia felis)、猫支原体。多猫环境高发。PCR+结膜细胞学可鉴别病原。',homeCare:['按医嘱使用抗病毒/抗生素眼药水','L-赖氨酸（FHV-1辅助）','隔离病猫','保持环境清洁'],forbidden:['禁止使用含激素眼药水（FHV-1感染时）','禁止与其他猫共用眼药'],differential:[{disease:'角膜溃疡',differentiator:'溃疡荧光素染色阳性，猫表现为剧烈疼痛和畏光',questions:['有无做过荧光素染色？']}]},
  {id:'feline-oph-002',disease:'猫角膜坏死（角膜腐骨）',species:['猫'],category:'眼科',primary:['角膜黑褐色斑块','疼痛（眯眼/流泪）','眼分泌物'],secondary:['角膜血管化','结膜充血'],urgency:'high',diagnosis:'猫角膜坏死是猫特有的角膜病变，角膜基质坏死呈黑褐色斑块。波斯猫/暹罗猫/FHV-1感染猫高发。角膜切除术+结膜瓣覆盖是主要治疗。',homeCare:['尽快就医','角膜切除术（移除坏死组织）','术后抗生素眼药'],forbidden:['禁止拖延（坏死可深入穿孔）','禁止自行使用眼药水'],differential:[{disease:'角膜黑色素瘤',differentiator:'黑色素瘤为隆起肿块，坏死为平坦凹陷的黑褐色斑块',questions:['病变是平坦还是隆起？']}]},
  {id:'feline-oph-003',disease:'猫葡萄膜炎',species:['猫'],category:'眼科',primary:['瞳孔缩小','房水闪辉','结膜充血'],secondary:['畏光','眼压降低','虹膜颜色改变'],urgency:'high',diagnosis:'猫葡萄膜炎病因复杂：FIP/FIV/FeLV/弓形虫/真菌/外伤/肿瘤。需查找全身性病因。眼压测量+裂隙灯+全身检查。',homeCare:['查找全身性病因','局部激素（遵医嘱）','阿托品散瞳止痛（遵医嘱）','治疗原发病'],forbidden:['禁止不经检查就随意使用眼药水'],differential:[{disease:'青光眼',differentiator:'青光眼眼压升高（>25mmHg），瞳孔散大；葡萄膜炎眼压降低，瞳孔缩小',questions:['眼压多少？']}]},

  // 耳科
  {id:'feline-oto-001',disease:'猫耳螨',species:['猫'],category:'耳科',primary:['耳道咖啡渣样分泌物','剧烈瘙痒（挠耳/甩头）'],secondary:['耳廓脱毛','外耳炎'],urgency:'medium',diagnosis:'猫耳螨(Otodectes cynotis)是猫最常见外耳寄生虫，高度传染。耳镜检查可见白色爬行虫体+耳分泌物镜检可见虫体。',homeCare:['杀螨耳药（塞拉菌素/伊维菌素）','同舍猫同时治疗','环境清洁'],forbidden:['禁止仅治疗一只猫（同舍猫都需治疗）','禁止不处理环境'],differential:[{disease:'马拉色菌耳炎',differentiator:'马拉色菌见酵母菌而非虫体，耳分泌物为深褐色蜡质而非咖啡渣样',questions:['耳分泌物镜检有无虫体？']}]},
  {id:'feline-oto-002',disease:'猫耳息肉',species:['猫'],category:'耳科',primary:['慢性耳道感染','甩头','耳道肿块'],secondary:['中耳炎','前庭症状'],urgency:'medium',diagnosis:'猫耳息肉（炎性息肉）是幼猫常见的良性增生，起源于中耳或咽鼓管，经鼓膜向耳道生长。耳镜+影像学可诊断。手术切除（腹侧鼓室截骨术）可根治。',homeCare:['手术切除（需彻底去除根部）','术后抗生素+止痛','复发监测'],forbidden:['禁止仅耳道切除不处理鼓室内根部（易复发）'],differential:[{disease:'耳道肿瘤',differentiator:'肿瘤多见于老年猫，活检病理可确诊',questions:['猫年龄多大？']}]},

  // 口腔
  {id:'feline-dent-001',disease:'猫慢性口炎',species:['猫'],category:'口腔',primary:['口腔剧痛','流涎','口臭','食欲减退'],secondary:['体重下降','被毛粗糙（无法理毛）','牙龈/口腔黏膜红肿溃烂'],urgency:'high',diagnosis:'猫慢性口炎（淋巴细胞浆细胞性口炎）是猫常见的免疫介导性口腔疾病。病因复杂：FIV/FeLV/杯状病毒/牙菌斑过敏。典型表现为尾口炎（口腔后部红肿增生）。全口拔牙是主要治疗方案。',homeCare:['全口拔牙或臼齿拔除（70-80%猫显著改善）','术后仍可能需要免疫抑制治疗','口腔清洁','疼痛管理'],forbidden:['禁止不治疗（猫因剧痛停止进食→脂肪肝→死亡）','禁止仅用抗生素不拔牙'],differential:[{disease:'口腔鳞状细胞癌',differentiator:'SCC为局部肿块/溃疡，活检确诊，预后差；口炎为弥漫性炎症',questions:['有无做过口腔活检？']}]},
  {id:'feline-dent-002',disease:'猫牙吸收',species:['猫'],category:'口腔',primary:['牙齿缺损','口腔疼痛','食欲改变'],secondary:['流涎','口臭'],urgency:'medium',diagnosis:'猫牙吸收（FORL）是猫特有疾病，破牙细胞破坏牙体组织（牙冠和/或牙根）。发病率随年龄增长，>5岁猫中>50%。口腔X光是诊断金标准。',homeCare:['患齿拔除（唯一有效治疗）','定期口腔X光检查','术后止痛'],forbidden:['禁止保留患齿（病变不可逆且持续疼痛）','禁止不做口腔X光仅凭肉眼判断'],differential:[{disease:'牙周病',differentiator:'牙周病为牙周组织炎症，牙冠完整；牙吸收有特征性牙体缺损',questions:['口腔X光有无特征性骨吸收影像？']}]},

  // 神经
  {id:'feline-neuro-001',disease:'猫癫痫',species:['猫'],category:'神经系统',primary:['抽搐','意识改变','异常行为'],secondary:['流涎','排尿失禁'],urgency:'high',diagnosis:'猫癫痫较犬少见。可为特发性、继发性（脑肿瘤/脑炎/FIP/弓形虫/低血糖/肝性脑病）。MRI+脑脊液+代谢筛查需排查继发病因。',homeCare:['发作时保持安静安全','苯巴比妥/左乙拉西坦（遵医嘱）','查找并治疗原发病因'],forbidden:['禁止自行用药（猫对某些抗癫痫药敏感）'],differential:[{disease:'晕厥',differentiator:'晕厥无抽搐动作，心电图可鉴别心源性',questions:['有无心脏病史？']}]},
  {id:'feline-neuro-002',disease:'猫血栓栓塞(ATE)',species:['猫'],category:'神经系统',primary:['突发双后肢瘫痪','剧痛（嚎叫）','后肢冰冷'],secondary:['呼吸急促','心率失常'],urgency:'critical',diagnosis:'猫主动脉血栓栓塞(ATE)是血栓嵌顿于主动脉分叉处导致后肢急性缺血。最常见于肥厚型心肌病(HCM)猫（左心房血栓脱落）。后肢无脉搏+冰冷+发绀可诊断。',homeCare:['⚠️ 此为致命急症，立即就医','抗凝治疗（氯吡格雷/利伐沙班）','止痛','治疗潜在心脏病','物理治疗（恢复期）'],forbidden:['禁止不治疗潜在心脏病','禁止不抗凝（复发率高）'],differential:[{disease:'IVDD（椎间盘疾病）',differentiator:'IVDD后肢有痛觉和脉搏，ATE后肢无脉搏冰冷',questions:['后肢有无脉搏？','有无心脏病史？']}]},

  // 心脏
  {id:'feline-cardio-001',disease:'肥厚型心肌病(HCM)',species:['猫'],category:'心血管',primary:['呼吸急促','运动不耐受','昏厥'],secondary:['后肢瘫痪（血栓栓塞）','心杂音','奔马律'],urgency:'critical',diagnosis:'HCM是猫最常见的心脏病，左心室壁增厚导致舒张功能下降。缅因猫/布偶猫有遗传倾向。心脏B超（左室壁>6mm）可确诊。可导致心衰、血栓栓塞、猝死。',homeCare:['控制心率和改善舒张功能（β阻滞剂/钙通道阻滞剂）','预防血栓（氯吡格雷）','控制应激','定期心脏B超复查'],forbidden:['禁止不抗凝（高危血栓风险）','禁止输液过多过快（诱发心衰）'],differential:[{disease:'限制型心肌病',differentiator:'RCM以心房显著扩大+左室壁不厚为特征，B超可区分',questions:['心脏B超结果？']}]},
  {id:'feline-cardio-002',disease:'猫心力衰竭',species:['猫'],category:'心血管',primary:['呼吸困难','张口呼吸','坐姿呼吸'],secondary:['食欲下降','精神萎靡','后肢瘫痪（血栓）'],urgency:'critical',diagnosis:'猫心衰最常见于HCM终末期。表现为肺水肿或胸水。猫心衰症状隐匿（不爱动/躲藏），易被忽视。X光（肺水肿/胸水）+心脏B超可确诊。',homeCare:['⚠️ 立即就医','吸氧','利尿剂（呋塞米）','胸腔穿刺（如有胸水）','ACEI/β阻滞剂'],forbidden:['禁止应激','禁止不控制液体入量'],differential:[{disease:'猫哮喘',differentiator:'哮喘无心脏扩大和心杂音，X光见支气管壁增厚而非肺水肿',questions:['有无心杂音？X光有无心脏扩大？']}]},

  // 更多消化
  {id:'feline-dig-005',disease:'猫便秘/巨结肠',species:['猫'],category:'消化系统',primary:['排便困难','粪便干硬','排便频率显著减少'],secondary:['食欲下降','呕吐','精神萎靡'],urgency:'high',diagnosis:'猫便秘可因脱水、毛球、异物、骨盆狭窄、特发性巨结肠等引起。长期严重便秘可致巨结肠（结肠永久扩张失去蠕动能力）。X光可评估粪便积存+结肠扩张程度。',homeCare:['增加饮水和纤维','乳果糖/聚乙二醇软化粪便','严重需灌肠（兽医操作）','巨结肠需结肠次全切除术'],forbidden:['禁止长期用刺激性泻药','禁止不处理慢性便秘（可致巨结肠）'],differential:[{disease:'肠梗阻',differentiator:'梗阻呕吐更剧烈、完全不排便排气；巨结肠X光见结肠极度扩张',questions:['排便是否完全停止？']}]},
  {id:'feline-dig-006',disease:'猫胰腺炎',species:['猫'],category:'消化系统',primary:['食欲下降','嗜睡','黄疸'],secondary:['呕吐','脱水','低体温'],urgency:'high',diagnosis:'猫胰腺炎症状隐匿（不似犬的急性剧烈呕吐），常与肠炎和胆管肝炎并发（三联征）。fPLI检测+B超可辅助诊断。',homeCare:['对症支持治疗（输液+营养支持）','止吐+止痛','逐步恢复饮食','治疗并发疾病（肠炎/胆管炎）'],forbidden:['禁止不经营养支持（猫厌食→脂肪肝）','禁止仅凭临床症状排除（猫胰腺炎诊断难）'],differential:[{disease:'脂肪肝',differentiator:'脂肪肝有长期厌食史+显著黄疸+B超肝回声增强',questions:['猫有无长期厌食史？']}]},
  {id:'feline-dig-007',disease:'猫结肠炎',species:['猫'],category:'消化系统',primary:['腹泻（黏液/血丝）','里急后重','排便次数增多'],secondary:['体重下降','被毛粗糙'],urgency:'medium',diagnosis:'猫结肠炎是大肠黏膜炎症，病因包括寄生虫（鞭虫/球虫）、细菌感染、食物过敏、IBD、应激。结肠镜+活检可确诊。',homeCare:['食物排除试验','高纤维或低残留饮食（视情况）','益生菌','抗寄生虫治疗','严重者激素/免疫抑制剂'],forbidden:['禁止频繁换粮','禁止不排除寄生虫'],differential:[{disease:'小肠性腹泻',differentiator:'小肠性腹泻量大、频率正常；大肠性腹泻量少、频繁（里急后重）',questions:['腹泻量多少？有无黏液或血丝？']}]},

  // 皮肤科
  {id:'feline-derm-002',disease:'猫粟粒性皮炎',species:['猫'],category:'皮肤科',primary:['全身散在小丘疹/结痂','瘙痒'],secondary:['脱毛','皮肤增厚'],urgency:'medium',diagnosis:'猫粟粒性皮炎是猫特征性过敏性皮肤病，触诊可感到粟粒样小丘疹/结痂。最常见病因：跳蚤过敏（最常见）、食物过敏、特应性皮炎。',homeCare:['严格驱虫（跳蚤是首要排查对象）','食物排除试验','抗组胺药/激素（短期，遵医嘱）'],forbidden:['禁止不做跳蚤控制就诊断食物过敏','禁止长期使用激素不查找病因'],differential:[{disease:'猫精神性脱毛',differentiator:'精神性脱毛皮肤本身正常，毛干断裂（显微镜可见）；粟粒性皮炎有明显皮损',questions:['皮肤有无丘疹和结痂？']}]},
  {id:'feline-derm-003',disease:'猫精神性脱毛',species:['猫'],category:'皮肤科',primary:['对称性脱毛','过度理毛'],secondary:['皮肤正常（无红疹/无皮屑）'],urgency:'low',diagnosis:'猫精神性脱毛是猫因心理应激（环境变化/多猫冲突/无聊）过度理毛导致的脱毛。脱毛区域皮肤外观正常。需排除瘙痒性皮肤病。',homeCare:['环境丰富化（玩具/猫抓板/高处/藏身处）','费洛蒙扩散器','减少应激源','行为矫正'],forbidden:['禁止惩罚过度理毛行为','禁止不排除皮肤病因就诊断为精神性'],differential:[{disease:'过敏',differentiator:'过敏有明显瘙痒+皮肤病变（红斑/丘疹/结痂）；精神性皮肤正常',questions:['皮肤外观是否正常？']}]},
  {id:'feline-derm-004',disease:'猫嗜酸性肉芽肿综合征',species:['猫'],category:'皮肤科',primary:['皮肤增生性病变（唇/腹部/后腿）','口腔溃疡','脱毛斑块'],secondary:['瘙痒','疼痛'],urgency:'medium',diagnosis:'猫嗜酸性肉芽肿综合征是猫特有的免疫介导性皮肤病，可能与过敏（跳蚤/食物/环境）相关。临床表现多样：无痛性溃疡（上唇）、嗜酸性斑块（腹部/大腿内侧）、嗜酸性肉芽肿（线性增生）。细胞学见大量嗜酸性粒细胞可诊断。',homeCare:['激素治疗（泼尼松龙，遵医嘱）','环孢素（严重/难治性）','查找过敏原（跳蚤/食物）','严格驱虫'],forbidden:['禁止不做跳蚤控制','禁止长期激素不做病因排查'],differential:[{disease:'鳞状细胞癌',differentiator:'SCC多见于老年猫鼻尖/耳尖，为侵蚀性溃疡，活检可确诊',questions:['病变在什么部位？猫年龄多大？']}]},

  // 更多传染
  {id:'feline-inf-004',disease:'猫白血病(FeLV)',species:['猫'],category:'传染病',primary:['体重下降','反复感染','淋巴瘤'],secondary:['贫血','口腔炎','发热'],urgency:'high',diagnosis:'猫白血病病毒(FeLV)经唾液长期密切接触传播（互相理毛/共用水盆食盆）。导致免疫抑制+肿瘤。ELISA快速检测可诊断。疫苗可预防。',homeCare:['严格室内饲养','高质量饮食','定期体检（每6个月）','积极治疗继发感染','疫苗接种（未感染猫）'],forbidden:['禁止放养','禁止与其他未检测的猫接触'],differential:[{disease:'FIV',differentiator:'FIV主要经咬伤传播（未绝育公猫），FeLV经长期密切接触传播',questions:['猫有无做过FeLV/FIV检测？']}]},
  {id:'feline-inf-005',disease:'猫杯状病毒感染',species:['猫'],category:'传染病',primary:['口腔溃疡','流涎','打喷嚏'],secondary:['发热','食欲下降','结膜炎','跛行（一过性）'],urgency:'medium',diagnosis:'猫杯状病毒(FCV)是猫上呼吸道感染主要病原体之一，以口腔溃疡为特征性病变。强毒株可致全身性感染（VS-FCV，高致死率）。疫苗可减轻但不能完全预防。',homeCare:['对症支持治疗','鼓励进食（口腔疼痛→软食）','保持口腔清洁','隔离病猫'],forbidden:['禁止与其他猫接触','禁止不接种疫苗'],differential:[{disease:'猫疱疹病毒感染',differentiator:'FHV-1以角膜炎/角膜溃疡+打喷嚏为主，口腔溃疡不常见',questions:['有无口腔溃疡？有无角膜病变？']}]},
  {id:'feline-inf-006',disease:'猫衣原体感染',species:['猫'],category:'传染病',primary:['结膜炎（单侧→双侧）','眼睑水肿','眼分泌物'],secondary:['打喷嚏','流鼻涕'],urgency:'medium',diagnosis:'猫衣原体(Chlamydia felis)主要引起猫结膜炎，经直接接触传播。PCR可确诊。口服多西环素（注意食道损伤！）治疗4周。',homeCare:['多西环素治疗（遵医嘱，喂药后需喂水防食管炎）','隔离','眼部抗生素药膏','同舍猫同时治疗'],forbidden:['禁止多西环素干喂（需喂药后冲水防食管炎）','禁止不完成全程治疗（需4周）'],differential:[{disease:'猫支原体感染',differentiator:'支原体结膜炎症状更轻，PCR可区分',questions:['PCR检测结果？']}]},

  // 更多内分泌
  {id:'feline-endo-003',disease:'猫肢端肥大症',species:['猫'],category:'内分泌',primary:['胰岛素抵抗性糖尿病','体重增加','面部/爪子增大'],secondary:['器官肿大','心脏杂音','下颌前突'],urgency:'medium',diagnosis:'猫肢端肥大症由垂体生长激素(GH)分泌过多引起，中年至老年猫多见。常表现为难以控制的糖尿病（胰岛素抵抗）。IGF-1升高+CT/MRI见垂体肿瘤可确诊。',homeCare:['放射治疗或手术切除垂体肿瘤','高剂量胰岛素控制血糖','定期监测血糖+IGF-1'],forbidden:['禁止放弃治疗（未控制的糖尿病可致酮症酸中毒）'],differential:[{disease:'单纯糖尿病',differentiator:'单纯糖尿病胰岛素常规剂量可控制，肢端肥大需要异常高剂量',questions:['胰岛素需求量是否异常高？','有无面部/爪子变大？']}]},
  {id:'feline-endo-004',disease:'猫醛固酮增多症(Conn综合征)',species:['猫'],category:'内分泌',primary:['低钾导致肌无力（颈下垂/跖行）','多饮多尿','高血压'],secondary:['失明（高血压性视网膜脱落）','心杂音'],urgency:'high',diagnosis:'猫原发性醛固酮增多症由肾上腺皮质肿瘤分泌过量醛固酮引起。低钾血症+高血压+醛固酮升高可诊断。B超/CT可定位肾上腺肿瘤。手术切除可治愈。',homeCare:['螺内酯（醛固酮拮抗剂）','补钾','控制血压','手术切除肾上腺肿瘤'],forbidden:['禁止不监测血钾和血压'],differential:[{disease:'慢性肾病',differentiator:'CKD多饮多尿但通常无严重低钾+高血压+颈下垂',questions:['血钾多少？有无高血压？']}]},

  // 肾脏/泌尿
  {id:'feline-uro-004',disease:'猫肾结石',species:['猫'],category:'泌尿系统',primary:['血尿','反复尿路感染','排尿困难'],secondary:['腹痛','精神萎靡'],urgency:'high',diagnosis:'猫肾结石较膀胱结石少见，常见类型为草酸钙。与遗传、饮食、尿液pH相关。X光/B超可确诊。小结石可药物溶解或排出，大结石需手术。',homeCare:['增加饮水稀释尿液','泌尿道处方粮','定期影像学复查','手术取出大结石'],forbidden:['禁止不增加饮水','禁止随意补钙（草酸钙结石猫）'],differential:[{disease:'肾盂肾炎',differentiator:'肾盂肾炎以发热+白细胞升高为主，尿培养阳性，无结石影像',questions:['B超或X光有无结石？']}]},
  {id:'feline-uro-005',disease:'猫急性肾损伤(AKI)',species:['猫'],category:'泌尿系统',primary:['少尿或无尿','呕吐','精神萎靡','食欲废绝'],secondary:['口腔溃疡','脱水','低温'],urgency:'critical',diagnosis:'猫急性肾损伤病因包括中毒（百合花/防冻液/NSAIDs）、感染、缺血（麻醉意外/低血压）、尿路阻塞后利尿期。血液生化（BUN/Crea急剧升高）+尿检可诊断。',homeCare:['⚠️ 立即就医','静脉输液利尿','治疗原发病因','严重者需血液透析'],forbidden:['禁止使用肾毒性药物','禁止给猫百合花（所有部位对猫剧毒）'],differential:[{disease:'慢性肾病急性发作',differentiator:'CKD急性发作有长期多饮多尿/消瘦史，肾脏B超见小肾（纤维化）',questions:['猫之前有无多饮多尿史？']}]},

  // 更多寄生虫
  {id:'feline-par-002',disease:'猫蛔虫病',species:['猫'],category:'寄生虫',primary:['腹泻','腹部胀大','体重下降'],secondary:['呕吐（可能吐出虫体）','被毛粗糙'],urgency:'medium',diagnosis:'猫蛔虫(Toxocara cati)是猫常见肠道寄生虫，幼猫感染率高（可经乳汁传播）。粪便漂浮法镜检虫卵可确诊。具有人畜共患风险。',homeCare:['定期驱虫（幼猫每月，成猫每3个月）','及时清理猫砂','接触后洗手'],forbidden:['禁止不按时驱虫','禁止使用犬用驱虫药'],differential:[{disease:'猫绦虫',differentiator:'绦虫可在粪便/肛周见白色节片；蛔虫可见面条状成虫',questions:['粪便中可见虫体吗？什么形状？']}]},
  {id:'feline-par-003',disease:'猫绦虫病',species:['猫'],category:'寄生虫',primary:['肛周白色米粒样节片','舔舐肛周'],secondary:['轻度腹泻','体重下降（严重感染）'],urgency:'low',diagnosis:'猫绦虫常见犬复孔绦虫（经跳蚤传播）和猫绦虫（经鼠类传播）。肛周可见蠕动节片。吡喹酮治疗。',homeCare:['吡喹酮驱虫','控制跳蚤和鼠类','定期驱虫'],forbidden:['禁止不控制跳蚤（犬复孔绦虫传播必需跳蚤）'],differential:[{disease:'蛔虫',differentiator:'蛔虫为完整虫体（面条状），绦虫为扁平节片',questions:['肛周有无白色会动的节片？']}]},

  // 更多生殖
  {id:'feline-repro-003',disease:'猫乳腺纤维腺瘤样增生',species:['猫'],category:'产科',primary:['乳腺显著肿大','乳腺坚实'],secondary:['无痛','可能对称或不对称'],urgency:'medium',diagnosis:'猫乳腺纤维腺瘤样增生（Fibroadenomatous hyperplasia）是年轻未绝育母猫或接受孕酮治疗的猫因孕酮刺激导致的乳腺良性快速增生。绝育或停用孕酮后通常自行消退。',homeCare:['绝育（治疗+预防）','停用任何含孕酮的药物','观察消退情况（通常数周至数月消退）'],forbidden:['禁止不经检查就诊断为肿瘤（可穿刺细胞学鉴别）'],differential:[{disease:'乳腺肿瘤',differentiator:'肿瘤多见于老年猫、质地硬、不消退、可能破溃',questions:['猫年龄多大？是否绝育？']}]},
  {id:'feline-repro-004',disease:'猫难产',species:['猫'],category:'产科',primary:['努责超过30分钟无胎儿娩出','超过预产期','绿色分泌物无胎儿娩出'],secondary:['虚弱','发热','精神萎靡'],urgency:'critical',diagnosis:'猫难产原因包括母体因素（子宫收缩无力/骨盆狭窄）和胎儿因素（胎儿过大/胎位不正）。距上一只胎儿娩出超过2-4小时需警惕。',homeCare:['⚠️ 立即就医','可能需要剖腹产','路途中保持母猫安静'],forbidden:['禁止自行助产','禁止等待超过2小时'],differential:[{disease:'正常分娩',differentiator:'正常分娩应有规律宫缩，每只间隔不超过2小时',questions:['距上一只已过多久？有无规律宫缩？']}]},

  // 更多中毒
  {id:'feline-tox-001',disease:'猫百合花中毒',species:['猫'],category:'中毒',primary:['呕吐','流涎','精神萎靡'],secondary:['少尿或无尿（急性肾衰竭）','食欲废绝','嗜睡'],urgency:'critical',diagnosis:'百合花（所有部位：花/叶/花粉/水盆中的水）对猫剧毒，少量摄入即可致急性肾衰竭。确切毒素机制不明。摄入后12-24小时出现肾衰竭症状。',homeCare:['⚠️ 立即就医（摄入2小时内催吐）','静脉输液利尿保护肾脏（至少48小时）','监测肾功能','血液透析（严重者）'],forbidden:['禁止在家中养猫时种植百合花','禁止等待症状出现再就医'],differential:[{disease:'防冻液中毒',differentiator:'防冻液可见尿液草酸钙结晶；百合花靠摄入史+无结晶尿区分',questions:['猫有无可能接触百合花？']}]},
  {id:'feline-tox-002',disease:'猫对乙酰氨基酚（扑热息痛）中毒',species:['猫'],category:'中毒',primary:['面部/爪部水肿','发绀（高铁血红蛋白血症）','呼吸困难'],secondary:['呕吐','黄疸','精神萎靡'],urgency:'critical',diagnosis:'对乙酰氨基酚（扑热息痛/Tylenol）对猫剧毒！猫缺乏葡萄糖醛酸转移酶无法代谢，极低剂量（10mg/kg，即人用325mg片剂的1/8片）即可致死。导致高铁血红蛋白血症+肝坏死。',homeCare:['⚠️ 立即就医，这是致命中毒','N-乙酰半胱氨酸+维生素C（兽医操作）','吸氧','输血'],forbidden:['⚠️ 绝对禁止给猫喂任何人用止痛药！','禁止等待观察'],differential:[{disease:'其他高铁血红蛋白血症',differentiator:'依靠药物摄入史+血药浓度检测区分',questions:['猫有无可能吃到人用止痛药？']}]},

  // 更多猫特有
  {id:'feline-msk-001',disease:'猫关节炎',species:['猫'],category:'骨骼肌肉',primary:['活动减少','跳跃困难','不愿跳上高处'],secondary:['行为改变（躲藏/攻击性）','步态僵硬'],urgency:'medium',diagnosis:'猫关节炎很常见（>12岁猫中>90%有关节退行性变），但猫不会明显跛行。猫表现更隐匿：减少跳跃、使用矮家具、猫砂盆外围排泄。X光可确诊。',homeCare:['控制体重','关节营养品（葡萄糖胺/Omega-3）','环境改造（矮猫砂盆/斜坡）','NSAIDs（猫专用，遵医嘱，短程低剂量）','物理治疗'],forbidden:['禁止使用犬用NSAIDs（对猫可能致死）','禁止不控制体重'],differential:[{disease:'脊柱病',differentiator:'脊柱病可有神经症状（本体感觉异常），X光可区分',questions:['有无后肢无力或神经异常？']}]},
  {id:'feline-msk-002',disease:'猫骨关节炎（老年猫）',species:['猫'],category:'骨骼肌肉',primary:['活动水平下降','梳毛减少','性格改变'],secondary:['跛行（不常见）','肌肉萎缩'],urgency:'low',diagnosis:'猫骨关节炎发病率随年龄显著升高。大型猫（缅因/布偶）和肥胖猫风险更高。X光可确诊，但影像学严重度与临床症状不完全相关。',homeCare:['控制体重','环境改造','关节营养品','疼痛管理（猫专用加巴喷丁/NSAIDs）'],forbidden:['禁止忽视猫的疼痛信号','禁止使用人用或犬用止痛药'],differential:[{disease:'退行性关节病(DJD)',differentiator:'DJD与OA本质相同，DJD强调退行性成分，OA强调炎症成分',questions:['猫年龄多大？有无活动减少？']}]},
]

// === 执行 ===
const catMap: Record<string, string> = {
  '消化系统':'digestive', '泌尿系统':'urinary', '呼吸系统':'respiratory',
  '心血管':'cardiovascular', '皮肤科':'dermatology', '传染病':'infectious',
  '寄生虫':'parasitic', '内分泌':'endocrine', '骨骼肌肉':'musculoskeletal',
  '产科':'reproductive', '中毒':'emergency_toxicology',
  '眼科':'ophthalmology', '耳科':'otology', '口腔':'dental', '神经系统':'nervous',
}

function writeSpecies(dir: string, diseases: DDef[]) {
  const by: Record<string, ReturnType<typeof entry>[]> = {}
  for (const d of diseases) {
    const f = catMap[d.category] || d.category
    if (!by[f]) by[f] = []
    by[f].push(entry(d))
  }
  for (const [f, list] of Object.entries(by)) {
    const fp = path.join(dir, `${f}.json`)
    let exist: Array<{ id?: string }> = []
    if (fs.existsSync(fp)) { try { exist = JSON.parse(fs.readFileSync(fp,'utf-8')) as Array<{ id?: string }> } catch {} }
    const existIds = new Set(exist.map((e) => e.id))
    const add = list.filter(e => !existIds.has(e.id))
    const merged = [...exist, ...add]
    fs.writeFileSync(fp, JSON.stringify(merged, null, 2), 'utf-8')
    console.log(`  ${f}: +${add.length} → ${merged.length}`)
  }
}

console.log('=== 犬补充 ===')
writeSpecies(path.join(BASE, 'dogs'), DOG_MORE)
console.log(`  +${DOG_MORE.length} 种`)

console.log('\n=== 猫补充 ===')
writeSpecies(path.join(BASE, 'cats'), CAT_MORE)
console.log(`  +${CAT_MORE.length} 种`)
