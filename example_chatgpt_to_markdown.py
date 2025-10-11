#!/usr/bin/env python3
"""
convert_chatgpt_payload.py
--------------------------
Convert a raw ChatGPT payload (from the browser Network tab) into a
chronologically-ordered Markdown transcript.

USAGE EXAMPLES
--------------
# Everything (default)
python convert_chatgpt_payload.py payload.json

# Only user messages
python convert_chatgpt_payload.py payload.json --user-only

# Only assistant messages, custom output file
python convert_chatgpt_payload.py payload.json out.md --assistant-only
"""

import argparse
import json
import sys
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path

LOCAL_TZ = ZoneInfo("America/Chicago")  # change if desired


# ---------- helper functions -------------------------------------------------
def epoch_to_readable(ts: int | None) -> str:
	"""Convert a Unix-epoch timestamp (seconds) to a readable local string."""
	if ts is None:
		return "unknown"
	return datetime.fromtimestamp(ts, LOCAL_TZ).strftime("%Y-%m-%d %H:%M:%S %Z")


def extract_messages(mapping: dict, keep_roles: set[str]) -> list[dict]:
	"""Return a sorted list of messages whose author.role is in keep_roles."""
	collected = []
	for node in mapping.values():
		msg = node.get("message")
		if not msg:
			continue
		role = msg["author"]["role"]
		if role not in keep_roles:
			continue

		# Extract content safely handling both string and dict content
		content_parts = msg["content"].get("parts", [])
		content = []
		for part in content_parts:
			if isinstance(part, dict):
				# If part is a dict, try to get text content
				content.append(part.get("text", ""))
			elif isinstance(part, str):
				content.append(part)
			
		collected.append(
			{
				"role": role,
				"time": epoch_to_readable(msg.get("create_time")),
				"content": "\n".join(content),
				"id": msg["id"],
				"status": msg.get("status"),
			}
		)

	# 1st sort key puts messages *with* a timestamp first; 2nd sorts chronologically
	collected.sort(key=lambda m: (m["time"] == "unknown", m["time"]))
	return collected


def to_markdown(messages: list[dict]) -> str:
	"""Render a list of message dicts as Markdown text."""
	lines: list[str] = []
	for m in messages:
		if m["content"] == "": continue
		header = f"### {m['role'].capitalize()} – {m['time']}"
		# meta   = f"*id: `{m['id']}`*"
		lines.extend([header, "", m["content"], ""])
	return "\n".join(lines)


# ---------- main script ------------------------------------------------------
def parse_cli() -> argparse.Namespace:
	parser = argparse.ArgumentParser(
		description="Convert ChatGPT conversation payload to Markdown."
	)
	parser.add_argument("payload", help="Path to the JSON payload file")
	parser.add_argument(
		"output",
		nargs="?",
		default="conversation.md",
		help="Output Markdown file (default: conversation.md)",
	)

	group = parser.add_mutually_exclusive_group()
	group.add_argument(
		"--user-only",
		action="store_true",
		help="Include only messages from the user",
	)
	group.add_argument(
		"--assistant-only",
		action="store_true",
		help="Include only messages from the assistant",
	)
	return parser.parse_args()


def main() -> None:
	args = parse_cli()

	# Decide which roles to keep based on flags
	if args.user_only:
		keep_roles = {"user"}
	elif args.assistant_only:
		keep_roles = {"assistant"}
	else:
		keep_roles = {"user", "assistant"}

	in_path = Path(args.payload)
	out_path = Path(args.output)

	try:
		data = json.loads(in_path.read_text(encoding="utf-8"))
	except Exception as exc:
		sys.exit(f"Error reading JSON: {exc}")

	mapping = data.get("mapping")
	if not mapping:
		sys.exit("No 'mapping' key found in the provided payload.")

	messages = extract_messages(mapping, keep_roles)
	markdown = to_markdown(messages)

	out_path.write_text(markdown, encoding="utf-8")
	print(
		f"Wrote {len(messages)} message(s) "
		f"({'/'.join(sorted(keep_roles))}) → {out_path.resolve()}"
	)


if __name__ == "__main__":
	main()
