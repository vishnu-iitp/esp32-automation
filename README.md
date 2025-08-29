# Supabase Deployment Guide

This guide explains how to deploy your PWA to Supabase Storage and set up the necessary configuration.

## Prerequisites

- A Supabase account and project
- The compiled frontend files from `supabase_frontend/`

## Step 1: Enable Supabase Storage

1. Go to your Supabase project dashboard
2. Navigate to "Storage" in the left sidebar
3. Create a new bucket called "webapp" (or any name you prefer)
4. Make the bucket public by going to bucket settings

## Step 2: Upload Frontend Files

### Option A: Using Supabase Dashboard
1. Go to Storage → your bucket
2. Upload all files from `supabase_frontend/` maintaining the folder structure:
   ```
   webapp/
   ├── index.html
   ├── manifest.json
   ├── service-worker.js
   ├── css/
   │   └── styles.css
   ├── js/
   │   └── app.js
   └── icons/
       └── (your icon files)
   ```

### Option B: Using Supabase CLI
1. Install Supabase CLI: `npm install -g supabase`
2. Login: `supabase login`
3. Link your project: `supabase link --project-ref YOUR_PROJECT_REF`
4. Upload files:
   ```bash
   supabase storage cp ./supabase_frontend/* storage://webapp/ --recursive
   ```

## Step 3: Configure Public Access

1. In Storage, go to your bucket settings
2. Set the bucket to "Public"
3. Note the public URL format: `https://PROJECT_ID.supabase.co/storage/v1/object/public/webapp/`

## Step 4: Set Up Realtime (If Required)

1. Go to "Database" → "Replication"
2. Ensure Realtime is enabled for your project
3. The WebSocket endpoint will be: `wss://PROJECT_ID.supabase.co/realtime/v1/websocket`

## Step 5: Test Your Deployment

1. Open your public URL: `https://PROJECT_ID.supabase.co/storage/v1/object/public/webapp/index.html`
2. Configure the app with your Supabase credentials
3. Test the connection status

## Alternative Deployment Options

### Netlify
1. Create a new site from the `supabase_frontend` folder
2. Deploy and note the URL
3. Configure your ESP32 with the Netlify URL if needed

### Vercel
1. Install Vercel CLI: `npm install -g vercel`
2. Run `vercel` in the `supabase_frontend` directory
3. Follow the deployment prompts

### GitHub Pages
1. Create a GitHub repository
2. Upload the `supabase_frontend` files
3. Enable GitHub Pages in repository settings
4. Access via `https://username.github.io/repository-name`

## Custom Domain (Optional)

1. In Supabase dashboard, go to Settings → General
2. Add your custom domain
3. Configure DNS records as instructed
4. Update ESP32 configuration if using a custom domain

## Security Considerations

- Keep your Supabase anon key secure (it's public but has limited permissions)
- Consider implementing Row Level Security (RLS) for additional protection
- Monitor usage in Supabase dashboard

## Troubleshooting

### CORS Issues
If you encounter CORS errors:
1. Ensure your domain is added to Supabase allowed origins
2. Check that files are served with correct MIME types

### Service Worker Issues
If PWA features don't work:
1. Ensure HTTPS is enabled
2. Check that all paths in service-worker.js are correct
3. Clear browser cache and reload

### Storage Access Issues
If files don't load:
1. Verify bucket is public
2. Check file permissions
3. Ensure correct bucket name in URLs
