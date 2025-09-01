// Device claim function using service role key to bypass RLS
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('=== DEVICE CLAIM FUNCTION START (SERVICE ROLE) ===');
  console.log('Method:', req.method);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('CORS preflight - returning 200');
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('=== STEP 1: Environment Check ===');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    console.log('Environment variables present:');
    console.log('- SUPABASE_URL:', !!supabaseUrl);
    console.log('- SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey);
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing environment variables');
      return new Response(JSON.stringify({ 
        error: 'Server configuration error - missing environment variables' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log('=== STEP 2: Create Supabase Clients ===');
    
    // Client for user authentication (using anon key + auth header)
    const authHeader = req.headers.get('Authorization');
    console.log('Auth header present:', !!authHeader);
    
    const userClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      authHeader ? { global: { headers: { Authorization: authHeader } } } : {}
    );
    
    // Client for database operations (using service key to bypass RLS)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    
    console.log('Supabase clients created successfully');

    console.log('=== STEP 3: Check User Authentication ===');
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    console.log('User authentication result:', !!user, userError?.message || 'no error');
    
    if (!user) {
      console.log('User not authenticated - returning 401');
      return new Response(JSON.stringify({ error: 'User not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log('User authenticated successfully, ID:', user.id);

    console.log('=== STEP 4: Parse Request Body ===');
    const body = await req.json();
    console.log('Request body received:', body);
    
    const { mac_address } = body;
    if (!mac_address) {
      console.log('MAC address missing from request');
      return new Response(JSON.stringify({ error: 'MAC address is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizedMac = mac_address.toUpperCase();
    console.log('Normalized MAC address:', normalizedMac);

    console.log('=== STEP 5: Lookup Device (using admin client) ===');
    const { data: device, error: findError } = await adminClient
      .from('devices')
      .select('id, user_id')
      .eq('mac_address', normalizedMac)
      .single();

    console.log('Device lookup result:');
    console.log('- Device found:', !!device);
    console.log('- Device data:', device);
    console.log('- Lookup error:', findError?.message || 'no error');

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
      console.log('Device not found - returning 404');
      return new Response(JSON.stringify({ error: 'Device not found. Make sure it is powered on and connected to WiFi.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('=== STEP 6: Check if Device Already Claimed ===');
    if (device.user_id) {
      console.log('Device already claimed by user:', device.user_id);
      return new Response(JSON.stringify({ error: 'This device has already been claimed.' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('=== STEP 7: Claim Device (using admin client) ===');
    const { error: updateError } = await adminClient
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
    console.log('Device claimed successfully for user:', user.id);

    console.log('=== STEP 8: Remove from Unclaimed Devices (using admin client) ===');
    const { error: deleteError } = await adminClient
      .from('unclaimed_devices')
      .delete()
      .eq('mac_address', normalizedMac);
      
    if (deleteError) {
      console.error('Warning: Failed to remove device from unclaimed_devices table:', deleteError);
      // Not a critical failure
    } else {
      console.log('Removed device from unclaimed_devices table');
    }

    console.log('=== SUCCESS: Device Claim Complete ===');
    return new Response(JSON.stringify({ success: true, message: 'Device claimed successfully' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('=== UNEXPECTED ERROR ===');
    console.error('Error details:', error);
    console.error('Error stack:', error.stack);
    return new Response(JSON.stringify({ 
      error: 'Internal server error: ' + error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
