from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Protocol
from urllib import error, request

from fastapi import HTTPException

from .config import (
    EXPLANATION_LLM_API_KEY,
    EXPLANATION_LLM_API_URL,
    EXPLANATION_LLM_MODEL,
    EXPLANATION_LLM_PROVIDER,
    EXPLANATION_LLM_TIMEOUT_SECONDS,
)
from .schemas import (
    PredictionExplanationContext,
    PredictionExplanationLeg,
    ResultChatMessage,
    ResultChatRequest,
    ResultChatResponse,
)


@dataclass(frozen=True)
class GeneratedExplanation:
    answer: str
    citations: list[str]
    disclaimer: str | None = None
    suggested_followups: list[str] | None = None


class ExplanationLLMClient(Protocol):
    def generate_result_answer(
        self,
        context: PredictionExplanationContext,
        question: str,
        history: list[ResultChatMessage],
    ) -> GeneratedExplanation:
        ...


def derive_context_disclaimer(context: PredictionExplanationContext) -> str | None:
    if context.source == "mock_fallback":
        return "This answer is grounded in the frontend mock fallback result, not a live backend prediction."

    if context.debug is None:
        return None

    if context.debug.pathUsed == "heuristic_fallback":
        return "This answer is grounded in the backend heuristic fallback path because no trained model artifact was active for this result."

    if context.debug.pathUsed == "hybrid_blend":
        return "This answer is grounded in the backend hybrid blend path, where the trained model can only make a bounded adjustment to the heuristic score."

    return None


def build_context_snapshot(context: PredictionExplanationContext) -> dict[str, object]:
    snapshot: dict[str, object] = {
        "source": context.source,
        "submittedRequest": {
            "departureDate": context.submittedRequest.departureDate,
            "departureTime": context.submittedRequest.departureTime,
            "originAirport": context.submittedRequest.originAirport,
            "destinationAirport": context.submittedRequest.destinationAirport,
            "temperature": context.submittedRequest.temperature,
            "precipitation": context.submittedRequest.precipitation,
            "wind": context.submittedRequest.wind,
        },
        "displayedResult": {
            "probability": context.displayedResult.probability,
            "riskLevel": context.displayedResult.riskLevel,
            "explanation": context.displayedResult.explanation,
        },
    }

    if context.directRouteResult is not None:
        snapshot["directRouteResult"] = {
            "probability": context.directRouteResult.probability,
            "riskLevel": context.directRouteResult.riskLevel,
            "explanation": context.directRouteResult.explanation,
        }

    if context.itinerarySummary is not None:
        snapshot["itinerarySummary"] = {
            "aggregateProbability": context.itinerarySummary.aggregateProbability,
            "aggregateRiskLevel": context.itinerarySummary.aggregateRiskLevel,
            "aggregateExplanation": context.itinerarySummary.aggregateExplanation,
            "legs": [
                {
                    "originAirport": leg.originAirport,
                    "destinationAirport": leg.destinationAirport,
                    "probability": leg.probability,
                    "riskLevel": leg.riskLevel,
                    "explanation": leg.explanation,
                }
                for leg in context.itinerarySummary.legs
            ],
        }

    if context.debug is not None:
        snapshot["debug"] = context.debug.model_dump(exclude_none=True)

    return snapshot


def build_system_prompt(context: PredictionExplanationContext) -> str:
    guardrails = [
        "You are a grounded flight delay result explainer.",
        "Use only the structured prediction context that is provided to you.",
        "Do not invent new scores, new model behavior, live weather, airline operations, or unseen features.",
        "Do not imply that connected itineraries were scored by a learned multi-leg backend model.",
        "If information is missing, say it is unavailable in the current result.",
        "Treat the deterministic displayed result as the source of truth.",
        "Keep answers concise, factual, and specific to the result.",
    ]

    disclaimer = derive_context_disclaimer(context)
    if disclaimer:
        guardrails.append(f"Important context: {disclaimer}")

    if context.itinerarySummary is not None:
        guardrails.append(
            "This result includes a frontend itinerary summary layered on top of a direct-route prediction. Explain the displayed itinerary score separately from the raw direct-route score when relevant."
        )

    return " ".join(guardrails)


def _citation_fields_for_context(context: PredictionExplanationContext) -> list[str]:
    citations = [
        "submittedRequest.originAirport",
        "submittedRequest.destinationAirport",
        "submittedRequest.departureDate",
        "submittedRequest.departureTime",
        "displayedResult.probability",
        "displayedResult.riskLevel",
        "displayedResult.explanation",
    ]

    if context.itinerarySummary is not None:
        citations.extend(
            [
                "itinerarySummary.aggregateProbability",
                "itinerarySummary.aggregateExplanation",
                "itinerarySummary.legs",
            ]
        )

    if context.directRouteResult is not None:
        citations.append("directRouteResult.probability")

    if context.debug is not None:
        citations.extend(
            [
                "debug.pathUsed",
                "debug.derivedFeatures",
                "debug.notes",
            ]
        )
        if context.debug.blendInfo is not None:
            citations.append("debug.blendInfo")

    return citations


def build_suggested_followups(context: PredictionExplanationContext) -> list[str]:
    prompts = [
        "Which factors mattered most here?",
        "Summarize this result in plain language.",
    ]

    if context.itinerarySummary is not None:
        prompts.append("Explain the itinerary impact.")

    if context.debug is not None and context.debug.blendInfo is not None:
        prompts.append("What does hybrid blend mean here?")

    return prompts[:4]


def _top_feature_labels(context: PredictionExplanationContext) -> list[str]:
    labels: list[str] = []

    if context.submittedRequest.precipitation != "none":
        labels.append(context.submittedRequest.precipitation)
    if context.submittedRequest.wind != "calm":
        labels.append(f"{context.submittedRequest.wind} wind")
    if context.debug is not None:
        if context.debug.derivedFeatures.route_congestion_score >= 0.55:
            labels.append("busy route conditions")
        if context.debug.derivedFeatures.peak_departure_score >= 0.35:
            labels.append("peak departure traffic")

    return labels


def _highest_pressure_leg(legs: list[PredictionExplanationLeg]) -> PredictionExplanationLeg | None:
    if not legs:
        return None
    return max(legs, key=lambda leg: leg.probability)


class DeterministicExplanationLLMClient:
    def generate_result_answer(
        self,
        context: PredictionExplanationContext,
        question: str,
        history: list[ResultChatMessage],
    ) -> GeneratedExplanation:
        del history
        question_lower = question.strip().lower()
        citations = _citation_fields_for_context(context)
        disclaimer = derive_context_disclaimer(context)

        if "hybrid" in question_lower and context.debug is not None and context.debug.blendInfo is not None:
            blend = context.debug.blendInfo
            answer = (
                f"The backend labeled this as `{context.debug.pathUsed}`. The heuristic score was {blend.heuristicProbability}% and the trained model score was "
                f"{blend.modelProbability if blend.modelProbability is not None else 'unavailable'}%. The final displayed direct-route score used a bounded adjustment of "
                f"{blend.appliedAdjustment if blend.appliedAdjustment is not None else 0} points, and the displayed top-level score remains {context.displayedResult.probability}%."
            )
        elif "itinerary" in question_lower and context.itinerarySummary is not None:
            highest_leg = _highest_pressure_leg(context.itinerarySummary.legs)
            highest_leg_text = (
                f" The highest-pressure leg was {highest_leg.originAirport} to {highest_leg.destinationAirport} at {highest_leg.probability}%."
                if highest_leg is not None
                else ""
            )
            answer = (
                f"The displayed result is an itinerary-level score of {context.itinerarySummary.aggregateProbability}% {context.itinerarySummary.aggregateRiskLevel} risk, "
                f"built on top of the direct-route result of {context.directRouteResult.probability if context.directRouteResult is not None else context.displayedResult.probability}%."
                f"{highest_leg_text}"
            )
        elif "factor" in question_lower or "why" in question_lower:
            factor_labels = _top_feature_labels(context)
            factor_text = ", ".join(factor_labels) if factor_labels else "the route, timing, and current operating conditions summarized in the result"
            answer = (
                f"The main reasons surfaced by the current result are {factor_text}. The displayed score is {context.displayedResult.probability}% "
                f"with a {context.displayedResult.riskLevel} risk label, and the deterministic explanation says: {context.displayedResult.explanation}"
            )
        else:
            answer = (
                f"This result shows {context.displayedResult.probability}% {context.displayedResult.riskLevel} delay risk for "
                f"{context.submittedRequest.originAirport} to {context.submittedRequest.destinationAirport}. "
                f"{context.displayedResult.explanation}"
            )

        return GeneratedExplanation(
            answer=answer,
            citations=citations,
            disclaimer=disclaimer,
            suggested_followups=build_suggested_followups(context),
        )


class OpenAICompatibleExplanationLLMClient:
    def __init__(self, api_url: str, api_key: str, model: str, timeout_seconds: float) -> None:
        self.api_url = api_url
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds

    def generate_result_answer(
        self,
        context: PredictionExplanationContext,
        question: str,
        history: list[ResultChatMessage],
    ) -> GeneratedExplanation:
        payload = {
            "model": self.model,
            "temperature": 0.2,
            "messages": self._build_messages(context, question, history),
        }
        req = request.Request(
            self.api_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
            method="POST",
        )

        try:
            with request.urlopen(req, timeout=self.timeout_seconds) as response:
                raw_body = response.read().decode("utf-8")
        except error.URLError as exc:
            raise RuntimeError(f"Explanation provider request failed: {exc.reason}") from exc

        parsed = json.loads(raw_body)
        answer = self._extract_answer(parsed)
        if not answer:
            raise RuntimeError("Explanation provider returned an empty response.")

        return GeneratedExplanation(
            answer=answer,
            citations=_citation_fields_for_context(context),
            disclaimer=derive_context_disclaimer(context),
            suggested_followups=build_suggested_followups(context),
        )

    def _build_messages(
        self,
        context: PredictionExplanationContext,
        question: str,
        history: list[ResultChatMessage],
    ) -> list[dict[str, str]]:
        messages: list[dict[str, str]] = [{"role": "system", "content": build_system_prompt(context)}]
        for item in history[-4:]:
            messages.append({"role": item.role, "content": item.content})
        messages.append(
            {
                "role": "user",
                "content": (
                    "Prediction context:\n"
                    f"{json.dumps(build_context_snapshot(context), indent=2)}\n\n"
                    f"User question: {question}\n"
                    "Answer using only this context. If a detail is unavailable, say so."
                ),
            }
        )
        return messages

    @staticmethod
    def _extract_answer(payload: dict[str, object]) -> str:
        choices = payload.get("choices")
        if not isinstance(choices, list) or not choices:
            return ""

        first_choice = choices[0]
        if not isinstance(first_choice, dict):
            return ""

        message = first_choice.get("message")
        if not isinstance(message, dict):
            return ""

        content = message.get("content")
        if isinstance(content, str):
            return content.strip()

        if isinstance(content, list):
            text_segments: list[str] = []
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text" and isinstance(item.get("text"), str):
                    text_segments.append(item["text"])
            return "\n".join(segment.strip() for segment in text_segments if segment.strip()).strip()

        return ""


def build_explanation_llm_client() -> ExplanationLLMClient:
    if (
        EXPLANATION_LLM_PROVIDER == "openai_compatible"
        and EXPLANATION_LLM_API_URL
        and EXPLANATION_LLM_API_KEY
        and EXPLANATION_LLM_MODEL
    ):
        return OpenAICompatibleExplanationLLMClient(
            api_url=EXPLANATION_LLM_API_URL,
            api_key=EXPLANATION_LLM_API_KEY,
            model=EXPLANATION_LLM_MODEL,
            timeout_seconds=EXPLANATION_LLM_TIMEOUT_SECONDS,
        )

    return DeterministicExplanationLLMClient()


class ResultExplanationService:
    def __init__(self, client: ExplanationLLMClient | None = None) -> None:
        self.client = client if client is not None else build_explanation_llm_client()

    def explain(self, payload: ResultChatRequest) -> ResultChatResponse:
        if payload.predictionContext is None:
            raise HTTPException(status_code=422, detail="predictionContext is required.")

        try:
            generated = self.client.generate_result_answer(
                context=payload.predictionContext,
                question=payload.question.strip(),
                history=payload.conversationHistory,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

        return ResultChatResponse(
            answer=generated.answer,
            citations=generated.citations,
            disclaimer=generated.disclaimer,
            suggestedFollowups=generated.suggested_followups,
        )
