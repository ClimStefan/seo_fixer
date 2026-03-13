/**
 * app/api/fix/generate/route.js
 *
 * Calls Claude to generate the minimum fix for a given SEO issue.
 * Before calling Claude it checks the user's fix budget.
 * After a successful fix it decrements the budget by 1.
 *
 * POST body:
 *   fileContent  — full source file
 *   filePath     — e.g. "app/blog/page.js"
 *   pageUrl      — the live URL
 *   issue        — full issue object from audit engine
 *   pageHtml     — optional live HTML for context
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { checkFixBudget, decrementFixBudget } from '../../../../lib/fixBudget.js';

const SEMI_AUTO = [
  'missing_h1', 'multiple_h1', 'h1_too_long',
  'missing_alt_text', 'missing_schema',
];

const GUIDANCE_ONLY = ['thin_content', 'noindex_set'];

export async function POST(request) {
const { userId } = await auth();
if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }

  const { fileContent, filePath, pageUrl, issue, pageHtml } = body;
  if (!fileContent || !issue) {
    return NextResponse.json({ error: 'Missing fileContent or issue.' }, { status: 400 });
  }

  // Guidance-only — no Claude call, no budget consumed
  if (GUIDANCE_ONLY.includes(issue.type)) {
    return NextResponse.json({ mode: 'guidance', guidance: getGuidance(issue) });
  }

  // ── Check fix budget before calling Claude ──
  const budget = await checkFixBudget(userId);

  if (budget.noPlan) {
    return NextResponse.json({
      error: 'no_plan',
      message: 'You need an active plan to use auto-fix. Start with the one-time audit for $19.',
    }, { status: 403 });
  }

  if (!budget.allowed) {
    return NextResponse.json({
      error: 'budget_exhausted',
      message: 'You have used all 100 fixes included in your one-time audit. Upgrade to the monthly plan for unlimited fixes.',
      remaining: 0,
    }, { status: 403 });
  }

  const isSemiAuto = SEMI_AUTO.includes(issue.type);
  const prompt = buildPrompt({ fileContent, filePath, pageUrl, issue, pageHtml, isSemiAuto });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 8096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return NextResponse.json({ error: `Claude API error: ${err.error?.message}` }, { status: 502 });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || '';
    const parsed = parseClaudeResponse(raw);

    if (!parsed) {
      return NextResponse.json({ error: 'Could not parse Claude response. Please try again.' }, { status: 500 });
    }

    // ── Decrement budget AFTER successful generation ──
    const newRemaining = await decrementFixBudget(budget.purchase.id);

    return NextResponse.json({
      mode: isSemiAuto ? 'semi-auto' : 'auto',
      fixedContent: parsed.fixedContent,
      explanation: parsed.explanation,
      changesSummary: parsed.changesSummary,
      // Return remaining so UI can update the counter
      remaining: newRemaining,
      isUnlimited: budget.purchase.type === 'monthly',
    });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function buildPrompt({ fileContent, filePath, pageUrl, issue, pageHtml, isSemiAuto }) {
  const trimmedHtml = pageHtml ? pageHtml.slice(0, 4000) : '';

  const issueContext = `
Issue type: ${issue.type}
Issue title: ${issue.title}
Issue description: ${issue.description}
Current value: ${issue.currentValue || 'none'}
Recommendation: ${issue.recommendation}
`.trim();

  const rules = `
RULES — follow these exactly:
1. Return ONLY valid JSON, nothing else. No markdown, no backticks, no explanation outside the JSON.
2. Make the MINIMUM change needed to fix the issue. Do not refactor, reformat, or improve anything else.
3. Preserve all existing code exactly — indentation, quote style, variable names, comments.
4. The fixedContent must be the COMPLETE file — not a diff, not a snippet, the whole file.
5. If you cannot confidently fix the issue without breaking the code, return the original fileContent unchanged and explain why.
`.trim();

  return `You are an expert SEO engineer fixing a specific issue in a web application source file.

${rules}

FILE PATH: ${filePath}
PAGE URL: ${pageUrl}

SEO ISSUE TO FIX:
${issueContext}

PAGE HTML (read-only context):
${trimmedHtml}

SOURCE FILE TO FIX:
\`\`\`
${fileContent}
\`\`\`

${isSemiAuto ? 'This is a semi-automatic fix. Make your best attempt but note in the explanation that the user should review carefully.' : ''}

Return this exact JSON:
{
  "fixedContent": "<complete fixed file as a string>",
  "explanation": "<1-2 sentences explaining what you changed and why>",
  "changesSummary": "<very short e.g. 'Shortened title from 87 to 58 characters'>"
}`;
}

function parseClaudeResponse(raw) {
  let cleaned = raw.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');

  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed.fixedContent) return null;
    return {
      fixedContent: parsed.fixedContent,
      explanation: parsed.explanation || '',
      changesSummary: parsed.changesSummary || 'Fix applied',
    };
  } catch {
    const match = cleaned.match(/\{[\s\S]*"fixedContent"[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (!parsed.fixedContent) return null;
        return {
          fixedContent: parsed.fixedContent,
          explanation: parsed.explanation || '',
          changesSummary: parsed.changesSummary || 'Fix applied',
        };
      } catch { return null; }
    }
    return null;
  }
}

function getGuidance(issue) {
  const guidance = {
    thin_content: {
      title: 'How to fix thin content',
      steps: [
        'Identify the main topic of this page and who it\'s for',
        'Add a clear introduction explaining what the page covers',
        'Include practical details: features, benefits, use cases, or how-to steps',
        'Add an FAQ section answering common questions about this topic',
        'Aim for at least 300 words of meaningful content — not padding',
      ],
      note: 'This cannot be auto-fixed because only you know what content belongs on this page.',
    },
    noindex_set: {
      title: 'This page is blocked from search engines',
      steps: [
        'Check if this page should actually be indexed (landing pages, blog posts, product pages — yes)',
        'If it should be indexed, find the robots meta tag and remove the "noindex" value',
        'If noindex is intentional (thank-you pages, admin pages) — leave it as is',
        'Common places to look: your layout file, _document.js, or the page\'s own <Head> component',
      ],
      note: 'We never remove noindex automatically because it may be intentional.',
    },
  };

  return guidance[issue.type] || {
    title: 'Manual fix required',
    steps: [issue.recommendation],
    note: 'This issue requires manual attention.',
  };
}
