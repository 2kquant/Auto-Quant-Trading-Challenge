# -*- coding: utf-8 -*-
"""
모의투자 1st_test 스크립트임 ~음
- 기본 잔고 20,000,000원으로 설정되어 있음 ~임
- 모델 파일 경로는 환경변수 `MODEL_PATH` 또는 --model-path 인자로 지정 가능함 ~음
- 입력 데이터는 CSV 재생(옵션) 또는 실제 Upbit API(사용자 수정 필요)로 가능함 ~임
- 거래 기록은 ForKang 폴더에 '테스트 결과.csv'로 저장되며 거래마다 즉시 갱신됨 ~음
- 종료 전까지 계속 실시간(무한 루프)으로 동작함 ~임
"""

import os
import argparse
import pickle
import time
import csv
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Any

import pandas as pd

# 같은 폴더의 realtime_model.py 사용함 ~음
from realtime_model import build_realtime_features, RealtimeFeatureConfig

# 기본 상수임 ~음
DEFAULT_BALANCE_KRW = 20_000_000  # 2천만 원 기본 모의투자 잔고임 ~음
RESULT_CSV = "테스트 결과.csv"  # 거래 기록 파일명임 ~음

# ================= 사용자 설정 영역 (파일 상단에서 경로/옵션 쉽게 수정 가능) =================
# 모델 기본 경로: 친구가 여기만 수정하면 됨(환경변수 MODEL_PATH가 우선임) ~음
DEFAULT_MODEL_PATH = os.environ.get("MODEL_PATH") or r"C:\Quant\models\realtime_upbit_trend_model.pkl"

# 입력 CSV 기본 경로: 과거 1분봉 재생을 원하면 경로를 설정, 없으면 실시간 모드로 동작함 ~음
DEFAULT_INPUT_CSV = None  # 예: r"C:\path\to\1m_history.csv"

# 결과 파일 저장 디렉토: 기본은 이 스크립트가 있는 ForKang 폴더임 ~음
DEFAULT_RESULTS_DIR = Path(__file__).resolve().parent
# =====================================================================================


def parse_args():
    parser = argparse.ArgumentParser(description="모의투자 실시간 테스트 스크립트임 ~음")
    parser.add_argument("--model-path", default=DEFAULT_MODEL_PATH, help="모델 pkl 파일 경로 지정 가능함 (환경변수 MODEL_PATH가 우선이며 여기 값이 기본임) ~음")
    parser.add_argument("--input-csv", default=DEFAULT_INPUT_CSV, help="과거 1분봉 CSV 재생용 경로 (없으면 실시간 모드) ~음")
    parser.add_argument("--markets", default=None, help="관심 마켓 목록, 쉼표구분 (예: KRW-BTC,KRW-ETH) ~음")
    parser.add_argument("--order-krw", type=float, default=1_000_000, help="트레이드당 사용 KRW 금액 (기본 1,000,000원) ~음")
    parser.add_argument("--sleep-sec", type=float, default=60.0, help="루프 대기시간(초), CSV 재생 시는 작게 설정 가능함 ~음")
    parser.add_argument("--horizon-minutes", type=int, default=30, help="보유 기간(분), 모델과 동일하게 설정 권장임 ~음")
    return parser.parse_args()


def load_model(model_path: str):
    # 모델 파일 로드 시도함 ~음
    if not model_path:
        raise ValueError("모델 경로가 지정되지 않았음. 환경변수 MODEL_PATH 또는 --model-path 사용 바람~음")
    p = Path(model_path)
    if not p.exists():
        raise FileNotFoundError(f"모델 파일 찾지 못함: {p} ~음")
    with p.open("rb") as f:
        wrapper = pickle.load(f)
    return wrapper


def ensure_result_csv(path: Path):
    # 결과 CSV가 없으면 헤더 작성함 ~음
    if not path.exists():
        with path.open("w", newline='', encoding='utf-8-sig') as f:
            writer = csv.writer(f)
            writer.writerow([
                'entry_time', 'exit_time', 'market', 'entry_price', 'exit_price', 'quantity', 'order_krw',
                'return_pct', 'net_return_krw', 'trend_probability'
            ])


def append_trade_csv(path: Path, row: Dict[str, Any]):
    # 거래가 발생할 때마다 CSV에 즉시 기록함 ~음
    with path.open("a", newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        writer.writerow([
            row.get('entry_time'), row.get('exit_time'), row.get('market'), row.get('entry_price'),
            row.get('exit_price'), row.get('quantity'), row.get('order_krw'), row.get('return_pct'),
            row.get('net_return_krw'), row.get('trend_probability')
        ])


def replay_csv_mode(df: pd.DataFrame, model_wrapper, config: RealtimeFeatureConfig, order_krw: float, result_csv_path: Path, sleep_sec: float, horizon_minutes: int, markets: List[str] | None):
    # CSV 재생 모드임 ~음
    # df는 전체 히스토리(1분봉) 데이터프레임임 ~음
    # markets 지정 시 해당 마켓만 진행함 ~임
    df['timestamp_utc'] = pd.to_datetime(df['timestamp_utc'], errors='coerce')
    df = df.sort_values('timestamp_utc').reset_index(drop=True)
    if markets:
        target_markets = set(markets)
        df = df[df['market'].isin(target_markets)].copy()
    else:
        target_markets = set(df['market'].unique())

    # 오픈 포지션 목록 관리함 ~음
    open_orders = []  # 각 항목: dict with entry_time, exit_time, market, entry_price, quantity, order_krw, prob
    balance = DEFAULT_BALANCE_KRW

    # 인덱스를 시간 순회하면서 실시간처럼 처리함 ~음
    timestamps = sorted(df['timestamp_utc'].unique())
    for ts in timestamps:
        window = df[df['timestamp_utc'] == ts].copy()
        # 피처 생성하고 신호 예측함 ~음
        try:
            features = build_realtime_features(window, config=config, include_target=False)
            latest = features.sort_values('timestamp_utc').groupby('market').tail(1)
            if latest.empty:
                # 다음 타임스탬프로 이동함 ~음
                time.sleep(0)
                continue
            signals = model_wrapper.predict_signal(latest)
        except Exception as e:
            print(f"피처 생성/예측 실패: {e}")
            continue

        # 매수 신호 처리: signal==1인 경우 매수 주문 실행함 ~음
        for _, row in signals.iterrows():
            if row.get('signal', 0) == 1:
                market = row['market']
                prob = float(row.get('trend_probability', 0.0))
                entry_price = float(row.get('close_u', row.get('close', 0.0)))
                if entry_price == 0.0 or pd.isna(entry_price):
                    continue
                order_amount = order_krw
                quantity = order_amount / entry_price
                entry_time = row['timestamp_utc']
                exit_time = entry_time + pd.Timedelta(minutes=horizon_minutes)
                open_orders.append({
                    'entry_time': entry_time,
                    'exit_time': exit_time,
                    'market': market,
                    'entry_price': entry_price,
                    'quantity': quantity,
                    'order_krw': order_amount,
                    'prob': prob
                })
                # 잔고는 주문금액만 차감(모의투자 상 기록) ~음
                balance -= order_amount
                print(f"[매수] {market} 진입 {entry_time} 가격 {entry_price:.4f} 수량 {quantity:.6f} 금액 {order_amount} 잔고 {balance}")

        # 오픈 포지션 종료 체크 및 정산함 ~음
        to_close = [o for o in open_orders if o['exit_time'] <= ts]
        for o in to_close:
            # 종료 시점의 가격 찾음(동일 타임스탬프의 close_u 사용)
            exit_rows = df[(df['market'] == o['market']) & (df['timestamp_utc'] == o['exit_time'])]
            if exit_rows.empty:
                # 정확한 타임스탬프가 없으면 가장 근접한 이후 가격 사용함 ~음
                candidate = df[(df['market'] == o['market']) & (df['timestamp_utc'] > o['exit_time'])]
                if not candidate.empty:
                    exit_price = float(candidate.iloc[0]['close_u'])
                else:
                    # 가격을 찾을 수 없으면 스킵함 ~음
                    continue
            else:
                exit_price = float(exit_rows.iloc[0]['close_u'])

            return_pct = (exit_price - o['entry_price']) / o['entry_price']
            # 비용 고려: fee_bps from config
            cost_rate = config.fee_bps / 10000.0 * 2  # 매수+매도 가정 ~음
            net_return_pct = return_pct - cost_rate
            net_return_krw = o['order_krw'] * net_return_pct
            # 잔고에 출금된 주문금액과 손익 반영하여 복원함 ~음
            balance += o['order_krw'] + net_return_krw

            # 기록 저장함 ~음
            trade_row = {
                'entry_time': o['entry_time'].isoformat(),
                'exit_time': o['exit_time'].isoformat(),
                'market': o['market'],
                'entry_price': o['entry_price'],
                'exit_price': exit_price,
                'quantity': o['quantity'],
                'order_krw': o['order_krw'],
                'return_pct': return_pct,
                'net_return_krw': net_return_krw,
                'trend_probability': o['prob']
            }
            append_trade_csv(result_csv_path, trade_row)
            print(f"[청산] {o['market']} 종료 {o['exit_time']} exit_price {exit_price:.4f} 손익 {net_return_krw:.0f}원 잔고 {balance:.0f}")
            open_orders.remove(o)

        # 재생 모드에서는 sleep으로 속도 제어 가능함 ~음
        time.sleep(max(0.0, sleep_sec))

    print("CSV 재생 완료됨")


def live_api_mode(model_wrapper, config: RealtimeFeatureConfig, order_krw: float, result_csv_path: Path, sleep_sec: float, horizon_minutes: int, markets: List[str] | None):
    # 실시간 Upbit API 모드 구조 제공함(친구가 API 코드 수정하여 사용) ~음
    # CCXT 사용 예시를 주석으로 제공함 ~임
    try:
        import ccxt
    except Exception:
        print("ccxt 필요함: pip install ccxt")
        return

    upbit = ccxt.upbit({
        # 'apiKey': 'YOUR_UPBIT_ACCESS_KEY',
        # 'secret': 'YOUR_UPBIT_SECRET_KEY',
        # 친구가 키를 여기에 넣어 사용하면 됨 ~음
    })

    balance = DEFAULT_BALANCE_KRW
    open_orders = []

    while True:
        try:
            all_candles = []
            target_markets = markets if markets else ['KRW-BTC']  # 기본 단일 마켓 예시임 ~음
            for market in target_markets:
                try:
                    ohlcv = upbit.fetch_ohlcv(market, '1m', limit=120)
                    for candle in ohlcv:
                        ts_ms, o, h, l, c, v = candle
                        all_candles.append({
                            'market': market,
                            'timestamp_utc': pd.to_datetime(ts_ms, unit='ms'),
                            'open_u': o,
                            'high_u': h,
                            'low_u': l,
                            'close_u': c,
                            'volume_u': v,
                        })
                except Exception as e:
                    print(f"{market} 캔들 조회 실패: {e}")
                    continue

            if not all_candles:
                time.sleep(5)
                continue

            df = pd.DataFrame(all_candles)
            features = build_realtime_features(df, config=config, include_target=False)
            latest = features.sort_values('timestamp_utc').groupby('market').tail(1)
            signals = model_wrapper.predict_signal(latest)

            # 매수 신호 처리
            for _, row in signals.iterrows():
                if row.get('signal', 0) == 1:
                    market = row['market']
                    prob = float(row.get('trend_probability', 0.0))
                    entry_price = float(row.get('close_u', row.get('close', 0.0)))
                    order_amount = order_krw
                    quantity = order_amount / entry_price
                    entry_time = row['timestamp_utc']
                    exit_time = entry_time + pd.Timedelta(minutes=horizon_minutes)
                    open_orders.append({
                        'entry_time': entry_time,
                        'exit_time': exit_time,
                        'market': market,
                        'entry_price': entry_price,
                        'quantity': quantity,
                        'order_krw': order_amount,
                        'prob': prob
                    })
                    balance -= order_amount
                    print(f"[매수] {market} 진입 {entry_time} 가격 {entry_price:.4f} 잔고 {balance}")

            # 오픈 포지션 종료 체크
            now = pd.Timestamp.utcnow()
            to_close = [o for o in open_orders if o['exit_time'] <= now]
            for o in to_close:
                # 실시간 모드에서는 최근 캔들에서 exit 가격 추정함 ~음
                try:
                    recent = df[(df['market'] == o['market']) & (df['timestamp_utc'] >= o['exit_time'])]
                    if not recent.empty:
                        exit_price = float(recent.iloc[0]['close_u'])
                    else:
                        exit_price = o['entry_price']
                except Exception:
                    exit_price = o['entry_price']

                return_pct = (exit_price - o['entry_price']) / o['entry_price']
                cost_rate = config.fee_bps / 10000.0 * 2
                net_return_pct = return_pct - cost_rate
                net_return_krw = o['order_krw'] * net_return_pct
                balance += o['order_krw'] + net_return_krw

                trade_row = {
                    'entry_time': o['entry_time'].isoformat(),
                    'exit_time': o['exit_time'].isoformat(),
                    'market': o['market'],
                    'entry_price': o['entry_price'],
                    'exit_price': exit_price,
                    'quantity': o['quantity'],
                    'order_krw': o['order_krw'],
                    'return_pct': return_pct,
                    'net_return_krw': net_return_krw,
                    'trend_probability': o['prob']
                }
                append_trade_csv(result_csv_path, trade_row)
                print(f"[청산] {o['market']} 종료 {o['exit_time']} 손익 {net_return_krw:.0f}원 잔고 {balance:.0f}")
                open_orders.remove(o)

            time.sleep(max(1.0, sleep_sec))

        except KeyboardInterrupt:
            print("종료 감지: KeyboardInterrupt")
            break
        except Exception as e:
            print(f"루프 에러: {e}")
            time.sleep(5)


if __name__ == '__main__':
    args = parse_args()

    # 모델 로드함 ~음
    try:
        model_wrapper = load_model(args.model_path)
    except Exception as e:
        print(f"모델 로드 실패: {e}")
        raise

    # 결과 CSV 준비함 ~음
    result_csv_path = DEFAULT_RESULTS_DIR / RESULT_CSV
    ensure_result_csv(result_csv_path)

    # 피처 config 설정함 ~음
    config = RealtimeFeatureConfig(horizon_minutes=args.horizon_minutes, min_return_bps=12.0, fee_bps=5.0)

    # markets 파싱함 ~음
    markets = args.markets.split(',') if args.markets else None

    # 입력 모드 분기함 ~음
    if args.input_csv:
        # CSV 재생 모드임 ~음
        csv_path = Path(args.input_csv)
        if not csv_path.exists():
            print(f"입력 CSV 없음: {csv_path} ~음")
            raise SystemExit(1)
        df = pd.read_csv(csv_path, parse_dates=['timestamp_utc'])
        replay_csv_mode(df, model_wrapper, config, args.order_krw, result_csv_path, args.sleep_sec, args.horizon_minutes, markets)
    else:
        # 실시간 모드 (Upbit API) 사용 예시 제공함 ~음
        live_api_mode(model_wrapper, config, args.order_krw, result_csv_path, args.sleep_sec, args.horizon_minutes, markets)
