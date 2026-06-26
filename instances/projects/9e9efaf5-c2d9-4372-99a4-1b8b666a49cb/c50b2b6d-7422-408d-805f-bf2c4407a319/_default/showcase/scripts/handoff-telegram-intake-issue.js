#!/usr/bin/env node

const path = require("node:path");
const { executeTelegramIntakeHandoff } = require("../telegram-intake-handoff");

async function main() {
  const result = await executeTelegramIntakeHandoff({
    issueId: process.env.PAPERCLIP_TASK_ID || process.argv[2],
    showcaseDir: path.join(__dirname, ".."),
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
