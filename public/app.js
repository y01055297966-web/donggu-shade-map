const numberFormat = new Intl.NumberFormat('ko-KR');
const byId = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

function distanceInMeters(origin, facility) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDistance = radians(facility.latitude - origin.latitude);
  const longitudeDistance = radians(facility.longitude - origin.longitude);
  const value = Math.sin(latitudeDistance / 2) ** 2
    + Math.cos(radians(origin.latitude)) * Math.cos(radians(facility.latitude)) * Math.sin(longitudeDistance / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function initialize(data) {
  if (!Array.isArray(data.facilities) || !data.facilities.length) throw new Error('표시할 그늘막 위치가 없습니다.');
  if (!window.L) throw new Error('지도 라이브러리를 불러오지 못했습니다.');

  const dongSelect = byId('dong-select');
  const search = byId('address-search');
  const nearestButton = byId('nearest-button');
  const list = byId('location-list');
  const status = byId('search-status');
  const dongs = [...new Set(data.facilities.map((facility) => facility.dong))].sort((a, b) => a.localeCompare(b, 'ko'));
  dongSelect.innerHTML = '<option value="all">동구 전체</option>' + dongs.map((dong) => `<option value="${escapeHtml(dong)}">${escapeHtml(dong)}</option>`).join('');
  dongSelect.disabled = false;
  search.disabled = false;
  nearestButton.disabled = !navigator.geolocation;
  byId('total-count').textContent = `${numberFormat.format(data.facilities.length)}곳`;
  byId('dong-count').textContent = `${numberFormat.format(dongs.length)}개`;
  byId('data-date').textContent = `${data.metadata.baseDate} 기준`;

  byId('map').textContent = '';
  const map = L.map('map', { scrollWheelZoom: true }).setView([35.1355, 126.9255], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  const markers = L.layerGroup().addTo(map);
  const userMarker = L.layerGroup().addTo(map);
  let visible = data.facilities;
  let markerByKey = new Map();
  let currentLocation = null;

  function popupContent(facility) {
    const kakaoUrl = `https://map.kakao.com/link/map/${encodeURIComponent(`광주 동구 그늘막 ${facility.address}`)},${facility.latitude},${facility.longitude}`;
    return `<div class="shade-popup"><span>${escapeHtml(facility.dong)}</span><strong>${escapeHtml(facility.address)}</strong><dl><dt>최초 설치</dt><dd>${escapeHtml(facility.installedAt || '-')}</dd><dt>관리번호</dt><dd>${escapeHtml(facility.managementIds.join(', '))}</dd></dl><a href="${kakaoUrl}" target="_blank" rel="noreferrer">카카오맵에서 길찾기</a></div>`;
  }

  function focusFacility(facility) {
    map.setView([facility.latitude, facility.longitude], 17, { animate: true });
    markerByKey.get(`${facility.latitude}:${facility.longitude}`)?.openPopup();
    if (window.innerWidth <= 800) byId('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function render(fit = true) {
    const dong = dongSelect.value;
    const query = search.value.trim().toLocaleLowerCase('ko');
    visible = data.facilities.filter((facility) => {
      const searchable = `${facility.address} ${facility.managementIds.join(' ')}`.toLocaleLowerCase('ko');
      return (dong === 'all' || facility.dong === dong) && (!query || searchable.includes(query));
    });
    if (currentLocation) visible = [...visible].sort((a, b) => distanceInMeters(currentLocation, a) - distanceInMeters(currentLocation, b));

    markers.clearLayers();
    markerByKey = new Map();
    const bounds = [];
    for (const facility of visible) {
      const marker = L.marker([facility.latitude, facility.longitude], {
        icon: L.divIcon({ className: 'shade-marker', html: '<span></span>', iconSize: [20, 20], iconAnchor: [10, 20], popupAnchor: [0, -18] })
      }).bindPopup(popupContent(facility)).addTo(markers);
      markerByKey.set(`${facility.latitude}:${facility.longitude}`, marker);
      bounds.push([facility.latitude, facility.longitude]);
    }

    list.innerHTML = visible.map((facility, index) => {
      const distance = currentLocation ? distanceInMeters(currentLocation, facility) : null;
      const detail = distance === null ? facility.managementIds.join(', ') : distance < 1000 ? `현재 위치에서 약 ${Math.round(distance)}m` : `현재 위치에서 약 ${(distance / 1000).toFixed(1)}km`;
      return `<button class="location-button" type="button" data-index="${index}"><strong>${escapeHtml(facility.address)}</strong><span>${escapeHtml(facility.dong)}</span><small>${escapeHtml(detail)}</small></button>`;
    }).join('') || '<p class="loading">검색 조건에 맞는 그늘막이 없습니다.</p>';
    list.querySelectorAll('.location-button').forEach((button) => button.addEventListener('click', () => focusFacility(visible[Number(button.dataset.index)])));
    byId('visible-count').textContent = `${numberFormat.format(visible.length)}곳`;
    status.textContent = currentLocation ? '현재 위치에서 가까운 순서로 표시합니다.' : `${visible.length}개 위치를 표시하고 있습니다.`;
    if (fit && bounds.length) map.fitBounds(bounds, { padding: [35, 35], maxZoom: dong === 'all' && !query ? 14 : 16 });
  }

  dongSelect.addEventListener('change', () => render());
  search.addEventListener('input', () => render());
  nearestButton.addEventListener('click', () => {
    nearestButton.disabled = true;
    nearestButton.lastChild.textContent = ' 위치 확인 중';
    navigator.geolocation.getCurrentPosition((position) => {
      currentLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      userMarker.clearLayers();
      L.circleMarker([currentLocation.latitude, currentLocation.longitude], { radius: 8, color: '#fff', weight: 3, fillColor: '#2d85a3', fillOpacity: 1 }).bindTooltip('현재 위치').addTo(userMarker);
      render(false);
      if (visible[0]) focusFacility(visible[0]);
      nearestButton.disabled = false;
      nearestButton.lastChild.textContent = ' 내 주변 그늘막 찾기';
    }, () => {
      status.textContent = '현재 위치를 확인할 수 없습니다. 브라우저 위치 권한을 확인해 주세요.';
      nearestButton.disabled = false;
      nearestButton.lastChild.textContent = ' 내 주변 그늘막 찾기';
    }, { enableHighAccuracy: true, timeout: 10000 });
  });

  render();
  setTimeout(() => map.invalidateSize(), 0);
}

fetch('./data/shades.json', { cache: 'no-store' })
  .then((response) => {
    if (!response.ok) throw new Error(`위치 데이터 요청 실패 (${response.status})`);
    return response.json();
  })
  .then(initialize)
  .catch((error) => {
    byId('map').innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    byId('location-list').innerHTML = `<p class="loading">${escapeHtml(error.message)}</p>`;
    byId('search-status').textContent = '데이터 연결 오류';
  });
