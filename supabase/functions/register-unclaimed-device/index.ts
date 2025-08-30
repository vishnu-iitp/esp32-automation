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
    // Create Supabase client
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // Parse request body
    const { mac_address, device_name = "New ESP32", gpio = 0 } = await req.json();
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
    // Validate MAC address format
    const macRegex = /^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/i;
    if (!macRegex.test(mac_address)) {
      return new Response(JSON.stringify({
        error: 'Invalid MAC address format'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const normalizedMac = mac_address.toUpperCase();
    // Check if device with this MAC already exists in unclaimed_devices (allow multiple devices with same MAC)
    const { data: existingUnclaimed } = await supabaseClient.from('unclaimed_devices').select('*').eq('mac_address', normalizedMac);
    if (existingUnclaimed && existingUnclaimed.length > 0) {
      // Allow multiple devices with same MAC, but return existing record message
      return new Response(JSON.stringify({
        success: true,
        message: 'Device already registered as unclaimed',
        already_exists: true
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Check if device with this MAC and GPIO already exists in devices table
    const { data: existingDevices } = await supabaseClient.from('devices').select('*').eq('mac_address', normalizedMac).eq('gpio', gpio);
    if (existingDevices && existingDevices.length > 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Device already exists in devices table',
        already_exists: true
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Insert into unclaimed_devices table
    const { error: unclaimedError } = await supabaseClient.from('unclaimed_devices').insert({
      mac_address: normalizedMac,
      first_seen: new Date().toISOString()
    });
    if (unclaimedError) {
      console.error('Error inserting into unclaimed_devices:', unclaimedError);
      return new Response(JSON.stringify({
        error: 'Failed to register unclaimed device'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Insert into devices table with null user_id
    const { error: deviceError } = await supabaseClient.from('devices').insert({
      name: device_name,
      gpio: gpio,
      state: 0,
      mac_address: normalizedMac,
      user_id: null,
      device_type: 'outlet',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    if (deviceError) {
      console.error('Error inserting into devices:', deviceError);
      // Cleanup: remove from unclaimed_devices if device insertion failed
      await supabaseClient.from('unclaimed_devices').delete().eq('mac_address', normalizedMac);
      return new Response(JSON.stringify({
        error: 'Failed to register device'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    return new Response(JSON.stringify({
      success: true,
      message: 'Device registered successfully',
      mac_address: normalizedMac
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
