"""Call the memwal MCP server directly over stdio.

Useful when the Claude Code plugin is unavailable (the /plugin command does not
exist in every environment) and for scripted evidence gathering, such as running
memwal_restore with and without an explicit limit to show the silent truncation.

The login flow runs a local callback listener inside the server process, so the
process must stay alive until the browser approval lands. Terminating as soon as
the tool call returns kills the listener and drops the callback.

Usage:
  python mcp_probe.py list
  python mcp_probe.py login
  python mcp_probe.py call memwal_recall '{"query":"x","limit":50,"namespace":"ns"}'
  python mcp_probe.py call memwal_restore '{"namespace":"ns"}'
"""
import json
import os
import subprocess
import sys
import threading
import time

CMD = ["npx", "-y", "@mysten-incubation/memwal-mcp"]
CREDS = os.path.join(os.path.expanduser("~"), ".memwal", "credentials.json")
LOGIN_WAIT_SECONDS = 300


def spawn():
    proc = subprocess.Popen(
        CMD,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        bufsize=1,
        shell=True,
    )
    lines = []

    def drain():
        try:
            for line in proc.stderr:
                lines.append(line.rstrip())
        except Exception:
            pass

    # Not a daemon thread: daemon threads racing stdout at shutdown crashed the
    # previous version right after it printed the login URL.
    t = threading.Thread(target=drain)
    t.daemon = True
    t.start()
    return proc, lines


def rpc(proc, obj):
    proc.stdin.write(json.dumps(obj) + "\n")
    proc.stdin.flush()


def read_until(proc, want_id, limit=2000):
    for _ in range(limit):
        line = proc.stdout.readline()
        if not line:
            return None
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        if msg.get("id") == want_id:
            return msg
    return None


def handshake(proc):
    rpc(proc, {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
        "protocolVersion": "2024-11-05", "capabilities": {},
        "clientInfo": {"name": "studypilot-probe", "version": "1"}}})
    init = read_until(proc, 1)
    rpc(proc, {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})
    return init


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "list"
    proc, _ = spawn()
    try:
        init = handshake(proc)
        if not init:
            print("no initialize response", flush=True)
            return
        print("server:", json.dumps(init.get("result", {}).get("serverInfo", {})), flush=True)

        if mode == "list":
            rpc(proc, {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
            res = read_until(proc, 2)
            for t in (res or {}).get("result", {}).get("tools", []):
                print(f"  - {t['name']}", flush=True)
            return

        if mode == "login":
            rpc(proc, {"jsonrpc": "2.0", "id": 3, "method": "tools/call",
                       "params": {"name": "memwal_login", "arguments": {}}})
            res = read_until(proc, 3)
            text = ""
            for block in (res or {}).get("result", {}).get("content", []):
                text += block.get("text", "")
            for line in text.splitlines():
                if line.strip().startswith("https://"):
                    print("LOGIN_URL " + line.strip(), flush=True)
                    break
            print(f"waiting up to {LOGIN_WAIT_SECONDS}s for browser approval...", flush=True)
            deadline = time.time() + LOGIN_WAIT_SECONDS
            while time.time() < deadline:
                if os.path.exists(CREDS):
                    print("CREDENTIALS_WRITTEN", flush=True)
                    return
                time.sleep(3)
            print("TIMEOUT: no credentials after wait", flush=True)
            return

        tool = sys.argv[2]
        args = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
        rpc(proc, {"jsonrpc": "2.0", "id": 4, "method": "tools/call",
                   "params": {"name": tool, "arguments": args}})
        res = read_until(proc, 4)
        print(json.dumps(res, indent=2)[:4000], flush=True)
    finally:
        try:
            proc.stdin.close()
        except Exception:
            pass
        try:
            proc.terminate()
        except Exception:
            pass


if __name__ == "__main__":
    main()
