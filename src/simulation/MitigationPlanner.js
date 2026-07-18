/**
 * MitigationPlanner — concrete, grounded actions to reduce the simulated risk.
 * Recommendations are built from the actual findings (name the backup people, the
 * orphan-risk repos, the affected customers) — not generic advice.
 */

export function planMitigations(scenario, impact, findings) {
  const actions = [];
  const add = (title, why, priority = 'medium') => actions.push({ title, why, priority });

  switch (scenario.type) {
    case 'EMPLOYEE_DEPARTURE': {
      const orphan = findings.orphanRisk || [];
      const backups = findings.backupCandidates || [];
      if (orphan.length) add(`Assign new owners for ${orphan.length} unowned asset(s): ${orphan.slice(0, 3).map(o => o.name).join(', ')}`, 'These would have no remaining owner after departure (bus-factor risk).', 'high');
      if (backups.length) add(`Cross-train / transition to ${backups.slice(0, 3).map(b => b.name).join(', ')}`, 'They already share ownership of the departing person’s assets.', 'high');
      else add('Run a knowledge-transfer / documentation sprint before departure', 'No existing backup owners were found for this person’s work.', 'high');
      add('Schedule a structured offboarding + handover review', 'Capture context that is not in the graph or docs.', 'medium');
      break;
    }
    case 'SERVICE_OUTAGE':
    case 'INTEGRATION_OUTAGE':
    case 'REPOSITORY_LOSS': {
      const cust = impact.customer.affectedCustomers || [];
      add('Confirm redundancy / failover for the affected service', 'Limits downtime blast radius.', 'high');
      if (cust.length) add(`Prepare proactive comms for ${cust.length} affected customer(s)`, 'Customer accounts are in the blast radius.', 'high');
      add('Verify and rehearse the runbook / restore path', 'Reduce time-to-recovery if this occurs.', 'medium');
      break;
    }
    case 'CUSTOMER_CHURN': {
      add(`Executive outreach to ${scenario.target?.name || 'the account'}`, 'Direct intervention on a high-value relationship.', 'high');
      add('Root-cause the churn signal (support, incidents, product gaps)', 'Address the underlying driver, not just this account.', 'high');
      add('Model revenue exposure and renewal timeline', 'Quantify and plan the financial hit.', 'medium');
      break;
    }
    case 'RELEASE_SLIP':
    case 'DEPLOYMENT_POSTPONE': {
      add('Re-sequence dependent work and communicate the new timeline', `${impact.timelineChanges.affected} dependent item(s) would move.`, 'high');
      add('Identify the critical-path blocker and add capacity there', 'Recover part of the slip.', 'medium');
      break;
    }
    case 'PROJECT_CANCEL': {
      add('Reassign freed contributors to critical-path work', 'Capture the capacity upside.', 'medium');
      add('Preserve knowledge/artifacts before archiving', 'Avoid losing reusable work.', 'medium');
      break;
    }
    case 'HIRING':
      add('Stagger onboarding with clear ownership areas', 'Convert added headcount into throughput without dilution.', 'medium');
      break;
    default:
      add('Review the affected dependencies before acting', 'Understand the cascade first.', 'medium');
  }

  if ((impact.knowledgeLoss?.score || 0) >= 60 && scenario.type !== 'EMPLOYEE_DEPARTURE') {
    add('Document tribal knowledge in the affected area', 'Knowledge concentration is high.', 'medium');
  }

  return actions;
}
