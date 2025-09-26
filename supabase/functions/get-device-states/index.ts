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
    // Create Supabase client with service role key for ESP32 access
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // Parse request body
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
    const normalizedMac = mac_address.toUpperCase();
    // Check if device exists and is claimed
    // Use limit(1) instead of single() to handle multiple devices with same MAC
    const { data: deviceList, error: deviceError } = await supabaseClient.from('devices').select('id, user_id, name, mac_address').eq('mac_address', normalizedMac).limit(1);
    if (deviceError || !deviceList || deviceList.length === 0) {
      return new Response(JSON.stringify({
        error: 'Device not found'
      }), {
        status: 404,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const device = deviceList[0];
    // Check if device is claimed
    if (!device.user_id) {
      return new Response(JSON.stringify({
        success: true,
        claimed: false,
        message: 'Device is not claimed yet',
        devices: []
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Fetch all devices for the same user that have the same MAC address
    // This handles the case where one ESP32 controls multiple devices
    const { data: devices, error: devicesError } = await supabaseClient.from('devices').select('id, name, gpio, state, device_type, mac_address').eq('mac_address', normalizedMac).eq('user_id', device.user_id).order('gpio', {
      ascending: true
    });
    if (devicesError) {
      console.error('Error fetching devices:', devicesError);
      return new Response(JSON.stringify({
        error: 'Failed to fetch device states'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Return the device states
    return new Response(JSON.stringify({
      success: true,
      claimed: true,
      device_count: devices.length,
      devices: devices.map((d)=>({
          id: d.id,
          name: d.name,
          gpio: d.gpio,
          state: d.state,
          device_type: d.device_type
        }))
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
