import json
import time
import os
import sys
from dataclasses import dataclass
from typing import Optional

# Setup path
sys.path.append(os.path.abspath("apps/api"))

# Must import app modules AFTER path setup
from app.agent.service import answer_traffic_question
from app.agent.workflow import parse_traffic_intent

@dataclass
class EvalCase:
    query: str
    expected_road: Optional[str] = None
    expected_direction: Optional[str] = None
    min_sensors: int = 1

EVAL_SUITE = [
    EvalCase("How is I-95 South?", "I-95", "S", 50),
    EvalCase("Traffic on VA-28 North", "VA-28", "N", 5),
    EvalCase("What is the status of I-66 Eastbound?", "I-66", "E", 10),
    EvalCase("How is traffic statewide?", None, None, 0),
    EvalCase("Any slowdowns on US-29?", "US-29", None, 5),
    EvalCase("I 95 S", "I-95", "S", 50),
]

def run_evals():
    print(f"{'QUERY':<30} | {'INTENT':<10} | {'SENSORS':<8} | {'CHART':<6} | {'TIME':<6}")
    print("-" * 75)
    
    results = []
    for case in EVAL_SUITE:
        start = time.perf_counter()
        
        # 1. Test Intent
        intent = parse_traffic_intent(case.query)
        intent_ok = (intent.road == case.expected_road) and (intent.direction == case.expected_direction)
        
        # 2. Run Full Answer (Includes resolution and evidence)
        try:
            resp = answer_traffic_question(case.query)
            sensor_count = len(resp.sensors)
            has_chart = len(resp.chart) > 0
            
            # Score
            sensor_ok = sensor_count >= case.min_sensors
            
            status = "✅" if (intent_ok and sensor_ok) else "❌"
            elapsed = time.perf_counter() - start
            
            print(f"{case.query[:30]:<30} | {intent_ok!s:<10} | {sensor_count:<8} | {has_chart!s:<6} | {elapsed:.2f}s {status}")
            
            results.append({
                "query": case.query,
                "intent_ok": intent_ok,
                "sensor_count": sensor_count,
                "has_chart": has_chart,
                "latency": elapsed,
                "status": status
            })
        except Exception as e:
            elapsed = time.perf_counter() - start
            print(f"{case.query[:30]:<30} | FAILED: {e}")

    # Summary
    total = len(results)
    if total > 0:
        passed = sum(1 for r in results if r["status"] == "✅")
        print("-" * 75)
        print(f"OVERALL: {passed}/{total} passed | Avg Latency: {sum(r['latency'] for r in results)/total:.2f}s")
    else:
        print("No results collected.")

if __name__ == "__main__":
    run_evals()
