/**
 * app/api/fix/generate/route.js
 *
 * The brain of the auto-fix system. Takes the current file content
 * and the issue details, sends both to Claude, and gets back the
 * fixed file — with ONLY the minimum change needed to fix the issue.
 *
 * Key design principle: Claude must make the smallest possible change.
 * We never want it rewriting the whole file or "improving" things
 * that weren't broken. The prompt is written very defensively to
 * enforce this.
 *
 * For semi-auto issues (H1, alt text, schema) Claude returns a fix
 * plus a plain-English explanation of what it changed and why,
 * so the user can make an informed decision in the diff viewer.
 *
 * POST body:
 *   fileContent  — full source file as a string
 *   filePath     — e.g. "app/blog/page.js" (used for context)
 *   pageUrl      — the live URL (used for context)
 *   issue        — the full issue object from the audit engine
 *   pageHtml     — the rendered HTML of the page (for alt text / content context)
 */

import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/session.js';

// Issue types that Claude can fix fully automatically
const FULLY_AUTO = [
  'missing_title',
  'title_too_long',
  'title_too_short',
  'missing_meta_description',
  'meta_description_too_long',
  'meta_description_too_short',
  'missing_viewport',
  'missing_html_lang',
  'missing_og_tags',
];

// Issue types that need a fix + human review of the suggestion
const SEMI_AUTO = [
  'missing_h1',
  'multiple_h1',
  'h1_too_long',
  'missing_alt_text',
  'missing_schema',
];

// Issue types where we give guidance only
const GUIDANCE_ONLY = [
  'thin_content',
  'noindex_set',
];

export async function POST(request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }

  const { fileContent, filePath, pageUrl, issue, pageHtml } = body;

  if (!fileContent || !issue) {
    return NextResponse.json({ error: 'Missing fileContent or issue.' }, { status: 400 });
  }

  // Guidance-only issues — no Claude call needed, return static guidance
  if (GUIDANCE_ONLY.includes(issue.type)) {
    return NextResponse.json({
      mode: 'guidance',
      guidance: getGuidance(issue),
    });
  }

  const isSemiAuto = SEMI_AUTO.includes(issue.type);

  // Build the prompt based on the issue type
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

    // Parse Claude's response — it returns JSON with fixedContent + explanation
    const parsed = parseClaudeResponse(raw);
    if (!parsed) {
      return NextResponse.json({ error: 'Could not parse Claude response. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({
      mode: isSemiAuto ? 'semi-auto' : 'auto',
      fixedContent: parsed.fixedContent,
      explanation: parsed.explanation,
      changesSummary: parsed.changesSummary,
    });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────
// PROMPT BUILDER
// ─────────────────────────────────────────

function buildPrompt({ fileContent, filePath, pageUrl, issue, pageHtml, isSemiAuto }) {
  // Trim HTML to avoid massive token usage — we only need the <head> and first 2000 chars of body
  const trimmedHtml = pageHtml
    ? pageHtml.slice(0, 4000)
    : '';

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
3. Preserve all existing code exactly — indentation, quotes style, variable names, comments.
4. The fixedContent must be the COMPLETE file — not a diff, not a snippet, the whole file.
5. If you cannot confidently fix the issue without breaking the code, return the original fileContent unchanged and explain why in the explanation field.
`.trim();

  const jsonSchema = `
Return this exact JSON structure:
{
  "fixedContent": "<the complete fixed file as a string>",
  "explanation": "<1-2 sentences explaining what you changed and why>",
  "changesSummary": "<very short summary e.g. 'Shortened title from 87 to 58 characters'>"
}
`.trim();

  return `You are an expert SEO engineer fixing a specific issue in a web application source file.

${rules}

FILE PATH: ${filePath}
PAGE URL: ${pageUrl}

SEO ISSUE TO FIX:
${issueContext}

PAGE HTML (for context — do not modify this, it's read-only):
${trimmedHtml}

SOURCE FILE TO FIX:
\`\`\`
${fileContent}
\`\`\`

${isSemiAuto ? 'This is a semi-automatic fix. Make your best attempt but note in the explanation that the user should review the generated content carefully.' : ''}

${jsonSchema}`;
}

// ─────────────────────────────────────────
// RESPONSE PARSER
// ─────────────────────────────────────────

function parseClaudeResponse(raw) {
  // Claude should return pure JSON but sometimes wraps in backticks
  let cleaned = raw.trim();

  // Strip markdown code fences if present
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed.fixedContent) return null;
    return {
      fixedContent: parsed.fixedContent,
      explanation: parsed.explanation || '',
      changesSummary: parsed.changesSummary || 'Fix applied',
    };
  } catch {
    // Try to extract JSON from within the text
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
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ─────────────────────────────────────────
// GUIDANCE TEXT FOR USER-ONLY ISSUES
// ─────────────────────────────────────────

function getGuidance(issue) {
  const guidance = {
    thin_content: {
      title: 'How to fix thin content',
      steps: [
        'Identify the main topic of this page and who it\'s for',
        'Add a clear introduction that explains what the page covers',
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
        'If it should be indexed, find the robots meta tag in your file and remove the "noindex" value',
        'If noindex is intentional (thank-you pages, admin pages, staging) — leave it as is',
        'Common places to look: your layout file, _document.js, or the page\'s own <Head> component',
      ],
      note: 'This requires your decision — we never remove noindex automatically because it may be intentional.',
    },
  };

  return guidance[issue.type] || {
    title: 'Manual fix required',
    steps: [issue.recommendation],
    note: 'This issue requires manual attention.',
  };
}
