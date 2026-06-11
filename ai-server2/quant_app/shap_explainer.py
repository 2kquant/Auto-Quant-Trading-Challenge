from __future__ import annotations

from typing import Any

try:
    import shap
    SHAP_AVAILABLE = True
except ImportError:  # pragma: no cover
    shap = None  # type: ignore[assignment]
    SHAP_AVAILABLE = False


class SHAPExplainer:
    def __init__(self, model: Any, data: Any | None = None) -> None:
        if not SHAP_AVAILABLE:
            raise ImportError("SHAP 패키지가 설치되어 있지 않습니다. `pip install shap`를 실행하세요.")

        self.model = model
        self.data = data
        self.explainer = shap.Explainer(model, data)

    def explain(self, frame: Any) -> Any:
        return self.explainer(frame)

    def plot_waterfall(self, explanation: Any, max_display: int = 10) -> None:
        shap.plots.waterfall(explanation[0], max_display=max_display)

    def plot_summary(self, explanation: Any, max_display: int = 10) -> None:
        shap.plots.bar(explanation, max_display=max_display)
