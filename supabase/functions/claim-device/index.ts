import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // Create a Supabase client with the user's auth token
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization')
        }
      }
    });
    // 1. Get the user from the auth token
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({
        error: 'Unauthorized user'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // 2. Parse the MAC address from the request body
    const { mac_address } = await req.json();
    if (!mac_address) {
      return new Response(JSON.stringify({
        error: 'MAC address is required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const normalizedMac = mac_address.trim().toUpperCase();
    // 3. Find an unclaimed device in the 'devices' table
    const { data: devices, error: findError } = await supabaseClient.from('devices').select('id, user_id').eq('mac_address', normalizedMac);
    if (findError || !devices || devices.length === 0) {
      return new Response(JSON.stringify({
        error: 'Device not found. Make sure the ESP32 is online and has registered itself.'
      }), {
        status: 404,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    
    // Find the first unclaimed device (user_id is null)
    const unclaimedDevice = devices.find(d => !d.user_id);
    if (!unclaimedDevice) {
      // Check if any device is already claimed by the current user
      const userDevice = devices.find(d => d.user_id === user.id);
      if (userDevice) {
        return new Response(JSON.stringify({
          error: 'You have already claimed a device with this MAC address.'
        }), {
          status: 409,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      
      return new Response(JSON.stringify({
        error: 'All devices with this MAC address have already been claimed by other users.'
      }), {
        status: 409,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // 5. Update the specific unclaimed device with the current user's ID
    const { error: updateError } = await supabaseClient.from('devices').update({
      user_id: user.id,
      updated_at: new Date().toISOString()
    }).eq('id', unclaimedDevice.id);
    if (updateError) {
      console.error('Error updating device:', updateError);
      return new Response(JSON.stringify({
        error: 'Failed to claim device in database.'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // 6. Clean up the unclaimed_devices table
    const { error: cleanupError } = await supabaseClient
      .from('unclaimed_devices')
      .delete()
      .eq('mac_address', normalizedMac);

    if (cleanupError) {
      console.warn('Warning: Failed to cleanup unclaimed_devices table:', cleanupError);
      // Don't fail the entire operation for cleanup issues
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Device claimed successfully!'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
