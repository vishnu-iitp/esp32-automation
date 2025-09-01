// Minimal diagnostic function to test basic functionality
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('=== DIAGNOSTIC FUNCTION START ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('CORS preflight - returning 200');
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Check environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    console.log('Environment check:');
    console.log('- SUPABASE_URL:', supabaseUrl ? 'PRESENT' : 'MISSING');
    console.log('- SUPABASE_ANON_KEY:', supabaseAnonKey ? 'PRESENT' : 'MISSING');
    console.log('- SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'PRESENT' : 'MISSING');
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing required environment variables');
      return new Response(JSON.stringify({ 
        error: 'Missing environment variables',
        details: {
          url: !!supabaseUrl,
          anonKey: !!supabaseAnonKey,
          serviceKey: !!supabaseServiceKey
        }
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Test basic Supabase client creation
    console.log('Creating Supabase client...');
    const authHeader = req.headers.get('Authorization');
    console.log('Auth header present:', !!authHeader);
    
    const supabaseClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      authHeader ? { global: { headers: { Authorization: authHeader } } } : {}
    );
    
    console.log('Supabase client created successfully');

    // Test user authentication
    console.log('Testing user authentication...');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    console.log('User auth result:', !!user, userError?.message || 'no error');
    
    // Test basic database access (just count devices)
    console.log('Testing database access...');
    const { count, error: countError } = await supabaseClient
      .from('devices')
      .select('*', { count: 'exact', head: true });
    
    console.log('Device count result:', count, countError?.message || 'no error');

    // Return diagnostic info
    return new Response(JSON.stringify({ 
      success: true,
      message: 'Diagnostic function working',
      diagnostics: {
        environment: {
          url: !!supabaseUrl,
          anonKey: !!supabaseAnonKey,
          serviceKey: !!supabaseServiceKey
        },
        auth: {
          headerPresent: !!authHeader,
          userAuthenticated: !!user,
          userError: userError?.message || null
        },
        database: {
          deviceCount: count,
          countError: countError?.message || null
        }
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Diagnostic function error:', error);
    return new Response(JSON.stringify({ 
      error: 'Diagnostic function failed',
      details: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
