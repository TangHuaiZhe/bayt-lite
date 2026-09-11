import test from "node:test";
import assert from "node:assert/strict";
import { cancelTask, finishTask, startTask } from "../lib/task-control.js";

test("cancels the active task and releases its controller", () => {
  const controller = startTask("cancel-me");
  assert.equal(controller.signal.aborted, false);
  assert.equal(cancelTask("cancel-me"), true);
  assert.equal(controller.signal.aborted, true);
  assert.equal(cancelTask("cancel-me"), false);
});

test("finishing an older task does not release its replacement", () => {
  const older = startTask("replace-me");
  const newer = startTask("replace-me");
  assert.equal(older.signal.aborted, true);
  finishTask("replace-me", older);
  assert.equal(cancelTask("replace-me"), true);
  assert.equal(newer.signal.aborted, true);
});
