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
CONFIG_DIR = SCRIPT.parents[2] / ".config" / "opencode"

# Hand-checked existing GPT ladders, including their order and variants.
GPT_LADDER = [
    {"id": "proxy/gpt-6.1-sol-fast", "variant": "high"},
    {"id": "proxy/gpt-6.1-sol-fast", "variant": "medium"},
    {"id": "proxy/gpt-5.6-terra", "variant": "high"},
    {"id": "proxy/gpt-6-astra", "variant": "high"},
]
ORACLE_LADDER = [GPT_LADDER[2], GPT_LADDER[3], GPT_LADDER[0], GPT_LADDER[1]]
DESIGNER_LADDER = [GPT_LADDER[3], GPT_LADDER[0], GPT_LADDER[1], GPT_LADDER[2]]
VISION_LADDER = [*GPT_LADDER[:3], {"id": "gemini/gemini-3-flash", "variant": "low"}]


class ProfileTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="opencode-profile-", dir="/tmp/opencode")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config = self.root / "config"
        self.config.mkdir()
        self.slim = {"preset": "personal", "presets": {"work": {}, "personal": {}},
                     "unrelated": {"keep": [1, "yes"]}}
        self.global_config = {"model": "old/model", "small_model": "old/small",
            "disabled_providers": ["gitlab", "synecta", "anthropic"],
            "mcp": {"timeout": 123,
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
        cases = (("personal", ["gitlab", "synecta", "anthropic"]),
                 ("personal", ["gitlab", "synecta", "anthropic"]),
                 ("work", ["gitlab", "anthropic"]),
                 ("work", ["gitlab", "anthropic"]),
                 ("personal", ["gitlab", "anthropic", "synecta"]),
                 ("work", ["gitlab", "anthropic"]))
        for profile, disabled in cases:
            with self.subTest(profile=profile):
                result = self.run_profile(profile)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn(profile, result.stdout)
                self.assertIn("restart completed", result.stdout)
                expected_slim = dict(self.slim, preset=profile)
                expected_global = copy.deepcopy(self.global_config)
                expected_global["model"] = expected_global["small_model"] = (
                    "proxy/gpt-6.1-sol-fast" if profile == "personal"
                    else "synecta/ext-ollama-deepseek-v4.1-flash")
                expected_global["disabled_providers"] = disabled
                for name in ("jira", "confluence", "gitlab"):
                    expected_global["mcp"]["servers"][name]["disabled"] = profile == "personal"
                self.assertEqual(json.loads(self.paths[0].read_text()), expected_slim)
                self.assertEqual(json.loads(self.paths[1].read_text()), expected_global)
                self.assertTrue(all(p.stat().st_mode & 0o777 == 0o640 for p in self.paths))
        self.assertEqual([json.loads(line) for line in self.log.read_text().splitlines()],
                         [["service", "restart"]] * 6)

    def test_personal_disables_synecta_when_provider_list_is_absent(self):
        del self.global_config["disabled_providers"]
        self.paths[1].write_text(json.dumps(self.global_config))
        for profile, expected in (("personal", ["synecta"]), ("personal", ["synecta"]),
                                  ("work", []), ("work", [])):
            with self.subTest(profile=profile):
                result = self.run_profile(profile)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(json.loads(self.paths[1].read_text()).get("disabled_providers"),
                                 expected)

    def test_invalid_disabled_providers_cannot_save_or_restart(self):
        for invalid in (None, "synecta", {}, ["gitlab", 1]):
            with self.subTest(invalid=invalid):
                self.paths[1].write_text(json.dumps(dict(
                    self.global_config, disabled_providers=invalid)))
                before = [p.read_bytes() for p in self.paths]
                result = self.run_profile("personal")
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual([p.read_bytes() for p in self.paths], before)
                self.assertFalse(self.log.exists())

    def test_real_config_roundtrip_accepts_work_and_personal_source_copies(self):
        source_copy = self.root / "source-copy"
        source_copy.mkdir()
        originals = [(CONFIG_DIR / path.name).read_bytes() for path in self.paths]
        for initial in ("work", "personal"):
            with self.subTest(initial=initial):
                slim, global_config = [json.loads(content) for content in originals]
                slim["preset"] = initial
                global_config["model"] = global_config["small_model"] = (
                    "proxy/gpt-6.1-sol-fast" if initial == "personal"
                    else "synecta/ext-ollama-deepseek-v4.1-flash")
                global_config["disabled_providers"] = ["gitlab", "anthropic", "other"]
                if initial == "personal":
                    global_config["disabled_providers"].insert(1, "synecta")
                for name in ("jira", "confluence", "gitlab"):
                    global_config["mcp"]["servers"][name]["disabled"] = initial == "personal"
                for path, document in zip(self.paths, (slim, global_config)):
                    (source_copy / path.name).write_text(json.dumps(document))
                self.assert_real_config_roundtrip(source_copy)
        self.assertEqual([(CONFIG_DIR / path.name).read_bytes() for path in self.paths],
                         originals)

    def test_checked_in_configs_isolate_routes_and_roundtrip_without_live_writes(self):
        self.assert_real_config_roundtrip(CONFIG_DIR)

    def assert_real_config_roundtrip(self, source_dir):
        sources = [source_dir / path.name for path in self.paths]
        original_bytes = [p.read_bytes() for p in sources]
        original_slim, original_global = [json.loads(content) for content in original_bytes]
        initial = original_slim["preset"]
        self.assertIn(initial, ("work", "personal"))
        initial_model = ("proxy/gpt-6.1-sol-fast" if initial == "personal"
                         else "synecta/ext-ollama-deepseek-v4.1-flash")
        self.assertEqual(original_global["model"], initial_model)
        self.assertEqual(original_global["small_model"], initial_model)
        self.assertEqual("synecta" in original_global["disabled_providers"],
                         initial == "personal")
        for path, content in zip(self.paths, original_bytes):
            path.write_bytes(content)
        other = "personal" if initial == "work" else "work"
        for profile in (other, other, initial, other, initial, initial):
            with self.subTest(profile=profile):
                result = self.run_profile(profile)
                self.assertEqual(result.returncode, 0, result.stderr)
                slim, global_config = [json.loads(p.read_text()) for p in self.paths]
                self.assertEqual(slim, dict(original_slim, preset=profile))
                expected_global = copy.deepcopy(original_global)
                expected_global["model"] = expected_global["small_model"] = (
                    "proxy/gpt-6.1-sol-fast" if profile == "personal"
                    else "synecta/ext-ollama-deepseek-v4.1-flash")
                expected_global["disabled_providers"] = [
                    name for name in original_global["disabled_providers"] if name != "synecta"]
                if profile == "personal":
                    expected_global["disabled_providers"].append("synecta")
                for name in ("jira", "confluence", "gitlab"):
                    expected_global["mcp"]["servers"][name]["disabled"] = profile == "personal"
                self.assertEqual(global_config, expected_global)
                for preset in ("work", "personal"):
                    agents = slim["presets"][preset]["agents"]
                    self.assertEqual(set(agents), {"orchestrator", "oracle", "librarian",
                                                  "explorer", "designer", "fixer", "observer"})
                    for name, agent in agents.items():
                        ladder = {"oracle": ORACLE_LADDER, "designer": DESIGNER_LADDER,
                                  "observer": VISION_LADDER}.get(name, GPT_LADDER)
                        if preset == "work" and name != "observer":
                            ladder = ["synecta/ext-ollama-deepseek-v4.1-flash", *ladder]
                        self.assertEqual(agent["model"], ladder, (preset, name))
                personal = slim["presets"]["personal"]
                self.assertEqual(personal["extends"], "work")
                self.assertEqual(personal["agents"]["orchestrator"]["mcps"], [])
                work_agents = slim["presets"]["work"]["agents"]
                self.assertEqual(work_agents["orchestrator"]["mcps"],
                                 ["jira", "confluence", "gitlab"])
                self.assertEqual(work_agents["oracle"]["permission"], {
                    "edit": "deny", "write": "deny", "apply_patch": "deny",
                    "ast_grep_replace": "deny"})
                for agent in personal["agents"].values():
                    self.assertNotIn("permission", agent)  # Keep inherited permissions.
        self.assertEqual([p.read_bytes() for p in sources], original_bytes)
        expected_initial_global = copy.deepcopy(original_global)
        expected_initial_global["disabled_providers"] = [
            name for name in original_global["disabled_providers"] if name != "synecta"]
        if initial == "personal":
            expected_initial_global["disabled_providers"].append("synecta")
        self.assertEqual([json.loads(p.read_text()) for p in self.paths],
                         [original_slim, expected_initial_global])

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
