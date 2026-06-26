#!/usr/bin/env node

const { createSharedBuchungsdatenStore } = require("../db/shared-buchungsdaten");

async function main() {
  const store = await createSharedBuchungsdatenStore({ reseed: true });
  console.log(
    JSON.stringify(
      {
        action: "reseeded",
        health: store.getHealth(),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
