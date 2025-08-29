const CACHE_NAME = 'smart-home-v1.1.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/manifest.json',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png',
  'https://unpkg.com/@supabase/supabase-js@2'
];

// Install service worker and cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('Cache installation failed:', error);
      })
  );
});

// Fetch event - serve from cache when possible
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        if (response) {
          return response;
        }
        
        // Clone the request because it can only be used once
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest).then((response) => {
          // Check if we received a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clone the response because it can only be used once
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
          
          return response;
        });
      })
      .catch(() => {
        // Return offline page or fallback
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      })
  );
});

// Activate service worker and clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Handle background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'device-control') {
    event.waitUntil(handleBackgroundSync());
  }
});

// Handle push notifications (for future use)
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'Smart Home notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    },
    actions: [
      {
        action: 'explore',
        title: 'Open App',
        icon: '/icons/icon-192x192.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/icons/icon-192x192.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Smart Home Control', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Background sync handler
async function handleBackgroundSync() {
  try {
    // Handle any queued device control actions
    console.log('Background sync triggered');
    
    // Get offline actions from IndexedDB or localStorage
    const offlineActions = JSON.parse(localStorage.getItem('offlineActions') || '[]');
    
    for (const action of offlineActions) {
      try {
        // Retry the failed network requests
        const response = await fetch(action.url, action.options);
        if (response.ok) {
          console.log('Offline action synced successfully:', action);
        }
      } catch (error) {
        console.error('Failed to sync offline action:', action, error);
      }
    }
    
    // Clear processed offline actions
    localStorage.setItem('offlineActions', '[]');
    
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Update notification
self.addEventListener('updatefound', () => {
  const newWorker = self.registration.installing;
  newWorker.addEventListener('statechange', () => {
    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
      // New content available
      self.registration.showNotification('Update Available', {
        body: 'A new version of Smart Home Control is available. Refresh to update.',
        icon: '/icons/icon-192x192.png',
        tag: 'update-available',
        requireInteraction: true,
        actions: [
          {
            action: 'update',
            title: 'Update Now'
          },
          {
            action: 'dismiss',
            title: 'Later'
          }
        ]
      });
    }
  });
});
