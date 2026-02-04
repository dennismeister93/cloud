import { deleteCollectionIfExists, ensureCollectionExists } from '@/lib/code-indexing/milvus';
import { DEFAULT_COLLECTION_NAME } from '@/lib/code-indexing/milvus-storage';
import { cliConfirm } from '@/scripts/lib/cli-confirm';
import { db } from '@/lib/drizzle';
import { code_indexing_manifest } from '@/db/schema';
import { sql, getTableName } from 'drizzle-orm';

export async function run() {
  console.log('⚠️  WARNING: This script will DELETE the production Milvus index!');
  console.log(`   Collection: ${DEFAULT_COLLECTION_NAME}`);
  console.log('   AND truncate the code_indexing_manifest table!');
  console.log('');
  console.log('   This action cannot be undone and will nuke the production index from orbit.');
  console.log('');

  await cliConfirm('Type "y" to confirm you want to proceed');

  console.log('');
  console.log('🗑️  Deleting Milvus collection...');
  await deleteCollectionIfExists(DEFAULT_COLLECTION_NAME);

  console.log('✅ Creating Milvus collection...');
  await ensureCollectionExists(DEFAULT_COLLECTION_NAME);

  console.log('🗑️  Truncating code_indexing_manifest table...');
  const tableName = getTableName(code_indexing_manifest);
  await db.execute(sql`TRUNCATE TABLE ${sql.identifier(tableName)} CASCADE`);

  console.log('✅ Setup complete!');
  console.log('');
}
