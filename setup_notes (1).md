# 설정 및 환경 메모 (ForKang)

## 🔧 환경 구성

### Python 버전
- **권장**: Python 3.9+
- **테스트**: Python 3.10, 3.11 (권장)
- **피해야 할 버전**: Python 3.12 이상 (일부 라이브러리 호환성 미지원)

### 필수 패키지 버전

```
numpy>=1.21.0
pandas>=1.3.0
xgboost>=1.7.0
scikit-learn>=1.0.0
pyarrow>=10.0.0  # parquet 파일 읽기용
```

### Upbit/Binance API 통합 시 추가 패키지

```
ccxt>=3.0.0           # 거래소 API 통합
python-dateutil>=2.8.0
pytz>=2022.1
requests>=2.28.0
websocket-client>=11.0 (실시간 스트림용)
```

---

## 📦 설치 방법

### Option 1: requirements.txt 사용 (권장)

```bash
# 필수 패키지만
pip install -r requirements.txt

# 또는 Upbit/Binance 통합 버전
pip install -r requirements_full.txt
```

### Option 2: 수동 설치

```bash
# 기본
pip install numpy pandas xgboost scikit-learn pyarrow

# Upbit/Binance
pip install ccxt

# 실시간 (옵션)
pip install websocket-client
```

### Option 3: Conda 사용

```bash
conda create -n crypto-inference python=3.11
conda activate crypto-inference

conda install numpy pandas scikit-learn
pip install xgboost ccxt
```

---

## 🔐 API 키 설정

### 1. Upbit API 키 생성

```
1. https://upbit.com/mypage/api_keys 방문
2. [API 키 생성] 클릭
3. 액세스 키, 시크릿 키 메모
4. 권한 설정:
   - 필수: 시세 조회 (기본)
   - 필수: 잔고 조회
   - 선택: 주문 조회/취소 (실거래 시)
   - 선택: 주문 (실거래 시)
```

### 2. API 키 환경 변수 설정

#### Windows (PowerShell)
```powershell
$env:UPBIT_ACCESS_KEY = "YOUR_ACCESS_KEY"
$env:UPBIT_SECRET_KEY = "YOUR_SECRET_KEY"

# 영구 설정
[Environment]::SetEnvironmentVariable("UPBIT_ACCESS_KEY", "YOUR_KEY", "User")
[Environment]::SetEnvironmentVariable("UPBIT_SECRET_KEY", "YOUR_KEY", "User")
```

#### Windows (명령 프롬프트)
```cmd
set UPBIT_ACCESS_KEY=YOUR_ACCESS_KEY
set UPBIT_SECRET_KEY=YOUR_SECRET_KEY

# 영구 설정 (제어판 > 시스템 > 고급 설정 > 환경 변수)
```

#### Mac/Linux
```bash
export UPBIT_ACCESS_KEY="YOUR_ACCESS_KEY"
export UPBIT_SECRET_KEY="YOUR_SECRET_KEY"

# 영구 설정 (~/.bashrc 또는 ~/.zshrc)
echo 'export UPBIT_ACCESS_KEY="YOUR_KEY"' >> ~/.bashrc
source ~/.bashrc
```

### 3. Python 코드에서 사용

```python
import os
from ccxt import upbit

upbit_client = upbit({
    'apiKey': os.environ.get('UPBIT_ACCESS_KEY'),
    'secret': os.environ.get('UPBIT_SECRET_KEY'),
})
```

---

## 🚀 빠른 테스트

### 1. 모델 로드 테스트

```bash
cd ForKang
python example_inference.py
```

### 2. Upbit API 연결 테스트

```python
import ccxt

upbit = ccxt.upbit()
markets = upbit.load_markets()
print(f"업비트 마켓 수: {len(markets)}")

# 최신 가격 조회
ticker = upbit.fetch_ticker('KRW-BTC')
print(f"BTC 가격: {ticker['last']:.0f} KRW")
```

### 3. 모델 추론 테스트

```bash
python -c "
import pickle
from pathlib import Path

model_path = Path('realtime_upbit_trend_model.pkl')
with open(model_path, 'rb') as f:
    model = pickle.load(f)
    print(f'모델 로드 성공')
    print(f'Threshold: {model.threshold}')
"
```

---

## 📊 데이터 소스 설정

### 추천 구성

#### 1단계: Upbit 1분봉 데이터
```python
import ccxt

upbit = ccxt.upbit()

# 최근 200개 캔들 조회 (약 3시간 30분)
ohlcv = upbit.fetch_ohlcv('KRW-BTC', '1m', limit=200)

# ohlcv 구조:
# [timestamp_ms, open, high, low, close, volume]
```

#### 2단계: Binance 동시점 데이터
```python
import ccxt

binance = ccxt.binance()

# 동시 타임스탠프 조회
btcusdt = binance.fetch_ohlcv('BTC/USDT', '1m', since=timestamp_ms, limit=1)
```

#### 3단계: 환율 데이터
```python
# 옵션 1: API
import requests
response = requests.get('https://api.upbit.com/v1/ticker?markets=KRW')
krw_usd = 1 / response[0]['trade_price']

# 옵션 2: 캐시 (데이터 폴더)
# historical_fx.csv에 저장된 시계열 환율 사용
```

#### 4단계: 김프 데이터
```python
# 업비트 BTC 가격 vs Binance BTC 가격 차이
upbit_btc = upbit.fetch_ticker('KRW-BTC')['last']
binance_btc = binance.fetch_ticker('BTC/USDT')['last']
krw_usd = 1300  # 환율

kimchi_pct = (upbit_btc / (binance_btc * krw_usd) - 1) * 100
```

---

## ⚙️ 추천 서버 사양

### 최소 요구사항
- **CPU**: 2 core (추론은 CPU 기반)
- **RAM**: 4 GB
- **스토리지**: 500 MB (모델 + 데이터)
- **네트워크**: 안정적인 인터넷 (API 호출)

### 권장 사양
- **CPU**: 4 core 이상 (병렬 처리)
- **RAM**: 8 GB
- **스토리지**: 50 GB (historical 데이터 캐시)
- **네트워크**: 1Mbps 이상 (안정적)

### AWS 예시
```
EC2: t3.medium (2 vCPU, 4GB RAM)
  └ 월간 비용: ~$20-30

RDS 불필요 (로컬 처리)
S3: 모델 + 데이터 백업 (~1GB)
  └ 월간 비용: ~$1-2

총 월간 비용: ~$20-35
```

---

## 🔄 정기 점검 사항

### 일일 체크리스트
- [ ] Upbit/Binance API 정상 작동
- [ ] 모델 로드 성공
- [ ] 실시간 추론 신호 생성 (test)
- [ ] 에러 로그 확인

### 주간 체크리스트
- [ ] 데이터 품질 검사 (결측치 등)
- [ ] 모델 성과 모니터링 (이전 주 실적)
- [ ] API 할당량 사용 현황
- [ ] 서버 리소스 사용률 (CPU, RAM, 디스크)

### 월간 체크리스트
- [ ] 패키지 업데이트 확인
- [ ] 모델 성능 저하 신호 조사
- [ ] 거래 비용 재계산 (수수료 변화)
- [ ] 보안 감사 (API 키 로테이션 등)

---

## 🐛 일반적인 문제 해결

### 문제 1: "ModuleNotFoundError: No module named 'xgboost'"

```bash
# 해결책
pip install --upgrade xgboost

# 또는
pip uninstall xgboost
pip install xgboost==1.7.5
```

### 문제 2: "pickle.UnpicklingError: invalid load key"

```python
# 해결책: 모델 파일 손상 확인
import pickle
try:
    with open('realtime_upbit_trend_model.pkl', 'rb') as f:
        model = pickle.load(f)
except Exception as e:
    print(f"모델 파일 손상: {e}")
    # 모델 재다운로드 필요
```

### 문제 3: "Upbit API request timeout"

```python
# 원인: API 서버 응답 지연
# 해결책:
import ccxt

upbit = ccxt.upbit({
    'enableRateLimit': True,
    'rateLimit': 1000,  # 1초
})

# 또는 재시도 로직 추가
for attempt in range(3):
    try:
        ohlcv = upbit.fetch_ohlcv('KRW-BTC', '1m', limit=100)
        break
    except Exception as e:
        if attempt < 2:
            time.sleep(2 ** attempt)  # 지수 백오프
        else:
            raise
```

### 문제 4: "NaN values in features"

```python
# 원인: 바이낸스 데이터 부족 또는 환율 데이터 없음
# 해결책:
features = features.fillna(0)  # 0으로 채우기
# 또는
features = features.fillna(features.mean())  # 평균으로 채우기
# 또는
features = features.dropna()  # 제거 (행 수 감소)
```

### 문제 5: "모델 성능 급격히 악화"

```
원인 가능성:
1. 시장 구조 변화 (새로운 사이클)
2. 데이터 오염 (잘못된 가격 데이터)
3. API 변경 (필드명 변경 등)
4. 과적합 (학습 기간 데이터 특성)

대응 방안:
1. 최근 1주 데이터만 사용하여 재검증
2. 데이터 정확성 감시 강화
3. 필터링 규칙 추가 (예: 거래량 최소값)
4. 모델 재학습 (새로운 데이터 기반)
```

---

## 📚 로깅 및 모니터링

### 기본 로깅 설정

```python
import logging

# 로거 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('crypto_inference.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

# 사용
logger.info("모델 로드 완료")
logger.warning("API 응답 지연")
logger.error("예측 실패: {e}")
```

### 성능 모니터링

```python
import time
import psutil

# CPU 사용률
cpu_percent = psutil.cpu_percent(interval=1)
print(f"CPU 사용률: {cpu_percent}%")

# 메모리 사용률
memory_percent = psutil.virtual_memory().percent
print(f"메모리 사용률: {memory_percent}%")

# 추론 지연
start = time.time()
signals = model.predict_signal(features)
latency_ms = (time.time() - start) * 1000
print(f"추론 지연: {latency_ms:.2f}ms")
```

---

## 📖 참고 자료

- **Upbit API 문서**: https://docs.upbit.com/docs/user-api
- **CCXT 문서**: https://docs.ccxt.com/
- **XGBoost 가이드**: https://xgboost.readthedocs.io/
- **Python 환경 관리**: https://realpython.com/python-virtual-environments-a-primer/

---

## 💬 문의 및 피드백

모델 사용 중 문제가 발생하면:

1. **로그 수집**: `crypto_inference.log` 파일 확인
2. **에러 메시지**: 정확한 에러 메시지 기록
3. **재현 단계**: 문제 발생 시 수행한 작업 정리
4. **시스템 정보**: Python 버전, OS, 설치된 패키지 버전

---

Last Updated: 2026-06-05
Version: 1.0
