import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY ?? '';
const ASSEMBLYAI_API_URL = 'https://api.assemblyai.com';
const ASSEMBLYAI_LLM_URL = 'https://llm-gateway.assemblyai.com/v1/chat/completions';
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const MAX_POLLS = 45;
const POLL_DELAY_MS = 1500;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readAssemblyResponse(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

async function assemblyFetch(url: string, init: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: ASSEMBLYAI_API_KEY,
      ...(init.headers ?? {}),
    },
  });
  const body = await readAssemblyResponse(res);
  if (!res.ok) {
    const message = body?.error?.message ?? body?.error ?? `AssemblyAI request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

async function transcribeAudio(audio: File) {
  const audioBuffer = await audio.arrayBuffer();

  const upload = await assemblyFetch(`${ASSEMBLYAI_API_URL}/v2/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: audioBuffer,
  });

  const transcript = await assemblyFetch(`${ASSEMBLYAI_API_URL}/v2/transcript`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audio_url: upload.upload_url,
      language_detection: true,
      punctuate: true,
      format_text: true,
    }),
  });

  for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
    const latest = await assemblyFetch(`${ASSEMBLYAI_API_URL}/v2/transcript/${transcript.id}`, {
      method: 'GET',
    });

    if (latest.status === 'completed') {
      return {
        transcriptId: latest.id,
        text: String(latest.text ?? '').trim(),
      };
    }

    if (latest.status === 'error') {
      throw new Error(latest.error ?? 'AssemblyAI transcription failed');
    }

    await sleep(POLL_DELAY_MS);
  }

  throw new Error('Transcription is taking longer than expected. Please try a shorter recording.');
}

async function simplifyTone(transcriptId: string, transcriptText: string) {
  try {
    const result = await assemblyFetch(ASSEMBLYAI_LLM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        transcript_id: transcriptId,
        messages: [
          {
            role: 'system',
            content: 'You rewrite spoken task notes into clear, simple, professional notes for an internal task manager.',
          },
          {
            role: 'user',
            content: [
              'Rewrite this transcript into simple task notes.',
              'Keep the meaning, remove filler words, fix grammar, and keep it concise.',
              'Use plain language. Do not add details that were not spoken.',
              '',
              '{{ transcript }}',
            ].join('\n'),
          },
        ],
        max_tokens: 350,
        temperature: 0.2,
      }),
    });

    const simplified = String(result?.choices?.[0]?.message?.content ?? '').trim();
    return simplified || transcriptText;
  } catch (err) {
    console.error('AssemblyAI LLM tone rewrite failed', err);
    return transcriptText;
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  if (!ASSEMBLYAI_API_KEY) {
    return NextResponse.json({ success: false, error: 'AssemblyAI API key is not configured' }, { status: 500 });
  }

  try {
    const form = await req.formData();
    const audio = form.get('audio');

    if (!(audio instanceof File)) {
      return NextResponse.json({ success: false, error: 'Audio recording is required' }, { status: 400 });
    }

    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ success: false, error: 'Recording is too large. Please keep it under 12 MB.' }, { status: 400 });
    }

    const transcript = await transcribeAudio(audio);
    if (!transcript.text) {
      return NextResponse.json({ success: false, error: 'No speech was detected in the recording' }, { status: 400 });
    }

    const notes = await simplifyTone(transcript.transcriptId, transcript.text);

    return NextResponse.json({
      success: true,
      data: {
        transcript: transcript.text,
        notes,
      },
    });
  } catch (err: any) {
    console.error('POST /api/voice-notes error', err);
    return NextResponse.json({ success: false, error: err.message ?? 'Failed to transcribe voice note' }, { status: 500 });
  }
}
