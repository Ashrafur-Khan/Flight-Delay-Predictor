from __future__ import annotations

import os
import time
from typing import Dict

import numpy as np

# Optional import (won't crash if not installed)
try:
    from openai import OpenAI
    _OPENAI_AVAILABLE = True
except ImportError:
    _OPENAI_AVAILABLE = False


class LLMFeatureGenerator:
    """
    LLM-based feature generator for flight delay prediction.
    """

    def __init__(self, use_llm: bool = True):
        self.use_llm = use_llm and _OPENAI_AVAILABLE

        self.client = None
        if self.use_llm:
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                print("⚠️ OPENAI_API_KEY not found. Falling back to mock LLM.")
                self.use_llm = False
            else:
                self.client = OpenAI(api_key=api_key)

    def _mock_score(self, features: Dict) -> float:
        """
        Deterministic fallback if LLM is unavailable.
        """
        score = (
            features.get("weather_delay_norm", 0) * 0.4 +
            features.get("nas_delay_norm", 0) * 0.3 +
            features.get("route_congestion_score", 0) * 0.2 +
            features.get("peak_departure_score", 0) * 0.1
        )
        return float(np.clip(score, 0, 1))

    def generate(self, features: Dict) -> Dict:
        """
        Returns augmented features including LLM output.
        """

        if not self.use_llm:
            return {
                "llm_delay_risk": self._mock_score(features)
            }

        try:
            prompt = f"""
            You are an aviation expert.

            Given these flight features:
            {features}

            Return ONLY a number between 0 and 1 representing delay risk.
            """

            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
            )

            text = response.choices[0].message.content.strip()

            # Extract numeric value safely
            try:
                score = float(text)
            except ValueError:
                score = self._mock_score(features)

            return {"llm_delay_risk": float(np.clip(score, 0, 1))}

        except Exception as e:
            print(f"⚠️ LLM error: {e}. Using fallback.")
            return {
                "llm_delay_risk": self._mock_score(features)
            }