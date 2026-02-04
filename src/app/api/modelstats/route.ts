import { db, sql } from '@/lib/drizzle';
import { connection, NextResponse } from 'next/server';
import * as z from 'zod';

const MaxAge = 86400;

const ModelStatsSchema = z.object({
  model: z.string(),
  cost: z.coerce.number(),
  costPerRequest: z.coerce.number(),
});

const CorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

export async function GET(): Promise<NextResponse> {
  await connection();

  const { rows } = await db.execute(sql`
    select
      mu.requested_model as model
      , sum(mu.cost) / sum(mu.input_tokens + mu.output_tokens) as cost
      , sum(mu.cost) / count(*) / 1000000 as "costPerRequest"
    from microdollar_usage mu
    where true
      and mu.created_at > now() - interval '7 days'
      and mu.requested_model is not null
      and mu.input_tokens + mu.output_tokens > 0
      and mu.cost > 0
    group by mu.requested_model
    order by sum(mu.input_tokens + mu.output_tokens) desc
    limit 30
  `);

  const parsedResults = z.array(ModelStatsSchema).safeParse(rows);
  if (!parsedResults.data) {
    return NextResponse.json(z.treeifyError(parsedResults.error), {
      status: 500,
      headers: CorsHeaders,
    });
  }

  return NextResponse.json(parsedResults.data, {
    headers: {
      ...CorsHeaders,
      'Cache-Control': `public, max-age=${MaxAge}, stale-while-revalidate=${MaxAge}`,
    },
  });
}
