import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MARINE_API_BASE = "https://development.effimove.in/marine/api/v1";
const MARINE_API_KEY = "effimove@2026";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const endpoint = url.searchParams.get('endpoint');
    
    if (!endpoint) {
      return new Response(
        JSON.stringify({ error: 'Missing endpoint parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build the external API URL with query params
    const params = new URLSearchParams();
    url.searchParams.forEach((value, key) => {
      if (key !== 'endpoint') {
        params.append(key, value);
      }
    });

    const apiUrl = `${MARINE_API_BASE}${endpoint}${params.toString() ? '?' + params.toString() : ''}`;
    
    console.log('Calling Marine API:', req.method, apiUrl);

    // Support both GET and POST methods
    const fetchOptions: RequestInit = {
      method: req.method === 'POST' ? 'POST' : 'GET',
      headers: {
        'API-Key': MARINE_API_KEY,
        'Content-Type': 'application/json',
      },
    };

    // Forward request body for POST requests
    if (req.method === 'POST') {
      const body = await req.text();
      if (body) {
        fetchOptions.body = body;
      }
    }

    const response = await fetch(apiUrl, fetchOptions);
    const data = await response.json();

    return new Response(
      JSON.stringify(data),
      { 
        status: response.status, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error: unknown) {
    console.error('Marine API proxy error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
