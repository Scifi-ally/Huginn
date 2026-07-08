import { pgTable, text, timestamp, integer, boolean, uuid, jsonb, vector } from 'drizzle-orm/pg-core';

export const tasks = pgTable('tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  description: text('description').notNull(),
  dependencies: jsonb('dependencies').$type<string[]>().default([]).notNull(), // array of task IDs
  estimatedTier: integer('estimated_tier').notNull(),
  verificationCommand: text('verification_command').notNull(),
  contextDir: text('context_dir'),
  status: text('status', { enum: ['queued', 'ready', 'running', 'done', 'failed', 'stopped'] }).default('ready').notNull(),
  attemptCount: integer('attempt_count').default(0).notNull(),
  escalated: boolean('escalated').default(false).notNull(),
  parentId: uuid('parent_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const taskHistory = pgTable('task_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  taskId: uuid('task_id').references(() => tasks.id).notNull(),
  attemptNumber: integer('attempt_number').notNull(),
  tierUsed: integer('tier_used').notNull(),
  result: text('result', { enum: ['passed', 'failed'] }).notNull(),
  diffSummary: text('diff_summary'),
  failureReason: text('failure_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const memoryEmbeddings = pgTable('memory_embeddings', {
  id: uuid('id').defaultRandom().primaryKey(),
  taskId: uuid('task_id').references(() => tasks.id).notNull(),
  summary: text('summary').notNull(),
  diff: text('diff'),
  embedding: vector('embedding', { dimensions: 768 }), // Adjust dimensions based on the chosen local model, e.g., nomic-embed-text
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
