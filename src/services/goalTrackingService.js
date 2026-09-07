import { prisma } from '../core/config/prisma.js';
import { NotFoundError } from '../core/errors/index.js';

async function assertGoal(workspaceId, goalId) {
  const goal = await prisma.goal.findFirst({
    where: { id: goalId, workspaceId: String(workspaceId) }
  });
  if (!goal) throw new NotFoundError('Goal');
  return goal;
}

async function recomputeProgress(goalId) {
  const milestones = await prisma.goalMilestone.findMany({ where: { goalId } });
  if (milestones.length === 0) return 0;
  const done = milestones.filter(m => m.done).length;
  return Math.round((done / milestones.length) * 100);
}

export async function createGoal(workspaceId, orgId, { title, description, targetDate, owner, milestones = [] }) {
  return prisma.goal.create({
    data: {
      workspaceId: String(workspaceId),
      orgId,
      title,
      description,
      targetDate: targetDate ? new Date(targetDate) : null,
      owner,
      milestones: { create: milestones.map(m => ({ title: m.title, dueDate: m.dueDate ? new Date(m.dueDate) : null })) }
    },
    include: { milestones: true }
  });
}

export async function listGoals(workspaceId, { status } = {}) {
  return prisma.goal.findMany({
    where: { workspaceId: String(workspaceId), ...(status ? { status } : {}) },
    include: { milestones: { orderBy: { dueDate: 'asc' } } },
    orderBy: { createdAt: 'desc' }
  });
}

export async function getGoal(workspaceId, goalId) {
  return prisma.goal.findFirst({
    where: { id: goalId, workspaceId: String(workspaceId) },
    include: { milestones: { orderBy: { dueDate: 'asc' } } }
  });
}

export async function updateGoal(workspaceId, goalId, updates) {
  await assertGoal(workspaceId, goalId);
  const { title, description, status, progress, targetDate, owner } = updates;
  return prisma.goal.update({
    where: { id: goalId },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(status !== undefined && { status }),
      ...(progress !== undefined && { progress: Math.min(100, Math.max(0, progress)) }),
      ...(targetDate !== undefined && { targetDate: targetDate ? new Date(targetDate) : null }),
      ...(owner !== undefined && { owner })
    },
    include: { milestones: true }
  });
}

export async function addMilestone(workspaceId, goalId, { title, dueDate }) {
  await assertGoal(workspaceId, goalId);
  const milestone = await prisma.goalMilestone.create({
    data: { goalId, title, dueDate: dueDate ? new Date(dueDate) : null }
  });
  const progress = await recomputeProgress(goalId);
  await prisma.goal.update({ where: { id: goalId }, data: { progress } });
  return milestone;
}

export async function completeMilestone(workspaceId, goalId, milestoneId) {
  const goal = await assertGoal(workspaceId, goalId);
  const milestone = await prisma.goalMilestone.findFirst({ where: { id: milestoneId, goalId } });
  if (!milestone) throw new NotFoundError('Milestone');

  await prisma.goalMilestone.update({ where: { id: milestoneId }, data: { done: true } });
  const progress = await recomputeProgress(goalId);
  // Only promote to COMPLETE at 100%; never override a CANCELLED goal or downgrade risk-derived status below 100%.
  const data = goal.status === 'CANCELLED'
    ? { progress }
    : progress === 100
      ? { progress, status: 'COMPLETE' }
      : { progress };
  return prisma.goal.update({
    where: { id: goalId },
    data,
    include: { milestones: true }
  });
}

export async function deleteGoal(workspaceId, goalId) {
  return prisma.goal.deleteMany({ where: { id: goalId, workspaceId: String(workspaceId) } });
}

export async function evaluateGoal(workspaceId, goalId) {
  const goal = await prisma.goal.findFirst({
    where: { id: goalId, workspaceId: String(workspaceId) },
    include: { milestones: true }
  });
  if (!goal) throw new NotFoundError('Goal');

  const now = Date.now();
  const milestones = goal.milestones || [];
  const total = milestones.length;
  const done = milestones.filter(m => m.done).length;
  const progress = total > 0 ? Math.round((done / total) * 100) : goal.progress;

  // A cancelled goal is terminal — never re-derive or persist a new status over it.
  if (goal.status === 'CANCELLED') {
    return {
      goalId: goal.id,
      title: goal.title,
      progress: goal.progress,
      status: 'CANCELLED',
      risks: [],
      blockers: [],
      predictedCompletion: null,
      recommendedInterventions: [],
      milestoneSummary: { total, done, overdue: 0 }
    };
  }

  const overdue = milestones.filter(m => !m.done && m.dueDate && new Date(m.dueDate).getTime() < now);
  const pastTarget = goal.targetDate ? new Date(goal.targetDate).getTime() < now : false;

  const risks = [];
  if (overdue.length > 0) risks.push(`${overdue.length} milestone(s) past due date.`);
  if (pastTarget && progress < 100) risks.push('Goal target date has passed without completion.');
  if (goal.targetDate && !pastTarget && progress < 50) {
    const daysLeft = Math.ceil((new Date(goal.targetDate).getTime() - now) / 86400000);
    if (daysLeft <= 7) risks.push(`Only ${daysLeft} day(s) to target with ${progress}% complete.`);
  }

  const blockers = overdue.map(m => ({ milestoneId: m.id, title: m.title, dueDate: m.dueDate }));

  // Predicted completion: extrapolate from completion velocity since goal creation.
  let predictedCompletion = null;
  if (progress >= 100) {
    predictedCompletion = 'COMPLETE';
  } else if (done > 0) {
    const elapsedDays = Math.max(1, (now - new Date(goal.createdAt).getTime()) / 86400000);
    const ratePerDay = done / elapsedDays;
    const remaining = total - done;
    if (ratePerDay > 0) {
      const daysToFinish = Math.ceil(remaining / ratePerDay);
      predictedCompletion = new Date(now + daysToFinish * 86400000).toISOString();
    }
  }

  let derivedStatus;
  if (progress >= 100) derivedStatus = 'COMPLETE';
  else if (blockers.length > 0 && pastTarget) derivedStatus = 'BLOCKED';
  else if (risks.length > 0) derivedStatus = 'AT_RISK';
  else derivedStatus = 'ON_TRACK';

  const interventions = [];
  if (derivedStatus === 'BLOCKED') interventions.push('Escalate overdue milestones to the goal owner and reassign blockers.');
  if (derivedStatus === 'AT_RISK') interventions.push('Re-sequence remaining milestones or extend the target date.');
  if (overdue.length > 0) interventions.push(`Address ${overdue.length} overdue milestone(s) immediately.`);
  if (interventions.length === 0) interventions.push('No intervention required — goal is on track.');

  if (derivedStatus !== goal.status) {
    await prisma.goal.update({ where: { id: goal.id }, data: { status: derivedStatus, progress } });
  } else if (progress !== goal.progress) {
    await prisma.goal.update({ where: { id: goal.id }, data: { progress } });
  }

  return {
    goalId: goal.id,
    title: goal.title,
    progress,
    status: derivedStatus,
    risks,
    blockers,
    predictedCompletion,
    recommendedInterventions: interventions,
    milestoneSummary: { total, done, overdue: overdue.length }
  };
}
