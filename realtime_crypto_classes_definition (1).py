# -*- coding: utf-8 -*-
"""
RealtimeCryptoModel 관련 클래스 정의서임 ~음
실시간 Upbit 추세 예측 모델의 핵심 클래스들을 정의했음 ~임
"""

from dataclasses import dataclass
from typing import Any
import numpy as np
import pandas as pd


# ====================== 1. RealtimeFeatureConfig 클래스 ======================
@dataclass(frozen=True)
class RealtimeFeatureConfig:
    """
    실시간 피처 생성 및 라벨링 설정임 ~음
    
    속성(Attributes):
        horizon_minutes (int): 예측 대상 시간(분), 기본값 30분임 ~음
            - 현재 1분봉 종료 시점 기준으로 N분 뒤 수익률 예측함 ~임
        
        min_return_bps (float): 양성 라벨 기준(basis points, bp) ~음
            - 예: 12.0 = 12bp = 0.12% 이상 수익 시 라벨=1임 ~임
        
        fee_bps (float): 거래 비용 가정(basis points) ~음
            - 기본값 5.0bp(Upbit 편도 수수료 추정)임 ~임
            - 계산 시 수익률에서 비용을 차감함 ~음
    
    메서드:
        positive_return_threshold (property): min_return_bps를 비율로 변환함 ~음
            - 반환: min_return_bps / 10000.0 형태의 소수값 ~임
    
    사용 예:
        config = RealtimeFeatureConfig(horizon_minutes=30, min_return_bps=12.0, fee_bps=5.0)
        threshold = config.positive_return_threshold  # 0.0012
    """
    
    horizon_minutes: int = 30
    min_return_bps: float = 12.0
    fee_bps: float = 5.0

    @property
    def positive_return_threshold(self) -> float:
        """min_return_bps를 소수 비율로 변환함 ~음"""
        return self.min_return_bps / 10_000.0


# ====================== 2. RealtimeCryptoModel 클래스 ======================
class RealtimeCryptoModel:
    """
    실시간 추론용 모델 wrapper임 ~음
    XGBoost 모델과 피처 정렬, threshold 기반 신호 생성을 캡슐화함 ~임
    
    pickle로 저장/복구되는 배포용 객체임 ~음
    
    속성(Attributes):
        model (Any): 학습된 XGBoost 모델 객체임 ~음
            - predict_proba() 메서드를 가져야 함 ~임
        
        feature_columns (list[str]): 모델이 입력받아야 하는 피처 이름들의 순서 리스트임 ~음
            - 91개 피처(ret_1m, volatility_5m, ... 등)의 정렬된 컬럼명임 ~임
        
        threshold (float): 신호 생성 임계값(0~1 범위) ~음
            - predict_proba() 출력이 threshold 이상이면 signal=1(매수)임 ~임
        
        config (RealtimeFeatureConfig): 피처 생성 설정임 ~음
        
        metadata (dict): 모델 생성 정보 메타데이터(타임스탬프, source_meta 등) ~음
    
    메서드:
        predict_proba(feature_frame: pd.DataFrame) -> np.ndarray:
            피처 데이터프레임 → [0, 1] 확률 배열로 변환함 ~음
            - 입력: feature_frame (보정되지 않은 피처 df)
            - 출력: np.ndarray, shape (n_samples,), 각 값은 0~1 확률 ~임
            - 내부에서 align_feature_frame()으로 정렬/보정함 ~음
        
        predict_signal(feature_frame: pd.DataFrame) -> pd.DataFrame:
            입력 df에 trend_probability, signal, threshold 컬럼을 추가하여 반환함 ~음
            - 입력: feature_frame (최소 필수 컬럼: market, timestamp_utc, 피처 컬럼들)
            - 출력: pd.DataFrame (입력 + 3개 새 컬럼)
            - signal: threshold 이상이면 1(매수), 미만이면 0(대기) ~임
    
    사용 예:
        with open('realtime_upbit_trend_model.pkl', 'rb') as f:
            model = pickle.load(f)
        
        signals = model.predict_signal(feature_df)
        buy_signals = signals[signals['signal'] == 1]  # 매수 신호만 필터링
    """
    
    def __init__(
        self,
        model: Any,
        feature_columns: list[str],
        threshold: float,
        config: RealtimeFeatureConfig,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """
        모델 wrapper 초기화함 ~음
        
        파라미터:
            model: XGBoost 모델 객체 ~음
            feature_columns: 피처 컬럼 이름 리스트(순서 중요) ~음
            threshold: 신호 생성 임계값(0~1) ~음
            config: RealtimeFeatureConfig 객체 ~음
            metadata: 메타데이터 딕셔너리(선택사항) ~음
        """
        self.model = model
        self.feature_columns = feature_columns
        self.threshold = float(threshold)
        self.config = config
        self.metadata = metadata or {}

    def predict_proba(self, feature_frame: pd.DataFrame) -> np.ndarray:
        """
        피처 데이터프레임에서 추세 확률(0~1)을 예측함 ~음
        
        파라미터:
            feature_frame (pd.DataFrame): 피처 컬럼들 포함 데이터프레임 ~음
        
        반환:
            np.ndarray: shape (n_rows,), 각 행의 추세 확률값 ~음
        """
        # align_feature_frame()으로 컬럼 정렬 및 NaN 보정함 ~음
        frame = align_feature_frame(feature_frame, self.feature_columns)
        # XGBoost predict_proba()는 [클래스0확률, 클래스1확률] 반환, 클래스1만 추출함 ~음
        return self.model.predict_proba(frame)[:, 1]

    def predict_signal(self, feature_frame: pd.DataFrame) -> pd.DataFrame:
        """
        피처 df를 입력받아 신호(0/1)를 생성하여 반환함 ~음
        
        파라미터:
            feature_frame (pd.DataFrame): 피처 컬럼 포함 원본 df ~음
        
        반환:
            pd.DataFrame: 입력 df + [trend_probability, signal, threshold] 컬럼 ~음
        """
        out = feature_frame.copy()
        proba = self.predict_proba(out)
        out["trend_probability"] = proba
        out["signal"] = (proba >= self.threshold).astype(int)
        out["threshold"] = self.threshold
        return out


# ====================== 3. RealtimeCryptoModelSuite 클래스 ======================
class RealtimeCryptoModelSuite:
    """
    여러 horizon(예측 기간)을 지원하는 모델 모음임 ~음
    각 horizon별 RealtimeCryptoModel을 딕셔너리로 관리함 ~임
    
    속성(Attributes):
        models (dict[str, RealtimeCryptoModel]): horizon 이름 → 모델 객체 ~음
            - 키 예: "short_30m", "medium_60m" 등 ~임
        
        metadata (dict): 스위트 전체 메타데이터 ~음
        
        feature_columns (list[str]): 모든 모델이 공유하는 피처 컬럼 리스트임 ~음
    
    메서드:
        available_horizons() -> list[str]:
            사용 가능한 horizon 목록을 정렬하여 반환함 ~음
            - 반환: horizon 이름 목록(알파벳순) ~임
        
        predict_proba(feature_frame, horizon) -> np.ndarray:
            특정 horizon 모델로 확률을 예측함 ~음
            - 파라미터:
              - feature_frame: 피처 df ~음
              - horizon: 모델 선택(기본 "short_30m") ~음
            - 반환: 확률 배열 ~임
        
        predict_signal(feature_frame, horizon) -> pd.DataFrame:
            특정 horizon 모델로 신호를 생성함 ~음
            - 반환 df에 "horizon" 컬럼이 추가됨 ~임
    
    사용 예:
        suite = pickle.load(...)  # 여러 horizon 모델 포함
        horizons = suite.available_horizons()  # ['medium_60m', 'short_30m']
        signals = suite.predict_signal(df, horizon='medium_60m')
    """
    
    def __init__(self, models: dict[str, RealtimeCryptoModel], metadata: dict[str, Any] | None = None) -> None:
        """
        모델 스위트 초기화함 ~음
        
        파라미터:
            models: horizon 이름 → RealtimeCryptoModel 객체 딕셔너리 ~음
            metadata: 스위트 메타데이터(선택사항) ~음
        """
        self.models = models
        self.metadata = metadata or {}
        self.feature_columns = REALTIME_FEATURE_COLUMNS  # 공유 컬럼 ~음

    def available_horizons(self) -> list[str]:
        """사용 가능한 horizon 목록을 정렬하여 반환함 ~음"""
        return sorted(self.models)

    def predict_proba(self, feature_frame: pd.DataFrame, horizon: str = "short_30m") -> np.ndarray:
        """특정 horizon 모델로 확률을 예측함 ~음"""
        return self.models[horizon].predict_proba(feature_frame)

    def predict_signal(self, feature_frame: pd.DataFrame, horizon: str = "short_30m") -> pd.DataFrame:
        """특정 horizon 모델로 신호를 생성, horizon 컬럼 추가함 ~음"""
        out = self.models[horizon].predict_signal(feature_frame)
        out["horizon"] = horizon
        return out


# ====================== 4. 유틸리티 함수들 ======================
def align_feature_frame(frame: pd.DataFrame, feature_columns: list[str] | None = None) -> pd.DataFrame:
    """
    입력 피처 프레임을 모델 입력 순서대로 정렬하고 보정함 ~음
    
    동작:
        1. feature_columns 순서대로 컬럼 재배치 ~음
        2. 모든 값을 float으로 변환, inf/-inf → NaN으로 처리 ~음
        3. NaN값은 중앙값(median) 또는 0으로 채움 ~임
    
    파라미터:
        frame (pd.DataFrame): 피처 데이터프레임 ~음
        feature_columns: 정렬 기준 컬럼 순서(None이면 기본값 사용) ~음
    
    반환:
        pd.DataFrame: 정렬되고 float32로 변환된 데이터프레임 ~음
    """
    # 구현 생략 (realtime_model.py 참조) ~음
    pass


def build_realtime_features(
    frame: pd.DataFrame,
    config: RealtimeFeatureConfig | None = None,
    include_target: bool = True,
) -> pd.DataFrame:
    """
    1분봉 데이터로부터 실시간 피처를 생성함 ~음
    
    입력 요구사항:
        - market, timestamp_utc, open_u, high_u, low_u, close_u, volume_u 필수 ~음
        - open_b, high_b, low_b, close_b, volume_b, taker_buy_base_volume 선택 ~음
        - market_fx, kimp_real 선택 ~음
    
    출력 피처(91개):
        - 가격 모멘텀(10개): ret_1m ~ ret_2880m ~음
        - 캔들 구조(4개): range_pct, body_pct, upper_wick_pct, lower_wick_pct ~음
        - 변동성(10개): volatility_*, realized_vol_* ~음
        - 추세 지표(9개): ema_*, macd_*, rsi_14, bb_z_20, dist_*, breakout_20 ~음
        - 시장 구조(58개+): 유동성, 크로스마켓, 스프레드, 거시지표, 시간정보 ~음
    
    파라미터:
        frame (pd.DataFrame): OHLCV 데이터프레임 ~음
        config (RealtimeFeatureConfig): 피처 설정 ~음
        include_target (bool): 라벨 생성 포함 여부 ~음
    
    반환:
        pd.DataFrame: 피처 컬럼 91개 + target(선택적) ~음
    """
    # 구현 생략 (realtime_model.py 참조) ~음
    pass


# ====================== 5. 전역 상수 ======================
REALTIME_FEATURE_COLUMNS = [
    # 가격 모멘텀 (10개)
    "ret_1m", "ret_3m", "ret_5m", "ret_15m", "ret_30m", "ret_60m",
    "ret_120m", "ret_240m", "ret_720m", "ret_1440m", "ret_2880m",
    
    # 캔들 구조 (4개)
    "range_pct", "body_pct", "upper_wick_pct", "lower_wick_pct",
    
    # 변동성 (10개)
    "volatility_5m", "volatility_15m", "volatility_30m_rt", "volatility_60m",
    "volatility_240m", "volatility_1440m", "realized_vol_30m", "realized_vol_120m",
    "realized_vol_240m", "realized_vol_1440m",
    
    # 추세 지표 (9개)
    "ema_12_ratio", "ema_26_ratio", "ema_60_ratio", "ema_120_ratio", "ema_240_ratio",
    "ema_1440_ratio", "macd_ratio", "macd_signal_ratio", "macd_hist_ratio", "rsi_14",
    "bb_z_20", "dist_high_60", "dist_low_60", "breakout_20",
    
    # 유동성 (8개)
    "volume_rel_30", "volume_rel_120", "volume_rel_1440",
    "value_rel_30", "value_rel_120", "value_rel_1440",
    "value_z_120", "value_z_1440",
    
    # 바이낸스 연동 (11개)
    "binance_ret_1m", "binance_ret_5m", "binance_ret_15m", "binance_ret_30m",
    "binance_ret_60m", "binance_ret_120m", "binance_ret_240m", "binance_range_pct",
    "binance_volume_rel_30", "binance_volume_rel_240", "binance_taker_buy_ratio",
    
    # 업비트-바이낸스 스프레드 (9개)
    "upbit_binance_ret_spread_5m", "upbit_binance_ret_spread_15m",
    "upbit_binance_ret_spread_60m", "upbit_binance_ret_spread_240m",
    "kimp_real", "kimp_velocity_5m", "kimp_velocity_15m", "kimp_velocity_60m",
    "kimp_velocity_240m", "kimp_z_1440",
    
    # 환율 및 시장 레짐 (20개)
    "market_fx", "market_fx_change_60m", "market_fx_change_1440m",
    "btc_dominance", "btc_dominance_change_60m", "btc_dominance_change_1440m",
    "btc_dominance_z_1440", "btc_ret_15m", "btc_ret_60m", "btc_volatility_30m",
    "eth_ret_15m", "eth_ret_60m", "eth_volatility_30m",
    
    # 시간 정보 (4개)
    "hour_sin", "hour_cos", "dow_sin", "dow_cos",
]
