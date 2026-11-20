import Anthropic from '@anthropic-ai/sdk'
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { eq, sum } from 'drizzle-orm'
import { authorized } from '~~/server/orpc/authorized'
import { tryCatch } from '~~/shared/utils/tryCatch'
import { env } from '~~/server/env'
import { budget, spend, channelBudget, channel, campaign, result, budgetPrediction, channelPrediction } from '~~/server/database/schemas'

const inputSchema = z.object({
  text: z.string().min(1).optional(),
  budgetId: z.string().uuid().optional(),
  images: z.array(z.object({
    data: z.string(),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
  })).optional(),
}).refine(
  d => d.text || d.budgetId || (d.images && d.images.length > 0),
  { message: 'At least one of text, budgetId, or images is required' },
)

interface BudgetContext {
  budget: { period: string, totalBudgetCents: number, startDate: string, endDate: string }
  channels: { channel: string, spendCents: number, revenueCents: number, usersAcquired: number }[]
  predictions: { period: string, totalBudgetCents: number, predictedRevenueCents: number, predictedUsersAcquired: number }[]
}

export default authorized
  .input(inputSchema)
  .handler(async ({ input, context }) => {
    const { db } = context
    let budgetSummary: BudgetContext | null = null

    const contentBlocks: Anthropic.Messages.ContentBlockParam[] = []

    if (input.budgetId) {
      const { data: budgetRows, error: budgetError } = await tryCatch(
        db.select().from(budget).where(eq(budget.id, input.budgetId)),
      )
      if (budgetError || !budgetRows?.[0]) throw new ORPCError('INTERNAL_SERVER_ERROR')
      const budgetRow = budgetRows[0]

      const { data: spendRows, error: spendError } = await tryCatch(
        db.select({ amountCents: spend.amountCents, channelName: channel.name })
          .from(spend)
          .innerJoin(campaign, eq(spend.campaignId, campaign.id))
          .innerJoin(channelBudget, eq(campaign.channelBudgetId, channelBudget.id))
          .innerJoin(channel, eq(channelBudget.channelId, channel.id))
          .where(eq(channelBudget.budgetId, input.budgetId)),
      )
      if (spendError) throw new ORPCError('INTERNAL_SERVER_ERROR')

      const { data: resultRows, error: resultError } = await tryCatch(
        db.select({ revenueCents: result.revenueCents, usersAcquired: result.usersAcquired, channelName: channel.name })
          .from(result)
          .innerJoin(campaign, eq(result.campaignId, campaign.id))
          .innerJoin(channelBudget, eq(campaign.channelBudgetId, channelBudget.id))
          .innerJoin(channel, eq(channelBudget.channelId, channel.id))
          .where(eq(channelBudget.budgetId, input.budgetId)),
      )
      if (resultError) throw new ORPCError('INTERNAL_SERVER_ERROR')

      const { data: predictionRows, error: predictionError } = await tryCatch(
        db.select({
          predictionPeriod: budgetPrediction.predictionPeriod,
          totalBudgetCents: budgetPrediction.totalBudgetCents,
          predictedRevenueCents: sum(channelPrediction.predictedRevenueCents),
          predictedUsersAcquired: sum(channelPrediction.predictedUsersAcquired),
        })
          .from(budgetPrediction)
          .leftJoin(channelPrediction, eq(channelPrediction.budgetPredictionId, budgetPrediction.id))
          .where(eq(budgetPrediction.budgetId, input.budgetId))
          .groupBy(budgetPrediction.id, budgetPrediction.predictionPeriod, budgetPrediction.totalBudgetCents),
      )
      if (predictionError) throw new ORPCError('INTERNAL_SERVER_ERROR')

      const spendByChannel: Record<string, number> = {}
      for (const s of spendRows ?? []) {
        spendByChannel[s.channelName] = (spendByChannel[s.channelName] ?? 0) + s.amountCents
      }

      const resultByChannel: Record<string, { revenueCents: number, usersAcquired: number }> = {}
      for (const r of resultRows ?? []) {
        const prev = resultByChannel[r.channelName] ?? { revenueCents: 0, usersAcquired: 0 }
        resultByChannel[r.channelName] = {
          revenueCents: prev.revenueCents + (r.revenueCents ?? 0),
          usersAcquired: prev.usersAcquired + (r.usersAcquired ?? 0),
        }
      }

      const channelNames = new Set([...Object.keys(spendByChannel), ...Object.keys(resultByChannel)])

      const budgetContext: BudgetContext = {
        budget: {
          period: budgetRow.budgetPeriod,
          totalBudgetCents: budgetRow.totalBudgetCents,
          startDate: budgetRow.startDate,
          endDate: budgetRow.endDate,
        },
        channels: [...channelNames].map(name => ({
          channel: name,
          spendCents: spendByChannel[name] ?? 0,
          revenueCents: resultByChannel[name]?.revenueCents ?? 0,
          usersAcquired: resultByChannel[name]?.usersAcquired ?? 0,
        })),
        predictions: (predictionRows ?? []).map(p => ({
          period: p.predictionPeriod,
          totalBudgetCents: p.totalBudgetCents,
          predictedRevenueCents: Number(p.predictedRevenueCents ?? 0),
          predictedUsersAcquired: Number(p.predictedUsersAcquired ?? 0),
        })),
      }

      budgetSummary = budgetContext
      contentBlocks.push({ type: 'text', text: JSON.stringify(budgetContext) })
    }

    for (const img of input.images ?? []) {
      contentBlocks.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mimeType, data: img.data },
      })
    }

    if (input.text) {
      contentBlocks.push({ type: 'text', text: input.text })
    }

    // The public demo runs without an Anthropic key, so the analyst answers from
    // the data it just assembled instead of calling the API.
    if (!env.ANTHROPIC_API_KEY) {
      return { text: offlineAnalysis(budgetSummary, input.images?.length ?? 0) }
    }

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

    const { data, error } = await tryCatch(
      client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: 'You are a marketing budget analyst assistant. Be concise and data-driven. Always respond with plain text only.',
        messages: [{ role: 'user', content: contentBlocks }],
      }),
    )

    if (error || !data) throw new ORPCError('INTERNAL_SERVER_ERROR')

    const content = data.content[0]
    if (content?.type !== 'text') throw new ORPCError('INTERNAL_SERVER_ERROR')

    return { text: content.text }
  })

const currency = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`

const count = (value: number) => value.toLocaleString('en-US')

const roi = (c: { spendCents: number, revenueCents: number }) =>
  c.spendCents > 0 ? c.revenueCents / c.spendCents : 0

/**
 * Stand-in for the model when no API key is configured, which is how the public
 * demo always runs. It writes the same kind of spend-and-return readout the
 * system prompt asks the model for, straight from the budget context above, so
 * the chat panel stays useful and nothing leaves the process.
 */
function offlineAnalysis(ctx: BudgetContext | null, imageCount: number): string {
  const lines: string[] = []

  if (!ctx) {
    lines.push('Pick a budget period and I\'ll break down spend, revenue and return by channel.')
  }
  else {
    const spent = ctx.channels.reduce((total, c) => total + c.spendCents, 0)
    const revenue = ctx.channels.reduce((total, c) => total + c.revenueCents, 0)
    const users = ctx.channels.reduce((total, c) => total + c.usersAcquired, 0)
    const pace = ctx.budget.totalBudgetCents > 0 ? (spent / ctx.budget.totalBudgetCents) * 100 : 0

    lines.push(
      `${ctx.budget.period} (${ctx.budget.startDate} to ${ctx.budget.endDate}): ${currency(spent)} spent of `
      + `${currency(ctx.budget.totalBudgetCents)} allocated (${pace.toFixed(0)}%), returning ${currency(revenue)} `
      + `and ${count(users)} users acquired.`,
    )

    const ranked = [...ctx.channels].sort((a, b) => roi(b) - roi(a))
    if (ranked.length > 0) {
      lines.push('', 'Return on spend by channel:')
      for (const c of ranked) {
        lines.push(`- ${c.channel}: ${currency(c.spendCents)} spent, ${currency(c.revenueCents)} back (${roi(c).toFixed(2)}x), ${count(c.usersAcquired)} users`)
      }
      const best = ranked[0]
      const worst = ranked[ranked.length - 1]
      if (best && worst && best !== worst) {
        lines.push('', `${best.channel} is carrying this period at ${roi(best).toFixed(2)}x; ${worst.channel} is the weakest at ${roi(worst).toFixed(2)}x and is the first place to move budget away from.`)
      }
    }

    if (ctx.predictions.length > 0) {
      lines.push('', 'Against the saved predictions:')
      for (const p of ctx.predictions) {
        lines.push(`- ${p.period}: ${currency(p.totalBudgetCents)} planned, predicted ${currency(p.predictedRevenueCents)} and ${count(p.predictedUsersAcquired)} users`)
      }
    }
  }

  if (imageCount > 0) {
    lines.push('', `(${imageCount} image${imageCount === 1 ? '' : 's'} received, but reading them needs a live model.)`)
  }

  lines.push('', 'Note: this is the demo build. It answers from the data in front of it rather than calling a model — set ANTHROPIC_API_KEY for real analysis.')

  return lines.join('\n')
}
