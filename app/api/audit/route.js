import { NextResponse } from 'next/server';
import { auditUrl } from '../../../lib/audit';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body. Expected JSON with a "url" field.' },
      { status: 400 }
    );
  }

  const { url } = body;

  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    return NextResponse.json(
      { error: 'Please provide a URL to audit.' },
      { status: 400 }
    );
  }

  const cleaned = url.trim().replace(/^https?:\/\//, '');
  if (!cleaned.includes('.') || cleaned.length < 4) {
    return NextResponse.json(
      { error: "That doesn't look like a valid URL. Try something like 'example.com' or 'https://example.com'." },
      { status: 400 }
    );
  }

  const result = await auditUrl(url);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json(result, { status: 200 });
}
