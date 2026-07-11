/* Sentinel AI — demo ma'lumotlar (real kameralar ulanmaganda ishlatiladi) */

const DEMO_CAMERAS = [
  { id: 'CAM-01', name: 'Asosiy kirish', zone: 'Perimetr', ip: '10.20.4.11', model: 'Hikvision DS-2CD',
    restricted: true, ai: ['Kirish', 'Yuz', 'Harakat'], scene: 'entrance', online: true },
  { id: 'CAM-02', name: 'Ishlab chiqarish sexi A', zone: 'Sex A', ip: '10.20.4.12', model: 'Hikvision DS-2CD',
    restricted: false, ai: ['PPE', 'Yiqilish'], scene: 'factory', online: true },
  { id: 'CAM-03', name: 'Ombor 1', zone: 'Ombor', ip: '10.20.4.13', model: 'Hikvision DS-2CD',
    restricted: false, ai: ['Kirish', 'Buyum'], scene: 'warehouse', online: true },
  { id: 'CAM-04', name: 'Yuk maydoni', zone: 'Logistika', ip: '10.20.4.14', model: 'Hikvision DS-2CD',
    restricted: false, ai: ['Raqam', 'Buyum'], scene: 'loading', online: true },
  { id: 'CAM-05', name: 'Sex B · Konveyer', zone: 'Sex B', ip: '10.20.4.15', model: 'Hikvision DS-2CD',
    restricted: false, ai: ['PPE', 'Olomon'], scene: 'factory', online: true },
  { id: 'CAM-06', name: 'Kimyoviy ombor', zone: 'Ombor', ip: '10.20.4.16', model: 'Hikvision DS-2CD',
    restricted: true, ai: ['Tutun', 'Kirish'], scene: 'warehouse', online: true },
  { id: 'CAM-07', name: 'Avtoturargoh', zone: 'Tashqi', ip: '10.20.4.17', model: 'Hikvision DS-2CD',
    restricted: false, ai: ['Raqam', 'Transport'], scene: 'parking', online: true },
  { id: 'CAM-08', name: 'Zaxira chiqish', zone: 'Perimetr', ip: '10.20.4.18', model: 'Hikvision DS-2CD',
    restricted: true, ai: ['Kirish'], scene: 'entrance', online: false },
];

/* Xavf darajalari */
const LEVELS = {
  high: { color: 'var(--hi)',  soft: 'var(--hi-soft)',  label: 'Yuqori' },
  med:  { color: 'var(--med)', soft: 'var(--med-soft)', label: "O'rta"  },
  low:  { color: 'var(--low)', soft: 'var(--low-soft)', label: 'Past'   },
};

/* Demo rejimda vaqti-vaqti bilan yuz beradigan ssenariy hodisalari */
const DEMO_EVENTS = [
  { type: 'Ruxsatsiz kirish',            camIdx: 0, level: 'high', conf: 98, obj: 'SHAXS' },
  { type: "PPE buzilishi — kaska yo'q",  camIdx: 1, level: 'med',  conf: 91, obj: "KASKA YO'Q" },
  { type: 'Tutun aniqlandi',             camIdx: 5, level: 'med',  conf: 74, obj: 'TUTUN' },
  { type: 'Uzoq turib qolish',           camIdx: 2, level: 'low',  conf: 88, obj: 'KUZATUV' },
  { type: 'Tashlab ketilgan buyum',      camIdx: 3, level: 'med',  conf: 83, obj: 'BUYUM' },
  { type: 'Olomon zichligi yuqori',      camIdx: 4, level: 'low',  conf: 79, obj: 'OLOMON' },
  { type: 'Ruxsatsiz transport',         camIdx: 6, level: 'low',  conf: 85, obj: 'TRANSPORT' },
  { type: 'Qurol shubhasi',              camIdx: 0, level: 'high', conf: 72, obj: 'QUROL' },
];
