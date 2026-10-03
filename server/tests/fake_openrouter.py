"""Deterministic offline test upstream; never use with real user data."""

import argparse
import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def extract(content, tag):
    match = re.search(rf"<{tag}>\n(.*?)\n</{tag}>", content, re.S)
    return match.group(1) if match else ""


def exploration_payload(content: str) -> dict:
    """Read-only exploration reply. FAKE-MODEL:<kind> markers in the page text steer deliberately bad outputs."""
    mode = extract(content, "mode").strip()
    tier = extract(content, "verbosity").strip() or "standard"
    snapshot = extract(content, "page_snapshot")
    kind = (re.search(r"FAKE-MODEL:([a-z]+)", snapshot) or [None, ""])[1]
    if mode == "summary":
        title = (re.search(r"^title: (.*)$", snapshot, re.M) or [None, ""])[1].strip()
        heading = (re.search(r'^heading "(.*)"$', snapshot, re.M) or [None, ""])[1].strip()
        sentences = [f"To strona „{title}”." if title else "To strona bez tytułu."]
        if heading:
            sentences.append(f"Główny nagłówek to „{heading}”.")
        # Concise keeps one sentence; standard and detailed keep the heading sentence too (never more than two).
        payload = {"sentences": sentences[:1] if tier == "concise" else sentences, "candidate_ids": []}
        if kind == "null":
            payload["sentences"] = None
        elif kind == "empty":
            payload["sentences"] = []
        elif kind == "extra":
            payload["action"] = "click"
        elif kind == "long":
            payload["sentences"] = ["Pierwsze zdanie.", "Drugie zdanie.", "Trzecie zdanie."]
        elif kind == "fragment":
            payload["sentences"] = ["To strona, na której można"]
        return payload
    candidates = json.loads(extract(content, "candidates") or "[]")
    ids = [candidate["id"] for candidate in candidates][:int(extract(content, "max_ids") or 3)]
    if kind == "dup" and ids:
        ids = [ids[0], ids[0]]
    elif kind == "fabricated":
        ids = ["e999", *ids[:1]]
    return {"sentences": [], "candidate_ids": ids}


def fake_reply(body: dict) -> dict:
    name = body["response_format"]["json_schema"]["name"]
    content = next(message["content"] for message in reversed(body["messages"]) if message["role"] == "user")
    if name == "page_exploration":
        payload = exploration_payload(content)
    elif name == "effect_summary":
        diff = json.loads(extract(content, "page_diff"))
        change = diff.get("changed", [])
        text = (next(iter(diff.get("alerts", [])), "") or next(iter(diff.get("added", [])), "")
                or (f'{change[0]["name"]} {change[0]["what"]}' if change else "")
                or diff.get("title", {}).get("after", "") or diff.get("path", {}).get("after", ""))
        tier = extract(content, "verbosity").strip() or "standard"
        say = ("Zmiana na stronie: " + text)[:150] if text else "Zmiana na stronie."
        if tier == "concise":
            say = ("Zmiana: " + text)[:60] if text else "Zmiana."
        elif tier == "detailed":
            say += " Sprawdź szczegóły na stronie."
        payload = {"say": say}
    else:
        utterance = extract(content, "utterance").strip().removesuffix(".")
        lines = [match.groupdict() for line in extract(content, "page_snapshot").splitlines()
                 if (match := re.match(r'^(?P<role>[a-z]+) (?P<id>e\d+) "(?P<name>[^"]*)"(?P<rest>.*)$', line))]
        payload = {"action": "none", "target": "", "text": "", "needs_confirmation": False, "say": "Nie rozumiem polecenia.", "option_1": "", "option_2": "", "option_3": ""}
        target, action, text = None, None, ""
        if utterance.casefold().startswith("kliknij nieistniejący"):
            target, action = {"id": "e999"}, "click"
        elif utterance.casefold().startswith("kliknij "):
            expected = utterance[8:].casefold()
            target = next((line for line in lines if line["role"] in {"button", "link", "checkbox", "radio", "menuitem", "tab"} and line["name"].casefold() == expected), None)
            action = "click"
            payload["say"] = "Nie widzę takiego elementu."
            if target is None:
                matches = [line for line in lines if line["role"] in {"button", "link", "checkbox", "radio", "menuitem", "tab"} and expected in line["name"].casefold()]
                if len(matches) >= 2:
                    payload.update(action="choose", say="")
                    for i, line in enumerate(matches[:3], 1):
                        payload[f"option_{i}"] = line["id"]
        elif match := re.match(r"wpisz (.*?) w przycisk (.+)$", utterance, re.I):
            text, expected = match.groups()
            target = next((line for line in lines if line["role"] == "button" and line["name"].casefold() == expected.casefold()), None)
            action = "fill"
        elif match := re.match(r"wpisz (.*?) w pole (.+)$", utterance, re.I):
            text, words = match.groups()
            stems = [word[:5].casefold() for word in words.split() if len(word) >= 5]
            target = next((line for line in lines if line["role"] in {"textbox", "searchbox", "combobox"}
                           and any(stem in (line["name"] + " " + " ".join(re.findall(r'placeholder="([^"]*)"', line["rest"]))).casefold() for stem in stems)), None)
            action = "fill"
        if target:
            if re.fullmatch(r"[0-9 ]+", text):
                text = text.replace(" ", "")
            payload.update(action=action, target=target["id"], text=text, say="")
    return {"id": "fake", "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": json.dumps(payload, ensure_ascii=False)}}]}


def make_server(port: int, record=None):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def reply(self, status, payload):
            data = json.dumps(payload, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            self.reply(200, {"ok": True}) if self.path == "/health" else self.reply(404, {"error": "not_found"})

        def do_POST(self):
            if self.path != "/api/v1/chat/completions":
                self.reply(404, {"error": "not_found"})
                return
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            if record is not None:
                with open(record, "a", encoding="utf-8") as output:
                    output.write(json.dumps(body, ensure_ascii=False) + "\n")
            self.reply(200, fake_reply(body))

    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8799)
    parser.add_argument("--record")
    args = parser.parse_args()
    with make_server(args.port, args.record) as server:
        print(f"fake-openrouter listening on 127.0.0.1:{server.server_port}", flush=True)
        server.serve_forever()
