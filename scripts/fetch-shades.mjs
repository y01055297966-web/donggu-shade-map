import { mkdir, writeFile } from 'node:fs/promises';

const DATASET_ID = '15103022';
const DATASET_PAGE = `https://www.data.go.kr/data/${DATASET_ID}/fileData.do`;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(value.trim());
      value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }
  if (value || row.length) {
    row.push(value.trim());
    rows.push(row);
  }
  return rows;
}

async function findDownloadUrl() {
  const response = await fetch(DATASET_PAGE, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Dataset page failed (${response.status}).`);
  const html = await response.text();
  const match = html.match(/\/cmm\/cmm\/fileDownload\.do\?atchFileId=[^"'<>\s]+/);
  if (!match) throw new Error('Could not find the CSV download URL.');
  return new URL(match[0].replaceAll('&amp;', '&'), DATASET_PAGE);
}

const response = await fetch(await findDownloadUrl(), { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`CSV download failed (${response.status}).`);

const csv = new TextDecoder('euc-kr').decode(await response.arrayBuffer()).replace(/^\uFEFF/, '');
const [headers, ...rows] = parseCsv(csv);
const indexOf = (name) => headers.indexOf(name);
const indexes = {
  id: indexOf('관리번호'),
  address: indexOf('주소'),
  latitude: indexOf('위도'),
  longitude: indexOf('경도'),
  installedAt: indexOf('설치일'),
  baseDate: indexOf('데이터기준일자')
};
if (Object.values(indexes).some((index) => index < 0)) throw new Error(`Unexpected CSV columns: ${headers.join(', ')}`);

const locations = new Map();
for (const row of rows) {
  const latitude = Number(row[indexes.latitude]);
  const longitude = Number(row[indexes.longitude]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
  const id = row[indexes.id];
  const installedAt = row[indexes.installedAt];
  const key = `${latitude.toFixed(6)}:${longitude.toFixed(6)}`;
  const existing = locations.get(key);
  if (existing) {
    existing.managementIds.push(id);
    existing.installationDates.push(installedAt);
  } else {
    locations.set(key, {
      dong: id.replace(/-\d+$/, ''),
      address: row[indexes.address],
      latitude,
      longitude,
      managementIds: [id],
      installationDates: [installedAt]
    });
  }
}

const facilities = [...locations.values()].map((location) => ({
  dong: location.dong,
  address: location.address,
  latitude: location.latitude,
  longitude: location.longitude,
  managementIds: location.managementIds.sort((a, b) => a.localeCompare(b, 'ko', { numeric: true })),
  installedAt: location.installationDates.filter(Boolean).sort()[0] ?? '',
  latestRecordAt: location.installationDates.filter(Boolean).sort().at(-1) ?? ''
})).sort((a, b) => a.dong.localeCompare(b.dong, 'ko') || a.address.localeCompare(b.address, 'ko'));

if (!facilities.length) throw new Error('The dataset returned no usable locations.');

const output = {
  metadata: {
    source: '광주광역시 동구_그늘막설치현황',
    sourceUrl: DATASET_PAGE,
    collectedAt: new Date().toISOString(),
    baseDate: rows.map((row) => row[indexes.baseDate]).filter(Boolean).sort().at(-1) ?? '',
    rawRecordCount: rows.length,
    locationCount: facilities.length,
    note: '동일한 위도·경도의 설치 및 교체 이력은 하나의 위치로 통합했습니다.'
  },
  facilities
};

await mkdir('public/data', { recursive: true });
await writeFile('public/data/shades.json', `${JSON.stringify(output, null, 2)}\n`);
console.log(`Collected ${rows.length} records into ${facilities.length} unique locations.`);
