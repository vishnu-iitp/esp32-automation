# Multi-User ESP32 Home Automation - Supabase Setup Guide

This guide will walk you through setting up Supabase for the multi-user ESP32 home automation system.

## Prerequisites

- A Supabase account (free tier is sufficient)
- Supabase CLI installed (optional but recommended)
- Basic understanding of SQL

## Part 1: Project Setup

### 1. Create a New Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Choose your organization
4. Enter project details:
   - **Name**: ESP32 Home Automation
   - **Database Password**: Choose a strong password
   - **Region**: Select the closest region to your location
5. Click "Create new project"
6. Wait for the project to be provisioned (2-3 minutes)

### 2. Get Project Credentials

Once your project is ready:

1. Go to **Settings** → **API**
2. Note down these values (you'll need them later):
   - **Project URL**: `https://your-project-id.supabase.co`
   - **Project ID**: `your-project-id`
   - **anon public key**: `eyJhbGciOiJIUzI1NiI...` (starts with eyJ)
   - **service_role key**: `eyJhbGciOiJIUzI1NiI...` (different from anon key)

## Part 2: Database Schema Setup

### 1. Enable Authentication

1. Go to **Authentication** → **Settings**
2. Under **Site URL**, add your domain (for local development, use `http://localhost:3000`)
3. Under **Auth Providers**, ensure **Email** is enabled
4. Optionally configure email templates under **Auth** → **Templates**

### 2. Create Database Tables

Go to **SQL Editor** and run these commands one by one:

#### Create profiles table (auto-populated on user signup)

```sql
-- Create profiles table
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policy for profiles (users can only see their own profile)
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);
```

#### Modify the existing devices table

```sql
-- Add user_id column to existing devices table
ALTER TABLE public.devices ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add mac_address column for device identification
ALTER TABLE public.devices ADD COLUMN mac_address TEXT;

-- Create index for better performance
CREATE INDEX idx_devices_user_id ON public.devices(user_id);
CREATE INDEX idx_devices_mac_address ON public.devices(mac_address);

-- Enable RLS on devices table
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for devices table
CREATE POLICY "Users can view own devices" ON public.devices
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own devices" ON public.devices
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own devices" ON public.devices
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own devices" ON public.devices
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow unclaimed devices (where user_id is NULL) to be inserted by anyone
CREATE POLICY "Allow unclaimed device insertion" ON public.devices
    FOR INSERT WITH CHECK (user_id IS NULL);

-- Allow updating unclaimed devices for claiming purposes
CREATE POLICY "Allow claiming unclaimed devices" ON public.devices
    FOR UPDATE USING (user_id IS NULL);
```

#### Create unclaimed_devices table

```sql
-- Create unclaimed_devices table
CREATE TABLE public.unclaimed_devices (
    mac_address TEXT PRIMARY KEY,
    first_seen TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (but allow public read for Edge Functions)
ALTER TABLE public.unclaimed_devices ENABLE ROW LEVEL SECURITY;

-- Allow Edge Functions to manage unclaimed devices
CREATE POLICY "Allow service role to manage unclaimed devices" ON public.unclaimed_devices
    FOR ALL USING (auth.role() = 'service_role');
```

#### Create auto-profile creation trigger

```sql
-- Function to automatically create a profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function when a new user is created
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## Part 3: Edge Functions Setup

### 1. Install Supabase CLI (if not already installed)

```bash
# Windows (using Chocolatey)
choco install supabase

# macOS (using Homebrew)
brew install supabase/tap/supabase

# Or download directly from GitHub releases
```

### 2. Login and Link Project

```bash
# Login to Supabase
supabase login

# Navigate to your project directory
cd path/to/your/project

# Link to your Supabase project
supabase link --project-ref your-project-id
```

### 3. Deploy Edge Functions

The Edge Functions are already created in your project. Deploy them:

```bash
# Deploy claim-device function
supabase functions deploy claim-device

# Deploy register-unclaimed-device function
supabase functions deploy register-unclaimed-device
```

### 4. Set Environment Variables (if needed)

If you need to set additional environment variables for your Edge Functions:

```bash
# Set environment variables
supabase secrets set SOME_API_KEY=your_api_key_here
```

## Part 4: Configure Your Frontend Application

### 1. Update Supabase Configuration

In your frontend application, update the Supabase configuration:

1. Open the app in your browser
2. Click the **Settings** button
3. Enter your Supabase credentials:
   - **Supabase Project URL**: `https://your-project-id.supabase.co`
   - **Supabase Anon Key**: Your anon public key from Step 1.2
4. Click **Save Settings**

### 2. Test Authentication

1. Click **Sign Up** to create a new account
2. Enter an email, password, and username
3. Check your email for verification (if email confirmation is enabled)
4. Sign in with your credentials

## Part 5: ESP32 Configuration

### 1. Update ESP32 Firmware

1. Open the `HomeAutomationESP32.ino` file
2. Update these configuration values:
   ```cpp
   const char* WIFI_SSID = "your_wifi_ssid";
   const char* WIFI_PASSWORD = "your_wifi_password";
   const char* SUPABASE_PROJECT_ID = "your-project-id";
   const char* SUPABASE_ANON_KEY = "your_anon_key_here";
   ```
3. Upload the firmware to your ESP32

### 2. Test Device Registration

1. Power on your ESP32
2. Check the Serial Monitor - you should see:
   ```
   Device MAC Address: AA:BB:CC:DD:EE:FF
   Device claimed status: UNCLAIMED
   Setting up unclaimed device...
   Registering unclaimed device...
   ```

## Part 6: Testing the Complete System

### 1. Test Device Claiming

1. In the web app, click **Claim Device**
2. Enter your ESP32's MAC address (visible in Serial Monitor)
3. Click **Claim Device**
4. The device should appear in your dashboard
5. Your ESP32 should reboot and show "CLAIMED" status

### 2. Test Device Control

1. Try toggling a device from the web interface
2. Check that the corresponding GPIO pin changes state on your ESP32
3. Test voice commands: "Turn on light 1", "Turn off all devices"

## Part 7: Database Verification

### 1. Check Tables in Supabase Dashboard

Go to **Table Editor** and verify:

1. **profiles table**: Should have entries for registered users
2. **devices table**: Should show devices with `user_id` populated for claimed devices
3. **unclaimed_devices table**: Should be empty after devices are claimed

### 2. Test Row Level Security

1. Create a second user account
2. Verify that users can only see their own devices
3. Test that device control only works for owned devices

## Part 8: Production Considerations

### 1. Security Hardening

```sql
-- Remove the broad unclaimed device policies and replace with more restrictive ones
DROP POLICY IF EXISTS "Allow unclaimed device insertion" ON public.devices;
DROP POLICY IF EXISTS "Allow claiming unclaimed devices" ON public.devices;

-- Create more restrictive policies
CREATE POLICY "Edge functions can insert unclaimed devices" ON public.devices
    FOR INSERT WITH CHECK (auth.role() = 'service_role' AND user_id IS NULL);

CREATE POLICY "Edge functions can claim devices" ON public.devices
    FOR UPDATE USING (auth.role() = 'service_role' OR auth.uid() = user_id);
```

### 2. Email Configuration

1. Go to **Authentication** → **Settings**
2. Configure SMTP settings for production email delivery
3. Customize email templates

### 3. Domain Configuration

1. Add your production domain to **Authentication** → **Settings** → **Site URL**
2. Update CORS settings if needed

## Troubleshooting

### Common Issues

1. **Authentication errors**: Check that RLS policies are correctly set up
2. **Device not appearing**: Verify MAC address format and Edge Function logs
3. **WebSocket connection issues**: Check Supabase project status and network connectivity
4. **ESP32 not connecting**: Verify WiFi credentials and Supabase configuration

### Debugging

1. **Frontend**: Check browser console for errors
2. **Backend**: Use Supabase Logs to debug Edge Functions
3. **ESP32**: Monitor Serial output for connection status and errors

### Support

- Supabase Documentation: [docs.supabase.com](https://docs.supabase.com)
- Community Support: [github.com/supabase/supabase/discussions](https://github.com/supabase/supabase/discussions)

## Summary

You now have a complete multi-user ESP32 home automation system with:

✅ User authentication and authorization  
✅ Device claiming system  
✅ Real-time device control  
✅ Row Level Security  
✅ ESP32 firmware with multi-user support  
✅ Edge Functions for device management  

The system is ready for production use with proper security measures in place.
