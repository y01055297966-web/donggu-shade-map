# 동구 그늘지도

광주광역시 동구의 무더위 그늘막 위치를 지도에서 확인하는 독립형 GitHub Pages 사이트입니다.

## 기능

- 고유 좌표 기준 101개 그늘막 위치 표시
- 행정동·주소·관리번호 검색
- 현재 위치에서 가까운 순서로 정렬
- 설치일 및 관리번호 확인
- 카카오맵 길찾기 연결
- 공공데이터 자동 수집 및 Pages 배포

## 데이터

[광주광역시 동구 그늘막설치현황](https://www.data.go.kr/data/15103022/fileData.do) CSV를 배포할 때마다 내려받아 `public/data/shades.json`으로 변환합니다. 동일 좌표의 설치·교체 이력은 한 위치로 통합합니다.

## 로컬 명령

```bash
npm run collect
npm run check
```

지도는 Leaflet과 OpenStreetMap을 사용하며 별도 지도 API 키가 필요하지 않습니다.
