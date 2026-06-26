#!/usr/bin/env node

const { executePaperclipWorkflowHandoff, parseArgs } = require("../paperclip-workflow-handoff");

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await executePaperclipWorkflowHandoff(options);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
