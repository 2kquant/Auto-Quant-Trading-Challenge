//todo

_250303_
각 페이지 및 router 설정완료
반응형 ui 개선

_250304_
홈 화면 반응형 디테일 개선
데스크탑/모바일 메뉴버튼 및 아이콘 통일
각 페이지 디테일 구현

_250305_
(app)/layout.tsx 디테일 개선
바이낸스, 업비트 api

_250306_
F&G 연결
weeklyReport 페이지 구현
settings 페이지 구현

_250311_
페이퍼계좌 생성
현재가 api 조회
모의 매수/매도
잔고반영
평균단가 계산
실현손익 계산
거래기록 저장
테스트 페이지에서 바로 검증

_260313_
Supabase 기반 거래소 API Key 암호화 저장 및 서버 경유 연동 구조 구현

_260314_
settings/dashboard
→ /api/exchange-balance
→ 로그인 유저 확인
→ exchange_accounts에서 활성 계정 조회
→ 암호화된 키 복호화
→ Binance 또는 Upbit 잔고 API 호출
→ 가공된 잔고 JSON 반환
→ 화면에 표시

_260402_
사용자의 업비트 Access Key와 Secret Key 디비에 저장하기
업비트에서 호출하여 잔고 불러오기

_260507_
Supabase Auth 로그인
회원별 API Key 저장
회원별 키 조회
서버에서 CCXT 생성
업비트/바이낸스 연결
fetchBalance()
로그인 후 잔고 불러오기

실시간 시세 연결
실제 주문
코인 평가금액 계산
자동매매 엔진
DB 설계 추가

_260508~_
실시간 ticker
주문 버튼
trade history 저장
websocket 실시간 가격
AI 모델 연결
자동매매 loop
백테스트
포트폴리오 분석
리스크 관리
VPS 24시간 운영

_260514_
PostgreSQL

_260607_
모델연결 성공 및 가상매매 성공

_260611_
vercel 배포
