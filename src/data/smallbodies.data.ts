import type { BodyInfo } from './types';

/** Dwarf planets and famous comets. */
export const DWARF_PLANET_INFO: BodyInfo[] = [
  {
    id: 'ceres',
    name: { zh: '谷神星', en: 'Ceres' },
    kind: 'dwarf',
    tagline: {
      zh: '小行星带中唯一的矮行星，也是第一颗被发现的小行星',
      en: 'The only dwarf planet in the asteroid belt, and the first asteroid ever found',
    },
    description: {
      zh: '谷神星占据了整个小行星带质量的近三分之一，直径约 940 公里。它 1801 年被发现时曾被当作一颗行星，半个世纪后随着更多小天体的发现被降级为小行星，2006 年又被重新归类为矮行星。黎明号探测器发现它含有大量水冰，表面的亮斑是碳酸钠沉积。',
      en: 'Ceres holds nearly a third of the asteroid belt’s mass in a body about 940 km across. When it was found in 1801 it was counted as a planet; half a century of further discoveries demoted it to an asteroid, and in 2006 it was reclassified again as a dwarf planet. The Dawn spacecraft found it rich in water ice, with bright patches of sodium carbonate on the surface.',
    },
    facts: {
      zh: [
        '它是小行星带中最大的天体，独占带内总质量的约 32%。',
        '奥卡托坑中的亮斑由碳酸钠组成，是地下咸水渗出后蒸发留下的盐壳，说明谷神星至今仍有"地质活动"。',
        '谷神星约 25% 的质量是水冰，其含水量可能超过地球全部淡水。',
        '2015—2018 年黎明号成为首个环绕矮行星的探测器，也是首个先后环绕两个天体的探测器。',
        '中文名"谷神星"来自罗马神话的农业女神刻瑞斯。',
      ],
      en: [
        'It is the largest object in the asteroid belt and accounts for about 32% of the belt’s total mass.',
        'The bright spots in Occator crater are sodium carbonate — salt crusts left when briny water seeped up and evaporated, which means Ceres is still geologically active.',
        'About 25% of its mass is water ice, possibly more fresh water than Earth holds.',
        'Dawn orbited it from 2015 to 2018, the first spacecraft to orbit a dwarf planet and the first to orbit two bodies in succession.',
        'It is named after Ceres, the Roman goddess of agriculture.',
      ],
    },
    physical: { radiusKm: 473, massKg: 9.3839e20, density: 2.162, gravity: 0.28, escapeVelocity: 0.51, rotationHours: 9.074, axialTilt: 4, albedo: 0.09, meanTempC: -105 },
    orbit: { semiMajorAxis: 2.7658, eccentricity: 0.0785, inclination: 10.59, periodDays: 1681.63, speedKms: 17.9 },
    discovery: { by: { zh: '朱塞普·皮亚齐', en: 'Giuseppe Piazzi' }, year: '1801' },
    missions: { zh: ['黎明号 Dawn (2015—2018)'], en: ['Dawn (2015—2018)'] },
    color: '#8f8880', color2: '#5c5650',
  },
  {
    id: 'pluto',
    name: { zh: '冥王星', en: 'Pluto' },
    kind: 'dwarf',
    symbol: '♇',
    tagline: {
      zh: '曾经的第九大行星，一个拥有氮冰冰川和蓝色天空的世界',
      en: 'The former ninth planet — a world of nitrogen glaciers under a blue sky',
    },
    description: {
      zh: '冥王星在 1930 年被发现，做了 76 年的"第九大行星"，直到 2006 年国际天文联合会重新定义行星后被划为矮行星。2015 年新视野号飞掠揭示了一个远比预想复杂的世界：巨大的氮冰平原、3500 米高的水冰山脉、多层大气霾，甚至可能有地下海洋。',
      en: 'Discovered in 1930, Pluto spent 76 years as the ninth planet until the IAU redefined the word in 2006. The New Horizons flyby in 2015 revealed something far more complex than anyone expected: vast nitrogen ice plains, water-ice mountains 3500 m tall, layered atmospheric haze, and possibly a subsurface ocean.',
    },
    facts: {
      zh: [
        '冥王星与海王星保持 3:2 轨道共振，每绕太阳 2 圈海王星恰好绕 3 圈，因此两者永远不会相撞。',
        '轨道偏心率 0.249，1979—1999 年间它比海王星更靠近太阳。',
        '"史波尼克平原"是一片面积超过 100 万平方公里的氮冰冰川，表面的多边形是冰层对流的痕迹。',
        '它的大气会随着轨道位置冷凝、升华，气压变化可达数倍；新视野号拍到了 20 多层蓝色的大气霾。',
        '冥王星有 5 颗卫星，其中冥卫一大到让两者围绕共同质心旋转。',
        '它的中文名"冥王星"和西文名 Pluto 都来自罗马神话的冥界之神。',
      ],
      en: [
        'Pluto holds a 3:2 resonance with Neptune — two orbits for Neptune’s three — so the two can never collide.',
        'Its orbit is eccentric enough (0.249) that between 1979 and 1999 it was closer to the Sun than Neptune.',
        'Sputnik Planitia is a nitrogen glacier over a million square kilometres in area, its surface polygons the signature of convecting ice.',
        'The atmosphere freezes out and sublimates as the orbit changes, varying the pressure several-fold; New Horizons photographed more than twenty layers of blue haze.',
        'It has five moons, and Charon is large enough that the pair orbit a point outside Pluto itself.',
        'Both its English and Chinese names come from the Roman god of the underworld.',
      ],
    },
    physical: {
      radiusKm: 1188.3, massKg: 1.303e22, density: 1.854, gravity: 0.62, escapeVelocity: 1.21,
      rotationHours: -153.293, axialTilt: 122.53, albedo: 0.52, meanTempC: -229, minTempC: -240,
      atmosphere: {
        zh: '氮、甲烷、一氧化碳（约 1 帕）',
        en: 'Nitrogen, methane and carbon monoxide, about 1 Pa',
      },
      moonCount: 5,
    },
    orbit: { semiMajorAxis: 39.482, eccentricity: 0.2488, inclination: 17.14, periodDays: 90560, speedKms: 4.67 },
    discovery: { by: { zh: '克莱德·汤博', en: 'Clyde Tombaugh' }, year: '1930' },
    missions: { zh: ['新视野号 New Horizons (2015 飞掠)'], en: ['New Horizons (flyby, 2015)'] },
    color: '#c9b8a3', color2: '#8a7460',
  },
  {
    id: 'haumea',
    name: { zh: '妊神星', en: 'Haumea' },
    kind: 'dwarf',
    tagline: {
      zh: '橄榄球形状的矮行星，自转一圈不到 4 小时，还带着光环',
      en: 'A rugby-ball dwarf planet that spins in under four hours — and has rings',
    },
    description: {
      zh: '妊神星是已知自转最快的大型天体，3.9 小时转一圈的离心力把它拉成了一个长轴 2100 公里的橄榄球。2017 年天文学家通过掩星观测发现它拥有一圈光环——这是首次在海王星轨道外的天体上发现环系统。',
      en: 'Haumea is the fastest-spinning large body known: one turn every 3.9 hours, and the centrifugal force has stretched it into an ellipsoid 2100 km along its long axis. A stellar occultation in 2017 revealed a ring — the first ever found around a body beyond Neptune.',
    },
    facts: {
      zh: [
        '自转周期仅 3.9 小时，是直径超过 100 公里的天体中转得最快的。',
        '极端的自转让它被拉成三轴椭球，长轴约 2100 公里，短轴只有 1074 公里。',
        '2017 年发现它拥有一圈宽约 70 公里的光环，是首个被发现有环的海外天体。',
        '它有两颗卫星和一个"碰撞家族"——一次远古的巨大撞击把它的冰壳打碎并抛散开来。',
      ],
      en: [
        'Its 3.9-hour rotation is the fastest of any body more than 100 km across.',
        'That spin has pulled it into a triaxial ellipsoid, 2100 km on the long axis and only 1074 km on the short one.',
        'The ring found in 2017, about 70 km wide, was the first known around a trans-Neptunian object.',
        'It has two moons and a collisional family — the scattered debris of an ancient impact that shattered its icy crust.',
      ],
    },
    physical: { radiusKm: 816, massKg: 4.006e21, density: 1.885, gravity: 0.401, rotationHours: 3.915, albedo: 0.51, meanTempC: -241, moonCount: 2 },
    orbit: { semiMajorAxis: 43.13, eccentricity: 0.195, inclination: 28.21, periodDays: 103468, speedKms: 4.53 },
    discovery: {
      by: { zh: '西班牙与美国团队（存在争议）', en: 'Spanish and American teams (disputed)' },
      year: '2004',
    },
    color: '#d6d0c6', color2: '#9a9188',
  },
  {
    id: 'makemake',
    name: { zh: '鸟神星', en: 'Makemake' },
    kind: 'dwarf',
    tagline: {
      zh: '柯伊伯带第二亮的天体，表面覆盖着甲烷冰',
      en: 'The second-brightest object in the Kuiper belt, frosted with methane ice',
    },
    description: {
      zh: '鸟神星直径约 1430 公里，表面覆盖着甲烷和乙烷的冰霜，反照率很高。它的发现（连同阋神星）直接促成了 2006 年行星定义的修订。',
      en: 'Makemake is about 1430 km across and highly reflective, coated in methane and ethane frost. Its discovery, alongside that of Eris, is what forced the 2006 redefinition of "planet".',
    },
    facts: {
      zh: [
        '它的名字来自复活节岛拉帕努伊人的创世神，因为它在复活节后不久被发现。',
        '表面覆盖着直径可达 1 厘米的甲烷冰颗粒。',
        '2016 年发现它有一颗很暗的卫星 MK2，反照率只有主星的 1/25。',
        '它是柯伊伯带中除冥王星外最亮的天体。',
      ],
      en: [
        'It is named for the creator god of the Rapa Nui of Easter Island, because it was found shortly after Easter.',
        'Its surface carries methane ice grains up to a centimetre across.',
        'A very dark moon, MK2, was found in 2016 — it reflects only a twenty-fifth as much light as Makemake itself.',
        'It is the brightest Kuiper belt object after Pluto.',
      ],
    },
    physical: { radiusKm: 715, massKg: 3.1e21, density: 1.7, gravity: 0.4, rotationHours: 22.83, albedo: 0.82, meanTempC: -239, moonCount: 1 },
    orbit: { semiMajorAxis: 45.43, eccentricity: 0.161, inclination: 28.98, periodDays: 111845, speedKms: 4.42 },
    discovery: { by: { zh: '迈克尔·布朗团队', en: 'Michael Brown’s team' }, year: '2005' },
    color: '#c08a6a', color2: '#8a5f48',
  },
  {
    id: 'eris',
    name: { zh: '阋神星', en: 'Eris' },
    kind: 'dwarf',
    tagline: {
      zh: '比冥王星更重的"麻烦制造者"，它把冥王星挤出了行星行列',
      en: 'The troublemaker heavier than Pluto — and the reason Pluto lost its status',
    },
    description: {
      zh: '阋神星的直径与冥王星几乎相同，质量却大 27%。2005 年它的发现让天文学界不得不面对一个问题：如果冥王星算行星，那阋神星也得算，后面可能还有几十个。2006 年国际天文联合会因此重新定义了"行星"，冥王星和阋神星一同被归入矮行星。',
      en: 'Eris is almost exactly Pluto’s diameter but 27% more massive. Its discovery in 2005 forced an awkward question: if Pluto counted as a planet then so did Eris, and probably dozens more to come. The IAU redefined the word in 2006, and Pluto and Eris were classed together as dwarf planets.',
    },
    facts: {
      zh: [
        '它的名字来自希腊神话中挑起特洛伊战争的不和女神厄里斯，恰如其分。',
        '反照率高达 0.96，几乎和新雪一样白——因为它的大气在远日点完全冻结在了地表。',
        '轨道偏心率 0.44，近日点 38 AU、远日点 97.5 AU，公转一圈要 558 年。',
        '目前它距太阳约 96 AU，是已知最遥远的矮行星之一。',
      ],
      en: [
        'It is named, aptly, for the Greek goddess of discord who started the Trojan War.',
        'Its albedo of 0.96 makes it nearly as white as fresh snow, because at aphelion its atmosphere freezes out entirely onto the surface.',
        'Its orbit is eccentric (0.44), running from 38 AU at perihelion to 97.5 AU at aphelion over 558 years.',
        'It currently sits about 96 AU from the Sun, one of the most distant dwarf planets known.',
      ],
    },
    physical: { radiusKm: 1163, massKg: 1.6466e22, density: 2.43, gravity: 0.82, escapeVelocity: 1.38, rotationHours: 25.9, albedo: 0.96, meanTempC: -243, moonCount: 1 },
    orbit: { semiMajorAxis: 67.78, eccentricity: 0.4416, inclination: 44.04, periodDays: 203830, speedKms: 3.44 },
    discovery: { by: { zh: '迈克尔·布朗团队', en: 'Michael Brown’s team' }, year: '2005' },
    color: '#e0e2e5', color2: '#a9adb2',
  },
  {
    id: 'quaoar',
    name: { zh: '创神星', en: 'Quaoar' },
    kind: 'dwarf',
    tagline: {
      zh: '拥有一圈"不该存在"的光环',
      en: 'It has a ring that should not be able to exist',
    },
    description: {
      zh: '创神星直径约 1110 公里，2023 年天文学家发现它拥有一圈位于洛希极限之外的光环，颠覆了关于环系统如何形成的认知。',
      en: 'Quaoar is about 1110 km across, and in 2023 astronomers found it has a ring sitting outside its Roche limit — which upends the standard account of how rings survive.',
    },
    facts: {
      zh: [
        '2023 年发现的光环位于洛希极限之外——按理说那里的物质应该早已聚集成卫星。',
        '它有一颗卫星"Weywot"，直径约 170 公里。',
        '轨道近圆（偏心率仅 0.039），是柯伊伯带中的"经典天体"。',
      ],
      en: [
        'The ring found in 2023 lies beyond the Roche limit, where the material should long since have gathered into a moon.',
        'It has a moon, Weywot, about 170 km across.',
        'Its orbit is nearly circular (eccentricity 0.039), making it a classical Kuiper belt object.',
      ],
    },
    physical: { radiusKm: 555, massKg: 1.2e21, density: 1.7, rotationHours: 17.68, albedo: 0.11, meanTempC: -229, moonCount: 1 },
    orbit: { semiMajorAxis: 43.69, eccentricity: 0.0392, inclination: 7.99, periodDays: 105495, speedKms: 4.52 },
    discovery: {
      by: { zh: '查德·特鲁希略与迈克尔·布朗', en: 'Chad Trujillo and Michael Brown' },
      year: '2002',
    },
    color: '#9a7060', color2: '#684a3e',
  },
  {
    id: 'gonggong',
    name: { zh: '共工星', en: 'Gonggong' },
    kind: 'dwarf',
    tagline: {
      zh: '以中国神话水神命名，自转慢得异常',
      en: 'Named for a Chinese water god, and turning unusually slowly',
    },
    description: {
      zh: '共工星是已知最大的柯伊伯带天体之一，直径约 1230 公里。它的名字来自中国神话中撞倒不周山的水神共工，卫星名为"相柳"。',
      en: 'Gonggong is one of the largest Kuiper belt objects known, about 1230 km across. It is named for the Chinese water god who toppled the pillar of heaven, and its moon is called Xiangliu.',
    },
    facts: {
      zh: [
        '它和它的卫星"相柳"都以中国神话命名，是国际天文联合会正式采用的中国神话天体名。',
        '自转周期约 22.4 小时，比同类天体慢很多，可能是卫星的潮汐作用刹住了它。',
        '表面探测到水冰和可能的甲烷，颜色偏红。',
        '远日点达 101 AU，是目前最遥远的已编号天体之一。',
      ],
      en: [
        'It and its moon Xiangliu both carry names from Chinese mythology, formally adopted by the IAU.',
        'It rotates in about 22.4 hours, far slower than similar bodies — its moon has probably applied a tidal brake.',
        'Water ice and possibly methane have been detected on its reddish surface.',
        'Its aphelion reaches 101 AU, among the most distant of any numbered object.',
      ],
    },
    physical: { radiusKm: 615, massKg: 1.75e21, density: 1.74, rotationHours: 22.4, albedo: 0.14, meanTempC: -242, moonCount: 1 },
    orbit: { semiMajorAxis: 67.38, eccentricity: 0.5019, inclination: 30.7, periodDays: 202000, speedKms: 3.4 },
    discovery: {
      by: { zh: '施瓦姆、布朗与拉比诺维茨', en: 'Schwamb, Brown and Rabinowitz' },
      year: '2007',
    },
    color: '#8f4f42', color2: '#5e332b',
  },
  {
    id: 'sedna',
    name: { zh: '赛德娜', en: 'Sedna' },
    kind: 'dwarf',
    tagline: {
      zh: '来自内奥尔特云的红色流浪者，一圈要走 11400 年',
      en: 'A red wanderer from the inner Oort cloud, 11,400 years to the orbit',
    },
    description: {
      zh: '赛德娜的近日点在 76 AU 之外，远日点则达到 937 AU——它从未真正靠近过太阳系的行星区域。这样的轨道无法用已知的海王星扰动解释，因此它被认为是"内奥尔特云"的首个成员，甚至可能是"第九行星"假说的证据之一。',
      en: 'Sedna’s perihelion lies beyond 76 AU and its aphelion reaches 937 AU, so it never truly enters the planetary region at all. No known Neptune perturbation can produce such an orbit, which is why it is taken as the first member of the inner Oort cloud — and cited as possible evidence for a Planet Nine.',
    },
    facts: {
      zh: [
        '公转一圈需要约 11400 年，上一次经过近日点时地球上还是石器时代。',
        '它的近日点距离太阳 76 AU，比海王星远一倍多，海王星的引力无法解释这样的轨道。',
        '表面是太阳系中最红的天体之一，颜色接近火星。',
        '它将在 2076 年前后到达近日点，是本世纪最好的观测窗口。',
      ],
      en: [
        'One orbit takes about 11,400 years; the last time it passed perihelion, Earth was in the Stone Age.',
        'Its perihelion is 76 AU, more than twice Neptune’s distance, and Neptune’s gravity cannot account for the orbit.',
        'It is one of the reddest objects in the Solar System, close to the colour of Mars.',
        'It reaches perihelion around 2076, the best observing window of the century.',
      ],
    },
    physical: { radiusKm: 498, massKg: 1e21, rotationHours: 10.27, albedo: 0.32, meanTempC: -261 },
    orbit: { semiMajorAxis: 506, eccentricity: 0.8496, inclination: 11.93, periodDays: 4163850, speedKms: 1.04 },
    discovery: { by: { zh: '迈克尔·布朗团队', en: 'Michael Brown’s team' }, year: '2003' },
    color: '#a03f2e', color2: '#5f2419',
  },
];

export const COMET_INFO: BodyInfo[] = [
  {
    id: 'halley',
    name: { zh: '哈雷彗星', en: '1P/Halley' },
    kind: 'comet',
    tagline: {
      zh: '人类历史上记录最完整的彗星，76 年回归一次',
      en: 'The best-documented comet in history, returning every 76 years',
    },
    description: {
      zh: '哈雷彗星是第一颗被确认周期性回归的彗星。1705 年哈雷根据牛顿力学推算它会在 1758 年再次出现，虽然他没能活着看到，但预言的应验成为万有引力理论的一次里程碑式胜利。中国《春秋》中公元前 613 年的记录，是它最早的可靠观测。',
      en: 'Halley was the first comet recognised as periodic. In 1705 Edmond Halley used Newtonian mechanics to predict its return in 1758; he did not live to see it, but the prediction coming true was a landmark victory for the theory of gravitation. The earliest reliable sighting is a Chinese record in the Spring and Autumn Annals from 613 BC.',
    },
    facts: {
      zh: [
        '中国《春秋》记载的公元前 613 年"秋七月，有星孛入于北斗"，是哈雷彗星最早的可靠记录。',
        '它的轨道是逆行的（倾角 162°），周期在 74—79 年之间波动。',
        '上一次回归是 1986 年，乔托号探测器近距离拍到了它 15×8 公里的漆黑彗核。',
        '下一次回归将在 2061 年 7 月，届时的观测条件比 1986 年好得多。',
        '它留下的尘埃形成了两场流星雨：5 月的宝瓶座 η 流星雨和 10 月的猎户座流星雨。',
      ],
      en: [
        'The Spring and Autumn Annals record a "broom star entering the Big Dipper" in the seventh month of 613 BC — the earliest reliable sighting.',
        'Its orbit is retrograde, inclined 162°, and the period wanders between 74 and 79 years.',
        'The last return was in 1986, when Giotto photographed its pitch-black 15 × 8 km nucleus from close range.',
        'The next return is July 2061, and the viewing conditions will be far better than in 1986.',
        'Dust it has shed produces two meteor showers: the Eta Aquariids in May and the Orionids in October.',
      ],
    },
    physical: { radiusKm: 5.5, massKg: 2.2e14, density: 0.6, albedo: 0.04, rotationHours: 52.8 },
    orbit: { semiMajorAxis: 17.834, eccentricity: 0.96714, inclination: 162.26, periodDays: 27510, speedKms: 3.7 },
    discovery: {
      by: { zh: '埃德蒙·哈雷（确认周期性）', en: 'Edmond Halley (recognised as periodic)' },
      year: '1705',
    },
    missions: {
      zh: ['乔托号 Giotto (1986)', '维加 1/2 号', '先驱号'],
      en: ['Giotto (1986)', 'Vega 1/2', 'Sakigake'],
    },
    color: '#a8b8c8', color2: '#5a6674',
  },
  {
    id: 'encke',
    name: { zh: '恩克彗星', en: '2P/Encke' },
    kind: 'comet',
    tagline: {
      zh: '周期最短的彗星，3.3 年就回来一次',
      en: 'The shortest period of any comet — back every 3.3 years',
    },
    description: {
      zh: '恩克彗星的公转周期只有 3.3 年，是所有已知彗星中最短的。它的轨道完全位于木星轨道以内。',
      en: 'Encke’s 3.3-year period is the shortest of any known comet, and its orbit lies entirely inside Jupiter’s.',
    },
    facts: {
      zh: [
        '3.3 年的周期是所有已知彗星中最短的，它已经被观测到超过 60 次回归。',
        '它是金牛座流星雨的母体，也可能与通古斯大爆炸有关（尚有争议）。',
        '经过反复接近太阳，它的挥发物质已所剩无几，亮度远不如从前。',
      ],
      en: [
        'Its 3.3-year period is the shortest known, and it has now been observed through more than 60 returns.',
        'It is the parent of the Taurid meteor shower, and has been linked — controversially — to the Tunguska event.',
        'Repeated close passes have stripped away most of its volatiles, so it is far fainter than it once was.',
      ],
    },
    physical: { radiusKm: 2.4, massKg: 1e13, albedo: 0.046, rotationHours: 11 },
    orbit: { semiMajorAxis: 2.2152, eccentricity: 0.84833, inclination: 11.78, periodDays: 1204, speedKms: 11.5 },
    discovery: {
      by: { zh: '梅香发现、恩克算出周期', en: 'Found by Méchain, period computed by Encke' },
      year: '1786 / 1819',
    },
    color: '#9fb0a8', color2: '#556058',
  },
  {
    id: 'swift-tuttle',
    name: { zh: '斯威夫特-塔特尔彗星', en: '109P/Swift-Tuttle' },
    kind: 'comet',
    tagline: {
      zh: '英仙座流星雨的母体，也是潜在的"太阳系最危险天体"',
      en: 'Parent of the Perseids, and once called the most dangerous object known',
    },
    description: {
      zh: '这颗直径 26 公里的彗星每 133 年回归一次，它遗留的尘埃带每年 8 月为地球带来英仙座流星雨。',
      en: 'This 26-km comet returns every 133 years, and the dust trail it leaves behind gives Earth the Perseid meteor shower every August.',
    },
    facts: {
      zh: [
        '它是每年 8 月英仙座流星雨的母体，高峰时每小时可见 60—100 颗流星。',
        '彗核直径约 26 公里，比造成恐龙灭绝的那颗小行星还大一倍多。',
        '它的轨道与地球轨道非常接近，曾被称为"太阳系中最危险的天体"，不过精确计算显示未来上千年都不会撞击地球。',
        '下一次回归是 2126 年。',
      ],
      en: [
        'It is the parent of the August Perseids, which peak at 60—100 meteors an hour.',
        'Its nucleus is about 26 km across, more than twice the size of the asteroid that ended the dinosaurs.',
        'Its orbit passes close enough to Earth’s that it was once called the most dangerous object in the Solar System, though precise calculations rule out an impact for at least a thousand years.',
        'The next return is in 2126.',
      ],
    },
    physical: { radiusKm: 13, massKg: 1.7e16, albedo: 0.04, rotationHours: 67.5 },
    orbit: { semiMajorAxis: 26.092, eccentricity: 0.963, inclination: 113.45, periodDays: 48685, speedKms: 3.0 },
    discovery: {
      by: { zh: '刘易斯·斯威夫特与霍勒斯·塔特尔', en: 'Lewis Swift and Horace Tuttle' },
      year: '1862',
    },
    color: '#b0bcc6', color2: '#5c6670',
  },
  {
    id: 'tempel-tuttle',
    name: { zh: '坦普尔-塔特尔彗星', en: '55P/Tempel-Tuttle' },
    kind: 'comet',
    tagline: {
      zh: '每 33 年带来一场狮子座流星暴',
      en: 'Every 33 years it brings a Leonid meteor storm',
    },
    description: {
      zh: '这颗彗星每 33 年回归一次，它经过后的几年里，地球会穿过新鲜密集的尘埃带，引发壮观的狮子座流星暴。',
      en: 'This comet returns every 33 years, and in the years just afterwards Earth ploughs through a fresh dense dust trail, producing spectacular Leonid storms.',
    },
    facts: {
      zh: [
        '1833 年的狮子座流星暴每小时出现超过 10 万颗流星，直接催生了现代流星天文学。',
        '1966 年的流星暴峰值达到每小时 15 万颗，相当于每秒 40 颗。',
        '1999—2002 年它再次带来强流星雨，下一次强活动预计在 2033 年前后。',
      ],
      en: [
        'The 1833 Leonid storm delivered over 100,000 meteors an hour and effectively founded modern meteor astronomy.',
        'The 1966 storm peaked at 150,000 an hour — about forty meteors every second.',
        'Strong showers returned in 1999—2002, and the next major activity is expected around 2033.',
      ],
    },
    physical: { radiusKm: 1.8, massKg: 1.2e13, albedo: 0.04, rotationHours: 15.3 },
    orbit: { semiMajorAxis: 10.337, eccentricity: 0.9055, inclination: 162.49, periodDays: 12140, speedKms: 4.8 },
    discovery: {
      by: { zh: '恩斯特·坦普尔与霍勒斯·塔特尔', en: 'Ernst Tempel and Horace Tuttle' },
      year: '1865',
    },
    color: '#a6b4bd', color2: '#525c63',
  },
  {
    id: 'churyumov-gerasimenko',
    name: { zh: '丘留莫夫-格拉西缅科彗星', en: '67P/Churyumov-Gerasimenko' },
    kind: 'comet',
    tagline: {
      zh: '人类第一次环绕并登陆的彗星，形状像一只橡皮鸭',
      en: 'The first comet we ever orbited and landed on, shaped like a rubber duck',
    },
    description: {
      zh: '罗塞塔号在 2014 年抵达 67P，成为首个环绕彗星运行的探测器，并释放菲莱着陆器完成了人类首次彗星软着陆。它由两块天体缓慢黏合而成，因此呈现独特的双瓣"橡皮鸭"形状。',
      en: 'Rosetta reached 67P in 2014 as the first spacecraft ever to orbit a comet, and released the Philae lander for the first soft landing on one. The comet formed when two bodies gently merged, which is why it has its distinctive two-lobed rubber-duck shape.',
    },
    facts: {
      zh: [
        '2014 年罗塞塔号成为首个环绕彗星的探测器，菲莱着陆器完成了人类首次彗星软着陆。',
        '它的双瓣形状说明它由两个天体在低速下缓慢黏合而成。',
        '罗塞塔在它的彗发中探测到了甘氨酸——一种构成蛋白质的氨基酸。',
        '它上面的水的氘氢比与地球海水不同，削弱了"地球的水来自彗星"的假说。',
      ],
      en: [
        'Rosetta became the first spacecraft to orbit a comet in 2014, and Philae made the first soft landing on one.',
        'Its two-lobed shape shows it formed from two bodies merging at low speed.',
        'Rosetta detected glycine — an amino acid used to build proteins — in its coma.',
        'The deuterium-to-hydrogen ratio of its water differs from Earth’s seawater, weakening the idea that comets delivered our oceans.',
      ],
    },
    physical: { radiusKm: 2.0, massKg: 9.982e12, density: 0.533, albedo: 0.06, rotationHours: 12.4 },
    orbit: { semiMajorAxis: 3.4626, eccentricity: 0.64102, inclination: 7.04, periodDays: 2354, speedKms: 12.0 },
    discovery: {
      by: { zh: '克利姆·丘留莫夫与斯韦特兰娜·格拉西缅科', en: 'Klim Churyumov and Svetlana Gerasimenko' },
      year: '1969',
    },
    missions: { zh: ['罗塞塔号与菲莱 (2014—2016)'], en: ['Rosetta and Philae (2014—2016)'] },
    color: '#8b8377', color2: '#4a453e',
  },
  {
    id: 'hale-bopp',
    name: { zh: '海尔-波普彗星', en: 'C/1995 O1 Hale-Bopp' },
    kind: 'comet',
    tagline: {
      zh: '20 世纪最壮观的大彗星，肉眼可见持续了 18 个月',
      en: 'The great comet of the 20th century, naked-eye visible for 18 months',
    },
    description: {
      zh: '海尔-波普彗星在 1997 年成为一代人的共同记忆。它的彗核异常巨大（直径 40—80 公里），因此即使距离不算近也极其明亮。',
      en: 'Hale-Bopp became a shared memory for a generation in 1997. Its nucleus is unusually large at 40—80 km across, which is why it shone so brightly even without coming especially close.',
    },
    facts: {
      zh: [
        '它以肉眼可见的状态持续了 18 个月，打破了此前保持了 180 年的纪录。',
        '彗核直径估计有 40—80 公里，是普通彗星的十倍以上。',
        '它同时展现了黄白色的尘埃尾和蓝色的离子尾，还有罕见的第三条钠尾。',
        '下一次回归要等到公元 4385 年前后。',
      ],
      en: [
        'It stayed visible to the naked eye for 18 months, breaking a record that had stood for 180 years.',
        'Its nucleus is estimated at 40—80 km across, more than ten times a typical comet.',
        'It showed a yellow-white dust tail, a blue ion tail, and a rare third tail made of sodium.',
        'It will not return until around the year 4385.',
      ],
    },
    physical: { radiusKm: 30, massKg: 1.3e17, albedo: 0.04, rotationHours: 11.35 },
    orbit: { semiMajorAxis: 186, eccentricity: 0.99509, inclination: 89.43, periodDays: 925000, speedKms: 1.1 },
    discovery: { by: { zh: '艾伦·海尔与托马斯·波普', en: 'Alan Hale and Thomas Bopp' }, year: '1995' },
    color: '#cfe0ee', color2: '#7a8fa5',
  },
  {
    id: 'hyakutake',
    name: { zh: '百武彗星', en: 'C/1996 B2 Hyakutake' },
    kind: 'comet',
    tagline: {
      zh: '拖着太阳系已知最长尾巴的彗星',
      en: 'It trails the longest comet tail ever measured',
    },
    description: {
      zh: '百武彗星在 1996 年 3 月从距地球仅 0.1 AU 处掠过，它的彗尾在天空中横跨超过 80°，实测长度达 5.7 亿公里。',
      en: 'Hyakutake swept past just 0.1 AU from Earth in March 1996. Its tail stretched more than 80° across the sky and measured 570 million km end to end.',
    },
    facts: {
      zh: [
        '它的彗尾实测长度超过 3.8 AU（约 5.7 亿公里），是已知最长的彗尾。',
        '1996 年它从距地球 0.1 AU 处掠过，是 200 年来最接近地球的彗星之一。',
        '天文学家首次在彗星上探测到 X 射线辐射，来源是太阳风与彗发的电荷交换。',
        '它的轨道周期因为受木星扰动，从大约 1.7 万年延长到了约 7 万年。',
      ],
      en: [
        'Its tail was measured at more than 3.8 AU (about 570 million km), the longest ever recorded.',
        'The 1996 pass at 0.1 AU made it one of the closest cometary approaches in 200 years.',
        'It was the first comet found to emit X-rays, produced by charge exchange between the solar wind and its coma.',
        'Jupiter’s perturbations stretched its period from roughly 17,000 years to about 70,000.',
      ],
    },
    physical: { radiusKm: 2.3, massKg: 8.8e12, albedo: 0.04, rotationHours: 6.23 },
    orbit: { semiMajorAxis: 1165, eccentricity: 0.9998, inclination: 124.92, periodDays: 14535000, speedKms: 0.4 },
    discovery: { by: { zh: '百武裕司', en: 'Yuji Hyakutake' }, year: '1996' },
    color: '#bcd6e8', color2: '#66808f',
  },
  {
    id: 'neowise',
    name: { zh: 'NEOWISE 彗星', en: 'C/2020 F3 NEOWISE' },
    kind: 'comet',
    tagline: {
      zh: '1997 年以来北半球最亮的彗星',
      en: 'The brightest northern-hemisphere comet since 1997',
    },
    description: {
      zh: '2020 年 7 月，NEOWISE 彗星成为自海尔-波普以来北半球最壮观的彗星，在傍晚的西北天空清晰可见。',
      en: 'In July 2020 NEOWISE became the finest northern-hemisphere comet since Hale-Bopp, clearly visible in the north-western evening sky.',
    },
    facts: {
      zh: [
        '它由 NEOWISE 红外巡天望远镜在 2020 年 3 月发现，三个月后就成为肉眼可见的大彗星。',
        '它幸存于近日点（0.29 AU）的高温考验，许多同类彗星在这个距离会解体。',
        '除了尘埃尾和离子尾，观测者还拍到了罕见的黄色钠尾。',
        '它的轨道周期约 6800 年，下一次回归要等到公元 8800 年左右。',
      ],
      en: [
        'The NEOWISE infrared survey telescope found it in March 2020, and three months later it was a naked-eye comet.',
        'It survived perihelion at 0.29 AU, a distance that breaks up many comparable comets.',
        'Alongside the dust and ion tails, observers photographed a rare yellow sodium tail.',
        'Its period is about 6800 years, so the next return is around the year 8800.',
      ],
    },
    physical: { radiusKm: 2.5, massKg: 1e13, albedo: 0.04, rotationHours: 7.58 },
    orbit: { semiMajorAxis: 358, eccentricity: 0.99918, inclination: 128.94, periodDays: 2471500, speedKms: 0.8 },
    discovery: { by: { zh: 'NEOWISE 太空望远镜', en: 'NEOWISE space telescope' }, year: '2020' },
    color: '#d8e4f0', color2: '#7d8ea0',
  },
];
