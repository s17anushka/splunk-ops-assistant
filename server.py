import os
import json
import time
import requests
from flask import Flask, request, jsonify, render_template
from openai import OpenAI
from dotenv import load_dotenv
load_dotenv()

# ---------- CONFIG ----------

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "key")
MCP_TOKEN = os.environ.get("MCP_TOKEN", "your mcp token")
MCP_URL = os.environ.get("MCP_URL", "https://localhost:8089/services/mcp")

MODEL_NAME = "meta-llama/llama-3.3-70b-instruct"

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY
)

app = Flask(__name__)


# ---------- MCP HELPER ----------
def call_mcp_tool(tool_name, arguments):
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments
        }
    }
    headers = {
        "Authorization": f"Bearer {MCP_TOKEN}",
        "Content-Type": "application/json"
    }
    response = requests.post(MCP_URL, headers=headers, json=payload, verify=False)
    return response.json()


# ---------- LLM HELPER WITH RETRY ----------
def call_llm(prompt, max_retries=3):
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=[{"role": "user", "content": prompt}]
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            if "429" in str(e) and attempt < max_retries - 1:
                time.sleep(5)
                continue
            raise


# ---------- STEP 1: Natural language -> SPL ----------
def generate_spl(user_question):
    prompt = f"""You are a Splunk SPL expert. Convert this natural language question into a valid SPL search query.
Only return the raw SPL query, no explanation, no markdown formatting, no code blocks.

Question: {user_question}

The data is in sourcetype="sample_log" and contains lines like:
2026-06-12 10:15:23 ERROR Failed to connect to database server01
2026-06-12 10:15:45 INFO User login successful user=john

SPL query:"""

    spl = call_llm(prompt)
    spl = spl.replace("```spl", "").replace("```", "").strip()
    return spl


# ---------- STEP 2: Run SPL via MCP ----------
def run_spl(spl_query):
    result = call_mcp_tool("splunk_run_query", {
        "query": spl_query,
        "earliest_time": "-7d",
        "latest_time": "now",
        "row_limit": 50
    })
    return result


# ---------- STEP 3: Summarize results ----------
def summarize_results(user_question, results_json):
    prompt = f"""The user asked: "{user_question}"

Here are the Splunk search results in JSON:
{json.dumps(results_json, indent=2)}

Summarize these results in plain, simple English for a non-technical user. Use short paragraphs or a short list."""

    return call_llm(prompt)


def extract_events(mcp_result):
    """Pull out the raw event list from the MCP tool result, if present."""
    try:
        content = mcp_result["result"]["content"][0]["text"]
        parsed = json.loads(content)
        return parsed.get("results", [])
    except Exception:
        return []


# ---------- ROUTES ----------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/ask", methods=["POST"])
def ask():
    data = request.get_json(force=True)
    user_question = (data or {}).get("question", "").strip()

    if not user_question:
        return jsonify({"error": "Question cannot be empty"}), 400

    try:
        # Step 1: NL -> SPL
        spl = generate_spl(user_question)

        # Step 2: Run on Splunk via MCP
        mcp_result = run_spl(spl)
        events = extract_events(mcp_result)

        if mcp_result.get("result", {}).get("isError"):
            error_text = mcp_result["result"]["content"][0]["text"]
            return jsonify({
                "spl": spl,
                "error": f"Splunk query failed: {error_text}"
            }), 500

        # Step 3: Summarize
        summary = summarize_results(user_question, mcp_result)

        return jsonify({
            "question": user_question,
            "spl": spl,
            "events": events,
            "event_count": len(events),
            "summary": summary
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    # Disable SSL warnings for local self-signed Splunk cert
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    app.run(debug=True, port=5000)
