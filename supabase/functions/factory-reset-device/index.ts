// File: supabase/functions/factory-reset-device/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { mac_address } = await req.json();

    if (!mac_address) {
      return new Response(JSON.stringify({ error: 'MAC address is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizedMac = mac_address.toUpperCase();

    // Reset the user_id for the device
    const { error: updateError } = await supabaseClient
      .from('devices')
      .update({ user_id: null })
      .eq('mac_address', normalizedMac);

    if (updateError) {
      throw updateError;
    }

    // Add the device back to the unclaimed_devices table
    const { error: insertError } = await supabaseClient
      .from('unclaimed_devices')
      .upsert({ mac_address: normalizedMac, first_seen: new Date().toISOString() });

    if (insertError) {
      // Not a critical failure, but log it
      console.error('Failed to re-add to unclaimed_devices:', insertError);
    }

    return new Response(JSON.stringify({ success: true, message: 'Device has been reset' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
