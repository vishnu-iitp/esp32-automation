import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get the authorization header and extract the JWT
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')

    // Get the user from the JWT
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Parse request body
    const { mac_address } = await req.json()
    
    if (!mac_address) {
      return new Response(
        JSON.stringify({ error: 'MAC address is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Validate MAC address format
    const macRegex = /^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/i
    if (!macRegex.test(mac_address)) {
      return new Response(
        JSON.stringify({ error: 'Invalid MAC address format' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Start a transaction-like operation
    // First, check if device exists in unclaimed_devices table
    const { data: unclaimedDevice, error: unclaimedError } = await supabaseClient
      .from('unclaimed_devices')
      .select('*')
      .eq('mac_address', mac_address.toUpperCase())
      .single()

    if (unclaimedError) {
      console.error('Error checking unclaimed devices:', unclaimedError)
      return new Response(
        JSON.stringify({ error: 'Device not found or already claimed' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Find the device in the devices table with null user_id and matching MAC address
    const { data: device, error: deviceError } = await supabaseClient
      .from('devices')
      .select('*')
      .eq('mac_address', mac_address.toUpperCase())
      .is('user_id', null)
      .single()

    if (deviceError) {
      console.error('Error finding device:', deviceError)
      return new Response(
        JSON.stringify({ error: 'Device not found in devices table' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Update the device to assign it to the user
    const { error: updateError } = await supabaseClient
      .from('devices')
      .update({ 
        user_id: user.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', device.id)

    if (updateError) {
      console.error('Error updating device:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to claim device' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Remove the device from unclaimed_devices table
    const { error: deleteError } = await supabaseClient
      .from('unclaimed_devices')
      .delete()
      .eq('mac_address', mac_address.toUpperCase())

    if (deleteError) {
      console.error('Error removing from unclaimed devices:', deleteError)
      // Don't return error here as the main operation succeeded
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Device claimed successfully',
        device: {
          id: device.id,
          name: device.name,
          mac_address: device.mac_address
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
