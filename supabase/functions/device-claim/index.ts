// File: device-claim/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('Device claim function called, method:', req.method);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight request');
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('Processing device claim request');
    
    // Create a Supabase client with the user's authentication context
    const authHeader = req.headers.get('Authorization');
    console.log('Auth header present:', !!authHeader);
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      // Pass the user's authorization header to the client if present
      authHeader ? { global: { headers: { Authorization: authHeader } } } : {}
    );

    // Get the currently authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    console.log('User authentication check:', !!user, userError?.message || 'no error');
    
    if (!user) {
      console.log('User not authenticated');
      return new Response(JSON.stringify({ error: 'User not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse the MAC address from the request body
    const body = await req.json();
    console.log('Request body:', body);
    
    const { mac_address } = body;
    if (!mac_address) {
      console.log('MAC address missing from request');
      return new Response(JSON.stringify({ error: 'MAC address is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizedMac = mac_address.toUpperCase();
    console.log('Looking for device with MAC:', normalizedMac);

    // Find the device in the 'devices' table
    const { data: device, error: findError } = await supabaseClient
      .from('devices')
      .select('id, user_id')
      .eq('mac_address', normalizedMac)
      .single();

    console.log('Device lookup result:', device, findError?.message || 'no error');

    if (findError || !device) {
      console.log('Device not found');
      return new Response(JSON.stringify({ error: 'Device not found. Make sure it is powered on and connected to WiFi.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if the device is already claimed by someone
    if (device.user_id) {
      console.log('Device already claimed by user:', device.user_id);
      return new Response(JSON.stringify({ error: 'This device has already been claimed.' }), {
        status: 409, // HTTP 409 Conflict
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update the device to assign the current user's ID
    console.log('Claiming device for user:', user.id);
    const { error: updateError } = await supabaseClient
      .from('devices')
      .update({ user_id: user.id })
      .eq('mac_address', normalizedMac);

    if (updateError) {
      console.error('Error updating device:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to claim the device.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Delete the device from the 'unclaimed_devices' table
    console.log('Removing device from unclaimed_devices table');
    const { error: deleteError } = await supabaseClient
      .from('unclaimed_devices')
      .delete()
      .eq('mac_address', normalizedMac);
      
    if (deleteError) {
      // This is not a critical failure, as the device is already claimed.
      // Log it for debugging but don't fail the whole request.
      console.error('Warning: Failed to remove device from unclaimed_devices table:', deleteError);
    }

    // Success!
    console.log('Device claimed successfully');
    return new Response(JSON.stringify({ success: true, message: 'Device claimed successfully' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Unexpected error in device-claim function:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
