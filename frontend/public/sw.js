const CACHE_NAME = 'healthcare-drips-v1';
const STATIC_CACHE = 'healthcare-drips-static-v1';
const DYNAMIC_CACHE = 'healthcare-drips-dynamic-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('Service Worker: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('Service Worker: Deleting old cache', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip external requests (API calls, etc.)
  if (url.origin !== location.origin) {
    return;
  }
  
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        // Return cached version if available
        if (cachedResponse) {
          // For HTML files, try network first to get fresh content
          if (request.destination === 'document') {
            fetchAndCache(request);
            return cachedResponse;
          }
          return cachedResponse;
        }
        
        // Otherwise, fetch from network and cache
        return fetchAndCache(request);
      })
      .catch(() => {
        // Offline fallback for HTML requests
        if (request.destination === 'document') {
          return caches.match('/index.html');
        }
        
        // Offline fallback for images
        if (request.destination === 'image') {
          return new Response('Offline - Image not available', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        }
      })
  );
});

// Helper function to fetch and cache resources
const fetchAndCache = (request) => {
  return fetch(request)
    .then((response) => {
      // Check if we received a valid response
      if (!response || response.status !== 200 || response.type !== 'basic') {
        return response;
      }
      
      // Clone the response since it can only be consumed once
      const responseToCache = response.clone();
      
      // Determine which cache to use
      const cacheName = request.destination === 'document' ? DYNAMIC_CACHE : STATIC_CACHE;
      
      caches.open(cacheName)
        .then((cache) => {
          cache.put(request, responseToCache);
        });
      
      return response;
    });
};

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

const doBackgroundSync = async () => {
  // Get all pending actions from IndexedDB
  const pendingActions = await getPendingActions();
  
  for (const action of pendingActions) {
    try {
      // Retry the action
      await fetch(action.url, {
        method: action.method,
        headers: action.headers,
        body: action.body
      });
      
      // Remove from pending actions if successful
      await removePendingAction(action.id);
    } catch (error) {
      console.error('Background sync failed for action:', action, error);
    }
  }
};

// Push notifications
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'New notification from Healthcare Drips',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Explore',
        icon: '/icons/icon-96x96.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/icons/icon-96x96.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('Healthcare Drips', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// IndexedDB helpers for offline actions
const getPendingActions = async () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('HealthcareDripsDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['pendingActions'], 'readonly');
      const store = transaction.objectStore('pendingActions');
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => resolve(getAllRequest.result);
      getAllRequest.onerror = () => reject(getAllRequest.error);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      db.createObjectStore('pendingActions', { keyPath: 'id', autoIncrement: true });
    };
  });
};

const removePendingAction = async (id) => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('HealthcareDripsDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['pendingActions'], 'readwrite');
      const store = transaction.objectStore('pendingActions');
      const deleteRequest = store.delete(id);
      
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    };
  });
};

// Cache cleanup on storage quota exceeded
self.addEventListener('quotaexceeded', (event) => {
  console.log('Storage quota exceeded, cleaning up old caches...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE) {
              return caches.delete(cacheName);
            }
          })
        );
      })
  );
});
