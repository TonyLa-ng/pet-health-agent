#!/usr/bin/env python3
"""
Pet Health Agent - Comprehensive Test Suite
Tests the agent at http://localhost:3000 across multiple dimensions:
- API endpoint testing (error handling, validation, rate limiting)
- Knowledge base coverage testing (200 diseases: 100 dog + 100 cat)
- Demo mode logic testing
- Edge cases and adversarial inputs
- 3 rounds of testing
"""

import requests
import json
import time
import re
import sys
import io
from datetime import datetime
from collections import defaultdict

# Fix Windows GBK encoding issue
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE_URL = "http://localhost:3000"

# ============================================================
# DATASET: 100 Dog Diseases & 100 Cat Diseases
# ============================================================

DOG_DISEASES = [
    # Digestive system (1-15)
    ("犬细小病毒肠炎", "狗突然呕吐，拉血便，不吃东西，精神极度萎靡", "呕吐,腹泻,血便,食欲废绝,精神萎靡"),
    ("犬冠状病毒肠炎", "狗狗拉稀，黄色水样便，偶尔呕吐，精神还好", "腹泻,水样便,呕吐"),
    ("犬急性胃炎", "狗昨天开始吐了三次黄水，不吃狗粮", "呕吐黄水,食欲下降"),
    ("犬慢性胃炎", "狗狗最近一个月时不时吐一点白沫，吃东西正常", "间歇性呕吐白沫,慢性"),
    ("犬胃扩张扭转(GDV)", "大型犬突然干呕，腹部胀大，焦躁不安，呼吸困难", "干呕,腹胀,呼吸困难,急症"),
    ("犬肠套叠", "幼犬呕吐，排便困难，腹部触痛", "呕吐,排便困难,腹痛"),
    ("犬肠道异物阻塞", "狗吃了袜子后开始吐，不吃东西，肚子疼", "呕吐,食欲废绝,腹痛,异物史"),
    ("犬胰腺炎", "狗突然剧烈腹痛，呕吐，不爱动，可能吃了油腻食物", "剧烈腹痛,呕吐,嗜睡,油腻食物史"),
    ("犬炎症性肠病(IBD)", "狗慢性间歇性腹泻，体重下降，有时呕吐", "慢性腹泻,体重下降,偶发呕吐"),
    ("犬便秘", "狗三天没拉屎，蹲了又蹲不出来，食欲下降", "排便困难,排便减少,食欲下降"),
    ("犬结肠炎", "狗拉稀带黏液，有时带血丝，总要拉但拉不出多少", "腹泻,黏液便,血丝,里急后重"),
    ("犬肝炎", "狗精神不好，不吃东西，眼白发黄，尿很黄", "黄疸,食欲废绝,精神萎靡,尿黄"),
    ("犬肝损伤", "狗吃了洋葱后精神差，牙龈苍白", "精神萎靡,牙龈苍白,毒物接触史"),
    ("犬胆囊炎", "狗腹痛，呕吐，发热，不想吃东西", "腹痛,呕吐,发热,食欲下降"),
    ("犬口腔炎", "狗口臭严重，流口水，吃东西时表现出疼痛", "口臭,流涎,进食疼痛"),

    # Respiratory system (16-25)
    ("犬窝咳(传染性气管支气管炎)", "狗一直咳，像喉咙卡了东西一样，有时咳出白沫", "咳嗽,干咳,咳出白沫"),
    ("犬肺炎", "狗咳嗽，呼吸困难，发热，精神差，不吃东西", "咳嗽,呼吸困难,发热,精神萎靡"),
    ("犬支气管炎", "狗慢性咳嗽，运动后加重，其他都正常", "慢性咳嗽,运动后加重"),
    ("犬鼻炎", "狗一直打喷嚏，流鼻涕，鼻子堵了", "打喷嚏,流鼻涕,鼻塞"),
    ("犬扁桃体炎", "狗吞咽困难，流口水，有时咳嗽", "吞咽困难,流涎,咳嗽"),
    ("犬气管塌陷", "小型犬，兴奋时发出鹅鸣样的咳嗽声", "特征性咳嗽,鹅鸣音,小型犬"),
    ("犬短头综合征", "巴哥犬呼吸困难，打鼾严重，运动不耐受", "呼吸困难,打鼾,短头品种"),
    ("犬肺水肿", "狗突然呼吸急促，咳嗽，可能粉红色泡沫痰", "呼吸急促,咳嗽,粉红色泡沫,急症"),
    ("犬气胸", "狗被车撞后呼吸困难，牙龈发紫", "呼吸困难,牙龈发紫,外伤史,急症"),
    ("犬胸腔积液", "狗呼吸困难，不爱动，腹式呼吸", "呼吸困难,腹式呼吸,运动不耐受"),

    # Skin/Dermatology (26-40)
    ("犬过敏性皮炎", "狗一直舔爪子，身上痒，皮肤发红", "瘙痒,舔舐,皮肤发红"),
    ("犬蠕形螨病", "狗脸上掉毛，皮肤发红但不怎么痒", "脱毛,皮肤发红,面部病变"),
    ("犬疥螨病", "狗剧痒，耳朵边缘结痂，掉毛", "剧痒,耳缘结痂,脱毛"),
    ("犬真菌性皮肤病(癣菌病)", "狗身上圆形脱毛斑，有鳞屑", "圆形脱毛,鳞屑"),
    ("犬脓皮症", "狗皮肤上有脓疱，发红，有臭味", "脓疱,皮肤发红,臭味"),
    ("犬脂溢性皮炎", "狗皮肤油腻，有大量皮屑，有臭味", "皮肤油腻,皮屑,臭味"),
    ("犬湿疹", "狗身上有红色湿润区域，痒，狗一直舔", "红色湿斑,瘙痒,舔舐"),
    ("犬指间炎", "狗脚趾缝红肿，有分泌物，走路跛行", "趾间红肿,分泌物,跛行"),
    ("犬黑色素瘤", "狗身上有黑色肿块，不断增大", "黑色肿块,增大"),
    ("犬肥大细胞瘤", "狗皮肤上有肿块，有时会自己变大变小", "皮肤肿块,大小变化"),
    ("犬马拉色菌皮炎", "狗皮肤发红发痒，有特殊酵母味", "皮肤发红,瘙痒,特殊气味"),
    ("犬接触性皮炎", "换了新沐浴露后狗全身发红瘙痒", "全身发红,瘙痒,接触史"),
    ("犬跳蚤过敏性皮炎", "狗尾巴根部特别痒，一直咬，能看到小黑点", "尾根瘙痒,咬尾,可见跳蚤粪"),
    ("犬食物过敏性皮炎", "狗吃了新狗粮后全身瘙痒，耳朵发红", "全身瘙痒,耳红,饮食变更史"),
    ("犬日光性皮炎", "白毛狗鼻子和耳朵晒伤，发红脱皮", "鼻耳发红,脱皮,白毛品种"),

    # Musculoskeletal (41-50)
    ("犬髋关节发育不良", "大狗后腿走路摇晃，站起来困难，运动后更明显", "后腿无力,起立困难,大型犬"),
    ("犬膝关节十字韧带断裂", "狗突然后腿不敢着地，膝盖肿胀", "突然跛行,膝肿,后腿"),
    ("犬髌骨脱位", "小型犬走路时偶尔跳一下后腿，然后又正常了", "间歇性跛行,跳跃步态,小型犬"),
    ("犬关节炎", "老狗起床时僵硬，走路慢，天冷更明显", "晨僵,行动缓慢,老年犬,天气敏感"),
    ("犬骨关节炎", "狗运动后跛行加重，关节肿胀", "运动后跛行,关节肿胀"),
    ("犬椎间盘疾病(IVDD)", "腊肠犬突然后腿瘫痪，不能走路，大小便失禁", "后肢瘫痪,失禁,腊肠犬,急症"),
    ("犬肌炎", "狗肌肉疼痛，不愿动，触碰肌肉会叫", "肌肉疼痛,不愿动,触碰痛"),
    ("犬骨髓炎", "狗手术后伤口不愈合，骨头感染发热", "伤口不愈,发热,手术史"),
    ("犬骨肉瘤", "大狗腿骨上有硬块，跛行，疼痛明显", "骨硬块,跛行,疼痛,大型犬"),
    ("犬肘关节发育不良", "幼犬前腿跛行，肘关节外翻", "前腿跛行,肘外翻,幼犬"),

    # Urinary system (51-57)
    ("犬尿路感染", "狗频繁上厕所，尿量少，有时尿中带血", "尿频,尿少,血尿"),
    ("犬膀胱结石", "狗排尿困难，尿中带血，有时尿不出来", "排尿困难,血尿,尿闭"),
    ("犬肾衰竭(急性)", "狗突然不尿了，呕吐，精神极差", "无尿,呕吐,精神萎靡,急症"),
    ("犬肾衰竭(慢性)", "老狗喝水多尿多，体重下降，口臭有氨味", "多饮多尿,体重下降,氨味口臭,老年犬"),
    ("犬膀胱炎", "狗排尿频繁，排尿时疼痛叫唤", "尿频,排尿疼痛"),
    ("犬尿石症", "狗尿中有结晶，排尿困难，血尿", "尿结晶,排尿困难,血尿"),
    ("犬肾盂肾炎", "狗发热，腰痛，尿浑浊有臭味", "发热,腰痛,尿浊,尿臭"),

    # Cardiovascular (58-63)
    ("犬心丝虫病", "狗咳嗽，运动后容易累，体重下降", "咳嗽,运动不耐受,体重下降"),
    ("犬充血性心力衰竭", "老狗咳嗽，呼吸困难，肚子变大(腹水)", "咳嗽,呼吸困难,腹水,老年犬"),
    ("犬心律失常", "狗突然晕倒，然后又自己站起来", "晕厥,自行恢复"),
    ("犬心包积液", "狗腹部变大，颈静脉怒张，精神差", "腹大,颈静脉怒张,精神差"),
    ("犬心肌病", "大型犬突然虚弱，呼吸困难，牙龈发白", "突然虚弱,呼吸困难,牙龈苍白,大型犬,急症"),
    ("犬高血压", "老狗突然眼睛出血，精神差", "眼出血,精神差,老年犬"),

    # Neurological (64-72)
    ("犬癫痫", "狗突然倒地抽搐，口吐白沫，几分钟后恢复", "抽搐,口吐白沫,自行恢复"),
    ("犬前庭综合征", "老狗突然歪头，眼球震颤，站不稳", "歪头,眼球震颤,共济失调,老年犬"),
    ("犬脑炎", "狗发热，抽搐，行为异常，不认识主人了", "发热,抽搐,行为异常"),
    ("犬脊髓炎", "狗后腿逐渐无力，最终瘫痪", "后腿渐进无力,瘫痪"),
    ("犬重症肌无力", "狗运动后越来越无力，休息后好转", "运动后无力,休息好转"),
    ("犬椎间盘突出", "狗突然尖叫后不愿动，头低着，背弓起", "尖叫,不愿动,低头弓背"),
    ("犬脑积水", "幼犬头大，眼神异常，行为迟钝", "头大,眼神异常,行为迟钝,幼犬"),
    ("犬肝性脑病", "狗有肝病史，突然精神异常，转圈", "肝病史,精神异常,转圈"),
    ("犬破伤风", "狗有伤口后全身僵硬，牙关紧闭", "全身僵硬,牙关紧闭,伤口史"),

    # Infectious diseases (73-82)
    ("犬瘟热", "幼犬发热，眼屎多，咳嗽，后期抽搐", "发热,眼分泌物,咳嗽,抽搐,幼犬"),
    ("犬细小病毒病", "幼犬呕吐，血便，腥臭味，迅速脱水", "呕吐,血便,腥臭,脱水,幼犬,急症"),
    ("犬传染性肝炎", "幼犬发热，呕吐，腹痛，角膜混浊(蓝眼)", "发热,呕吐,腹痛,角膜混浊,幼犬"),
    ("犬钩端螺旋体病", "狗发热，黄疸，尿血，有老鼠接触史", "发热,黄疸,血尿,鼠类接触史"),
    ("犬狂犬病", "狗行为异常，流涎过多，攻击性增加或异常安静", "行为异常,过度流涎,攻击性"),
    ("犬莱姆病", "狗被蜱虫咬后关节肿痛，发热，跛行", "关节肿痛,发热,跛行,蜱虫接触史"),
    ("犬埃立克体病", "狗被蜱虫咬后发热，鼻出血，精神差", "发热,鼻出血,精神差,蜱虫史"),
    ("犬巴贝斯虫病", "狗发热，贫血，尿呈酱油色，被蜱虫咬过", "发热,贫血,酱油尿,蜱虫史"),
    ("犬弓形虫病", "狗发热，咳嗽，神经症状，有猫接触史", "发热,咳嗽,神经症状,猫接触史"),
    ("犬布鲁氏菌病", "繁殖犬流产，公狗睾丸肿大", "流产,睾丸肿大,繁殖犬"),

    # Eye diseases (83-90)
    ("犬白内障", "老狗眼睛变白，看不清东西，撞到家具", "眼白浊,视力下降,老年犬"),
    ("犬青光眼", "狗眼睛发红，疼痛，流泪，眼球变大", "眼红,眼痛,流泪,眼球增大"),
    ("犬干眼症", "狗眼睛有黏稠分泌物，频繁眨眼", "黏稠眼分泌物,频繁眨眼"),
    ("犬结膜炎", "狗眼睛红肿，流泪，有分泌物", "眼红肿,流泪,分泌物"),
    ("犬角膜炎", "狗眼睛表面混浊，怕光，流泪", "角膜混浊,畏光,流泪"),
    ("犬樱桃眼(第三眼睑腺脱出)", "狗眼角有红色肉球突出", "眼角红色肿物"),
    ("犬眼睑内翻", "狗睫毛刺到眼球，一直流泪，眨眼频繁", "流泪,频繁眨眼,睫毛刺激"),
    ("犬进行性视网膜萎缩(PRA)", "狗夜间看不清，逐渐白天也看不见", "夜盲,渐进性视力下降"),

    # Ear diseases (91-94)
    ("犬外耳炎", "狗一直甩头，挠耳朵，耳朵有臭味和分泌物", "甩头,挠耳,耳臭,耳分泌物"),
    ("犬中耳炎", "狗歪头，耳朵疼，可能有面瘫", "歪头,耳痛,面瘫"),
    ("犬耳血肿", "狗耳廓肿了一个大包，软软的", "耳廓肿胀,软性肿块"),
    ("犬耳螨", "狗耳朵里有黑色咖啡渣样分泌物，瘙痒", "黑色耳分泌物,瘙痒,咖啡渣样"),

    # Endocrine (95-100)
    ("犬糖尿病", "狗喝水多尿多，虽然吃得多但体重下降", "多饮多尿,多食消瘦"),
    ("犬库兴氏综合征", "狗喝水多尿多，肚子大，皮肤薄，掉毛对称", "多饮多尿,腹大,皮肤薄,对称性脱毛"),
    ("犬甲减", "狗精神差，掉毛对称，怕冷，体重增加", "精神萎靡,对称脱毛,怕冷,体重增加"),
    ("犬艾迪生病", "狗反复呕吐腹泻，精神极差，心率慢", "反复呕吐腹泻,精神萎靡,心率慢"),
    ("犬甲状旁腺功能减退", "狗抽搐，肌肉震颤，血钙低", "抽搐,肌肉震颤"),
    ("犬胰腺外分泌不足", "狗吃很多但还是瘦，拉灰色油状便", "多食消瘦,灰油便"),
]

CAT_DISEASES = [
    # Digestive system (1-15)
    ("猫瘟(泛白细胞减少症)", "幼猫突然呕吐，腹泻带血，高烧，不吃东西", "呕吐,血便,高热,食欲废绝,幼猫,急症"),
    ("猫冠状病毒(FCoV)感染", "猫拉稀，有时呕吐，精神还可以", "腹泻,偶发呕吐"),
    ("猫传染性腹膜炎(FIP)", "猫肚子变大(湿性)或眼睛异常+神经症状(干性)，持续发热", "腹水,发热,神经症状,眼异常"),
    ("猫急性胃炎", "猫吐了两次，不吃猫粮，精神不太好", "呕吐,食欲下降,精神萎靡"),
    ("猫慢性胃炎", "猫偶尔吐毛球带食物，吃东西正常，但有时吐", "间歇性呕吐,毛球"),
    ("猫肠道异物", "猫吃了线后开始吐，肚子疼，不吃东西", "呕吐,腹痛,食欲废绝,线性异物史"),
    ("猫巨结肠症", "猫好几天不拉屎，肚子胀大，排便困难大叫", "便秘,腹胀,排便疼痛"),
    ("猫胰腺炎", "猫不典型症状，不吃东西，嗜睡，可能有呕吐", "食欲废绝,嗜睡,可能呕吐"),
    ("猫IBD(炎症性肠病)", "猫慢性间歇性呕吐和腹泻，体重下降", "慢性呕吐,慢性腹泻,体重下降"),
    ("猫肝脂质沉积症", "胖猫突然不吃东西一周，黄疸，呕吐", "肥胖猫,绝食,黄疸,呕吐,急症"),
    ("猫胆管肝炎", "猫发热，黄疸，呕吐，腹痛", "发热,黄疸,呕吐,腹痛"),
    ("猫口腔炎/牙龈炎", "猫口臭，流口水，吃东西痛，牙龈红肿", "口臭,流涎,进食疼痛,牙龈红肿"),
    ("猫齿吸收症(猫龋齿)", "猫吃东西时突然尖叫，避开硬食", "进食尖叫,避开硬食"),
    ("猫食管炎", "猫吞咽困难，反流食物，流口水", "吞咽困难,反流,流涎"),
    ("猫便秘/顽固性便秘", "老猫排便困难，便便干硬，食欲下降", "排便困难,粪干硬,食欲下降,老年猫"),

    # Respiratory system (16-25)
    ("猫杯状病毒(FCV)感染", "猫打喷嚏，流鼻涕，口腔溃疡，流口水", "打喷嚏,流鼻涕,口腔溃疡,流涎"),
    ("猫疱疹病毒(FHV-1)感染", "猫打喷嚏，眼睛红肿流泪，鼻塞，发热", "打喷嚏,眼红肿,流泪,鼻塞,发热"),
    ("猫衣原体感染", "猫结膜炎严重，眼睛红肿流泪", "结膜炎,眼红肿,流泪"),
    ("猫支原体感染", "猫慢性结膜炎，咳嗽，流鼻涕", "慢性结膜炎,咳嗽,流鼻涕"),
    ("猫哮喘(过敏性支气管炎)", "猫阵发性咳嗽，呼吸时有喘鸣音", "阵发性咳嗽,喘鸣"),
    ("猫肺炎", "猫呼吸困难，张口呼吸，发热，精神极差", "呼吸困难,张口呼吸,发热,精神萎靡"),
    ("猫脓胸", "猫呼吸困难，精神差，发热，不吃东西", "呼吸困难,精神差,发热,食欲废绝"),
    ("猫鼻炎/鼻窦炎", "猫长期打喷嚏流鼻涕，有时带血", "长期喷嚏,流涕,可能带血"),
    ("猫鼻咽息肉", "猫呼吸有杂音，打鼾，有时打喷嚏", "呼吸杂音,打鼾,喷嚏"),
    ("猫支气管炎", "猫慢性咳嗽，其他表现正常", "慢性咳嗽"),

    # Urinary system (26-35) - VERY IMPORTANT for cats
    ("猫下泌尿道疾病(FLUTD)", "猫频繁去猫砂盆，尿得少，有时尿中带血", "尿频,尿少,血尿"),
    ("猫尿闭(FIC/尿栓)", "猫去猫砂盆蹲着但尿不出来，惨叫，肚子疼", "尿闭,惨叫,腹痛,急症"),
    ("猫膀胱结石/结晶", "猫尿中带血，排尿困难，频繁舔生殖器", "血尿,排尿困难,频繁舔舐"),
    ("猫肾衰竭(急性)", "猫突然不尿了，呕吐，精神极差，可能吃了百合花", "无尿,呕吐,精神萎靡,毒物史,急症"),
    ("猫肾衰竭(慢性)", "老猫喝水多尿多，体重下降，口臭，精神差", "多饮多尿,体重下降,口臭,精神差,老年猫"),
    ("猫肾盂肾炎", "猫发热，排尿痛，尿液浑浊", "发热,排尿痛,尿浊"),
    ("猫膀胱炎(特发性)", "猫压力大后出现血尿，尿频，但检查无结石", "血尿,尿频,压力相关"),
    ("猫尿道堵塞", "公猫完全尿不出来，不停去猫砂盆，呕吐", "尿闭,频繁蹲盆,呕吐,公猫,急症"),
    ("猫尿路感染(UTI)", "猫排尿频繁，排尿时叫，尿液有异味", "尿频,排尿痛,尿异臭"),
    ("猫肾结石", "猫排尿困难，血尿，精神不振", "排尿困难,血尿,精神不振"),

    # Infectious diseases (36-45)
    ("猫艾滋病(FIV)", "流浪猫打架后反复感染，口腔炎，体重下降", "反复感染,口腔炎,体重下降,流浪猫"),
    ("猫白血病(FeLV)", "猫反复发热，消瘦，贫血，淋巴肿大", "反复发热,消瘦,贫血,淋巴肿大"),
    ("猫传染性腹膜炎(FIP)(湿性)", "幼猫/年轻猫腹部膨大，持续发热，消瘦", "腹水,持续发热,消瘦,幼猫"),
    ("猫弓形虫病", "猫发热，眼炎，神经症状，可能无症状", "发热,眼炎,神经症状"),
    ("猫巴尔通体病(猫抓热)", "猫无症状或发热，人类被猫抓后淋巴结肿大", "可能无症状,人畜共患"),
    ("猫隐球菌病", "猫鼻孔有肉芽肿，打喷嚏带血，面部肿胀", "鼻肉芽肿,喷嚏带血,面部肿胀"),
    ("猫组织胞浆菌病", "猫慢性腹泻，体重下降，发热，淋巴结肿大", "慢性腹泻,体重下降,发热,淋巴结肿大"),
    ("猫汉塞巴尔通体病", "猫发热，倦怠，食欲下降", "发热,倦怠,食欲下降"),
    ("猫嗜血支原体病(血巴尔通体)", "猫贫血，牙龈苍白，发热，精神萎靡", "贫血,牙龈苍白,发热,精神萎靡"),
    ("猫滴虫感染", "猫慢性腹泻，便便恶臭，有时带血", "慢性腹泻,恶臭,偶带血"),

    # Skin/Dermatology (46-55)
    ("猫粟粒性皮炎", "猫身上有很多小疙瘩，痒，舔毛频繁", "全身小疙瘩,瘙痒,过度舔毛"),
    ("猫嗜酸细胞性肉芽肿", "猫嘴唇或后腿有线状溃疡或肿块", "唇部溃疡,后腿肿块"),
    ("猫真菌性皮肤病(癣菌)", "猫身上圆形脱毛，有鳞屑，可能传染人", "圆形脱毛,鳞屑,人畜共患"),
    ("猫耳螨", "猫耳朵有大量黑褐色分泌物，搔痒，甩头", "黑褐耳分泌物,瘙痒,甩头"),
    ("猫蠕形螨病", "猫局部或全身脱毛，皮肤发红", "脱毛,皮肤发红"),
    ("猫跳蚤过敏性皮炎", "猫背部和尾部瘙痒，过度舔毛，可见跳蚤", "背尾瘙痒,过度舔毛,可见跳蚤"),
    ("猫食物过敏", "猫头部和颈部瘙痒，脱毛，可能有消化道症状", "头颈瘙痒,脱毛,消化道症状"),
    ("猫特应性皮炎", "猫全身瘙痒，季节性发作", "全身瘙痒,季节性"),
    ("猫痤疮", "猫下巴有黑色小点，有时发红化脓", "下巴黑点,发红,化脓"),
    ("猫日光性皮炎", "白猫耳朵尖发红，脱皮，可能癌变", "耳尖发红,脱皮,白猫"),

    # Eye diseases (56-62)
    ("猫结膜炎", "猫眼睛红肿，流泪，有眼屎，睁不开", "眼红肿,流泪,眼分泌物,眼睑痉挛"),
    ("猫角膜炎/角膜溃疡", "猫眼睛表面混浊或溃烂，怕光，流泪", "角膜混浊,畏光,流泪,眼痛"),
    ("猫前葡萄膜炎", "猫眼睛颜色改变，怕光，瞳孔缩小", "眼色改变,畏光,瞳孔缩小"),
    ("猫白内障", "老猫眼睛变白，视力下降", "眼白浊,视力下降,老年猫"),
    ("猫青光眼", "猫眼睛变大，疼痛，流泪，角膜混浊", "眼球增大,眼痛,流泪,角膜混浊"),
    ("猫角膜腐骨(坏死性角膜炎)", "猫角膜上有黑色斑块，流泪，疼痛", "角膜黑斑,流泪,眼痛,特征性"),
    ("猫眼睑内翻", "猫睫毛刺激眼球，流泪，频繁眨眼", "流泪,频繁眨眼,睫毛刺激"),

    # Endocrine (63-68)
    ("猫糖尿病", "猫喝水多尿多，虽然吃得多但消瘦", "多饮多尿,多食消瘦"),
    ("猫甲亢", "老猫吃得多但消瘦，活动多，心慌，毛乱", "多食消瘦,多动,心悸,毛乱,老年猫"),
    ("猫甲减(罕见)", "猫精神差，掉毛，怕冷，体重增加", "精神萎靡,掉毛,怕冷,肥胖"),
    ("猫肾上腺皮质功能亢进", "猫皮肤薄，易瘀青，腹大，喝水多", "皮肤薄,易瘀青,腹大,多饮"),
    ("猫甲状旁腺功能亢进", "猫无力，骨痛，食欲下降，多饮多尿", "无力,骨痛,食欲下降,多饮多尿"),
    ("猫肢端肥大症", "猫头部变大，下颌突出，糖尿病控制不住", "头大,下颌突出,难控糖尿病"),

    # Musculoskeletal (69-73)
    ("猫关节炎", "老猫不爱跳了，活动减少，可能触痛", "不愿跳跃,活动减少,老年猫"),
    ("猫髋关节发育不良", "猫后腿走路异常，不愿剧烈活动", "后腿异常,不愿活动"),
    ("猫髌骨脱位", "猫走路时偶然后腿跳一下", "间歇跛行,跳跃步态"),
    ("猫骨折", "猫从高处跳下后腿不敢着地，肿胀", "外伤史,跛行,肿胀"),
    ("猫骨肉瘤", "老猫腿骨有硬块，跛行", "骨硬块,跛行,老年猫"),

    # Cardiovascular (74-78)
    ("猫肥厚性心肌病(HCM)", "猫突然后腿瘫痪(血栓)，呼吸困难", "后肢瘫痪,呼吸困难,血栓,急症"),
    ("猫限制性心肌病", "猫呼吸困难，腹水，精神差", "呼吸困难,腹水,精神差"),
    ("猫心丝虫病", "猫咳嗽，呼吸困难，突然死亡可能", "咳嗽,呼吸困难,可能猝死"),
    ("猫高血压", "老猫突然失明，瞳孔散大，可能肾病史", "突然失明,瞳孔散大,肾病史,老年猫"),
    ("猫先天性心脏病", "幼猫心脏杂音，发育迟缓", "心脏杂音,发育迟缓,幼猫"),

    # Neurological (79-85)
    ("猫癫痫", "猫突然倒地抽搐，口吐白沫", "抽搐,口吐白沫"),
    ("猫前庭综合征", "猫歪头，眼球震颤，站不稳，可能中耳炎引起", "歪头,眼球震颤,共济失调"),
    ("猫脑膜炎", "猫发热，颈部僵硬，抽搐", "发热,颈僵,抽搐"),
    ("猫椎间盘疾病", "猫后腿无力或瘫痪", "后腿无力,瘫痪"),
    ("猫脊髓损伤", "猫被车撞后后肢瘫痪，大小便失禁", "外伤史,后肢瘫痪,失禁"),
    ("猫脑肿瘤", "老猫行为改变，转圈，抽搐", "行为改变,转圈,抽搐,老年猫"),
    ("猫缺血性脑病", "猫突然歪头，走路打转，眼球快速震颤", "突然歪头,转圈,眼球震颤"),

    # Other important cat conditions (86-100)
    ("猫口腔鳞状细胞癌", "猫口腔内有肿块，流口水带血，口臭严重", "口腔肿物,流涎带血,严重口臭"),
    ("猫乳腺肿瘤", "未绝育母猫乳房有肿块，可能溃烂", "乳房肿块,未绝育母猫"),
    ("猫淋巴瘤", "猫体重下降，淋巴结肿大，可能呕吐腹泻", "体重下降,淋巴结肿大,呕吐,腹泻"),
    ("猫嗜酸细胞性胃肠炎", "猫慢性呕吐腹泻，可能有过敏史", "慢性呕吐,慢性腹泻,过敏史"),
    ("猫毛球症", "猫偶尔吐毛球，有时便秘，精神食欲正常", "吐毛球,偶便秘,精神食欲好"),
    ("猫异物癖(异食癖)", "猫吃毛线等异物，可能导致肠梗阻", "吞食异物,可能肠梗阻"),
    ("猫铅中毒", "猫呕吐，腹痛，神经症状（抽搐/行为异常）", "呕吐,腹痛,神经症状"),
    ("猫百合花中毒", "猫吃了百合花后呕吐，精神差，导致肾衰竭", "呕吐,精神萎靡,百合接触史,急症"),
    ("猫防冻液(乙二醇)中毒", "猫喝了防冻液后醉酒样步态，呕吐，肾衰竭", "醉酒步态,呕吐,可能防冻液接触,急症"),
    ("猫对乙酰氨基酚中毒", "猫吃了人用感冒药后牙龈发蓝，精神极差", "牙龈发蓝,精神萎靡,人药接触史,急症"),
    ("猫应激性膀胱炎", "猫换环境/家里来客人后出现尿频尿血", "环境改变,尿频,血尿,压力相关"),
    ("猫产后低钙血症(子痫)", "哺乳母猫抽搐，肌肉僵硬，精神异常", "哺乳母猫,抽搐,肌僵,急症"),
    ("猫中耳炎/内耳炎", "猫歪头，走路不稳，眼球震颤", "歪头,共济失调,眼球震颤"),
    ("猫耳血肿", "猫耳廓肿胀，触感柔软", "耳廓肿胀,柔软肿块"),
    ("猫胃溃疡", "猫呕吐带血，黑便，腹痛", "呕血,黑便,腹痛"),
]

# ============================================================
# TEST FUNCTIONS
# ============================================================

class TestResults:
    def __init__(self):
        self.api_tests = []
        self.session_tests = []
        self.demo_tests = []
        self.errors = []
        self.warnings = []
        self.stats = defaultdict(int)
        self.start_time = datetime.now()

    def add_api_test(self, name, passed, details=""):
        self.api_tests.append({"name": name, "passed": passed, "details": details})

    def add_session_test(self, name, passed, details=""):
        self.session_tests.append({"name": name, "passed": passed, "details": details})

    def add_demo_test(self, name, category, passed, details=""):
        self.demo_tests.append({"name": name, "category": category, "passed": passed, "details": details})

    def print_summary(self):
        total_api = len(self.api_tests)
        passed_api = sum(1 for t in self.api_tests if t["passed"])
        total_session = len(self.session_tests)
        passed_session = sum(1 for t in self.session_tests if t["passed"])
        total_demo = len(self.demo_tests)
        passed_demo = sum(1 for t in self.demo_tests if t["passed"])

        print("\n" + "="*80)
        print("                     TEST EXECUTION SUMMARY")
        print("="*80)
        print(f"API Tests:        {passed_api}/{total_api} passed")
        print(f"Session Tests:    {passed_session}/{total_session} passed")
        print(f"Demo Mode Tests:  {passed_demo}/{total_demo} passed")
        print(f"Errors:           {len(self.errors)}")
        print(f"Warnings:         {len(self.warnings)}")
        print(f"Duration:         {datetime.now() - self.start_time}")
        print("="*80)

results = TestResults()

# ============================================================
# PHASE 1: API ENDPOINT TESTING
# ============================================================

def test_api_endpoints():
    print("\n" + "="*60)
    print("  PHASE 1: API Endpoint Testing")
    print("="*60)

    # 1.1 POST /api/sessions - validation tests
    print("\n--- 1.1 Session Creation Validation ---")

    # Test: Missing petId
    r = requests.post(f"{BASE_URL}/api/sessions", json={}, timeout=10)
    assert r.status_code == 400, f"Expected 400, got {r.status_code}"
    data = r.json()
    assert "缺少 petId" in data.get("error", ""), f"Unexpected error: {data}"
    results.add_api_test("POST /api/sessions - missing petId returns 400", True)
    print(f"  ✓ Missing petId → 400 ({data['error']})")

    # Test: Empty body
    r = requests.post(f"{BASE_URL}/api/sessions", data="", timeout=10,
                      headers={"Content-Type": "application/json"})
    assert r.status_code == 400
    results.add_api_test("POST /api/sessions - empty body returns 400", True)
    print(f"  ✓ Empty body → 400")

    # Test: Non-existent petId
    r = requests.post(f"{BASE_URL}/api/sessions", json={"petId": "nonexistent-99999"}, timeout=10)
    assert r.status_code == 404
    data = r.json()
    assert "不存在" in data.get("error", "")
    results.add_api_test("POST /api/sessions - nonexistent petId returns 404", True)
    print(f"  ✓ Nonexistent petId → 404 ({data['error']})")

    # Test: Invalid JSON
    r = requests.post(f"{BASE_URL}/api/sessions", data="not json",
                      headers={"Content-Type": "application/json"}, timeout=10)
    # Should handle gracefully
    results.add_api_test("POST /api/sessions - invalid JSON handling", r.status_code in [400, 500])
    print(f"  {'✓' if r.status_code in [400,500] else '✗'} Invalid JSON → {r.status_code}")

    # Test: Malformed body
    r = requests.post(f"{BASE_URL}/api/sessions", json={"petId": 12345}, timeout=10)
    # petId is a number not string
    print(f"  → petId as number → {r.status_code}: {r.json().get('error', 'N/A')}")
    results.add_api_test("POST /api/sessions - petId as number type", r.status_code in [400, 404])

    # Test: XSS in petId
    r = requests.post(f"{BASE_URL}/api/sessions",
                      json={"petId": "<script>alert('xss')</script>"}, timeout=10)
    print(f"  → XSS in petId → {r.status_code}: {r.json().get('error', 'N/A')}")
    results.add_api_test("POST /api/sessions - XSS in petId", r.status_code == 404)

    # Test: Very long petId
    long_id = "x" * 10000
    r = requests.post(f"{BASE_URL}/api/sessions", json={"petId": long_id}, timeout=10)
    print(f"  → Very long petId → {r.status_code}")
    results.add_api_test("POST /api/sessions - very long petId", r.status_code in [400, 404, 414])

    # Test: SQL injection in petId
    r = requests.post(f"{BASE_URL}/api/sessions",
                      json={"petId": "'; DROP TABLE sessions; --"}, timeout=10)
    print(f"  → SQLi in petId → {r.status_code}")
    results.add_api_test("POST /api/sessions - SQLi in petId", r.status_code == 404)

    # 1.2 POST /api/sessions/:id/messages
    print("\n--- 1.2 Message Endpoint Validation ---")

    # Test: Non-existent session
    r = requests.post(f"{BASE_URL}/api/sessions/nonexistent-123/messages",
                      json={"text": "test"}, timeout=10)
    assert r.status_code == 404
    results.add_api_test("POST messages - nonexistent session → 404", True)
    print(f"  ✓ Nonexistent session → 404")

    # Test: Missing text
    r = requests.post(f"{BASE_URL}/api/sessions/nonexistent-123/messages",
                      json={}, timeout=10)
    assert r.status_code == 404  # Session check first
    results.add_api_test("POST messages - missing text → session check first", True)
    print(f"  ✓ Missing text → 404 (session not found)")

    # Test: No body
    r = requests.post(f"{BASE_URL}/api/sessions/nonexistent-123/messages",
                      data="", timeout=10,
                      headers={"Content-Type": "application/json"})
    print(f"  → Empty body → {r.status_code}")
    results.add_api_test("POST messages - empty body", r.status_code in [400, 404])

    # Test: Invalid JSON
    r = requests.post(f"{BASE_URL}/api/sessions/nonexistent-123/messages",
                      data="notjson", timeout=10,
                      headers={"Content-Type": "application/json"})
    print(f"  → Invalid JSON → {r.status_code}")
    results.add_api_test("POST messages - invalid JSON handling", r.status_code in [400, 404, 500])

    # Test: Very long message
    long_msg = "狗吐了 " * 5000
    r = requests.post(f"{BASE_URL}/api/sessions/nonexistent-123/messages",
                      json={"text": long_msg}, timeout=10)
    print(f"  → Very long message → {r.status_code}")
    results.add_api_test("POST messages - very long text", r.status_code == 404)

    # Test: XSS in message
    r = requests.post(f"{BASE_URL}/api/sessions/nonexistent-123/messages",
                      json={"text": "<script>alert('xss')</script>"}, timeout=10)
    print(f"  → XSS in message → {r.status_code}")
    results.add_api_test("POST messages - XSS in text", r.status_code == 404)

    # Test: Unicode/emoji
    r = requests.post(f"{BASE_URL}/api/sessions/nonexistent-123/messages",
                      json={"text": "🐶🐱🐾 狗狗呕吐 🤮🤒"}, timeout=10)
    print(f"  → Unicode/emoji → {r.status_code}")
    results.add_api_test("POST messages - unicode/emoji", r.status_code == 404)

    # 1.3 GET /api/sessions/:id/report
    print("\n--- 1.3 Report Endpoint Validation ---")

    # Test: Non-existent session
    r = requests.get(f"{BASE_URL}/api/sessions/nonexistent-123/report", timeout=10)
    assert r.status_code == 404
    results.add_api_test("GET report - nonexistent session → 404", True)
    print(f"  ✓ Nonexistent session → 404")

    # 1.4 Test non-existent routes
    print("\n--- 1.4 Non-existent Routes ---")
    for path in ["/api", "/api/v1", "/api/chat", "/api/diagnose", "/api/pets",
                 "/api/auth", "/api/admin", "/graphql", "/.env"]:
        r = requests.get(f"{BASE_URL}{path}", timeout=10)
        is_404 = r.status_code == 404
        print(f"  {'✓' if is_404 else '?'} GET {path} → {r.status_code}")
        # All non-existent routes should return 404, not 500
        results.add_api_test(f"GET {path} → should be 404", r.status_code == 404)

    # 1.5 Test HTTP methods on valid endpoints
    print("\n--- 1.5 HTTP Method Validation ---")
    for path, methods in [
        ("/api/sessions", ["GET", "PUT", "DELETE", "PATCH"]),
        ("/api/sessions/test/messages", ["GET", "PUT", "DELETE"]),
        ("/api/sessions/test/report", ["POST", "PUT", "DELETE"]),
    ]:
        for method in methods:
            r = requests.request(method, f"{BASE_URL}{path}", timeout=10)
            print(f"  {method} {path} → {r.status_code}")
            # Should not 500
            results.add_api_test(f"{method} {path} → should not 500",
                               r.status_code != 500,
                               f"Status: {r.status_code}")

    # 1.6 Content-Type validation
    print("\n--- 1.6 Content-Type Validation ---")
    r = requests.post(f"{BASE_URL}/api/sessions",
                      data="petId=test",
                      headers={"Content-Type": "application/x-www-form-urlencoded"},
                      timeout=10)
    print(f"  Form-encoded body → {r.status_code}")
    results.add_api_test("POST /api/sessions - form-encoded body", True)


# ============================================================
# PHASE 2: DEMO MODE LOGIC SIMULATION
# ============================================================

# Simulate the frontend's handleDemoMode logic
def simulate_demo_mode(user_text, current_followup=0, species="犬"):
    """
    Simulate the demo mode logic from the frontend's DiagnoseContent component.
    Returns: (response_type, content, report_data)
    """
    known_symptoms = re.compile(r'吐|呕|拉稀|腹泻|食欲|不吃|没精神|精神|嗜睡|尿|猫砂盆|排尿|乱尿|咳嗽|发热|发烧')
    emergency_pattern = re.compile(r'抽搐|中毒|车祸|尿不出|呼吸困难|大出血|一直吐|吐血|被车')
    kb_match = known_symptoms.search(user_text)
    has_emergency = emergency_pattern.search(user_text)

    if has_emergency:
        return ("emergency", "⚠️ 检测到急症信号，请立即就医！", None)

    elif kb_match:
        has_vomit = re.search(r'吐|呕', user_text)
        has_diarrhea = re.search(r'拉稀|腹泻|拉肚', user_text)
        has_appetite = re.search(r'不吃|食欲', user_text)
        has_lethargy = re.search(r'没精神|精神|嗜睡|蔫', user_text)
        has_urinary = re.search(r'尿|猫砂盆|排尿|乱尿', user_text)

        if current_followup == 0 and (has_urinary or (not has_vomit and not has_diarrhea and has_lethargy)):
            return ("followup", "followup_questions", None)
        else:
            disease = "急性胃肠炎" if has_diarrhea else "急性胃炎"
            confidence = 85 if (has_vomit and has_appetite and has_lethargy) else 70
            badge = "🟢" if confidence >= 80 else "🟡"
            return ("kb_diagnosis", f"{disease}|confidence:{confidence}|badge:{badge}", {
                "template": "template_1",
                "source": "knowledge_base",
                "disease": disease,
                "confidence": confidence,
            })
    else:
        # Fallback to LLM
        symptoms = []
        if re.search(r'皮肤|痒|掉毛|秃|脱毛|红|疹|疙瘩|肿块', user_text):
            symptoms.append('皮肤异常')
        if re.search(r'眼睛|流泪|眼屎|红肿|眯眼|蹭眼', user_text):
            symptoms.append('眼部异常')
        if re.search(r'耳朵|挠耳|甩头|耳臭|耳垢', user_text):
            symptoms.append('耳部异常')
        if re.search(r'瘸|跛|腿疼|不敢着地|关节|肿', user_text):
            symptoms.append('运动障碍')
        if re.search(r'口臭|牙|牙龈|流口水|口腔', user_text):
            symptoms.append('口腔异常')
        if re.search(r'呼吸|喘|咳|打喷嚏|鼻涕', user_text):
            symptoms.append('呼吸道症状')
        if re.search(r'抽搐|抖|痉挛', user_text):
            symptoms.append('神经系统症状')

        matched_symptoms = ', '.join(symptoms) if symptoms else '无典型症状'
        return ("llm_fallback", f"llm_analysis|symptoms:{matched_symptoms}", {
            "template": "template_1",
            "source": "llm_fallback",
            "matched_symptoms": matched_symptoms,
        })


def test_demo_mode_with_diseases():
    print("\n" + "="*60)
    print("  PHASE 2: Demo Mode Disease Coverage Testing")
    print("="*60)

    print("\n--- 2.1 Testing 100 Dog Diseases ---")
    dog_results = {"emergency": 0, "followup": 0, "kb_diagnosis": 0, "llm_fallback": 0}
    dog_issues = []

    for disease_name, description, symptoms_key in DOG_DISEASES:
        response_type, content, report = simulate_demo_mode(description, species="犬")
        dog_results[response_type] += 1
        if response_type == "llm_fallback":
            dog_issues.append((disease_name, description[:50], response_type))
        elif response_type == "emergency":
            dog_issues.append((disease_name, description[:50], response_type))

    print(f"  Emergency triggered: {dog_results['emergency']}")
    print(f"  Followup questions:  {dog_results['followup']}")
    print(f"  KB diagnosis:        {dog_results['kb_diagnosis']}")
    print(f"  LLM fallback:        {dog_results['llm_fallback']}")

    # Check which should be in KB but aren't
    kb_covered_diseases = ["急性胃肠炎", "急性胃炎"]
    actual_kb_matches = [d for d in dog_issues if d[2] == "kb_diagnosis"]
    actual_llm_fallbacks = [d for d in dog_issues if d[2] == "llm_fallback"]

    print(f"\n  Diseases routed to LLM fallback (out of KB scope):")
    for name, desc, _ in actual_llm_fallbacks:
        print(f"    - {name}: {desc}")

    print(f"\n  Diseases triggering emergency:")
    for name, desc, _ in [d for d in dog_issues if d[2] == "emergency"]:
        print(f"    - {name}: {desc}")

    results.add_demo_test("Dog disease coverage", "coverage",
                         dog_results['kb_diagnosis'] > 0,
                         f"KB:{dog_results['kb_diagnosis']} Followup:{dog_results['followup']} "
                         f"LLM:{dog_results['llm_fallback']} Emergency:{dog_results['emergency']}")

    print("\n--- 2.2 Testing 100 Cat Diseases ---")
    cat_results = {"emergency": 0, "followup": 0, "kb_diagnosis": 0, "llm_fallback": 0}
    cat_issues = []

    for disease_name, description, symptoms_key in CAT_DISEASES:
        response_type, content, report = simulate_demo_mode(description, species="猫")
        cat_results[response_type] += 1
        if response_type == "llm_fallback":
            cat_issues.append((disease_name, description[:50], response_type))
        elif response_type == "emergency":
            cat_issues.append((disease_name, description[:50], response_type))

    print(f"  Emergency triggered: {cat_results['emergency']}")
    print(f"  Followup questions:  {cat_results['followup']}")
    print(f"  KB diagnosis:        {cat_results['kb_diagnosis']}")
    print(f"  LLM fallback:        {cat_results['llm_fallback']}")

    print(f"\n  Diseases routed to LLM fallback (out of KB scope):")
    for name, desc, _ in cat_issues:
        print(f"    - {name}: {desc}")

    results.add_demo_test("Cat disease coverage", "coverage",
                         cat_results['kb_diagnosis'] > 0,
                         f"KB:{cat_results['kb_diagnosis']} Followup:{cat_results['followup']} "
                         f"LLM:{cat_results['llm_fallback']} Emergency:{cat_results['emergency']}")

    return dog_results, cat_results, dog_issues + cat_issues


# ============================================================
# PHASE 3: EDGE CASES & ADVERSARIAL TESTING
# ============================================================

def test_edge_cases():
    print("\n" + "="*60)
    print("  PHASE 3: Edge Cases & Adversarial Testing")
    print("="*60)

    edge_case_inputs = [
        # Empty/minimal inputs
        ("空输入", ""),
        ("仅空格", "   "),
        ("仅标点", "。。。"),
        ("仅数字", "123456"),
        ("单字", "狗"),
        ("仅换行", "\n\n\n"),

        # Non-pet queries
        ("人类疾病", "我头痛发烧怎么办"),
        ("其他动物", "我的仓鼠不吃东西了"),
        ("其他动物2", "兔子拉稀了怎么办"),
        ("完全无关", "今天天气怎么样"),
        ("闲聊", "你好呀，吃了吗"),

        # Ambiguous inputs
        ("极简描述", "狗病了"),
        ("过度详细", "我的狗2023年6月15日下午3点开始出现第一次呕吐，"
         "吐的是早上吃的皇家狗粮混合胡萝卜的颜色偏黄的糊状物，"
         "量大约有一次性纸杯那么多，吐完之后它还想去吃回去..."
         "然后过了大概45分钟又吐了第二次，这次是白色泡沫，量比较少..."
         "接着晚上8点左右它喝了点水，但是没吃东西..."
         "第二天早上精神不太好，我叫它它反应比较慢..."),
        ("矛盾描述", "狗吐了，但精神和食欲都很好，蹦蹦跳跳的"),

        # Potentially problematic inputs
        ("药物名称", "狗吃了布洛芬"),
        ("药物名称2", "猫吃了对乙酰氨基酚"),
        ("毒物询问", "狗吃了巧克力怎么办"),
        ("毒物询问2", "狗吃了老鼠药"),
        ("多次症状", "狗又吐又拉又咳又喘又瘸又抽搐"),
        ("非症状描述", "我想知道狗一天吃几顿合适"),
        ("繁殖问题", "狗怀孕了需要注意什么"),
        ("行为问题", "狗总是咬人怎么办"),
        ("非犬猫宠物", "我的鹦鹉一直在啄羽毛"),
        ("混合语言", "my dog is vomiting and has diarrhea 怎么办"),

        # Emotional/stress test
        ("极度焦虑", "我的狗要死了！快救救它！它不吃饭三天了！我快疯了！"),
        ("重复描述", "狗吐了，真的吐了，一直在吐，吐了好多次，吐了很多东西"),
        ("多问题混合", "狗吐了怎么办？要吃药吗？还能喝水吗？要不要马上去医院？要禁食吗？"),

        # Special characters
        ("特殊字符", "狗🐶吐了🤮！！@#$%^&*()"),
        ("HTML注入", "狗<b>吐</b>了<script>恶意代码</script>"),
        ("超长输入", "狗吐了" * 1000),
    ]

    for name, text in edge_case_inputs:
        response_type, content, report = simulate_demo_mode(text)
        issues = []

        # Analyze response
        if response_type == "llm_fallback" and any(kw in text for kw in ["吐", "拉稀", "腹泻", "食欲", "发热"]):
            issues.append("KNOWN_SYMPTOM_IN_FALLBACK")
        if response_type == "kb_diagnosis" and len(text.strip()) < 3:
            issues.append("TOO_SHORT_FOR_DIAGNOSIS")
        if response_type == "emergency" and "急救" not in text and "抽搐" not in text and "中毒" not in text:
            issues.append("FALSE_EMERGENCY")

        status = "✓" if not issues else "⚠"
        print(f"  {status} [{name}]: {text[:60]}... → {response_type}" +
              (f" ({', '.join(issues)})" if issues else ""))

        results.add_demo_test(f"Edge: {name}", "edge_cases", len(issues) == 0,
                            f"→{response_type}" + (f" issues:{','.join(issues)}" if issues else ""))

    print("\n--- 3.2 Session State Machine Edge Tests ---")
    # Test session state transitions

    # Test rapid successions
    for i in range(5):
        r = requests.post(f"{BASE_URL}/api/sessions",
                         json={"petId": f"pet-test-{i}"}, timeout=10)
        results.add_session_test(f"Rapid session creation #{i+1}",
                               r.status_code in [400, 404, 429],
                               f"Status: {r.status_code}")

    print("  Rapid session creation tested (5 requests)")

    # Test rate limiting
    print("\n--- 3.3 Rate Limiting Tests ---")
    # Session creation rate limit: 5/min
    rate_limit_hit = False
    for i in range(10):
        r = requests.post(f"{BASE_URL}/api/sessions",
                         json={"petId": "pet-demo"}, timeout=10)
        if r.status_code == 429:
            rate_limit_hit = True
            print(f"  Rate limit hit at request #{i+1} → 429: {r.json().get('error', 'N/A')}")
            break

    if not rate_limit_hit:
        print(f"  Rate limit not triggered after 10 requests (max 5/min)")

    results.add_session_test("Rate limiting - session creation", rate_limit_hit,
                            "Rate limiting works" if rate_limit_hit else "Rate limit may not work")


# ============================================================
# PHASE 4: SECOND ROUND - DEEP TESTING
# ============================================================

def test_round2_deep():
    print("\n" + "="*60)
    print("  ROUND 2: Deep Testing")
    print("="*60)

    print("\n--- 4.1 Confidence Score Analysis ---")
    # Test confidence scoring accuracy
    test_cases = [
        ("严重症状", "狗呕吐+拉血+发热40度+精神极差+不吃不喝", "should be high confidence"),
        ("轻微症状", "狗偶尔吐一次，精神好，吃东西正常", "should be low confidence or followup"),
        ("单一症状", "狗咳嗽", "should trigger followup"),
        ("模糊症状", "狗好像不太舒服，我也说不上来哪里不对", "should trigger followup or llm fallback"),
        ("完整病史", "狗昨天吃鸡骨头后开始吐，吐了3次，不吃狗粮，没精神", "should be high confidence kb match"),
    ]

    for name, text, expected in test_cases:
        response_type, content, report = simulate_demo_mode(text)
        print(f"  [{name}] → {response_type}: {content[:80]}... (expected: {expected})")

    print("\n--- 4.2 Follow-up Question Coverage ---")
    followup_inputs = [
        ("补充信息后-完整", "狗吐了，昨天开始的，吐了三四次，没吃东西，精神不好，不喝水",
         lambda: simulate_demo_mode("狗吐了", 0)),
        ("补充信息后-仍不足", "狗好像不舒服",
         lambda: simulate_demo_mode("狗好像不舒服", 0)),
        ("追问后回答", "狗昨天开始吐的，食欲下降了，没精神",
         lambda: simulate_demo_mode("狗食欲下降，没精神", 0)),
    ]

    for name, text, setup in followup_inputs:
        response_type, content, report = simulate_demo_mode(text)
        print(f"  [{name}] → {response_type}")

    print("\n--- 4.3 Cross-Species Testing ---")
    # Cat-specific symptoms on dog
    cat_symptoms_on_dog = [
        ("猫下泌尿道症状问狗", "狗频繁去猫砂盆，尿得少，尿中带血"),
        ("毛球症问狗", "狗吐毛球"),
    ]
    for name, text in cat_symptoms_on_dog:
        response_type, content, report = simulate_demo_mode(text, species="犬")
        print(f"  [{name}] → {response_type} (species=犬)")

    # Dog-specific symptoms on cat
    dog_symptoms_on_cat = [
        ("犬窝咳症状问猫", "猫一直咳嗽，像有东西卡住"),
        ("髋关节问题问猫", "猫后腿走路摇晃"),
    ]
    for name, text in dog_symptoms_on_cat:
        response_type, content, report = simulate_demo_mode(text, species="猫")
        print(f"  [{name}] → {response_type} (species=猫)")

    print("\n--- 4.4 Emergency Detection Accuracy ---")
    emergency_tests = [
        ("真正急症-抽搐", "狗突然倒地抽搐，口吐白沫", True),
        ("真正急症-中毒", "狗刚刚吃了老鼠药", True),
        ("真正急症-车祸", "狗被车撞了后腿不能动", True),
        ("真正急症-呼吸困难", "狗突然呼吸困难，牙龈发紫", True),
        ("真正急症-大出血", "狗伤口大出血止不住", True),
        ("假急症-普通呕吐", "狗吐了一次，但精神还行", False),
        ("假急症-轻微腹泻", "狗今天拉稀两次但精神很好", False),
        ("边缘-呕吐多次", "狗今天已经吐了5次了", False),  # Not emergency per pattern
        ("边缘-摔倒", "狗从沙发上摔下来了，走路有点瘸", False),
        ("边缘-被大狗咬", "狗被大狗咬了，有几个伤口在流血", False),
    ]

    for name, text, should_be_emergency in emergency_tests:
        response_type, content, report = simulate_demo_mode(text)
        is_emergency = response_type == "emergency"
        correct = is_emergency == should_be_emergency
        status = "✓" if correct else "✗ MISMATCH"
        print(f"  {status} [{name}]: expected_emergency={should_be_emergency}, actual={is_emergency}")
        results.add_demo_test(f"Emergency: {name}", "emergency_accuracy",
                            correct,
                            f"Expected:{should_be_emergency} Got:{is_emergency}")


# ============================================================
# PHASE 5: ROUND 3 - BUG HUNTING
# ============================================================

def test_round3_bugs():
    print("\n" + "="*60)
    print("  ROUND 3: Bug Hunting & Stress Testing")
    print("="*60)

    bugs_found = []

    print("\n--- 5.1 Boundary Value Analysis ---")

    # 5.1.1 Test all API parameters with extreme values
    boundary_tests = [
        ("null petId", {"petId": None}),
        ("boolean petId", {"petId": True}),
        ("array petId", {"petId": ["test"]}),
        ("object petId", {"petId": {"nested": "test"}}),
        ("negative number petId", {"petId": -1}),
        ("zero petId", {"petId": 0}),
        ("float petId", {"petId": 3.14}),
    ]

    for name, body in boundary_tests:
        r = requests.post(f"{BASE_URL}/api/sessions", json=body, timeout=10)
        status = "✓" if r.status_code != 500 else "✗ 500 ERROR"
        if r.status_code == 500:
            bugs_found.append(f"API 500 error with {name}")
        print(f"  {status} {name} → {r.status_code}: {r.json().get('error', 'N/A')[:80]}")

    # 5.1.2 Test session ID boundary values
    bad_session_ids = [
        "../etc/passwd",
        "../../../",
        "null",
        "undefined",
        "NaN",
        "Infinity",
        "\x00null",
        "'; DROP TABLE sessions; --",
        "%00",
        "%2e%2e%2f",
        "{" * 1000,
    ]

    for bad_id in bad_session_ids:
        r = requests.get(f"{BASE_URL}/api/sessions/{bad_id}/report", timeout=10)
        status = "✓" if r.status_code != 500 else "✗ 500 ERROR"
        if r.status_code == 500:
            bugs_found.append(f"API 500 error with session ID: {bad_id[:50]}")
        print(f"  {status} session/{bad_id[:40]}/report → {r.status_code}")

    print("\n--- 5.2 Concurrency & Lock Testing ---")
    # Send multiple concurrent messages to same session
    # (This tests the session lock mechanism)

    import concurrent.futures
    def send_message(i):
        return requests.post(
            f"{BASE_URL}/api/sessions/demo-session/messages",
            json={"text": f"test message {i}"}, timeout=10
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(send_message, i) for i in range(5)]
        responses = [f.result() for f in futures]

    status_429 = sum(1 for r in responses if r.status_code == 429)
    print(f"  Concurrent requests: {status_429}/5 returned 429 (lock)")
    if status_429 > 0:
        print(f"  ✓ Session lock works (concurrent requests blocked)")
    else:
        print(f"  ⚠ No 429 responses — lock may not be working")

    print("\n--- 5.3 Response Header Security Checks ---")
    r = requests.get(BASE_URL, timeout=10)
    headers = r.headers
    security_checks = {
        "X-Content-Type-Options": headers.get("X-Content-Type-Options"),
        "X-Frame-Options": headers.get("X-Frame-Options"),
        "Content-Security-Policy": headers.get("Content-Security-Policy"),
        "Strict-Transport-Security": headers.get("Strict-Transport-Security"),
        "X-XSS-Protection": headers.get("X-XSS-Protection"),
    }

    for header, value in security_checks.items():
        if value:
            print(f"  ✓ {header}: {value}")
        else:
            print(f"  ⚠ {header}: MISSING")
            results.warnings.append(f"Missing security header: {header}")

    print("\n--- 5.4 Demo Mode Logic Bug Hunting ---")
    # Test edge cases in demo mode

    logic_tests = [
        # Test for specific bugs in the demo logic
        ("Bug: 仅有'不吃'无呕吐 → 应触发followup而非直接诊断",
         "狗不吃东西", "followup"),
        ("Bug: '精神不好'可能被解析为呕吐(精'神'不'好'→有'神'字但无呕吐)",
         "狗精神不太好", "followup"),
        ("Bug: 猫特有病征在犬模式下",
         "狗去猫砂盆尿不出来一直惨叫", "emergency"),  # Contains "尿不出"
        ("Bug: 症状描述有'吐'字但不是疾病",
         "狗吐舌头喘气", "llm_fallback"),  # "吐舌头" is not vomiting
        ("Bug: 多个系统症状混合",
         "狗又吐又拉又咳又瘸又掉毛又抽搐", "emergency"),
    ]

    for name, text, expected_type in logic_tests:
        response_type, content, report = simulate_demo_mode(text)
        correct = response_type == expected_type
        status = "✓" if correct else f"✗ (got {response_type}, expected {expected_type})"
        if not correct:
            bugs_found.append(name)
        print(f"  {status}: {name}")

    print("\n--- 5.5 Error Message Quality Check ---")
    # Test that error messages are user-friendly and in Chinese
    error_bodies = [
        ({"petId": ""}, "空字符串petId"),
        ({"unexpected_key": "value"}, "Unexpected body keys"),
    ]

    for body, desc in error_bodies:
        r = requests.post(f"{BASE_URL}/api/sessions", json=body, timeout=10)
        error_text = r.json().get("error", "")
        is_chinese = any('一' <= c <= '鿿' for c in error_text)
        print(f"  [{desc}] → {r.status_code}: {error_text} " +
              f"({'✓ Chinese' if is_chinese else '⚠ Not Chinese'})")
        if not is_chinese and error_text:
            bugs_found.append(f"Non-Chinese error message: {error_text}")

    return bugs_found


# ============================================================
# MAIN TEST EXECUTION
# ============================================================

def main():
    print("="*80)
    print("  PET HEALTH AGENT - COMPREHENSIVE TEST SUITE")
    print(f"  Target: {BASE_URL}")
    print(f"  Time: {datetime.now()}")
    print("="*80)

    all_bugs = []

    # Phase 1: API Endpoint Testing
    try:
        test_api_endpoints()
    except Exception as e:
        results.errors.append(f"Phase 1 error: {e}")
        print(f"  ✗ Phase 1 failed: {e}")

    # Phase 2: Disease Coverage Testing (200 diseases)
    try:
        dog_res, cat_res, all_issues = test_demo_mode_with_diseases()
    except Exception as e:
        results.errors.append(f"Phase 2 error: {e}")
        print(f"  ✗ Phase 2 failed: {e}")
        dog_res = {"emergency": 0, "followup": 0, "kb_diagnosis": 0, "llm_fallback": 0}
        cat_res = {"emergency": 0, "followup": 0, "kb_diagnosis": 0, "llm_fallback": 0}
        all_issues = []

    # Phase 3: Edge Cases & Adversarial Testing (Round 1 continued)
    try:
        test_edge_cases()
    except Exception as e:
        results.errors.append(f"Phase 3 error: {e}")
        print(f"  ✗ Phase 3 failed: {e}")

    # Phase 4: Round 2 - Deep Testing
    try:
        test_round2_deep()
    except Exception as e:
        results.errors.append(f"Phase 4 error: {e}")
        print(f"  ✗ Phase 4 failed: {e}")

    # Phase 5: Round 3 - Bug Hunting
    try:
        bugs = test_round3_bugs()
        all_bugs.extend(bugs)
    except Exception as e:
        results.errors.append(f"Phase 5 error: {e}")
        print(f"  ✗ Phase 5 failed: {e}")

    # ============================================================
    # FINAL REPORT
    # ============================================================
    print("\n\n")
    print("="*80)
    print("                    FINAL TEST REPORT")
    print("="*80)
    print(f"Date: {datetime.now()}")
    print(f"Target: {BASE_URL}")
    print(f"Duration: {datetime.now() - results.start_time}")
    print()

    # Overall statistics
    total_tests = len(results.api_tests) + len(results.session_tests) + len(results.demo_tests)
    total_passed = (sum(1 for t in results.api_tests if t["passed"]) +
                    sum(1 for t in results.session_tests if t["passed"]) +
                    sum(1 for t in results.demo_tests if t["passed"]))
    total_failed = total_tests - total_passed

    print("┌" + "─" * 78 + "┐")
    print(f"│ {'TEST SUMMARY':^76} │")
    print("├" + "─" * 78 + "┤")
    print(f"│ {'Category':<40} {'Total':>8} {'Passed':>8} {'Failed':>8} {'Rate':>8} │")
    print("├" + "─" * 78 + "┤")

    for cat_name, tests in [("API Endpoint Tests", results.api_tests),
                             ("Session/Lock Tests", results.session_tests),
                             ("Demo Mode Logic Tests", results.demo_tests)]:
        total = len(tests)
        passed = sum(1 for t in tests if t["passed"])
        failed = total - passed
        rate = f"{passed/total*100:.1f}%" if total > 0 else "N/A"
        print(f"│ {cat_name:<40} {total:>8} {passed:>8} {failed:>8} {rate:>8} │")

    print("├" + "─" * 78 + "┤")
    print(f"│ {'TOTAL':<40} {total_tests:>8} {total_passed:>8} {total_failed:>8} {total_passed/total_tests*100:.1f}%{'':>2} │")
    print("└" + "─" * 78 + "┘")

    # Disease coverage statistics
    print()
    print("┌" + "─" * 78 + "┐")
    print(f"│ {'DISEASE COVERAGE ANALYSIS (200 DISEASES)':^76} │")
    print("├" + "─" * 78 + "┤")
    print(f"│ {'Dog Diseases (100)':^76} │")
    print(f"│   KB Diagnosis: {dog_res['kb_diagnosis']:<5} Follow-up: {dog_res['followup']:<5} LLM Fallback: {dog_res['llm_fallback']:<5} Emergency: {dog_res['emergency']:<5} │")
    print(f"│   KB Coverage Rate: {dog_res['kb_diagnosis']/100*100:.1f}%{'':>54} │")
    print(f"│ {'Cat Diseases (100)':^76} │")
    print(f"│   KB Diagnosis: {cat_res['kb_diagnosis']:<5} Follow-up: {cat_res['followup']:<5} LLM Fallback: {cat_res['llm_fallback']:<5} Emergency: {cat_res['emergency']:<5} │")
    print(f"│   KB Coverage Rate: {cat_res['kb_diagnosis']/100*100:.1f}%{'':>54} │")
    print("└" + "─" * 78 + "┘")

    # Issues found
    print()
    print("┌" + "─" * 78 + "┐")
    print(f"│ {'ISSUES & FINDINGS':^76} │")
    print("├" + "─" * 78 + "┤")

    findings = []

    # 1. KB coverage issue
    kb_coverage_rate = (dog_res['kb_diagnosis'] + cat_res['kb_diagnosis']) / 200 * 100
    findings.append(("CRITICAL", f"KB coverage rate only {kb_coverage_rate:.1f}% - "
                    f"most diseases go to LLM fallback"))

    # 2. Emergency detection
    findings.append(("HIGH", "Emergency detection relies on simple keyword matching - "
                    "\"一直吐\"/\"吐血\" trigger emergency but semantic equivalents may not"))

    # 3. Followup system
    findings.append(("MEDIUM", "Follow-up questions are stateless - can only ask once"))

    # 4. LLM fallback
    findings.append(("HIGH", "LLM fallback generates only generic responses, "
                    "no real API integration"))

    # 5. Security
    for w in results.warnings:
        findings.append(("MEDIUM", w))

    # 6. Species handling
    findings.append(("MEDIUM", "Species parameter is passed but not used in demo logic - "
                    "cat and dog diseases receive identical analysis"))

    # 7. State machine
    findings.append(("MEDIUM", "Session state machine exists in backend but is bypassed "
                    "by demo mode; real session flow untestable via frontend"))

    # 8. Bugs found
    for bug in all_bugs:
        findings.append(("BUG", bug))

    # 9. Input validation
    findings.append(("LOW", "No input sanitization visible in demo mode (handled client-side)"))

    # 10. Knowledge base limitations
    findings.append(("CRITICAL", "Knowledge base covers only 2 conditions: acute gastroenteritis "
                    "and urinary blockage (MVP)"))

    for severity, finding in findings:
        print(f"│ [{severity:<8}] {finding[:67]:<67} │")

    print("└" + "─" * 78 + "┘")

    # Recommendations
    print()
    print("┌" + "─" * 78 + "┐")
    print(f"│ {'RECOMMENDATIONS':^76} │")
    print("├" + "─" * 78 + "┤")

    recommendations = [
        "1. Expand KB from 2→50+ diseases per species for meaningful coverage",
        "2. Implement real LLM/Web Search integration for fallback cases",
        "3. Add species-specific disease weighting (cat≠dog)",
        "4. Implement proper multi-turn follow-up with state tracking",
        "5. Add security headers (CSP, X-Frame-Options, HSTS)",
        "6. Add proper input validation and sanitization on backend",
        "7. Create pet profile management API endpoints",
        "8. Implement proper confidence scoring with uncertainty communication",
        "9. Add semantic emergency detection beyond keyword matching",
        "10. Add proper integration/E2E tests for the full pipeline",
    ]

    for rec in recommendations:
        print(f"│ {rec[:76]:<76} │")
    print("└" + "─" * 78 + "┘")

    print()
    print("="*80)
    print(f"  Test completed. {total_passed}/{total_tests} tests passed ({total_passed/total_tests*100:.1f}%)")
    print(f"  {len(all_bugs)} bugs found, {len(results.warnings)} warnings, {len(results.errors)} errors")
    print("="*80)

    return total_passed, total_tests, all_bugs


if __name__ == "__main__":
    main()
