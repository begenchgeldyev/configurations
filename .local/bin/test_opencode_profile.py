"""Focused tests: python3 .local/bin/test_opencode_profile.py -v"""

import copy
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


SCRIPT = Path(__file__).with_name("opencode-profile")


class ProfileTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="opencode-profile-", dir="/tmp/opencode")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config = self.root / "config"
        self.config.mkdir()
        self.slim = {"preset": "personal", "presets": {"work": {}, "personal": {}},
                     "unrelated": {"keep": [1, "yes"]}}
        self.global_config = {"model": "unchanged", "mcp": {"timeout": 123,
            "servers": {name: {"type": "local", "command": [name], "disabled": True}
                        for name in ("jira", "confluence", "gitlab")}}}
        self.global_config["mcp"]["servers"]["github"] = {
            "type": "remote", "url": "https://example.test", "disabled": False}
        self.paths = [self.config / "oh-my-opencode-slim.json", self.config / "opencode.json"]
        for path, value in zip(self.paths, (self.slim, self.global_config)):
            path.write_text(json.dumps(value) + "\n")
            path.chmod(0o640)
        self.log = self.root / "restart.jsonl"
        self.stub = self.root / "restart.py"
        self.stub.write_text(
            "import json, os, sys\n"
            "with open(os.environ['RESTART_LOG'], 'a') as f: "
            "f.write(json.dumps(sys.argv[1:]) + '\\n')\n"
            "sys.exit(int(os.environ.get('RESTART_EXIT', '0')))\n")
        self.env = dict(os.environ, OPENCODE_PROFILE_CONFIG_DIR=str(self.config),
                        OPENCODE_PROFILE_RESTART_COMMAND=shlex.join(
                            [sys.executable, str(self.stub), "service", "restart"]),
                        RESTART_LOG=str(self.log), RESTART_EXIT="0")

    def run_profile(self, *args, **env):
        return subprocess.run([sys.executable, str(SCRIPT), *args],
                              env=dict(self.env, **env), capture_output=True, text=True)

    def load_module(self):
        loader = importlib.machinery.SourceFileLoader("opencode_profile_tested", str(SCRIPT))
        spec = importlib.util.spec_from_loader(loader.name, loader)
        module = importlib.util.module_from_spec(spec)
        loader.exec_module(module)
        return module

    def test_both_directions_preserve_unrelated_and_restart(self):
        for profile in ("work", "personal"):
            with self.subTest(profile=profile):
                result = self.run_profile(profile)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn(profile, result.stdout)
                self.assertIn("restart completed", result.stdout)
                expected_slim = dict(self.slim, preset=profile)
                expected_global = copy.deepcopy(self.global_config)
                for name in ("jira", "confluence", "gitlab"):
                    expected_global["mcp"]["servers"][name]["disabled"] = profile == "personal"
                self.assertEqual(json.loads(self.paths[0].read_text()), expected_slim)
                self.assertEqual(json.loads(self.paths[1].read_text()), expected_global)
                self.assertTrue(all(p.stat().st_mode & 0o777 == 0o640 for p in self.paths))
        self.assertEqual([json.loads(line) for line in self.log.read_text().splitlines()],
                         [["service", "restart"], ["service", "restart"]])

    def test_invalid_arguments_do_not_write_or_restart(self):
        before = [p.read_bytes() for p in self.paths]
        for args in ((), ("other",), ("WORK",), ("work", "personal")):
            with self.subTest(args=args):
                result = self.run_profile(*args)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("usage:", result.stderr)
                self.assertEqual([p.read_bytes() for p in self.paths], before)
                self.assertFalse(self.log.exists())

    def test_symlinks_keep_destinations(self):
        targets = []
        for index, path in enumerate(self.paths):
            target = self.root / f"destination-{index}.json"
            path.rename(target)
            path.symlink_to(Path("..") / target.name)
            targets.append(target)
        result = self.run_profile("work")
        self.assertEqual(result.returncode, 0, result.stderr)
        for path, target in zip(self.paths, targets):
            self.assertTrue(path.is_symlink())
            self.assertEqual(path.readlink(), Path("..") / target.name)
            self.assertEqual(path.resolve(), target)
        self.assertEqual(json.loads(targets[0].read_text())["preset"], "work")
        self.assertFalse(json.loads(targets[1].read_text())["mcp"]["servers"]["jira"]["disabled"])

    def test_invalid_config_or_restart_command_does_not_write(self):
        original = self.paths[1].read_bytes()
        cases = (b"{invalid", b"{}", b'{"mcp":{"servers":{"jira":{}}}}')
        for content in cases:
            self.paths[1].write_bytes(content)
            before = [p.read_bytes() for p in self.paths]
            result = self.run_profile("work")
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual([p.read_bytes() for p in self.paths], before)
            self.assertFalse(self.log.exists())
        self.paths[1].write_bytes(original)
        for command in ("", "'unterminated"):
            before = [p.read_bytes() for p in self.paths]
            result = self.run_profile("work", OPENCODE_PROFILE_RESTART_COMMAND=command)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual([p.read_bytes() for p in self.paths], before)
            self.assertFalse(self.log.exists())

    def test_restart_failure_is_not_success(self):
        result = self.run_profile("work", RESTART_EXIT="9")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("saved", result.stderr)
        self.assertIn("restart failed", result.stderr)
        self.assertNotIn("restart completed", result.stdout)
        self.assertEqual(json.loads(self.paths[0].read_text())["preset"], "work")
        self.assertFalse(json.loads(self.paths[1].read_text())["mcp"]["servers"]["jira"]["disabled"])

    def test_write_failures_restore_original_bytes_without_restart(self):
        module = self.load_module()
        before = [p.read_bytes() for p in self.paths]
        real_replace = os.replace
        for fail_at in (1, 2):
            count = 0

            def replace(source, destination):
                nonlocal count
                count += 1
                if count == fail_at:
                    raise OSError("injected replacement failure")
                return real_replace(source, destination)

            with self.subTest(fail_at=fail_at), mock.patch.dict(os.environ, self.env), \
                    mock.patch.object(module.os, "replace", side_effect=replace), \
                    mock.patch.object(module.subprocess, "run") as restart:
                self.assertEqual(module.main(["work"]), 1)
                restart.assert_not_called()
                self.assertEqual([p.read_bytes() for p in self.paths], before)
                self.assertEqual(set(self.config.iterdir()), set(self.paths))

    def test_staging_failure_does_not_write(self):
        module = self.load_module()
        before = [p.read_bytes() for p in self.paths]
        real_stage = module.stage_file
        count = 0

        def stage(*args):
            nonlocal count
            count += 1
            if count == 3:
                raise OSError("injected staging failure")
            return real_stage(*args)

        with mock.patch.dict(os.environ, self.env), \
                mock.patch.object(module, "stage_file", side_effect=stage), \
                mock.patch.object(module.subprocess, "run") as restart:
            self.assertEqual(module.main(["work"]), 1)
            restart.assert_not_called()
        self.assertEqual([p.read_bytes() for p in self.paths], before)
        self.assertEqual(set(self.config.iterdir()), set(self.paths))

    def test_default_restart_command(self):
        module = self.load_module()
        env = dict(self.env)
        del env["OPENCODE_PROFILE_RESTART_COMMAND"]
        with mock.patch.dict(os.environ, env, clear=True), \
                mock.patch.object(module.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)) as restart:
            self.assertEqual(module.main(["work"]), 0)
            restart.assert_called_once_with(["opencode", "service", "restart"], check=False)


if __name__ == "__main__":
    unittest.main()
