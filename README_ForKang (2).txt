# 📦 ForKang - 업비트 AI 실시간 추론 패키지

**준비 완료**: 2026-06-05  
**대상**: 친구 (업비트 API 보유자)

---

## 📋 패키지 구성

### 폴더 내용
```
ForKang/
├── 실시간_추론_가이드.md              ★ 필독 (한국어 가이드)
├── setup_notes.md                    ★ 설정 가이드
├── example_inference.py              ★ 실행 가능한 예제 코드
├── realtime_model.py                 ★ 피처 빌딩 모듈 (필수)
├── realtime_upbit_trend_model.pkl    ★ 모델 파일 (필수)
├── requirements.txt                  ★ 의존성 목록
├── model_info.json                   메타데이터
└── README_ForKang.txt                이 파일
```

---

## 🚀 친구가 해야 할 일

### Step 1: 환경 설정 (처음 1회)

```bash
# 1-1. Python 3.10+ 설치 확인
python --version

# 1-2. 패키지 설치
cd ForKang
pip install -r requirements.txt

# 1-3. 환경 변수 설정 (Upbit API)
# Windows PowerShell:
$env:UPBIT_ACCESS_KEY = "YOUR_KEY_HERE"
$env:UPBIT_SECRET_KEY = "YOUR_SECRET_HERE"

# Mac/Linux:
export UPBIT_ACCESS_KEY="YOUR_KEY_HERE"
export UPBIT_SECRET_KEY="YOUR_SECRET_HERE"
```

### Step 2: 첫 실행 테스트

```bash
# 예제 실행
python example_inference.py
```

**예상 출력**:
```
================================================================================
 예제 1: 모델 로드 및 메타데이터 확인
================================================================================
✅ 모델 로드 성공
📊 모델 정보:
  - 생성 시간: 2026-06-05T...
  - 선택된 모델: XGBoost_...
  - 추론 장치: cpu
  ...
```

### Step 3: 실시간 추론 통합

가이드 문서에서 "예제 3: Upbit API 통합 예제" 참조 → 자신의 거래 시스템에 맞게 수정

---

## 📚 문서 빠른 참고

### 1. **실시간_추론_가이드.md** (필독!)
- 모델 개요
- 빠른 시작 (3분)
- 데이터 입력 형식
- 예제 코드 4가지
- 주의사항 & 문제 해결

### 2. **setup_notes.md**
- 환경 구성 방법
- API 키 설정
- 서버 사양 권장사항
- 일반적인 문제 해결
- 로깅 & 모니터링

### 3. **example_inference.py**
- 실행 가능한 Python 코드
- 예제 1: 모델 로드 및 정보 확인
- 예제 2: 더미 데이터로 추론 테스트
- 예제 3: Upbit API 구조 (스켈레톤)
- 예제 4: 배치 추론 (백테스트)

### 4. **realtime_model.py**
- 피처 빌딩 핵심 모듈
- `build_realtime_features()` 함수
- `RealtimeCryptoModel` 클래스
- 자동으로 import되며, 수정 불필요

### 5. **requirements.txt**
- 필수 패키지 및 버전
- `pip install -r requirements.txt` 로 설치

### 6. **model_info.json**
- 모델 메타데이터 (정보 참고용)
- 학습 기간, 성능 통계, 주의사항 등

---

## 💡 빠른 팁

### 최소한의 시작 (5분)

```python
import pickle
from realtime_model import build_realtime_features
import pandas as pd

# 1. 모델 로드
with open('realtime_upbit_trend_model.pkl', 'rb') as f:
    model = pickle.load(f)

# 2. 데이터 준비 (예: ccxt로 조회한 OHLCV)
df = pd.DataFrame(...)  # market, timestamp_utc, open_u, high_u, low_u, close_u, volume_u

# 3. 피처 생성 & 추론
features = build_realtime_features(df, config=model.config, include_target=False)
signals = model.predict_signal(features)

# 4. 신호 확인
print(signals[['market', 'trend_probability', 'signal']])
```

### 핵심 매개변수

| 항목 | 값 | 설명 |
|------|-----|------|
| Horizon | 30분 | 예측 대상: 30분 뒤 수익률 |
| Min Return | 12bp | 양성 라벨 기준 |
| Fee | 5bp | 거래 비용 가정 |
| Threshold | ~0.5 | 매수 신호 기준값 |
| Latency | 3-5ms | 20종목 기준 |

---

## ⚙️ 실제 거래 체크리스트

### 거래 전 필수 확인

- [ ] **데이터 정확성**: 바이낸스 데이터, 환율, 김프 정상 수신
- [ ] **모델 성능**: 최근 1주일 수익률이 기대값 이상인지 확인
- [ ] **수수료 재계산**: Upbit 현물 수수료 = 0.05% (매수+매도, 총 10bp)
- [ ] **위치 관리**: 최대 포지션 수 제한 (예: 5개 종목)
- [ ] **손절/익절**: 설정된 기준 (예: -5%, +3%) 적용
- [ ] **API 할당량**: 분당 요청 수 모니터링
- [ ] **에러 로깅**: 1일 1회 로그 확인

### 거래 중 주의사항

1. **완성된 캔들만 사용**: 1분 캔들이 xx:xx:00 종료 후 추론
2. **연속 신호 필터링**: 같은 종목 중복 신호 방지
3. **시장 변화 감시**: 급격한 성능 저하 시 일시 중단
4. **정기 검증**: 주 1회 실제 거래 vs. 모델 신호 비교

---

## 🔄 정기 점검 항목

### 일일 (자동화 권장)
- API 연결 상태 체크
- 모델 로드 성공 여부
- 신호 생성 정상 여부

### 주간
- 이전 주 수익률 분석
- 거래 히트율 추적
- 서버 리소스 사용률 확인

### 월간
- 모델 성능 변화 평가
- 새 버전 확인 (구현자 쪽 업데이트)
- 보안 감사 (API 키 로테이션 등)

---

## ❓ FAQ

### Q1. 모델을 재학습할 수 있나요?
**A**: 아니오. pkl은 완성된 배포용 모델입니다. 재학습이 필요하면 구현자(나)에게 요청하세요.

### Q2. 바이낸스 데이터가 없는 마켓은 어떻게 되나요?
**A**: 해당 피처가 NaN으로 처리되고, wrapper가 중앙값으로 보정합니다. 성능 5~10% 저하 가능.

### Q3. 모델 성능이 갑자기 떨어졌어요. 무엇을 확인해야 하나요?
**A**:
1. 데이터 정확성 (잘못된 가격, 환율)
2. Upbit/Binance API 변경
3. 시장 구조 변화 (약세장 진입)
4. 구현자에게 알리고 재학습 요청

### Q4. 실시간으로 여러 마켓 동시 추론 시 지연이 발생합니다.
**A**:
- 배치 처리로 API 요청 수 줄이기
- 모니터링 마켓 수 제한
- 서버 CPU 업그레이드 고려

### Q5. 손실 거래가 자주 발생합니다. 모델이 틀렸나요?
**A**: 
- 모델 정확도 ~50-60% (완벽하지 않음)
- 포지션 관리, 손절, 거래 비용을 다시 확인하세요
- 장기 모니터링 후 판단하세요 (최소 100거래)

---

## 📞 기술 지원

### 문제 발생 시 제보할 정보

1. **에러 메시지** (정확한 내용)
2. **Python 버전** (`python --version`)
3. **설치된 패키지** (`pip list`)
4. **재현 단계** (어떻게 하면 문제가 발생하나)
5. **로그 파일** (있으면)

### 예상 응답 시간

- 중대 오류 (모델 로드 불가): 24시간
- 성능 문제 (신호 생성 느림): 2-3일
- 예상 외 출력 (NaN 많음): 2-3일

---

## 📋 최종 체크리스트

친구 입장에서:

- [ ] 모든 파일이 ForKang 폴더에 있는지 확인
- [ ] 실시간_추론_가이드.md 읽음
- [ ] setup_notes.md에서 환경 설정 완료
- [ ] `pip install -r requirements.txt` 성공
- [ ] `python example_inference.py` 실행 성공
- [ ] 자신의 Upbit API 키 준비
- [ ] 예제 코드를 자신의 거래 시스템에 맞게 수정

---

## 🎯 다음 단계

1. **Local 테스트** (1-2주): 예제 코드로 신호 생성 검증
2. **데모 거래** (1주): 실제 Upbit API로 주문 없이 신호만 확인
3. **실거래 준비** (1주): 포지션 관리, 손절 설정 등
4. **실거래** (최소 100거래): 성능 모니터링

---

**생성일**: 2026-06-05  
**버전**: 1.0  
**담당자**: (구현자 연락처)

---

## 🔗 참고 링크

- Upbit API 문서: https://docs.upbit.com/docs/user-api
- CCXT 문서: https://docs.ccxt.com/
- XGBoost 문서: https://xgboost.readthedocs.io/

---

**주의**: 과거 성과가 미래를 보장하지 않습니다. 충분한 검증과 위험 관리 하에 거래하세요.

//////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////

1. 모델 파일명만 바뀌고 구조가 같음

예:

realtime_upbit_trend_model.pkl
↓
new_model.pkl

이 경우

MODEL_PATH = "new_model.pkl"

만 바꾸면 끝.

5분 컷.

2. 같은 코드로 학습했는데 새로 학습한 모델

예:

85개 feature
same RealtimeCryptoModelSuite
same predict_signal()

이 경우도

기존 pkl 삭제
↓
새 pkl 넣기
↓
재시작

하면 끝.

사실상 모델 교체.

3. 구조 자체가 바뀜

예:

기존

model.predict_signal()

새 모델

model.predict()

또는

feature 85개
↓
feature 120개

또는

XGBoost
↓
LightGBM

이런 경우.

그러면

Flask
Execution
자동매매

전부 수정해야 함.

친구에게 앞으로 받아야 하는 것

모델만 받지 말고 항상

1. pkl 파일
2. realtime_model.py
3. requirements.txt

이 3개를 받아.

베스트는

quant_app/
 ├ realtime_model.py
 ├ feature_builder.py
 ├ model.pkl
 └ requirements.txt

통째로 받는 것.

네 프로젝트 기준

지금 네 모델은

RealtimeCryptoModelSuite
 ├ short_30m
 ├ short_4h
 ├ long_2d
 ├ long_30d
 └ long_60d

구조를 알고 있음.

만약 친구가

새 pkl

만 보내고

feature 수 85개
predict_signal 존재

하면

ai-server/models/

에 덮어쓰기만 하면 된다.

앞으로 친구한테 꼭 물어볼 것

모델 줄 때:

1. feature 개수?
2. predict_signal 그대로 있음?
3. threshold 구조 그대로임?
4. realtime_model.py 변경됨?

이 4개.