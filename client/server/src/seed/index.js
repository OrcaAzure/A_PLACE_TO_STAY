import { isProduction } from '../config/env.js';
import { runSchemaPatches } from './migrations/schema-patches.js';
import { seedUsers, seedDemoUsers } from './data/users.js';
import { seedDemoData, seedGuestStayExamples, seedGuestAccessRequests } from './data/demo.js';

export { runSchemaPatches } from './migrations/schema-patches.js';
export { seedUsers, seedDemoUsers } from './data/users.js';
export { seedDemoData, seedGuestStayExamples, seedGuestAccessRequests } from './data/demo.js';

export async function runSeed() {
  await runSchemaPatches();

  const bootstrapUsers = process.env.ENABLE_SEED === 'true' || !isProduction;
  // Demo bookings/guests are opt-in only — never auto-load (avoids re-polluting a cleaned DB).
  const loadDemoData = process.env.ENABLE_DEMO_DATA === 'true';

  if (bootstrapUsers) {
    await seedUsers();
  } else if (isProduction) {
    console.log('[seed] User bootstrap skipped (set ENABLE_SEED=true on first deploy)');
  }

  if (loadDemoData) {
    await seedDemoUsers();
    await seedDemoData();
    await seedGuestStayExamples();
    await seedGuestAccessRequests();
  } else {
    console.log('[seed] Demo data skipped (set ENABLE_DEMO_DATA=true to load)');
  }
}
