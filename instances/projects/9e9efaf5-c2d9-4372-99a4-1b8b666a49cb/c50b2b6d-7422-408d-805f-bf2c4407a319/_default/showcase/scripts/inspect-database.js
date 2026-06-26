#!/usr/bin/env node

const { createSharedBuchungsdatenStore } = require("../db/shared-buchungsdaten");

async function main() {
  const chartType = process.argv[2] || "SKR03";
  const store = await createSharedBuchungsdatenStore();
  const [mandant] = store.listMandanten();

  console.log(
    JSON.stringify(
      {
        health: store.getHealth(),
        mandant,
        sampleBookings: mandant ? store.listBookings(mandant.id, chartType).slice(0, 3) : [],
        accountCatalog: store.listAccountCatalog(chartType),
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
