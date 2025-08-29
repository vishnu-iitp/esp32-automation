import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sign } from "https://deno.land/x/djwt@v2.8/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DeviceJWTPayload {
  sub: string;           // user_id as subject
  role: string;          // 'device_user' role for device authentication
  user_id: string;       // explicit user_id for clarity
  iss: string;           // issuer
  aud: string;           // audience
  exp: number;           // expiration timestamp
  iat: number;           // issued at timestamp
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Extract Authorization header to get user identity
    const authorization = req.headers.get('Authorization')
    if (!authorization) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get('SPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SPABASE_SERVICE_ROLE_KEY')
    const jwtSecret = Deno.env.get('SPABASE_JWT_SECRET')

    if (!supabaseUrl || !supabaseServiceKey || !jwtSecret) {
      console.error('Missing required environment variables')
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create Supabase client with service role key to verify user
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get user from JWT token in Authorization header
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authorization.replace('Bearer ', '')
    )

    if (userError || !user) {
      console.error('User verification failed:', userError)
      return new Response(
        JSON.stringify({ error: 'Invalid or expired authorization token' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log(`Creating device JWT for user: ${user.id} (${user.email})`)

    // Generate device JWT with 5-year expiration
    const now = Math.floor(Date.now() / 1000)
    const fiveYears = 5 * 365 * 24 * 60 * 60 // 5 years in seconds

    const payload: DeviceJWTPayload = {
      sub: user.id,                    // Standard JWT subject claim (user_id)
      role: 'device_user',             // Custom role for device authentication
      user_id: user.id,                // Explicit user_id for clarity
      iss: 'esp32-device-auth',        // Issuer identifier
      aud: 'esp32-devices',            // Audience identifier
      exp: now + fiveYears,            // Expiration: 5 years from now
      iat: now                         // Issued at: current timestamp
    }

    // Convert JWT secret from base64 to bytes for signing
    const secretBytes = new TextEncoder().encode(jwtSecret)

    // Sign the JWT using HS256 algorithm
    const deviceJwt = await sign(
      {
        alg: "HS256",
        typ: "JWT",
      },
      payload,
      secretBytes
    )

    console.log('Device JWT created successfully')

    // Return the device JWT
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
    console.error('Error creating device JWT:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
