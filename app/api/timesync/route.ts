import { NextResponse } from 'next/server';

// ✅ SURGICAL FIX: Strictly disable Next.js caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  return NextResponse.json({ serverTime: Date.now() });
}