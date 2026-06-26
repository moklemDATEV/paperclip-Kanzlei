#!/usr/bin/env node

const { createSharedBuchungsdatenStore } = require("../db/shared-buchungsdaten");

async function main() {
  const store = await createSharedBuchungsdatenStore();
  const result = await store.syncAdditionalSeedBookings();

  console.log(
    JSON.stringify(
      {
        action: "synced_additional_seed_bookings",
        result,
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
