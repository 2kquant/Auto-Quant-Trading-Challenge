"""
업비트 AI 실시간 추론 예제

이 스크립트는 모델을 로드하고 간단한 추론을 수행합니다.
실제 Upbit API 연결은 별도로 구성해야 합니다.
"""

import pickle
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from pathlib import Path

# realtime_model.py를 같은 디렉토리에 배치하고 import
from realtime_model import build_realtime_features, RealtimeCryptoModel


# ============================================================================
# 예제 1: 모델 로드 및 기본 정보 확인
# ============================================================================
def example_1_load_and_inspect():
    """모델 로드 및 메타데이터 확인"""
    print("\n" + "="*80)
    print("예제 1: 모델 로드 및 메타데이터 확인")
    print("="*80)
    
    model_path = Path(__file__).parent / "realtime_upbit_trend_model.pkl"
    
    if not model_path.exists():
        print(f"❌ 모델 파일 찾지 못함: {model_path}")
        return
    
    with open(model_path, 'rb') as f:
        model: RealtimeCryptoModel = pickle.load(f)
    
    print(f"✅ 모델 로드 성공")
    print(f"\n📊 모델 정보:")
    print(f"  - 생성 시간: {model.metadata['created_at_local']}")
    print(f"  - 선택된 모델: {model.metadata['selected_candidate']}")
    print(f"  - 추론 장치: {model.metadata['inference_device']}")
    print(f"  - Threshold: {model.threshold:.6f}")
    print(f"  - 피처 개수: {len(model.feature_columns)}")
    
    print(f"\n🔧 설정:")
    config = model.config
    print(f"  - 예측 horizon: {config.horizon_minutes} 분")
    print(f"  - 양성 라벨 기준: {config.min_return_bps} bp 이상")
    print(f"  - 거래 비용 가정: {config.fee_bps} bp")
    
    print(f"\n📈 학습 데이터:")
    source_meta = model.metadata['source_meta']
    print(f"  - 데이터 범위: {source_meta['four_year_cutoff']} 이후")
    print(f"  - 마켓 수: {len(source_meta['markets'])}")
    print(f"  - 마켓 목록: {', '.join(source_meta['markets'][:5])}...")
    
    print(f"\n🎯 Validation 성과 (테스트셋):")
    # (실제로는 metrics.json에서 읽어오는 것이 권장)
    print(f"  - (자세한 성과는 realtime_upbit_trend_metrics.json 참조)")
    
    return model


# ============================================================================
# 예제 2: 더미 데이터로 피처 생성 및 추론
# ============================================================================
def example_2_dummy_inference():
    """더미 데이터를 사용한 피처 생성 및 추론 예제"""
    print("\n" + "="*80)
    print("예제 2: 더미 데이터로 피처 생성 및 추론")
    print("="*80)
    
    # 1. 모델 로드
    model_path = Path(__file__).parent / "realtime_upbit_trend_model.pkl"
    with open(model_path, 'rb') as f:
        model = pickle.load(f)
    
    # 2. 더미 데이터 생성 (각 마켓별 최근 120개 캔들 시뮬레이션)
    print("\n📝 더미 데이터 생성 중...")
    
    np.random.seed(42)
    markets = ['KRW-BTC', 'KRW-ETH', 'KRW-XRP', 'KRW-ADA']
    base_time = datetime.utcnow() - timedelta(minutes=120)
    
    rows = []
    for market in markets:
        # 120개의 1분 캔들
        prices = 100 * np.exp(np.cumsum(np.random.randn(120) * 0.01))  # 기하 브라운 운동
        volumes = np.random.uniform(100, 1000, 120)
        
        for i in range(120):
            timestamp = base_time + timedelta(minutes=i)
            price_range = prices[max(0, i-5):i+1]
            
            rows.append({
                'market': market,
                'timestamp_utc': timestamp,
                'open_u': prices[i] * (1 + np.random.randn() * 0.001),
                'high_u': max(price_range) * 1.001,
                'low_u': min(price_range) * 0.999,
                'close_u': prices[i],
                'volume_u': volumes[i],
                # 바이낸스 동시점 (유사한 가격)
                'open_b': prices[i] * (1 + np.random.randn() * 0.001),
                'high_b': max(price_range) * 1.001,
                'low_b': min(price_range) * 0.999,
                'close_b': prices[i] * (1 + np.random.randn() * 0.002),
                'volume_b': volumes[i] * 2,  # USDT 기준 거래량
                'taker_buy_base_volume': volumes[i] * 2 * 0.45,  # 약 45% taker buy
                # 환율, 김프
                'market_fx': 1300,  # USD/KRW
                'kimp_real': np.random.uniform(-0.5, 0.5),  # -0.5% ~ +0.5% 김프
            })
    
    df = pd.DataFrame(rows)
    print(f"✅ 더미 데이터 생성 완료: {len(df)} 행, {df['market'].nunique()} 마켓")
    
    # 3. 피처 생성
    print("\n🔨 피처 생성 중...")
    try:
        features = build_realtime_features(
            df, 
            config=model.config, 
            include_target=False  # 추론용이므로 target 없음
        )
        print(f"✅ 피처 생성 완료: {features.shape}")
        print(f"   피처 컬럼 수: {len([c for c in features.columns if c not in ['market', 'timestamp_utc']])}")
    except Exception as e:
        print(f"❌ 피처 생성 실패: {e}")
        return
    
    # 4. 최신 시점만 추출
    print("\n📊 최신 데이터 추출 중...")
    latest = features.sort_values('timestamp_utc').groupby('market').tail(1)
    print(f"✅ 최신 데이터 추출: {len(latest)} 행")
    
    # 5. 신호 생성
    print("\n🎯 신호 생성 중...")
    try:
        signals = model.predict_signal(latest)
        print(f"✅ 신호 생성 완료")
        print(f"\n📋 추론 결과:")
        print(signals[['market', 'trend_probability', 'signal', 'timestamp_utc']])
        
        # 6. 결과 분석
        buy_signals = signals[signals['signal'] == 1]
        if len(buy_signals) > 0:
            print(f"\n🚀 매수 신호 {len(buy_signals)}개 발생:")
            for _, row in buy_signals.iterrows():
                print(f"   {row['market']}: 확률 {row['trend_probability']:.2%}")
        else:
            print(f"\n⏸️ 매수 신호 없음")
            
    except Exception as e:
        print(f"❌ 신호 생성 실패: {e}")
        import traceback
        traceback.print_exc()


# ============================================================================
# 예제 3: 실제 Upbit API 통합 예제 (구조만 제시)
# ============================================================================
def example_3_upbit_api_structure():
    """실제 Upbit API 통합 예제 (스켈레톤)"""
    print("\n" + "="*80)
    print("예제 3: Upbit API 통합 예제 (구조)")
    print("="*80)
    
    code = """
# 실제 구현 시 다음 구조로 진행:

import ccxt
import pickle
from realtime_model import build_realtime_features
import pandas as pd
import time
from datetime import datetime

# 1. API 초기화
upbit = ccxt.upbit({
    'apiKey': 'YOUR_UPBIT_ACCESS_KEY',
    'secret': 'YOUR_UPBIT_SECRET_KEY',
})

# 2. 모델 로드
with open('realtime_upbit_trend_model.pkl', 'rb') as f:
    model = pickle.load(f)

# 3. 모니터링 마켓 정의
MARKETS = ['KRW-BTC', 'KRW-ETH', 'KRW-XRP', 'KRW-ADA', 'KRW-SOL']
HISTORY_WINDOW = 120  # 최소 120개 캔들 필요

# 4. 캔들 히스토리 관리
market_history = {market: [] for market in MARKETS}

# 5. 실시간 루프
while True:
    try:
        # 5.1 각 마켓별 최근 캔들 조회
        all_candles = []
        for market in MARKETS:
            try:
                ohlcv = upbit.fetch_ohlcv(market, '1m', limit=HISTORY_WINDOW)
                # ohlcv = [timestamp, open, high, low, close, volume]
                
                for candle in ohlcv:
                    timestamp_ms, o, h, l, c, v = candle
                    timestamp_utc = pd.to_datetime(timestamp_ms, unit='ms', utc=True)
                    
                    all_candles.append({
                        'market': market,
                        'timestamp_utc': timestamp_utc,
                        'open_u': o,
                        'high_u': h,
                        'low_u': l,
                        'close_u': c,
                        'volume_u': v,
                    })
            except Exception as e:
                print(f"⚠️ {market} 조회 실패: {e}")
                continue
        
        if not all_candles:
            print("❌ 캔들 데이터 없음")
            time.sleep(10)
            continue
        
        # 5.2 바이낸스 데이터 보강 (별도 로직)
        # df에 open_b, high_b, low_b, close_b, volume_b, taker_buy_base_volume 추가
        
        # 5.3 환율, 김프 데이터 추가 (별도 로직)
        # df에 market_fx, kimp_real 추가
        
        df = pd.DataFrame(all_candles)
        
        # 5.4 피처 생성 및 추론
        features = build_realtime_features(
            df, 
            config=model.config, 
            include_target=False
        )
        latest = features.sort_values('timestamp_utc').groupby('market').tail(1)
        signals = model.predict_signal(latest)
        
        # 5.5 신호 처리
        for _, row in signals.iterrows():
            if row['signal'] == 1:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] 🚀 {row['market']} "
                      f"확률={row['trend_probability']:.2%}")
                
                # 매수 주문 로직
                # order = upbit.create_limit_buy_order(
                #     row['market'],
                #     quantity,
                #     price
                # )
        
        # 5.6 대기 (1분마다 체크)
        time.sleep(60)
        
    except KeyboardInterrupt:
        print("\\n종료...")
        break
    except Exception as e:
        print(f"❌ 에러: {e}")
        time.sleep(10)
"""
    
    print(code)
    print("\n⚠️ 주의사항:")
    print("  1. 실제 구현 시 바이낸스 데이터, 환율, 김프 취득 로직 추가 필요")
    print("  2. API 요청 제한 대비 (rate limiting)")
    print("  3. 실거래 전 충분한 검증 (데모 계정으로 테스트)")
    print("  4. 모든 오류 처리 및 로깅 추가 권장")


# ============================================================================
# 예제 4: 배치 추론 (백테스트)
# ============================================================================
def example_4_batch_inference():
    """과거 데이터로 배치 추론 및 백테스트"""
    print("\n" + "="*80)
    print("예제 4: 배치 추론 (백테스트 구조)")
    print("="*80)
    
    code = """
import pandas as pd
import numpy as np
from pathlib import Path
import pickle
from realtime_model import build_realtime_features

# 1. 모델 로드
with open('realtime_upbit_trend_model.pkl', 'rb') as f:
    model = pickle.load(f)

# 2. 과거 데이터 로드 (예: parquet 또는 csv)
# df = pd.read_parquet('historical_1m_data.parquet')
# 또는
# df = pd.read_csv('historical_1m_data.csv', parse_dates=['timestamp_utc'])

# 예제 (더미 데이터 사용)
import example_inference
df = example_inference.create_dummy_data(days=10, markets=['KRW-BTC', 'KRW-ETH'])

# 3. 피처 생성
print("피처 생성 중...")
features = build_realtime_features(
    df, 
    config=model.config, 
    include_target=True  # 백테스트이므로 target 포함
)

# 4. 신호 생성
print("신호 생성 중...")
signals = model.predict_signal(features)

# 5. 거래 시뮬레이션
trades = []
for i, row in signals.iterrows():
    if row['signal'] == 1:
        # 30분 뒤 실제 가격 조회
        future_time = row['timestamp_utc'] + pd.Timedelta(minutes=30)
        future_data = features[
            (features['market'] == row['market']) &
            (features['timestamp_utc'] == future_time)
        ]
        
        if not future_data.empty:
            entry_price = row['close_u']
            exit_price = future_data['close_u'].iloc[0]
            
            # 수익률 계산 (비용 포함)
            return_pct = (exit_price - entry_price) / entry_price
            cost = model.config.fee_bps / 10000  # bp -> 비율
            net_return = return_pct - cost
            
            trades.append({
                'market': row['market'],
                'entry_time': row['timestamp_utc'],
                'entry_price': entry_price,
                'exit_price': exit_price,
                'probability': row['trend_probability'],
                'return_pct': net_return,
                'win': 1 if net_return > 0 else 0,
            })

# 6. 성과 분석
trades_df = pd.DataFrame(trades)
if len(trades_df) > 0:
    total_return = (1 + trades_df['return_pct']).prod() - 1
    win_rate = trades_df['win'].mean()
    avg_win = trades_df[trades_df['return_pct'] > 0]['return_pct'].mean()
    avg_loss = trades_df[trades_df['return_pct'] < 0]['return_pct'].mean()
    
    print(f"\\n📊 백테스트 결과:")
    print(f"  총 거래: {len(trades_df)}")
    print(f"  승률: {win_rate:.2%}")
    print(f"  평균 수익: {avg_win:.2%}")
    print(f"  평균 손실: {avg_loss:.2%}")
    print(f"  총 수익률: {total_return:.2%}")
    print(f"  Profit Factor: {abs(trades_df[trades_df['return_pct'] > 0]['return_pct'].sum() / "
          f"trades_df[trades_df['return_pct'] < 0]['return_pct'].sum()):.2f}")
else:
    print("거래 없음")
"""
    
    print(code)


# ============================================================================
# 예제 5: 더미 데이터 생성 함수
# ============================================================================
def create_dummy_data(days=5, markets=None):
    """테스트용 더미 데이터 생성"""
    if markets is None:
        markets = ['KRW-BTC', 'KRW-ETH', 'KRW-XRP']
    
    np.random.seed(42)
    minutes_per_day = 24 * 60
    total_minutes = days * minutes_per_day
    
    base_time = datetime.utcnow() - timedelta(days=days)
    rows = []
    
    for market in markets:
        prices = 100 * np.exp(np.cumsum(np.random.randn(total_minutes) * 0.001))
        volumes = np.random.uniform(100, 1000, total_minutes)
        
        for i in range(total_minutes):
            timestamp = base_time + timedelta(minutes=i)
            price_range = prices[max(0, i-5):i+1]
            
            rows.append({
                'market': market,
                'timestamp_utc': timestamp,
                'open_u': prices[i] * (1 + np.random.randn() * 0.0001),
                'high_u': max(price_range) * 1.0001,
                'low_u': min(price_range) * 0.9999,
                'close_u': prices[i],
                'volume_u': volumes[i],
                'open_b': prices[i] * (1 + np.random.randn() * 0.0001),
                'high_b': max(price_range) * 1.0001,
                'low_b': min(price_range) * 0.9999,
                'close_b': prices[i] * (1 + np.random.randn() * 0.0002),
                'volume_b': volumes[i] * 2,
                'taker_buy_base_volume': volumes[i] * 2 * 0.45,
                'market_fx': 1300,
                'kimp_real': np.random.uniform(-0.5, 0.5),
            })
    
    return pd.DataFrame(rows)


# ============================================================================
# 메인 실행
# ============================================================================
if __name__ == "__main__":
    print("\n" + "="*80)
    print(" 업비트 AI 실시간 추론 예제 모음")
    print("="*80)
    
    # 예제 1: 모델 로드 및 정보 확인
    model = example_1_load_and_inspect()
    
    # 예제 2: 더미 데이터로 추론 테스트
    if model:
        example_2_dummy_inference()
    
    # 예제 3: Upbit API 통합 구조
    example_3_upbit_api_structure()
    
    # 예제 4: 배치 추론 (백테스트)
    example_4_batch_inference()
    
    print("\n" + "="*80)
    print(" 예제 종료")
    print("="*80)
