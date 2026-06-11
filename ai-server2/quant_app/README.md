# For_kang_2

`For_kang_2`는 실시간 모델 판단 로그, 실시간 피처 모니터링, 진입 후보 TOP N 랭킹, 모델 신뢰도 추적, 가상 진입 백테스트 로그, 투자 성향 토글, SHAP 기반 판단 근거 시각화를 위한 간단한 패키지 구조입니다.

## 주요 구성

- `model_judgement.py`
  - `ModelDecision`, `ModelJudgementLogger`: 매수/매도/대기 판단 로그 생성
  - `ConfidenceTracker`: 확률 기반 적중률 및 신뢰도 요약

- `monitoring.py`
  - `RealtimeFeatureMonitor`: 최신 실시간 피처 스냅샷 및 변화 요약
  - `EntryCandidateRanker`: 진입 후보 TOP N 랭킹 생성

- `risk_profile.py`
  - `RiskProfile`, `RiskProfileConfig`: 보수형/중립형/공격형 투자 성향 토글

- `backtest_log.py`
  - `BacktestLogger`, `simulate_entry_backtest`: 가상 진입 결과 백테스트 로그 생성

- `shap_explainer.py`
  - `SHAPExplainer`: SHAP 기반 AI 판단 근거 시각화 지원 (선택적으로 설치 필요)

- `demo.py`
  - 예제 더미 데이터를 이용한 전체 흐름 시연

## 사용 예

```bash
python For_kang_2/demo.py
```

## 설치

```bash
pip install -r For_kang_2/requirements.txt
```

## 의존성

- numpy
- pandas
- scikit-learn
- matplotlib
- shap (선택)
