from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class RiskProfile(Enum):
    CONSERVATIVE = "conservative"
    NEUTRAL = "neutral"
    AGGRESSIVE = "aggressive"


@dataclass(frozen=True)
class RiskProfileConfig:
    profile: RiskProfile
    threshold_multiplier: float
    max_candidates: int
    min_probability: float

    @classmethod
    def from_profile(cls, profile: str | RiskProfile) -> "RiskProfileConfig":
        if isinstance(profile, str):
            profile = RiskProfile(profile.lower())

        if profile is RiskProfile.CONSERVATIVE:
            return cls(profile=profile, threshold_multiplier=1.15, max_candidates=3, min_probability=0.70)
        if profile is RiskProfile.NEUTRAL:
            return cls(profile=profile, threshold_multiplier=1.0, max_candidates=6, min_probability=0.60)
        if profile is RiskProfile.AGGRESSIVE:
            return cls(profile=profile, threshold_multiplier=0.85, max_candidates=12, min_probability=0.50)

        raise ValueError(f"Unknown risk profile: {profile}")

    def effective_threshold(self, base_threshold: float) -> float:
        return float(max(0.0, min(1.0, base_threshold * self.threshold_multiplier)))

    def is_eligible(self, probability: float) -> bool:
        return probability >= self.min_probability
