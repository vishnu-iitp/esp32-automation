import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { create } from "https://deno.land/x/djwt@v2.8/mod.ts"
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get environment variables - using correct spelling
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const jwtSecret = Deno.env.get('SPABASE_JWT_SECRET')
    console.log("--- DEBUGGING ENVIRONMENT VARIABLES ---");
    console.log("Supabase URL Loaded:", !!supabaseUrl);
    console.log("Service Key Loaded:", !!supabaseServiceKey);
    console.log("JWT Secret Loaded:", !!jwtSecret);
    console.log("-------------------------------------");

    if (!supabaseUrl || !supabaseServiceKey || !jwtSecret) {
      console.error('FATAL: Missing one or more required environment variables.');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: Missing secrets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify this is a POST request
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed. Use POST.' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check for authorization header
    const authorization = req.headers.get('Authorization')
    if (!authorization) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body to get device_id
    const requestBody = await req.json()
    const deviceId = requestBody.device_id

    if (!deviceId || typeof deviceId !== 'number') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid device_id in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with service role key for admin operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify the calling user's JWT
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

    // Verify the device exists and is unclaimed
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('id, name, user_id, device_jwt')
      .eq('id', deviceId)
      .single()

    if (deviceError || !device) {
      console.error('Device lookup failed:', deviceError)
      return new Response(
        JSON.stringify({ error: 'Device not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if device is already claimed
    if (device.user_id !== null) {
      return new Response(
        JSON.stringify({ error: 'Device is already claimed by another user' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate a new, long-lived JWT for the device (5 years)
    const now = Math.floor(Date.now() / 1000);
    const fiveYears = 5 * 365 * 24 * 60 * 60;

    const deviceJwtPayload = {
      sub: `device_${deviceId}`,
      role: 'device_role', // This role will be used for RLS policies
      device_id: deviceId,
      user_id: user.id,
      iss: 'esp32-device-auth',
      aud: 'esp32-devices',
      exp: now + fiveYears,
      iat: now
    };

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );

    const deviceJwt = await create({ alg: "HS256", typ: "JWT" }, deviceJwtPayload, key);

    // Update the device record with the user_id and device_jwt
    const { error: updateError } = await supabase
      .from('devices')
      .update({
        user_id: user.id,
        device_jwt: deviceJwt,
        created_at: new Date().toISOString()
      })
      .eq('id', deviceId)

    if (updateError) {
      console.error('Device update failed:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to claim device' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Device ${deviceId} (${device.name}) successfully claimed by user ${user.id}`)

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        message: `Device "${device.name}" claimed successfully`,
        device_id: deviceId,
        device_name: device.name,
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