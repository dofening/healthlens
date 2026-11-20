/*! 健康透镜 HealthLens · Copyright © 2026 dofen. SPDX-License-Identifier: MIT */
/* 健康透镜 · 数据类型目录：中文名、所属板块、统计方式、单位换算、说明
 * kind:  sum   累计量（按天求和，跨设备去重）
 *        avg   离散测量（按天求均值/最值）
 *        audio 声压级（按时长做能量平均 LAeq）
 *        event 事件（按次数/时长）
 *        stand 站立小时（已站立/未站立）
 *        sleep 睡眠分析（单独算法）
 * up: 数值升高是好事 'good' / 坏事 'bad' / 无所谓 null（用于涨跌颜色）
 */
(function () {
  'use strict';
  const HL = window.HL = window.HL || {};

  const DOMAINS = {
    overview: { name: '总览', color: '#E9EEF5' },
    activity: { name: '活动', color: '#FF7A3D' },
    heart: { name: '心脏', color: '#F2557A' },
    sleep: { name: '睡眠', color: '#8B80F0' },
    resp: { name: '呼吸', color: '#41B6EC' },
    mobility: { name: '行动能力', color: '#E0A526' },
    hearing: { name: '听力与环境', color: '#2EC4B6' },
    body: { name: '身体测量', color: '#C46AD8' },
    vitals: { name: '生命体征', color: '#EF6F6F' },
    nutrition: { name: '营养', color: '#5CC46B' },
    mind: { name: '正念', color: '#55C1D6' },
    events: { name: '事件与症状', color: '#B9A4F2' },
    cycle: { name: '周期记录', color: '#F27BB0' },
    other: { name: '其他', color: '#9AA9BC' }
  };

  const Q = 'HKQuantityTypeIdentifier', C = 'HKCategoryTypeIdentifier';
  // [id后缀, 中文名, 板块, kind, 显示单位, 缩放, 小数, up, 说明]
  const RAW = [
    // 活动
    [Q + 'StepCount', '步数', 'activity', 'sum', '步', 1, 0, 'good', 'iPhone 与 Apple Watch 记录的步数。多设备重叠的时段已去重。'],
    [Q + 'DistanceWalkingRunning', '步行+跑步距离', 'activity', 'sum', '公里', 1, 2, 'good', '步行和跑步的累计距离，已跨设备去重。'],
    [Q + 'DistanceCycling', '骑行距离', 'activity', 'sum', '公里', 1, 2, 'good', '骑行体能训练记录的距离。'],
    [Q + 'DistanceSwimming', '游泳距离', 'activity', 'sum', '米', 1000, 0, 'good', '游泳距离。'],
    [Q + 'DistanceWheelchair', '轮椅距离', 'activity', 'sum', '公里', 1, 2, 'good', ''],
    [Q + 'DistanceDownhillSnowSports', '滑雪距离', 'activity', 'sum', '公里', 1, 2, 'good', ''],
    [Q + 'DistanceCrossCountrySkiing', '越野滑雪距离', 'activity', 'sum', '公里', 1, 2, 'good', ''],
    [Q + 'DistancePaddleSports', '划桨距离', 'activity', 'sum', '公里', 1, 2, 'good', ''],
    [Q + 'DistanceRowing', '划船距离', 'activity', 'sum', '公里', 1, 2, 'good', ''],
    [Q + 'DistanceSkatingSports', '滑冰距离', 'activity', 'sum', '公里', 1, 2, 'good', ''],
    [Q + 'ActiveEnergyBurned', '活动能量', 'activity', 'sum', '千卡', 1, 0, 'good', '身体活动额外消耗的能量（不含基础代谢）。'],
    [Q + 'BasalEnergyBurned', '静息能量', 'activity', 'sum', '千卡', 1, 0, null, '维持基础代谢消耗的能量，主要由身高体重年龄估算。'],
    [Q + 'FlightsClimbed', '已爬楼层', 'activity', 'sum', '层', 1, 0, 'good', '大约每上升 3 米记 1 层。'],
    [Q + 'AppleExerciseTime', '锻炼分钟数', 'activity', 'sum', '分钟', 1, 0, 'good', '达到快走及以上强度的分钟数（Apple Watch）。'],
    [Q + 'AppleStandTime', '站立分钟数', 'activity', 'sum', '分钟', 1, 0, 'good', '站立并活动的分钟数（Apple Watch）。'],
    [Q + 'AppleMoveTime', '活动分钟数', 'activity', 'sum', '分钟', 1, 0, 'good', ''],
    [C + 'AppleStandHour', '站立小时', 'activity', 'stand', '小时', 1, 0, 'good', '每个小时内是否站起来活动过至少 1 分钟。'],
    [Q + 'PushCount', '轮椅推动次数', 'activity', 'sum', '次', 1, 0, 'good', ''],
    [Q + 'SwimmingStrokeCount', '划水次数', 'activity', 'sum', '次', 1, 0, 'good', ''],
    [Q + 'NikeFuel', 'NikeFuel', 'activity', 'sum', '', 1, 0, 'good', ''],
    [Q + 'TimeInDaylight', '日光下时间', 'activity', 'sum', '分钟', 1, 0, 'good', 'Apple Watch 用环境光传感器估计的户外日光时间。'],
    [Q + 'PhysicalEffort', '运动强度', 'activity', 'avg', 'MET', 1, 1, null, '用代谢当量（MET）表示的即时强度：1 MET≈静坐，3≈快走，6 以上为高强度。'],
    [Q + 'EstimatedWorkoutEffortScore', '估算训练强度', 'activity', 'avg', '分', 1, 1, null, 'Apple Watch 自动估算的体能训练强度（1–10）。'],
    [Q + 'WorkoutEffortScore', '训练强度评分', 'activity', 'avg', '分', 1, 1, null, '你在体能训练后自己打的强度分（1–10）。'],
    [Q + 'CyclingSpeed', '骑行速度', 'activity', 'avg', 'km/h', 3.6, 1, null, ''],
    [Q + 'CyclingPower', '骑行功率', 'activity', 'avg', '瓦', 1, 0, null, ''],
    [Q + 'CyclingCadence', '骑行踏频', 'activity', 'avg', '转/分', 1, 0, null, ''],
    [Q + 'CyclingFunctionalThresholdPower', '骑行功能阈值功率', 'activity', 'avg', '瓦', 1, 0, 'good', ''],
    [Q + 'RunningSpeed', '跑步速度', 'mobility', 'avg', 'km/h', 1, 1, 'good', '跑步时的瞬时速度。'],
    [Q + 'RunningPower', '跑步功率', 'mobility', 'avg', '瓦', 1, 0, null, '跑步时输出的功率估计值。'],
    [Q + 'RunningStrideLength', '跑步步幅', 'mobility', 'avg', '米', 1, 2, null, '跑步时一步的长度。'],
    [Q + 'RunningVerticalOscillation', '垂直振幅', 'mobility', 'avg', '厘米', 1, 1, 'bad', '跑步时身体上下起伏的幅度，越小通常越经济。'],
    [Q + 'RunningGroundContactTime', '触地时间', 'mobility', 'avg', '毫秒', 1, 0, 'bad', '每一步脚接触地面的时间。'],
    [Q + 'VO2Max', '最大摄氧量', 'heart', 'avg', 'mL/kg/min', 1, 1, 'good', 'Apple 所说的「心肺适能」：运动时身体每分钟每公斤能利用的最大氧气量，是有氧能力的核心指标。'],
    // 心脏
    [Q + 'HeartRate', '心率', 'heart', 'avg', '次/分', 1, 0, null, '每分钟心跳次数，来自 Apple Watch、AirPods 等。'],
    [Q + 'RestingHeartRate', '静息心率', 'heart', 'avg', '次/分', 1, 0, 'bad', '一天中安静不动时的心率估计值，越低通常代表心肺越好。'],
    [Q + 'WalkingHeartRateAverage', '步行心率均值', 'heart', 'avg', '次/分', 1, 0, 'bad', '一天中步行时的平均心率。'],
    [Q + 'HeartRateVariabilitySDNN', '心率变异性', 'heart', 'avg', '毫秒', 1, 0, 'good', '相邻心跳间隔的波动（SDNN）。数值越高通常表示恢复越好、压力越小，个体差异很大，应和自己比。'],
    [Q + 'HeartRateRecoveryOneMinute', '心率恢复', 'heart', 'avg', '次/分', 1, 0, 'good', '运动结束后 1 分钟内心率下降了多少，越大越好。'],
    [Q + 'AtrialFibrillationBurden', '房颤负荷', 'heart', 'avg', '%', 100, 0, 'bad', '房颤史功能估计的一周内处于房颤的时间比例；显示「<2%」表示低于可检测下限。'],
    [Q + 'PeripheralPerfusionIndex', '灌注指数', 'heart', 'avg', '%', 100, 1, null, ''],
    [C + 'HighHeartRateEvent', '高心率通知', 'heart', 'event', '次', 1, 0, null, '静止状态下心率持续高于阈值时的提醒。'],
    [C + 'LowHeartRateEvent', '低心率通知', 'heart', 'event', '次', 1, 0, null, ''],
    [C + 'IrregularHeartRhythmEvent', '心律不齐通知', 'heart', 'event', '次', 1, 0, null, ''],
    [C + 'LowCardioFitnessEvent', '心肺适能偏低通知', 'heart', 'event', '次', 1, 0, null, ''],
    // 呼吸
    [Q + 'RespiratoryRate', '呼吸频率', 'resp', 'avg', '次/分', 1, 1, null, '主要在睡眠时测得的每分钟呼吸次数。'],
    [Q + 'OxygenSaturation', '血氧饱和度', 'resp', 'avg', '%', 100, 0, 'good', '血液中携氧血红蛋白的比例。'],
    [Q + 'AppleSleepingBreathingDisturbances', '呼吸紊乱', 'resp', 'avg', '', 1, 1, 'bad', 'Apple Watch 在睡眠中检测到的呼吸短暂中断/异常的指标，Apple 用它判断是否「升高」。'],
    [Q + 'ForcedVitalCapacity', '用力肺活量', 'resp', 'avg', '升', 1, 2, 'good', ''],
    [Q + 'ForcedExpiratoryVolume1', '第一秒用力呼气量', 'resp', 'avg', '升', 1, 2, 'good', ''],
    [Q + 'PeakExpiratoryFlowRate', '呼气峰流速', 'resp', 'avg', '升/分', 1, 0, 'good', ''],
    [Q + 'InhalerUsage', '吸入器使用', 'resp', 'sum', '次', 1, 0, null, ''],
    // 睡眠
    [C + 'SleepAnalysis', '睡眠分析', 'sleep', 'sleep', '', 1, 0, null, '入睡、醒来以及核心/深度/快速动眼睡眠阶段。'],
    [Q + 'AppleSleepingWristTemperature', '睡眠时手腕温度', 'sleep', 'avg', '°C', 1, 2, null, 'Apple Watch 在睡眠时测得的手腕皮肤温度，重点看与自己平时相比的偏离。'],
    [C + 'SleepApneaEvent', '睡眠呼吸暂停通知', 'sleep', 'event', '次', 1, 0, null, ''],
    // 行动能力
    [Q + 'WalkingSpeed', '步行速度', 'mobility', 'avg', 'km/h', 1, 2, 'good', '在平地上稳定步行时的速度（iPhone 放口袋里测得）。'],
    [Q + 'WalkingStepLength', '步长', 'mobility', 'avg', '厘米', 1, 0, 'good', '步行时一步的长度。'],
    [Q + 'WalkingDoubleSupportPercentage', '双支撑时间', 'mobility', 'avg', '%', 100, 1, 'bad', '步行中双脚同时着地的时间占比，越低通常越稳健敏捷。'],
    [Q + 'WalkingAsymmetryPercentage', '步行不对称性', 'mobility', 'avg', '%', 100, 1, 'bad', '左右脚步行节奏不一致的时间占比。'],
    [Q + 'AppleWalkingSteadiness', '步行稳定性', 'mobility', 'avg', '%', 100, 0, 'good', '根据步态估计的稳定程度，用于预测跌倒风险。'],
    [Q + 'StairAscentSpeed', '上楼速度', 'mobility', 'avg', 'm/s', 1, 2, 'good', '上楼梯时的垂直速度。'],
    [Q + 'StairDescentSpeed', '下楼速度', 'mobility', 'avg', 'm/s', 1, 2, 'good', '下楼梯时的垂直速度。'],
    [Q + 'SixMinuteWalkTestDistance', '六分钟步行距离', 'mobility', 'avg', '米', 1, 0, 'good', '根据日常步行估算的「6 分钟能走多远」，常用于评估体能。'],
    [Q + 'NumberOfTimesFallen', '摔倒次数', 'mobility', 'sum', '次', 1, 0, 'bad', ''],
    // 听力与环境
    [Q + 'HeadphoneAudioExposure', '耳机音量', 'hearing', 'audio', 'dB', 1, 0, 'bad', '戴耳机时的声压级。长期超过 80 dB 会增加听力受损风险。'],
    [Q + 'EnvironmentalAudioExposure', '环境噪音', 'hearing', 'audio', 'dB', 1, 0, 'bad', 'Apple Watch 麦克风测得的周围环境声压级。'],
    [Q + 'EnvironmentalSoundReduction', '降噪量', 'hearing', 'avg', 'dB', 1, 1, null, 'AirPods 等耳机的降噪/通透模式把环境声降低了多少分贝。'],
    [C + 'AudioExposureEvent', '噪声通知', 'hearing', 'event', '次', 1, 0, null, '环境噪声超过阈值时 Apple Watch 发出的提醒。'],
    [C + 'EnvironmentalAudioExposureEvent', '环境噪声通知', 'hearing', 'event', '次', 1, 0, null, ''],
    [C + 'HeadphoneAudioExposureEvent', '耳机音量通知', 'hearing', 'event', '次', 1, 0, null, '一周耳机音量累计过高时的提醒。'],
    [Q + 'UVExposure', '紫外线指数', 'hearing', 'avg', '', 1, 1, null, ''],
    [Q + 'WaterTemperature', '水温', 'hearing', 'avg', '°C', 1, 1, null, ''],
    [Q + 'UnderwaterDepth', '水下深度', 'hearing', 'avg', '米', 1, 1, null, ''],
    // 身体测量
    [Q + 'Height', '身高', 'body', 'avg', '厘米', 1, 0, null, ''],
    [Q + 'BodyMass', '体重', 'body', 'avg', '公斤', 1, 1, null, ''],
    [Q + 'BodyMassIndex', '身体质量指数', 'body', 'avg', '', 1, 1, null, 'BMI = 体重(kg) ÷ 身高(m)²。'],
    [Q + 'BodyFatPercentage', '体脂率', 'body', 'avg', '%', 100, 1, null, ''],
    [Q + 'LeanBodyMass', '去脂体重', 'body', 'avg', '公斤', 1, 1, null, ''],
    [Q + 'WaistCircumference', '腰围', 'body', 'avg', '厘米', 100, 0, null, ''],
    [Q + 'BodyTemperature', '体温', 'vitals', 'avg', '°C', 1, 1, null, ''],
    [Q + 'BasalBodyTemperature', '基础体温', 'cycle', 'avg', '°C', 1, 2, null, ''],
    [Q + 'BloodPressureSystolic', '收缩压', 'vitals', 'avg', 'mmHg', 1, 0, null, ''],
    [Q + 'BloodPressureDiastolic', '舒张压', 'vitals', 'avg', 'mmHg', 1, 0, null, ''],
    [Q + 'BloodGlucose', '血糖', 'vitals', 'avg', 'mmol/L', 1, 1, null, ''],
    [Q + 'BloodAlcoholContent', '血液酒精浓度', 'vitals', 'avg', '%', 100, 2, null, ''],
    [Q + 'ElectrodermalActivity', '皮肤电活动', 'vitals', 'avg', 'µS', 1, 2, null, ''],
    [Q + 'InsulinDelivery', '胰岛素注射', 'vitals', 'sum', 'IU', 1, 1, null, ''],
    [Q + 'NumberOfAlcoholicBeverages', '饮酒杯数', 'nutrition', 'sum', '杯', 1, 0, null, ''],
    // 正念与事件
    [C + 'MindfulSession', '正念', 'mind', 'event', '次', 1, 0, null, '用「正念」App 完成的呼吸/反思练习。'],
    [C + 'HandwashingEvent', '洗手', 'events', 'event', '次', 1, 0, null, 'Apple Watch 自动识别的洗手过程及时长。'],
    [C + 'ToothbrushingEvent', '刷牙', 'events', 'event', '次', 1, 0, null, ''],
    [C + 'Fatigue', '疲劳', 'events', 'event', '次', 1, 0, null, '你手动记录的症状。'],
    [C + 'Headache', '头痛', 'events', 'event', '次', 1, 0, null, ''],
    [C + 'Coughing', '咳嗽', 'events', 'event', '次', 1, 0, null, ''],
    [C + 'Fever', '发烧', 'events', 'event', '次', 1, 0, null, ''],
    [C + 'SoreThroat', '喉咙痛', 'events', 'event', '次', 1, 0, null, ''],
    [C + 'RunnyNose', '流鼻涕', 'events', 'event', '次', 1, 0, null, ''],
    [C + 'Nausea', '恶心', 'events', 'event', '次', 1, 0, null, ''],
    [C + 'MoodChanges', '情绪变化', 'events', 'event', '次', 1, 0, null, ''],
    [C + 'SleepChanges', '睡眠变化', 'events', 'event', '次', 1, 0, null, ''],
    [C + 'AppetiteChanges', '食欲变化', 'events', 'event', '次', 1, 0, null, ''],
    [C + 'Dizziness', '头晕', 'events', 'event', '次', 1, 0, null, ''],
    [C + 'ShortnessOfBreath', '气短', 'events', 'event', '次', 1, 0, null, ''],
    [C + 'ChestTightnessOrPain', '胸闷或胸痛', 'events', 'event', '次', 1, 0, null, ''],
    [C + 'RapidPoundingOrFlutteringHeartbeat', '心悸', 'events', 'event', '次', 1, 0, null, ''],
    [C + 'MenstrualFlow', '月经', 'cycle', 'event', '天', 1, 0, null, ''],
    [C + 'IntermenstrualBleeding', '经期间出血', 'cycle', 'event', '次', 1, 0, null, ''],
    [C + 'OvulationTestResult', '排卵测试', 'cycle', 'event', '次', 1, 0, null, ''],
    [C + 'SexualActivity', '性行为', 'cycle', 'event', '次', 1, 0, null, ''],
    [C + 'CervicalMucusQuality', '宫颈黏液', 'cycle', 'event', '次', 1, 0, null, '']
  ];

  const TYPES = {};
  RAW.forEach(function (r) {
    TYPES[r[0]] = { id: r[0], name: r[1], dom: r[2], kind: r[3], unit: r[4], scale: r[5], dec: r[6], up: r[7], desc: r[8] };
  });

  const DIETARY = {
    EnergyConsumed: ['膳食能量', '千卡'], Water: ['饮水', '毫升'], Caffeine: ['咖啡因', '毫克'], Protein: ['蛋白质', '克'], Carbohydrates: ['碳水化合物', '克'],
    FatTotal: ['总脂肪', '克'], FatSaturated: ['饱和脂肪', '克'], Sugar: ['糖', '克'], Fiber: ['膳食纤维', '克'], Sodium: ['钠', '毫克'], Cholesterol: ['胆固醇', '毫克'],
    Calcium: ['钙', '毫克'], Iron: ['铁', '毫克'], Potassium: ['钾', '毫克'], VitaminC: ['维生素 C', '毫克'], VitaminD: ['维生素 D', '微克']
  };

  function splitCamel(s) { return s.replace(/([a-z])([A-Z])/g, '$1 $2'); }
  function guess(id) {
    let short = id.replace(/^HK(Quantity|Category|Correlation|DataType)TypeIdentifier/, '').replace(/^HKDataTypeIdentifier/, '');
    if (/^Dietary/.test(short)) {
      const k = short.replace(/^Dietary/, '');
      const d = DIETARY[k];
      return { id: id, name: d ? d[0] : '膳食·' + splitCamel(k), dom: 'nutrition', kind: 'sum', unit: d ? d[1] : '', scale: 1, dec: 1, up: null, desc: '' };
    }
    const isCat = id.indexOf('HKCategoryTypeIdentifier') === 0;
    const sum = /Distance|Count|Energy|Flights|Time$|Usage|Fallen/.test(short) && !/Rate|Speed|Average/.test(short);
    return { id: id, name: splitCamel(short), dom: 'other', kind: isCat ? 'event' : (sum ? 'sum' : 'avg'), unit: '', scale: 1, dec: 1, up: null, desc: '', guessed: true };
  }
  function type(id) { return TYPES[id] || (TYPES[id] = guess(id)); }

  // 原始单位 → 目录里的显示单位：返回 v' = v*k + b
  const CONV = { 'km>公里': 1, 'm>公里': 0.001, 'mi>公里': 1.609344, 'm>米': 1, 'km>米': 1000, 'yd>米': 0.9144, 'cm>厘米': 1, 'm>厘米': 100, 'in>厘米': 2.54, 'cm>米': 0.01,
    'm/s>km/h': 3.6, 'km/hr>km/h': 1, 'mi/hr>km/h': 1.609344, 'm/s>m/s': 1, 'kg>公斤': 1, 'lb>公斤': 0.45359237, 'g>公斤': 0.001, 'mg/dL>mmol/L': 1 / 18.0182,
    'mL>毫升': 1, 'L>毫升': 1000, 'fl_oz_us>毫升': 29.5735, 'ms>毫秒': 1, 'kcal>千卡': 1, 'Cal>千卡': 1, 'kJ>千卡': 0.239006, 'L>升': 1, 'mL>升': 0.001,
    'mg>毫克': 1, 'g>克': 1, 'mg>克': 0.001, 'mcg>微克': 1, 'min>分钟': 1, 'count>步': 1, 'count>层': 1, 'count>次': 1 };
  function display(id, rawUnit) {
    const t = type(id), u = rawUnit || '';
    if (u === '%') return { k: 100, b: 0, unit: '%' };
    if (u === 'degF' && t.unit === '°C') return { k: 5 / 9, b: -32 * 5 / 9, unit: '°C' };
    if (/^mmol</.test(u)) return { k: 1, b: 0, unit: 'mmol/L' };
    const k = CONV[u + '>' + t.unit];
    if (k !== undefined) return { k: k, b: 0, unit: t.unit };
    return { k: 1, b: 0, unit: t.unit || (UNIT_CN[u] !== undefined ? UNIT_CN[u] : u) };
  }

  // 原始单位 → 显示单位（当目录里没给、或单位与目录预期不同时）
  const UNIT_CN = {
    'count': '', 'count/min': '次/分', 'kcal': '千卡', 'Cal': '千卡', 'km': '公里', 'm': '米', 'cm': '厘米', 'mi': '英里', 'ft': '英尺',
    'km/hr': 'km/h', 'm/s': 'm/s', 'ms': '毫秒', 'dBASPL': 'dB', 'dBHL': 'dB HL', 'degC': '°C', 'degF': '°F', 'kg': '公斤', 'lb': '磅',
    '%': '%', 'min': '分钟', 's': '秒', 'mL/min·kg': 'mL/kg/min', 'kcal/hr·kg': 'MET', 'W': '瓦', 'appleEffortScore': '分', 'mmHg': 'mmHg', 'mg/dL': 'mg/dL'
  };

  // 类别值的中文
  const CAT_CN = {
    HKCategoryValueAppleStandHourStood: '已站立', HKCategoryValueAppleStandHourIdle: '未站立',
    HKCategoryValueNotApplicable: '已记录',
    HKCategoryValueEnvironmentalAudioExposureEventMomentaryLimit: '瞬时音量超限',
    HKCategoryValueHeadphoneAudioExposureEventSevenDayLimit: '7 天累计超限',
    HKCategoryValueSeverityUnspecified: '未注明程度', HKCategoryValueSeverityNotPresent: '无', HKCategoryValueSeverityMild: '轻度',
    HKCategoryValueSeverityModerate: '中度', HKCategoryValueSeveritySevere: '重度',
    HKCategoryValuePresencePresent: '有', HKCategoryValuePresenceNotPresent: '无',
    HKCategoryValueMenstrualFlowUnspecified: '未注明', HKCategoryValueMenstrualFlowLight: '少量', HKCategoryValueMenstrualFlowMedium: '中等', HKCategoryValueMenstrualFlowHeavy: '大量', HKCategoryValueMenstrualFlowNone: '无'
  };
  const SLEEP_STAGE = [
    { code: 0, key: 'inbed', name: '在床', color: '#3A4A63' },
    { code: 1, key: 'asleep', name: '睡眠（未分期）', color: '#7F72E6' },
    { code: 2, key: 'awake', name: '清醒', color: '#E0663A' },
    { code: 3, key: 'core', name: '核心睡眠', color: '#7F72E6' },
    { code: 4, key: 'deep', name: '深度睡眠', color: '#5B4BC4' },
    { code: 5, key: 'rem', name: '快速动眼', color: '#B3ABF5' }
  ];

  const WORKOUT_CN = {
    Walking: '步行', Running: '跑步', Cycling: '骑行', HighIntensityIntervalTraining: '高强度间歇训练', Swimming: '游泳', Hiking: '徒步',
    Yoga: '瑜伽', FunctionalStrengthTraining: '功能性力量训练', TraditionalStrengthTraining: '传统力量训练', CoreTraining: '核心训练',
    Elliptical: '椭圆机', Rowing: '划船', StairClimbing: '爬楼梯', Stairs: '楼梯', Dance: '舞蹈', SocialDance: '社交舞', CardioDance: '有氧舞蹈',
    Basketball: '篮球', Soccer: '足球', Badminton: '羽毛球', TableTennis: '乒乓球', Tennis: '网球', Volleyball: '排球', Baseball: '棒球',
    MixedCardio: '混合有氧', Cooldown: '放松', Flexibility: '柔韧性训练', Pilates: '普拉提', Boxing: '拳击', MartialArts: '武术', Climbing: '攀岩',
    JumpRope: '跳绳', Skating: '滑冰', SnowSports: '雪上运动', DownhillSkiing: '高山滑雪', Snowboarding: '单板滑雪', Golf: '高尔夫',
    MindAndBody: '身心训练', Other: '其他', WheelchairWalkPace: '轮椅（步行速度）', WheelchairRunPace: '轮椅（跑步速度）', Barre: '芭蕾塑形',
    Kickboxing: '踢拳', TaiChi: '太极', PreparationAndRecovery: '准备与恢复', Fitness: '健身', Fishing: '钓鱼', Hunting: '狩猎', Play: '玩耍',
    WaterFitness: '水中健身', WaterSports: '水上运动', SurfingSports: '冲浪', PaddleSports: '划桨', Sailing: '帆船', Archery: '射箭', Bowling: '保龄球',
    Fencing: '击剑', Gymnastics: '体操', Handball: '手球', Hockey: '曲棍球', Lacrosse: '长曲棍球', Rugby: '橄榄球', Softball: '垒球', Squash: '壁球',
    Racquetball: '短柄墙球', TrackAndField: '田径', Wrestling: '摔跤', CrossTraining: '交叉训练', CrossCountrySkiing: '越野滑雪', Curling: '冰壶',
    EquestrianSports: '马术', AmericanFootball: '美式橄榄球', AustralianFootball: '澳式橄榄球', Cricket: '板球', DiscSports: '飞盘', Pickleball: '匹克球',
    SwimBikeRun: '铁人三项', Transition: '换项', UnderwaterDiving: '潜水', StepTraining: '踏板操', HandCycling: '手摇车'
  };
  // HKWorkoutActivityType 原始数值（PhysicalEffort 的 HKActivityType 元数据用到）
  const WORKOUT_CODE = { 13: 'Cycling', 37: 'Running', 52: 'Walking', 63: 'HighIntensityIntervalTraining', 46: 'Swimming', 24: 'Hiking', 50: 'TraditionalStrengthTraining', 20: 'FunctionalStrengthTraining', 57: 'Yoga', 16: 'Elliptical', 35: 'Rowing', 3000: 'Other' };
  function workoutName(type) {
    const k = String(type || '').replace('HKWorkoutActivityType', '');
    return WORKOUT_CN[k] || k || '体能训练';
  }

  const SEX_CN = { HKBiologicalSexMale: '男', HKBiologicalSexFemale: '女', HKBiologicalSexOther: '其他', HKBiologicalSexNotSet: '未设置' };
  const BLOOD_CN = { HKBloodTypeNotSet: '未设置', HKBloodTypeAPositive: 'A 型 Rh+', HKBloodTypeANegative: 'A 型 Rh−', HKBloodTypeBPositive: 'B 型 Rh+', HKBloodTypeBNegative: 'B 型 Rh−', HKBloodTypeABPositive: 'AB 型 Rh+', HKBloodTypeABNegative: 'AB 型 Rh−', HKBloodTypeOPositive: 'O 型 Rh+', HKBloodTypeONegative: 'O 型 Rh−' };
  const SKIN_CN = { HKFitzpatrickSkinTypeNotSet: '未设置', HKFitzpatrickSkinTypeI: 'I 型', HKFitzpatrickSkinTypeII: 'II 型', HKFitzpatrickSkinTypeIII: 'III 型', HKFitzpatrickSkinTypeIV: 'IV 型', HKFitzpatrickSkinTypeV: 'V 型', HKFitzpatrickSkinTypeVI: 'VI 型' };

  // 元数据键的中文名
  const META_CN = {
    HKWasUserEntered: '手动录入', HKMetadataKeyHeartRateMotionContext: '测量时的运动状态', HKMetadataKeySyncVersion: '同步版本', HKMetadataKeySyncIdentifier: '同步标识',
    HKActivityType: '活动类型', HKAlgorithmVersion: '算法版本', HKPhysicalEffortEstimationType: '强度估算方式', HKIndoorWorkout: '室内', HKTimeZone: '时区',
    HKMetadataKeyDevicePlacementSide: '手机放置位置', HKMetadataKeyBarometricPressure: '气压', HKMetadataKeyMaximumLightIntensity: '最大光照强度',
    HKMetadataKeyQuantityClampedToLowerBound: '低于可检测下限', HKMetadataKeyQuantityClampedToUpperBound: '高于可检测上限', HKVO2MaxTestType: '测试方式',
    HKDateOfEarliestDataUsedForEstimate: '估算所用最早数据', HKMetadataKeyAppleDeviceCalibrated: '设备已校准', HKMetadataKeyAudioExposureLevel: '音量水平',
    HKMetadataKeyHeartRateRecoveryActivityType: '恢复前的活动', HKMetadataKeyHeartRateRecoveryActivityDuration: '活动时长', HKMetadataKeyHeartRateRecoveryTestType: '测试方式',
    HKMetadataKeyHeartRateRecoveryMaxObservedRecoveryHeartRate: '恢复前最高心率', HKMetadataKeyUserMotionContext: '运动状态', HKHeartRateEventThreshold: '提醒阈值',
    HKWeatherTemperature: '气温', HKWeatherHumidity: '湿度', HKAverageMETs: '平均 MET', HKElevationAscended: '累计爬升', HKMetadataKeyAudioExposureDuration: '持续时长'
  };

  // 设备硬件标识 → 型号（只收录确定的；其余显示原始标识）
  const HARDWARE_CN = {
    'iPhone14,2': 'iPhone 13 Pro', 'iPhone14,3': 'iPhone 13 Pro Max', 'iPhone14,4': 'iPhone 13 mini', 'iPhone14,5': 'iPhone 13', 'iPhone14,6': 'iPhone SE（第 3 代）',
    'iPhone14,7': 'iPhone 14', 'iPhone14,8': 'iPhone 14 Plus', 'iPhone15,2': 'iPhone 14 Pro', 'iPhone15,3': 'iPhone 14 Pro Max', 'iPhone15,4': 'iPhone 15', 'iPhone15,5': 'iPhone 15 Plus',
    'iPhone16,1': 'iPhone 15 Pro', 'iPhone16,2': 'iPhone 15 Pro Max', 'iPhone17,1': 'iPhone 16 Pro', 'iPhone17,2': 'iPhone 16 Pro Max', 'iPhone17,3': 'iPhone 16', 'iPhone17,4': 'iPhone 16 Plus', 'iPhone17,5': 'iPhone 16e',
    'iPhone13,1': 'iPhone 12 mini', 'iPhone13,2': 'iPhone 12', 'iPhone13,3': 'iPhone 12 Pro', 'iPhone13,4': 'iPhone 12 Pro Max', 'iPhone12,1': 'iPhone 11', 'iPhone12,3': 'iPhone 11 Pro', 'iPhone12,5': 'iPhone 11 Pro Max', 'iPhone12,8': 'iPhone SE（第 2 代）',
    'Watch6,1': 'Apple Watch Series 7', 'Watch6,2': 'Apple Watch Series 7', 'Watch6,3': 'Apple Watch Series 7', 'Watch6,4': 'Apple Watch Series 7', 'Watch6,10': 'Apple Watch SE（第 2 代）', 'Watch6,11': 'Apple Watch SE（第 2 代）', 'Watch6,12': 'Apple Watch SE（第 2 代）', 'Watch6,13': 'Apple Watch SE（第 2 代）',
    'Watch6,14': 'Apple Watch Series 8', 'Watch6,15': 'Apple Watch Series 8', 'Watch6,16': 'Apple Watch Series 8', 'Watch6,17': 'Apple Watch Series 8', 'Watch6,18': 'Apple Watch Ultra',
    'Watch7,1': 'Apple Watch Series 9', 'Watch7,2': 'Apple Watch Series 9', 'Watch7,3': 'Apple Watch Series 9', 'Watch7,4': 'Apple Watch Series 9', 'Watch7,5': 'Apple Watch Ultra 2',
    'Watch7,8': 'Apple Watch Series 10', 'Watch7,9': 'Apple Watch Series 10', 'Watch7,10': 'Apple Watch Series 10', 'Watch7,11': 'Apple Watch Series 10', 'Watch7,12': 'Apple Watch Ultra 3',
    'Watch7,17': 'Apple Watch Series 11（42 毫米）', 'Watch7,18': 'Apple Watch Series 11（46 毫米）', 'Watch7,19': 'Apple Watch Series 11（42 毫米，蜂窝）', 'Watch7,20': 'Apple Watch Series 11（46 毫米，蜂窝）',
    'iPhone18,1': 'iPhone 17 Pro', 'iPhone18,2': 'iPhone 17 Pro Max', 'iPhone18,3': 'iPhone 17',
    'AirPods3,4': 'AirPods Pro 3', 'AirPods3,1': 'AirPods Pro（第 2 代，USB‑C）'
  };
  const BT_MODEL_CN = { '0x2002': 'AirPods（第 1 代）', '0x200f': 'AirPods（第 2 代）', '0x2013': 'AirPods（第 3 代）', '0x200e': 'AirPods Pro（第 1 代）', '0x2014': 'AirPods Pro（第 2 代）', '0x2024': 'AirPods Pro（第 2 代，USB‑C）', '0x200a': 'AirPods Max', '0x2012': 'Beats Fit Pro', '0x2027': 'AirPods Pro 3' };

  function deviceLabel(d) {
    if (!d) return '';
    const hw = HARDWARE_CN[d.hardware];
    if (hw) return hw;
    const bt = BT_MODEL_CN[(d.model || '').toLowerCase()];
    if (bt) return bt;
    return '';
  }
  function deviceKind(d) {
    const m = (d.model || '') + ' ' + (d.hardware || '') + ' ' + (d.name || '');
    if (/Watch/i.test(m)) return 'watch';
    if (/iPhone/i.test(m)) return 'phone';
    if (/iPad/i.test(m)) return 'tablet';
    if (/AirPods|Beats|Buds|耳机|TH30|HD\d|FreeBuds|Headphone|Earbud|Solo|Studio|Powerbeats/i.test(m) || /^0x/.test(d.model || '')) return 'audio';
    return 'other';
  }

  HL.CAT = {
    DOMAINS: DOMAINS, type: type, display: display, TYPES: TYPES, UNIT_CN: UNIT_CN, CAT_CN: CAT_CN, SLEEP_STAGE: SLEEP_STAGE, workoutName: workoutName, WORKOUT_CODE: WORKOUT_CODE,
    SEX_CN: SEX_CN, BLOOD_CN: BLOOD_CN, SKIN_CN: SKIN_CN, META_CN: META_CN, HARDWARE_CN: HARDWARE_CN, BT_MODEL_CN: BT_MODEL_CN, deviceLabel: deviceLabel, deviceKind: deviceKind,
    catName: function (s) { return CAT_CN[s] || String(s).replace(/^HKCategoryValue/, ''); }
  };
})();
