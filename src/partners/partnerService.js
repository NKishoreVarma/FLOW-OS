import { query } from '../config/db.js';

export async function listPartners({ status } = {}) {
  const { rows } = status
    ? await query(`SELECT * FROM design_partners WHERE status = $1 ORDER BY created_at DESC`, [status])
    : await query(`SELECT * FROM design_partners ORDER BY created_at DESC`);
  return rows;
}

export async function getPartner(id) {
  const { rows } = await query(`SELECT * FROM design_partners WHERE id = $1`, [id]);
  if (!rows[0]) return null;
  const reviews = await query(
    `SELECT * FROM partner_reviews WHERE partner_id = $1 ORDER BY week_of DESC LIMIT 8`,
    [id],
  );
  return { ...rows[0], reviews: reviews.rows };
}

export async function createPartner(data) {
  const { rows } = await query(
    `INSERT INTO design_partners
       (company_name, industry, contact_name, contact_email, status, health_score,
        tool_stack, business_goals, pain_points, success_metrics, deployment_timeline,
        workspace_id, mrr_usd, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      data.companyName, data.industry ?? 'SaaS', data.contactName ?? null,
      data.contactEmail ?? null, data.status ?? 'pre-pilot', data.healthScore ?? 80,
      data.toolStack ?? [], data.businessGoals ?? [], data.painPoints ?? [],
      data.successMetrics ?? [], data.deploymentTimeline ?? null,
      data.workspaceId ?? null, data.mrrUsd ?? 0, data.notes ?? null,
    ],
  );
  return rows[0];
}

export async function updatePartner(id, patch) {
  const fields = [];
  const vals = [];
  let i = 1;
  const map = {
    companyName: 'company_name', industry: 'industry', contactName: 'contact_name',
    contactEmail: 'contact_email', status: 'status', healthScore: 'health_score',
    toolStack: 'tool_stack', businessGoals: 'business_goals', painPoints: 'pain_points',
    successMetrics: 'success_metrics', deploymentTimeline: 'deployment_timeline',
    workspaceId: 'workspace_id', mrrUsd: 'mrr_usd', notes: 'notes',
  };
  for (const [key, col] of Object.entries(map)) {
    if (patch[key] !== undefined) { fields.push(`${col} = $${i++}`); vals.push(patch[key]); }
  }
  if (!fields.length) return getPartner(id);
  fields.push(`updated_at = NOW()`);
  vals.push(id);
  const { rows } = await query(
    `UPDATE design_partners SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  );
  return rows[0] ?? null;
}

export async function addWeeklyReview(partnerId, data) {
  const { rows } = await query(
    `INSERT INTO partner_reviews
       (partner_id, week_of, summary, dau, actions_taken, sentiment, blockers, next_steps)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [
      partnerId, data.weekOf ?? new Date().toISOString().slice(0, 10),
      data.summary ?? '', data.dau ?? 0, data.actionsTaken ?? 0,
      data.sentiment ?? 'neutral', data.blockers ?? [], data.nextSteps ?? [],
    ],
  );
  return rows[0];
}

export async function getPortfolioSummary() {
  const [counts, avgHealth, totalMrr] = await Promise.all([
    query(`SELECT status, COUNT(*)::int AS n FROM design_partners GROUP BY status`),
    query(`SELECT ROUND(AVG(health_score))::int AS avg FROM design_partners`),
    query(`SELECT COALESCE(SUM(mrr_usd), 0)::int AS total FROM design_partners WHERE status IN ('pilot','converting','converted')`),
  ]);

  const byStatus = Object.fromEntries(counts.rows.map(r => [r.status, r.n]));
  return {
    total: Object.values(byStatus).reduce((a, b) => a + b, 0),
    byStatus,
    avgHealth: avgHealth.rows[0]?.avg ?? 0,
    totalMrrUsd: totalMrr.rows[0]?.total ?? 0,
  };
}
