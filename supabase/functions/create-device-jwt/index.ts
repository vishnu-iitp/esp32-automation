import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { create } from "https://deno.land/x/djwt@v2.8/mod.ts"
// Import the crypto library to manually create the key
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // This part remains the same
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SPABASE_SERVICE_ROLE_KEY')
    const jwtSecret = Deno.env.get('SPABASE_JWT_SECRET')

    if (!supabaseUrl || !supabaseServiceKey || !jwtSecret) {
      console.error('FATAL: Missing one or more required environment variables.');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: Missing secrets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authorization = req.headers.get('Authorization')
    if (!authorization) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authorization.replace('Bearer ', '')
    )

    if (userError || !user) {
      console.error('User verification failed:', userError)
      return new Response(
        JSON.stringify({ error: 'Invalid or expired authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const now = Math.floor(Date.now() / 1000);
    const fiveYears = 5 * 365 * 24 * 60 * 60;

    const payload = {
      sub: user.id,
      role: 'device_user',
      user_id: user.id,
      iss: 'esp32-device-auth',
      aud: 'esp32-devices',
      exp: now + fiveYears,
      iat: now
    };

    // --- FIX APPLIED HERE ---
    // Manually create a CryptoKey from the raw secret.
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );

    // Pass the newly created CryptoKey to the 'create' function.
    const deviceJwt = await create({ alg: "HS256", typ: "JWT" }, payload, key);
    // --- END OF FIX ---

    return new Response(
      JSON.stringify({ 
        deviceJwt: deviceJwt,
        user_id: user.id,
        expires_at: new Date((now + fiveYears) * 1000).toISOString(),
        issued_at: new Date(now * 1000).toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error("--- FULL ERROR OBJECT ---");
    console.error(error);
    console.error("--- END FULL ERROR OBJECT ---");
    
    const errorMessage = error instanceof Error ? error.message : String(error);

    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})