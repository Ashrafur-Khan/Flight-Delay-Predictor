import json
from typing import Dict

from openai import OpenAI

client = OpenAI()


def extract_flight_features(user_text: str) -> Dict:
    """
    Uses LLM to convert natural language into structured flight data.
    """

    prompt = f"""
    Extract structured flight information from the following text.

    Text:
    {user_text}

    Return ONLY valid JSON with these fields:
    - departure_date (YYYY-MM-DD)
    - departure_time (HH:MM)
    - origin_airport
    - destination_airport
    - weather (bad, moderate, good)
    - duration_minutes

    If unknown, make reasonable estimates.
    """

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a structured data extractor."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
    )

    content = response.choices[0].message.content

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        raise ValueError(f"LLM returned invalid JSON:\n{content}")