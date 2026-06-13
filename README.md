# Splunk Ops Assistant

An AI-powered natural language interface for Splunk. Ask questions about your logs in plain English — the assistant converts your question into an SPL query, runs it on Splunk via the **Splunk MCP Server**, and summarizes the results in simple language.

Built for the **Splunk Agentic Ops Hackathon** (Platform & Developer Experience track).

## Problem

Investigating logs in Splunk requires knowing SPL (Search Processing Language). This is a barrier for non-technical team members and slows down troubleshooting even for experienced users. This project lets anyone ask questions like *"show me all the errors"* or *"how many login events happened"* and get an instant, readable answer — backed by real Splunk data.

## How it works

1. **User question** is submitted from the web UI.
2. The **Flask backend** sends the question to an LLM (via OpenRouter) to generate a valid SPL query.
3. The generated SPL is executed against Splunk using the **Splunk MCP Server's `splunk_run_query` tool**.
4. Raw log events are returned from Splunk.
5. The LLM summarizes the results in plain English.
6. The web UI displays the summary, matching log events, and a live "pipeline trace" showing each step (SPL generated → Splunk results → summary).

See [`architecture_diagram.png`](./architecture_diagram.png) for the full data flow.

## AI capabilities used

- **Splunk MCP Server** (`MCP Server for Splunk Platform`) — exposes `splunk_run_query`, used here as the core tool for executing AI-generated SPL queries against live Splunk data.
- **LLM (via OpenRouter)** — used twice in the pipeline: (1) to translate natural language into SPL, and (2) to summarize Splunk results into plain English.

## Tech stack

- Python, Flask
- Splunk Enterprise (Developer License) + MCP Server for Splunk Platform app
- OpenRouter API (LLM)
- HTML/CSS/JavaScript frontend

## Setup instructions

### Prerequisites

- Python 3.10+
- A running Splunk Enterprise instance with:
  - **MCP Server for Splunk Platform** app installed
  - **Splunk AI Assistant for SPL** app installed (required dependency for the MCP app)
  - A role with the `mcp_tool_execute` capability
  - An MCP encrypted token generated from the MCP Server app's configuration page
- An [OpenRouter](https://openrouter.ai/) API key (free tier available)
- Sample log data ingested into Splunk under `sourcetype="sample_log"`

### Installation

```bash
git clone https://github.com/s17anushka/splunk-ops-assistant.git
cd splunk-ops-assistant
python -m venv venv
source venv/bin/activate   # on Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### Configuration

Create a `.env` file in the project root:

```
OPENROUTER_API_KEY=your_openrouter_api_key
MCP_TOKEN=your_splunk_mcp_encrypted_token
MCP_URL=https://localhost:8089/services/mcp
```

### Sample data

Ingest a sample log file into Splunk (Settings → Add Data → Upload) with `sourcetype="sample_log"`. Example log lines:

```
2026-06-12 10:15:23 ERROR Failed to connect to database server01
2026-06-12 10:15:45 INFO User login successful user=john
2026-06-12 10:16:01 WARN High memory usage detected on server02
2026-06-12 10:17:45 ERROR API timeout on payment service
2026-06-12 10:18:10 INFO Order processed successfully order_id=1001
```

A sample file is included at [`sample_data/sample.log`](./sample_data/sample.log).

### Run

```bash
python server.py
```

Open `http://localhost:5000` in your browser.

## Example questions

- "Show me all the errors"
- "How many login events happened"
- "Show me warning messages"
- "What happened around 10:18 AM"

## Project structure

```
.
├── server.py                  # Flask backend, MCP + LLM orchestration
├── requirements.txt
├── architecture_diagram.png
├── templates/
│   └── index.html             # Chat UI
├── static/
│   ├── style.css
│   └── app.js
└── sample_data/
    └── sample.log
```

## License

MIT — see [LICENSE](./LICENSE).