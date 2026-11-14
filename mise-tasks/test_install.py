#!/usr/bin/env python3
"""Isolated installer checks: python3 mise-tasks/test_install.py (no downloads)."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


REPO = Path(__file__).resolve().parents[1]
COMMANDS = [
    ["install"],
    ["exec", "npm:agent-browser@0.43.0", "--", "agent-browser", "install"],
    [
        "exec", "npm:skills@1.8.1", "--", "skills", "add",
        "vercel-labs/agent-browser", "--skill", "agent-browser",
        "--global", "--agent", "opencode", "--yes",
    ],
]


class InstallTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="agent-browser-install-", dir="/tmp/opencode")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        self.home = self.root / "home"
        self.bin = self.root / "bin"
        for path in (self.repo, self.home, self.bin):
            path.mkdir()
        for rel in ("mise-tasks/install", ".config/mise/config.toml"):
            dst = self.repo / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(REPO / rel, dst)
        # Tracked fixtures exercise the existing copy/link/backup paths, including
        # the exclusion that keeps this test out of the user's dotfiles.
        for rel, content in {
            ".zshrc": "new shell config\n",
            ".identical": "same content\n",
            "mise-tasks/test_install.py": "not a dotfile\n",
            ".config/opencode/plugins/memory-brief.ts": "// plugin fixture\n",
        }.items():
            dst = self.repo / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_text(content)
        (self.home / ".zshrc").write_text("original shell config\n")
        (self.home / ".identical").write_text("same content\n")
        self.trace = self.root / "commands.jsonl"
        self.env = {
            "HOME": str(self.home),
            "PATH": f"{self.bin}:{os.defpath}",
            "TRACE": str(self.trace),
        }
        stub = self.bin / "mise"
        stub.write_text(
            f"#!{sys.executable}\n"
            "import json, os, pathlib, sys\n"
            "trace = pathlib.Path(os.environ['TRACE'])\n"
            "with trace.open('a') as stream:\n"
            "    stream.write(json.dumps(sys.argv[1:]) + '\\n')\n"
            "assert (pathlib.Path.home() / '.config/mise/config.toml').is_symlink()\n"
            "step = len(trace.read_text().splitlines())\n"
            "sys.exit(37 if step == int(os.environ.get('FAIL_AT', '0')) else 0)\n"
        )
        stub.chmod(0o755)
        for name in ("agent-browser", "skills", "sudo", "npm", "npx"):
            guard = self.bin / name
            guard.write_text("#!/bin/sh\necho 'unexpected unpinned command' >&2\nexit 99\n")
            guard.chmod(0o755)
        self.git("init", "-q")
        self.git("add", ".")

    def git(self, *args):
        subprocess.run(["git", "-C", str(self.repo), *args], env=self.env, check=True,
                       capture_output=True, text=True)

    def install(self, **extra_env):
        return subprocess.run(["bash", str(self.repo / "mise-tasks/install")],
                              cwd=self.repo, env={**self.env, **extra_env},
                              capture_output=True, text=True)

    def commands(self):
        return [json.loads(line) for line in self.trace.read_text().splitlines()] if self.trace.exists() else []

    def test_dry_run_prints_plan_without_running_commands_or_changing_home(self):
        result = self.install(usage_dry_run="true")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.commands(), [])
        for command in COMMANDS:
            self.assertIn("mise " + " ".join(command), result.stdout)
        self.assertEqual(sorted(p.name for p in self.home.iterdir()), [".identical", ".zshrc"])
        self.assertEqual((self.home / ".zshrc").read_text(), "original shell config\n")
        self.assertFalse((self.home / ".identical").is_symlink())

    def test_install_order_exact_arguments_and_existing_file_behavior(self):
        result = self.install()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.commands(), COMMANDS)
        self.assertEqual((self.home / ".zshrc").readlink(), self.repo / ".zshrc")
        backups = list(self.home.glob(".zshrc.bak.*"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_text(), "original shell config\n")
        self.assertTrue((self.home / ".identical").is_symlink())
        self.assertEqual(list(self.home.glob(".identical.bak.*")), [])
        plugin = self.home / ".config/opencode/plugins/memory-brief.ts"
        self.assertFalse(plugin.is_symlink())
        self.assertEqual(plugin.read_text(), "// plugin fixture\n")
        self.assertFalse((self.home / "mise-tasks").exists())
        result = self.install()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.commands(), COMMANDS * 2)
        self.assertEqual(list(self.home.glob(".zshrc.bak.*")), backups)

    def test_mise_install_failure_stops_followup(self):
        self.assert_failure(1)

    def test_browser_install_failure_stops_skill_install(self):
        self.assert_failure(2)

    def test_skill_install_failure_is_propagated(self):
        self.assert_failure(3)

    def assert_failure(self, step):
        result = self.install(FAIL_AT=str(step))
        self.assertEqual(result.returncode, 37, result.stderr)
        self.assertEqual(self.commands(), COMMANDS[:step])


if __name__ == "__main__":
    unittest.main()
