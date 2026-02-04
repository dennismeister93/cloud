import { format, resolveConfig } from 'prettier';
import * as prettierPluginSortJson from 'prettier-plugin-sort-json';
import { writeFileSync } from 'fs';
import { join } from 'path';
import type { NormalizedOpenRouterResponse } from '@/lib/providers/openrouter/openrouter-types';
import { syncProviders } from '@/lib/providers/openrouter/sync-providers';

async function run() {
  try {
    const result: NormalizedOpenRouterResponse = await syncProviders();

    // Write to JSON file
    const outputPath = join(process.cwd(), 'src/data/openrouter-models-by-provider-backup.json');
    writeFileSync(
      outputPath,
      await format(JSON.stringify(result, null, 2), {
        ...(await resolveConfig(join(__dirname, '../../../.prettierrc.json'))),
        parser: 'json',
        plugins: [prettierPluginSortJson],
        jsonRecursiveSort: true,
        jsonSortOrder: '{"*": "lexical"}',
      })
    );

    console.log(
      `Successfully synced ${result.providers.length} providers with ${result.total_models} total models to ${outputPath}`
    );
    console.log('Provider summary:');
    result.providers.forEach(provider => {
      console.log(`  ${provider.name}: ${provider.models.length} models`);
    });
  } catch (error) {
    console.error('Error syncing OpenRouter providers:', error);
    throw error;
  }
}

// Run the script if called directly
if (require.main === module) {
  run()
    .then(() => {
      console.log('Sync completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Sync failed:', error);
      process.exit(1);
    });
}

export { run };
