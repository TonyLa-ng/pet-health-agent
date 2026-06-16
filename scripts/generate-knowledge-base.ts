/**
 * 批量知识库生成脚本
 * 犬猫各 ~100 种常见疾病，覆盖内科/外科/传染/寄生虫/产科
 */
import fs from 'fs'
import path from 'path'

interface DiseaseDef {
  id: string; disease: string; species: string[]; category: string
  primary: string[]; secondary: string[]; urgency: string
  diagnosis: string; homeCare: string[]; forbidden: string[]
  differential: { disease: string; differentiator: string; questions: string[] }[]
  references?: string[]
}

const BASE = path.resolve(process.cwd(), 'data', 'knowledge', 'species')

// ===================== 犬疾病 =====================
const DOG_DISEASES: DiseaseDef[] = [
  // === 消化系统 ===
  {id:'canine-dig-002',disease:'慢性胃炎',species:['犬'],category:'消化系统',primary:['间歇性呕吐','食欲下降','体重下降'],secondary:['腹部不适','便秘或腹泻'],urgency:'low',diagnosis:'慢性胃炎是胃黏膜的慢性炎症，病因包括食物过敏、NSAIDs长期使用、幽门螺杆菌感染、胆汁反流等。胃镜+活检可确诊。',homeCare:['喂食易消化处方粮','少量多餐','避免突然换粮','记录呕吐频率和诱因'],forbidden:['禁止长期使用NSAIDs（需兽医监控）','禁止喂食高脂肪食物','禁止突然更换饮食'],differential:[{disease:'胃溃疡',differentiator:'胃溃疡疼痛更明显，可能出现黑便或呕血',questions:['呕吐物是否带血或咖啡渣样？','排便是否呈黑色柏油状？']},{disease:'胃肿瘤',differentiator:'老年犬多见，体重显著下降，食欲时好时坏',questions:['犬年龄多大？','体重下降是否明显？']}],references:['小动物内科学第5版']},
  {id:'canine-dig-003',disease:'肠炎',species:['犬'],category:'消化系统',primary:['腹泻','呕吐','食欲下降'],secondary:['腹痛','脱水','发热','血便'],urgency:'medium',diagnosis:'肠炎是小肠黏膜的急性或慢性炎症。病因包括细菌感染（沙门氏菌/弯曲杆菌）、病毒感染（细小/冠状）、寄生虫、食物不耐受、IBD等。粪便检查+血液检查+影像学可辅助诊断。',homeCare:['禁食12-24小时（保证饮水）','恢复进食时喂易消化食物','补充益生菌','确保充足饮水防脱水'],forbidden:['禁止喂食牛奶（犬乳糖不耐受）','禁止使用人用止泻药','禁食超过24小时需兽医指导'],differential:[{disease:'细小病毒感染',differentiator:'细小病毒以血便+剧烈呕吐+白细胞下降为特征，特殊腥臭味',questions:['犬是否完成疫苗接种？','腹泻有无特殊腥臭味或带血？']}],references:['小动物内科学第5版']},
  {id:'canine-dig-004',disease:'胰腺炎',species:['犬'],category:'消化系统',primary:['剧烈呕吐','剧烈腹痛','食欲废绝'],secondary:['发热','脱水','弓背姿势','腹泻'],urgency:'critical',diagnosis:'胰腺炎是胰腺自身消化引起的炎症，常见诱因为高脂肪饮食、肥胖、某些药物。犬胰腺炎以急性呕吐+弓背祈祷姿势+上腹痛为特征。血液cPLI检测+B超可确诊。',homeCare:['立即禁食禁水（就医前）','就医后按医嘱逐步恢复饮食','长期低脂处方粮','控制体重'],forbidden:['禁止喂食任何高脂肪食物（肥肉/油炸/坚果）','禁止自行使用止痛药','禁止不经兽医指导恢复进食'],differential:[{disease:'胃扩张扭转(GDV)',differentiator:'GDV以腹部急剧胀大+干呕+休克为特征，进展极快',questions:['犬是否大型深胸犬（大丹/德牧）？','腹部是否急剧胀大如鼓？']}],references:['小动物内科学第5版']},
  {id:'canine-dig-005',disease:'肠道寄生虫感染',species:['犬'],category:'消化系统',primary:['腹泻','体重下降','食欲变化'],secondary:['呕吐','腹部胀大','被毛粗糙','贫血'],urgency:'medium',diagnosis:'常见肠道寄生虫包括蛔虫、钩虫、鞭虫、绦虫、球虫、贾第虫。粪便漂浮法镜检可确诊。幼犬感染率极高。',homeCare:['定期驱虫（幼犬每月1次，成犬每3个月1次）','清理粪便防止环境污染','注意饮食卫生','保持环境清洁'],forbidden:['禁止使用猫用驱虫药（部分成分对犬有毒）','禁止自行增加驱虫药剂量'],differential:[{disease:'细小病毒感染',differentiator:'细小病毒发病更急、症状更重，疫苗未完成的幼犬高发',questions:['犬是否完成疫苗接种？','有无血便？']}],references:['小动物寄生虫学']},
  {id:'canine-dig-006',disease:'胃扩张扭转(GDV)',species:['犬'],category:'消化系统',primary:['腹部急剧胀大','干呕（吐不出）','呼吸困难'],secondary:['休克','牙龈苍白','虚脱','流涎'],urgency:'critical',diagnosis:'GDV是大型深胸犬的致命急症，胃部扭转导致气体和液体无法排出，血液循环受阻。发病数小时内可致死。立即手术是唯一治疗方式。',homeCare:['⚠️ 此为致命急症，以下仅供就医前参考：','立即送往最近24小时宠物医院','路途中避免按压腹部','不要尝试自行放气或催吐'],forbidden:['禁止等待观察——GDV数小时可致死','禁止自行放气','禁止催吐'],differential:[{disease:'单纯胃胀气',differentiator:'单纯胃胀气犬仍能打嗝/放屁，腹部触诊较软，无休克体征',questions:['犬能否打嗝或放屁？','精神状态是否急剧恶化？']}],references:['小动物急诊医学']},
  {id:'canine-dig-007',disease:'食物过敏',species:['犬'],category:'消化系统',primary:['慢性腹泻','皮肤瘙痒','慢性耳炎'],secondary:['呕吐','软便','舔脚','肛门腺炎'],urgency:'low',diagnosis:'犬食物过敏是对食物中特定蛋白质的不良免疫反应。常见过敏原包括牛肉、鸡肉、乳制品、小麦、大豆。诊断金标准为食物排除试验（8-12周水解蛋白或新型蛋白饮食）。',homeCare:['严格食物排除试验（仅喂兽医指定的水解蛋白粮）','严禁任何零食/人食','记录每日症状变化','排除试验后逐步添加单一蛋白确认过敏原'],forbidden:['禁止在排除试验期间喂任何零食','禁止自行更换食物（需兽医指导）','禁止使用未经认证的低敏粮（标注"低敏"不一定真正低敏）'],differential:[{disease:'IBD（炎性肠病）',differentiator:'IBD对食物排除试验反应差，需激素/免疫抑制剂治疗；肠镜+活检可鉴别',questions:['食物排除试验8周后症状有无改善？']}],references:['小动物皮肤病学']},
  {id:'canine-dig-008',disease:'巨食道症',species:['犬'],category:'消化系统',primary:['反流（非呕吐）','体重下降','吞咽困难'],secondary:['咳嗽（吸入性肺炎）','口臭','发育迟缓（幼犬）'],urgency:'medium',diagnosis:'巨食道症是食道扩张和蠕动减弱导致的疾病，食物无法正常进入胃部。可为先天性（幼犬）或获得性（成年犬，常伴发重症肌无力）。X光钡餐造影可确诊。',homeCare:['采用"贝利椅"姿势喂食（竖直进食）','喂食后保持竖直姿势15-20分钟','喂食流质或半流质食物','少量多餐'],forbidden:['禁止平卧位喂食','禁止使用普通碗喂食（需高台或贝利椅）'],differential:[{disease:'食道异物',differentiator:'异物急性发作，突然无法吞咽；内镜可确诊并取出',questions:['症状是突然出现还是逐渐加重？']}],references:['小动物内科学第5版']},

  // === 泌尿系统 ===
  {id:'canine-uro-002',disease:'膀胱炎',species:['犬'],category:'泌尿系统',primary:['尿频','排尿疼痛','血尿'],secondary:['乱尿','舔舐生殖器','尿液浑浊'],urgency:'medium',diagnosis:'膀胱炎是膀胱黏膜的炎症，分为细菌性（最常见）和非细菌性（结石刺激/药物/肿瘤）。尿液分析+细菌培养+B超可确诊。',homeCare:['鼓励多饮水','增加排尿次数（多遛）','按处方完成全程抗生素','注意外阴清洁'],forbidden:['禁止自行使用抗生素','禁止憋尿（长时间不遛）','禁止使用人用泌尿道药物'],differential:[{disease:'膀胱结石',differentiator:'结石可通过X光/B超确诊；血尿更明显，可能排尿中断',questions:['排尿是否时断时续？']}],references:['小动物泌尿系统疾病学']},
  {id:'canine-uro-003',disease:'膀胱结石',species:['犬'],category:'泌尿系统',primary:['血尿','排尿困难','尿频'],secondary:['排尿疼痛','乱尿','尿流中断'],urgency:'high',diagnosis:'犬膀胱结石常见类型为鸟粪石（磷酸铵镁）和草酸钙结石。与饮食、尿液pH值、遗传、感染相关。X光/B超可确诊。鸟粪石可通过处方粮溶解，草酸钙需手术取出。',homeCare:['按兽医指导喂泌尿道处方粮','保证充足饮水稀释尿液','增加排尿次数','定期复查B超监测结石变化'],forbidden:['禁止自行添加维生素C（草酸钙结石患者禁用）','禁止喂食高钙食物','禁止不按处方粮要求随意喂食'],differential:[{disease:'膀胱肿瘤',differentiator:'肿瘤多见于老年犬，血尿持续不退，抗生素治疗无效；B超可见占位',questions:['犬年龄多大？','抗生素治疗后血尿是否好转？']}],references:['小动物泌尿系统疾病学']},
  {id:'canine-uro-004',disease:'急性肾衰竭',species:['犬'],category:'泌尿系统',primary:['少尿或无尿','呕吐','精神萎靡'],secondary:['食欲下降','口臭','口腔溃疡','腹泻'],urgency:'critical',diagnosis:'急性肾衰竭是肾功能急剧下降，常见病因包括中毒（防冻液/葡萄/某些药物）、感染（钩端螺旋体）、缺血（休克/脱水）。血液生化（BUN/Crea急剧升高）+尿检+影像学可确诊。',homeCare:['⚠️ 此为致命急症：立即就医','就医前不要自行灌水','记录近期可能接触的毒物','住院进行静脉输液治疗'],forbidden:['禁止自行大量灌水（无尿时加重体液负荷）','禁止使用肾毒性药物（NSAIDs/氨基糖苷类抗生素）'],differential:[{disease:'慢性肾衰竭',differentiator:'慢性肾衰竭病程长、渐进性，常伴消瘦、多饮多尿史；急性肾衰突然发作',questions:['犬之前有无多饮多尿的症状？','症状是突然出现还是逐渐加重？']}],references:['小动物泌尿系统疾病学']},
  {id:'canine-uro-005',disease:'慢性肾衰竭',species:['犬'],category:'泌尿系统',primary:['多饮多尿','食欲下降','体重下降'],secondary:['呕吐','口臭','口腔溃疡','被毛粗糙'],urgency:'high',diagnosis:'慢性肾衰竭是肾单位进行性不可逆损失，常见于老年犬。早期仅多饮多尿，后期出现尿毒症症状。血液生化（BUN/Crea升高）+尿比重下降+SDMA升高可确诊。IRIS分期指导治疗。',homeCare:['肾脏处方粮（低磷、优质蛋白）','保证全天充足饮水','定期监测血压','每3-6个月复查肾功能','皮下补液（按兽医指导）'],forbidden:['禁止喂食高磷食物（内脏/骨头/蛋黄）','禁止使用肾毒性药物','禁止不控制蛋白质摄入'],differential:[{disease:'糖尿病',differentiator:'糖尿病多饮多尿+体重下降+食欲增加，血糖显著升高',questions:['犬食欲是否反而增加？']}],references:['IRIS慢性肾病诊疗指南']},

  // === 呼吸系统 ===
  {id:'canine-resp-003',disease:'气管塌陷',species:['犬'],category:'呼吸系统',primary:['特征性鹅鸣样咳嗽','呼吸困难','运动不耐受'],secondary:['发绀','昏厥'],urgency:'high',diagnosis:'气管塌陷是气管软骨环薄弱导致气管管腔塌陷，多见于小型犬（约克夏/博美/吉娃娃/贵宾）。激动/运动/颈部压迫时加重。X光（吸气相+呼气相）+气管镜可确诊。',homeCare:['改用胸背带代替颈圈','控制体重','避免高温高湿环境','减少兴奋/运动','使用加湿器'],forbidden:['禁止使用颈圈（改用胸背带）','禁止在高温天气遛狗','禁止让犬过度兴奋'],differential:[{disease:'犬窝咳',differentiator:'窝咳有接触史、群居环境发病，无呼吸困难和运动不耐受',questions:['犬近期是否去过寄养/美容/犬舍？']}],references:['小动物呼吸系统疾病学']},
  {id:'canine-resp-004',disease:'短头综合征',species:['犬'],category:'呼吸系统',primary:['打鼾','呼吸困难','运动不耐受'],secondary:['张口呼吸','发绀','反流','中暑倾向'],urgency:'high',diagnosis:'短头综合征是短头品种犬（法斗/英斗/巴哥/波士顿梗）因解剖结构异常（狭窄鼻孔+软腭过长+喉囊外翻）导致的上呼吸道阻塞综合征。严重者需手术矫正。',homeCare:['控制体重','避免高温高湿环境','使用空调','避免剧烈运动','考虑手术治疗（鼻孔扩大+软腭切除）'],forbidden:['禁止夏季高温时段出门','禁止强迫运动','禁止长距离遛狗'],differential:[{disease:'喉麻痹',differentiator:'喉麻痹多见于老年大型犬，吸气时有特征性喘鸣音',questions:['犬是否为老年大型犬？']}],references:['小动物呼吸系统疾病学']},
  {id:'canine-resp-005',disease:'肺水肿',species:['犬'],category:'呼吸系统',primary:['呼吸困难','呼吸急促','咳嗽（湿咳）'],secondary:['发绀','泡沫样痰液','坐姿呼吸'],urgency:'critical',diagnosis:'肺水肿是肺毛细血管内液体渗入肺泡和肺间质，最常见原因为心源性（左心衰竭）。非心源性原因包括电击、中毒、低蛋白血症。X光+心脏B超可鉴别心源性与非心源性。',homeCare:['⚠️ 此为急症，立即就医','就医前保持犬安静坐姿','吸氧治疗','按兽医处方使用利尿剂和强心药'],forbidden:['禁止灌水','禁止让犬平躺','禁止剧烈运动'],differential:[{disease:'肺炎',differentiator:'肺炎常伴发热、白细胞升高；肺水肿发病更快，X光呈蝴蝶状阴影',questions:['犬是否有心脏病史？','发病是否非常突然？']}],references:['小动物急诊医学']},

  // === 心血管 ===
  {id:'canine-cardio-001',disease:'二尖瓣关闭不全',species:['犬'],category:'心血管',primary:['咳嗽','运动不耐受','呼吸困难'],secondary:['夜间不安','昏厥','腹围增大'],urgency:'high',diagnosis:'二尖瓣关闭不全是犬最常见的心脏病，小型老年犬（骑士查理王小猎犬/贵宾/吉娃娃）高发。二尖瓣退行性病变导致血液反流→左心房扩大→肺水肿。心脏听诊（心杂音）+B超可确诊。',homeCare:['低钠饮食','适度运动（不过度）','控制体重','定期心脏B超复查','按医嘱服用ACEI/匹莫苯丹等'],forbidden:['禁止高盐食物','禁止剧烈运动','禁止自行停药'],differential:[{disease:'扩张型心肌病(DCM)',differentiator:'DCM多见于大型犬（杜宾/拳师/大丹），以心脏扩大+收缩功能下降为特征',questions:['犬是否为大型犬？']}],references:['ACVIM心脏病诊疗共识']},
  {id:'canine-cardio-002',disease:'扩张型心肌病(DCM)',species:['犬'],category:'心血管',primary:['运动不耐受','呼吸困难','咳嗽'],secondary:['昏厥','腹围增大（腹水）','体重下降'],urgency:'critical',diagnosis:'DCM是心肌收缩功能下降导致心脏扩大和心力衰竭，多见于大型犬（杜宾/拳师/大丹/爱尔兰猎狼犬）。部分与无谷粮相关（牛磺酸缺乏）。心脏B超+Holter可确诊。',homeCare:['严格限制运动','低钠饮食','按医嘱服用强心药和利尿剂','定期心脏B超+Holter复查'],forbidden:['禁止高盐食物','禁止剧烈运动','禁止自行停药'],differential:[{disease:'二尖瓣关闭不全',differentiator:'二尖瓣病常见心杂音更响（≥3/6级），B超可见二尖瓣反流而非心肌变薄',questions:['犬是否为小型老年犬？','心杂音等级？']}],references:['ACVIM心脏病诊疗共识']},
  {id:'canine-cardio-003',disease:'心丝虫病',species:['犬'],category:'心血管',primary:['咳嗽','运动不耐受','呼吸困难'],secondary:['体重下降','昏厥','腹水','咳血'],urgency:'high',diagnosis:'心丝虫（Dirofilaria immitis）经蚊虫叮咬传播，成虫寄生于肺动脉和右心室。抗原检测+血液微丝蚴镜检可确诊。',homeCare:['定期使用心丝虫预防药（每月1次）','治疗期间严格限制运动（防止虫体栓塞）','按兽医方案进行成虫杀灭治疗','治疗后3-6个月复查抗原'],forbidden:['禁止未经预防直接去蚊虫多发区','禁止治疗期间运动（虫体死亡栓塞风险）','禁止自行使用杀虫药'],differential:[{disease:'肺动脉高压',differentiator:'肺动脉高压无心丝虫抗原阳性，B超可见肺动脉压升高但无虫体影像',questions:['犬是否在使用心丝虫预防药？','是否去过心丝虫疫区？']}],references:['美国心丝虫协会诊疗指南']},

  // === 皮肤科 ===
  {id:'canine-derm-001',disease:'特应性皮炎',species:['犬'],category:'皮肤科',primary:['剧烈瘙痒','皮肤红斑','脱毛'],secondary:['慢性耳炎','舔脚','皮肤增厚','色素沉着'],urgency:'low',diagnosis:'特应性皮炎是遗传性过敏体质对环境过敏原（尘螨/花粉/霉菌）的过敏反应。多发于特定品种（金毛/拉布拉多/斗牛犬/西高地）。排除其他瘙痒原因后+皮内过敏试验可诊断。',homeCare:['定期洗澡（兽医推荐抗过敏香波）','环境控制（空气净化器/勤换洗窝垫）','Omega-3脂肪酸补充','避免已知过敏原'],forbidden:['禁止使用人用抗过敏药','禁止频繁洗澡（破坏皮肤屏障）','禁止不处理继发感染（细菌/马拉色菌）'],differential:[{disease:'食物过敏',differentiator:'食物过敏常伴消化道症状（腹泻/软便），对食物排除试验有反应',questions:['瘙痒是否伴有消化道症状？','瘙痒是否四季持续性（非季节性）？']}],references:['小动物皮肤病学']},
  {id:'canine-derm-002',disease:'脓皮症',species:['犬'],category:'皮肤科',primary:['皮肤脓疱','红斑','瘙痒'],secondary:['脱毛','结痂','皮屑','异味'],urgency:'medium',diagnosis:'犬脓皮症是皮肤细菌感染（最常见为假中间型葡萄球菌），多为继发性（过敏/寄生虫/内分泌病基础上发生）。皮肤细胞学（压片染色镜检）可快速诊断。',homeCare:['按处方完成全程抗生素（至少3-4周）','抗菌香波定期洗澡','查找并控制原发病（过敏/内分泌）','保持皮肤干燥清洁'],forbidden:['禁止自行使用人用抗生素药膏','禁止抗生素疗程不足自行停药','禁止不处理原发病因'],differential:[{disease:'蠕形螨病',differentiator:'蠕形螨多见于幼犬或免疫低下犬，深部皮肤刮片可见大量蠕形螨',questions:['犬年龄多大？','有无做过皮肤刮片检查？']}],references:['小动物皮肤病学']},
  {id:'canine-derm-003',disease:'蠕形螨病',species:['犬'],category:'皮肤科',primary:['脱毛（斑片状）','皮肤红斑','皮屑'],secondary:['瘙痒（继发感染时）','皮肤增厚','色素沉着'],urgency:'medium',diagnosis:'蠕形螨（Demodex canis）寄生于毛囊内，幼犬型与遗传免疫缺陷相关，成年型常伴发严重全身性疾病。深部皮肤刮片镜检可见大量虫体。',homeCare:['按兽医处方使用伊维菌素/米尔贝肟/氟雷拉纳等','定期药浴','补充营养增强免疫力','治疗期间定期皮肤刮片复查'],forbidden:['禁止自行停药（需连续两次阴性刮片）','禁止使用激素类药膏（可能加重）','禁止不排查成年型蠕形螨的潜在病因'],differential:[{disease:'皮肤真菌病（癣菌）',differentiator:'癣菌呈圆形脱毛斑，边缘红肿，Wood灯+真菌培养可鉴别',questions:['脱毛区域是否呈圆形？','家中其他宠物或人是否有类似皮损？']}],references:['小动物皮肤病学']},

  // === 传染病 ===
  {id:'canine-inf-001',disease:'犬细小病毒感染',species:['犬'],category:'传染病',primary:['剧烈呕吐','血便（番茄酱样）','精神极度萎靡'],secondary:['食欲废绝','高热或低体温','脱水','白细胞显著下降'],urgency:'critical',diagnosis:'犬细小病毒（CPV）是高度传染性病毒病，主要侵害肠道上皮和骨髓，未接种疫苗的幼犬高发。特征性番茄酱样腥臭血便+白细胞骤降。CPV快速试纸+PCR可确诊。',homeCare:['⚠️ 此为致命急症，需立即住院治疗','严格隔离病犬（病毒在环境中存活数月）','彻底消毒环境（含氯消毒剂）','未感染犬紧急接种疫苗'],forbidden:['禁止自行喂食喂水（需静脉输液）','禁止与其他犬接触','禁止使用人用止吐药'],differential:[{disease:'犬冠状病毒感染',differentiator:'冠状病毒症状较轻，通常无血便或仅少量血丝，白细胞下降不明显',questions:['犬是否完成疫苗接种？']}],references:['小动物传染病学']},
  {id:'canine-inf-002',disease:'犬瘟热',species:['犬'],category:'传染病',primary:['双相热（发热→退→再发热）','呼吸道症状','神经症状'],secondary:['眼鼻脓性分泌物','咳嗽','呕吐腹泻','角化过度（鼻垫/脚垫硬）','抽搐'],urgency:'critical',diagnosis:'犬瘟热病毒（CDV）是高度致死性病毒病，侵害呼吸、消化、神经系统。未接种疫苗的幼犬高发。PCR+抗体检测可确诊。存活犬常有后遗症（抽搐/舞蹈症/牙釉质发育不良）。',homeCare:['⚠️ 需立即住院隔离治疗','对症支持治疗（输液/抗生素防继发感染/抗抽搐）','严格隔离','彻底消毒环境'],forbidden:['禁止与其他犬接触','禁止放弃治疗（但需了解预后差）'],differential:[{disease:'狂犬病',differentiator:'狂犬病以行为改变+恐水+流涎+攻击性为特征，国内报告后需依法上报',questions:['犬是否接种过狂犬疫苗？','有无被其他动物咬伤史？']}],references:['小动物传染病学']},
  {id:'canine-inf-003',disease:'钩端螺旋体病',species:['犬'],category:'传染病',primary:['高热','呕吐','黄疸'],secondary:['少尿或无尿','出血倾向','肌肉疼痛','结膜炎'],urgency:'critical',diagnosis:'钩端螺旋体是人畜共患病，经感染动物尿液污染的水源传播（鼠类为主要宿主）。引起急性肝肾衰竭+出血倾向。PCR+血清抗体检测可确诊。可传染给人。',homeCare:['⚠️ 需立即住院治疗','抗生素治疗（多西环素/氨苄西林）','静脉输液+肝肾支持','接触患犬尿液时戴手套','人感染风险——如有发热需就医告知接触史'],forbidden:['禁止接触患犬尿液（人畜共患）','禁止让患犬随地排尿'],differential:[{disease:'免疫介导性溶血性贫血',differentiator:'IMHA以贫血+黄疸为主，无明显肝肾指标升高及出血倾向',questions:['犬有无接触老鼠或污染水源？']}],references:['小动物传染病学','人畜共患病防控指南']},

  // === 寄生虫 ===
  {id:'canine-par-001',disease:'犬蛔虫病',species:['犬'],category:'寄生虫',primary:['腹泻','呕吐','腹部胀大'],secondary:['体重下降','被毛粗糙','咳嗽（幼虫移行）'],urgency:'medium',diagnosis:'犬蛔虫（Toxocara canis）是常见肠道寄生虫，幼犬感染率极高（可经胎盘和乳汁传播）。成虫可在粪便中肉眼可见（白色长条状）。粪便漂浮法镜检可确诊。具有人畜共患风险（幼虫移行症）。',homeCare:['幼犬2/4/6/8周龄各驱虫1次，后每月1次至6月龄','成犬每3个月驱虫1次','及时清理粪便','接触后洗手（人畜共患）'],forbidden:['禁止使用猫用驱虫药','禁止不按时驱虫'],differential:[{disease:'钩虫病',differentiator:'钩虫以贫血为突出特征，粪便镜检可见不同形态虫卵',questions:['犬有无贫血症状（牙龈苍白）？']}],references:['小动物寄生虫学']},
  {id:'canine-par-002',disease:'犬钩虫病',species:['犬'],category:'寄生虫',primary:['贫血（牙龈苍白）','腹泻（可能黑便）','体重下降'],secondary:['虚弱','被毛粗糙','皮炎（幼虫钻入皮肤）'],urgency:'high',diagnosis:'犬钩虫（Ancylostoma caninum）吸附于小肠黏膜吸血，导致严重缺铁性贫血。幼犬感染可致命。粪便漂浮法镜检虫卵可确诊。',homeCare:['定期驱虫','严重贫血需输血','补充铁剂','保持环境干燥（虫卵在潮湿环境孵化）'],forbidden:['禁止对严重贫血犬不做驱虫','禁止不处理环境（虫卵可在土壤中存活数周）'],differential:[{disease:'跳蚤感染导致的贫血',differentiator:'跳蚤贫血多见于幼犬，体表可见大量跳蚤和跳蚤粪便',questions:['犬体表有无大量跳蚤？']}],references:['小动物寄生虫学']},
  {id:'canine-par-003',disease:'犬蜱虫病（巴贝斯虫病）',species:['犬'],category:'寄生虫',primary:['高热','贫血','黄疸'],secondary:['血红蛋白尿（酱油色尿）','精神萎靡','食欲废绝','脾脏肿大'],urgency:'critical',diagnosis:'巴贝斯虫经蜱虫叮咬传播，寄生于红细胞内导致溶血性贫血。血液涂片镜检+PCR可确诊。',homeCare:['⚠️ 需立即就医','抗巴贝斯虫药物（三氮脒/阿托伐醌+阿奇霉素）','严重贫血需输血','定期使用体外驱虫药防蜱'],forbidden:['禁止不用体外驱虫药（预防蜱虫）','禁止延误治疗（严重溶血可致死）'],differential:[{disease:'免疫介导性溶血性贫血(IMHA)',differentiator:'IMHA无蜱虫接触史，库姆斯试验阳性，无寄生虫血涂片发现',questions:['犬有无被蜱虫叮咬史？']}],references:['小动物寄生虫学']},

  // === 内分泌 ===
  {id:'canine-endo-001',disease:'糖尿病',species:['犬'],category:'内分泌',primary:['多饮多尿','食欲增加','体重下降'],secondary:['白内障','反复尿路感染','被毛粗糙'],urgency:'high',diagnosis:'犬糖尿病多为胰岛素依赖型（类似人1型），因胰岛β细胞破坏导致胰岛素绝对缺乏。血糖持续升高+果糖胺升高+尿糖阳性可确诊。',homeCare:['每日定时胰岛素注射（兽医处方）','固定时间和量的糖尿病处方粮','定期血糖监测（血糖曲线）','控制体重','预防低血糖'],forbidden:['禁止随意改变胰岛素剂量','禁止不按处方粮喂食','禁止不规律进食（可能导致低血糖）'],differential:[{disease:'库兴氏综合征',differentiator:'库兴氏多饮多尿+食欲增加，但体重不降（甚至增加），腹部膨大，皮肤变薄',questions:['犬有无对称性脱毛和腹部膨大？']}],references:['小动物内分泌学']},
  {id:'canine-endo-002',disease:'库兴氏综合征',species:['犬'],category:'内分泌',primary:['多饮多尿','食欲增加','腹部膨大'],secondary:['对称性脱毛','皮肤变薄','反复感染','肌肉萎缩'],urgency:'medium',diagnosis:'库兴氏综合征（肾上腺皮质功能亢进）因糖皮质激素过量分泌引起。分为垂体依赖型（85%）和肾上腺肿瘤型（15%）。ACTH刺激试验+低剂量地塞米松抑制试验可确诊。',homeCare:['按医嘱服用曲洛司坦/米托坦','定期ACTH刺激试验监测药效','控制饮水和饮食','监测皮肤感染'],forbidden:['禁止自行调整药物剂量','禁止不监测（药物过量可导致Addison危象）'],differential:[{disease:'糖尿病',differentiator:'糖尿病血糖显著升高+尿糖阳性+体重下降，库兴氏体重不降',questions:['犬有无白内障？血糖是否升高？']}],references:['小动物内分泌学']},
  {id:'canine-endo-003',disease:'甲状腺功能减退',species:['犬'],category:'内分泌',primary:['嗜睡','体重增加','对称性脱毛'],secondary:['皮肤干燥','怕冷','心率减慢','不育'],urgency:'low',diagnosis:'甲状腺功能减退是犬最常见的内分泌病，因甲状腺激素分泌不足引起。多见于中型犬（金毛/杜宾/可卡）。TT4+FT4+TSH检测可确诊。',homeCare:['终身服用左甲状腺素','定期监测TT4调整剂量','控制体重','皮肤护理'],forbidden:['禁止自行停药（需终身服药）','禁止不监测血药浓度'],differential:[{disease:'库兴氏综合征',differentiator:'库兴氏多饮多尿+皮肤薄，甲减嗜睡+怕冷+皮肤干厚',questions:['犬是怕冷还是多饮多尿？']}],references:['小动物内分泌学']},

  // === 骨骼肌肉 ===
  {id:'canine-msk-001',disease:'髋关节发育不良',species:['犬'],category:'骨骼肌肉',primary:['后肢跛行','起立困难','运动不耐受'],secondary:['肌肉萎缩（后肢）','关节弹响','兔子跳步态'],urgency:'medium',diagnosis:'髋关节发育不良是股骨头与髋臼吻合不良导致的退行性关节病，大型犬（金毛/德牧/拉布拉多）高发。遗传+环境因素共同作用。X光（PennHIP或OFA标准）可确诊。',homeCare:['控制体重','适度低冲击运动（游泳/散步）','关节营养补充（葡萄糖胺/软骨素/Omega-3）','物理治疗','严重者考虑髋关节置换术'],forbidden:['禁止过度运动（跑跳/爬楼梯）','禁止肥胖','禁止使用人用止痛药'],differential:[{disease:'前十字韧带断裂',differentiator:'十字韧带断裂为急性跛行，关节不稳定+抽屉征阳性',questions:['跛行是急性发作还是慢性渐进？']}],references:['小动物骨科学']},
  {id:'canine-msk-002',disease:'前十字韧带断裂',species:['犬'],category:'骨骼肌肉',primary:['急性后肢跛行','不敢着地','关节肿胀'],secondary:['关节弹响','肌肉萎缩（慢性）'],urgency:'high',diagnosis:'前十字韧带（CrCL）断裂是犬最常见膝关节损伤，肥胖中型犬高发。可部分或完全断裂。抽屉征（胫骨前移）+胫骨加压试验+X光可确诊。通常需手术治疗（TPLO/TTA/关节囊外固定）。',homeCare:['严格限制运动','术后按兽医指导逐步康复','控制体重','关节营养补充','物理治疗'],forbidden:['禁止不治疗（将发展为严重关节炎）','禁止术后过早运动','禁止肥胖'],differential:[{disease:'髌骨脱位',differentiator:'髌骨脱位以间歇性跛行+跳跃步态为特征，小型犬更常见',questions:['犬是否为小型犬？','跛行是否间歇性发作？']}],references:['小动物骨科学']},
  {id:'canine-msk-003',disease:'髌骨脱位',species:['犬'],category:'骨骼肌肉',primary:['间歇性跛行','跳跃步态（兔子跳）','后肢抬起'],secondary:['关节弹响','肌肉萎缩'],urgency:'medium',diagnosis:'髌骨脱位是髌骨从滑车沟脱出，小型犬（贵宾/吉娃娃/博美/约克夏）高发。多为内侧脱位（MPL）。触诊+X光可确诊并分级（I-IV级）。',homeCare:['控制体重','关节营养补充','避免跳跃','III-IV级需手术治疗'],forbidden:['禁止让犬用后腿直立','禁止肥胖','禁止过度跳跃（沙发/楼梯）'],differential:[{disease:'前十字韧带断裂',differentiator:'十字韧带断裂关节不稳明显，抽屉征阳性；髌骨脱位可触到脱出的髌骨',questions:['触诊膝关节时髌骨是否可被推出？']}],references:['小动物骨科学']},

  // === 产科 ===
  {id:'canine-repro-001',disease:'子宫蓄脓',species:['犬'],category:'产科',primary:['多饮多尿','阴道分泌物（脓性/血性）','食欲下降'],secondary:['腹部胀大','发热','呕吐','精神萎靡'],urgency:'critical',diagnosis:'子宫蓄脓是中老年未绝育母犬的常见急症，发生于发情后4-8周（黄体期）。分为开放型（有分泌物）和闭锁型（无分泌物，更危险）。血常规+CRP+B超可确诊。卵巢子宫切除术是首选治疗。',homeCare:['⚠️ 此为致命急症，需立即就医','尽快手术（卵巢子宫切除术）','术前稳定体况（输液+抗生素）','术后按医嘱护理'],forbidden:['禁止等待观察——闭锁型子宫蓄脓可致子宫破裂+败血症','禁止对未绝育母犬不做预防（建议早期绝育）'],differential:[{disease:'正常妊娠',differentiator:'妊娠无发热、无脓性分泌物、无白细胞升高；B超可见胎儿而非子宫积脓',questions:['母犬是否绝育？','上次发情是什么时候？']}],references:['小动物产科与繁殖学']},
  {id:'canine-repro-002',disease:'难产',species:['犬'],category:'产科',primary:['努责超过30分钟无胎儿娩出','超过预产期','绿色/黑色分泌物无胎儿娩出'],secondary:['虚弱','发热','休克'],urgency:'critical',diagnosis:'难产原因包括母体因素（子宫收缩无力/骨盆狭窄）和胎儿因素（胎儿过大/胎位不正/死胎）。距上次分娩超过2-4小时未继续分娩需警惕。X光/B超评估胎儿数量和状态。',homeCare:['⚠️ 立即前往24小时宠物医院','可能需要剖腹产','路途中保持母犬安静','不要自行助产'],forbidden:['禁止自行用手助产（可能造成子宫破裂或感染）','禁止等待观察超过2小时','禁止使用催产素（需兽医判断）'],differential:[{disease:'正常分娩',differentiator:'正常分娩应有规律宫缩，每个胎儿间隔不超过2小时',questions:['距上一只胎儿娩出已过多久？','母犬是否仍有规律宫缩？']}],references:['小动物产科与繁殖学']},

  // === 中毒 ===
  {id:'canine-tox-001',disease:'巧克力中毒',species:['犬'],category:'中毒',primary:['呕吐','腹泻','兴奋/焦躁'],secondary:['心率加快','肌肉震颤','抽搐','心律失常'],urgency:'critical',diagnosis:'巧克力中的可可碱和咖啡因对犬有毒。黑巧克力/可可粉毒性最强，白巧克力毒性最低。中毒剂量因体重和巧克力类型而异。详细计算摄入可可碱量+临床症状可诊断。',homeCare:['⚠️ 立即就医（2小时内可催吐）','记录巧克力类型、数量、摄入时间','活性炭吸附（兽医操作）','静脉输液加速排泄','控制抽搐'],forbidden:['禁止等待观察','禁止自行催吐（过晚或误吸风险）','禁止给犬任何巧克力类食物'],differential:[{disease:'其他兴奋性中毒（安非他命/咖啡因）',differentiator:'依靠主人提供的摄入史区分',questions:['犬吃了什么类型巧克力？吃了多少？多久前吃的？']}],references:['小动物毒理学']},
  {id:'canine-tox-002',disease:'洋葱/大蒜中毒',species:['犬'],category:'中毒',primary:['溶血性贫血','牙龈苍白','虚弱'],secondary:['血红蛋白尿（酱油色尿）','呕吐','腹泻','呼吸急促'],urgency:'critical',diagnosis:'洋葱和大蒜中的硫代硫酸盐可导致犬氧化性溶血性贫血（海因茨小体溶血）。中毒剂量：洋葱>15-30g/kg，大蒜>5g/kg。熟洋葱/大蒜同样有毒。血涂片（海因茨小体）+血常规可确诊。',homeCare:['⚠️ 立即就医','停止接触洋葱/大蒜','严重贫血需输血','抗氧化剂治疗（维生素E/C）','静脉输液'],forbidden:['禁止喂食任何含洋葱/大蒜的食物','禁止给犬吃人类剩菜'],differential:[{disease:'免疫介导性溶血性贫血',differentiator:'IMHA无洋葱/大蒜接触史，库姆斯试验阳性',questions:['犬有无吃洋葱/大蒜或含这些成分的人类食物？']}],references:['小动物毒理学']},
  {id:'canine-tox-003',disease:'葡萄/葡萄干中毒',species:['犬'],category:'中毒',primary:['呕吐','腹泻','精神萎靡'],secondary:['食欲下降','腹痛','少尿或无尿（急性肾衰竭）'],urgency:'critical',diagnosis:'葡萄和葡萄干可导致犬急性肾衰竭，毒素机制不明但毒性已被证实。中毒剂量差异大（2.8-36.4g/kg）。摄入后24-72小时出现肾衰竭症状。血液生化（BUN/Crea急剧升高）可确诊。',homeCare:['⚠️ 立即就医（摄入2小时内催吐）','活性炭吸附','静脉输液利尿（保护肾脏）','监测肾功能72小时'],forbidden:['禁止给犬喂任何葡萄/葡萄干','禁止等待症状出现再就医（肾损伤不可逆）'],differential:[{disease:'其他原因急性肾衰竭',differentiator:'依靠摄入史区分；葡萄中毒无特定解毒剂，治疗为支持性',questions:['犬是否吃了葡萄或葡萄干？吃了多少？多久前？']}],references:['小动物毒理学']},
]

// ===================== 猫疾病 =====================
const CAT_DISEASES: DiseaseDef[] = [
  // === 消化系统 ===
  {id:'feline-dig-002',disease:'猫慢性肠病(IBD)',species:['猫'],category:'消化系统',primary:['慢性腹泻','呕吐','体重下降'],secondary:['食欲变化（增加或下降）','软便','被毛粗糙'],urgency:'medium',diagnosis:'猫IBD是肠道黏膜慢性炎症细胞浸润，病因可能与食物过敏、肠道菌群失调、免疫异常相关。需排除其他病因（寄生虫/甲亢/淋巴瘤）。肠道全层活检是诊断金标准。',homeCare:['食物排除试验（水解蛋白或新型蛋白）','维生素B12补充（IBD猫常缺乏）','益生菌','严重者需激素/免疫抑制剂（遵医嘱）'],forbidden:['禁止频繁更换食物','禁止不排除寄生虫就诊断为IBD'],differential:[{disease:'肠道淋巴瘤',differentiator:'淋巴瘤多见于老年猫，体重下降更明显，肠道活检可鉴别（但有时与IBD难以区分）',questions:['猫年龄多大？','有无做过肠道活检？']}],references:['猫病学第4版']},
  {id:'feline-dig-003',disease:'毛球症',species:['猫'],category:'消化系统',primary:['呕吐（含毛球）','干呕','食欲下降'],secondary:['便秘','精神萎靡','腹部不适'],urgency:'medium',diagnosis:'猫在理毛时吞入毛发，正常情况下可随粪便排出或偶尔吐出。当毛球积聚过多无法排出时导致毛球症，严重者可致肠梗阻。',homeCare:['定期梳理毛发（减少吞入）','使用化毛膏或化毛粮','增加饮水和纤维摄入','严重便秘需就医'],forbidden:['禁止使用人用泻药','禁止不处理——大量毛球可致肠梗阻'],differential:[{disease:'肠梗阻（异物）',differentiator:'异物梗阻呕吐更剧烈、完全不食，X光/B超可鉴别',questions:['猫有无玩线绳/橡皮筋等异物的习惯？']}],references:['猫病学第4版']},
  {id:'feline-dig-004',disease:'猫脂肪肝',species:['猫'],category:'消化系统',primary:['食欲废绝','体重急剧下降','黄疸'],secondary:['呕吐','精神萎靡','脱水','肝肿大'],urgency:'critical',diagnosis:'猫脂肪肝（肝脂质沉积症）是猫最常见的肝病，通常由厌食（应激/疾病/换粮）超过3-7天触发。肥胖猫风险更高。脂肪动员过度导致肝细胞内甘油三酯大量堆积。血液生化+B超+肝脏细胞学可确诊。',homeCare:['⚠️ 此为致命急症，需立即就医','强制营养支持（鼻饲管或食道饲管）是治疗核心','逐步恢复自主进食','治疗原发病因'],forbidden:['禁止等待猫自行恢复食欲（脂肪肝会持续恶化）','禁止不经营养支持仅靠药物','禁止让肥胖猫快速节食'],differential:[{disease:'胆管肝炎',differentiator:'胆管肝炎常伴发热和腹痛，B超可见胆管扩张和胆囊壁增厚',questions:['猫有无长期厌食史？','有无黄疸？']}],references:['猫病学第4版']},

  // === 泌尿系统 ===
  {id:'feline-uro-002',disease:'猫特发性膀胱炎(FIC)',species:['猫'],category:'泌尿系统',primary:['尿频','血尿','排尿疼痛','乱尿'],secondary:['过度舔舐生殖器','在猫砂盆外排尿'],urgency:'high',diagnosis:'FIC是猫下泌尿道疾病最常见原因（占50-60%），非细菌性非结石性膀胱炎症。应激是主要诱因（环境变化/多猫冲突/缺乏环境丰富化）。排除结石和感染后诊断。公猫可能发展为尿闭。',homeCare:['环境丰富化（猫抓板/高处/藏身处/互动玩具）','增加饮水（饮水机/湿粮/多处水源）','减少应激（费洛蒙/独立空间）','泌尿道处方粮'],forbidden:['禁止惩罚乱尿行为（增加应激）','禁止忽视环境应激管理','禁止仅依赖药物治疗'],differential:[{disease:'细菌性膀胱炎',differentiator:'细菌性膀胱炎多见于老年猫/有导尿史的猫，尿液细菌培养阳性',questions:['猫年龄多大？','有无做过尿液细菌培养？']}],references:['猫下泌尿道疾病诊疗指南(ISFM/AAFP)']},
  {id:'feline-uro-003',disease:'猫慢性肾病(CKD)',species:['猫'],category:'泌尿系统',primary:['多饮多尿','食欲下降','体重下降'],secondary:['呕吐','口臭','口腔溃疡','被毛粗糙'],urgency:'high',diagnosis:'CKD是老年猫最常见慢性病之一，肾单位进行性不可逆损失。早期仅多饮多尿，后期出现尿毒症。SDMA可更早检测肾功能下降。IRIS分期指导治疗。',homeCare:['肾脏处方粮（低磷优质蛋白）','全天充足饮水','磷结合剂（遵医嘱）','控制高血压','定期复查肾功能','皮下补液（中晚期）'],forbidden:['禁止喂食高磷食物','禁止使用肾毒性药物','禁止不定期监测'],differential:[{disease:'甲亢',differentiator:'甲亢猫食欲增加但体重下降，常伴活动增加、心率快；CKD猫食欲下降',questions:['猫食欲是增加还是下降？']}],references:['IRIS慢性肾病诊疗指南']},

  // === 传染病 ===
  {id:'feline-inf-001',disease:'猫瘟（泛白细胞减少症）',species:['猫'],category:'传染病',primary:['高热','剧烈呕吐','血便'],secondary:['食欲废绝','精神极度萎靡','脱水','白细胞急剧下降'],urgency:'critical',diagnosis:'猫瘟病毒（FPV）是高度传染性细小病毒，侵害肠道上皮和骨髓。未接种疫苗的幼猫高发，致死率极高。FPV快速试纸+血常规（白细胞骤降）可诊断。',homeCare:['⚠️ 需立即住院隔离治疗','静脉输液+抗生素防继发感染','严格隔离（病毒在环境中存活长达一年）','彻底消毒（含氯消毒剂或过硫酸氢钾）'],forbidden:['禁止与其他猫接触','禁止自行喂食喂水'],differential:[{disease:'猫冠状病毒感染',differentiator:'冠状病毒症状较轻，白细胞下降不明显，病程较短',questions:['猫是否完成疫苗接种？']}],references:['猫病学第4版']},
  {id:'feline-inf-002',disease:'猫传染性腹膜炎(FIP)',species:['猫'],category:'传染病',primary:['持续发热（抗生素无效）','腹围增大（湿性）','神经症状（干性）'],secondary:['食欲下降','体重下降','黄疸','呼吸困难（胸水）','葡萄膜炎'],urgency:'critical',diagnosis:'FIP由猫冠状病毒（FCoV）突变引起，分为湿性（胸腹水）和干性（肉芽肿性病变）。曾是绝症，现有抗病毒药GS-441524可治疗。PCR+积液分析+球蛋白升高+白球比<0.6可辅助诊断。',homeCare:['GS-441524抗病毒治疗（需兽医处方，每日注射至少84天）','对症支持治疗','营养支持','定期复查'],forbidden:['禁止放弃治疗（现有有效疗法）','禁止不完成全程治疗（84天）'],differential:[{disease:'肿瘤性胸腹水',differentiator:'肿瘤性积液细胞学检查可见肿瘤细胞，无FIP特征性球蛋白升高',questions:['猫年龄多大？','有无做过积液分析？']}],references:['猫病学第4版','FIP诊疗最新进展']},
  {id:'feline-inf-003',disease:'猫艾滋病(FIV)',species:['猫'],category:'传染病',primary:['慢性口炎','体重下降','反复感染'],secondary:['发热','淋巴结肿大','贫血','慢性呼吸道感染'],urgency:'medium',diagnosis:'猫免疫缺陷病毒（FIV）经咬伤传播（深咬伤口），主要感染未绝育公猫（打斗）。ELISA快速检测+Western Blot确认。感染后潜伏期可长达数年。无法治愈，但可长期管理。',homeCare:['严格室内饲养（防止传染他猫和继发感染）','高质量饮食','定期体检（每6个月）','积极治疗任何继发感染','避免使用免疫抑制药物'],forbidden:['禁止放养（传播风险）','禁止与其他猫共用食盆水盆','禁止不处理继发感染'],differential:[{disease:'猫白血病(FeLV)',differentiator:'FeLV也可致免疫抑制，常伴肿瘤（淋巴瘤），ELISA可区分',questions:['猫有无打斗史和户外活动史？']}],references:['猫病学第4版']},

  // === 呼吸系统 ===
  {id:'feline-resp-001',disease:'猫上呼吸道感染(猫鼻支)',species:['猫'],category:'呼吸系统',primary:['打喷嚏','流鼻涕','结膜炎'],secondary:['发热','食欲下降','流口水','角膜溃疡'],urgency:'medium',diagnosis:'猫上呼吸道感染最常见病原体为猫疱疹病毒1型（FHV-1，猫鼻支）和猫杯状病毒（FCV）。多猫环境（猫舍/救助站）高发。PCR可确诊病原体。',homeCare:['隔离病猫','保持环境温暖通风','清理眼鼻分泌物','鼓励进食（加热食物增加香味）','L-赖氨酸（FHV-1辅助治疗）'],forbidden:['禁止使用人用感冒药','禁止与其他猫接触'],differential:[{disease:'猫衣原体感染',differentiator:'衣原体以结膜炎为主，呼吸道症状较轻；PCR可区分病原体',questions:['猫有无脓性眼分泌物？']}],references:['猫病学第4版']},
  {id:'feline-resp-002',disease:'猫哮喘',species:['猫'],category:'呼吸系统',primary:['阵发性咳嗽','呼吸困难','喘鸣'],secondary:['张口呼吸','运动不耐受'],urgency:'high',diagnosis:'猫哮喘是过敏性下呼吸道疾病，支气管收缩+黏液分泌增多导致气流受限。发作时呈蹲伏姿势、伸颈呼吸。X光（支气管壁增厚/过度充气）+支气管灌洗可辅助诊断。',homeCare:['环境控制（无尘猫砂/空气净化器/避免烟雾）','控制体重','按医嘱使用吸入性激素（猫专用吸入器）','急性发作需急诊吸氧+支气管扩张剂'],forbidden:['禁止使用有尘猫砂','禁止在猫周围吸烟/使用香薰/空气清新剂'],differential:[{disease:'心力衰竭',differentiator:'心衰心脏听诊异常+B超可见心脏扩大，X光可见肺水肿而非支气管壁增厚',questions:['猫有无心脏病史？']}],references:['猫病学第4版']},

  // === 内分泌 ===
  {id:'feline-endo-001',disease:'猫甲状腺功能亢进',species:['猫'],category:'内分泌',primary:['食欲增加但体重下降','多饮多尿','活动增加/焦躁'],secondary:['呕吐','腹泻','被毛粗糙','心率加快'],urgency:'high',diagnosis:'甲亢是老年猫最常见内分泌病，由良性甲状腺腺瘤过度分泌T4引起。TT4升高可确诊。治疗选择包括甲巯咪唑（口服/透皮）、放射性碘131、手术切除。',homeCare:['按医嘱服用甲巯咪唑（需监测副作用）','定期监测TT4+肾功能+血压','高质量饮食','控制心率'],forbidden:['禁止突然停药','禁止不监测肾功能（甲亢可能掩盖CKD）'],differential:[{disease:'糖尿病',differentiator:'糖尿病食欲增加但血糖升高+尿糖阳性，甲亢TT4升高',questions:['猫有无多饮多尿？血糖是否升高？']}],references:['猫病学第4版']},
  {id:'feline-endo-002',disease:'猫糖尿病',species:['猫'],category:'内分泌',primary:['多饮多尿','食欲增加或下降','体重下降'],secondary:['后肢跖行（神经病变）','反复尿路感染','白内障（较少见）'],urgency:'high',diagnosis:'猫糖尿病多为2型（胰岛素抵抗+β细胞功能下降），肥胖是主要风险因素。血糖持续升高+果糖胺升高+尿糖阳性可确诊。部分猫通过饮食管理+体重控制可缓解。',homeCare:['低碳水化合物高蛋白湿粮','每日胰岛素注射（甘精胰岛素/地特胰岛素）','定期血糖曲线监测','控制体重','部分猫可经饮食管理达到糖尿病缓解'],forbidden:['禁止喂食干粮（碳水过高）','禁止随意改变胰岛素剂量'],differential:[{disease:'甲亢',differentiator:'甲亢猫活动增加、心率快，TT4升高；糖尿病以高血糖+尿糖为特征',questions:['猫有无做过甲状腺检查？']}],references:['猫病学第4版']},

  // === 皮肤科 ===
  {id:'feline-derm-001',disease:'猫癣菌病',species:['猫'],category:'皮肤科',primary:['圆形脱毛斑','皮屑','红斑'],secondary:['瘙痒','结痂','甲沟炎'],urgency:'medium',diagnosis:'猫癣菌病多为犬小孢子菌（Microsporum canis）感染，幼猫和免疫低下猫高发。具有人畜共患风险。Wood灯（部分菌株荧光）+真菌培养+毛发镜检可确诊。',homeCare:['抗真菌药浴（咪康唑/氯己定香波）','口服抗真菌药（伊曲康唑/特比萘芬）','环境彻底消毒（吸尘+次氯酸钠）','治疗至连续2次真菌培养阴性'],forbidden:['禁止自行停药（需培养阴性）','禁止不处理环境（孢子可存活18个月）','注意人感染风险——接触后洗手'],differential:[{disease:'猫精神性脱毛',differentiator:'精神性脱毛多因过度理毛（应激），脱毛区域对称，皮肤本身正常',questions:['脱毛区域皮肤有无异常？']}],references:['猫病学第4版']},

  // === 寄生虫 ===
  {id:'feline-par-001',disease:'猫弓形虫病',species:['猫'],category:'寄生虫',primary:['发热','食欲下降','精神萎靡'],secondary:['呼吸困难','黄疸','葡萄膜炎','神经症状'],urgency:'high',diagnosis:'弓形虫（Toxoplasma gondii）是猫为终宿主的寄生虫病。猫通常无症状，免疫低下猫和幼猫可出现临床症状。血清学检测（IgM/IgG）可辅助诊断。具有人畜共患风险（孕妇需特别注意）。',homeCare:['克林霉素治疗（遵医嘱）','严格室内饲养','避免喂食生肉','每日清理猫砂（卵囊需24-48小时才具有感染力）'],forbidden:['禁止喂食生肉','禁止孕妇清理猫砂','禁止不治疗免疫低下猫'],differential:[{disease:'FIP',differentiator:'FIP以胸腹水+神经症状+白球比<0.6为特征，弓形虫血清学可区分',questions:['猫有无户外活动史或吃生肉史？']}],references:['猫病学第4版']},

  // === 产科 ===
  {id:'feline-repro-001',disease:'猫子宫蓄脓',species:['猫'],category:'产科',primary:['阴道分泌物（脓性）','多饮多尿','食欲下降'],secondary:['腹部胀大','发热','呕吐','精神萎靡'],urgency:'critical',diagnosis:'猫子宫蓄脓是中老年未绝育母猫的急症，但发病率低于犬。开放型可见脓性分泌物，闭锁型更危险。血常规+B超可确诊。卵巢子宫切除术是首选治疗。',homeCare:['⚠️ 此为致命急症，需立即就医','尽快手术','术前输液+抗生素稳定体况'],forbidden:['禁止等待观察','禁止对未绝育母猫不做预防'],differential:[{disease:'正常妊娠',differentiator:'B超可鉴别子宫积脓（无胎儿）与妊娠（有胎儿）',questions:['母猫是否绝育？']}],references:['猫病学第4版']},
  {id:'feline-repro-002',disease:'猫乳腺肿瘤',species:['猫'],category:'产科',primary:['乳腺肿块','乳腺肿大','溃疡'],secondary:['体重下降','食欲下降','呼吸困难（肺转移）'],urgency:'high',diagnosis:'猫乳腺肿瘤多为恶性（腺癌），早期绝育（6月龄前）可显著降低风险。细针穿刺细胞学+病理活检可诊断。早期根治性手术切除是最佳治疗。',homeCare:['尽早手术切除（单侧乳腺全切）','术后化疗（遵医嘱）','定期复查（X光排查肺转移）'],forbidden:['禁止不做绝育（早期绝育可预防）','禁止发现肿块后拖延'],differential:[{disease:'乳腺增生',differentiator:'乳腺增生多见于年轻猫/假孕猫，质地较软，停药/孕酮消退后可缩小',questions:['猫是否绝育？年龄多大？']}],references:['猫病学第4版']},
]

// ===== 生成JSON文件 =====
function toEntry(d: DiseaseDef) {
  return {
    id: d.id, disease: d.disease, species: d.species, category: d.category,
    symptoms: {
      primary: d.primary, secondary: d.secondary,
      detail: d.primary.reduce((acc, s) => ({ ...acc, [s]: { frequency: '按病程', content: '按具体表现' } }), {})
    },
    urgency: d.urgency === 'critical' ? 'critical' : d.urgency === 'high' ? 'high' : d.urgency === 'medium' ? 'medium' : 'low',
    diagnosis_basis: d.diagnosis,
    home_care: d.homeCare.join('\n'),
    forbidden_care: d.forbidden.map(f => ({ rule: f, condition: 'default' })),
    medication: ['需兽医处方根据确诊结果决定具体用药'],
    vet_threshold: '如有以下情况需立即就医：症状持续加重、出现急症指征、精神萎靡或食欲废绝',
    confidence: 'high',
    differential_diagnosis: d.differential.map(dd => ({
      disease: dd.disease, differentiator: dd.differentiator, key_questions: dd.questions
    })),
    references: d.references || ['小动物医学参考'],
    version: 1, status: 'active', created_at: '2026-06-14', updated_at: '2026-06-14', reviewed_by: null
  }
}

// 按 category 分组写入
function writeSpecies(speciesDir: string, diseases: DiseaseDef[]) {
  const byCategory: Record<string, DiseaseDef[]> = {}
  for (const d of diseases) {
    const cat = categoryToFile(d.category)
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(d)
  }

  for (const [cat, list] of Object.entries(byCategory)) {
    const filePath = path.join(speciesDir, `${cat}.json`)

    // 如果文件已存在，读取并合并
    let existing: Array<{ id?: string }> = []
    if (fs.existsSync(filePath)) {
      try { existing = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Array<{ id?: string }> } catch {}
    }

    const newEntries = list.map(toEntry)
    // 去重（按id）
    const existingIds = new Set(existing.map((e) => e.id))
    const toAdd = newEntries.filter(e => !existingIds.has(e.id))

    const merged = [...existing, ...toAdd]
    fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf-8')
    console.log(`  ${cat}.json: ${existing.length} existing + ${toAdd.length} new = ${merged.length} total`)
  }
}

function categoryToFile(cat: string): string {
  const map: Record<string, string> = {
    '消化系统': 'digestive', '泌尿系统': 'urinary', '呼吸系统': 'respiratory',
    '心血管': 'cardiovascular', '皮肤科': 'dermatology', '传染病': 'infectious',
    '寄生虫': 'parasitic', '内分泌': 'endocrine', '骨骼肌肉': 'musculoskeletal',
    '产科': 'reproductive', '中毒': 'emergency_toxicology',
    '眼科': 'ophthalmology', '耳科': 'otology', '口腔': 'dental',
  }
  return map[cat] || cat
}

// 执行
console.log('=== 犬知识库 ===')
writeSpecies(path.join(BASE, 'dogs'), DOG_DISEASES)
console.log(`  总计: ${DOG_DISEASES.length} 种疾病`)

console.log('\n=== 猫知识库 ===')
writeSpecies(path.join(BASE, 'cats'), CAT_DISEASES)
console.log(`  总计: ${CAT_DISEASES.length} 种疾病`)

console.log('\n✅ 知识库生成完毕')
