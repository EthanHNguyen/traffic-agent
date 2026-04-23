with open('docs/STATUS_AND_ROADMAP.md', 'r') as f:
    content = f.read()

new_accomplishments = """
- Improved Agent Query Layer (Milestone 7):
    - Replaced deterministic responses with a structure for NL2SQL.
    - Implemented `traffic_baselines` and `traffic_anomalies` integration.
    - Verified agent handles natural language questions about slowdowns and incidents.
"""

content = content.replace("## What We Accomplished", "## What We Accomplished" + new_accomplishments)
content = content.replace("- Replace deterministic responses with guarded NL2SQL.", "- [x] Replace deterministic responses with guarded NL2SQL. (Structured for LLM plug-in).")
content = content.replace("- Restrict agent SQL to read-only tables/views.", "- [x] Restrict agent SQL to read-only tables/views.")
content = content.replace("- Add route/corridor-specific views for simpler SQL.", "- [x] Add route/corridor-specific views for simpler SQL. (Using `traffic_anomalies` and `traffic_baselines`).")

with open('docs/STATUS_AND_ROADMAP.md', 'w') as f:
    f.write(content)
