"""AgriSense — Local Python AI HTTP Server (Milestone 17).

Provides a local HTTP microservice interface to the Python AI dispatcher layer,
allowing models to remain loaded in memory for low-latency inference.
"""

import sys
import os
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Dict, Any

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.ai.dispatcher import dispatch_ai_task, SUPPORTED_TASKS


class AIRequestHandler(BaseHTTPRequestHandler):
    """HTTP Request handler for AgriSense AI services."""

    def _set_headers(self, status_code: int = 200):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(200)

    def do_GET(self):
        if self.path in ["/health", "/api/ai/health"]:
            response = dispatch_ai_task("health")
            self._set_headers(200)
            self.wfile.write(json.dumps(response).encode("utf-8"))
        else:
            self._set_headers(404)
            err = {"success": False, "error": {"code": "NOT_FOUND", "message": f"Endpoint '{self.path}' not found."}}
            self.wfile.write(json.dumps(err).encode("utf-8"))

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            self._set_headers(400)
            err = {"success": False, "error": {"code": "EMPTY_BODY", "message": "Request body cannot be empty."}}
            self.wfile.write(json.dumps(err).encode("utf-8"))
            return

        body_bytes = self.rfile.read(content_length)
        try:
            body_json = json.loads(body_bytes.decode("utf-8"))
        except json.JSONDecodeError as e:
            self._set_headers(400)
            err = {"success": False, "error": {"code": "MALFORMED_JSON", "message": f"Malformed JSON: {str(e)}"}}
            self.wfile.write(json.dumps(err).encode("utf-8"))
            return

        # Route matching
        if self.path in ["/predict", "/api/ai/predict"]:
            task = body_json.get("task")
            payload = body_json.get("input") or body_json.get("payload") or {}
            response = dispatch_ai_task(task, payload)
            status_code = 200 if response.get("success") else 400
            self._set_headers(status_code)
            self.wfile.write(json.dumps(response).encode("utf-8"))

        elif self.path in ["/crop-recommendation", "/api/ai/crop-recommendation"]:
            response = dispatch_ai_task("crop_recommendation", body_json)
            status_code = 200 if response.get("success") else 400
            self._set_headers(status_code)
            self.wfile.write(json.dumps(response).encode("utf-8"))

        elif self.path.startswith("/api/ai/"):
            # Sub-route mapping, e.g. /api/ai/irrigation -> task: irrigation
            task_name = self.path.replace("/api/ai/", "").replace("-", "_")
            response = dispatch_ai_task(task_name, body_json)
            status_code = 200 if response.get("success") else 400
            self._set_headers(status_code)
            self.wfile.write(json.dumps(response).encode("utf-8"))

        else:
            self._set_headers(404)
            err = {"success": False, "error": {"code": "NOT_FOUND", "message": f"Endpoint '{self.path}' not found."}}
            self.wfile.write(json.dumps(err).encode("utf-8"))

    def log_message(self, format, *args):
        # Override to suppress default HTTP server log clutter unless needed
        pass


def run_server(port: int = 5001):
    server_address = ("127.0.0.1", port)
    httpd = HTTPServer(server_address, AIRequestHandler)
    print(f"[AgriSense AI Server] Listening on http://127.0.0.1:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[AgriSense AI Server] Shutting down...")
        httpd.server_close()


if __name__ == "__main__":
    port = int(os.getenv("AI_SERVER_PORT", "5001"))
    run_server(port)
