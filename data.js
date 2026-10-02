// ===== EDIT THIS FILE to change what appears on the map =====
// Coordinates are [latitude, longitude].
// Parking and charging positions are ESTIMATED from your PDF map - replace with GPS values.

const CENTER = [3.0685, 101.4995];

const PARKING = [
  { name: 'Parking 1',  pos: [3.072631, 101.497935] },
  { name: 'Parking 2',  pos: [3.072052, 101.499948] },
  { name: 'Parking 3',  pos: [3.070348, 101.496465] },
  { name: 'Parking 4',  pos: [3.069393, 101.498425] },
  { name: 'Parking 5',  pos: [3.068354, 101.493472] },
  { name: 'Parking 6',  pos: [3.067604, 101.497655] },
  { name: 'Parking 7',  pos: [3.066241, 101.492597] },
  { name: 'Parking 8',  pos: [3.065832, 101.507053] },
  { name: 'Parking 9',  pos: [3.067911, 101.505950] },
  { name: 'Parking 10', pos: [3.064298, 101.498985] }
];

const CHARGING = [
  { name: 'Charging station', pos: [3.064963, 101.498985] }
];

// kind: 'noentry' | 'caution' | 'safe'
// Coordinates and levels come from your PDF table.
// For no-entry roads fill in: video, stats, and (optional) profile.
//   video:   'media/noentry-2.mp4'
//   profile: [[distance_m, elevation_m], ...]  -> draws an elevation graph
const RISKS = [
  { id: 1, kind: 'caution', level: 'ORANGE', place: 'Near Faculty of Computer & Mathematical Sciences', road: 'Jalan Ilmu 1/1', pos: [3.072106, 101.500104] },
  { id: 2, kind: 'noentry', level: 'RED', place: 'Jln Sarjana, near Police Bantuan Post', road: 'Jalan Pintar 1/21A', pos: [3.070702, 101.500694],
    video: 'media/noentry-2.mp4',
    stats: { elevation: '', gradient: '', length: '', reason: '' }, profile: null },
  { id: 3, kind: 'noentry', level: 'ORANGE / RED', place: 'Beside Pusat Islam', road: 'Jalan Cendekiawan 1/15', pos: [3.068945, 101.502324],
    video: 'media/noentry-3.mp4',
    stats: { elevation: '', gradient: '', length: '', reason: '' }, profile: null },
  { id: 4, kind: 'caution', level: 'YELLOW / ORANGE', place: 'In front of UiTM Photo Centre', road: 'Jalan Ilmu 1/1', pos: [3.066835, 101.506766] },
  { id: 5, kind: 'caution', level: 'ORANGE', place: 'In front of Law Faculty', road: 'Jalan Ilmu 1', pos: [3.066203, 101.503397] },
  { id: 6, kind: 'caution', level: 'ORANGE / RED', place: 'In front of Delima College', road: 'Jalan Tegas 1/15', pos: [3.067660, 101.500661] },
  { id: 7, kind: 'caution', level: 'RED', place: 'Near Padang Kawad', road: 'Jalan Cemerlang 1/19', pos: [3.067210, 101.498548] },
  { id: 8, kind: 'caution', level: 'ORANGE / RED', place: 'Near Built Environment Faculty', road: 'Jalan Bijak 1/22', pos: [3.065715, 101.494954] },
  { id: 9, kind: 'safe',    level: 'GREEN', place: 'In front of Pusat Kesihatan', road: 'Jalan Ilmu 1/1', pos: [3.068543, 101.493323] }
];
// Site photos: save them as media/site-1.jpg ... media/site-9.jpg (shown in the popup).

// ===== Colored road segments =====
// level: 'red' | 'orange' | 'yellow' | 'green'. pts are [lat, lng] waypoints in order.
// The app snaps the line to the real road using OSRM (needs internet). Use snap:false to draw straight lines instead.
// risk: links a red road to its no-entry marker (id in RISKS) so its elevation can be loaded.
const ROADS = [
  { name: 'Jalan Ilmu 1/1', level: 'orange', pts: [[3.072836865676725, 101.49942596078436], [3.0714773625811347, 101.50061385073066], [3.070936752803998, 101.50363605781419]] },
  { name: 'Jalan Ilmu 1/1', level: 'orange', pts: [[3.0672484869091146, 101.50625633481957], [3.06545170590858, 101.50731824633917], [3.06499488523684, 101.5034326489503]] },
  { name: 'Jalan Sarjana 1/2', level: 'orange', pts: [[3.067088706922754, 101.50169146988245], [3.0647569824929612, 101.49685600907968], [3.0643443043094307, 101.495436232875]] },
  { name: 'Jalan Bijak 1/22', level: 'orange', pts: [[3.0643730836458043, 101.49543664671981], [3.065716268857676, 101.49497230759583], [3.0662453305116006, 101.4927803520101]] },
  { name: 'Jalan Cemerlang 1/19', level: 'orange', pts: [[3.066322956976372, 101.49696804513317], [3.0673031411262714, 101.49855083066544], [3.0679693015600145, 101.49848452090555]] },
  { name: 'Jalan Tegas 1/15', level: 'orange', pts: [[3.0679896268970217, 101.49849643832164], [3.0670890436614746, 101.50167574275187]] },
  { name: 'Jalan Cendekiawan 1/15', level: 'red', risk: 3, pts: [[3.0709571075042548, 101.50193434254203], [3.0675664723221985, 101.50222020199416]] },
  { name: 'Jalan Pintar 1/21A', level: 'red', risk: 2, pts: [[3.0709571075042548, 101.50193434254203], [3.0704855140470966, 101.50010390835226]] }
];

// ===== UiTM boundary =====
const BOUNDARY_GEOJSON = {"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[101.4915331,3.0673334],[101.4915823,3.066486],[101.4917667,3.066048],[101.4918897,3.0655976],[101.4919438,3.0652191],[101.4923046,3.0645764],[101.4927631,3.0642708],[101.4934846,3.0640252],[101.4946832,3.0636691],[101.4955031,3.0635503],[101.4971474,3.0632965],[101.498911,3.0630646],[101.4996858,3.0630113],[101.4997596,3.0630526],[101.4998785,3.0631833],[101.4999974,3.0632324],[101.5002556,3.0632365],[101.5005631,3.063216],[101.5007681,3.0632447],[101.5009198,3.063302],[101.5011657,3.063302],[101.5018088,3.0632982],[101.5026067,3.0634251],[101.5030121,3.0633955],[101.5030072,3.0628436],[101.5039429,3.0627952],[101.505073,3.0629126],[101.5063725,3.0631218],[101.5088315,3.0635495],[101.5087461,3.0641343],[101.5080912,3.0667705],[101.5074937,3.0689638],[101.5068227,3.0699872],[101.506469,3.0701333],[101.5057416,3.070214],[101.5049425,3.0704272],[101.5043936,3.070817],[101.5036006,3.0714697],[101.5022027,3.0726327],[101.5020319,3.0727423],[101.5017538,3.0727765],[101.5015973,3.0727997],[101.5012696,3.0730161],[101.4998247,3.07425],[101.4991249,3.0736002],[101.4984288,3.0742345],[101.4977146,3.0744078],[101.4974228,3.0742851],[101.4967175,3.0730645],[101.4961001,3.0721039],[101.4954205,3.0710349],[101.4949715,3.0703705],[101.4946222,3.0700178],[101.4940345,3.0695181],[101.4933926,3.0694633],[101.4927584,3.0694842],[101.4920319,3.0695283],[101.4916765,3.069577],[101.4915527,3.0695256],[101.4915331,3.0673334]]]}};