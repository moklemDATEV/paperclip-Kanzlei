#!/usr/bin/env node

const { verifyTelegramBots } = require("../telegram-bots");

async function main() {
  const result = await verifyTelegramBots();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
