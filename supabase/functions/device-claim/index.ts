// File: device-claim/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create a Supabase client with the user's authentication context
    const authHeader = req.headers.get('Authorization');
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      authHeader ? { global: { headers: { Authorization: authHeader } } } : {}
    );

    // Get the currently authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse the MAC address from the request body
    const { mac_address } = await req.json();
    if (!mac_address) {
      return new Response(JSON.stringify({ error: 'MAC address is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizedMac = mac_address.toUpperCase();

    // Find the device in the 'devices' table
    const { data: device, error: findError } = await supabaseClient
      .from('devices')
      .select('id, user_id')
      .eq('mac_address', normalizedMac)
      .maybeSingle();

    if (findError) {
      console.error('Database error during device lookup:', findError);
      return new Response(JSON.stringify({ 
        error: 'Database error: ' + findError.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!device) {
      return new Response(JSON.stringify({ error: 'Device not found. Make sure it is powered on and connected to WiFi.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if the device is already claimed by someone
    if (device.user_id) {
      return new Response(JSON.stringify({ error: 'This device has already been claimed.' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update the device to assign the current user's ID
    const { error: updateError } = await supabaseClient
      .from('devices')
      .update({ user_id: user.id })
      .eq('mac_address', normalizedMac);

    if (updateError) {
      console.error('Error updating device:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to claim the device: ' + updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Remove the device from the 'unclaimed_devices' table
    const { error: deleteError } = await supabaseClient
      .from('unclaimed_devices')
      .delete()
      .eq('mac_address', normalizedMac);
      
    if (deleteError) {
      // Not a critical failure, log but don't fail the request
      console.error('Warning: Failed to remove device from unclaimed_devices table:', deleteError);
    }

    // Success!
    return new Response(JSON.stringify({ success: true, message: 'Device claimed successfully' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Unexpected error in device-claim function:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error: ' + error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
