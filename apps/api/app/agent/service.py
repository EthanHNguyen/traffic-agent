from time import perf_counter
from typing import Any
import json
import re
import httpx

from app.config import settings
from app.db.connection import get_connection
from app.models.traffic import TrafficQueryResponse
from app.agent.prompts import SYSTEM_PROMPT
from app.agent.workflow import (
    fetch_traffic_evidence_sync,
    parse_traffic_intent,
    plan_ui_actions,
    resolve_traffic_intent,
)

def execute_sql(sql: str) -> list[dict[str, Any]]:
    try:
        with get_connection() as connection:
            return connection.execute(sql).fetchall()
    except Exception as e:
        print(f"SQL Error: {e}")
        return []

def call_openrouter(messages: list[dict[str, str]]) -> str:
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "openai/gpt-4o-mini",
        "messages": messages,
        "temperature": 0.0
    }
    try:
        with httpx.Client() as client:
            resp = client.post("https://openrouter.ai/api/v1/chat/completions", json=payload, headers=headers, timeout=30.0)
            if resp.status_code == 200:
                return resp.json()["choices"][0]["message"]["content"]
            else:
                print(f"OpenRouter Error {resp.status_code}: {resp.text}")
                return ""
    except Exception as e:
        print(f"OpenRouter Exception: {e}")
        return ""

def answer_traffic_question(message: str) -> TrafficQueryResponse:
    started = perf_counter()
    intent = parse_traffic_intent(message)
    resolution = resolve_traffic_intent(intent)
    
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": message}
    ]
    sql_response = call_openrouter(messages)
    
    sql = ""
    match = re.search(r"```sql(.*?)```", sql_response, re.DOTALL | re.IGNORECASE)
    if match:
        sql = match.group(1).strip()
    else:
        sql = sql_response.replace("```", "").strip()

    if not sql.lower().startswith("select") and not sql.lower().startswith("with"):
        sql = ""
        
    rows = []
    if sql:
        rows = execute_sql(sql)
        
    evidence = fetch_traffic_evidence_sync(resolution)
    
    # Enrich the answer prompt with evidence data
    evidence_summary = {
        "sensor_count": len(evidence.sensors),
        "latest_speed": evidence.chart[-1].speed_mph if evidence.chart else None,
        "typical_speed": evidence.chart[-1].baseline_mph if evidence.chart else None,
        "incident_count": len(evidence.incidents),
    }
    
    answer_prompt = (
        f"User asked: {message}\n\n"
        f"SQL executed: {sql}\n\n"
        f"SQL Result rows: {json.dumps(rows, default=str)[:1000]}\n\n"
        f"Evidence Data: {json.dumps(evidence_summary, default=str)}\n\n"
        "Provide a very concise, helpful answer based on the data. "
        "If SQL rows are empty but Evidence Data has values, use the Evidence Data. "
        "Do not explain the SQL."
    )
    
    answer_messages = [
        {"role": "system", "content": "You are a helpful traffic agent for Northern Virginia commuters. Be brief, professional, and direct. Format numbers cleanly."},
        {"role": "user", "content": answer_prompt}
    ]
    answer = call_openrouter(answer_messages)
    
    if not answer:
        answer = "I'm sorry, I could not connect to the intelligence engine to process your request."

    anomaly_detected = False
    normalized = message.lower()
    if "anomal" in normalized or "slow" in normalized or "bad" in normalized:
        anomaly_detected = len(rows) > 0

    latency_ms = int((perf_counter() - started) * 1000)
    return TrafficQueryResponse(
        answer=answer,
        sql=sql,
        chart=evidence.chart,
        sensors=evidence.sensors,
        incidents=evidence.incidents,
        anomaly_detected=anomaly_detected,
        latency_ms=latency_ms,
        ui_actions=plan_ui_actions(intent, resolution, evidence),
        follow_ups=[],
    )
