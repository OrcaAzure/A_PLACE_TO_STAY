import { isProduction } from '../config/env.js';
import { runSchemaPatches } from './migrations/schema-patches.js';
import { seedUsers } from './data/users.js';
import { seedDemoData, seedGuestStayExamples } from './data/demo.js';

export { runSchemaPatches } from './migrations/schema-patches.js';
export { seedUsers } from './data/users.js';
export { seedDemoData, seedGuestStayExamples } from './data/demo.js';

export async function runSeed() {
  await runSchemaPatches();

  // Explicit env values always win; otherwise seed admins in dev but never demo data.
  const bootstrapUsers = process.env.ENABLE_SEED === 'true'
    || (!isProduction && process.env.ENABLE_SEED !== 'false');
  const loadDemoData = process.env.ENABLE_DEMO_DATA === 'true';

  if (bootstrapUsers) {
    await seedUsers({ includeDemo: loadDemoData });
  } else if (isProduction) {
    console.log('[seed] User bootstrap skipped (set ENABLE_SEED=true on first deploy)');
  }

  if (loadDemoData) {
    await seedDemoData();
    await seedGuestStayExamples();
  } else {
    console.log('[seed] Demo data skipped (set ENABLE_DEMO_DATA=true to load sample accounts and bookings)');
  }
}
